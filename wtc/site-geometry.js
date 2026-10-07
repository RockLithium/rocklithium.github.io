// Polygon slabs remain analytic ray primitives. Boundaries are exact line
// segments; this decomposition never approximates a diagonal with box strips.
const EPS=1e-8;
export const area=poly=>poly.reduce((s,a,i)=>{const b=poly[(i+1)%poly.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
export function cleanPolygon(poly) {
  const p=poly.filter((a,i)=>Math.hypot(a[0]-poly[(i+poly.length-1)%poly.length][0],a[1]-poly[(i+poly.length-1)%poly.length][1])>EPS);
  for(let i=p.length-1;i>=0&&p.length>2;i--) {
    const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];
    if(Math.abs((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))<EPS)p.splice(i,1);
  }
  return p.length>=3&&Math.abs(area(p))>EPS?p:[];
}
const edges=poly=>poly.map((a,i)=>({a,b:poly[(i+1)%poly.length]}));
const at=(edge,z)=>edge.a[0]+(z-edge.a[1])*(edge.b[0]-edge.a[0])/(edge.b[1]-edge.a[1]);
function spans(poly,z) {
  const hits=edges(poly).filter(({a,b})=>(a[1]<=z&&b[1]>z)||(b[1]<=z&&a[1]>z)).sort((a,b)=>at(a,z)-at(b,z));
  return Array.from({length:Math.floor(hits.length/2)},(_,i)=>[hits[i*2],hits[i*2+1]]);
}
function minus(rows,cuts,z) {
  for(const [a,b] of cuts)rows=rows.flatMap(([l,r])=>at(b,z)<=at(l,z)+EPS||at(a,z)>=at(r,z)-EPS?[[l,r]]:[...(at(a,z)>at(l,z)+EPS?[[l,a]]:[]),...(at(b,z)<at(r,z)-EPS?[[b,r]]:[])]);
  return rows;
}
function intersect(rows,allowed,z) {
  return rows.flatMap(([a,b])=>allowed.map(([l,r])=>[at(a,z)>at(l,z)?a:l,at(b,z)<at(r,z)?b:r]).filter(([l,r])=>at(r,z)-at(l,z)>EPS));
}
export function polygonPieces(poly,holes=[],clip=null,rowBreaks=[]) {
  const polygons=[poly,...holes,...(clip?[clip]:[])],ee=polygons.flatMap(edges),breaks=[...polygons.flat().map(p=>p[1]),...rowBreaks];
  // Crossing cuts change the order of interval endpoints. Splitting exactly at
  // those crossings prevents overlapping holes from deleting or adding wedges.
  for(let i=0;i<ee.length;i++)for(let j=i+1;j<ee.length;j++) {
    const {a,b}=ee[i],{a:c,b:d}=ee[j],rx=b[0]-a[0],rz=b[1]-a[1],sx=d[0]-c[0],sz=d[1]-c[1],den=rx*sz-rz*sx;
    if(Math.abs(den)<EPS)continue;
    const qx=c[0]-a[0],qz=c[1]-a[1],t=(qx*sz-qz*sx)/den,u=(qx*rz-qz*rx)/den;
    if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)breaks.push(a[1]+t*rz);
  }
  const zz=breaks.sort((a,b)=>a-b).filter((z,i,p)=>!i||z-p[i-1]>EPS),result=[];
  for(let i=0;i<zz.length-1;i++) {
    const za=zz[i],zb=zz[i+1],mid=(za+zb)/2;let rows=spans(poly,mid);
    if(clip)rows=intersect(rows,spans(clip,mid),mid);
    rows=minus(rows,holes.flatMap(h=>spans(h,mid)),mid);
    for(const [l,r] of rows) {
      const piece=cleanPolygon([[at(l,za),za],[at(r,za),za],[at(r,zb),zb],[at(l,zb),zb]]);
      if(piece.length)result.push(piece);
    }
  }
  return result;
}
export function clipConvex(subject,clip) {
  const sign=area(clip)>0?1:-1;let result=subject;
  for(let i=0;i<clip.length&&result.length;i++) {
    const a=clip[i],b=clip[(i+1)%clip.length],distance=p=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])),next=[];
    for(let j=0;j<result.length;j++) {
      const p=result[j],q=result[(j+1)%result.length],dp=distance(p),dq=distance(q),ip=dp>=-EPS,iq=dq>=-EPS;
      if(ip)next.push(p);
      if(ip!==iq){const t=dp/(dp-dq);next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
    result=next;
  }
  return cleanPolygon(result);
}
export function triangulateConvex(poly) {return Array.from({length:Math.max(0,poly.length-2)},(_,i)=>[poly[0],poly[i+1],poly[i+2]]);}
// Recover the exterior of a decomposed planar region. Partial coincident
// edges cancel too: a long boundary on one cell may meet several short cells.
// This prevents floor decomposition lines from becoming imaginary room walls.
export function polygonBoundarySegments(pieces) {
  const groups=new Map(),fixed=value=>value.toFixed(8);
  for(const original of pieces){
    const poly=area(original)<0?[...original].reverse():original;
    for(const {a,b} of edges(poly)){
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<EPS)continue;
      const sign=dx<-EPS||(Math.abs(dx)<EPS&&dz<0)?-1:1,t=[dx/length*sign,dz/length*sign],n=[-t[1],t[0]],offset=n[0]*a[0]+n[1]*a[1],lo=t[0]*a[0]+t[1]*a[1],hi=t[0]*b[0]+t[1]*b[1],key=[...t,offset].map(fixed).join(',');
      if(!groups.has(key))groups.set(key,{t,n,offset,spans:[]});
      groups.get(key).spans.push({lo:Math.min(lo,hi),hi:Math.max(lo,hi),sign});
    }
  }
  const result=[];
  for(const {t,n,offset,spans} of groups.values()){
    const breaks=spans.flatMap(s=>[s.lo,s.hi]).sort((a,b)=>a-b).filter((v,i,list)=>!i||v-list[i-1]>EPS),runs=[];
    for(let i=0;i<breaks.length-1;i++){
      const lo=breaks[i],hi=breaks[i+1],mid=(lo+hi)/2,winding=spans.reduce((sum,s)=>sum+(mid>s.lo-EPS&&mid<s.hi+EPS?s.sign:0),0);
      if(!winding)continue;
      const sign=Math.sign(winding),last=runs.at(-1);if(last&&last.sign===sign&&Math.abs(last.hi-lo)<EPS)last.hi=hi;else runs.push({lo,hi,sign});
    }
    const at=s=>[t[0]*s+n[0]*offset,t[1]*s+n[1]*offset];
    for(const {lo,hi,sign} of runs)result.push(sign>0?[at(lo),at(hi)]:[at(hi),at(lo)]);
  }
  return result;
}
export function planeHeight(triangle,heights) {
  const [p,q,r]=triangle,[a,b,c]=heights,det=(q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]);
  const dx=((b-a)*(r[1]-p[1])-(c-a)*(q[1]-p[1]))/det,dz=((q[0]-p[0])*(c-a)-(r[0]-p[0])*(b-a))/det;
  return (x,z)=>a+dx*(x-p[0])+dz*(z-p[1]);
}
export function makeSurface(triangles, sample) {
  const cells=triangles.map(poly=>({poly,height:planeHeight(poly,poly.map(p=>sample(...p))),min:[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1]))],max:[Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))]}));
  const bucketSize=24,index=new Map();
  for(let i=0;i<cells.length;i++) {
    const c=cells[i];for(let x=Math.floor(c.min[0]/bucketSize);x<=Math.floor(c.max[0]/bucketSize);x++)for(let z=Math.floor(c.min[1]/bucketSize);z<=Math.floor(c.max[1]/bucketSize);z++){const key=`${x},${z}`;if(!index.has(key))index.set(key,[]);index.get(key).push(i);}
  }
  const candidates=poly=>{
    const min=[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1]))],max=[Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))],ids=new Set();
    for(let x=Math.floor(min[0]/bucketSize);x<=Math.floor(max[0]/bucketSize);x++)for(let z=Math.floor(min[1]/bucketSize);z<=Math.floor(max[1]/bucketSize);z++)for(const i of index.get(`${x},${z}`)||[])ids.add(i);
    return [...ids].map(i=>cells[i]).filter(c=>c.min[0]<=max[0]+EPS&&c.max[0]>=min[0]-EPS&&c.min[1]<=max[1]+EPS&&c.max[1]>=min[1]-EPS);
  };
  const height=(x,z)=>{
    for(const c of candidates([[x,z]])) {const p=c.poly,sign=area(p)>0?1:-1;if(p.every((a,i)=>{const b=p[(i+1)%p.length];return sign*((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]))>=-EPS;}))return c.height(x,z);}
    return sample(x,z);
  };
  return {cells,candidates,height};
}
// The renderer is right handed (+Z south). This produces normalized half-space
// planes in a primitive's unrotated renderer-local coordinates.
export function convexPrism(poly,top,thickness) {
  const heights=poly.map(p=>typeof top==='function'?top(...p):top),points=poly.map((p,i)=>[p[0],heights[i],-p[1]]),bottom=points.map(p=>[p[0],p[1]-thickness,p[2]]),all=[...points,...bottom];
  const lo=[0,1,2].map(i=>Math.min(...all.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...all.map(p=>p[i]))),center=lo.map((v,i)=>(v+hi[i])/2),half=lo.map((v,i)=>(hi[i]-v)/2);
  const centroid=[0,1,2].map(i=>all.reduce((s,p)=>s+p[i],0)/all.length),planes=[];
  const plane=(a,b,c)=>{
    const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...n);if(length<EPS)return;
    n=n.map(v=>v/length);let d=n.reduce((s,v,i)=>s+v*a[i],0);if(n.reduce((s,v,i)=>s+v*centroid[i],0)>d){n=n.map(v=>-v);d=-d;}
    planes.push([...n,d-n.reduce((s,v,i)=>s+v*center[i],0)]);
  };
  plane(points[0],points[1],points[2]);plane(bottom[0],bottom[2],bottom[1]);
  for(let i=0;i<poly.length;i++)plane(points[i],points[(i+1)%poly.length],bottom[i]);
  return {center:[center[0],center[1],-center[2]],half,shape:{type:'convex',planes}};
}
