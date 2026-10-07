import {rotateVector,convexInterval} from './bvh.js';

// Cacheable, lamp-derived diffuse irradiance. RGB and first directional
// moments are interpolated in the shader, without selecting new emitters at
// cell boundaries. This is an inexpensive bounce approximation, not GI.
export const LIGHT_GRID_SIZE=16;
export const LIGHT_GROUP_COUNT=716;
export const LIGHT_FLOOR_ORIGIN=-32;
export const LIGHT_FLOOR_STEP=.25;
export const LIGHT_FLOOR_SAMPLES=2048;
const BASEMENTS=[-4.8768,-7.9248,-10.9728,-14.0208,-17.3736,-20.7264];
const EXTERIOR=672,SHARED_BASEMENT=709,SHARED_CONCOURSE=715;
export function lightGroup(tower,floor=0){
  if(!tower)return floor<0?SHARED_BASEMENT-floor-1:floor===1?SHARED_CONCOURSE:EXTERIOR;
  return floor<0?673+(tower-1)*6-floor-1:(tower-1)*112+floor;
}
const inside=(p,poly)=>{
  if(!poly?.length)return true;
  let hit=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz || 1)));
    if(Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t)<1e-6)return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
};
const localPoint=(p,b)=>{const c=Math.cos(b.orientation || 0),s=Math.sin(b.orientation || 0),x=p[0]-b.center[0],z=p[2]-b.center[2];return [c*x-s*z,s*x+c*z];};

// Any-hit against the renderer's packed convex geometry. This runs once in
// the worker/cache bake and never adds a BVH ray to a rendered pixel.
function visibilityTest(data,metrics){
  if(!data.nodeData?.length)return ()=>true;
  const nd=data.nodeData,pd=data.primitiveData,spaces=data.spaces || [{center:[0,0,0],rotation:[0,0,0,1]}],shapes=new Map();
  const box=(ro,rd,lo,hi,maxDistance)=>{
    let near=0,far=maxDistance;
    for(let a=0;a<3;a++){
      if(Math.abs(rd[a])<1e-10){if(ro[a]<lo[a]||ro[a]>hi[a])return null;}
      else{const l=(lo[a]-ro[a])/rd[a],h=(hi[a]-ro[a])/rd[a];near=Math.max(near,Math.min(l,h));far=Math.min(far,Math.max(l,h));if(near>far)return null;}
    }
    return far>.005?[near,far]:null;
  };
  return (point,light)=>{
    metrics.visibilityRays++;
    const delta=light.position.map((v,a)=>v-point[a]),distance=Math.hypot(...delta),direction=delta.map(v=>v/distance),limit=distance-.07;
    if(limit<=.005)return true;
    const rays=spaces.map(s=>({ro:rotateVector(point.map((v,a)=>v-s.center[a]),s.rotation,true),rd:rotateVector(direction,s.rotation,true)}));
    let node=0;
    while(node<data.nodeCount){
      const k=node*12,ray=rays[Math.round(nd[k+10])],escape=Math.round(nd[k+7]);
      if(!box(ray.ro,ray.rd,nd.subarray(k,k+3),nd.subarray(k+4,k+7),limit)){node=escape;continue;}
      const encoded=Math.round(nd[k+3]);
      if(encoded<0){node++;continue;}
      const start=Math.floor(encoded/8),count=encoded%8;
      for(let i=0;i<count;i++){
        const id=start+i,p=id*16,material=data.materials[Math.round(pd[p+3])];
        if(id===light.primitive || (material?.transmission || 0)>.5 || material?.emission?.some(v=>v>0))continue;
        const q=pd.subarray(p+8,p+12),ro=rotateVector(point.map((v,a)=>v-pd[p+a]),q,true),rd=rotateVector(direction,q,true),half=pd.subarray(p+4,p+7);
        let span=box(ro,rd,half.map(v=>-v),half,limit);
        const offset=data.shapeOffsets?.[id] ?? -1;
        if(span&&offset>=0){
          let planes=shapes.get(offset);
          if(!planes){planes=Array.from({length:Math.round(data.shapeData[offset*4])},(_,j)=>data.shapeData.subarray((offset+j+1)*4,(offset+j+2)*4));shapes.set(offset,planes);}
          span=convexInterval(ro,rd,planes,span);
        }
        if(span&&span[0]<limit&&span[1]>.005)return false;
      }
      node=escape;
    }
    return true;
  };
}

export function prepareLightGrid(data){
  const started=performance.now(),size=LIGHT_GRID_SIZE,groups=Array.from({length:LIGHT_GROUP_COUNT},()=>[]),descriptors=Array(LIGHT_GROUP_COUNT),rows=[];
  const buildings=[...(data.towers || []),...(data.contextBuildings || [])],polygons=[],groupData=new Float32Array(LIGHT_GROUP_COUNT*16);
  const register=(group,bottom,top,building=null,poly=null)=>{
    const c=Math.cos(building?.orientation || 0),s=Math.sin(building?.orientation || 0),center=building?.center || [0,0,0];
    const bounds=poly?.length?[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))]:[-240,-240,240,240];
    const offset=polygons.length/4;
    if(poly)for(let i=0;i<poly.length;i++)polygons.push(...poly[i],...poly[(i+1)%poly.length]);
    const descriptor={group,bottom,top,building,poly,bounds,c,s,center,previous:group,next:group};descriptors[group]=descriptor;
    groupData.set([bounds[0],bounds[1],(bounds[2]-bounds[0])/(size-1),(bounds[3]-bounds[1])/(size-1),bottom,top,group,group,center[0],center[2],c,s,offset,poly?.length || 0,size,0],group*16);
    return descriptor;
  };
  register(EXTERIOR,-32,480);
  const schedules=Array.from({length:7},()=>[]);
  for(const building of buildings){
    // Picking/render fixtures may describe only a local BVH transform. An
    // absent elevation schedule is not evidence of occupied rooms/basements.
    const elevations=building.elevations;if(!elevations?.length)continue;
    const half=(building.width || 63.1444)/2-.23,chamfer=2.1082;
    const poly=building.footprint?.map(p=>localPoint(p,building)) || [[-half+chamfer,-half],[half-chamfer,-half],[half,-half+chamfer],[half,half-chamfer],[half-chamfer,half],[-half+chamfer,half],[-half,half-chamfer],[-half,-half+chamfer]];
    const above=building.id<=2?Math.min(110,elevations.length-2):(building.floorCount || elevations.length-1);
    for(let floor=1;floor<=above;floor++){
      const index=building.id<=2?floor:floor-1,bottom=elevations[index],top=elevations[index+1];
      if(!Number.isFinite(bottom)||!Number.isFinite(top)||top<=bottom)continue;
      const occupied=building.occupiedFloorFootprints?.[floor-1]?.map(p=>localPoint(p,building)) || poly;
      schedules[building.id].push(register(lightGroup(building.id,floor),bottom,top,building,occupied));
    }
    for(let f=1;f<=6;f++)schedules[building.id].push(register(lightGroup(building.id,-f),BASEMENTS[f-1],f===1?(building.id<=2?0:elevations[0]):BASEMENTS[f-2],building,poly));
  }
  for(let f=1;f<=6;f++)schedules[0].push(register(lightGroup(0,-f),BASEMENTS[f-1],f===1?0:BASEMENTS[f-2]));
  schedules[0].push(register(SHARED_CONCOURSE,0,data.metadata?.historicSite?.plaza?.elevation ?? 6.7056));
  const floorLookup=new Float32Array(7*LIGHT_FLOOR_SAMPLES*4);floorLookup.fill(-1);
  schedules.forEach((schedule,tower)=>{
    schedule.sort((a,b)=>a.bottom-b.bottom);
    for(let i=0;i<schedule.length;i++){
      const d=schedule[i];d.previous=schedule[i-1]?.group ?? d.group;d.next=schedule[i+1]?.group ?? d.group;
      groupData[d.group*16+6]=d.previous;groupData[d.group*16+7]=d.next;
    }
    for(let y=0;y<LIGHT_FLOOR_SAMPLES;y++){
      const height=LIGHT_FLOOR_ORIGIN+(y+.5)*LIGHT_FLOOR_STEP,d=schedule.find(d=>height>=d.bottom&&height<d.top);
      if(d)floorLookup[(tower*LIGHT_FLOOR_SAMPLES+y)*4]=d.group;
    }
  });
  for(let primitive=0;primitive<data.primitiveCount;primitive++){
    const k=primitive*16,m=data.materials[Math.round(data.primitiveData[k+3])];
    if(!m?.emission?.some(v=>v>0))continue;
    const tower=Math.round(data.primitiveData[k+13]),floor=Math.round(data.primitiveData[k+14]);
    if(tower&&(floor===0||floor>110||floor< -6))continue;
    const group=lightGroup(tower,floor);if(!descriptors[group])continue;
    // A recessed public floor ends at its actual glazing envelope. Stale or
    // misplaced room fixtures in the exterior canopy strip must not become
    // a diffuse room-light source, even when glass is transmissive.
    if(tower&&floor>0&&!inside(localPoint(Array.from(data.primitiveData.subarray(k,k+3)),descriptors[group].building),descriptors[group].poly))continue;
    const light={position:Array.from(data.primitiveData.subarray(k,k+3)),area:Math.max(.05,4*data.primitiveData[k+4]*data.primitiveData[k+6]),emission:m.emission,night:m.nightOnly===false?0:1,required:Math.round(data.primitiveData[k+12]),tower,primitive,index:rows.length/8,radiusSquared:tower<=2&&tower>0&&floor===6?900:tower?225:324};
    rows.push(...light.position,light.area,...light.emission,light.night+(light.required<<1)+(tower<<13));groups[group].push(light);
    // Only the two six-storey tower atria are physically open to these lights.
    if(tower>0&&tower<=2&&floor===6){groups[lightGroup(tower,1)].push(light);groups[lightGroup(tower,2)].push(light);}
  }
  let probeCount=0;
  descriptors.forEach((d,group)=>{
    const side=d.building?size:group===EXTERIOR?64:32,lights=groups[group];
    if(!d.building&&lights.length){
      d.bounds=[Math.min(...lights.map(l=>l.position[0]))-18,Math.min(...lights.map(l=>l.position[2]))-18,Math.max(...lights.map(l=>l.position[0]))+18,Math.max(...lights.map(l=>l.position[2]))+18];
    }
    groupData.set([d.bounds[0],d.bounds[1],(d.bounds[2]-d.bounds[0])/(side-1),(d.bounds[3]-d.bounds[1])/(side-1)],group*16);
    groupData[group*16+14]=side;groupData[group*16+15]=probeCount;probeCount+=side*side;
  });
  const count=probeCount*4,probes=new Float32Array(count),nightProbes=new Float32Array(count),directions=new Float32Array(count);
  const metrics={visibilityRays:0,litGroups:groups.filter(l=>l.length).length,maxCandidates:8},visible=visibilityTest(data,metrics);
  groups.forEach((lights,group)=>{
    const d=descriptors[group];if(!d||!lights.length)return;
    const y=group===EXTERIOR?(data.metadata?.historicSite?.plaza?.elevation ?? 6.7056)+.05:d.bottom+Math.min(1.5,(d.top-d.bottom)*.5);
    const side=groupData[group*16+14];
    for(let z=0;z<side;z++)for(let x=0;x<side;x++){
      const lx=d.bounds[0]+x*groupData[group*16+2],lz=d.bounds[1]+z*groupData[group*16+3],slot=(groupData[group*16+15]+z*side+x)*4;
      if(!inside([lx,lz],d.poly))continue;
      const point=[d.center[0]+d.c*lx+d.s*lz,y,d.center[2]-d.s*lx+d.c*lz],candidates=[];
      for(const light of lights){
        const delta=light.position.map((v,a)=>v-point[a]),distanceSquared=delta.reduce((s,v)=>s+v*v,0),weight=Math.max(0,1-distanceSquared/light.radiusSquared)**2*light.area*.042;
        if(weight<=.00001)continue;
        candidates.push({light,delta,distanceSquared,weight,importance:weight*Math.max(...light.emission)});
      }
      candidates.sort((a,b)=>b.importance-a.importance);
      const moments=[[0,0,0,0],[0,0,0,0]];
      for(const candidate of candidates.slice(0,metrics.maxCandidates)){
        const {light,delta,distanceSquared,weight}=candidate;if(!visible(point,light))continue;
        const field=light.night?nightProbes:probes,moment=moments[light.night],strength=weight*Math.max(...light.emission),distance=Math.sqrt(distanceSquared);
        for(let a=0;a<3;a++){field[slot+a]+=light.emission[a]*weight;moment[a]+=delta[a]/Math.max(.05,distance)*strength;}
        moment[3]+=strength;
      }
      for(const field of [probes,nightProbes])for(let a=0;a<3;a++)field[slot+a]=Math.min(1.25,field[slot+a]);
      const day=moments[0].slice(0,3).map(v=>v/Math.max(.00001,moments[0][3])),night=moments[1].slice(0,3).map(v=>v/Math.max(.00001,moments[1][3]));
      probes[slot+3]=day[0];nightProbes[slot+3]=day[1];directions.set([day[2],...night],slot);
    }
  });
  metrics.bakeMilliseconds=Math.round(performance.now()-started);
  return {version:2,size,rows:new Float32Array(rows),groupData,floorLookup,polygons:new Float32Array(polygons),probes,nightProbes,directions,metrics};
}
