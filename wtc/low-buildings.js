/*
 * Original WTC low buildings. All geometry is emitted through the site's
 * analytic OBB / convex-prism builders, in the unchanged architectural X/Z.
 * Elevation drawings document WTC 5; photographs support the WTC 4/6 facades.
 * WTC 4/6 framing and all explanatory circulation layouts remain estimates.
 */
import {convexPrism} from './site-geometry.js';
import {buildHotelEntrance,buildHotelPublicFacade} from './hotel-entrance.js';
const FT=.3048;
const SOURCE_LOW='fema-403-4',SOURCE_HOTEL='fema-403-3';
const SOURCE_ELEVATION='pa-18324-low-elevations',SOURCE_PHOTO='wtc-low-rise-photos';
const BASEMENTS=[-4.8768,-7.9248,-10.9728,-14.0208,-17.3736,-20.7264];

// Anchors are source-image locations, never a newly calculated bounding-box
// origin. Only WTC 5's 30 ft grid / 15 ft cantilever is documented directly.
export const LOW_BUILDING_PROFILES=Object.freeze({
  3:Object.freeze({facade:'hotel',guestFloors:[4,21],publicFloors:3,crownFloor:22,corePixels:[[976,856]],coreAngle:-.337,gridAnchorPixel:[918,713],basements:6,facadeSource:SOURCE_HOTEL}),
  4:Object.freeze({facade:'south-plaza-arcade',finPitch:3.333333*FT,finWidth:.105,finDepth:.29,officeStart:3,corePixels:[[1415,894],[1330,934]],coreAngle:0,gridAnchorPixel:[1262,843],basements:3,facadeSource:SOURCE_PHOTO}),
  5:Object.freeze({facade:'north-plaza-arcade',finPitch:3.333333*FT,finWidth:.115,finDepth:.34,officeStart:3,corePixels:[[1238,407],[1413,539]],coreAngle:0,gridAnchorPixel:[1162,325],basements:3,facadeSource:SOURCE_ELEVATION}),
  6:Object.freeze({facade:'customs',finPitch:4*FT,finWidth:.10,finDepth:.24,officeStart:2,corePixels:[[913,380],[1049,388]],coreAngle:0,gridAnchorPixel:[773,302],basements:6,facadeSource:SOURCE_PHOTO})
});

function bounds(poly){return {min:[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1]))],max:[Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))]};}
function insetOutline(poly,distance){
  const lines=poly.map((a,i)=>{const q=poly[(i+1)%poly.length],length=Math.hypot(q[0]-a[0],q[1]-a[1]),t=[(q[0]-a[0])/length,(q[1]-a[1])/length],n=[t[1],-t[0]];return {p:[a[0]+n[0]*distance,a[1]+n[1]*distance],t};});
  return lines.map((q,i)=>{const a=lines[(i+lines.length-1)%lines.length],cross=(u,v)=>u[0]*v[1]-u[1]*v[0],den=cross(a.t,q.t);if(Math.abs(den)<1e-9)return q.p;const s=cross(q.p.map((v,j)=>v-a.p[j]),q.t)/den;return a.p.map((v,j)=>v+a.t[j]*s);});
}
function inside([x,z],poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const rect=(x1,z1,x2,z2)=>[[x1,z1],[x2,z1],[x2,z2],[x1,z2]];
function outlineDistance(p,poly){let d=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));d=Math.min(d,Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t));}return d;}
function intervals(poly,z,transpose=false){const xs=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],a=transpose?[p[1],p[0]]:p,b=transpose?[q[1],q[0]]:q;if((a[1]<=z&&b[1]>z)||(b[1]<=z&&a[1]>z))xs.push(a[0]+(z-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);return Array.from({length:Math.floor(xs.length/2)},(_,i)=>[xs[i*2],xs[i*2+1]]);}
function subtract(spans,cuts){for(const [a,b] of cuts)spans=spans.flatMap(([l,r])=>b<=l||a>=r?[[l,r]]:[...(a>l?[[l,a]]:[]),...(b<r?[[b,r]]:[])]);return spans;}
function segmentOutsideHoles(a,q,holes){
  const d=[q[0]-a[0],q[1]-a[1]],ts=[0,1],cross=(x,y)=>x[0]*y[1]-x[1]*y[0];
  for(const hole of holes)for(let i=0;i<hole.length;i++){const p=hole[i],r=hole[(i+1)%hole.length],e=[r[0]-p[0],r[1]-p[1]],den=cross(d,e);if(Math.abs(den)<1e-10)continue;const delta=[p[0]-a[0],p[1]-a[1]],t=cross(delta,e)/den,u=cross(delta,d)/den;if(t>1e-9&&t<1-1e-9&&u>=-1e-9&&u<=1+1e-9)ts.push(t);}
  const sorted=[...new Set(ts)].sort((a,b)=>a-b),at=t=>[a[0]+d[0]*t,a[1]+d[1]*t],result=[];
  for(let i=0;i<sorted.length-1;i++)if(!holes.some(h=>inside(at((sorted[i]+sorted[i+1])/2),h)))result.push([at(sorted[i]),at(sorted[i+1])]);
  return result;
}
function segmentInsideRegions(a,q,regions){
  const d=[q[0]-a[0],q[1]-a[1]],ts=[0,1],cross=(u,v)=>u[0]*v[1]-u[1]*v[0];
  for(const poly of regions)for(let i=0;i<poly.length;i++){const p=poly[i],r=poly[(i+1)%poly.length],e=[r[0]-p[0],r[1]-p[1]],den=cross(d,e);if(Math.abs(den)<1e-10)continue;const delta=[p[0]-a[0],p[1]-a[1]],t=cross(delta,e)/den,u=cross(delta,d)/den;if(t>1e-9&&t<1-1e-9&&u>=-1e-9&&u<=1+1e-9)ts.push(t);}
  const sorted=[...new Set(ts)].sort((a,q)=>a-q),at=t=>[a[0]+d[0]*t,a[1]+d[1]*t],result=[];
  for(let i=0;i<sorted.length-1;i++)if(regions.some(p=>inside(at((sorted[i]+sorted[i+1])/2),p)))result.push([at(sorted[i]),at(sorted[i+1])]);
  return result;
}
function axesQuaternion(x,y,z){const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2],trace=m00+m11+m22;let q;if(trace>0){const s=Math.sqrt(trace+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}else if(m00>m11&&m00>m22){const s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}else if(m11>m22){const s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}else{const s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}const n=Math.hypot(...q);return q.map(v=>v/n);}

// The Liberty Street WTC 4 and plaza WTC 5 photographs show diagonal forks
// meeting at a point, rather than round hoops. Only the short column-head
// transition bends. This normalized photographic estimate keeps the existing
// bay endpoints/rise; it is not an additional surveyed dimension.
function arcadeForkHeight(t){
  const u=2*Math.min(t,1-t),root=2/9;
  return (u<root?2*u-u*u/(2*root):u+root/2)/(1+root/2);
}

/** Pure layout shared by slab cuts, ceilings, lift doors and stair flights. */
export function getLowBuildingLayout(b,{sitePlanToStructure,plazaElevation=22*FT,streetLevels={west:-4*FT},getEntrySurface}={}){
  if(typeof sitePlanToStructure!=='function')throw new Error('sitePlanToStructure is required');
  const profile=LOW_BUILDING_PROFILES[b.id];if(!profile)throw new Error(`Unsupported low building ${b.id}`);
  const base=b.id===3?streetLevels.west:0;
  const levels=b.id===3?[base,base+4.8,base+8.9,base+12.6,...Array.from({length:18},(_,i)=>base+12.6+(i+1)*9.5*FT),base+(b.roofHeightAboveWestStreet??242*FT)]:b.id===5?[310,332,347,359,374+8/12,386+8/12,398+8/12,410+8/12,423+8/12,440+8/12].map(el=>(el-310)*FT):[0,plazaElevation,...Array.from({length:b.floors-1},(_,i)=>plazaElevation+(i+1)*3.8)];
  const publicPoly=b.id===3?(b.publicFootprint||b.typicalFootprint||b.footprint):b.footprint;
  const groundPoly=b.groundFootprint||publicPoly;
  const typicalPoly=b.typicalFootprint||publicPoly;
  // WTC 5's 15 ft structural cantilever is documented; WTC 4's analogous
  // setback is inferred. WTC 6's separately photographed deep base uses a
  // 3.6 m visual estimate and a much shorter straight upper flare below.
  const arcade=b.id>=4,arcadeSetback=b.id===6?3.6:15*FT,glazingRecess=arcade?arcadeSetback+.24:.20;
  const arcadeLayout=arcade?{columnSetback:arcadeSetback,glazingSetback:glazingRecess,columnPoly:insetOutline(publicPoly,arcadeSetback),supportedPoly:insetOutline(publicPoly,arcadeSetback-.22),occupiedPoly:insetOutline(publicPoly,glazingRecess),exteriorPavingPolys:[],depthEvidence:b.id===5?'documented-15-ft-floor-cantilever':b.id===6?'photographic-depth-estimate':'inferred-similar-system',profileEvidence:b.id===6?'photographic-short-flared-transition-estimate':'photographic-swept-umbrella-estimate'}:null;
  const cores=(b.corePixels||profile.corePixels).map((pixel,index)=>{
    const [cx,cz]=sitePlanToStructure(pixel),angle=profile.coreAngle,c=Math.cos(angle),s=Math.sin(angle);
    const local=(x,z)=>[cx+c*x+s*z,cz-s*x+c*z];
    // The lift and stair apertures have their own walls and landings. The
    // lobby remains solid; cutting the entire service-core box would erase it.
    const liftRects=[-2.2,.05].map(x=>rect(x-.90,.70,x+.90,2.42));
    const stairRect=rect(1.30,-3.12,3.40,1.72);
    return {index,pixel,center:[cx,cz],angle,local,liftCenters:[-2.2,.05],stairX:2.35,stairRect,localHoles:[...liftRects,stairRect],holes:[...liftRects,stairRect].map(p=>p.map(([x,z])=>local(x,z))),footprint:rect(-3.70,-4.40,3.70,3.70).map(p=>local(...p)),status:'schematic-circulation-not-historic-lift-inventory'};
  }).filter(core=>core.footprint.every(p=>inside(p,arcadeLayout?.occupiedPoly||publicPoly))&&core.footprint.every(p=>inside(p,typicalPoly)));
  const portals=[],portalPixels=b.id===3?(b.groundPolygon||b.publicPolygon||b.typicalPolygon||b.polygon):b.polygon;
  const definePortal=(edgeIndex,t,side,threshold,source,status='estimated')=>{
    const pixels=portalPixels||[],pa=pixels[edgeIndex],pb=pixels[(edgeIndex+1)%pixels.length];if(!pa||!pb)return;
    const pixel=[pa[0]+(pb[0]-pa[0])*t,pa[1]+(pb[1]-pa[1])*t],p={edgeIndex,t,side,pixel,position:sitePlanToStructure(pixel),threshold,source,evidenceStatus:status,surveyed:false,outline:groundPoly,outlineField:b.id===3?(b.groundFootprint?'groundFootprint':b.publicFootprint?'publicFootprint':'typicalFootprint'):'footprint'};
    portals.push(p);
  };
  if(b.id===3){definePortal(b.podiumProfile?.entranceEdge??(portalPixels?.length===10?8:4),b.podiumProfile?.entranceT??.70,'West Street',base+.54,b.podiumProfile?.source??SOURCE_HOTEL,'documented-location-photo-estimated-raised-threshold');Object.assign(portals.at(-1),{width:32.4,platformDepth:4.6,thresholdRiseFromSidewalk:b.podiumProfile?.thresholdRise??.54});}
  if(b.id===4){definePortal(3,.32,'Church Street',streetLevels.church??4.55,SOURCE_PHOTO);definePortal(6,.52,'Liberty Street',0,SOURCE_PHOTO,'photographic-location-street-grade-estimate');portals.at(-1).thresholdFromStreetGrade=true;definePortal(0,.56,'plaza',plazaElevation,SOURCE_PHOTO);definePortal(8,.40,'plaza',plazaElevation,SOURCE_PHOTO);}
  if(b.id===5){definePortal(0,.20,'Vesey Street',10*FT,SOURCE_ELEVATION,'drawing-threshold-registered-estimate');definePortal(0,.70,'Vesey Street',10*FT,SOURCE_ELEVATION,'drawing-threshold-registered-estimate');definePortal(2,.62,'Vesey Street',10*FT,SOURCE_ELEVATION,'drawing-threshold-registered-estimate');definePortal(3,.70,'Church Street',streetLevels.church??4.55,SOURCE_ELEVATION);definePortal(6,.42,'plaza',plazaElevation,SOURCE_ELEVATION);definePortal(10,.28,'plaza',plazaElevation,SOURCE_ELEVATION);definePortal(10,.73,'plaza',plazaElevation,SOURCE_ELEVATION);definePortal(8,.55,'plaza',plazaElevation,SOURCE_ELEVATION);}
  if(b.id===6){definePortal(0,.30,'Vesey Street',0,SOURCE_LOW);definePortal(9,.35,'West Street',0,SOURCE_LOW);definePortal(6,.40,'plaza',plazaElevation,SOURCE_LOW);}
  const anchor=sitePlanToStructure(profile.gridAnchorPixel);
  for(const p of portals){
    const outline=p.outline,a=outline[p.edgeIndex],q=outline[(p.edgeIndex+1)%outline.length],length=Math.hypot(q[0]-a[0],q[1]-a[1]),t=[(q[0]-a[0])/length,(q[1]-a[1])/length],n=[t[1],-t[0]];
    const bays=Math.max(1,Math.round(length/(b.id===3?4.15:30*FT))),pitch=length/bays,bay=Math.min(bays-1,Math.floor(p.t*bays)),doorWidth=Math.min(2.6,pitch*.38),pixels=portalPixels;
    p.sourceT=p.t;
    p.t=b.id===3?(b.podiumProfile?p.t:(bay+.5)/bays):Math.max(bay*pitch+.8+doorWidth/2,Math.min((bay+1)*pitch-.8-doorWidth/2,p.t*length))/length;
    p.pixel=[pixels[p.edgeIndex][0]+(pixels[(p.edgeIndex+1)%pixels.length][0]-pixels[p.edgeIndex][0])*p.t,pixels[p.edgeIndex][1]+(pixels[(p.edgeIndex+1)%pixels.length][1]-pixels[p.edgeIndex][1])*p.t];p.position=sitePlanToStructure(p.pixel);
    p.glazingRecess=glazingRecess;
    if(b.id===3&&b.groundFootprint){
      // The entrance belongs to the straight stone base; its inclined screen
      // rises back to the separately recessed, bent public-storey facade.
      const wallDistance=point=>{
        const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],distances=[];
        for(let i=0;i<publicPoly.length;i++){
          const a=publicPoly[i],b=publicPoly[(i+1)%publicPoly.length],e=b.map((v,j)=>v-a[j]),delta=a.map((v,j)=>v-point[j]),den=cross(n,e);
          if(Math.abs(den)<1e-9)continue;
          const d=cross(delta,e)/den,s=cross(delta,n)/den;
          if(s>=-1e-8&&s<=1+1e-8)distances.push(d);
        }
        if(!distances.length)throw new Error('Hotel entrance module does not meet its public-storey wall');
        return Math.min(...distances);
      };
      p.screenBackRecess=wallDistance(p.position);
      p.screenBackSamples=Array.from({length:10},(_,i)=>{
        const u=length*p.t-p.width/2+i*p.width/9,point=a.map((v,j)=>v+t[j]*u);
        return wallDistance(point);
      });
    }
    // Register the exterior platform only after the door has been placed in
    // its final glazing bay, so the pavement and actual entrance share a centre.
    const resolved=getEntrySurface?.(p,b);if(Number.isFinite(resolved))p.threshold=resolved;
    p.floor=Math.min(b.floors,Math.max(1,levels.findLastIndex(y=>y<=p.threshold+.01)+1));
    const served=levels.reduce((best,y)=>Math.abs(y-p.threshold)<Math.abs(best-p.threshold)?y:best,base),risers=Math.ceil(Math.abs(served-p.threshold)/.18),centre=[a[0]+t[0]*length*p.t,a[1]+t[1]*length*p.t];
    p.servedElevation=served;p.doorHeight=Math.min(2.18,(levels.find(y=>y>p.threshold+.01)??(p.threshold+2.30))-p.threshold-.08);
    // A real opening above the rising entry stair keeps the ceiling and next
    // storey slab from passing through its access/headroom envelope.
    p.entryHole=risers?rect(-1.60,arcade?glazingRecess-.08:2.00,1.60,(arcade?glazingRecess+2.45:3.45)+risers*.28).map(([x,z])=>[centre[0]+t[0]*x+n[0]*z,centre[1]+t[1]*x+n[1]*z]):null;
  }
  const grid=b.id===3?{anchor:[anchor[0]+1.75*FT,anchor[1]-1.75*FT],anchorPixel:profile.gridAnchorPixel,pitch:26*FT,cantilever:1.75*FT,transverseBays:[(18+9.875/12)*FT,22.5*FT,(18+9.75/12)*FT],evidenceStatus:'FEMA-dimensions-registered-bent-grid-estimate'}:{anchor:[anchor[0]+15*FT,anchor[1]-15*FT],anchorPixel:profile.gridAnchorPixel,pitch:30*FT,cantilever:15*FT,evidenceStatus:b.id===5?'documented-dimensions-scan-registered':'inferred-similar-system'};
  // A suspended finish must sit below the actual representative girder
  // soffit. The former 240 mm offset put W27 webs/flanges through the room
  // ceiling and left lamps in the structural plenum. The 60 mm clearance is
  // estimated fit-out space, not a recovered historic ceiling dimension.
  const ceilingDrop=b.id===3?.30+21*FT/24+.06:.40+27*FT/24+.06;
  const ceilingTops=levels.slice(1).map(y=>y-ceilingDrop);
  return {profile,base,levels,roof:levels.at(-1),groundPoly,publicPoly,typicalPoly,cores,holes:cores.flatMap(c=>c.holes),portals,basementLevels:BASEMENTS.slice(0,profile.basements),grid,arcade:arcadeLayout,ceilingTops,ceilingDrop,ceilingEvidence:'representative-beam-soffit-plus-fit-out-clearance'};
}

/** Emit low buildings through the existing site callbacks; no render backend. */
export function buildLowBuildings({defs,builders,materialIndices:M,layers:L,sitePlanToStructure,siteStructureToWorld,plazaElevation=22*FT,streetLevels={},bearing=29*Math.PI/180,getEntrySurface}={}){
  if(!Array.isArray(defs)||!builders?.add||!builders?.edge||!builders?.fill||!M||!L||!siteStructureToWorld)throw new Error('Low-building builder requires defs, builders, materials, layers and coordinate transforms');
  const {add,edge,fill}=builders,buildings=[],diagnostics=[];
  const mark=(primitive,metadata)=>{if(primitive)Object.assign(primitive,metadata);return primitive;};
  for(const b of defs){
    const layout=getLowBuildingLayout(b,{sitePlanToStructure,plazaElevation,streetLevels,getEntrySurface}),{profile,base,roof,levels,cores,holes,groundPoly,publicPoly,typicalPoly}=layout;
    const poly=b.id===3?publicPoly:b.footprint,extent=bounds(poly),skin=b.id===3?M.hotel:M.dark,glass=b.id===3?M.hotelGlass:M.glass,facadeSource=b.facadeSource||profile.facadeSource;
    const center=[(extent.min[0]+extent.max[0])/2,(extent.min[1]+extent.max[1])/2];
    Object.assign(b,{elevations:levels,roomCeilingElevations:layout.ceilingTops.map(y=>y-.045),roofElevation:roof,height:roof-base,center:siteStructureToWorld(center),entryPlatforms:layout.portals,portalLayout:layout.portals,lowBuildingLayout:layout,...(layout.arcade?{occupiedFloorFootprints:levels.slice(0,-1).map((_,f)=>f<profile.officeStart?layout.arcade.occupiedPoly:poly)}:{})});
    const bb=(x,y,z,sx,sy,sz,m,layer,floor,kind,angle=0,source=b.source,metadata={})=>mark(add(x,y,z,sx,sy,sz,m,layer,b.id,floor,kind,angle,source),metadata);
    const ee=(a,q,y,h,d,m,layer,floor,kind,source=facadeSource,metadata={})=>mark(edge(a,q,y,h,d,m,layer,b.id,floor,kind,source),metadata);
    const shifted=(a,n,d)=>[a[0]+n[0]*d,a[1]+n[1]*d];
    const face=(a,q)=>{const length=Math.hypot(q[0]-a[0],q[1]-a[1]),t=[(q[0]-a[0])/length,(q[1]-a[1])/length],n=[t[1],-t[0]];return {a,q,length,t,n,at:(s,recess=0)=>[a[0]+t[0]*s+n[0]*recess,a[1]+t[1]*s+n[1]*recess]};};
    const verticalSlice=(F,lo,hi,lowA,lowB,topA,topB,depth,recess,material,kind,metadata)=>{
      const bottom=Math.min(lowA,lowB),top=Math.max(topA,topB),width=hi-lo;
      if(top<=bottom+.001||width<=.001)return;
      const point=F.at((lo+hi)/2,recess),cy=(bottom+top)/2,p=bb(point[0],cy,point[1],width,top-bottom,depth,material,L.facade,profile.officeStart,kind,-Math.atan2(F.t[1],F.t[0]),facadeSource,metadata);
      const lowerSlope=(lowB-lowA)/width,upperSlope=(topB-topA)/width;
      const plane=(n,d)=>{const length=Math.hypot(...n);return [...n.map(v=>v/length),d/length];};
      p.shape={type:'convex',planes:[
        [1,0,0,width/2],[-1,0,0,width/2],[0,1,0,(top-bottom)/2],[0,-1,0,(top-bottom)/2],[0,0,1,depth/2],[0,0,-1,depth/2],
        plane([lowerSlope,-1,0],cy-(lowA+lowB)/2),plane([-upperSlope,1,0],(topA+topB)/2-cy),
      ]};
      return p;
    };
    const canopyCell=(original,top,kind,metadata)=>{
      // Closed volume above a sloping underside. Its real planes
      // preserve the deep canopy and corner returns without stretched boxes.
      const points=original.filter((p,i)=>Math.hypot(p[0]-original[(i+original.length-1)%original.length][0],p[2]-original[(i+original.length-1)%original.length][2])>1e-8);if(points.length<3)return;
      const a=points[0],q=points[1],r=points[2],area=(q[0]-a[0])*(r[2]-a[2])-(r[0]-a[0])*(q[2]-a[2]);if(Math.abs(area)<1e-8)return;
      if(points.length===4){const v=q.map((x,j)=>x-a[j]),w=r.map((x,j)=>x-a[j]),n=[v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0]],distance=Math.abs(n.reduce((sum,x,j)=>sum+x*(points[3][j]-a[j]),0))/Math.hypot(...n);if(distance>1e-7){canopyCell([a,q,r],top,kind,metadata);canopyCell([a,r,points[3]],top,kind,metadata);return;}}
      const low=[0,1,2].map(j=>Math.min(...points.map(p=>p[j]))),high=[Math.max(...points.map(p=>p[0])),top,Math.max(...points.map(p=>p[2]))],center=low.map((v,j)=>(v+high[j])/2),half=low.map((v,j)=>(high[j]-v)/2),localZSign=builders.localZSign??-1,planePoints=points.map(p=>[p[0],p[1],p[2]*localZSign]),planeCenter=[center[0],center[1],center[2]*localZSign],all=[...planePoints,...planePoints.map(p=>[p[0],top,p[2]])],centroid=[0,1,2].map(j=>all.reduce((sum,p)=>sum+p[j],0)/all.length),planes=[];
      if(half.some(v=>v<.00001))return;
      const plane=(p0,p1,p2)=>{const v=p1.map((x,j)=>x-p0[j]),w=p2.map((x,j)=>x-p0[j]);let n=[v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0]],length=Math.hypot(...n);if(length<1e-10)return;n=n.map(x=>x/length);let d=n.reduce((sum,x,j)=>sum+x*p0[j],0);if(n.reduce((sum,x,j)=>sum+x*centroid[j],0)>d){n=n.map(x=>-x);d=-d;}planes.push([...n,d-n.reduce((sum,x,j)=>sum+x*planeCenter[j],0)]);};
      plane(...planePoints.slice(0,3));plane(...planePoints.slice(0,3).map(p=>[p[0],top,p[2]]));for(let j=0;j<points.length;j++)plane(planePoints[j],planePoints[(j+1)%points.length],[planePoints[j][0],top,planePoints[j][2]]);
      const p=bb(...center,...half.map(v=>v*2),M.interior,L.facade,profile.officeStart,kind,0,facadeSource,{...metadata,undersideVertices:points});p.shape={type:'convex',planes};return p;
    };
    const beamRuns=[];
    const iBeam=(a,q,y,depth,width,floor,kind,status=layout.grid.evidenceStatus)=>{
      if(Math.hypot(q[0]-a[0],q[1]-a[1])<.08)return;
      const accessHoles=layout.portals.filter(p=>p.entryHole&&y>Math.min(p.threshold,p.servedElevation)-.65&&y<Math.max(p.threshold,p.servedElevation)+.01).map(p=>p.entryHole),segments=kind.includes('opening header')?[[a,q]]:segmentOutsideHoles(a,q,[...holes,...accessHoles]);
      const floorIndex=floor-1,supported=layout.arcade&&floorIndex>0&&floorIndex<profile.officeStart?[layout.arcade.supportedPoly,...(floorIndex===1?layout.arcade.exteriorPavingPolys:[])]:null;
      const clipped=supported?segments.flatMap(([aa,qq])=>segmentInsideRegions(aa,qq,supported)):segments;
      for(const [aa,qq] of clipped)if(Math.hypot(qq[0]-aa[0],qq[1]-aa[1])>.08)beamRuns.push({a:aa,q:qq,y,depth,width,floor,kind,status});
    };
    const flushBeams=()=>{
      // Only contiguous collinear members with identical physical section,
      // floor, kind and evidence can become one OBB. Openings remain gaps.
      const groups=new Map(),fixed=n=>n.toFixed(9);
      for(const beam of beamRuns){const dx=beam.q[0]-beam.a[0],dz=beam.q[1]-beam.a[1],len=Math.hypot(dx,dz),sign=dx<-1e-9||(Math.abs(dx)<1e-9&&dz<0)?-1:1,t=[dx/len*sign,dz/len*sign],n=[-t[1],t[0]],offset=n[0]*beam.a[0]+n[1]*beam.a[1],start=t[0]*beam.a[0]+t[1]*beam.a[1],end=t[0]*beam.q[0]+t[1]*beam.q[1],key=JSON.stringify([beam.kind,beam.status,beam.floor,beam.depth,beam.width,fixed(beam.y),...t.map(fixed),fixed(offset)]);if(!groups.has(key))groups.set(key,{beam,t,n,offset,spans:[]});groups.get(key).spans.push({start:Math.min(start,end),end:Math.max(start,end),members:1});}
      for(const {beam,t,n,offset,spans} of groups.values()){
        spans.sort((a,b)=>a.start-b.start);const merged=[];
        for(const span of spans){const last=merged.at(-1);if(last&&span.start<=last.end+1e-7){last.end=Math.max(last.end,span.end);last.members+=span.members;}else merged.push({...span});}
        for(const span of merged){const a=[t[0]*span.start+n[0]*offset,t[1]*span.start+n[1]*offset],q=[t[0]*span.end+n[0]*offset,t[1]*span.end+n[1]*offset],info={evidenceStatus:beam.status,memberDepth:beam.depth,mergedMembers:span.members},source=b.id===3?SOURCE_HOTEL:SOURCE_LOW;
          ee(a,q,beam.y,beam.depth-.036,.014,M.steel,L.steel,beam.floor,`${beam.kind} web`,source,info);
          for(const sign of [-1,1])ee(a,q,beam.y+sign*(beam.depth/2-.009),.018,beam.width,M.steel,L.steel,beam.floor,`${beam.kind} flange`,source,info);
        }
      }
    };
    // One floor/ceiling aperture set is shared with actual stairs and lifts.
    for(let f=0;f<levels.length-1;f++){
      const occupiedPoly=b.id===3&&f===0?groundPoly:layout.arcade&&f<profile.officeStart?layout.arcade.occupiedPoly:poly,floorPoly=b.id===3?(f===0?groundPoly:f>=3?typicalPoly:publicPoly):layout.arcade&&f>0&&f<profile.officeStart?layout.arcade.supportedPoly:poly;
      const entryHoles=layout.portals.filter(p=>p.entryHole&&levels[f]>Math.min(p.threshold,p.servedElevation)+.05&&levels[f]<=Math.max(p.threshold,p.servedElevation)+.01).map(p=>p.entryHole),ceilingEntryHoles=layout.portals.filter(p=>p.entryHole&&levels[f+1]>.05+Math.min(p.threshold,p.servedElevation)&&levels[f+1]<=Math.max(p.threshold,p.servedElevation)+.01).map(p=>p.entryHole);
      fill(floorPoly,levels[f],.14,M.concrete,L.floors,b.id,f+1,b.id===3?'hotel composite floor':'low building composite floor',[...holes,...entryHoles],b.id===3?SOURCE_HOTEL:b.source);
      fill(b.id===3&&f>=3?typicalPoly:occupiedPoly,layout.ceilingTops[f],.045,M.interior,L.interior,b.id,f+1,'low building suspended ceiling finish',[...holes,...ceilingEntryHoles],b.id===3?SOURCE_HOTEL:b.source);
      if(b.id!==3&&f<profile.officeStart)continue;
      for(let i=0;i<floorPoly.length;i++){
        const F=face(floorPoly[i],floorPoly[(i+1)%floorPoly.length]),bottom=levels[f],top=levels[f+1],h=top-bottom;
        if(b.id===3){
          if(f<3){buildHotelPublicFacade({F,portal:f===0?layout.portals.find(p=>p.edgeIndex===i):null,vehicleAccess:b.vehicleAccess,levels,f,ee,bb,M,L,edgeIndex:i});continue;}
          const guest=f>=3&&f<=20,crown=f===21,pitch=guest?2.48:crown?2.48:4.15,n=Math.max(1,Math.round(F.length/pitch));
          const band=guest?.30:crown?Math.min(2.20,h*.24):.36;
          ee(F.a,F.q,top-band/2,band,.16,skin,L.facade,f+1,guest?'hotel pale guestroom spandrel':crown?'hotel crown pale parapet panel':'hotel public-level edge panel',facadeSource);
          for(let k=0;k<n;k++){
            const left=F.length*(k+.012)/n,right=F.length*(k+.988)/n,aa=F.at(left,.20),qq=F.at(right,.20);
            const glazedHeight=crown?Math.min(2.45,h-band-.03):Math.max(.25,h-band-.03);
            const entry=f===0?layout.portals.find(p=>p.edgeIndex===i):null,doorLo=entry?entry.t*F.length-1.30:0,doorHi=entry?entry.t*F.length+1.30:0,windowInfo={facadeZone:guest?'guestroom':crown?'health-club':'public'};
            if(entry&&right>doorLo&&left<doorHi){
              for(const [lo,hi] of [[left,Math.min(right,doorLo)],[Math.max(left,doorHi),right]])if(hi>lo+.01)ee(F.at(lo,.20),F.at(hi,.20),bottom+glazedHeight/2,glazedHeight,.022,guest?(M.hotelMirror??glass):glass,L.facade,f+1,'low building recessed window',facadeSource,windowInfo);
              if(glazedHeight>entry.doorHeight)ee(F.at(Math.max(left,doorLo),.20),F.at(Math.min(right,doorHi),.20),bottom+(entry.doorHeight+glazedHeight)/2,glazedHeight-entry.doorHeight,.022,glass,L.facade,f+1,'hotel entrance transom',facadeSource,windowInfo);
            }else ee(aa,qq,bottom+glazedHeight/2,glazedHeight,.022,guest?(M.hotelMirror??glass):glass,L.facade,f+1,'low building recessed window',facadeSource,windowInfo);
            const p=F.at(F.length*(k+1)/n);bb(p[0],bottom+h/2,p[1],guest?.045:.12,h,.08,skin,L.facade,f+1,'hotel pale window pier',-Math.atan2(F.t[1],F.t[0]),facadeSource);
            if(guest)ee(F.at(left),F.at(right),bottom+.06,.12,.07,skin,L.facade,f+1,'hotel projecting sill',facadeSource);
            if(crown){
              // The residual height to the approximate parapet includes the
              // health club and service/roof enclosure. It is not a 9 m high
              // office window. Later photographs show pale panels and a dark
              // horizontal slot above the guestroom facade; dimensions vary.
              const start=bottom+glazedHeight,vent0=start+.50,vent1=vent0+.32,end=top-band;
              ee(F.at(left),F.at(right),(start+vent0)/2,vent0-start,.16,skin,L.facade,f+1,'hotel crown pale service panel',facadeSource,{evidenceStatus:'photographic-zone-height-estimate'});
              if(end>vent1)ee(F.at(left),F.at(right),(vent1+end)/2,end-vent1,.16,skin,L.facade,f+1,'hotel crown pale service panel',facadeSource,{evidenceStatus:'photographic-zone-height-estimate'});
              ee(aa,qq,(vent0+vent1)/2,vent1-vent0,.022,glass,L.facade,f+1,'hotel crown recessed ventilation slot',facadeSource);
              for(let r=1;r<3;r++)ee(aa,qq,bottom+glazedHeight*r/3,.08,.12,skin,L.facade,f+1,'hotel crown horizontal framing',facadeSource);
            }
          }
        }else{
          // A continuous opaque curtain-wall return encloses the real slab,
          // ceiling and girder ends at the structural outer outline. The former
          // inward finish/backing left their pale edges ahead of the facade.
          // Preserve the full cantilever and member sections; this estimated
          // skin wraps them, including 20 mm top/bottom returns. Exact mitered
          // prisms also close convex and reentrant corners without box gaps.
          const band=b.id===6?.30:.24;
          const coverOuter=insetOutline(floorPoly,-.02),coverInner=insetOutline(floorPoly,.31),jointOuter=insetOutline(floorPoly,-.035),ceilingUnderside=layout.ceilingTops[f]-.045,coverBottom=ceilingUnderside-.02,coverTop=top+.02;
          const envelopeCell=(outer,inner,bottom,upper,kind,metadata)=>{
            const next=(i+1)%outer.length,footprint=[outer[i],outer[next],inner[next],inner[i]],record=convexPrism(footprint,upper,upper-bottom),p=bb(...record.center,...record.half.map(v=>v*2),skin,L.facade,f+1,kind,0,facadeSource,{edgeIndex:i,enclosureFootprint:footprint,...metadata});
            p.shape=builders.localZSign===1?{...record.shape,planes:record.shape.planes.map(([x,y,z,d])=>[x,y,-z,d])}:record.shape;
          };
          // Retain the .24/.30 m outside joint height, with its return now at
          // the actual outer cover rather than buried behind exposed edges.
          envelopeCell(jointOuter,coverOuter,coverTop-band,coverTop,'low building recessed spandrel panel',{evidenceStatus:'estimated-curtain-wall-edge-enclosure'});
          envelopeCell(coverOuter,coverInner,coverBottom,coverTop,'low building office spandrel edge enclosure',{glazingRecess:.24,outerCoverOffset:-.02,innerReturnOffset:.31,ceilingUnderside,lowerReturnElevation:coverBottom,upperReturnElevation:coverTop,evidenceStatus:'estimated-curtain-wall-edge-enclosure'});
          const n=Math.max(1,Math.round(F.length/profile.finPitch)),pitch=F.length/n;
          // The window panes meet under the fin/mullion sightlines. Their
          // identical coplanar glazing can be represented by one analytic
          // pane, retaining all physical fins and storey joints in front.
          ee(F.at(.055,.24),F.at(F.length-.055,.24),bottom+(h-band)/2,h-band,.019,glass,L.facade,f+1,'low building recessed window',facadeSource,{facadeProfile:profile.facade,mergedMembers:n});
          for(let k=0;k<=n;k++){
            const p=F.at(k*pitch,-profile.finDepth*.28);
            bb(p[0],bottom+h/2,p[1],profile.finWidth,h,profile.finDepth,skin,L.facade,f+1,b.id===6?'customs projecting vertical fin':'plaza building continuous vertical fin',-Math.atan2(F.t[1],F.t[0]),facadeSource,{facadeProfile:profile.facade,dimensionStatus:b.id===5?'drawing-proportions':'photographic-estimate'});
          }
          if(f===8&&b.id===5){
            // A-E102–106: the top storey has vertical aluminum louver fields,
            // interrupted by glazed/blanked panels; do not turn it into solid.
            for(let k=0;k<n;k++)if(k%9<3){const p=F.at((k+.5)*pitch,.075);bb(p[0],bottom+h/2,p[1],.07,h-.28,.30,skin,L.facade,f+1,'WTC 5 roof-storey vertical louver',-Math.atan2(F.t[1],F.t[0]),facadeSource);}
            ee(F.a,F.q,bottom+.18,.36,.24,skin,L.facade,f+1,'WTC 5 ninth-floor precast transition',facadeSource);
          }
        }
      }
    }

    if(b.id!==3){
      const arcade=b.id===4||b.id===5,deep=!!layout.arcade,officeY=levels[profile.officeStart],spring=b.id===6?officeY-1.4:levels[2],arcRise=Math.max(.7,officeY-spring-.60);
      for(let i=0;i<poly.length;i++){
        const F=face(poly[i],poly[(i+1)%poly.length]),pixelA=b.polygon[i],pixelQ=b.polygon[(i+1)%poly.length];
        const G=deep?face(layout.arcade.occupiedPoly[i],layout.arcade.occupiedPoly[(i+1)%poly.length]):F,C=deep?face(layout.arcade.columnPoly[i],layout.arcade.columnPoly[(i+1)%poly.length]):F;
        const streetNorth=pixelA[1]<=350&&pixelQ[1]<=350,streetEast=pixelA[0]>=1478&&pixelQ[0]>=1478;
        const localPortals=layout.portals.filter(p=>p.edgeIndex===i);
        const threshold=localPortals[0]?.threshold??(streetNorth?(b.id===5?10*FT:0):streetEast?(streetLevels.church??4.55):plazaElevation);
        // An entry threshold chooses the door sill, not the entire facade
        // bottom. The enclosed concourse storey continues down to EL 310 on
        // every face, including bays hidden behind the raised plaza deck.
        // The recessed column run chooses the bay count. Dividing the longer
        // outer cornice length first would compress the covered pier pitch.
        // Scan registration/corner returns still do not fix exact coordinates.
        const lowerY=base,recess=0,n=Math.max(1,Math.round(C.length/(30*FT))),pitch=F.length/n,glassPitch=G.length/n;
        const streetSouth=b.id===4&&pixelA[1]>=968&&pixelQ[1]>=968;
        const streetWest=b.id===6&&pixelA[0]<=773&&pixelQ[0]<=773;
        if(deep&&!streetNorth&&!streetEast&&!streetSouth&&!streetWest){const paving=[F.a,F.q,layout.arcade.supportedPoly[(i+1)%poly.length],layout.arcade.supportedPoly[i]];layout.arcade.exteriorPavingPolys.push(paving);fill(paving,levels[1],.14,M.concrete,L.floors,b.id,2,arcade?'plaza building covered arcade paving':'customs covered arcade paving',[],facadeSource);}
        ee(F.a,F.q,officeY-.22,.44,.30,skin,L.facade,profile.officeStart+1,arcade?'plaza building arcade cornice':'customs lower-facade cornice',facadeSource);
        for(let k=0;k<n;k++){
          const left=k*pitch,right=(k+1)*pitch,mid=(left+right)/2,glassLeft=k*glassPitch,glassRight=(k+1)*glassPitch;
          const portalPosition=p=>(p.position[0]-G.a[0])*G.t[0]+(p.position[1]-G.a[1])*G.t[1];
          const portal=localPortals.find(p=>Math.min(n-1,Math.max(0,Math.floor(portalPosition(p)/glassPitch)))===k);
          const doorWidth=portal?Math.min(2.6,pitch*.38):0,doorCenter=portal?portalPosition(portal):0;
          // Divide glazing at both door and floor boundaries. An opening at
          // 6.7056 m never receives a glass card spanning down to concourse.
          const cuts=[lowerY,...levels,...(portal?[portal.threshold,portal.threshold+portal.doorHeight]:[]),spring].filter(y=>y>=lowerY&&y<=spring).sort((a,b)=>a-b).filter((y,index,list)=>!index||y-list[index-1]>.001);
          for(let r=0;r<cuts.length-1;r++){
            const y0=cuts[r],y1=cuts[r+1],doorHere=portal&&y0<portal.threshold+portal.doorHeight&&y1>portal.threshold;
            const spans=doorHere?[[glassLeft,doorCenter-doorWidth/2],[doorCenter+doorWidth/2,glassRight]]:[[glassLeft,glassRight]];
            for(const [lo,hi] of spans)if(hi>lo+.05)ee(G.at(lo,recess),G.at(hi,recess),(y0+y1)/2,y1-y0,.024,glass,L.facade,Math.max(1,levels.findIndex(y=>y>=y1-.01)),'low building recessed window',facadeSource,{facadeZone:'public-arcade',glazingSetback:layout.arcade.glazingSetback});
            if(doorHere&&y1>portal.threshold+portal.doorHeight)ee(G.at(doorCenter-doorWidth/2,recess),G.at(doorCenter+doorWidth/2,recess),(portal.threshold+portal.doorHeight+y1)/2,y1-portal.threshold-portal.doorHeight,.024,glass,L.facade,portal.floor,'arcade entrance transom',facadeSource);
          }
          for(let m=1;m<4;m++){const p=G.at(glassLeft+glassPitch*m/4,recess);if(portal&&Math.abs(glassLeft+glassPitch*m/4-doorCenter)<doorWidth/2)continue;bb(p[0],(lowerY+spring)/2,p[1],.055,spring-lowerY,.075,skin,L.facade,2,'arcade glazing vertical frame',-Math.atan2(F.t[1],F.t[0]),facadeSource);}
          if(deep){
            const steps=b.id===6?6:18,profileHeight=b.id===6?t=>2*Math.min(t,1-t):arcadeForkHeight;
            for(let s=0;s<steps;s++){
              const ta=s/steps,tb=(s+1)/steps,ya=spring+arcRise*profileHeight(ta),yb=spring+arcRise*profileHeight(tb),fa=(left+pitch*ta)/F.length,fb=(left+pitch*tb)/F.length,frontA=F.at(F.length*fa),frontB=F.at(F.length*fb),columnA=C.at(C.length*fa),columnB=C.at(C.length*fb),ga=G.at(G.length*fa),gb=G.at(G.length*fb),ua=2*Math.min(ta,1-ta),ub=2*Math.min(tb,1-tb),a=frontA.map((v,j)=>v*ua+columnA[j]*(1-ua)),q=frontB.map((v,j)=>v*ub+columnB[j]*(1-ub)),planLength=Math.hypot(q[0]-a[0],q[1]-a[1]),len=Math.hypot(planLength,yb-ya),x=[(q[0]-a[0])/len,(yb-ya)/len,(q[1]-a[1])/len],z=[-(q[1]-a[1])/planLength,0,(q[0]-a[0])/planLength],y=[-x[1]*x[0]*len/planLength,planLength/len,-x[1]*x[2]*len/planLength];
              const slice={edgeIndex:i,bay:k,segment:s,arcadeBottom:spring,arcadeRise:arcRise,bayPitch:pitch,curveEnds:[ya,yb],curveParameters:[ta,tb],ribEndpoints:[[a[0],ya,a[1]],[q[0],yb,q[1]]],columnSetback:layout.arcade.columnSetback,glazingSetback:layout.arcade.glazingSetback,arcadeProfile:b.id===6?'short-straight-flared-transition':'pointed-fork-with-rounded-root',soffitGeometry:'swept-umbrella-analytic-convex',depthEvidence:layout.arcade.depthEvidence,profileReference:b.id===4?'wtc4-liberty-arcade-2001.jpg':b.id===5?'wtc5-plaza-arcade-pre-2001.jpg':'voa-wtc6-pre-911-inspection-only',evidenceStatus:'photographic-profile-estimate'};
              mark(add((a[0]+q[0])/2,(ya+yb)/2,(a[1]+q[1])/2,len*1.015,.24,.45,skin,L.facade,b.id,profile.officeStart,arcade?'plaza building curved arcade arch':'customs short flared canopy support',0,facadeSource,axesQuaternion(x,y,z)),{...slice,facadeProfile:profile.facade});
              // The two surfaces fan out from the recessed column head to
              // the outer cornice. Triangulating their real depth gives an
              // opaque curved underside, not an arch pasted onto a wall.
              const outerY=spring+arcRise+.08,outerA=[frontA[0],outerY,frontA[1]],outerB=[frontB[0],outerY,frontB[1]],ribA=[a[0],ya+.08,a[1]],ribB=[q[0],yb+.08,q[1]],glassA=[ga[0],ya+.08,ga[1]],glassB=[gb[0],yb+.08,gb[1]],top=officeY-.13;
              canopyCell([outerA,outerB,ribB,ribA],top,arcade?'plaza building curved arcade soffit':'customs deep canopy soffit',slice);
              canopyCell([ribA,ribB,glassB,glassA],top,arcade?'plaza building arcade spandrel enclosure':'customs canopy rear enclosure',slice);
              verticalSlice(G,glassLeft+glassPitch*ta,glassLeft+glassPitch*tb,spring,spring,ya+.08,yb+.08,.019,0,glass,arcade?'plaza building curved arcade glazing':'customs recessed upper transition glazing',slice);
            }
          }
          for(const s of [left,right]){const p=C.at(s/F.length*C.length);bb(p[0],(lowerY+spring)/2,p[1],arcade?.40:.24,spring-lowerY,.42,skin,L.facade,2,arcade?'plaza building arcade pier cover':'customs public-level pier',-Math.atan2(F.t[1],F.t[0]),facadeSource,{edgeIndex:i,bay:k,columnSetback:layout.arcade.columnSetback,pierPitch:C.length/n,depthEvidence:layout.arcade.depthEvidence,evidenceStatus:'photographic-grid-registration-estimate'});}
          if(portal){
            const doorwayY=portal.threshold+portal.doorHeight/2,doorA=G.at(doorCenter-doorWidth/2,recess),doorB=G.at(doorCenter+doorWidth/2,recess);
            ee(doorA,doorB,doorwayY,portal.doorHeight,.025,glass,L.facade,portal.floor,'low building entrance glazing',portal.source,{entryThreshold:portal.threshold,evidenceStatus:portal.evidenceStatus});
            for(const s of [-1,0,1]){const p=G.at(doorCenter+s*doorWidth/2,recess);bb(p[0],doorwayY,p[1],.065,portal.doorHeight,.09,skin,L.facade,portal.floor,'low building entrance door frame',-Math.atan2(F.t[1],F.t[0]),portal.source);}
            // Internal entry landing and a short run connect non-storey street
            // thresholds to the served concourse/plaza. Dimensions are fit-out.
            const p=G.at(doorCenter,recess+1.15),served=levels.reduce((best,y)=>Math.abs(y-portal.threshold)<Math.abs(best-portal.threshold)?y:best,base);
            bb(p[0],portal.threshold-.07,p[1],doorWidth+.45,.14,2.2,M.concrete,L.floors,portal.floor,'low building street-entry landing',-Math.atan2(F.t[1],F.t[0]),portal.source);
            const risers=Math.ceil(Math.abs(served-portal.threshold)/.18);
            for(let s=0;s<risers;s++){const at=G.at(doorCenter,recess+2.25+(s+.5)*.28),y=portal.threshold+(served-portal.threshold)*(s+1)/risers;bb(at[0],y-.06,at[1],doorWidth,.12,.29,M.concrete,L.stairs,portal.floor,'low building street-entry stair tread',-Math.atan2(F.t[1],F.t[0]),portal.source);}
          }
        }
      }
    }
    if(b.id===3)for(const portal of layout.portals){
      const F=face(portal.outline[portal.edgeIndex],portal.outline[(portal.edgeIndex+1)%portal.outline.length]);
      const slopingPanel=(lo,hi,n0,n1,y0,y1,depth,m,kind,source)=>{
        const delta=[F.n[0]*(n1-n0),y1-y0,F.n[1]*(n1-n0)],length=Math.hypot(...delta),x=[F.t[0],0,F.t[1]],y=delta.map(v=>v/length),z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],p=F.at((lo+hi)/2,(n0+n1)/2);
        mark(add(p[0],(y0+y1)/2,p[1],hi-lo,length,depth,m,L.facade,b.id,1,kind,0,source,axesQuaternion(x,y,z)),{evidenceStatus:'photographic-finish-estimate'});
      };
      const rod=(a,q,w,d,m,kind,source)=>{
        const delta=q.map((v,i)=>v-a[i]),length=Math.hypot(...delta),y=delta.map(v=>v/length),ref=Math.abs(y[1])>.95?[1,0,0]:[0,1,0],xx=[ref[1]*y[2]-ref[2]*y[1],ref[2]*y[0]-ref[0]*y[2],ref[0]*y[1]-ref[1]*y[0]],norm=Math.hypot(...xx),x=xx.map(v=>v/norm),z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
        add(...a.map((v,i)=>(v+q[i])/2),w,length,d,m,L.facade,b.id,1,kind,0,source,axesQuaternion(x,y,z));
      };
      buildHotelEntrance({F,portal,levels,bb,ee,slopingPanel,rod,M,L,localZSign:builders.localZSign??-1});
    }
    if(b.id===3&&b.groundFootprint){
      fill(groundPoly,levels[1]+.025,.12,M.roof,L.roof,b.id,1,'hotel independent stone-base roof terrace',[publicPoly],b.podiumProfile.source);
      fill(publicPoly,levels[3]+.025,.12,M.roof,L.roof,b.id,3,'hotel ballroom podium roof',[typicalPoly],b.podiumProfile.source);
      for(let i=0;i<groundPoly.length;i++)ee(groundPoly[i],groundPoly[(i+1)%groundPoly.length],levels[1]-.08,.18,.26,M.hotel,L.facade,1,'hotel independent ground-base coping',b.podiumProfile.source);
    }

    // Steel is a hollow-section assembly with real web/flanges, not opaque
    // facade walls. Beam cuts and opening headers respect the circulation.
    if(b.id!==3){
      const {anchor,pitch,cantilever,evidenceStatus}=layout.grid,gridPoints=[];
      for(let ix=Math.floor((extent.min[0]-anchor[0])/pitch);anchor[0]+ix*pitch<extent.max[0];ix++)for(let iz=Math.floor((extent.min[1]-anchor[1])/pitch);anchor[1]+iz*pitch<extent.max[1];iz++){
        const p=[anchor[0]+ix*pitch,anchor[1]+iz*pitch];
        if(!inside(p,poly)||outlineDistance(p,poly)<cantilever-.70||cores.some(c=>inside(p,c.footprint)))continue;
        gridPoints.push(p);
        for(let f=0;f<levels.length-1;f++){
          const y=(levels[f]+levels[f+1])/2,h=levels[f+1]-levels[f];
          bb(p[0],y,p[1],.020,h,.32,M.steel,L.steel,f+1,'low building wide-flange column web',0,SOURCE_LOW,{evidenceStatus,gridAnchorPixel:layout.grid.anchorPixel});
          for(const s of [-1,1])bb(p[0]+s*.15,y,p[1],.020,h,.34,M.steel,L.steel,f+1,'low building wide-flange column flange',0,SOURCE_LOW,{evidenceStatus});
        }
        for(let f=0;f<layout.basementLevels.length;f++){
          const bottom=layout.basementLevels[f],top=(f?layout.basementLevels[f-1]:base)-.14,y=(bottom+top)/2,h=top-bottom;
          bb(p[0],y,p[1],.020,h,.32,M.steel,L.basement,-f-1,'low building basement column web',0,SOURCE_LOW,{evidenceStatus});
          for(const s of [-1,1])bb(p[0]+s*.15,y,p[1],.020,h,.34,M.steel,L.basement,-f-1,'low building basement column flange',0,SOURCE_LOW,{evidenceStatus});
        }
      }
      for(let f=1;f<levels.length;f++)for(const axis of [0,1]){
        const rows=[...new Set(gridPoints.map(p=>p[1-axis]))].sort((a,b)=>a-b),floor=Math.min(b.floors,f+1),y=levels[f]-.40;
        const supportedPolys=layout.arcade&&f<profile.officeStart?[layout.arcade.supportedPoly,...(f===1?layout.arcade.exteriorPavingPolys:[])]:[poly];
        for(const row of rows){const spans=supportedPolys.flatMap(p=>intervals(p,row,axis===1)).sort((a,q)=>a[0]-q[0]),joined=[];for(const [lo,hi] of spans){const last=joined.at(-1);if(last&&lo<=last[1]+1e-7)last[1]=Math.max(last[1],hi);else joined.push([lo,hi]);}
        for(const originalSpan of joined){
          const cuts=holes.flatMap(h=>intervals(h,row,axis===1)).map(([l,r])=>[l-.15,r+.15]),spans=subtract([originalSpan],cuts),columns=gridPoints.filter(p=>Math.abs(p[1-axis]-row)<1e-6&&p[axis]>originalSpan[0]&&p[axis]<originalSpan[1]).map(p=>p[axis]).sort((a,b)=>a-b);
          for(const [lo,hi] of spans){
            const breaks=[lo,...columns.filter(c=>c>lo+.02&&c<hi-.02),hi];
            for(let k=0;k<breaks.length-1;k++){
              const a=breaks[k],q=breaks[k+1],p0=axis?[row,a]:[a,row],p1=axis?[row,q]:[q,row],outer=k===0||k===breaks.length-2||outlineDistance(axis?[row,(a+q)/2]:[(a+q)/2,row],poly)<pitch*1.6;
              if(outer){for(const side of [-1,1]){const aa=p0.map((v,j)=>v+(j===1-axis?side*.15:0)),qq=p1.map((v,j)=>v+(j===1-axis?side*.15:0));iBeam(aa,qq,y,27*FT/12,.24,floor,'low building paired W27 perimeter beam',evidenceStatus);}}
              else if(b.id===5&&axis===0&&floor>=4&&floor<=8&&q-a>2.5){
                const stub=4*FT;
                iBeam(p0,[a+stub,row],y,24*FT/12,.22,floor,'WTC 5 column-tree welded stub');
                iBeam([q-stub,row],p1,y,24*FT/12,.22,floor,'WTC 5 column-tree welded stub');
                iBeam([a+stub,row],[q-stub,row],y,18*FT/12,.19,floor,'WTC 5 column-tree simply connected centre beam');
                for(const x of [a+stub,q-stub])bb(x,y,row+.026,.015,.24,.09,M.steel,L.steel,floor,'WTC 5 column-tree shear tab',0,SOURCE_LOW,{evidenceStatus});
              }else iBeam(p0,p1,y,16*FT/12,.18,floor,b.id===5&&floor>=9?'WTC 5 conventional upper-floor beam':'low building W16 floor beam',evidenceStatus);
            }
          }
        }}
      }
    }else{
      // FEMA: four longitudinal column lines, three unequal transverse bays,
      // roughly twelve 26 ft longitudinal bays; follow the bent centreline.
      const start=sitePlanToStructure([945,713]),bend=sitePlanToStructure([945,805]),end=sitePlanToStructure([1010,989]),legs=[[start,bend],[bend,end]],cross=[-(18+9.875/12+22.5+18+9.75/12)*FT/2,0];
      const widths=[(18+9.875/12)*FT,22.5*FT,(18+9.75/12)*FT],offsets=[cross[0]];for(const w of widths)offsets.push(offsets.at(-1)+w);
      for(const [a,q] of legs){const F=face(a,q),rows=Math.max(1,Math.round(F.length/(26*FT))),columns=[];
        for(let r=0;r<=rows;r++){const center=F.at(F.length*r/rows),line=offsets.map(o=>[center[0]-F.n[0]*o,center[1]-F.n[1]*o]);columns.push(line);
          for(const p of line)if(inside(p,typicalPoly)&&!cores.some(c=>inside(p,c.footprint)))for(let f=0;f<levels.length-1;f++){const y=(levels[f]+levels[f+1])/2,h=levels[f+1]-levels[f];bb(p[0],y,p[1],.020,h,.36,M.steel,L.steel,f+1,'hotel W14 column web',-Math.atan2(F.t[1],F.t[0]),SOURCE_HOTEL);for(const s of [-1,1])bb(p[0]+F.t[0]*s*.17,y,p[1]+F.t[1]*s*.17,.02,h,.38,M.steel,L.steel,f+1,'hotel W14 column flange',-Math.atan2(F.t[1],F.t[0]),SOURCE_HOTEL);}
          for(const p of line)if(inside(p,publicPoly)&&!cores.some(c=>inside(p,c.footprint)))for(let f=0;f<layout.basementLevels.length;f++){
            const bottom=layout.basementLevels[f],top=(f?layout.basementLevels[f-1]:base)-.14,y=(bottom+top)/2,h=top-bottom,angle=-Math.atan2(F.t[1],F.t[0]);
            bb(p[0],y,p[1],.020,h,.36,M.steel,L.basement,-f-1,'hotel basement column web',angle,SOURCE_HOTEL,{evidenceStatus:'representative continuation of registered hotel grid'});
            for(const s of [-1,1])bb(p[0]+F.t[0]*s*.17,y,p[1]+F.t[1]*s*.17,.02,h,.38,M.steel,L.basement,-f-1,'hotel basement column flange',angle,SOURCE_HOTEL,{evidenceStatus:'representative continuation of registered hotel grid'});
          }
        }
        for(let f=1;f<levels.length;f++)for(let r=0;r<columns.length;r++)for(let k=0;k<4;k++){
          const p=columns[r][k];if(!inside(p,typicalPoly))continue;
          if(r<columns.length-1){const qq=columns[r+1][k],mid=[(p[0]+qq[0])/2,(p[1]+qq[1])/2];if(inside(qq,typicalPoly)&&!holes.some(h=>inside(mid,h)))iBeam(p,qq,levels[f]-.30,(k===0||k===3?21:16)*FT/12,.20,Math.min(b.floors,f+1),'hotel longitudinal girder','FEMA-bent-grid-proportions');}
          if(k<3){const qq=columns[r][k+1],mid=[(p[0]+qq[0])/2,(p[1]+qq[1])/2];if(inside(qq,typicalPoly)&&!holes.some(h=>inside(mid,h)))iBeam(p,qq,levels[f]-.31,16*FT/12,.18,Math.min(b.floors,f+1),'hotel transverse floor beam','FEMA-bent-grid-proportions');}
        }
      }
    }
    for(let f=1;f<levels.length;f++)for(const hole of holes)for(let i=0;i<hole.length;i++)iBeam(hole[i],hole[(i+1)%hole.length],levels[f]-.30,16*FT/12,.18,Math.min(b.floors,f+1),'low building schematic opening header','schematic-opening-framing');
    flushBeams();

    // Every core wall is emitted by storey. Doors share the landing elevation;
    // the same stair footprint was already removed from the structural floors.
    for(const core of cores){
      const cb=(x,y,z,sx,sy,sz,m,layer,floor,kind)=>{
        const p=core.local(x,z),metadata={evidenceStatus:core.status,coreIndex:core.index};
        // Schematic core walls formerly ended coplanar with the roof,
        // leaving pale wall-top outlines visible through the weather finish.
        // Terminate all core/landing members 20 mm below its .18 m underside.
        if(y+sy/2>roof-.20){const bottom=y-sy/2,top=roof-.20;if(top<=bottom)return;metadata[b.id===3?'hotelRoofClip':'lowBuildingRoofClip']={originalCenterY:y,originalHeight:sy,top};sy=top-bottom;y=(top+bottom)/2;}
        return bb(p[0],y,p[1],sx,sy,sz,m,layer,floor,kind,core.angle,b.id===3?SOURCE_HOTEL:b.source,metadata);
      };
      const served=[...layout.basementLevels].reverse().concat(levels);
      for(let f=0;f<served.length-1;f++){
        const bottom=served[f],top=served[f+1],h=top-bottom,floor=bottom<base?-(layout.basementLevels.indexOf(bottom)+1):levels.indexOf(bottom)+1;
        for(const sign of [-1,1])cb(sign*3.6,bottom+h/2,-.35,.20,h,8.1,M.concrete,L.core,floor,'low building service core side wall');
        cb(0,bottom+h/2,3.6,7.2,h,.20,M.concrete,L.core,floor,'low building service core rear wall');
        for(const sign of [-1,1])cb(sign*2.45,bottom+h/2,-4.3,2.5,h,.20,M.concrete,L.core,floor,'low building core doorway pier');
        const doorHeight=Math.min(2.15,h-.25);cb(0,bottom+doorHeight+(h-doorHeight)/2,-4.3,2.4,h-doorHeight,.20,M.concrete,L.core,floor,'low building core doorway header');
        for(const sx of core.liftCenters){
          for(const sign of [-1,1])cb(sx+sign*.96,bottom+h/2,1.56,.12,h,1.98,M.interior,L.elevators,floor,'low building lift shaft side wall');
          cb(sx,bottom+h/2,2.48,1.92,h,.12,M.interior,L.elevators,floor,'low building lift shaft rear wall');
          for(const sign of [-1,1])cb(sx+sign*.72,bottom+h/2,.64,.48,h,.12,M.interior,L.elevators,floor,'low building lift doorway jamb');
          cb(sx,bottom+doorHeight+(h-doorHeight)/2,.64,.96,h-doorHeight,.12,M.interior,L.elevators,floor,'low building lift doorway header');
          cb(sx,bottom+doorHeight/2,.69,.91,doorHeight,.035,M.dark,L.elevators,floor,'low building lift landing doors');
        }
        const x=core.stairX;
        for(const sign of [-1,1])cb(x+sign*1.01,bottom+h/2,-.70,.12,h,4.84,M.interior,L.stairs,floor,'low building enclosed stair side wall');
        cb(x,bottom+h/2,1.67,2.02,h,.12,M.interior,L.stairs,floor,'low building enclosed stair rear wall');
        cb(x,bottom-.06,-2.65,1.90,.12,.92,M.concrete,L.stairs,floor,'low building stair floor landing');
        const n=Math.max(7,Math.ceil(h/.18/2)),run=2.66/n;
        for(let k=0;k<n;k++)for(const sign of [-1,1]){const t=(k+.5)/n,z=sign<0?-2.19+2.66*t:.47-2.66*t,y=bottom+h*(sign<0?(k+1)/(2*n):.5+(k+1)/(2*n));cb(x+sign*.46,y-.05,z,.86,.10,run+.014,M.concrete,L.stairs,floor,'low building stair tread');}
        cb(x,bottom+h/2-.06,1.035,1.90,.12,1.13,M.concrete,L.stairs,floor,'low building stair intermediate landing');
      }
      cb(core.stairX,roof-.06,-2.65,1.90,.12,.92,M.concrete,L.stairs,b.floors,'low building stair roof landing');
    }

    // The schematic lift/stair apertures describe occupied floors, not open
    // shafts through the exterior weather roof. No roof-access survey
    // supports such openings; keep the membrane closed above them.
    fill(typicalPoly,roof,.18,M.roof,L.roof,b.id,b.floors,'low building roof membrane',[],b.id===3?SOURCE_HOTEL:b.source);
    for(let i=0;i<typicalPoly.length;i++)ee(typicalPoly[i],typicalPoly[(i+1)%typicalPoly.length],roof+(b.id===3?-.33:.33),.66,.24,skin,L.roof,b.floors,'low building roof parapet',facadeSource);
    // Hotel machinery is already represented by the enclosed crown storey.
    // The former two arbitrary 2.3 m boxes were not sourced roof structures;
    // the northern one's centre-only check let its cap overhang the east wall.
    const equipment=b.id===3?[]:b.id===4?[[1400,910,13,8,1.6],[1311,934,10,6,1.6]]:b.id===5?[[1240,402,20,10,2.34],[1433,531,11,8,.95]]:[[907,384,22,10,1.6],[1050,380,14,8,1.6]];
    b.roofClosureEvidence={membrane:'continuous weather roof over schematic lift/stair apertures; 0.18 m finish thickness estimated',coreTermination:'schematic core members end 0.20 m below roof top, with 20 mm cover clearance; no surveyed roof access positions',outline:'existing source-registered concave footprint preserved; exterior recesses and courts are not filled',equipment:b.id===5?'existing enclosed bulkheads retained; A-E101–A-E107 elevations support bulkheads; plan positions and sections remain estimates':b.id===3?'unsourced arbitrary rooftop boxes omitted; enclosed crown retained':'existing enclosed equipment enclosures retained as representative estimates, not surveyed rooftop machinery',source:b.id===5?SOURCE_ELEVATION:b.id===3?SOURCE_HOTEL:SOURCE_LOW,confirmedRoofAccessSurvey:false};
    if(b.id===3)b.hotelRoofEvidence={outline:'SOM 1981 typical plan registered estimate; SOM 1979 east elevation supports full-height service projection',membrane:'closed exterior weather roof; thickness 0.18 m estimated',parapet:'FEMA approximately 242 ft above West Street; edge section estimated',crown:'enclosed top storey; photographic panel and ventilation proportions estimated',additionalEquipment:'none modeled: previous unsourced boxes removed',shaftAccess:'schematic occupied-floor shafts terminate below closed roof; access-door locations unknown',confirmed2001RoofPlan:false};
    for(const [u,v,w,d,h] of equipment){const [x,z]=sitePlanToStructure([u,v]);if(!inside([x,z],typicalPoly))continue;
      // Four thin sides leave the bulkhead hollow and its interior inspectable.
      for(const sign of [-1,1]){bb(x+sign*w/2,roof+h/2,z,.12,h,d,skin,L.roof,b.floors,'low building rooftop service enclosure wall',0,facadeSource);bb(x,roof+h/2,z+sign*d/2,w,h,.12,skin,L.roof,b.floors,'low building rooftop service enclosure wall',0,facadeSource);}
      bb(x,roof+h+.06,z,w+.20,.12,d+.20,M.roof,L.roof,b.floors,'low building service enclosure cap',0,facadeSource);
      for(let k=0;k<7;k++)bb(x,roof+.25+k*.16,z+d/2+.035,w-.3,.055,.075,skin,L.roof,b.floors,'low building service louver',0,facadeSource);
      if(b.id===5)for(const sign of [-1,1])ee([x+sign*w/2,z-d/2],[x+sign*w/2,z+d/2],roof+h,.18,.26,skin,L.roof,b.floors,'WTC 5 stepped bulkhead cornice',facadeSource);
    }
    const lightPitch=b.id===3?7.9248:9.144,lightAnchor=layout.grid.anchor;
    for(let f=0;f<levels.length-1;f++){
      const floorPoly=b.id===3&&f>=3?typicalPoly:layout.arcade&&f<profile.officeStart?layout.arcade.occupiedPoly:poly;
      const ceilingAccessHoles=layout.portals.filter(p=>p.entryHole&&levels[f+1]>Math.min(p.threshold,p.servedElevation)+.05&&levels[f+1]<=Math.max(p.threshold,p.servedElevation)+.01).map(p=>p.entryHole);
      for(let gx=Math.ceil((extent.min[0]-lightAnchor[0])/lightPitch);lightAnchor[0]+gx*lightPitch<extent.max[0];gx++)for(let gz=Math.ceil((extent.min[1]-lightAnchor[1])/lightPitch);lightAnchor[1]+gz*lightPitch<extent.max[1];gz++){
        const x=lightAnchor[0]+(gx+.5)*lightPitch,z=lightAnchor[1]+(gz+.5)*lightPitch,occupancy=((Math.imul(gx,73856093)^Math.imul(gz,19349663)^Math.imul(f+1,83492791)^Math.imul(b.id,2654435761))>>>0)%7;
        if(occupancy>2||!inside([x,z],floorPoly)||outlineDistance([x,z],floorPoly)<1.2||cores.some(c=>inside([x,z],c.footprint))||ceilingAccessHoles.some(h=>inside([x,z],h)))continue;
        const y=layout.ceilingTops[f]-.085;
        bb(x,y,z,.66,.09,1.22,M.dark,L.interior,f+1,'low building ceiling luminaire housing',0,b.source);
        // Occupied WTC 3–6 rooms use their existing ceiling fixtures by day
        // and night; public plaza fixtures keep the separate night material.
        bb(x,y-.052,z,.60,.018,1.12,M.occupiedLamp??M.lamp,L.lights,f+1,'low building ceiling luminaire emitter',0,b.source);
      }
    }
    for(let f=0;f<layout.basementLevels.length;f++)fill(poly,layout.basementLevels[f],.24,M.concrete,L.basement,b.id,-f-1,'low building basement slab',holes,b.id===3?SOURCE_HOTEL:b.source);
    const undergroundBottom=layout.basementLevels.at(-1)-.24,undergroundTop=base-.14;
    for(let i=0;i<poly.length;i++)ee(poly[i],poly[(i+1)%poly.length],(undergroundBottom+undergroundTop)/2,undergroundTop-undergroundBottom,.28,M.concrete,L.basement,0,'low building underground perimeter wall',b.id===3?SOURCE_HOTEL:b.source,{evidenceStatus:'representative-foundation-enclosure'});
    for(let f=0;f<layout.basementLevels.length;f++){
      const ceiling=f?layout.basementLevels[f-1]-.24:base-.14;
      for(let gx=Math.ceil((extent.min[0]-lightAnchor[0])/lightPitch);lightAnchor[0]+gx*lightPitch<extent.max[0];gx++)for(let gz=Math.ceil((extent.min[1]-lightAnchor[1])/lightPitch);lightAnchor[1]+gz*lightPitch<extent.max[1];gz++){
        const x=lightAnchor[0]+(gx+.5)*lightPitch,z=lightAnchor[1]+(gz+.5)*lightPitch;
        if(!inside([x,z],poly)||outlineDistance([x,z],poly)<1.2||cores.some(c=>inside([x,z],c.footprint)))continue;
        bb(x,ceiling-.04,z,.66,.08,1.22,M.dark,L.basement,-f-1,'low building basement luminaire housing',0,b.source);
        bb(x,ceiling-.088,z,.60,.016,1.12,M.undergroundLamp??M.lamp,L.lights,-f-1,'low building basement luminaire emitter',0,b.source);
      }
    }
    const world=poly.map(p=>siteStructureToWorld(p)),worldBounds={min:[Math.min(...world.map(p=>p[0])),layout.basementLevels.at(-1)-.25,Math.min(...world.map(p=>p[2]))],max:[Math.max(...world.map(p=>p[0])),roof+2.6,Math.max(...world.map(p=>p[2]))]};
    buildings.push({id:b.id,key:b.key,name:b.name,center:b.center,height:b.height,roofElevation:roof,floorCount:b.floors,elevations:levels,roomCeilingElevations:b.roomCeilingElevations,roomCeilingEvidence:layout.ceilingEvidence,orientation:-bearing,localZSign:-1,footprint:world,structuralFootprint:poly,source:b.source,surveyed:false,bounds:worldBounds,entryPlatforms:layout.portals,roofClosureEvidence:b.roofClosureEvidence,...(b.id===3?{hotelRoofEvidence:b.hotelRoofEvidence}:{}),...(layout.arcade?{occupiedFloorFootprints:b.occupiedFloorFootprints.map(p=>p.map(v=>siteStructureToWorld(v))),officePlenum:{outerCoverOffset:-.02,innerReturnOffset:.31,jointOuterOffset:-.035,edgeReturnThickness:.02,lowerBoundary:'20-mm-below-room-ceiling-underside',evidenceStatus:'estimated-curtain-wall-edge-enclosure'},canopy:{columnSetback:layout.arcade.columnSetback,glazingSetback:layout.arcade.glazingSetback,occupiedPublicFloors:profile.officeStart,upperOfficeElevation:levels[profile.officeStart],depthEvidence:layout.arcade.depthEvidence,profileEvidence:layout.arcade.profileEvidence}}:{})});
    diagnostics.push({id:b.id,facadeProfile:profile.facade,facadeSource,grid:layout.grid,coreCount:cores.length,coreStatus:'schematic, apertures shared by floors/ceilings/roof/basements',portals:layout.portals,hotelPublicFootprint:b.id===3?(b.publicFootprint?'supplied later-footprint reconstruction':'estimated from registered typical footprint'):'not applicable',sourceDateNote:b.id===5?'1990 stamp is RECEIVED; it is not a drawing revision date':undefined});
  }
  return {buildings,diagnostics};
}
