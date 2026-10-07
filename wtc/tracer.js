import * as THREE from 'three/webgpu';
import {prepareLightGrid} from './lighting.js';
import {createCloudVolume,celestialState} from './sky-fields.js';
import {hdrShoulder,registerDisplayP3,P3} from './hdr-output.js';
import {writeDisplayPixel} from './display-color.js';
import {getPhotoOptics} from './photo-settings.js?v=20261007-details-2';
import {getPhotoColorTransform,getPhotoGrainGrid,photoGrainStrength,applyPhotoColor} from './photo-color.js?v=20261007-details-2';
import {
  Fn, If, Loop, Break, Continue, uniform, texture, texture3D, textureLoad, uv, array,
  float, int, uint, vec2, vec3, vec4, ivec2, normalize, dot, cross,
  abs, min, max, clamp, mix, smoothstep, pow, sin, cos, sqrt, exp,
  floor, fract, sign, reflect, refract, atan, asin, select, length,
} from 'three/tsl';

const PI=Math.PI;
const linear = c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4;

function dataTexture(values, width=2048) {
  const height=Math.max(1,Math.ceil(values.length/(width*4)));
  const padded=new Float32Array(width*height*4);padded.set(values);
  const t=new THREE.DataTexture(padded,width,height,THREE.RGBAFormat,THREE.FloatType);
  t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;
  return t;
}

export async function createTracer(canvas,data) {
  registerDisplayP3();
  const renderer=new THREE.WebGPURenderer({canvas,antialias:false,alpha:false,depth:false,stencil:false,powerPreference:'high-performance'});
  // r186's built-in GL fallback omits these context hints. Keep the same
  // renderer/TSL pipeline, but request the low-latency context used by the
  // reference raytracing page if WebGPU initialization falls back.
  renderer._getFallback=()=>new THREE.WebGLBackend({context:canvas.getContext('webgl2',{
    antialias:false,alpha:true,depth:false,stencil:false,
    powerPreference:'high-performance',desynchronized:true,
  })});
  renderer.setPixelRatio(1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  await renderer.init();
  const backend=renderer.backend.isWebGPUBackend?'WebGPU':'WebGL 2';
  const ground=data.metadata?.ground;
  const groundIndex=ground?data.primitiveCount:-1;
  const primitiveValues=ground?new Float32Array(data.primitiveData.length+16):data.primitiveData;
  if(ground){primitiveValues.set(data.primitiveData);primitiveValues.set([0,ground.elevation,0,ground.material ?? 13,1,.001,1,0,0,0,0,1,128,0,0,-1],data.primitiveData.length);}
  const compactNodes=!!data.compactNodeData;
  const compactPrimitives=!!data.compactPrimitiveData;
  const packedMembers=compactPrimitives?new Float32Array(data.compactPrimitiveData.length+(ground?8:0)):primitiveValues;
  const packedGeometry=compactPrimitives?new Float32Array(data.geometryData.length+(ground?8:0)):new Float32Array(8);
  if(compactPrimitives){
    packedMembers.set(data.compactPrimitiveData);packedGeometry.set(data.geometryData);
    for(let i=0;i<data.primitiveCount;i++){const base=i*8,transparent=(data.materials[Math.round(packedMembers[base+3])]?.transmission || 0)>.5?1:0;packedMembers[base+7]=Math.floor(packedMembers[base+7]/2)*2+transparent;}
    if(ground){packedMembers.set([0,ground.elevation,0,ground.material ?? 13,128,0,0,data.geometryData.length/4],data.compactPrimitiveData.length);packedGeometry.set([1,.001,1,0,0,0,0,1],data.geometryData.length);}
  }
  const primitives=dataTexture(packedMembers),geometry=dataTexture(packedGeometry),nodes=dataTexture(data.compactNodeData || data.nodeData);
  const shapes=dataTexture(data.shapeData || new Float32Array(4));
  // The CPU retains original member IDs for picking. On the GPU the unused
  // ID slot carries a transmission flag, eliminating a material fetch for
  // each shadow candidate without changing the glass-shadow convention.
  if(!compactPrimitives)for(let i=0;i<primitiveValues.length/16;i++) {
    const transparent=(data.materials[Math.round(primitiveValues[i*16+3])]?.transmission || 0)>.5?1:0;
    primitives.image.data[i*16+15]=((data.shapeOffsets?.[i] ?? -1)+1)*2+transparent;
  }
  const textureTypes={asphalt:1,paving:2,stone:3,concrete:4,aluminum:5,soil:6,roof:7,wood:8};
  const materialValues=new Float32Array(data.materials.length*16);
  data.materials.forEach((m,i)=>{
    const pattern=m.texture || {},type=textureTypes[pattern.type] || 0;
    materialValues.set([...(m.color || [.5,.5,.5]).map(linear),m.roughness ?? .6,m.metalness || 0,m.transmission || 0,m.ior || 1.5,type,...(m.emission || [0,0,0]),m.nightOnly===false?0:1,pattern.scale || 1,pattern.variation ?? .08,0,0],i*16);
  });
  const materials=dataTexture(materialValues,64);
  const cloudVolume=new THREE.Data3DTexture(createCloudVolume(),64,64,64);
  cloudVolume.format=THREE.RedFormat;cloudVolume.type=THREE.UnsignedByteType;
  cloudVolume.wrapS=cloudVolume.wrapT=cloudVolume.wrapR=THREE.RepeatWrapping;cloudVolume.minFilter=cloudVolume.magFilter=THREE.LinearFilter;cloudVolume.generateMipmaps=false;cloudVolume.needsUpdate=true;
  const cloudTarget=new THREE.RenderTarget(2048,1024,{type:THREE.HalfFloatType,depthBuffer:false,stencilBuffer:false});
  cloudTarget.texture.wrapS=THREE.RepeatWrapping;
  const u={
    camera:uniform(new THREE.Vector3()),forward:uniform(new THREE.Vector3(0,0,-1)),right:uniform(new THREE.Vector3(1,0,0)),up:uniform(new THREE.Vector3(0,1,0)),
    aspect:uniform(1),fov:uniform(Math.tan(45*PI/360)),resolution:uniform(new THREE.Vector2(1,1)),frame:uniform(0),history:uniform(0),
    tileSize:uniform(new THREE.Vector2(1,1)),tileOrigin:uniform(new THREE.Vector2()),photoShift:uniform(new THREE.Vector2()),
    photoAperture:uniform(0),photoFocus:uniform(60),photoInfinity:uniform(0),photoEnabled:uniform(0),
    photoBalance:uniform(new THREE.Vector3(1,1,1)),photoTone:uniform(new THREE.Vector3(1,1,0)),photoGrainGrid:uniform(new THREE.Vector2(1,1)),
    sun:uniform(new THREE.Vector3(0,.75,-.65)),sunColor:uniform(new THREE.Vector3(1,.98,.92)),sunPower:uniform(8),moonPower:uniform(0),night:uniform(0),phase:uniform(0),twilight:uniform(0),
    bounces:uniform(6,'int'),shadowSamples:uniform(2,'int'),visits:uniform(data.nodeCount,'int'),far:uniform(3000),layers:uniform(4095,'uint'),towers:uniform(63,'uint'),
    cutMode:uniform(0,'int'),cutHeight:uniform(220),cutSide:uniform(0),centerZ:uniform(new THREE.Vector2(...[1,2].map(id=>data.towers?.find(t=>t.id===id)?.center[2] || 0))),band:uniform(new THREE.Vector2(-10000,10000)),singleFloor:uniform(0,'int'),
    fog:uniform(1),cloud:uniform(1),exposure:uniform(1),hdr:uniform(0),selected:uniform(-1,'int'),
    northCenter:uniform(new THREE.Vector3(...(data.spaces?.[1]?.center || data.towers?.[0]?.center || [0,0,0]))),southCenter:uniform(new THREE.Vector3(...(data.spaces?.[2]?.center || data.towers?.[1]?.center || [0,0,0]))),
    northQ:uniform(new THREE.Vector4(...(data.spaces?.[1]?.rotation || [0,0,0,1]))),southQ:uniform(new THREE.Vector4(...(data.spaces?.[2]?.rotation || [0,0,0,1]))),
  };
  const fetchP=Fn(([index,row])=>textureLoad(primitives,ivec2(index.mul(compactPrimitives?2:4).add(row).mod(2048),index.mul(compactPrimitives?2:4).add(row).div(2048))),{return:'vec4',index:'int',row:'int'});
  const fetchInfo=Fn(([index])=>fetchP(index,int(compactPrimitives?1:3)),{return:'vec4',index:'int'});
  const fetchGeometry=Fn(([index,row,info])=>{
    if(!compactPrimitives)return fetchP(index,row.add(1));
    const offset=int(info.w).div(2).mul(2).add(row);
    return textureLoad(geometry,ivec2(offset.mod(2048),offset.div(2048)));
  },{return:'vec4',index:'int',row:'int',info:'vec4'});
  const fetchN=Fn(([index,row])=>textureLoad(nodes,ivec2(index.mul(compactNodes?2:3).add(row).mod(2048),index.mul(compactNodes?2:3).add(row).div(2048))),{return:'vec4',index:'int',row:'int'});
  const fetchM=Fn(([index,row])=>textureLoad(materials,ivec2(index.mul(4).add(row).mod(64),index.mul(4).add(row).div(64))),{return:'vec4',index:'int',row:'int'});
  const fetchShape=Fn(([index])=>textureLoad(shapes,ivec2(index.mod(2048),index.div(2048))),{return:'vec4',index:'int'});
  const rotateQ=Fn(([v,q])=>v.add(cross(q.xyz,cross(q.xyz,v).add(v.mul(q.w))).mul(2)));
  const inverseQ=Fn(([v,q])=>rotateQ(v,vec4(q.xyz.negate(),q.w)));
  const hash=Fn(([v])=>fract(sin(dot(v,vec3(12.9898,78.233,37.719))).mul(43758.5453)));
  const randomPair=Fn(([seed])=>vec2(hash(seed),hash(seed.add(vec3(31.23,71.43,17.19)))));
  // World-space materials use a conservative pixel footprint. Subpixel
  // grain fades before it can turn into sparkling or distant moire stripes.
  const surface=Fn(([p,n,m0,m1,mid])=>{
    const result=m0.toVar();
    If(m1.w.greaterThan(0),()=>{
      const parameters=fetchM(mid,int(3)),scale=max(parameters.x,float(.01)),variation=parameters.y;
      const footprint=max(float(.0002),length(p.sub(u.camera)).mul(u.fov).mul(2).div(u.resolution.y));
      const aligned=vec3(p.x.mul(.874619707).add(p.z.mul(.48480962)),p.y,p.x.mul(.48480962).sub(p.z.mul(.874619707)));
      const point=aligned.div(scale),coarse=sin(point.x.mul(2.31).add(sin(point.z.mul(1.7)))).mul(sin(point.z.mul(3.17).add(point.y.mul(1.3))));
      const noise=float(0).toVar(),roughnessNoise=float(0).toVar();
      If(m1.w.equal(1),()=>{
        // Asphalt gets restrained broad and medium-scale aggregate variation;
        // only its fine grain uses the old pixel-footprint fade.
        const macro=sin(point.x.mul(.17).add(sin(point.z.mul(.11).add(point.x.mul(.035))).mul(.8)))
          .mul(sin(point.z.mul(.14).add(point.x.mul(.06))));
        const medium=sin(point.x.mul(.83).add(sin(point.z.mul(.57)).mul(.65)))
          .mul(sin(point.z.mul(.72).add(point.x.mul(.21))));
        const fine=sin(point.x.mul(71.1).add(point.y.mul(37.4))).mul(sin(point.z.mul(53.7).add(point.y.mul(63.1))));
        const filtered=float(1).sub(smoothstep(scale.mul(.004),scale.mul(.035),footprint));
        noise.assign(macro.mul(.32).add(medium.mul(.31)).add(coarse.mul(.22)).add(fine.mul(filtered).mul(.15)));
        roughnessNoise.assign(macro.mul(.25).add(medium.mul(.36)).add(coarse.mul(.2)).add(fine.mul(filtered).mul(.08)));
      }).ElseIf(m1.w.equal(2),()=>{
        // Photo-referenced plaza paving: muted tile-to-tile changes and narrow,
        // filtered joints replace the former high-contrast checker-like grid.
        const cell=floor(point.xz),f=fract(point.xz),edge=min(min(f.x,float(1).sub(f.x)),min(f.y,float(1).sub(f.y)));
        const seamWidth=max(float(.006),footprint.div(scale).mul(.5));
        const seam=float(1).sub(smoothstep(.003,seamWidth,edge)).mul(float(1).sub(smoothstep(scale.mul(.35),scale.mul(.9),footprint)));
        const tile=hash(vec3(cell.x,0,cell.y)).sub(.5);
        const tileFade=float(1).sub(smoothstep(scale.mul(.3),scale.mul(.85),footprint));
        const macro=sin(point.x.mul(.13).add(sin(point.z.mul(.085).add(point.x.mul(.027))).mul(.72)))
          .mul(sin(point.z.mul(.11).add(point.x.mul(.045))));
        const medium=sin(point.x.mul(.79).add(sin(point.z.mul(.53)).mul(.6)))
          .mul(sin(point.z.mul(.68).add(point.x.mul(.19))));
        const mediumFade=float(1).sub(smoothstep(scale.mul(.07),scale.mul(.24),footprint));
        noise.assign(macro.mul(.42).add(medium.mul(mediumFade).mul(.31)).add(coarse.mul(.12)).add(tile.mul(tileFade).mul(.15)));
        roughnessNoise.assign(macro.mul(.34).add(medium.mul(mediumFade).mul(.3)).add(tile.mul(tileFade).mul(.12)).add(seam.mul(.2)));
        result.rgb.mulAssign(float(1).sub(seam.mul(.045)));
      }).ElseIf(m1.w.equal(3),()=>{
        // Stone carries soft mottling plus filtered mineral veining, without
        // evaluating the unrelated 50-70 cycle generic fine pattern.
        const macro=sin(point.x.mul(.16).add(sin(point.z.mul(.10).add(point.x.mul(.03))).mul(.76)))
          .mul(sin(point.z.mul(.13).add(point.x.mul(.05))));
        const medium=sin(point.x.mul(.72).add(sin(point.z.mul(.49)).mul(.55)))
          .mul(sin(point.z.mul(.64).add(point.x.mul(.18))));
        const veins=sin(point.x.mul(5).add(point.z.mul(3)).add(sin(point.y.mul(2)).mul(1.7))).mul(sin(point.z.mul(1.8).add(point.x)));
        const detailFade=float(1).sub(smoothstep(scale.mul(.015),scale.mul(.075),footprint));
        noise.assign(macro.mul(.33).add(medium.mul(detailFade).mul(.2)).add(veins.mul(detailFade).mul(.3)).add(coarse.mul(.17)));
        roughnessNoise.assign(macro.mul(.3).add(medium.mul(detailFade).mul(.28)).add(veins.mul(detailFade).mul(.12)));
      }).ElseIf(m1.w.equal(5),()=>{
        // Preserve the original aluminum grain and roughness equations exactly.
        const grain=sin(point.x.mul(510).add(point.z.mul(431))).mul(.45).add(sin(point.y.mul(1.6)).mul(.15));
        const filtered=float(1).sub(smoothstep(.001,.008,footprint));
        noise.assign(grain.mul(filtered).add(coarse.mul(.13)));
        roughnessNoise.assign(noise);
      }).Else(()=>{
        // Keep the existing coarse/fine equation for concrete, soil, roof, wood,
        // and unlabelled texture types; fine is built only for this branch.
        const fine=sin(point.x.mul(71.1).add(point.y.mul(37.4))).mul(sin(point.z.mul(53.7).add(point.y.mul(63.1))));
        const filtered=float(1).sub(smoothstep(scale.mul(.004),scale.mul(.035),footprint));
        noise.assign(coarse.mul(.55).add(fine.mul(filtered).mul(.45)));
        roughnessNoise.assign(noise);
      });
      result.rgb.mulAssign(float(1).add(noise.mul(variation)));
      result.w.assign(clamp(result.w.add(roughnessNoise.mul(variation).mul(.35)),.045,.98));
    });
    return result;
  },{return:'vec4',p:'vec3',n:'vec3',m0:'vec4',m1:'vec4',mid:'int'});
  const slab=Fn(([ro,inv,lo,hi])=>{
    const a=lo.sub(ro).mul(inv),b=hi.sub(ro).mul(inv);
    const small=min(a,b),large=max(a,b);
    return vec2(max(max(small.x,small.y),small.z),min(min(large.x,large.y),large.z));
  });
  const safeInv=Fn(([rd])=>sign(rd.add(vec3(.000000001))).div(max(abs(rd),vec3(.000000001))));
  const prismInterval=Fn(([range,ro,rd,encoded])=>{
    const result=range.toVar(),offset=int(encoded).div(2).sub(1).toVar();
    If(offset.greaterThanEqual(0),()=>{
      const count=int(fetchShape(offset).x).toVar();
      Loop({start:0,end:8,type:'int',name:'planeIndex'},({planeIndex})=>{
        If(planeIndex.greaterThanEqual(count),()=>Break());
        const plane=fetchShape(offset.add(planeIndex).add(1)).toVar(),denominator=dot(plane.xyz,rd).toVar(),remaining=plane.w.sub(dot(plane.xyz,ro)).toVar();
        If(abs(denominator).lessThan(.0000001),()=>{
          If(remaining.lessThan(-.000001),()=>{result.assign(vec2(1,-1));});
        }).Else(()=>{
          const edge=remaining.div(denominator);
          If(denominator.lessThan(0),()=>{result.x.assign(max(result.x,edge));}).Else(()=>{result.y.assign(min(result.y,edge));});
        });
        If(result.y.lessThan(result.x),()=>Break());
      });
    });
    return result;
  },{return:'vec2',range:'vec2',ro:'vec3',rd:'vec3',encoded:'float'});
  const clipInterval=Fn(([range,ro,rd,tower])=>{
    const result=range.toVar();
    If(tower.greaterThan(0).and(tower.lessThan(2.5)),()=>{
      If(u.singleFloor.greaterThan(0),()=>{
        If(abs(rd.y).lessThan(.0000001),()=>{
          If(ro.y.lessThan(u.band.x).or(ro.y.greaterThan(u.band.y)),()=>{result.assign(vec2(1,-1));});
        }).Else(()=>{
          const span=vec2(u.band.x.sub(ro.y),u.band.y.sub(ro.y)).div(rd.y);
          result.x.assign(max(result.x,min(span.x,span.y)));result.y.assign(min(result.y,max(span.x,span.y)));
        });
      });
      If(u.cutMode.equal(1),()=>{
        If(abs(rd.y).lessThan(.0000001),()=>{
          If(select(u.cutSide.lessThan(.5),ro.y.greaterThan(u.cutHeight),ro.y.lessThan(u.cutHeight)),()=>{result.assign(vec2(1,-1));});
        }).Else(()=>{
          const edge=u.cutHeight.sub(ro.y).div(rd.y);
          If(rd.y.greaterThan(0).equal(u.cutSide.lessThan(.5)),()=>{result.y.assign(min(result.y,edge));}).Else(()=>{result.x.assign(max(result.x,edge));});
        });
      });
      If(u.cutMode.equal(2),()=>{
        const plane=select(tower.lessThan(1.5),u.centerZ.x,u.centerZ.y);
        If(abs(rd.z).lessThan(.0000001),()=>{
          If(select(u.cutSide.lessThan(.5),ro.z.greaterThan(plane),ro.z.lessThan(plane)),()=>{result.assign(vec2(1,-1));});
        }).Else(()=>{
          const edge=plane.sub(ro.z).div(rd.z);
          If(rd.z.greaterThan(0).equal(u.cutSide.lessThan(.5)),()=>{result.y.assign(min(result.y,edge));}).Else(()=>{result.x.assign(max(result.x,edge));});
        });
      });
    });
    return result;
  });
  // Closest-first traversal uses the existing SAH geometry and shading path.
  // A 64-entry stack is checked against actual BVH depth during packing.
  const nodeNear=Fn(([index,ro,inv,northRo,northInv,southRo,southInv,northClip,southClip,closest,shadow])=>{
    const a=fetchN(index,int(0)).toVar(),b=fetchN(index,int(1)).toVar(),flags=uint(a.w).toVar();
    const space=float(flags.shiftRight(uint(19)).bitAnd(uint(3)));
    const origin=select(space.lessThan(.5),ro,select(space.lessThan(1.5),northRo,southRo));
    const inverse=select(space.lessThan(.5),inv,select(space.lessThan(1.5),northInv,southInv));
    const clip=select(space.lessThan(.5),vec2(-1e20,1e20),select(space.lessThan(1.5),northClip,southClip));
    const raw=slab(origin,inverse,a.xyz,b.xyz).toVar(),span=vec2(max(raw.x,clip.x),min(raw.y,clip.y)).toVar();
    const hidden=flags.bitAnd(uint(4095)).bitAnd(u.layers).equal(uint(0)).or(flags.shiftRight(uint(12)).bitAnd(uint(127)).bitAnd(u.towers.bitOr(uint(64))).equal(uint(0)));
    const noShadow=data.shadowNodeFlags?shadow.greaterThan(0).and(flags.bitAnd(uint(1<<21)).equal(uint(0))):false;
    return select(span.y.lessThan(max(span.x,float(.005))).or(span.x.greaterThan(closest)).or(hidden).or(noShadow),float(1e20),max(span.x,float(0)));
  }).setLayout({name:'wtcNodeNear',type:'float',inputs:[{name:'index',type:'int'},...['ro','inv','northRo','northInv','southRo','southInv'].map(name=>({name,type:'vec3'})),...['northClip','southClip'].map(name=>({name,type:'vec2'})),{name:'closest',type:'float'},{name:'shadow',type:'int'}]});
  const traceScene=Fn(([ro,rd,distance,shadow])=>{
    const closest=distance.toVar(),winner=int(-1).toVar(),node=int(0).toVar(),inv=safeInv(rd).toVar();
    const pending=data.orderedTraversal?array('int',64).toVar():null,top=int(0).toVar();
    const advance=()=>{
      If(top.greaterThan(0),()=>{top.subAssign(1);node.assign(pending.element(top));}).Else(()=>{node.assign(data.nodeCount);});
    };
    const northRo=inverseQ(ro.sub(u.northCenter),u.northQ).toVar(),northInv=safeInv(inverseQ(rd,u.northQ)).toVar();
    const southRo=inverseQ(ro.sub(u.southCenter),u.southQ).toVar(),southInv=safeInv(inverseQ(rd,u.southQ)).toVar();
    // Each clipping plane intersects a ray once, independent of which BVH
    // node/member is visited. Reuse those intervals throughout this ray.
    const unclipped=vec2(-1e20,1e20);
    const northClip=clipInterval(unclipped,ro,rd,float(1)).toVar(),southClip=clipInterval(unclipped,ro,rd,float(2)).toVar();
    if(ground) {
      // An analytic plane has no giant AABB and no finite slab edge/horizon.
      // Atrium/concourse footprints remain open below plaza level.
      If(u.layers.bitAnd(uint(128)).notEqual(uint(0)).and(abs(rd.y).greaterThan(.0000001)),()=>{
        const t=float(ground.elevation).sub(ro.y).div(rd.y).toVar(),point=ro.add(rd.mul(t)).toVar();
        const a=inverseQ(point.sub(u.northCenter),u.northQ).toVar(),b=inverseQ(point.sub(u.southCenter),u.southQ).toVar();
        const half=ground.footprintHalf ?? 31.5722,chamfer=ground.chamfer ?? 2.1082;
        const insideA=abs(a.x).lessThan(half+.025).and(abs(a.z).lessThan(half+.025)).and(abs(a.x).add(abs(a.z)).lessThan(2*half-chamfer+.025)).and(u.towers.bitAnd(uint(1)).notEqual(uint(0)));
        const insideB=abs(b.x).lessThan(half+.025).and(abs(b.z).lessThan(half+.025)).and(abs(b.x).add(abs(b.z)).lessThan(2*half-chamfer+.025)).and(u.towers.bitAnd(uint(2)).notEqual(uint(0)));
        If(t.greaterThan(.005).and(t.lessThan(closest)).and(insideA.or(insideB).not()),()=>{closest.assign(t);winner.assign(groundIndex);});
      });
    }
    Loop({start:0,end:u.visits,type:'int',name:'visit'},()=>{
      If(node.greaterThanEqual(data.nodeCount),()=>Break());
      const a=fetchN(node,int(0)).toVar(),b=fetchN(node,int(1)).toVar();
      const flags=uint(a.w).toVar(),meta=compactNodes?null:fetchN(node,int(2)).toVar();
      const space=compactNodes?float(flags.shiftRight(uint(19)).bitAnd(uint(3))):data.spaces?meta.z:float(0);
      const escape=compactNodes?select(b.w.lessThan(0),node.add(1),int(b.w)):int(b.w);
      const encoded=compactNodes?b.w.negate().sub(1):a.w;
      const nodeRo=select(space.lessThan(.5),ro,select(space.lessThan(1.5),northRo,southRo));
      const nodeInv=select(space.lessThan(.5),inv,select(space.lessThan(1.5),northInv,southInv));
      const rawSpan=slab(nodeRo,nodeInv,a.xyz,b.xyz).toVar(),nodeClip=select(space.lessThan(.5),unclipped,select(space.lessThan(1.5),northClip,southClip));
      const span=vec2(max(rawSpan.x,nodeClip.x),min(rawSpan.y,nodeClip.y)).toVar();
      const outside=span.y.lessThan(max(span.x,float(.005))).or(span.x.greaterThan(closest));
      const nodeLayers=compactNodes?flags.bitAnd(uint(4095)):uint(meta.x),nodeTowers=compactNodes?flags.shiftRight(uint(12)).bitAnd(uint(127)):uint(meta.y);
      const hidden=nodeLayers.bitAnd(u.layers).equal(uint(0)).or(nodeTowers.bitAnd(u.towers.bitOr(uint(64))).equal(uint(0)));
      const transparentShadow=compactNodes&&data.shadowNodeFlags?shadow.greaterThan(0).and(flags.bitAnd(uint(1<<21)).equal(uint(0))):false;
      If(outside.or(hidden).or(transparentShadow),()=>{if(data.orderedTraversal)advance();else node.assign(escape);Continue();});
      If(compactNodes?b.w.greaterThanEqual(0):a.w.lessThan(0),()=>{
        if(data.orderedTraversal) {
          const left=node.add(1).toVar(),leftLink=fetchN(left,int(1)).w.toVar(),right=select(leftLink.lessThan(0),left.add(1),int(leftLink)).toVar();
          if(data.splitAxisTraversal) {
            const axis=flags.shiftRight(uint(22)).bitAnd(uint(3)),direction=select(axis.equal(uint(0)),nodeInv.x,select(axis.equal(uint(1)),nodeInv.y,nodeInv.z));
            const first=select(direction.greaterThanEqual(0),left,right),second=select(direction.greaterThanEqual(0),right,left);
            pending.element(top).assign(second);top.addAssign(1);node.assign(first);
          }else {
          const aNear=nodeNear(left,ro,inv,northRo,northInv,southRo,southInv,northClip,southClip,closest,shadow).toVar();
          const bNear=nodeNear(right,ro,inv,northRo,northInv,southRo,southInv,northClip,southClip,closest,shadow).toVar();
          If(aNear.lessThan(1e19).and(bNear.lessThan(1e19)),()=>{
            const first=select(aNear.lessThanEqual(bNear),left,right),second=select(aNear.lessThanEqual(bNear),right,left);
            pending.element(top).assign(second);top.addAssign(1);node.assign(first);
          }).ElseIf(aNear.lessThan(1e19),()=>{node.assign(left);}).ElseIf(bNear.lessThan(1e19),()=>{node.assign(right);}).Else(()=>advance());
          }
        }else node.addAssign(1);
        Continue();
      });
      const start=int(encoded).div(8).toVar(),length=int(encoded).mod(8).toVar();
      Loop({start:0,end:4,type:'int',name:'leaf'},({leaf})=>{
        If(leaf.greaterThanEqual(length),()=>Break());
        const id=start.add(leaf).toVar(),info=fetchInfo(id).toVar();
        If(uint(info.x).bitAnd(u.layers).equal(uint(0)),()=>Continue());
        If(info.y.greaterThan(0).and(u.towers.bitAnd(uint(1).shiftLeft(uint(info.y).sub(uint(1)))).equal(uint(0))),()=>Continue());
        If(shadow.greaterThan(0).and(uint(info.w).bitAnd(uint(1)).notEqual(uint(0))),()=>Continue());
        const p=fetchP(id,int(0)).toVar(),h=fetchGeometry(id,int(0),info).toVar(),q=fetchGeometry(id,int(1),info).toVar();
        const local=inverseQ(ro.sub(p.xyz),q).toVar(),direction=inverseQ(rd,q).toVar();
        const boxHit=slab(local,safeInv(direction),h.xyz.negate(),h.xyz).toVar(),memberClip=select(info.y.lessThan(.5).or(info.y.greaterThan(2.5)),unclipped,select(info.y.lessThan(1.5),northClip,southClip));
        // Reject missed/clipped bounding boxes before fetching convex planes.
        // Keep the surviving prism calculation in its original order.
        const bounded=vec2(max(boxHit.x,memberClip.x),min(boxHit.y,memberClip.y)).toVar();
        If(bounded.y.lessThan(max(bounded.x,float(.005))).or(bounded.x.greaterThan(closest)),()=>Continue());
        const rawHit=prismInterval(boxHit,local,direction,compactPrimitives?h.w:info.w).toVar();
        const hit=vec2(max(rawHit.x,memberClip.x),min(rawHit.y,memberClip.y)).toVar();
        const t=select(hit.x.greaterThan(.005),hit.x,hit.y).toVar();
        If(hit.y.greaterThanEqual(hit.x).and(t.greaterThan(.005)).and(t.lessThan(closest)),()=>{
          closest.assign(t);winner.assign(id);
          If(shadow.greaterThan(0),()=>Break());
        });
      });
      If(shadow.greaterThan(0).and(winner.greaterThanEqual(0)),()=>Break());
      if(data.orderedTraversal)advance();else node.assign(escape);
    });
    return vec2(closest,float(winner));
  }).setLayout({name:'wtcTraceScene',type:'vec2',inputs:[{name:'ro',type:'vec3'},{name:'rd',type:'vec3'},{name:'distance',type:'float'},{name:'shadow',type:'int'}]});
  const surfaceNormal=Fn(([p,id])=>{
    const info=fetchInfo(id).toVar(),center=fetchP(id,int(0)),half=fetchGeometry(id,int(0),info),q=fetchGeometry(id,int(1),info);
    const local=inverseQ(p.sub(center.xyz),q).toVar(),d=abs(abs(local).sub(half.xyz)).toVar();
    const n=vec3(0,0,sign(local.z)).toVar();
    If(d.x.lessThanEqual(d.y).and(d.x.lessThanEqual(d.z)),()=>{n.assign(vec3(sign(local.x),0,0));})
      .ElseIf(d.y.lessThanEqual(d.z),()=>{n.assign(vec3(0,sign(local.y),0));});
    const offset=int(compactPrimitives?half.w:info.w).div(2).sub(1).toVar();
    If(offset.greaterThanEqual(0),()=>{
      const count=int(fetchShape(offset).x).toVar(),nearest=float(1e20).toVar();
      Loop({start:0,end:8,type:'int',name:'normalPlane'},({normalPlane})=>{
        If(normalPlane.greaterThanEqual(count),()=>Break());
        const plane=fetchShape(offset.add(normalPlane).add(1)).toVar(),distance=abs(dot(plane.xyz,local).sub(plane.w)).div(max(length(plane.xyz),float(.0000001))).toVar();
        If(distance.lessThan(nearest),()=>{nearest.assign(distance);n.assign(normalize(plane.xyz));});
      });
    });
    const result=rotateQ(n,q).toVar();
    if(ground)If(id.equal(groundIndex),()=>{result.assign(vec3(0,1,0));});
    If(info.y.greaterThan(0).and(info.y.lessThan(2.5)),()=>{
      If(u.cutMode.equal(1).and(abs(p.y.sub(u.cutHeight)).lessThan(.015)),()=>{result.assign(vec3(0,select(u.cutSide.lessThan(.5),1,-1),0));});
      const plane=select(info.y.lessThan(1.5),u.centerZ.x,u.centerZ.y);
      If(u.cutMode.equal(2).and(abs(p.z.sub(plane)).lessThan(.015)),()=>{result.assign(vec3(0,0,select(u.cutSide.lessThan(.5),1,-1)));});
      If(u.singleFloor.greaterThan(0),()=>{
        If(abs(p.y.sub(u.band.x)).lessThan(.015),()=>{result.assign(vec3(0,-1,0));});
        If(abs(p.y.sub(u.band.y)).lessThan(.015),()=>{result.assign(vec3(0,1,0));});
      });
    });
    return result;
  });
  const hemisphere=Fn(([n,r])=>{
    const axis=select(abs(n.y).lessThan(.9),vec3(0,1,0),vec3(1,0,0));
    const tangent=normalize(cross(axis,n)),bitangent=cross(n,tangent);
    const radius=sqrt(r.x),angle=r.y.mul(2*PI);
    return normalize(tangent.mul(radius.mul(cos(angle))).add(bitangent.mul(radius.mul(sin(angle)))).add(n.mul(sqrt(float(1).sub(r.x)))));
  });
  const cloudDensity=Fn(([point])=>{
    // Kilometres keep the spherical layer's intersection numerically stable.
    const height=sqrt(dot(point,point)).sub(6372.2).div(2.2).toVar();
    const coord=vec3(point.x,point.y.sub(6371),point.z).mul(.12).add(vec3(sin(u.phase).mul(.018),0,cos(u.phase).mul(.012)));
    const density=texture3D(cloudVolume,coord).r;
    return max(density.sub(.465).sub(height.mul(height).mul(.15)),float(0)).mul(4.5)
      .mul(smoothstep(0,.12,height)).mul(float(1).sub(smoothstep(.72,1,height)));
  });
  const cloudMaterial=new THREE.NodeMaterial();cloudMaterial.depthTest=false;cloudMaterial.depthWrite=false;cloudMaterial.toneMapped=false;
  cloudMaterial.fragmentNode=Fn(()=>{
    const longitude=uv().x.sub(.5).mul(2*PI),latitude=float(.5).sub(uv().y).mul(PI);
    const rd=vec3(cos(latitude).mul(sin(longitude)),sin(latitude),cos(latitude).mul(cos(longitude))).toVar();
    const ro=vec3(u.camera.x.mul(.001),u.camera.y.mul(.001).add(6371),u.camera.z.mul(.001)).toVar();
    const color=vec3(0).toVar(),transmittance=float(1).toVar();
    If(rd.y.greaterThan(0).and(u.camera.y.lessThan(3400)),()=>{
      const along=dot(ro,rd).toVar(),radius=dot(ro,ro).toVar();
      const entry=max(along.negate().add(sqrt(max(along.mul(along).add(6372.2**2).sub(radius),float(0)))),float(0)).toVar();
      const exit=along.negate().add(sqrt(max(along.mul(along).add(6374.4**2).sub(radius),float(0)))).toVar();
      const step=exit.sub(entry).div(48).toVar();
      const lightDir=select(u.sun.y.greaterThan(0),u.sun,u.sun.negate()).toVar();
      const day=smoothstep(-.14,.10,u.sun.y).toVar(),sunlight=u.sunPower.div(9).toVar();
      const forward=pow(max(dot(rd,lightDir),float(0)),float(8)).toVar();
      Loop({start:0,end:48,type:'int',name:'cloudStep'},({cloudStep:i})=>{
        If(transmittance.lessThan(.008),()=>Break());
        const distance=entry.add(float(i).add(.5).mul(step)).toVar(),p=ro.add(rd.mul(distance)).toVar();
        const density=cloudDensity(p).toVar();
        If(density.greaterThan(.001),()=>{
          const optical=cloudDensity(p.add(lightDir.mul(.18))).mul(.18)
            .add(cloudDensity(p.add(lightDir.mul(.45))).mul(.27))
            .add(cloudDensity(p.add(lightDir.mul(.9))).mul(.45));
          const visibility=exp(optical.mul(-3.4)).toVar();
          const dusk=vec3(.28,.072,.018).mul(u.twilight).mul(pow(max(dot(rd,u.sun),float(0)),float(3)));
          const ambient=mix(vec3(.019,.028,.045),vec3(.23,.29,.38),day).add(dusk);
          const direct=mix(vec3(.035,.047,.075).mul(u.moonPower.div(.025)),u.sunColor.mul(sunlight).mul(.72),day).mul(visibility).mul(forward.mul(.45).add(.65));
          const fog=exp(distance.mul(-.013)).toVar();
          const illumination=mix(mix(vec3(.027,.034,.048),vec3(.52,.63,.77),day),ambient.add(direct),fog);
          const opacity=float(1).sub(exp(density.mul(step).mul(-2.8))).toVar();
          color.addAssign(illumination.mul(opacity).mul(transmittance));
          transmittance.mulAssign(float(1).sub(opacity));
        });
      });
    });
    return vec4(color,float(1).sub(transmittance));
  })();
  const cloudQuad=new THREE.QuadMesh(cloudMaterial);
  const sky=Fn(([rd,disc])=>{
    const height=max(rd.y,float(0)),horizon=pow(float(1).sub(height),float(4));
    const day=smoothstep(-.14,.10,u.sun.y).toVar();
    const azimuth=dot(rd.xz,u.sun.xz).div(max(sqrt(dot(rd.xz,rd.xz).mul(dot(u.sun.xz,u.sun.xz))),float(.00001)));
    const toward=pow(max(azimuth,float(0)),float(3)).toVar();
    const noon=vec3(.13,.31,.65),rim=vec3(.52,.63,.77);
    const nightSky=mix(vec3(.006,.012,.026),vec3(.028,.034,.049),horizon).toVar();
    const color=mix(nightSky,mix(noon,rim,horizon),day).toVar();
    const sunset=vec3(.68,.20,.065).mul(u.twilight).mul(horizon).mul(toward);
    color.addAssign(sunset);
    const clouds=float(0).toVar();
    If(u.cloud.greaterThan(0).and(rd.y.greaterThan(0)),()=>{
      const coord=vec2(atan(rd.x,rd.z).div(2*PI).add(.5),float(.5).sub(asin(clamp(rd.y,-1,1)).div(PI)));
      const field=texture(cloudTarget.texture,coord).toVar();
      clouds.assign(field.a.mul(smoothstep(0,.015,rd.y)));
      color.assign(color.mul(float(1).sub(clouds)).add(field.rgb.mul(smoothstep(0,.015,rd.y))));
    });
    const moon=pow(max(dot(rd,u.sun.negate()),float(0)),float(8000));
    color.addAssign(vec3(.22,.29,.42).mul(moon).mul(u.moonPower).mul(2));
    If(disc.greaterThan(0),()=>{
      const sunDisc=smoothstep(Math.cos(.0052),Math.cos(.0045),dot(rd,u.sun)).mul(smoothstep(-.01,.02,u.sun.y));
      color.addAssign(u.sunColor.mul(sunDisc).mul(60).mul(float(1).sub(clouds.mul(.9))));
      const moonDisc=smoothstep(Math.cos(.0053),Math.cos(.0047),dot(rd,u.sun.negate())).mul(smoothstep(-.01,.02,u.sun.y.negate()));
      color.addAssign(vec3(.85,.88,.94).mul(moonDisc).mul(.8).mul(float(1).sub(clouds)));
    });
    return max(color,vec3(0));
  }).setLayout({name:'wtcSky',type:'vec3',inputs:[{name:'rd',type:'vec3'},{name:'disc',type:'int'}]});
  const fresnel=Fn(([f0,cosine])=>f0.add(vec3(1).sub(f0).mul(pow(float(1).sub(clamp(cosine,0,1)),float(5)))));
  const brdf=Fn(([base,rough,metal,n,v,l])=>{
    const h=normalize(v.add(l)),nv=max(dot(n,v),float(.001)),nl=max(dot(n,l),float(0));
    const nh=max(dot(n,h),float(0)),vh=max(dot(v,h),float(0));
    const alpha=max(rough.mul(rough),float(.025)),a2=alpha.mul(alpha);
    const d=a2.div(float(PI).mul(pow(nh.mul(nh).mul(a2.sub(1)).add(1),float(2))));
    const k=pow(rough.add(1),float(2)).div(8),g=nv.div(nv.mul(float(1).sub(k)).add(k)).mul(nl.div(nl.mul(float(1).sub(k)).add(k)));
    const f=fresnel(mix(vec3(.04),base,metal),vh);
    return base.mul(float(1).sub(metal)).mul(vec3(1).sub(f)).div(PI).add(f.mul(d).mul(g).div(nv.mul(max(nl,float(.001))).mul(4)));
  });
  const direct=Fn(([p,n,v,base,rough,metal,seed])=>{
    const col=vec3(0).toVar();
    Loop({start:0,end:max(u.shadowSamples,int(1)),type:'int',name:'sh'},({sh})=>{
      const r=randomPair(seed.add(vec3(float(sh).mul(17.1),3.7,8.4)));
      const lamp=select(u.sun.y.greaterThan(0),u.sun,u.sun.negate()).toVar();
      const axis=normalize(cross(select(abs(lamp.y).lessThan(.9),vec3(0,1,0),vec3(1,0,0)),lamp));
      const angle=r.x.mul(2*PI),radius=sqrt(r.y).mul(select(u.shadowSamples.greaterThan(0),float(.00465),float(0)));
      const l=normalize(lamp.add(axis.mul(cos(angle).mul(radius))).add(cross(lamp,axis).mul(sin(angle).mul(radius))));
      const nl=max(dot(n,l),float(0));
      If(nl.greaterThan(0),()=>{
        const visible=float(1).toVar();
        // Zero soft samples still keeps one hard opaque-geometry shadow.
        const blocker=traceScene(p.add(n.mul(.015)),l,u.far,int(1));visible.assign(select(blocker.y.lessThan(0),float(1),float(0)));
        const illumination=select(u.sun.y.greaterThan(0),u.sunColor.mul(u.sunPower),vec3(.55,.66,.9).mul(u.moonPower));
        col.addAssign(brdf(base,rough,metal,n,v,l).mul(nl).mul(illumination).mul(visible));
      });
    });
    return col.div(float(max(u.shadowSamples,int(1))));
  }).setLayout({name:'wtcDirect',type:'vec3',inputs:[{name:'p',type:'vec3'},{name:'n',type:'vec3'},{name:'v',type:'vec3'},{name:'base',type:'vec3'},{name:'rough',type:'float'},{name:'metal',type:'float'},{name:'seed',type:'vec3'}]});

  const localLights=data.lightingData?.version===2?data.lightingData:prepareLightGrid(data);
  const lights=dataTexture(localLights.rows,1024),lightGrid=dataTexture(localLights.groupData,256),lightProbes=dataTexture(localLights.probes,256);
  const lightNightProbes=dataTexture(localLights.nightProbes,256),lightDirections=dataTexture(localLights.directions,256),lightFloors=dataTexture(localLights.floorLookup,2048),lightPolygons=dataTexture(localLights.polygons,256);
  const fetchLightGroup=Fn(([group,row])=>{const slot=group.mul(4).add(row);return textureLoad(lightGrid,ivec2(slot.mod(256),slot.div(256)));},{return:'vec4',group:'int',row:'int'});
  // Resolve the physical storey on the shaded side of a slab/wall. Member
  // floor labels alone cannot distinguish slab top from the room underneath,
  // and low buildings number storeys one above their elevation-array index.
  const roomDomain=Fn(([p,n,id])=>{
    const info=fetchInfo(id).toVar(),point=p.add(n.mul(select(uint(info.x).bitAnd(uint(1)).notEqual(uint(0)),float(1.25),float(.04)))).toVar();
    const underground=uint(info.x).bitAnd(uint(32)).notEqual(uint(0)),site=info.y.equal(0).and(underground.not());
    const result=vec4(-1,0,0,select(underground,float(1),float(0))).toVar();
    const roof=uint(info.x).bitAnd(uint(64)).notEqual(uint(0));
    If(roof.not(),()=>{
    const group=int(select(site,float(672),textureLoad(lightFloors,ivec2(int(clamp(floor(point.y.add(32).mul(4)),0,2047)),int(info.y))).x)).toVar();
    If(group.greaterThanEqual(0),()=>{
      const level=fetchLightGroup(group,int(1)).toVar();
      If(point.y.lessThan(level.x),()=>{group.assign(int(level.z));level.assign(fetchLightGroup(group,int(1)));}).ElseIf(point.y.greaterThanEqual(level.y),()=>{group.assign(int(level.w));level.assign(fetchLightGroup(group,int(1)));});
      const height=level,grid=fetchLightGroup(group,int(0)).toVar(),transform=fetchLightGroup(group,int(2)).toVar(),domain=fetchLightGroup(group,int(3)).toVar();
      const delta=point.xz.sub(transform.xy),local=vec2(transform.z.mul(delta.x).sub(transform.w.mul(delta.y)),transform.w.mul(delta.x).add(transform.z.mul(delta.y))).toVar();
      const contained=int(0).toVar();
      If(domain.y.equal(0),()=>{contained.assign(1);}).Else(()=>{
        Loop({start:0,end:int(domain.y),type:'int',name:'roomEdge'},({roomEdge})=>{
          const edgeIndex=int(domain.x).add(roomEdge),edge=textureLoad(lightPolygons,ivec2(edgeIndex.mod(256),edgeIndex.div(256))).toVar();
          const crosses=edge.y.greaterThan(local.y).notEqual(edge.w.greaterThan(local.y));
          const safeDz=select(abs(edge.w.sub(edge.y)).lessThan(.000001),float(.000001),edge.w.sub(edge.y));
          const edgeX=edge.z.sub(edge.x).mul(local.y.sub(edge.y)).div(safeDz).add(edge.x);
          If(crosses.and(local.x.lessThan(edgeX)),()=>{contained.assign(int(1).sub(contained));});
        });
      });
      const inHeight=point.y.greaterThanEqual(height.x).and(point.y.lessThan(height.y));
      const coordinate=local.sub(grid.xy).div(grid.zw);
      const inGrid=coordinate.x.greaterThanEqual(0).and(coordinate.y.greaterThanEqual(0)).and(coordinate.x.lessThanEqual(domain.z.sub(1))).and(coordinate.y.lessThanEqual(domain.z.sub(1)));
      If(contained.greaterThan(0).and(inHeight).and(roof.not()).and(inGrid),()=>{
        result.assign(vec4(float(group),coordinate,select(site,float(0),float(1))));
      });
    });
    });
    // A recessed arcade is outdoors underneath its cantilever. Its physical
    // occupied footprint excludes that strip, so external facade soffits may
    // receive environment fill. Closed rooms and underground slab backs do
    // not gain daylight merely because a section has been revealed.
    const exteriorArcade=info.y.greaterThan(3.5).and(info.y.lessThan(6.5))
      .and(uint(info.x).bitAnd(uint(1)).notEqual(uint(0)))
      .and(result.x.lessThan(0)).and(p.y.greaterThanEqual(0));
    // Street and city surfaces can sit below the concourse datum while still
    // being outdoors. Only building members use negative Y as an indoor hint.
    If(n.y.lessThan(-.5).and(exteriorArcade.not()).or(p.y.lessThan(-.05).and(site.not())),()=>{result.w.assign(1);});
    return result;
  });
  const interior=Fn(([n,base,metal,room])=>{
    const color=vec3(0).toVar();
    If(u.layers.bitAnd(uint(1024)).notEqual(uint(0)).and(room.x.greaterThanEqual(0)),()=>{
      const group=int(room.x),domain=fetchLightGroup(group,int(3)),cell=ivec2(min(floor(room.yz),vec2(domain.z.sub(2)))),blend=room.yz.sub(vec2(cell));
      const day=vec4(0).toVar(),night=vec4(0).toVar(),direction=vec4(0).toVar();
      Loop({start:0,end:4,type:'int',name:'lightCorner'},({lightCorner})=>{
        const x=lightCorner.mod(2),z=lightCorner.div(2),weight=select(x.equal(0),float(1).sub(blend.x),blend.x).mul(select(z.equal(0),float(1).sub(blend.y),blend.y));
        const slot=int(domain.w).add(cell.y.add(z).mul(int(domain.z))).add(cell.x).add(x),coordinate=ivec2(slot.mod(256),slot.div(256));
        day.addAssign(textureLoad(lightProbes,coordinate).mul(weight));night.addAssign(textureLoad(lightNightProbes,coordinate).mul(weight));direction.addAssign(textureLoad(lightDirections,coordinate).mul(weight));
      });
      const dayResponse=float(.24).add(max(dot(n,vec3(day.w,night.w,direction.x)),float(0)).mul(.76));
      const nightResponse=float(.24).add(max(dot(n,direction.yzw),float(0)).mul(.76));
      color.assign(base.mul(float(1).sub(metal)).mul(day.rgb.mul(dayResponse).add(night.rgb.mul(nightResponse).mul(u.night))));
    });
    return color;
  });
  const environment=Fn(([n,room])=>{
    const color=vec3(0).toVar();
    If(room.w.lessThan(.5),()=>{
      const daylight=smoothstep(-.12,.12,u.sun.y);
      const skyFill=mix(vec3(.018,.027,.045),vec3(.065,.09,.13),max(n.y,float(0)));
      const cityFill=vec3(.022,.016,.011).mul(float(1).sub(max(n.y,float(0))));
      color.assign(mix(skyFill.add(cityFill),sky(n,int(0)).mul(.32).add(vec3(.006)),daylight));
    });
    return color;
  });
  const secondary=Fn(([ro,rd,seed])=>{
    const hit=traceScene(ro,rd,u.far,int(0)).toVar(),color=vec3(0).toVar();
    If(hit.y.lessThan(0),()=>{color.assign(sky(rd,int(1)));}).Else(()=>{
      const id=int(hit.y),p=ro.add(rd.mul(hit.x)),mid=int(fetchP(id,int(0)).w),m0=fetchM(mid,int(0)).toVar(),m1=fetchM(mid,int(1)),m2=fetchM(mid,int(2));
      const normal=surfaceNormal(p,id),n=select(dot(normal,rd).lessThan(0),normal,normal.negate());
      m0.assign(surface(p,n,m0,m1,mid));
      color.assign(direct(p,n,rd.negate(),m0.rgb,m0.w,m1.x,seed));
      const room=roomDomain(p,n,id).toVar();
      color.addAssign(interior(n,m0.rgb,m1.x,room));
      color.addAssign(m0.rgb.mul(float(1).sub(m1.x)).mul(environment(n,room)).mul(.72));
      color.addAssign(m2.rgb.mul(select(m2.w.greaterThan(0),u.night,float(1))).mul(select(u.layers.bitAnd(uint(1024)).notEqual(uint(0)),1,0)));
    });
    return color;
  }).setLayout({name:'wtcSecondary',type:'vec3',inputs:[{name:'ro',type:'vec3'},{name:'rd',type:'vec3'},{name:'seed',type:'vec3'}]});
  const radiance=Fn(([origin,direction,seed])=>{
    const ro=origin.toVar(),rd=direction.toVar(),energy=vec3(1).toVar(),color=vec3(0).toVar();
    const firstDistance=u.far.toVar();
    Loop({start:0,end:u.bounces,type:'int',name:'bounce'},({bounce})=>{
      const hit=traceScene(ro,rd,u.far,int(0)).toVar();
      If(bounce.equal(0),()=>{firstDistance.assign(hit.x);});
      If(hit.y.lessThan(0),()=>{color.addAssign(energy.mul(sky(rd,int(1))));Break();});
      const id=int(hit.y).toVar(),p=ro.add(rd.mul(hit.x)).toVar(),mid=int(fetchP(id,int(0)).w).toVar();
      const m0=fetchM(mid,int(0)).toVar(),m1=fetchM(mid,int(1)).toVar(),m2=fetchM(mid,int(2)).toVar();
      const normal=surfaceNormal(p,id).toVar(),entering=dot(normal,rd).lessThan(0).toVar(),n=select(entering,normal,normal.negate()).toVar();
      m0.assign(surface(p,n,m0,m1,mid));
      const random=randomPair(seed.add(vec3(float(bounce).mul(17.43),float(bounce).mul(31.71),4.1))).toVar();
      color.addAssign(energy.mul(m2.rgb).mul(select(m2.w.greaterThan(0),u.night,float(1))).mul(select(u.layers.bitAnd(uint(1024)).notEqual(uint(0)),1,0)));
      If(m1.y.greaterThan(.5),()=>{
        const eta=select(entering,float(1).div(m1.z),m1.z).toVar();
        const f=pow(m1.z.sub(1).div(m1.z.add(1)),float(2)).toVar();
        const fr=f.add(float(1).sub(f).mul(pow(float(1).sub(max(dot(n,rd.negate()),float(0))),float(5)))).toVar();
        const transmitted=refract(rd,n,eta).toVar(),reflected=reflect(rd,n).toVar();
        color.addAssign(energy.mul(fr).mul(secondary(p.add(n.mul(.012)),reflected,seed.add(12))));
        If(dot(transmitted,transmitted).lessThan(.1),()=>{rd.assign(reflected);ro.assign(p.add(n.mul(.012)));})
          // Keep the next origin inside a sourced 6.35 mm pane so its exit
          // interface is traced too. The old 12 mm offset jumped through it.
          .Else(()=>{energy.mulAssign(float(1).sub(fr));energy.mulAssign(mix(vec3(1),m0.rgb,float(.45)));rd.assign(normalize(transmitted));ro.assign(p.sub(n.mul(.0004)));});
      }).Else(()=>{
        color.addAssign(energy.mul(direct(p,n,rd.negate(),m0.rgb,m0.w,m1.x,seed.add(float(bounce)))));
        const room=roomDomain(p,n,id).toVar();
        color.addAssign(energy.mul(interior(n,m0.rgb,m1.x,room)));
        If(u.selected.equal(id).and(bounce.equal(0)),()=>{color.addAssign(vec3(.8,.3,.01));});
        const ambient=environment(n,room).toVar();
        color.addAssign(energy.mul(m0.rgb).mul(float(1).sub(m1.x)).mul(ambient));
        energy.mulAssign(fresnel(mix(vec3(.04),m0.rgb,m1.x),max(dot(n,rd.negate()),float(0))));
        const reflection=normalize(mix(reflect(rd,n),hemisphere(n,random),m0.w.mul(m0.w).mul(.2)));
        rd.assign(reflection);ro.assign(p.add(n.mul(.012)));
        If(max(max(energy.x,energy.y),energy.z).lessThan(.015),()=>Break());
      });
      energy.assign(min(energy,vec3(6)));
    });
    const fogAmount=float(1).sub(exp(firstDistance.mul(-.00018))).mul(u.fog);
    color.assign(mix(color,sky(direction,int(0)),fogAmount.mul(.97)));
    return clamp(color,vec3(0),vec3(80));
  }).setLayout({name:'wtcRadiance',type:'vec3',inputs:[{name:'origin',type:'vec3'},{name:'direction',type:'vec3'},{name:'seed',type:'vec3'}]});

  // FP32 avoids rounding away later samples during a long stationary average.
  const filteredHistory=backend==='WebGPU'?renderer.hasFeature('float32-filterable'):!!renderer.backend.gl.getExtension('OES_texture_float_linear');
  const historyFilter=filteredHistory?THREE.LinearFilter:THREE.NearestFilter;
  const rtOptions={type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:false,stencilBuffer:false,minFilter:historyFilter,magFilter:historyFilter};
  const targets=[new THREE.RenderTarget(1,1,rtOptions),new THREE.RenderTarget(1,1,rtOptions)];
  const previous=texture(targets[0].texture),current=texture(targets[1].texture);
  const traceMaterial=new THREE.NodeMaterial();traceMaterial.depthTest=false;traceMaterial.depthWrite=false;traceMaterial.toneMapped=false;
  traceMaterial.fragmentNode=Fn(()=>{
    // Integer pixel centers keep random seeds identical across tile boundaries.
    const pixel=floor(uv().mul(u.tileSize)).add(u.tileOrigin).add(.5).toVar();
    const fullUV=pixel.div(u.resolution).toVar();
    const seed=vec3(pixel,u.frame).toVar(),jitter=randomPair(seed).sub(.5).div(u.resolution);
    // QuadMesh UV has its origin at the top-left.
    const xy=fullUV.add(jitter).mul(2).sub(1).toVar();
    const direction=normalize(u.forward.add(u.right.mul(xy.x.mul(u.aspect).mul(u.fov).add(u.photoShift.x))).add(u.up.mul(xy.y.negate().mul(u.fov).add(u.photoShift.y)))).toVar();
    const origin=u.camera.toVar();
    If(u.photoAperture.greaterThan(0),()=>{
      const disk=randomPair(seed.add(vec3(173.7,913.2,67.1))).toVar(),radius=sqrt(disk.x).mul(u.photoAperture),angle=disk.y.mul(2*PI);
      origin.addAssign(u.right.mul(radius.mul(cos(angle))).add(u.up.mul(radius.mul(sin(angle)))));
      If(u.photoInfinity.lessThan(.5),()=>{
        const focus=u.camera.add(direction.mul(u.photoFocus.div(max(dot(direction,u.forward),float(.00001)))));
        direction.assign(normalize(focus.sub(origin)));
      });
    });
    const sample=radiance(origin,direction,seed).toVar();
    const mean=previous.sample(uv()).rgb.toVar();
    // Difference form preserves small contributions better than weighting two
    // large radiance values. A scene change sets history to zero immediately.
    // A reset must not subtract and re-add stale floating-point history.
    If(u.history.lessThan(1),()=>mean.assign(sample)).Else(()=>mean.addAssign(sample.sub(mean).div(u.history.add(1))));
    return vec4(mean,1);
  })();
  const outputMaterial=new THREE.NodeMaterial();outputMaterial.depthTest=false;outputMaterial.depthWrite=false;
  outputMaterial.fragmentNode=Fn(()=>{
    const c=current.sample(uv()).rgb.mul(u.exposure).toVar();
    If(u.photoEnabled.greaterThan(.5),()=>{
      c.mulAssign(u.photoBalance);
      const luminance=dot(c,vec3(.2126,.7152,.0722));
      c.assign(max(vec3(luminance).add(c.sub(vec3(luminance)).mul(u.photoTone.y)).sub(.18).mul(u.photoTone.x).add(.18),vec3(0)));
      If(u.photoTone.z.greaterThan(0),()=>{
        const p=floor(uv().mul(u.tileSize).add(u.tileOrigin).div(u.resolution).mul(u.photoGrainGrid));
        const hash=uint(p.x).mul(uint(1973)).bitXor(uint(p.y).mul(uint(9277))).bitXor(uint(0x68bc21eb)).toVar();
        hash.assign(hash.bitXor(hash.shiftRight(uint(16))).mul(uint(0x7feb352d)));
        hash.assign(hash.bitXor(hash.shiftRight(uint(15))).mul(uint(0x846ca68b)));
        hash.assign(hash.bitXor(hash.shiftRight(uint(16))));
        const noise=float(hash.bitAnd(uint(0x00ffffff))).div(16777216).sub(.5).mul(u.photoTone.z);
        c.assign(max(c.add(noise),vec3(0)));
      });
    });
    return vec4(select(u.hdr.greaterThan(0),hdrShoulder(c),c),1);
  })();
  const traceQuad=new THREE.QuadMesh(traceMaterial),outputQuad=new THREE.QuadMesh(outputMaterial);
  // Estimate WB from ungraded linear light using only 1024 pixels. Reading
  // the preview canvas would measure tone-mapped, already-corrected color.
  const balanceTarget=new THREE.RenderTarget(32,32,rtOptions);
  const balanceSource=texture(targets[0].texture);
  const balanceMaterial=new THREE.NodeMaterial();balanceMaterial.depthTest=false;balanceMaterial.depthWrite=false;balanceMaterial.toneMapped=false;
  balanceMaterial.fragmentNode=vec4(balanceSource.sample(uv()).rgb,1);
  const balanceQuad=new THREE.QuadMesh(balanceMaterial);
  let frame=0,samples=0,width=1,height=1,targetIndex=1,lastSignature="",cloudSignature="",lastPhoto=null,lastTile=null;
  const reset=()=>{samples=0;u.history.value=0;};
  const configureHDR=enabled=>{
    let available=false;
    const hdrDisplay=window.matchMedia('(dynamic-range: high)').matches;
    if(backend==='WebGPU'){
      // The backend format must change together with the canvas: configuring
      // only the canvas leaves Three's pipeline targeting an 8-bit attachment.
      renderer.backend.parameters.outputType=enabled&&hdrDisplay?THREE.HalfFloatType:THREE.UnsignedByteType;
      renderer.backend.updateSize();
      const context=renderer.backend.getContext();
      try{
        const cfg=context.getConfiguration();
        context.configure({...cfg,colorSpace:enabled&&hdrDisplay?P3:'srgb',toneMapping:{mode:enabled&&hdrDisplay?'extended':'standard'}});
        const actual=context.getConfiguration();
        available=!!(enabled&&hdrDisplay&&actual.format==='rgba16float'&&actual.toneMapping?.mode==='extended'&&actual.colorSpace===P3);
      }catch{available=false;}
      if(!available){renderer.backend.parameters.outputType=THREE.UnsignedByteType;renderer.backend.updateSize();const ctx=renderer.backend.getContext();ctx.configure({...ctx.getConfiguration(),colorSpace:'srgb',toneMapping:{mode:'standard'}});}
    }else{
      const gl=renderer.backend.gl;
      if(typeof gl.drawingBufferStorage==='function'){
        try{
          gl.drawingBufferStorage(enabled&&hdrDisplay?gl.RGBA16F:gl.RGBA8,width,height);
          gl.drawingBufferColorSpace=enabled&&hdrDisplay?P3:'srgb';
          gl.drawingBufferToneMapping={mode:enabled&&hdrDisplay?'extended':'standard'};
          available=!!(enabled&&hdrDisplay&&gl.drawingBufferToneMapping?.mode==='extended'&&gl.drawingBufferColorSpace===P3);
        }catch{available=false;}
        if(!available){try{gl.drawingBufferStorage(gl.RGBA8,width,height);gl.drawingBufferColorSpace='srgb';gl.drawingBufferToneMapping={mode:'standard'};}catch{}}
      }
    }
    renderer.toneMapping=available?THREE.NoToneMapping:THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace=available?P3:THREE.SRGBColorSpace;
    outputMaterial.needsUpdate=true;
    u.hdr.value=available?1:0;return available;
  };
  configureHDR(false);
  return {
    renderer,backend,uniforms:u,maxTextureSize:renderer.backend.device?.limits.maxTextureDimension2D || renderer.backend.gl?.getParameter(renderer.backend.gl.MAX_TEXTURE_SIZE) || 4096,
    finish(){
      if(renderer.backend.device)return renderer.backend.device.queue.onSubmittedWorkDone();
      const gl=renderer.backend.gl,sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
      return new Promise((resolve,reject)=>{
        const poll=()=>{
          const status=gl.clientWaitSync(sync,0,0);
          if(status===gl.TIMEOUT_EXPIRED){setTimeout(poll,1);return;}
          gl.deleteSync(sync);
          if(status===gl.WAIT_FAILED)reject(new Error('GPU frame completion failed'));else resolve();
        };poll();
      });
    },
    resize(w,h){
      const nextW=Math.max(16,Math.floor(w)),nextH=Math.max(16,Math.floor(h));
      if(width===nextW&&height===nextH)return;
      width=nextW;height=nextH;renderer.setSize(width,height,false);targets.forEach(t=>t.setSize(width,height));u.resolution.value.set(width,height);u.tileSize.value.set(width,height);u.aspect.value=width/height;
      if(u.hdr.value)configureHDR(true);reset();
    },
    async readImage({hdr=u.hdr.value>0}={}){
      await this.finish();
      const exposure=u.exposure.value,grade=lastPhoto?getPhotoColorTransform(lastPhoto):null;
      const fullWidth=lastTile?.width || width,fullHeight=lastTile?.height || height,grain=lastPhoto?getPhotoGrainGrid(lastPhoto.width,lastPhoto.height):null;
      const pixels=hdr?new Float32Array(width*height*4):new Uint8ClampedArray(width*height*4);
      const source=targets[1-targetIndex];
      // Read the actual full-resolution history, not the CSS-sized canvas.
      // Small strips bound staging-buffer memory even at 7680x4320.
      for(let top=0;top<height;top+=64){
        const rows=Math.min(64,height-top),webgpu=backend==='WebGPU';
        const values=await renderer.readRenderTargetPixelsAsync(source,0,webgpu?top:height-top-rows,width,rows);
        const stride=webgpu?Math.ceil(width*16/256)*256/4:width*4;
        for(let row=0;row<rows;row++)for(let x=0;x<width;x++){
          const input=(webgpu?row:rows-1-row)*stride+x*4,output=((top+row)*width+x)*4;
          if(grade){
            const c=applyPhotoColor([values[input]*exposure,values[input+1]*exposure,values[input+2]*exposure],grade,{x:x+(lastTile?.x || 0),y:top+row+(lastTile?.y || 0),width:fullWidth,height:fullHeight,...grain});
            writeDisplayPixel(...c,pixels,output,1,hdr);
          }else writeDisplayPixel(values[input],values[input+1],values[input+2],pixels,output,exposure,hdr);
        }
      }
      return {pixels,width,height,hdr,samples};
    },
    async readWhiteBalanceSamples(){
      await this.finish();
      balanceSource.value=targets[1-targetIndex].texture;
      renderer.setRenderTarget(balanceTarget);balanceQuad.render(renderer);renderer.setRenderTarget(null);
      const values=await renderer.readRenderTargetPixelsAsync(balanceTarget,0,0,32,32);
      // 32 RGBA FP32 pixels occupy 512 bytes, already WebGPU row-aligned.
      return {pixels:new Float32Array(values),width:32,height:32};
    },
    get dimensions(){return {width,height};},
    render(camera,state,band,options={}){
      const began=performance.now();
      u.camera.value.copy(camera.position);camera.getWorldDirection(u.forward.value);u.right.value.setFromMatrixColumn(camera.matrixWorld,0);u.up.value.setFromMatrixColumn(camera.matrixWorld,1);u.fov.value=Math.tan(camera.fov*PI/360);
      lastPhoto=options.photo?{...options.photo}:null;lastTile=options.tile?{...options.tile}:null;
      u.aspect.value=camera.aspect;u.tileSize.value.set(width,height);u.tileOrigin.value.set(lastTile?.x || 0,lastTile?.y || 0);u.resolution.value.set(lastTile?.width || width,lastTile?.height || height);
      const optics=lastPhoto?getPhotoOptics(lastPhoto,camera.aspect):null;
      u.photoShift.value.set(optics?.shiftX || 0,optics?.shiftY || 0);u.photoAperture.value=optics?.dof?optics.apertureRadius:0;u.photoFocus.value=Number.isFinite(optics?.focusDistance)?optics.focusDistance:60;u.photoInfinity.value=optics?.focusDistance===Infinity?1:0;
      const grade=getPhotoColorTransform(lastPhoto),grain=getPhotoGrainGrid(lastPhoto?.width || width,lastPhoto?.height || height);
      u.photoEnabled.value=lastPhoto&&(grade.whiteBalance.some(value=>value!==1)||grade.contrast!==1||grade.saturation!==1||grade.grain!==0)?1:0;
      const grainStrength=photoGrainStrength(lastTile?.width || width,lastTile?.height || height,grain.grainWidth,grain.grainHeight);
      u.photoBalance.value.set(...grade.whiteBalance);u.photoTone.value.set(grade.contrast,grade.saturation,grade.grain*grainStrength);u.photoGrainGrid.value.set(grain.grainWidth,grain.grainHeight);
      u.bounces.value=Math.min(12,Math.max(1,state.bounces));u.shadowSamples.value=Math.min(8,Math.max(0,state.shadowSamples));u.far.value=50000;u.layers.value=state.layers;u.towers.value=state.towers;
      u.cutMode.value=state.cutMode;u.cutHeight.value=state.cutHeight;u.cutSide.value=state.cutSide;u.singleFloor.value=state.floor;u.band.value.set(...band);
      u.fog.value=state.fog?1:0;u.cloud.value=state.cloud?1:0;u.exposure.value=state.exposure;
      const lighting=celestialState(state.minutes);
      u.sun.value.set(...lighting.sun);u.sunPower.value=lighting.sunPower;u.moonPower.value=lighting.moonPower;
      u.sunColor.value.set(...lighting.sunColor);u.night.value=lighting.night;u.phase.value=lighting.phase;u.twilight.value=lighting.twilight;
      u.exposure.value=state.exposure*(1+.65*u.night.value);
      const signature=[...camera.position.toArray(),...camera.quaternion.toArray(),camera.fov,camera.aspect,...u.photoShift.value.toArray(),u.photoAperture.value,u.photoFocus.value,u.photoInfinity.value,...u.resolution.value.toArray(),...u.tileOrigin.value.toArray(),state.bounces,state.shadowSamples,state.layers,state.towers,state.cutMode,state.cutHeight,state.cutSide,state.floor,state.fog,state.cloud,state.minutes,u.selected.value].map(v=>Number(v).toFixed(5)).join(',');
      if(signature!==lastSignature){reset();lastSignature=signature;}
      const nextCloudSignature=[...camera.position.toArray(),state.minutes].join(',');
      if(state.cloud&&nextCloudSignature!==cloudSignature){
        renderer.setRenderTarget(cloudTarget);cloudQuad.render(renderer);cloudSignature=nextCloudSignature;
      }
      u.frame.value=options.sampleIndex ?? frame;frame++;u.history.value=samples;
      previous.value=targets[1-targetIndex].texture;current.value=targets[targetIndex].texture;
      renderer.setRenderTarget(targets[targetIndex]);traceQuad.render(renderer);
      renderer.setRenderTarget(null);if(options.present!==false)outputQuad.render(renderer);
      targetIndex=1-targetIndex;samples++;
      return {frame,samples,width,height,rendered:true,submitMs:performance.now()-began};
    },
    select(index){u.selected.value=index??-1;reset();},reset,configureHDR,
    get frame(){return frame;},
    get samples(){return samples;},
    dispose(){targets.forEach(t=>t.dispose());cloudTarget.dispose();balanceTarget.dispose();[primitives,geometry,nodes,shapes,materials,cloudVolume,lights,lightGrid,lightProbes,lightNightProbes,lightDirections,lightFloors,lightPolygons].forEach(t=>t.dispose());cloudMaterial.dispose();traceMaterial.dispose();outputMaterial.dispose();balanceMaterial.dispose();renderer.dispose();}
  };
}
