// Exact closed crown panels in source coordinates (+Z north). The photographed
// corner face narrows to a single apex, rather than preserving an octagonal
// chamfer at its upper edge. Architectural dimensions remain photo estimates.
import {roofConvexPanel} from './tower-roofs.js';
import {convexPrism} from './site-geometry.js';
export const ROOF_CROWN=Object.freeze({lowerOffset:.23,upperOffset:-.80,bottomAboveRoof:.05,rise:3.05,thickness:.055,membraneOffset:.17,innerOffset:-.93,cornerTopCut:0,headBandHeight:.45,profileEvidence:'2026-10-07 supplied elevation and low corner comparison: crown and wall share a flush octagonal lower boundary; no projecting top bars. Unsurveyed 3.05 m triangular rise; structural roof datum unchanged.'});
export function roofCrownOutline(half,cut,q,profile=ROOF_CROWN){
  const r=half+profile.lowerOffset+(profile.upperOffset-profile.lowerOffset)*q;
  const lowerFlat=half-cut+(Math.SQRT2-1)*profile.lowerOffset;
  const flat=lowerFlat+(half+profile.upperOffset-lowerFlat)*q;
  return[[-flat,r],[flat,r],[r,flat],[r,-flat],[flat,-r],[-flat,-r],[-r,-flat],[-r,flat]];
}
const TRI=[[0,1,2],[3,5,4],[0,3,4,1],[1,4,5,2],[2,5,3,0]];
export function buildRoofCrown(t,{convex,box,rod,materials:M,layers:L,halfWidth:H,cornerCut:C},P=ROOF_CROWN){
  const bottom=t.height+P.bottomAboveRoof,crest=bottom+P.rise,lo=roofCrownOutline(H,C,0,P),hi=roofCrownOutline(H,C,1,P),src='user-roof-reference';
  const b=(x,y,z,sx,sy,sz,m,kind,a=0)=>box(t,x,y,z,sx,sy,sz,m,L.roof,110,kind,a,undefined,src);
  const surface=(points,kind,layer=L.roof,normal)=>{
    const [a,c,d]=points,ab=c.map((v,i)=>v-a[i]),ac=d.map((v,i)=>v-a[i]);
    let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],len=Math.hypot(...n);n=n.map(v=>v/len);
    // Face lists run clockwise in plan; explicitly choose the outward side.
    if(normal)n=normal;
    else if(n[0]*a[0]+n[2]*a[2]<0)n=n.map(v=>-v);
    const back=points.map(v=>v.map((x,i)=>x-n[i]*P.thickness));
    const g=roofConvexPanel([...points,...back],points.length===3?TRI:undefined);
    return convex(t,g,M.aluminum,layer,110,kind,src);
  };
  const strip=(polygon,edge,y,h,d,kind)=>{
    const p=polygon[edge],r=polygon[(edge+1)%polygon.length],dx=r[0]-p[0],dz=r[1]-p[1],len=Math.hypot(dx,dz);
    if(len<1e-7)return;
    b((p[0]+r[0])/2,y,(p[1]+r[1])/2,len+.035,h,d,M.aluminum,kind,Math.atan2(-dz,dx));
  };
  for(let edge=0;edge<8;edge++){
    const next=(edge+1)%8,p=lo[edge],r=lo[next],a=hi[edge],c=hi[next];
    if(edge%2)surface([[p[0],bottom,p[1]],[r[0],bottom,r[1]],[a[0],crest,a[1]]],'sloped chamfer roof crown');
    else surface([[p[0],bottom,p[1]],[r[0],bottom,r[1]],[c[0],crest,c[1]],[a[0],crest,a[1]]],'sloped silver roof crown');
    // The wall head and the sloped skin share the SAME exterior vertices.
    // Eight exact panels meet at miters, rather than long overlapping boxes
    // and a separate drip bar wrapping 250 mm outside the wall face.
    surface([[p[0],bottom-P.headBandHeight,p[1]],[r[0],bottom-P.headBandHeight,r[1]],[r[0],bottom+.001,r[1]],[p[0],bottom+.001,p[1]]],edge%2?'crown lower chamfer fascia closure':'crown lower rectangular fascia panel',L.facade);
    // Keep the roof-datum weather lap concealed behind the shared wall head.
    const datum=roofCrownOutline(H,C,0,{...P,lowerOffset:P.lowerOffset-.15});
    strip(datum,edge,t.height+.01,.05,.08,'roof datum counterflashing');
    // Each face is one uninterrupted closed sheet. Dark rods previously
    // represented joints as deep cracks; neither real openings nor dark
    // standing seams are supported by the close photographs.
  }
  const ri=H+P.innerOffset,rt=H+P.upperOffset,inside=[[-ri,ri],[ri,ri],[ri,-ri],[-ri,-ri]],top=[[-rt,rt],[rt,rt],[rt,-rt],[-rt,-rt]];
  for(let edge=0;edge<4;edge++){
    // A flush horizontal return closes the skin to the inner lining. It has
    // no protruding rail above or outside the four silver faces.
    const outer=rt+.001,flushTop=[[-outer,outer],[outer,outer],[outer,-outer],[-outer,-outer]];
    const a=[...flushTop[edge]],c=[...flushTop[(edge+1)%4]],d=[...inside[(edge+1)%4]],e=[...inside[edge]];
    const length=Math.hypot(c[0]-a[0],c[1]-a[1]),along=c.map((v,i)=>(v-a[i])/length);
    // Two millimetres of coplanar overlap hides Float32 miter rounding at
    // 400 m elevation without adding an externally visible crest extrusion.
    for(let i=0;i<2;i++){a[i]-=along[i]*.002;e[i]-=along[i]*.002;c[i]+=along[i]*.002;d[i]+=along[i]*.002;}
    surface([[a[0],crest,a[1]],[c[0],crest,c[1]],[d[0],crest,d[1]],[e[0],crest,e[1]]],'roof crown top closure',L.roof,[0,1,0]);
    strip(inside,edge,(t.height-.05+crest)/2,crest-t.height+.05,.09,'inner crown metal enclosure');
  }
  // The triangular tip projects past the old plan chamfer. Close the tiny
  // roof-side corner below it instead of leaving a view into the column top.
  // Overlap the existing diagonal roof boundary by 30 mm: exact tangent
  // edges become opposite-side gaps after Float32 BVH packing at 400 m.
  const sum=2*H-C,other=sum-ri-.03;
  if(ri>other)for(const sx of [-1,1])for(const sz of [-1,1]){
    const poly=[[sx*ri,sz*other],[sx*ri,sz*ri],[sx*other,sz*ri]];
    convex(t,convexPrism(poly,t.height+.025,.075),M.weatherRoof,L.roof,110,'roof corner weather infill',src);
  }
}
