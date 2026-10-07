// Analytic boxes and convex prisms. Shared data for GPU tracing and CPU picking.
export function buildBVH(primitives, progress = () => {}, {towers=[],materials=[]} = {}) {
  const count = primitives.length;
  const bounds = new Float32Array(count * 6);
  const centers = new Float32Array(count * 3);
  const spaces=[{center:[0,0,0],rotation:[0,0,0,1]}];
  for(const tower of towers) spaces[tower.id]={center:tower.center,rotation:[0,Math.sin((tower.orientation || 0)/2),0,Math.cos((tower.orientation || 0)/2)]};
  const groups=spaces.map(()=>[]),worldLo=[Infinity,Infinity,Infinity],worldHi=[-Infinity,-Infinity,-Infinity];
  const groupBounds=spaces.map(()=>({lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity]}));
  for (let i = 0; i < count; i++) {
    const p = primitives[i],space=spaces[p.tower]?p.tower:0,transform=spaces[space];
    groups[space].push(i);
    const center=rotateVector(p.center.map((v,a)=>v-transform.center[a]),transform.rotation,true);
    const originalQ=p.rotation || [0,0,0,1],q=multiplyQ([-transform.rotation[0],-transform.rotation[1],-transform.rotation[2],transform.rotation[3]],originalQ);
    const [x, y, z, w] = q, [a, b, c] = p.half;
    const ex = Math.abs(1 - 2 * (y*y + z*z))*a + Math.abs(2*(x*y-z*w))*b + Math.abs(2*(x*z+y*w))*c;
    const ey = Math.abs(2*(x*y+z*w))*a + Math.abs(1-2*(x*x+z*z))*b + Math.abs(2*(y*z-x*w))*c;
    const ez = Math.abs(2*(x*z-y*w))*a + Math.abs(2*(y*z+x*w))*b + Math.abs(1-2*(x*x+y*y))*c;
    centers.set(center,i*3);
    // Conservative padding covers Float32 packing at roof height.
    bounds.set([center[0]-ex-.0001,center[1]-ey-.0001,center[2]-ez-.0001,center[0]+ex+.0001,center[1]+ey+.0001,center[2]+ez+.0001], i*6);
    for(let axis=0;axis<3;axis++) {
      const unit=[0,0,0];unit[axis]=1;
      const local=rotateVector(unit,originalQ,true);
      const extent=Math.abs(local[0])*a+Math.abs(local[1])*b+Math.abs(local[2])*c;
      worldLo[axis]=Math.min(worldLo[axis],p.center[axis]-extent-.0001);
      worldHi[axis]=Math.max(worldHi[axis],p.center[axis]+extent+.0001);
      groupBounds[space].lo[axis]=Math.min(groupBounds[space].lo[axis],p.center[axis]-extent-.0001);
      groupBounds[space].hi[axis]=Math.max(groupBounds[space].hi[axis],p.center[axis]+extent+.0001);
    }
  }
  const order=Uint32Array.from(groups.flat());
  progress('建立塔楼局部坐标 SAH 加速结构…');
  const nodes = [];
  const area=(lo,hi)=>{const x=Math.max(0,hi[0]-lo[0]),y=Math.max(0,hi[1]-lo[1]),z=Math.max(0,hi[2]-lo[2]);return 2*(x*y+y*z+z*x);};
  function divide(start, end, space) {
    const index = nodes.length;
    const node = { lo: [Infinity,Infinity,Infinity], hi: [-Infinity,-Infinity,-Infinity], start: -1, escape: 0, layers: 0, towers: 0, space, highFloor: -Infinity, castsShadow:false,splitAxis:0 };
    const clo=[Infinity,Infinity,Infinity],chi=[-Infinity,-Infinity,-Infinity];
    nodes.push(node);
    for (let j = start; j < end; j++) {
      const k = order[j], p = primitives[k];
      for (let axis = 0; axis < 3; axis++) {
        node.lo[axis] = Math.min(node.lo[axis], bounds[k*6+axis]);
        node.hi[axis] = Math.max(node.hi[axis], bounds[k*6+3+axis]);
        clo[axis]=Math.min(clo[axis],centers[k*3+axis]);chi[axis]=Math.max(chi[axis],centers[k*3+axis]);
      }
      node.layers |= p.layer;
      if((materials[p.material]?.transmission || 0)<=.5)node.castsShadow=true;
      node.towers |= p.tower ? 1 << (p.tower-1) : 64;
      node.highFloor = Math.max(node.highFloor,p.floor || 0);
    }
    if (end - start <= 4) {
      node.start = start * 8 + end - start;
    } else {
      // Binned surface-area heuristic avoids splitting many overlapping long
      // truss/column bounds at an arbitrary median. The traversal stays threaded.
      let best=Infinity,bestAxis=-1,bestBin=-1;const bins=12;
      for(let axis=0;axis<3;axis++) {
        const extent=chi[axis]-clo[axis];if(extent<1e-7)continue;
        const counts=new Uint32Array(bins),lo=new Float64Array(bins*3).fill(Infinity),hi=new Float64Array(bins*3).fill(-Infinity);
        const factor=bins/extent;
        for(let j=start;j<end;j++) {
          const k=order[j],b=Math.min(bins-1,Math.floor((centers[k*3+axis]-clo[axis])*factor));counts[b]++;
          for(let a=0;a<3;a++){lo[b*3+a]=Math.min(lo[b*3+a],bounds[k*6+a]);hi[b*3+a]=Math.max(hi[b*3+a],bounds[k*6+3+a]);}
        }
        const costs=new Float64Array(bins-1),rightLo=[Infinity,Infinity,Infinity],rightHi=[-Infinity,-Infinity,-Infinity];let n=0;
        for(let b=bins-1;b>0;b--){n+=counts[b];for(let a=0;a<3;a++){rightLo[a]=Math.min(rightLo[a],lo[b*3+a]);rightHi[a]=Math.max(rightHi[a],hi[b*3+a]);}costs[b-1]=n?area(rightLo,rightHi)*n:0;}
        const leftLo=[Infinity,Infinity,Infinity],leftHi=[-Infinity,-Infinity,-Infinity];n=0;
        for(let b=0;b<bins-1;b++) {
          n+=counts[b];for(let a=0;a<3;a++){leftLo[a]=Math.min(leftLo[a],lo[b*3+a]);leftHi[a]=Math.max(leftHi[a],hi[b*3+a]);}
          const cost=n?costs[b]+area(leftLo,leftHi)*n:Infinity;
          if(n&&n<end-start&&cost<best){best=cost;bestAxis=axis;bestBin=b;}
        }
      }
      let middle=start;
      node.splitAxis=Math.max(0,bestAxis);
      if(bestAxis>=0) {
        const edge=clo[bestAxis]+(chi[bestAxis]-clo[bestAxis])*(bestBin+1)/12;
        let right=end-1;
        while(middle<=right) {
          if(centers[order[middle]*3+bestAxis]<edge)middle++;
          else{const temp=order[middle];order[middle]=order[right];order[right--]=temp;}
        }
      }
      if(middle===start||middle===end){middle=(start+end)>>>1;const extents=chi.map((v,a)=>v-clo[a]),axis=extents.indexOf(Math.max(...extents));node.splitAxis=axis;order.subarray(start,end).sort((a,b)=>centers[a*3+axis]-centers[b*3+axis]);}
      divide(start,middle,space);
      divide(middle,end,space);
    }
    node.escape = nodes.length;
    return index;
  }
  // Binary world-space gateways allow exact front-to-back traversal across
  // buildings, while each tower keeps its tight structural-space subtree.
  let groupStart=0;
  const active=groups.flatMap((group,space)=>{const start=groupStart;groupStart+=group.length;return group.length?[{space,start,end:groupStart,...groupBounds[space]}]:[];});
  function gateway(list) {
    if(list.length===1)return divide(list[0].start,list[0].end,list[0].space);
    const index=nodes.length,root={lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity],start:-1,escape:0,layers:0,towers:0,space:0,highFloor:110,castsShadow:false,splitAxis:0};nodes.push(root);
    for(const group of list)for(let a=0;a<3;a++){root.lo[a]=Math.min(root.lo[a],group.lo[a]);root.hi[a]=Math.max(root.hi[a],group.hi[a]);}
    const extents=root.hi.map((v,a)=>v-root.lo[a]),axis=extents.indexOf(Math.max(...extents));
    root.splitAxis=axis;
    list.sort((a,b)=>a.lo[axis]+a.hi[axis]-b.lo[axis]-b.hi[axis]);
    const middle=Math.ceil(list.length/2),left=gateway(list.slice(0,middle)),right=gateway(list.slice(middle));
    for(const child of [left,right]){root.layers|=nodes[child].layers;root.towers|=nodes[child].towers;root.castsShadow ||= nodes[child].castsShadow;}
    root.escape=nodes.length;return index;
  }
  if(count)gateway(active);
  const nodeData = new Float32Array(nodes.length * 12);
  nodes.forEach((n,i) => nodeData.set([...n.lo,n.start,...n.hi,n.escape,n.layers,n.towers,n.space,n.highFloor],i*12));
  // GPU traversal needs two texels instead of three. Bounds, order and escape
  // links are identical; a leaf's escape is always the following node.
  const compactNodeData=new Float32Array(nodes.length*8);
  // 12 structural layers, six buildings + site, and two tower-local spaces.
  // Bit 21 says this subtree contains an opaque shadow blocker.
  // Bits 22–23 carry the split axis. Values stay below 2^24 and remain
  // exactly representable by Float32.
  nodes.forEach((n,i)=>compactNodeData.set([...n.lo,n.layers|(n.towers<<12)|(n.space<<19)|(n.castsShadow?1<<21:0)|(n.splitAxis<<22),...n.hi,n.start<0?n.escape:-n.start-1],i*8));
  const primitiveData = new Float32Array(count*16);
  const compactPrimitiveData=new Float32Array(count*8),geometryValues=[],geometryIndices=new Map();
  const shapeOffsets=new Int32Array(count).fill(-1),shapeValues=[];
  const kinds=[],kindSources=[],kindIndices=new Map();
  for (let j=0;j<count;j++) {
    const original = order[j], p=primitives[original];
    const kind=p.kind || 'Model member';
    if(!kindIndices.has(kind)){kindIndices.set(kind,kinds.length);kinds.push(kind);kindSources.push(p.source || 'nist-1-2a');}
    primitiveData.set([...p.center,p.material,...p.half,kindIndices.get(kind),...(p.rotation || [0,0,0,1]),p.layer,p.tower,p.floor || 0,original],j*16);
    if(p.shape?.type==='convex') {
      const planes=p.shape.planes;
      if(!planes?.length||planes.length>8||planes.some(plane=>plane.length!==4||!plane.every(Number.isFinite)))throw new Error(`Invalid convex prism: ${kind}`);
      shapeOffsets[j]=shapeValues.length/4;shapeValues.push(planes.length,0,0,0,...planes.flat());
    }
    // Positions/materials/visibility remain per member. Identical Float32
    // cross-sections and orientations share two geometry texels on the GPU.
    // This is exact reuse at the existing packing precision, without LOD.
    const geometry=[...p.half,(shapeOffsets[j]+1)*2,...(p.rotation || [0,0,0,1])].map(Math.fround),key=geometry.join(',');
    let geometryIndex=geometryIndices.get(key);
    if(geometryIndex===undefined){geometryIndex=geometryValues.length/8;geometryIndices.set(key,geometryIndex);geometryValues.push(...geometry);}
    const transparent=(materials[p.material]?.transmission || 0)>.5?1:0;
    compactPrimitiveData.set([...p.center,p.material,p.layer,p.tower,p.floor || 0,geometryIndex*2+transparent],j*8);
  }
  let maxDepth=0;
  function depth(index,level=1){maxDepth=Math.max(maxDepth,level);const n=nodes[index];if(n?.start<0){const left=index+1,right=nodes[left].escape;depth(left,level+1);depth(right,level+1);}}
  if(count)depth(0);
  if(maxDepth>60)throw new Error('BVH exceeds the 64-entry traversal stack');
  // Chrome/NVIDIA measurements favor the stackless threaded walk at the
  // same quality, especially inside the lobby. Ordered traversal remains
  // available for reproducible benchmarks and independent CPU comparisons.
  return { nodeData, compactNodeData, primitiveData, compactPrimitiveData,geometryData:new Float32Array(geometryValues),geometryCount:geometryValues.length/8,shapeOffsets, shapeData:new Float32Array(shapeValues),nodeCount: nodes.length, primitiveCount: count, shadowNodeFlags:true, orderedTraversal:false,splitAxisTraversal:true,maxDepth, spaces, kinds, kindSources };
}

function multiplyQ(a,b) {
  return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
}

export function rotateVector(v,q,inverse=false) {
  const s=inverse?-1:1, x=q[0]*s,y=q[1]*s,z=q[2]*s,w=q[3];
  const tx=2*(y*v[2]-z*v[1]),ty=2*(z*v[0]-x*v[2]),tz=2*(x*v[1]-y*v[0]);
  return [v[0]+w*tx+y*tz-z*ty,v[1]+w*ty+z*tx-x*tz,v[2]+w*tz+x*ty-y*tx];
}

function interval(ro,rd,lo,hi) {
  let near=-Infinity,far=Infinity;
  for(let a=0;a<3;a++) {
    if(Math.abs(rd[a])<1e-10) { if(ro[a]<lo[a]||ro[a]>hi[a])return null; }
    else { const x=(lo[a]-ro[a])/rd[a],y=(hi[a]-ro[a])/rd[a];near=Math.max(near,Math.min(x,y));far=Math.min(far,Math.max(x,y)); }
  }
  return far>=Math.max(near,0.001)?[near,far]:null;
}

export function convexInterval(ro,rd,planes,range=[-Infinity,Infinity]) {
  let [near,far]=range;
  for(const [x,y,z,d] of planes) {
    const denominator=x*rd[0]+y*rd[1]+z*rd[2],remaining=d-x*ro[0]-y*ro[1]-z*ro[2];
    if(Math.abs(denominator)<1e-10){if(remaining<-.000001)return null;continue;}
    const edge=remaining/denominator;
    if(denominator<0)near=Math.max(near,edge);else far=Math.min(far,edge);
    if(far<near)return null;
  }
  return far>=Math.max(near,.001)?[near,far]:null;
}

export function pickBVH(data,ro,rd,state,band=[-10000,10000],metrics=null) {
  const nd=data.nodeData,pd=data.primitiveData;
  const rays=(data.spaces || [{center:[0,0,0],rotation:[0,0,0,1]}]).map(s=>({ro:rotateVector(ro.map((v,a)=>v-s.center[a]),s.rotation,true),rd:rotateVector(rd,s.rotation,true)}));
  let node=0,closest=state.far || 50000,selected=-1;
  const stack=[];
  const nodeHit=index=>{
    const n=index*12,ray=rays[data.spaces?Math.round(nd[n+10]):0];
    if(!(Math.round(nd[n+8])&state.layers)||!(Math.round(nd[n+9])&(state.towers|64)))return null;
    const iv=interval(ray.ro,ray.rd,nd.subarray(n,n+3),nd.subarray(n+4,n+7));
    return iv&&iv[0]<=closest?iv:null;
  };
  const next=()=>stack.length?stack.pop():data.nodeCount;
  while(node<data.nodeCount) {
    if(metrics)metrics.nodes=(metrics.nodes || 0)+1;
    const n=node*12,ray=rays[data.spaces?Math.round(nd[n+10]):0],iv=interval(ray.ro,ray.rd,nd.subarray(n,n+3),nd.subarray(n+4,n+7));
    if(!iv||iv[0]>closest||!(Math.round(nd[n+8])&state.layers)||!(Math.round(nd[n+9])&(state.towers|64))) {node=data.orderedTraversal?next():Math.round(nd[n+7]);continue;}
    const encoded=nd[n+3];
    if(encoded<0){
      if(!data.orderedTraversal){node++;continue;}
      if(data.splitAxisTraversal){
        const left=node+1,right=Math.round(nd[left*12+7]),axis=(Math.round(data.compactNodeData[node*8+3])>>>22)&3,first=ray.rd[axis]>=0?left:right;
        stack.push(first===left?right:left);node=first;continue;
      }
      if(metrics)metrics.childBounds=(metrics.childBounds || 0)+2;
      const left=node+1,right=Math.round(nd[left*12+7]),a=nodeHit(left),b=nodeHit(right);
      if(a&&b){const first=a[0]<=b[0]?left:right,second=first===left?right:left;stack.push(second);node=first;}
      else node=a?left:b?right:next();
      continue;
    }
    const start=Math.floor(encoded/8),length=Math.round(encoded)%8;
    for(let j=0;j<length;j++) {
      const k=start+j,p=k*16,layer=Math.round(pd[p+12]),tower=Math.round(pd[p+13]);
      if(!(layer&state.layers)||(tower && !(state.towers&(1<<(tower-1)))))continue;
      if(metrics)metrics.primitives=(metrics.primitives || 0)+1;
      const q=pd.subarray(p+8,p+12),local=rotateVector([ro[0]-pd[p],ro[1]-pd[p+1],ro[2]-pd[p+2]],q,true),dir=rotateVector(rd,q,true),h=pd.subarray(p+4,p+7);
      let hit=interval(local,dir,h.map(v=>-v),h);
      const offset=data.shapeOffsets?.[k] ?? -1;
      if(hit&&offset>=0){const planes=[],length=Math.round(data.shapeData[offset*4]);for(let i=0;i<length;i++)planes.push(data.shapeData.subarray((offset+i+1)*4,(offset+i+2)*4));hit=convexInterval(local,dir,planes,hit);}
      if(!hit)continue;
      let [near,far]=hit;
      const clip=(axis,lower,upper)=>{
        if(Math.abs(rd[axis])<1e-10){if(ro[axis]<lower||ro[axis]>upper){near=Infinity;far=-Infinity;}}
        else{const a=(lower-ro[axis])/rd[axis],b=(upper-ro[axis])/rd[axis];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}
      };
      if(tower===1 || tower===2){
        if(state.floor)clip(1,band[0],band[1]);
        if(state.cutMode===1)clip(1,state.cutSide?state.cutHeight:-10000,state.cutSide?10000:state.cutHeight);
        if(state.cutMode===2){const edge=data.towers?.find(t=>t.id===tower)?.center[2] || 0;clip(2,state.cutSide?edge:-10000,state.cutSide?10000:edge);}
      }
      const t=near>0.005?near:far;
      if(t>0.005&&far>=near&&t<closest){closest=t;selected=k;}
    }
    node=data.orderedTraversal?next():Math.round(nd[n+7]);
  }
  return selected<0?null:{index:selected,distance:closest,position:ro.map((v,a)=>v+rd[a]*closest),record:Array.from(pd.subarray(selected*16,selected*16+16))};
}
