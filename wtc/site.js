/*
 * The original WTC site, circa 2000/2001.
 * Geometry uses analytic oriented boxes and convex half-space prisms.
 * The site plan is digitized from Port Authority FOI 18324, SKA 54/84.
 * A single uniform scale is used, with no independent X/Z stretching.
 * See metadata for the boundary between documented facts and reconstructions.
 */

import {polygonPieces,polygonBoundarySegments,clipConvex,triangulateConvex,convexPrism,makeSurface,planeHeight} from './site-geometry.js';
import {buildLowBuildings} from './low-buildings.js';
import {HOTEL_PODIUM_PROFILE} from './hotel-podium.js';
const FT = 0.3048;
const BEARING = 29 * Math.PI / 180;
const C = Math.cos(BEARING), S = Math.sin(BEARING);
export const SITE_LAYERS = Object.freeze({facade:1,steel:2,core:4,floors:8,trusses:16,basement:32,roof:64,site:128,stairs:256,elevators:512,lights:1024,interior:2048});
export const SITE_CALIBRATION = Object.freeze({
  imageSize:[2048,1220], originalImageSize:[3301,1967], imageOrigin:[1712.75*2048/3301,1197.25*2048/3301], metresPerPixel:(207+2/12)*FT/280.25*3301/2048,
  towerPixels:[[1567*2048/3301,970.5*2048/3301],[1858.5*2048/3301,1424*2048/3301]], originalTowerPixels:[[1567,970.5],[1858.5,1424]], bearingDegrees:29,
  method:'Uniform scale from the 207 ft 2 in tower reference width; coordinates digitized on SKA 54/84, FOI 18324 PDF page 328.'
});
export const SITE_PLAZA_ELEVATION = 22*FT;
// Street and elevated entrance photographs jointly constrain this canopy.
// The direct source-plan Z offset is negative: positive facade q reverses Z.
// Dimensions, skylights and construction sections remain finish estimates.
export const WEST_ENTRANCE_CANOPY = Object.freeze({depth:12.7,alongWallLength:21.5,deckTop:6.49884,longitudinalOffsetEstimate:-.6714,deckThickness:.36,fasciaHeight:.58,fasciaCentreBelowDeck:.20,fasciaThickness:.24,skylightAlongWallPitch:3.048,skylightRadius:1.35,skylightHeight:1.05,skylightUpperHalf:.48,skylightCapRadius:.72,skylightCapRise:.23,skylightRows:Object.freeze([2.8,6.35,9.9]),source:'user-north-entrance-canopy-reference',evidence:'data/photo-camera-fit.json',capMaterialEvidence:'Rounded translucent appearance in the supplied close photograph; actual material and optical properties unconfirmed.',columnCountEstimated:7,estimated:true,surveyed:false});

const SOURCE_PLAN = 'pa-18324-site';
const SOURCE_HOTEL = 'fema-403-3';
const SOURCE_LOW = 'fema-403-4';
export const SITE_SOURCES = Object.freeze([
  {id:SOURCE_PLAN,title:'Port Authority FOI 18324 — original WTC drawings',url:'https://pacorpredevblobstorage.blob.core.windows.net/board-documents/uploads/documents/freedom-of-information/foi-fulfilled-requests/18324-WTC.pdf',pages:'PDF 327–328, SKA 55/84 and SKA 54/84',note:'Plaza EL 332 and original site outlines, planting rows, fountain, perimeter streets. Drawing dates vary; metric plan coordinates are scan digitization, not surveyed values.'},
  {id:SOURCE_HOTEL,title:'FEMA 403 — Chapter 3, WTC 3',url:'https://www.govinfo.gov/content/pkg/GOVPUB-FEM1-PURL-LPS18973/pdf/GOVPUB-FEM1-PURL-LPS18973.pdf',pages:'3-1–3-4; figures 3-1–3-4',note:'SOM 1979 elevations and 1981 typical floor plan; 22 above-grade storeys, six basement levels, approximately 242 ft roof parapet above West Street, 64 by 330 ft typical bent floor plate, 9 ft 6 in guestroom storeys.'},
  {id:'user-hotel-west-entrance',title:'User supplied intact Marriott West Street elevation and entrance close photograph',url:null,pages:'2026-10-07 attachments 10, 11 and 13, 3+3+3 correction and annotated projecting ledges (78636caa); historical dates unconfirmed',note:'Three glazing banks, lower side wings and a taller projecting central bank, backed by a wider lower flat-topped projection and a narrower higher central rectangular volume. The inclined glass meets these stepped fronts rather than the main wall. Silver fascia without lettering, round silver columns, recessed doors, ascending stairs and independent stone-clad lower frontage. Estimated entry width 32.4 m, canopy projections 4.6/3.2 m; backing projections 1.75/1.25 m and lower side extensions 2.4 m. These depths, finish heights and exact late-period placement remain photographic estimates. The LEGO/model illustration is not historical evidence.'},
  {id:'pa-12673-hotel-public',title:'Port Authority FOI 12673 — SOM World Trade Center Hotel as-built drawing set',url:'https://pacorpredevblobstorage.blob.core.windows.net/board-documents/uploads/documents/freedom-of-information/foi-fulfilled-requests/12673-WTC.pdf',pages:'PDF pp.1050 (A-11), 1081 (A-302 first floor), 1082 (A-303 second floor), 1098 (LA2A entrance); received 1992',note:'Original first/second public-floor outlines establish a straight street-level stone base, setback bent upper frontage and stepped east ballroom wing. Raster registration to the older site scan is approximate. Original door details do not establish the later inclined glass entrance, which is reconstructed from the intact supplied photographs.'},
  {id:SOURCE_LOW,title:'FEMA 403 — Chapter 4, WTC 4, 5 and 6',url:'https://www.govinfo.gov/content/pkg/GOVPUB-FEM1-PURL-LPS18973/pdf/GOVPUB-FEM1-PURL-LPS18973.pdf',pages:'4-1–4-4; figures 4-1–4-3',note:'WTC 5 has a 330 by 420 ft L-shaped envelope, 30 ft column grid, 15 ft floor cantilevers, composite slabs and paired W27 outer beams. WTC 4 and 6 are described as similar, with differing configurations.'},
  {id:'wtc-low-rise-photos',title:'Pre-2001 WTC 4, 5 and 6 ground photographs',url:'https://commons.wikimedia.org/wiki/File:Pre-9-11_WTC_4_in_NYC_(2001-08-21).jpg',relatedUrl:'https://commons.wikimedia.org/wiki/File:5_World_Trade_Center_from_WTC_Plaza.jpg',additionalUrls:['https://commons.wikimedia.org/wiki/File:North_Tower_and_6_World_Trade_Center_from_WTC_Plaza.jpg','https://projects.voanews.com/ground-zero/'],note:'Photographs constrain dark vertical fins, recessed glazing and three-dimensional cantilever/soffit relationships. WTC 6 has its own short flared transition, informed by the intact VOA photo lead and the shadowed base in Charlie Brewer\'s Commons photo. Depths, support profiles, finish parameters and entry coordinates remain photographic estimates; only WTC 5\'s 15 ft outer floor cantilever has a direct FEMA dimension. The VOA image is inspection-only; its redistribution license was not established.'},
  {id:'museum-sphere',title:'9/11 Memorial Museum — Fritz Koenig Sphere maquette',url:'https://collection.911memorial.org/Detail/objects/20476',note:'Original 25 ft sculpture, 64 cast bronze segments, installed in 1971 on a rotating fountain. The reconstructed sculptural contour is a visual approximation.'},
  {id:'loc-basement',title:'Library of Congress, HABS NY-6369 — World Trade Center Site',url:'https://tile.loc.gov/storage-services/master/pnp/habshaer/ny/ny2000/ny2014/data/ny2014cap.pdf',pages:'Photographs NY-6369-13–22',note:'Documents common parking structures, B1–B6 relationships and PATH tracks at B5.'}
  ,{id:'user-north-entrance-canopy-reference',title:'User supplied North Tower street, elevated and close canopy photographs',url:null,pages:'515×388 street entrance, 620×940 elevated western canopy and 1080×730 close canopy photographs supplied in this task',note:'The facade-fitted street camera is held fixed while the canopy corner is checked separately. The modeled 21.5 m length, 12.7 m depth, 6.49884 m deck top and -0.6714 m source-plan Z offset remain conditional photo estimates, not surveyed dimensions. Fascia top is 6.58884 m; the plaza datum remains 6.7056 m. The close photograph confirms three rows of four-sided sloped glazing under shallow rounded caps. Seven columns (21 modules), 1.05 m total rise and rounded-cap dimensions are estimated. Translucency follows the visible appearance; cap material, IOR and transmission are unconfirmed. A 3.8 m carriageway with protected hatched strips clears the column feet; its width and historical traffic direction are not surveyed.'}
  ,{id:'nist-concourse-mall',title:'NIST NCSTAR 1-7 — shopping mall underneath the WTC plaza',url:'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=101046',pages:'Printed p. 13, figure 2-3; PDF p. 51',note:'Documents connected concourse circulation, retail blocks and connections to the tower lobbies. The published mall directory is schematic: representative shop blocks are registered by one similarity transform to the tower centres and clipped to the actual floor envelope. Shop dimensions and ceiling/support sections remain estimates.'}
  ,{id:'pa-18324-grade',title:'Port Authority original master site plan — street grades, JK-10',url:'https://pacorpredevblobstorage.blob.core.windows.net/board-documents/uploads/documents/freedom-of-information/foi-fulfilled-requests/18324-WTC.pdf',pages:'PDF 266, JK-10, 22 March 1968',note:'Initial curb elevations, not a 2001 street survey. BC is bottom of curb, TC is top. West/Vesey corner is approximately BC 304 ft 6 in / TC 305 ft; West by WTC 1 is BC 306 ft / TC 306 ft 6 in. The sheet explicitly says initial elevations only and cautions that architecture east of the slurry wall had changed.'}
  ,{id:'pa-18324-low-elevations',title:'Port Authority Northeast Plaza Building sections and elevations, A-E101–A-E107',url:'https://pacorpredevblobstorage.blob.core.windows.net/board-documents/uploads/documents/freedom-of-information/foi-fulfilled-requests/18324-WTC.pdf',pages:'PDF 244–250',note:'WTC 5 concourse EL 310, plaza EL 332, office floors 347 / 359 / 374 ft 8 in / 386 ft 8 in / 398 ft 8 in / 410 ft 8 in / 423 ft 8 in, main roof EL 440 ft 8 in. Lower arcade proportions, Vesey entrance EL 320, projecting fins and rooftop enclosures guide the reconstruction. The December 1990 stamp records receipt, not a drawing revision. Bulkheads vary.'}
]);

function material(name,color,category,texture,extra={}) {
  return {name,color,category,roughness:.84,metalness:0,transmission:0,ior:1.5,emission:[0,0,0],...(texture?{texture}:{}),...extra};
}
export const SITE_MATERIALS = Object.freeze([
  material('Original plaza warm grey paving',[.60,.58,.54],'site',{type:'paving',scale:1.05,variation:.055}),
  material('Street asphalt',[.20,.215,.22],'site',{type:'asphalt',scale:.8,variation:.085}),
  material('Sidewalk and curb granite',[.55,.55,.53],'site',{type:'stone',scale:.42,variation:.065}),
  material('Excavation soil',[.30,.275,.23],'site',{type:'soil',scale:1.1,variation:.09}),
  material('Shared basement concrete',[.48,.48,.45],'basement',{type:'concrete',scale:1.3,variation:.075}),
  material('Low building dark anodized aluminum',[.16,.18,.19],'facade',{type:'aluminum',scale:.65,variation:.018},{roughness:.40,metalness:.82}),
  material('Low building recessed bronze glazing',[.42,.39,.32],'glass',null,{roughness:.04,transmission:.83,ior:1.5}),
  material('Hotel pale precast panels',[.67,.65,.59],'facade',{type:'stone',scale:.7,variation:.045}),
  material('Hotel dark recessed glazing',[.39,.38,.34],'glass',null,{roughness:.045,transmission:.82}),
  material('Low building structural steel',[.35,.38,.39],'steel',null,{roughness:.52,metalness:.72}),
  material('Low building roof membrane',[.30,.31,.30],'roof',{type:'concrete',scale:.8,variation:.045}),
  material('Fountain polished dark stone',[.25,.26,.25],'site',{type:'stone',scale:.6,variation:.025},{roughness:.25}),
  material('Fountain shallow water',[.40,.49,.47],'water',null,{roughness:.035,transmission:.72,ior:1.333}),
  material('The Sphere, patinated cast bronze',[.34,.29,.16],'site',null,{roughness:.46,metalness:.88}),
  material('Street paint',[.74,.72,.63],'site',null,{roughness:.92}),
  material('Railings and plaza furniture',[.36,.37,.36],'site',null,{roughness:.45,metalness:.72}),
  material('Planting soil',[.23,.22,.18],'site',{type:'soil',scale:.35,variation:.085}),
  material('Street tree foliage',[.25,.32,.21],'site',{type:'stone',scale:.18,variation:.10},{roughness:1}),
  material('Street tree trunks',[.28,.25,.21],'site',{type:'stone',scale:.3,variation:.06}),
  material('Warm plaza fixture',[.92,.82,.62],'light',null,{roughness:.6,emission:[18,12,5],nightOnly:true}),
  material('Low building interior wall',[.72,.71,.66],'interior',{type:'concrete',scale:1.1,variation:.025}),
  material('PATH rail steel',[.31,.33,.34],'basement',null,{roughness:.5,metalness:.80}),
  material('Distant city ground',[.29,.31,.30],'site',{type:'asphalt',scale:4,variation:.09}),
  material('West entrance clear pyramid glazing',[.68,.74,.73],'glass',null,{roughness:.035,transmission:.91,ior:1.5}),
  material('Taxi driveway yellow markings',[.78,.59,.17],'site',null,{roughness:.92}),
  material('Plaza violet flower heads',[.36,.14,.40],'site',{type:'stone',scale:.12,variation:.11},{roughness:1}),
  material('Occupied underground ceiling light',[.91,.84,.70],'light',null,{roughness:.6,emission:[18,14,8],nightOnly:false}),
  // Closed low-building rooms retain their existing fixture positions and
  // emitted intensity in daytime. Operating hours remain a reconstruction.
  material('Occupied low building ceiling light',[.92,.82,.62],'light',null,{roughness:.6,emission:[18,12,5],nightOnly:false}),
  material('Estimated translucent canopy round cap',[.79,.82,.79],'glass',null,{roughness:.24,transmission:.58,ior:1.45}),
  material('Hotel entrance brushed aluminum',[.77,.78,.77],'facade',null,{roughness:.38,metalness:.65}),
  material('Hotel street-level stone base',[.43,.39,.33],'facade',{type:'stone',scale:.7,variation:.035},{roughness:.88}),
  material('Hotel reflective curtain wall glazing',[.49,.55,.57],'glass',null,{roughness:.045,metalness:.86,transmission:0,ior:1.5})
]);
const M = Object.freeze({paving:0,asphalt:1,curb:2,soil:3,concrete:4,dark:5,glass:6,hotel:7,hotelGlass:8,steel:9,roof:10,fountain:11,water:12,bronze:13,paint:14,rail:15,plantSoil:16,leaves:17,bark:18,lamp:19,interior:20,path:21,city:22,canopyGlass:23,taxiPaint:24,flowers:25,undergroundLamp:26,occupiedLamp:27,canopyCap:28,hotelAluminum:29,hotelBase:30,hotelMirror:31});

// These are the actual setbacks/arms visible on SKA 54/84, not enclosing AABBs.
// Pixel coordinates refer to the same normalized scan as SITE_CALIBRATION.
const PLAN_BUILDINGS = [
  {id:3,key:'hotel',name:'WTC 3 · Marriott Hotel',floors:22,source:SOURCE_HOTEL,polygon:[[918,713],[972,713],[972,805],[1037,989],[983,989],[918,805]],typicalPolygon:[[918,713],[972,713],[972,805],[1000.261,885],[1012,881],[1019,902],[1007.679,906],[1037,989],[983,989],[918,805]],roofHeightAboveWestStreet:242*FT},
  {id:4,key:'south-plaza',name:'WTC 4 · South Plaza Building',floors:9,source:SOURCE_PLAN,polygon:[[1360,718],[1482,718],[1482,842],[1535,842],[1535,968],[1411,968],[1411,994],[1262,994],[1262,843],[1360,843]]},
  {id:5,key:'north-plaza',name:'WTC 5 · North Plaza Building',floors:9,source:SOURCE_PLAN,polygon:[[1162,325],[1334,325],[1334,350],[1508,350],[1508,473],[1478,473],[1478,599],[1360,599],[1360,474],[1300,474],[1300,498],[1162,498]]},
  {id:6,key:'customs',name:'WTC 6 · U.S. Customs House',floors:8,source:SOURCE_PLAN,polygon:[[773,302],[970,302],[970,326],[1122,326],[1122,453],[997,453],[997,496],[847,496],[847,427],[773,427]]}
];
const BLOCK_PIXELS = [[731,290],[1135,287],[1240,315],[1510,319],[1532,346],[1550,993],[1520,1016],[985,1016],[963,995],[730,319]];
const RAISED_PLAZA_PIXELS = [
  [[1059.6,496],[1162,498],[1300,498],[1300,474],[1360,474],[1360,599],[1536,599],[1536,718],[1360,718],[1360,843],[1262,843],[1262,994],[1238,994],[1238,796],[1059.6,796]],
  [[885,496],[1062,496],[1062,515],[885,515]],
  [[885,690],[1062,690],[1062,713],[885,713]],
  [[1122,321],[1162,321],[1162,498],[1122,498]]
];
// JK-10 is registered independently by its tower width and centre, using a
// uniform scale. Its sloping eastern slurry wall is much farther east than the
// hotel/tower footprints; do not mistake a tower envelope for the bathtub.
const BATHTUB_PIXELS = [[735,287],[1160,285],[1341,1058],[960,1058]];

export function sitePlanToStructure([u,v]) {
  return [(u-SITE_CALIBRATION.imageOrigin[0])*SITE_CALIBRATION.metresPerPixel,(SITE_CALIBRATION.imageOrigin[1]-v)*SITE_CALIBRATION.metresPerPixel];
}
// Architectural source coordinates are east/north. Renderer +Z is south;
// retaining +Z north here made the entire original plan appear mirrored.
export function siteStructureToWorld([x,z],y=0) {return [C*x+S*z,y,S*x-C*z];}
export function getHistoricTowerCenters() {return SITE_CALIBRATION.towerPixels.map(p=>siteStructureToWorld(sitePlanToStructure(p)));}
const quaternionY=a=>[0,Math.sin(a/2),0,Math.cos(a/2)];
function multiplyQ(a,b) {
  return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
}
function alongY(d) {
  const n=Math.hypot(...d),[x,y,z]=d.map(v=>v/n);
  if(y<-.999999) return [1,0,0,0];
  const q=[z,0,-x,1+y], l=Math.hypot(...q);return q.map(v=>v/l);
}
function pointInside([x,z],poly) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if(((a[1]>z)!==(b[1]>z)) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function rowIntervals(poly,z) {
  const xs=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length];
    if((a[1]<=z && b[1]>z)||(b[1]<=z && a[1]>z)) xs.push(a[0]+(z-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  xs.sort((a,b)=>a-b);const spans=[];
  for(let i=0;i+1<xs.length;i+=2) spans.push([xs[i],xs[i+1]]);
  return spans;
}
function subtractIntervals(spans,cuts) {
  for(const [a,b] of cuts) spans=spans.flatMap(([l,r])=>b<=l||a>=r?[[l,r]]:[...(a>l?[[l,Math.min(a,r)]]:[]),...(b<r?[[Math.max(b,l),r]]:[])]);
  return spans;
}
function polygonBounds(poly) {return {min:[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1]))],max:[Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))]};}
function rectangle(x1,z1,x2,z2) {return [[x1,z1],[x2,z1],[x2,z2],[x1,z2]];}
function distanceToOutline(p,poly) {
  let distance=Infinity;
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));
    distance=Math.min(distance,Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t));
  }
  return distance;
}

/** Independent site builder. `materials` contains only the appended materials. */
export function buildHistoricSite({materialBase=0,layers=SITE_LAYERS,towers=[],onProgress=()=>{}}={}) {
  if(!Number.isInteger(materialBase)||materialBase<0) throw new Error('materialBase must be a nonnegative integer');
  const L={...SITE_LAYERS,...layers,basement:layers.basement??layers.service??SITE_LAYERS.basement};
  const primitives=[],contextBuildings=[];
  let sequence=0;
  const mat=i=>materialBase+i;
  const add=(x,y,z,sx,sy,sz,m,layer,tower=0,floor=0,kind='site member',angle=0,source=SOURCE_PLAN,rotation)=>{
    if([sx,sy,sz].some(v=>!(v>0))) return;
    const p={center:siteStructureToWorld([x,z],y),half:[sx/2,sy/2,sz/2],material:mat(m),layer,tower,floor,kind,source,id:`S${tower}-${++sequence}`};
    const oldQ=rotation?multiplyQ(quaternionY(BEARING),rotation):quaternionY(BEARING+angle);
    const q=[-oldQ[0],-oldQ[1],oldQ[2],oldQ[3]];
    if(Math.abs(q[3]-1)>1e-10)p.rotation=q;
    primitives.push(p);return p;
  };
  const rod=(a,b,w,d,m,layer,tower=0,floor=0,kind='site rail',source=SOURCE_PLAN)=>{
    const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta);
    if(length>1e-7)return add((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,w,length,d,m,layer,tower,floor,kind,0,source,alongY(delta));
  };
  const edge=(a,b,y,height,depth,m,layer,tower=0,floor=0,kind='site edge',source=SOURCE_PLAN)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    return add((a[0]+b[0])/2,y,(a[1]+b[1])/2,len,height,depth,m,layer,tower,floor,kind,-Math.atan2(dz,dx),source);
  };
  const slopingEdge=(a,b,ya,yb,height,depth,m,layer,kind,source='pa-18324-grade')=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],dy=yb-ya,planLength=Math.hypot(dx,dz),length=Math.hypot(planLength,dy);
    const x=[dx/length,dy/length,dz/length],z=[-dz/planLength,0,dx/planLength],y=[-dx*dy/(length*planLength),planLength/length,-dz*dy/(length*planLength)];
    // The supplied line is the TOP of the slab. Offset its centre along the
    // actual normal, including X/Z; a vertical offset lets thick soil prisms
    // poke through the road at changes of grade.
    return add((a[0]+b[0])/2-y[0]*height/2,(ya+yb)/2-y[1]*height/2,(a[1]+b[1])/2-y[2]*height/2,length,height,depth,m,layer,0,0,kind,0,source,quaternionFromAxes(x,y,z));
  };
  const prism=(poly,top,thickness,m,layer,tower,floor,kind,source)=>{
    const record=convexPrism(poly,top,thickness);
    // Reject sub-micrometre Boolean slivers that collapse when packed into
    // float32 world coordinates; they are not separate physical members.
    if(record.half.some(v=>v<1e-6))return;
    const p=add(...record.center,...record.half.map(v=>v*2),m,layer,tower,floor,kind,0,source);
    if(p)p.shape=record.shape;return p;
  };
  const fill=(poly,top,thickness,m,layer,tower=0,floor=0,kind='site slab',holes=[],source=SOURCE_PLAN,_oldStep=.9,clipPoly=null)=>{
    for(const piece of polygonPieces(poly,holes,clipPoly)) {
      if(typeof top!=='function'){prism(piece,top,thickness,m,layer,tower,floor,kind,source);continue;}
      if(top.surface) {
        for(const cell of top.surface.candidates(piece)) {
          const clipped=clipConvex(piece,cell.poly);if(!clipped.length)continue;
          const height=(x,z)=>cell.height(x,z)+(top.surfaceOffset||0);
          if(clipped.length<=6)prism(clipped,height,thickness,m,layer,tower,floor,kind,source);
          else for(const triangle of triangulateConvex(clipped))prism(triangle,height,thickness,m,layer,tower,floor,kind,source);
        }
      } else for(const triangle of triangulateConvex(piece))prism(triangle,top,thickness,m,layer,tower,floor,kind,source);
    }
  };
  const circle=(x,z,r,top,thickness,m,layer,kind,inner=0)=>{
    const n=Math.max(32,Math.ceil(2*Math.PI*r/.24)),outline=Array.from({length:n},(_,i)=>[x+r*Math.cos(i*2*Math.PI/n),z+r*Math.sin(i*2*Math.PI/n)]);
    if(inner) {
      const hole=Array.from({length:n},(_,i)=>[x+inner*Math.cos(i*2*Math.PI/n),z+inner*Math.sin(i*2*Math.PI/n)]);
      for(let i=0;i<n;i++)prism([outline[i],outline[(i+1)%n],hole[(i+1)%n],hole[i]],top,thickness,m,layer,0,0,kind,SOURCE_PLAN);
    } else for(let i=0;i<n;i++)prism([[x,z],outline[i],outline[(i+1)%n]],top,thickness,m,layer,0,0,kind,SOURCE_PLAN);
  };
  const foliageCluster=(x,y,z,rx,ry,rz,kind,angle=0)=>{
    const p=add(x,y,z,rx*2,ry*2,rz*2,M.leaves,L.site,0,0,kind,angle);
    p.shape={type:'convex',planes:[]};
    for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){const n=[sx/rx,sy/ry,sz/rz],length=Math.hypot(...n);p.shape.planes.push([...n.map(v=>v/length),1/length]);}
    return p;
  };
  const ring=(x,z,r,y,height,depth,m,layer,kind,n=128)=>{
    for(let i=0;i<n;i++) {const a=2*Math.PI*i/n,b=2*Math.PI*(i+1)/n;edge([x+r*Math.cos(a),z+r*Math.sin(a)],[x+r*Math.cos(b),z+r*Math.sin(b)],y,height,depth,m,layer,0,0,kind);}
  };
  const plan=p=>p.map(sitePlanToStructure);
  const block=plan(BLOCK_PIXELS),bathtub=plan(BATHTUB_PIXELS);
  const towerH=(207+2/12)*FT/2;
  const towerCorner=(6+11/12)*FT;
  // The perimeter gallery is a building floor. SITE starts at its actual
  // outer edge, rather than rounded scan coordinates that left a 129 mm slot.
  const galleryOuter=towerH+.215,galleryCorner=towerCorner+(2-Math.SQRT2)*.215,northPixel=SITE_CALIBRATION.towerPixels[0],southPixel=SITE_CALIBRATION.towerPixels[1],scanScale=SITE_CALIBRATION.metresPerPixel;
  const northGallery={west:northPixel[0]-galleryOuter/scanScale,east:northPixel[0]+galleryOuter/scanScale,north:northPixel[1]-galleryOuter/scanScale,south:northPixel[1]+galleryOuter/scanScale};
  const southGallery={west:southPixel[0]-galleryOuter/scanScale,east:southPixel[0]+galleryOuter/scanScale,north:southPixel[1]-galleryOuter/scanScale,south:southPixel[1]+galleryOuter/scanScale};
  const raisedPixelPolygons=RAISED_PLAZA_PIXELS.map(poly=>poly.map(p=>[...p]));
  // The plaza's south-west return meets the end of the South Tower's
  // chamfer, not its scanned square bounding corner. Otherwise the attached
  // corner apron becomes an island above an open triangular concourse void.
  for(const point of raisedPixelPolygons[0]){
    if(point[0]===1059.6)point[0]=northGallery.east;
    if(point[0]===1238)point[0]=southGallery.east;
    if(point[1]===796)point[1]=southGallery.north+galleryCorner/scanScale;
  }
  raisedPixelPolygons[1]=[[northGallery.west,496],[northGallery.east,496],[northGallery.east,northGallery.north],[northGallery.west,northGallery.north]];
  raisedPixelPolygons[2]=[[northGallery.west,northGallery.south],[northGallery.east,northGallery.south],[northGallery.east,713],[northGallery.west,713]];
  const raisedPlazas=raisedPixelPolygons.map(plan);
  const towerPolygons=SITE_CALIBRATION.towerPixels.map(p=>{const[x,z]=sitePlanToStructure(p),h=towerH,c=towerCorner;return [[x-h,z-h+c],[x-h+c,z-h],[x+h-c,z-h],[x+h,z-h+c],[x+h,z+h-c],[x+h-c,z+h],[x-h+c,z+h],[x-h,z+h-c]];});
  const galleryPolygons=SITE_CALIBRATION.towerPixels.map(p=>{const[x,z]=sitePlanToStructure(p),h=galleryOuter,c=galleryCorner;return [[x-h,z-h+c],[x-h+c,z-h],[x+h-c,z-h],[x+h,z-h+c],[x+h,z+h-c],[x+h-c,z+h],[x-h+c,z+h],[x-h,z+h-c]];});
  const defs=PLAN_BUILDINGS.map(b=>({...b,footprint:plan(b.polygon),...(b.typicalPolygon?{typicalFootprint:plan(b.typicalPolygon),groundFootprint:plan(HOTEL_PODIUM_PROFILE.groundPolygon),groundPolygon:HOTEL_PODIUM_PROFILE.groundPolygon,publicFootprint:plan(HOTEL_PODIUM_PROFILE.publicPolygon),publicPolygon:HOTEL_PODIUM_PROFILE.publicPolygon,podiumProfile:HOTEL_PODIUM_PROFILE,publicFootprintConfidence:HOTEL_PODIUM_PROFILE.registration}:{})}));
  const allFootprints=[...towerPolygons,...defs.map(b=>b.groundFootprint||b.publicFootprint||b.footprint)];
  // The gallery has an offset chamfer, while the scan's adjoining plaza
  // boundaries were squared off at the bounding box. These eight triangles
  // are the precise exterior residual between that octagon and its box.
  // Keeping them explicit closes the corner interfaces without filling a lobby.
  const plazaCornerClosures=[];
  for(const [x,z] of SITE_CALIBRATION.towerPixels.map(sitePlanToStructure))for(const sx of [-1,1])for(const sz of [-1,1]){
    const outer=[x+sx*galleryOuter,z+sz*galleryOuter];
    const poly=[outer,[outer[0]-sx*galleryCorner,outer[1]],[outer[0],outer[1]-sz*galleryCorner]];
    plazaCornerClosures.push(poly);
  }
  raisedPlazas.push(...plazaCornerClosures);
  // The sourced interior floor edge is 18 in behind the outer column cover.
  // A solid curtain-wall base joins it to the structural-reference footprint;
  // it is part of each tower's floor, including when SITE is hidden.
  for(let i=0;i<towerPolygons.length;i++){
    const [x,z]=sitePlanToStructure(SITE_CALIBRATION.towerPixels[i]),r=towerH+.23-18*.0254-.004,c=towerCorner+(2-Math.SQRT2)*(r-towerH);
    const interior=[[x-r,z-r+c],[x-r+c,z-r],[x+r-c,z-r],[x+r,z-r+c],[x+r,z+r-c],[x+r-c,z+r],[x-r+c,z+r],[x-r,z+r-c]];
    fill(towerPolygons[i],0,.26,M.curb,L.floors,i+1,1,'continuous tower curtain-wall footing',[interior],SOURCE_PLAN);
  }

  // JK-10 is explicitly an INITIAL 1968 grade sheet, not a 2001 survey.
  // Western curb values can be read; Church/eastern endpoints remain estimated.
  const streetLevels={west:(306-310)*FT,church:4.55,vesey:(304.5-310)*FT,liberty:(307.5-310)*FT};
  onProgress('重建原总图中的道路、抬高广场及四栋低层建筑…');
  const cityBounds=rectangle(-520,-520,520,520);
  const completedPlazaPolygons=[];
  for(const poly of raisedPlazas) {
    // Only this level uses the gallery's offset footprint. The concourse
    // and basement openings retain their structural-reference octagons.
    const holes=[...galleryPolygons,...defs.map(b=>b.publicFootprint||b.footprint),...completedPlazaPolygons];
    fill(poly,SITE_PLAZA_ELEVATION,.12,M.paving,L.site,0,0,'raised Austin Tobin plaza',holes,SOURCE_PLAN);
    fill(poly,SITE_PLAZA_ELEVATION-.12,.36,M.concrete,L.basement,0,1,'plaza structural deck under paving',holes,SOURCE_PLAN);
    completedPlazaPolygons.push(poly);
  }

  const interpolate=(v,values)=>{
    if(v<=values[0][0])return values[0][1];
    for(let i=1;i<values.length;i++)if(v<=values[i][0]){const[a,ya]=values[i-1],[b,yb]=values[i];return ya+(yb-ya)*(v-a)/(b-a);}
    return values[values.length-1][1];
  };
  const gradeSection=z=>{
    const v=Math.max(255,Math.min(1050,SITE_CALIBRATION.imageOrigin[1]-z/SITE_CALIBRATION.metresPerPixel)),t=(v-255)/795;
    return {v,u:[interpolate(v,[[255,674],[603,769],[1050,904]]),1145+155*t,1594+10*t],y:[interpolate(v,[[255,streetLevels.vesey],[603,streetLevels.west],[1050,streetLevels.liberty]]),1.55+.25*t,4.45+.20*t]};
  };
  // One continuous grade field supplies streets, their intersections, sidewalks
  // and surrounding ground. Former nearest-segment/tile datums made abrupt
  // height changes even where two neighbouring strips belonged to one court.
  const initialGroundHeight=(x,z)=>{
    const {u,y}=gradeSection(z),pixel=SITE_CALIBRATION.imageOrigin[0]+x/SITE_CALIBRATION.metresPerPixel;
    return interpolate(pixel,u.map((v,i)=>[v,y[i]]));
  };
  // Every street, sidewalk, junction and soil layer clips against this same
  // continuous triangulated grade field. Adjacent materials therefore share
  // both the boundary vertex and its elevation, including cross slopes.
  const gradeRows=[-8000,255,603,1050,8000],gradeTriangles=[];
  for(let row=0;row<gradeRows.length-1;row++) {
    const edgeAt=v=>{const z=sitePlanToStructure([0,v])[1],g=gradeSection(z);return [-8000,...g.u,8000].map(u=>sitePlanToStructure([u,v]));};
    const a=edgeAt(gradeRows[row]),b=edgeAt(gradeRows[row+1]);
    for(let column=0;column<a.length-1;column++)gradeTriangles.push(...triangulateConvex([a[column],a[column+1],b[column+1],b[column]]));
  }
  const streetSurface=makeSurface(gradeTriangles,initialGroundHeight),groundHeight=Object.assign(streetSurface.height,{surface:streetSurface});
  groundHeight.gradeBounds=[sitePlanToStructure([0,1050])[1],sitePlanToStructure([0,255])[1]];
  groundHeight.rowBreaks=[255,603,1050].map(v=>sitePlanToStructure([0,v])[1]);
  groundHeight.xBreaks=z=>gradeSection(z).u.map(u=>sitePlanToStructure([u,0])[0]);
  const offsetGrade=(grade,offset)=>Object.assign((x,z)=>grade(x,z)+offset,{gradeBounds:grade.gradeBounds,rowBreaks:grade.rowBreaks,xBreaks:grade.xBreaks,surface:grade.surface,surfaceOffset:(grade.surfaceOffset||0)+offset});
  const cityGrade=offsetGrade(groundHeight,-.23);
  const roads=[
    {name:'West Street',points:[[638,125],[674,255],[769,603],[904,1050],[923,1120]],width:42,grades:[-1.75,streetLevels.vesey,streetLevels.west,streetLevels.liberty,-.70],elevation:streetLevels.west,source:'pa-18324-grade'},
    {name:'Church Street',points:[[1593,-700],[1594,275],[1604,1050],[1605,2200]],width:23,grades:[4.35,4.45,4.65,4.70],elevation:streetLevels.church,source:SOURCE_PLAN},
    {name:'Vesey Street',points:[[674,255],[1145,265],[1594,275],[2490,279]],width:14,grades:[streetLevels.vesey,1.55,4.45,4.45],elevation:streetLevels.vesey,source:'pa-18324-grade'},
    {name:'Liberty Street',points:[[904,1050],[1300,1050],[1604,1050],[2490,1050]],width:18,grades:[streetLevels.liberty,1.8,4.65,4.65],elevation:streetLevels.liberty,source:'pa-18324-grade'},
    {name:'Fulton Street',points:[[1597,470],[2490,470]],width:14,source:SOURCE_PLAN},
    {name:'Dey Street',points:[[1599,633],[2490,633]],width:12,source:SOURCE_PLAN},
    {name:'Cortlandt Street',points:[[1601,840],[2490,840]],width:14,source:SOURCE_PLAN}
  ];
  for(const road of roads){road.initialGrades=road.grades;road.grades=road.points.map(p=>groundHeight(...sitePlanToStructure(p)));}
  const roadSegments=roads.flatMap(r=>r.points.slice(0,-1).map((a,i)=>({road:r,a:sitePlanToStructure(a),b:sitePlanToStructure(r.points[i+1]),ya:r.grades[i],yb:r.grades[i+1]})));
  const segmentOutline=({road:r,a,b},apron=0)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len*(r.width/2+apron),nz=dx/len*(r.width/2+apron);
    return [[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]];
  };
  const disc=(x,z,r,n=32)=>Array.from({length:n},(_,i)=>[x+r*Math.cos(i*2*Math.PI/n),z+r*Math.sin(i*2*Math.PI/n)]);
  const smoothPath=(points,subdivisions=6)=>{
    // Monotone Hermite tangents keep the driveway within its registered
    // control-point envelope. Catmull-Rom overshot into the pedestrian strip.
    const tangents=points.map((p,i)=>[0,1].map(axis=>{
      if(!i)return points[1][axis]-p[axis];
      if(i===points.length-1)return p[axis]-points[i-1][axis];
      const left=p[axis]-points[i-1][axis],right=points[i+1][axis]-p[axis];
      return left*right<=0?0:2*left*right/(left+right);
    }));
    return points.slice(0,-1).flatMap((b,i)=>Array.from({length:subdivisions},(_,j)=>{
      const t=j/subdivisions,t2=t*t,t3=t2*t,c=points[i+1];
      return [0,1].map(axis=>(2*t3-3*t2+1)*b[axis]+(t3-2*t2+t)*tangents[i][axis]+(-2*t3+3*t2)*c[axis]+(t3-t2)*tangents[i+1][axis]);
    })).concat([points.at(-1)]);
  };
  const ribbonOutline=(points,width)=>{
    const left=[],right=[];
    for(let i=0;i<points.length;i++){
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length*width/2,nz=dx/length*width/2;
      left.push([points[i][0]+nx,points[i][1]+nz]);right.push([points[i][0]-nx,points[i][1]-nz]);
    }
    return [...left,...right.reverse()];
  };
  const junctions=new Map(),registerJunction=(p,road)=>{
    const key=p.map(v=>v.toFixed(3)).join(','),node=junctions.get(key)||{point:p,width:0,names:[]};
    node.width=Math.max(node.width,road.width);if(!node.names.includes(road.name))node.names.push(road.name);junctions.set(key,node);
  };
  for(const {road,a,b} of roadSegments)for(const p of [a,b])registerJunction(p,road);
  // Join actual crossing centerlines, including the three eastern streets
  // that enter midway along Church Street. Do not cap every polyline vertex:
  // those oversized sidewalk discs created isolated U-shaped road ends.
  for(let i=0;i<roadSegments.length;i++)for(let j=i+1;j<roadSegments.length;j++){
    const a=roadSegments[i],b=roadSegments[j];if(a.road===b.road)continue;
    const rx=a.b[0]-a.a[0],rz=a.b[1]-a.a[1],sx=b.b[0]-b.a[0],sz=b.b[1]-b.a[1],den=rx*sz-rz*sx;
    if(Math.abs(den)<1e-8)continue;
    const qx=b.a[0]-a.a[0],qz=b.a[1]-a.a[1],t=(qx*sz-qz*sx)/den,u=(qx*rz-qz*rx)/den;
    if(t<-.0001||t>1.0001||u<-.0001||u>1.0001)continue;
    const p=[a.a[0]+rx*t,a.a[1]+rz*t];registerJunction(p,a.road);registerJunction(p,b.road);
  }
  const roadPolygons=roadSegments.map(s=>segmentOutline(s)),trueJunctions=[...junctions.values()].filter(j=>j.names.length>1),roadHoles=[...roadSegments.map(s=>segmentOutline(s,3.84)),...trueJunctions.map(j=>disc(...j.point,j.width/2+3.84))];
  // Fill only the paved core at same-street bends. Their sidewalks continue
  // as strips, rather than receiving a full circular junction apron.
  const pavedBends=[];
  for(const road of roads)for(let i=1;i<road.points.length-1;i++){
    const p=sitePlanToStructure(road.points[i]),a=sitePlanToStructure(road.points[i-1]),b=sitePlanToStructure(road.points[i+1]);
    const v0=[p[0]-a[0],p[1]-a[1]],v1=[b[0]-p[0],b[1]-p[1]],turn=Math.acos(Math.max(-1,Math.min(1,(v0[0]*v1[0]+v0[1]*v1[1])/(Math.hypot(...v0)*Math.hypot(...v1)))));
    if(turn>.015)pavedBends.push({poly:disc(...p,road.width/2+.025,32),road});
  }
  // Finite city terrain follows the independent street datums. Road and block
  // holes prevent a blanket city plane from burying streets or capping basements.
  fill(cityBounds,cityGrade,.18,M.city,L.site,0,0,'distant urban surface',[block,...roadHoles],SOURCE_PLAN,.65);
  fill(cityBounds,offsetGrade(cityGrade,-.18),24,M.soil,L.site,0,0,'soil outside the common basement',[block,bathtub,...roadHoles],SOURCE_PLAN,.65);
  // A coarse outer apron moves the finite terrain edge beyond normal views.
  // Its subdued texture is visual context, not a surveyed Manhattan parcel map.
  const innerTerrain=rectangle(-520,-520,520,520);
  const outerTerrain=rectangle(-2048,-2048,2048,2048);
  fill(outerTerrain,cityGrade,.18,M.city,L.site,0,0,'distant urban apron',[innerTerrain],SOURCE_PLAN,256);
  fill(outerTerrain,offsetGrade(cityGrade,-.18),24,M.soil,L.site,0,0,'distant soil apron',[innerTerrain],SOURCE_PLAN,256);
  // West-facing street entrances meet the EL 310 lobby/concourse, not the
  // EL 332 main plaza. Other outer courts approach their adjacent street grade.
  // Thin paving caps are removable with SITE, exposing the shared basement.
  // A concourse terrace has a fixed datum. Only these explicitly bounded
  // perimeter approach bands change grade; proximity to a building or column
  // no longer bends every paving tile into an invented nearest-object slope.
  const roadApproaches=[];
  for(const segment of roadSegments){
    const {road:r,a,b}=segment,side={ 'West Street':1,'Church Street':-1,'Vesey Street':-1,'Liberty Street':1}[r.name];if(!side)continue;
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length*side,nz=dx/length*side,outer=r.width/2+3.84,run=12;
    const p=[a[0]+nx*outer,a[1]+nz*outer],q=[b[0]+nx*outer,b[1]+nz*outer],rr=[b[0]+nx*(outer+run),b[1]+nz*(outer+run)],ss=[a[0]+nx*(outer+run),a[1]+nz*(outer+run)];
    const poly=[p,q,rr,ss],height=(x,z)=>{const blend=Math.max(0,Math.min(1,((x-p[0])*nx+(z-p[1])*nz)/run));return (groundHeight(x,z)+.15)*(1-blend);};
    roadApproaches.push({poly,height,road:r.name,run,innerElevation:0});
  }
  const entryPlatforms=[];
  // The August 2001 Liberty Street photograph shows the WTC 4 mall doors and
  // arcade glazing meeting the street forecourt. The former EL332 strip at
  // v994..1010 incorrectly put a tall plaza retaining wall across that facade.
  // Reconstruct this whole frontage through the common grade surface. Only
  // its street/plaza relationship is photographic evidence; absolute eastern
  // curb heights and the finite transition band remain reconstruction estimates.
  const libertyArcadeCourt=plan([[1238,950],[1560,950],[1560,1016],[1238,1016]]);
  const initialForecourtHeight=(x,z)=>{
    const p=[x,z];if(roadHoles.some(poly=>pointInside(p,poly)))return groundHeight(x,z)+.15;
    const approach=roadApproaches.find(region=>pointInside(p,region.poly)),baseHeight=approach?approach.height(x,z):0;
    if(pointInside(p,libertyArcadeCourt)){
      const u=SITE_CALIBRATION.imageOrigin[0]+x/scanScale,v=SITE_CALIBRATION.imageOrigin[1]-z/scanScale,blend=Math.min(Math.max(0,Math.min(1,(u-1238)/24)),Math.max(0,Math.min(1,(v-950)/18)));
      return baseHeight*(1-blend)+(groundHeight(x,z)+.15)*blend;
    }
    return baseHeight;
  };
  const courtTriangles=[];
  for(const piece of polygonPieces(block,[...allFootprints,...raisedPlazas,...roadHoles,libertyArcadeCourt,...roadApproaches.map(region=>region.poly)]))courtTriangles.push(...triangulateConvex(piece));
  const builtApproaches=[];
  for(const approach of roadApproaches){
    for(const piece of polygonPieces(approach.poly,[...allFootprints,...raisedPlazas,...roadHoles,libertyArcadeCourt,...builtApproaches],block))for(const cell of streetSurface.candidates(piece)){
      const clipped=clipConvex(piece,cell.poly);if(clipped.length)courtTriangles.push(...triangulateConvex(clipped));
    }
    builtApproaches.push(approach.poly);
  }
  // The driveway crosses the sidewalk apron. Include that part in the shared
  // field at the exact street grade, so cutting its curb does not leave a hole.
  const builtAprons=[];
  for(const apron of roadHoles){for(const piece of polygonPieces(apron,[...allFootprints,...raisedPlazas,libertyArcadeCourt,...builtAprons],block))for(const cell of streetSurface.candidates(piece)) {
    const clipped=clipConvex(piece,cell.poly);if(clipped.length)courtTriangles.push(...triangulateConvex(clipped));
  }builtAprons.push(apron);}
  for(const piece of polygonPieces(libertyArcadeCourt,[...allFootprints,...raisedPlazas],block))for(const cell of streetSurface.candidates(piece)){
    const clipped=clipConvex(piece,cell.poly);if(clipped.length)courtTriangles.push(...triangulateConvex(clipped));
  }
  const courtSurface=makeSurface(courtTriangles,initialForecourtHeight),forecourtHeight=Object.assign(courtSurface.height,{surface:courtSurface});
  forecourtHeight.rowBreaks=groundHeight.rowBreaks;
  forecourtHeight.xBreaks=z=>groundHeight.xBreaks(z);
  const hotelVehicleDef=defs.find(b=>b.id===3),vehicleOutline=hotelVehicleDef.groundFootprint;
  const vehicleA=vehicleOutline[5],vehicleB=vehicleOutline[0],vehicleLength=Math.hypot(vehicleB[0]-vehicleA[0],vehicleB[1]-vehicleA[1]);
  const vehicleTangent=vehicleB.map((v,i)=>(v-vehicleA[i])/vehicleLength),vehicleInward=[vehicleTangent[1],-vehicleTangent[0]],vehicleCentre=vehicleA.map((v,i)=>v+(vehicleB[i]-v)*.72);
  const vehicleAt=(u,n)=>vehicleCentre.map((v,i)=>v+vehicleTangent[i]*u+vehicleInward[i]*n);
  const hotelVehicleAccess=hotelVehicleDef.vehicleAccess={edgeIndex:5,t:.72,width:6.8,height:2.95,centre:vehicleCentre,tangent:vehicleTangent,inward:vehicleInward,threshold:forecourtHeight(...vehicleAt(0,-.01)),levelLandingDepth:3,source:'user-hotel-west-entrance',surveyed:false};
  // The exterior vehicle opening meets the uninterrupted forecourt. The
  // former ramp excavation began on the sidewalk, before the stone wall.
  // Reserve the approach for planting only; do not subtract it from paving.
  const rampHole=[vehicleAt(-3.7,-12),vehicleAt(3.7,-12),vehicleAt(3.7,3),vehicleAt(-3.7,3)];
  const vehicleApproachOutline=[vehicleAt(-4.4,-12),vehicleAt(4.4,-12),vehicleAt(4.4,.02),vehicleAt(-4.4,.02)];
  const vehicleHeight=(x,z)=>{
    const delta=[x-vehicleCentre[0],z-vehicleCentre[1]],u=delta.reduce((s,v,i)=>s+v*vehicleTangent[i],0),point=[x,z];
    if(roadPolygons.some(poly=>pointInside(point,poly)))return groundHeight(x,z);
    const old=roadHoles.some(poly=>pointInside(point,poly))?groundHeight(x,z)+.15:forecourtHeight(x,z);
    // The approach starts at the actual carriageway edge. A fixed nine-metre
    // blend previously lifted part of West Street and painted it as paving.
    const streetDistance=Math.min(...roadPolygons.map(poly=>distanceToOutline(point,poly))),facadePoint=vehicleAt(u,0),run=Math.min(...roadPolygons.map(poly=>distanceToOutline(facadePoint,poly)));
    const side=Math.max(0,Math.min(1,(4.4-Math.abs(u)))),q=Math.max(0,Math.min(1,streetDistance/run)),blend=q*q*(3-2*q),target=groundHeight(x,z)*(1-blend)+hotelVehicleAccess.threshold*blend;
    return old+(target-old)*side;
  };
  // Use one triangulated surface for the drop curb, driveway and paving,
  // including lateral blends back to the unchanged neighboring sidewalk.
  const vehicleTriangles=[];
  for(let u=-4.4;u<4.4-1e-7;u+=.8)for(let n=-12;n<.02-1e-7;n+=.8){
    const v=Math.min(4.4,u+.8),m=Math.min(.02,n+.8),quad=[vehicleAt(u,n),vehicleAt(v,n),vehicleAt(v,m),vehicleAt(u,m)];
    for(const piece of polygonPieces(quad,roadPolygons))vehicleTriangles.push(...triangulateConvex(piece));
  }
  const vehicleSurface=makeSurface(vehicleTriangles,vehicleHeight),vehicleGrade=Object.assign(vehicleSurface.height,{surface:vehicleSurface});
  hotelVehicleAccess.approachOutline=vehicleApproachOutline;
  // Both ends of the photographed drop-off return to West Street. The former
  // seven discs ended at the south gallery instead of providing an exit.
  const taxiLaneU=SITE_CALIBRATION.towerPixels[0][0]-(towerH+8.9)/scanScale;
  const taxiPixelAnchors=[[790,525],[832,544],[taxiLaneU,558],[taxiLaneU,576],[taxiLaneU,602],[taxiLaneU,629],[taxiLaneU,647],[839,666],[811,685]],taxiPoints=smoothPath(plan(taxiPixelAnchors),12),taxiWidth=3.8;
  const taxiHoles=[ribbonOutline(taxiPoints,taxiWidth)];
  const ease=t=>t*t*(3-2*t);
  const taxiHeights=taxiPoints.map((p,i)=>{const t=i/(taxiPoints.length-1);return t<1/3?groundHeight(...taxiPoints[0])+(-.15-groundHeight(...taxiPoints[0]))*ease(t*3):t>2/3?-.15+(groundHeight(...taxiPoints.at(-1))+.15)*ease((t-2/3)*3):-.15;});
  const initialTaxiHeight=(x,z)=>{
    const p=[x,z];if(roadPolygons.some(poly=>pointInside(p,poly)||distanceToOutline(p,poly)<1e-7))return groundHeight(x,z);
    let distance=Infinity,height=-.15;
    for(let i=0;i<taxiPoints.length-1;i++){const a=taxiPoints[i],b=taxiPoints[i+1],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);if(d<distance){distance=d;height=taxiHeights[i]+(taxiHeights[i+1]-taxiHeights[i])*t;}}
    // Tangent street joins: no abrupt ramp normal at the asphalt boundary.
    // The same field also supplies yellow paint and the structural roadbed.
    const streetDistance=Math.min(...roadPolygons.map(poly=>distanceToOutline(p,poly))),blend=ease(Math.min(1,streetDistance/6));
    return groundHeight(x,z)*(1-blend)+height*blend;
  };
  const left=taxiHoles[0].slice(0,taxiPoints.length),right=taxiHoles[0].slice(taxiPoints.length).reverse(),taxiTriangles=[];
  for(let i=0;i<taxiPoints.length-1;i++){
    const quad=[left[i],left[i+1],right[i+1],right[i]],covered=[];
    for(const road of roadPolygons){for(const part of polygonPieces(road,covered,quad))for(const cell of streetSurface.candidates(part)){const clipped=clipConvex(part,cell.poly);if(clipped.length)taxiTriangles.push(...triangulateConvex(clipped));}covered.push(road);}
    for(const part of polygonPieces(quad,roadPolygons))taxiTriangles.push(...triangulateConvex(part));
  }
  const taxiSurface=makeSurface(taxiTriangles,initialTaxiHeight),taxiGrade=Object.assign(taxiSurface.height,{surface:taxiSurface});
  const islandOutline=plan([[826,566],[833,572],[840,589],[844,610],[840,630],[834,634],[835,613],[830,591],[821,575]]);
  const courtHoles=[...allFootprints,...raisedPlazas,...taxiHoles,...roadHoles,islandOutline,vehicleApproachOutline];
  const buildForecourt=()=>{
    const holes=[...courtHoles,...entryPlatforms.map(platform=>platform.envelope)];
    fill(block,forecourtHeight,.18,M.paving,L.site,0,0,'street/concourse forecourt paving',holes,SOURCE_PLAN);
    fill(block,offsetGrade(forecourtHeight,-.18),.24,M.concrete,L.site,0,0,'street forecourt structural deck',holes,SOURCE_PLAN);
  };
  const [northCourtX,northCourtZ]=sitePlanToStructure(SITE_CALIBRATION.towerPixels[0]);
  const northWalk=rectangle(northCourtX-towerH-6,northCourtZ-20.3,northCourtX-towerH,northCourtZ+20.3);
  entryPlatforms.push({tower:1,envelope:northWalk,height:()=>0,threshold:0,source:'user-street-entrance-reference'});
  fill(northWalk,0,.72,M.paving,L.site,0,0,'North Tower fixed concourse entry terrace',[...taxiHoles,...allFootprints]);
  const pavedRoadParts=[];
  for(const segment of roadSegments) {
    const {road:r,a,b,ya,yb}=segment;
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
    const roadPoly=segmentOutline(segment);
    fill(roadPoly,groundHeight,.13,M.asphalt,L.site,0,0,`${r.name} asphalt`,[...allFootprints,...raisedPlazas,...taxiHoles,...pavedRoadParts],r.source);pavedRoadParts.push(roadPoly);
    fill(segmentOutline(segment,3.95),offsetGrade(groundHeight,-.13),24,M.soil,L.site,0,0,`${r.name} subgrade soil`,[block,bathtub],r.source);
    for(const side of [-1,1]) {
      const aa=[a[0]+nx*side*(r.width/2+2),a[1]+nz*side*(r.width/2+2)],bb=[b[0]+nx*side*(r.width/2+2),b[1]+nz*side*(r.width/2+2)];
      const interruptedStrip=(start,end,depth,height,kind)=>{
        const cuts=roadSegments.filter(s=>s!==segment&&s.road!==r).flatMap(s=>{
          const poly=segmentOutline({...s,road:{width:s.road.width+depth+.04}}).map(p=>[(p[0]-start[0])*dx/len+(p[1]-start[1])*dz/len,(p[0]-start[0])*nx+(p[1]-start[1])*nz]);
          return rowIntervals(poly,0);
        });
        for(const [lo,hi] of subtractIntervals([[0,len]],cuts))if(hi-lo>.02){
          const p=[start[0]+dx*lo/len,start[1]+dz*lo/len],q=[start[0]+dx*hi/len,start[1]+dz*hi/len];
          fill(segmentOutline({road:{width:depth},a:p,b:q}),offsetGrade(groundHeight,.15),height,M.curb,L.site,0,0,kind,[...allFootprints,...taxiHoles,vehicleApproachOutline],r.source);
        }
      };
      interruptedStrip(aa,bb,3.8,.19,`${r.name} sidewalk`);
      interruptedStrip([a[0]+nx*side*r.width/2,a[1]+nz*side*r.width/2],[b[0]+nx*side*r.width/2,b[1]+nz*side*r.width/2],.19,.18,`${r.name} curb`);
    }
    for(let d=5;d<len-4;d+=9)for(const lane of [-1,1]) {
      const start=d/len,end=Math.min(d+3,len)/len,offset=lane*(r.width>30?6.2:3.3);
      const pa=[a[0]+dx*start+nx*offset,a[1]+dz*start+nz*offset],pb=[a[0]+dx*end+nx*offset,a[1]+dz*end+nz*offset];
      fill(segmentOutline({road:{width:.13},a:pa,b:pb}),offsetGrade(groundHeight,.012),.012,M.paint,L.site,0,0,`${r.name} lane marking`,[block],r.source);
    }
  }
  for(const {poly,road} of pavedBends){fill(poly,groundHeight,.13,M.asphalt,L.site,0,0,`${road.name} paved bend`,[...allFootprints,...raisedPlazas,...taxiHoles,...pavedRoadParts],road.source);pavedRoadParts.push(poly);}
  const junctionSidewalks=[];
  for(const node of trueJunctions) {
    const outer=disc(...node.point,node.width/2+3.9),inner=disc(...node.point,node.width/2+.02),label=node.names.join(' / ');
    fill(outer,offsetGrade(groundHeight,.15),.19,M.curb,L.site,0,0,`${label} junction sidewalk`,[inner,...roadPolygons,...allFootprints,...taxiHoles,...junctionSidewalks],SOURCE_PLAN);junctionSidewalks.push(outer);
    fill(inner,groundHeight,.13,M.asphalt,L.site,0,0,`${label} junction asphalt`,[...allFootprints,...raisedPlazas,...taxiHoles,...pavedRoadParts],SOURCE_PLAN);pavedRoadParts.push(inner);
    fill(outer,offsetGrade(groundHeight,-.13),24,M.soil,L.site,0,0,`${label} junction subgrade soil`,[block,bathtub],SOURCE_PLAN);
  }
  const upperSurface=(x,z)=>{
    if(pointInside([x,z],vehicleApproachOutline))return vehicleGrade(x,z);
    for(let i=0;i<allFootprints.length;i++)if(pointInside([x,z],allFootprints[i]))return i===2?streetLevels.west:0;
    if(raisedPlazas.some(p=>pointInside([x,z],p)))return SITE_PLAZA_ELEVATION;
    if(taxiHoles.some(p=>pointInside([x,z],p)))return taxiGrade(x,z);
    for(const platform of entryPlatforms)if(pointInside([x,z],platform.envelope))return platform.height(x,z);
    if(pavedRoadParts.some(p=>pointInside([x,z],p)))return groundHeight(x,z);
    if(roadHoles.some(p=>pointInside([x,z],p)))return groundHeight(x,z)+.15;
    if(pointInside([x,z],block))return forecourtHeight(x,z);
    return cityGrade(x,z);
  };
  // Low-building modules call this for source-registered door locations. It
  // creates a local, documented threshold and explicit circulation rather
  // than using that door to change the grade of the whole forecourt.
  const getEntrySurface=(portal,b)=>{
    const outline=portal.outline||b.publicFootprint||b.footprint||b.structuralFootprint;
    if(!outline?.length||!portal.pixel)return Number(portal.threshold??portal.defaultY??0);
    const index=portal.edgeIndex??0,a=outline[index%outline.length],bb=outline[(index+1)%outline.length],dx=bb[0]-a[0],dz=bb[1]-a[1],length=Math.hypot(dx,dz),point=sitePlanToStructure(portal.pixel),t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(length*length))),center=[a[0]+dx*t,a[1]+dz*t],tangent=[dx/length,dz/length];
    let threshold=portal.thresholdFromStreetGrade?groundHeight(...center)+.15:Number(portal.threshold??portal.defaultY??0);
    let normal=[-tangent[1],tangent[0]];if(pointInside([center[0]+normal[0]*.05,center[1]+normal[1]*.05],outline))normal=normal.map(v=>-v);
    const width=Number(portal.width??portal.openingWidth??3.6),depth=Number(portal.platformDepth??2.6),outside=distance=>[center[0]+normal[0]*distance,center[1]+normal[1]*distance];
    if(portal.side==='plaza'){
      const near=outside(-.10),far=outside(depth),envelope=[[near[0]-tangent[0]*width/2,near[1]-tangent[1]*width/2],[far[0]-tangent[0]*width/2,far[1]-tangent[1]*width/2],[far[0]+tangent[0]*width/2,far[1]+tangent[1]*width/2],[near[0]+tangent[0]*width/2,near[1]+tangent[1]*width/2]];
      // These doors already meet the continuous raised plaza. Keep a planting
      // clearance without adding a second slab or stairs through that plaza.
      entryPlatforms.push({tower:b.id,envelope,threshold:SITE_PLAZA_ELEVATION,source:portal.source||b.source||SOURCE_PLAN,surveyed:!!portal.surveyed,height:()=>SITE_PLAZA_ELEVATION});return SITE_PLAZA_ELEVATION;
    }
    let run=3.0,approach=forecourtHeight(...outside(depth+run));
    for(let i=0;i<3;i++){
      if(Number.isFinite(portal.thresholdRiseFromSidewalk))threshold=approach+portal.thresholdRiseFromSidewalk;
      const steps=Math.ceil(Math.abs(threshold-approach)/.17);run=Math.max(.75,Math.min(7.5,steps*.29));approach=forecourtHeight(...outside(depth+run));
    }
    if(Number.isFinite(portal.thresholdRiseFromSidewalk))threshold=approach+portal.thresholdRiseFromSidewalk;
    // Elevated street thresholds now lie behind the deep open canopy. Carry
    // the existing threshold platform to the internal landing at the actual
    // glazing plane; the old 100 mm return left a 4.76 m drop to EL310.
    const inwardDepth=b.id>=4&&Math.abs(threshold)>.01?Number(portal.glazingRecess??0)+.05:.10;
    const count=Math.max(1,Math.ceil(Math.abs(threshold-approach)/.17)),front=outside(depth),end=outside(depth+run),rect=(near,far)=>[[near[0]-tangent[0]*width/2,near[1]-tangent[1]*width/2],[far[0]-tangent[0]*width/2,far[1]-tangent[1]*width/2],[far[0]+tangent[0]*width/2,far[1]+tangent[1]*width/2],[near[0]+tangent[0]*width/2,near[1]+tangent[1]*width/2]],platform=rect(outside(-inwardDepth),front),envelope=rect(outside(-inwardDepth),outside(depth+run+.72));
    const foot=Math.min(threshold,approach,...envelope.map(p=>forecourtHeight(...p)))-.38;
    fill(platform,threshold,Math.max(.26,threshold-foot),M.curb,L.site,0,0,`WTC ${b.id} street entrance platform`,[],portal.source||b.source||SOURCE_PLAN);
    for(let step=0;step<count;step++){
      const top=threshold+(approach-threshold)*(step+1)/count,poly=rect(outside(depth+run*step/count),outside(depth+run*(step+1)/count));
      fill(poly,top,Math.max(.22,top-foot),M.curb,L.site,0,0,`WTC ${b.id} street entrance stair tread`,[],portal.source||b.source||SOURCE_PLAN);
    }
    fill(rect(end,outside(depth+run+.72)),approach,Math.max(.26,approach-foot),M.curb,L.site,0,0,`WTC ${b.id} street entrance lower landing`,[],portal.source||b.source||SOURCE_PLAN);
    entryPlatforms.push({tower:b.id,envelope,platform,threshold,approach,normal,center,run,depth,inwardDepth,width,source:portal.source||b.source||SOURCE_PLAN,surveyed:!!portal.surveyed,height:(x,z)=>{const d=(x-center[0])*normal[0]+(z-center[1])*normal[1];return d<=depth?threshold:threshold+(approach-threshold)*Math.min(1,Math.ceil(Math.max(0,d-depth)/run*count)/count);}});
    portal.exteriorAccess={threshold,approach,run,depth,steps:count,width};
    return threshold;
  };
  // Keep underground walls and service partitions below the actual site
  // surface. The western street is lower than the plaza datum, so a single
  // flat slurry-wall cap incorrectly appeared through pavement by several
  // metres. Short graded sections track the stepped surface without making
  // a terrain-sized mesh.
  const terrainCappedWall=(a,b,bottom,requestedTop,depth,m,layer,tower,floor,kind,source)=>{
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),segments=Math.max(1,Math.ceil(length/1.5));
    for(let i=0;i<segments;i++){
      const t0=i/segments,t1=(i+1)/segments;
      const p=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0],q=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1];
      const topA=Math.min(requestedTop,upperSurface(...p)-.14),topB=Math.min(requestedTop,upperSurface(...q)-.14);
      if(Math.max(topA,topB)<=bottom+.08)continue;
      const nx=-(b[1]-a[1])/length,nz=(b[0]-a[0])/length,midpoint=[(p[0]+q[0])/2,(p[1]+q[1])/2];
      const tops=[p,midpoint,q].flatMap(v=>[-1,0,1].map(side=>upperSurface(v[0]+nx*side*depth/2,v[1]+nz*side*depth/2)-.14));
      const top=Math.min(topA,topB,...tops);
      if(top<=bottom+.08)continue;
      // A conservative cap remains underground at material/terrace changes;
      // the removable site deck, rather than a sticking-up wall, closes above it.
      edge(p,q,(top+bottom)/2,top-bottom,depth,m,layer,tower,floor,kind,source);
    }
  };
  // A street-side entrance is distinct from the raised plaza entrances. The
  // north tower's western taxi loop and glazed porte-cochere are fitted
  // to SKA 54/84 and the supplied historical photograph, not repeated on every
  // tower face. Exact 2001 canopy dimensions and curb radii remain estimates.
  const westTowerCenter=sitePlanToStructure(SITE_CALIBRATION.towerPixels[0]),westFacade=westTowerCenter[0]-towerH;
  // The West Street porch serves the concourse-level door (EL 310). Its roof
  // attaches near the plaza fascia, with the actual gallery datum unchanged.
  const canopyProfile=WEST_ENTRANCE_CANOPY,canopyWidth=canopyProfile.depth,canopyLength=canopyProfile.alongWallLength,canopyTop=canopyProfile.deckTop,canopyX=westFacade-canopyWidth/2,canopyZ=westTowerCenter[1]+canopyProfile.longitudinalOffsetEstimate;
  const canopy=rectangle(westFacade-canopyWidth,canopyZ-canopyLength/2,westFacade,canopyZ+canopyLength/2),pyramidBases=[];
  for(const row of canopyProfile.skylightRows)for(let bay=0;bay<canopyProfile.columnCountEstimated;bay++) {
    const x=westFacade-row,z=canopyZ+(bay-3)*canopyProfile.skylightAlongWallPitch,r=canopyProfile.skylightRadius,upper=canopyProfile.skylightUpperHalf,h=canopyProfile.skylightHeight-canopyProfile.skylightCapRise;
    pyramidBases.push(rectangle(x-r,z-r,x+r,z+r));
    // The close photograph shows trapezoidal glazing under a shallow rounded
    // cap. Neither a single apex nor a small exposed flat top matches it.
    for(let face=0;face<4;face++) {
      const a=face*Math.PI/2,radial=[Math.cos(a),Math.sin(a)],tangent=[-Math.sin(a),Math.cos(a)];
      const point=(size,along)=>[x+size*(radial[0]+tangent[0]*along),z+size*(radial[1]+tangent[1]*along)];
      const facePoly=[point(r,1),point(r,-1),point(upper,-1),point(upper,1)];
      const top=(px,pz)=>canopyTop+.12+h*(r-((px-x)*radial[0]+(pz-z)*radial[1]))/(r-upper);
      prism(facePoly,top,.022,M.canopyGlass,L.site,0,0,'West Street porte-cochere pyramid glazing',canopyProfile.source);
      for(const along of [-1,0]){
        const base=point(r,along),head=point(upper,along);
        rod([base[0],canopyTop+.12,base[1]],[head[0],canopyTop+.12+h,head[1]],.04,.04,M.rail,L.site,0,0,'West Street porte-cochere pyramid rib',canopyProfile.source);
      }
      edge(facePoly[2],facePoly[3],canopyTop+.12+h,.06,.055,M.rail,L.site,0,0,'West Street porte-cochere upper skylight frame',canopyProfile.source);
    }
    const capBase=canopyTop+.12+h,capRadius=canopyProfile.skylightCapRadius,capRise=canopyProfile.skylightCapRise,sphereRadius=(capRadius*capRadius+capRise*capRise)/(2*capRise),capTop=(px,pz)=>capBase+capRise-sphereRadius+Math.sqrt(Math.max(0,sphereRadius*sphereRadius-(px-x)**2-(pz-z)**2));
    const ringPoint=(radius,i)=>[x+radius*Math.cos(i*2*Math.PI/16),z+radius*Math.sin(i*2*Math.PI/16)];
    const capPiece=(triangle,top,kind)=>{
      const p=prism(triangle,top,.025,M.canopyCap,L.site,0,0,kind,canopyProfile.source);
      // Submillimetre overlap at internal edges survives independent Float32
      // box/plane packing. Conservative bounds retain that overlap even at
      // acute sector corners; the clip planes still define the actual surface.
      if(p){
        for(const plane of p.shape.planes)if(Math.abs(plane[1])<1e-9)plane[3]+=.0001;
        for(let axis=0;axis<3;axis++)p.half[axis]+=.001;
      }
    };
    for(let radial=0;radial<4;radial++)for(let i=0;i<16;i++){
      const inner=radial*capRadius/4,outer=(radial+1)*capRadius/4,cell=radial?[ringPoint(inner,i),ringPoint(outer,i),ringPoint(outer,i+1),ringPoint(inner,i+1)]:[[x,z],ringPoint(outer,i),ringPoint(outer,i+1)];
      for(const triangle of triangulateConvex(cell))capPiece(triangle,planeHeight(triangle,triangle.map(p=>capTop(...p))),'West Street porte-cochere rounded translucent skylight cap');
      if(!radial)capPiece([[x,z],ringPoint(capRadius,i),ringPoint(capRadius,i+1)],capBase,'West Street porte-cochere cap bottom closure');
    }
    for(let side=0;side<4;side++)edge(pyramidBases[pyramidBases.length-1][side],pyramidBases[pyramidBases.length-1][(side+1)%4],canopyTop+.11,.18,.10,M.rail,L.site,0,0,'West Street porte-cochere skylight curb',canopyProfile.source);
  }
  fill(canopy,canopyTop,canopyProfile.deckThickness,M.curb,L.site,0,0,'West Street porte-cochere deck',pyramidBases,canopyProfile.source);
  for(let i=0;i<4;i++)edge(canopy[i],canopy[(i+1)%4],canopyTop-canopyProfile.fasciaCentreBelowDeck,canopyProfile.fasciaHeight,canopyProfile.fasciaThickness,M.curb,L.site,0,0,'West Street porte-cochere fascia',canopyProfile.source);
  // Protected strips join the terrace and both outer pier feet, rather than
  // planting poles in the carriageway. The photograph confirms hatching;
  // widths and the section's 150 mm curb remain reconstruction estimates.
  const separatorStrips=[rectangle(westFacade-7.0,canopyZ-canopyLength/2-1.8,westFacade-6.0,canopyZ+canopyLength/2+1.8),rectangle(westFacade-canopyWidth,canopyZ-canopyLength/2-.6,westFacade-canopyWidth+1.6,canopyZ+canopyLength/2+.6)];
  for(const strip of separatorStrips){
    entryPlatforms.push({tower:1,envelope:strip,height:()=>-.15,threshold:-.15,source:canopyProfile.source});
    fill(strip,-.15,.30,M.asphalt,L.site,0,0,'West Street canopy protected separator paving',[],canopyProfile.source);
    for(let i=0;i<strip.length;i++)edge(strip[i],strip[(i+1)%strip.length],-.132,.018,.10,M.taxiPaint,L.site,0,0,'West Street canopy separator outline',canopyProfile.source);
    const bounds=polygonBounds(strip),width=bounds.max[0]-bounds.min[0];
    for(let z=bounds.min[1]-width;z<bounds.max[1];z+=1.05){
      const marking=segmentOutline({road:{width:.10},a:[bounds.min[0],z],b:[bounds.max[0],z+width]});
      fill(marking,-.131,.018,M.taxiPaint,L.site,0,0,'West Street canopy protected diagonal marking',[],canopyProfile.source,.9,strip);
    }
  }
  for(const side of [-1,1])for(const along of [-1,1]){
    const x=canopyX+side*(canopyWidth/2-.8),z=canopyZ+along*(canopyLength/2-1.2),ground=upperSurface(x,z),supportTop=canopyTop-canopyProfile.deckThickness+.01;
    if(supportTop>ground+.08){const support=add(x,(ground+supportTop)/2,z,.22,supportTop-ground,.22,M.rail,L.site,0,0,'West Street porte-cochere support',0,canopyProfile.source);support.groundContact=ground;}
  }
  fill(taxiHoles[0],taxiGrade,.14,M.asphalt,L.site,0,0,'West Street taxi driveway asphalt',[...allFootprints,...raisedPlazas]);
  fill(taxiHoles[0],offsetGrade(taxiGrade,-.14),.24,M.concrete,L.site,0,0,'West Street taxi driveway structural deck',[...allFootprints,...raisedPlazas]);
  for(const side of [-1,1]){
    const edgePath=taxiPoints.map((p,i)=>{const a=taxiPoints[Math.max(0,i-1)],b=taxiPoints[Math.min(taxiPoints.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),offset=side*(taxiWidth/2-.12);return [p[0]-dz/length*offset,p[1]+dx/length*offset];});
    fill(ribbonOutline(edgePath,.10),offsetGrade(taxiGrade,.018),.018,M.taxiPaint,L.site,0,0,'West Street taxi driveway continuous edge line',[...allFootprints,...raisedPlazas]);
  }
  const islandPieces=polygonPieces(islandOutline,[...taxiHoles,...allFootprints,...raisedPlazas],block);
  for(const poly of islandPieces){fill(poly,forecourtHeight,.42,M.concrete,L.site,0,0,'West Street planted island structural bed');fill(poly,offsetGrade(forecourtHeight,.08),.14,M.plantSoil,L.site,0,0,'West Street planted island soil');}
  for(let i=0;i<islandOutline.length;i++){
    const a=islandOutline[i],b=islandOutline[(i+1)%islandOutline.length];
    fill(segmentOutline({road:{width:.20},a,b}),offsetGrade(forecourtHeight,.16),.24,M.curb,L.site,0,0,'West Street planted island curb',[...taxiHoles,...allFootprints,...raisedPlazas]);
  }
  for(let v=577;v<=622;v+=7){const p=sitePlanToStructure([835+(v-590)*.08,v]);if(islandPieces.some(poly=>pointInside(p,poly))){const y=forecourtHeight(...p);for(let k=0;k<13;k++){const angle=k*2.399+v,r=.15+(k%4)*.19;foliageCluster(p[0]+Math.cos(angle)*r,y+.52+(k%3)*.13,p[1]+Math.sin(angle)*r,.49,.40,.46,'West Street planted island shrub',angle);}}}
  for(let z=canopyZ-14;z<=canopyZ+14;z+=4.2){
    const x=westFacade-1.4,y=forecourtHeight(x,z);circle(x,z,.70,y+.62,.62,M.curb,L.site,'West Street entrance round planter');circle(x,z,.60,y+.80,.35,M.leaves,L.site,'West Street entrance planter shrub');
  }
  // Crosswalks occur at the historic perimeter intersections, not in the plaza.
  for(const [u,v,angle] of [[1594,275,0],[1604,1050,0],[674,276,.26],[904,1048,.26]]) {
    const[x,z]=sitePlanToStructure([u,v]),c=Math.cos(angle),s=Math.sin(angle);
    for(let i=-5;i<=5;i++){
      const poly=rectangle(-.225,-3.5,.225,3.5).map(([px,pz])=>[x+i*.95+c*px+s*pz,z-s*px+c*pz]);
      fill(poly,offsetGrade(groundHeight,.02),.02,M.paint,L.site,0,0,'perimeter street crossing',[block]);
    }
  }

  // Plaza perimeter construction. Openings at Dey/Cortlandt and tower entries
  // are retained. Step locations follow the plan; risers remain estimates.
  const retainingOutlines=[],retainingFootings=[];
  for(const [a,b] of [[[1122,321],[1162,321]],[[1536,599],[1536,626]],[[1536,684],[1536,718]]]) {
    const[p,q]=plan([a,b]),length=Math.hypot(q[0]-p[0],q[1]-p[1]),count=Math.ceil(length/.75);
    retainingOutlines.push(segmentOutline({road:{width:.58},a:p,b:q}));
    for(let i=0;i<count;i++){
      const start=p.map((v,axis)=>v+(q[axis]-v)*i/count),end=p.map((v,axis)=>v+(q[axis]-v)*(i+1)/count),foot=Math.min(forecourtHeight(...start),forecourtHeight(...end))-.30;
      const wall=edge(start,end,(foot+SITE_PLAZA_ELEVATION)/2,SITE_PLAZA_ELEVATION-foot,.38,M.curb,L.site,0,0,'plaza retaining wall');
      wall.groundContacts=[forecourtHeight(...start),forecourtHeight(...end)];
      retainingFootings.push({start,end,bottom:foot,groundContacts:wall.groundContacts});
    }
    edge(p,q,SITE_PLAZA_ELEVATION+.06,.12,.58,M.curb,L.site,0,0,'plaza retaining coping');
  }
  const plazaStairs=[];
  function plazaStair(start,end,width,_oldStreetEstimate,label,source=SOURCE_PLAN) {
    const streetY=upperSurface(...start);
    const dx=end[0]-start[0],dz=end[1]-start[1],len=Math.hypot(dx,dz),n=Math.max(1,Math.ceil((SITE_PLAZA_ELEVATION-streetY)/.165)),rise=(SITE_PLAZA_ELEVATION-streetY)/n,run=len/n,angle=-Math.atan2(dz,dx)+Math.PI/2;
    const nx=-dz/len,nz=dx/len;
    const contacts=[start,end].flatMap(p=>[-1,0,1].map(side=>upperSurface(p[0]+nx*side*width/2,p[1]+nz*side*width/2))),foot=Math.min(...contacts,streetY)-.30;
    // A continuous, ground-supported concrete carcass closes the underside.
    // Thin independent tread cards previously hovered over the forecourt.
    for(let i=0;i<n;i++){
      const top=streetY+rise*(i+1),x=start[0]+dx*(i+.5)/n,z=start[1]+dz*(i+.5)/n;
      add(x,(foot+top-.12)/2,z,width,top-.12-foot,run+.012,M.concrete,L.site,0,0,`${label} concrete support`,angle,source);
      add(x,top-.10,z,width,.20,run+.012,M.curb,L.site,0,0,`${label} tread`,angle,source);
    }
    const landing=rectangle(-width/2,-.5,width/2,.05).map(([side,distance])=>[start[0]+nx*side+dx/len*distance,start[1]+nz*side+dz/len*distance]);
    fill(landing,streetY,Math.max(.30,streetY-foot),M.curb,L.site,0,0,`${label} lower landing`,[],source);
    plazaStairs.push({label,start,end,width,streetElevation:streetY,plazaElevation:SITE_PLAZA_ELEVATION,supportBottom:foot,groundContacts:contacts,source,sectionEstimated:true});
    for(const side of [-1,1]) {
      rod([start[0]+nx*width/2*side,streetY+1.0,start[1]+nz*width/2*side],[end[0]+nx*width/2*side,SITE_PLAZA_ELEVATION+1.0,end[1]+nz*width/2*side],.05,.05,M.rail,L.site,0,0,`${label} handrail`);
      for(let k=0;k<=4;k++) {const t=k/4;add(start[0]+dx*t+nx*width/2*side,streetY+(SITE_PLAZA_ELEVATION-streetY)*t+.48,start[1]+dz*t+nz*width/2*side,.048,.96,.048,M.rail,L.site,0,0,`${label} rail post`);}
    }
  }
  plazaStair(sitePlanToStructure([1550,655]),sitePlanToStructure([1536,655]),21,streetLevels.church,'Church Street / Dey plaza stair');
  const libertyPlazaStair={start:sitePlanToStructure([1250,1024]),end:sitePlanToStructure([1250,994]),width:7,streetElevation:groundHeight(...sitePlanToStructure([1250,1024]))+.15};
  plazaStair(libertyPlazaStair.start,libertyPlazaStair.end,libertyPlazaStair.width,libertyPlazaStair.streetElevation,'Liberty plaza stair','wtc-low-rise-photos');
  plazaStair(sitePlanToStructure([1130,287]),sitePlanToStructure([1130,321]),8,streetLevels.vesey,'Vesey plaza stair');

  // Fountain setting, continuous polygonal rings and Koenig's curved silhouette.
  const [fx,fz]=sitePlanToStructure([1231,612]);
  circle(fx,fz,19.6,SITE_PLAZA_ELEVATION+.02,.12,M.fountain,L.site,'fountain stone surround',12.9);
  circle(fx,fz,12.9,SITE_PLAZA_ELEVATION+.055,.14,M.water,L.site,'shallow fountain water');
  ring(fx,fz,12.95,SITE_PLAZA_ELEVATION+.085,.17,.18,M.fountain,L.site,'fountain circular curb');
  ring(fx,fz,19.6,SITE_PLAZA_ELEVATION+.04,.09,.15,M.curb,L.site,'fountain outer rim');
  for(let i=0;i<32;i++) {
    const angle=i*Math.PI/16,ray=[[fx+20*Math.cos(angle),fz+20*Math.sin(angle)],[fx+65*Math.cos(angle),fz+65*Math.sin(angle)]];
    const [a,b]=ray;
      for(let k=0;k<45;k++) {const t=(k+.5)/45,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;if(raisedPlazas.some(p=>pointInside([x,z],p))&&!allFootprints.some(p=>pointInside([x,z],p)))edge([x-.5*Math.cos(angle),z-.5*Math.sin(angle)],[x+.5*Math.cos(angle),z+.5*Math.sin(angle)],SITE_PLAZA_ELEVATION+.003,.006,.035,M.curb,L.site,0,0,'plaza radial paving joint');}
  }
  for(const radius of [28,36.5,45,54,63])for(let i=0;i<192;i++) {
    const a=i*2*Math.PI/192,b=(i+1)*2*Math.PI/192,mid=[fx+radius*Math.cos((a+b)/2),fz+radius*Math.sin((a+b)/2)];
    if(raisedPlazas.some(p=>pointInside(mid,p))&&!allFootprints.some(p=>pointInside(mid,p)))edge([fx+radius*Math.cos(a),fz+radius*Math.sin(a)],[fx+radius*Math.cos(b),fz+radius*Math.sin(b)],SITE_PLAZA_ELEVATION+.003,.006,.035,M.curb,L.site,0,0,'plaza concentric paving joint');
  }
  circle(fx,fz,1.70,SITE_PLAZA_ELEVATION+.19,.14,M.bronze,L.site,'Sphere rotating pedestal');
  const profile=[[.19,.85],[.65,.95],[1.2,1.12],[1.8,1.18],[2.4,1.2],[2.9,1.75],[3.5,2.28],[4.1,2.48],[4.8,2.55],[5.5,2.48],[6.2,2.18],[6.8,1.72],[7.22,1.12],[7.52,.49],[7.62,.03]];
  for(let row=0;row<profile.length-1;row++) {
    const [ya,ra]=profile[row],[yb,rb]=profile[row+1],n=96;
    for(let i=0;i<n;i++) {
      const a=(i+.5)*2*Math.PI/n,dr=rb-ra,dy=yb-ya,l=Math.hypot(dr,dy),r=(ra+rb)/2;
      const tangent=[-Math.sin(a),0,Math.cos(a)],up=[dr*Math.cos(a)/l,dy/l,dr*Math.sin(a)/l],normal=[-dy*Math.cos(a)/l,dr/l,-dy*Math.sin(a)/l];
      // Rotation columns [tangent, profile tangent, inward normal].
      const q=quaternionFromAxes(tangent,up,normal);
      const fold=row<6?.12*Math.sin(3*a+row*.18):.045*Math.sin(5*a+row*.2);
      add(fx+(r+fold)*Math.cos(a),SITE_PLAZA_ELEVATION+(ya+yb)/2,fz+(r+fold)*Math.sin(a),Math.max(.04,2*r*Math.sin(Math.PI/n)*1.05),l*1.018,.08,M.bronze,L.site,0,0,'Sphere curved bronze segment',0,'museum-sphere',q);
    }
  }

  // Archive plaza photographs show low pale flower beds around the fountain,
  // separated by walking approaches. Keep the original open central plaza.
  const fountainBeds=[];
  for(let quadrant=0;quadrant<4;quadrant++){
    const middle=Math.PI/4+quadrant*Math.PI/2,start=middle-.34,end=middle+.34,inner=20.9,outer=23.05,steps=18;
    const arc=(r)=>Array.from({length:steps+1},(_,i)=>{const a=start+(end-start)*i/steps;return [fx+r*Math.cos(a),fz+r*Math.sin(a)];});
    const outline=[...arc(outer),...arc(inner).reverse()];fountainBeds.push(outline);
    fill(outline,SITE_PLAZA_ELEVATION+.47,.47,M.curb,L.site,0,0,'fountain raised flower bed');
    const soil=[...arc(outer-.13),...arc(inner+.13).reverse()];
    fill(soil,SITE_PLAZA_ELEVATION+.48,.12,M.plantSoil,L.site,0,0,'fountain flower bed soil');
    for(let i=0;i<steps;i++){
      const angle=start+(end-start)*(i+.5)/steps,r=(inner+outer)/2,x=fx+r*Math.cos(angle),z=fz+r*Math.sin(angle);
      add(x,SITE_PLAZA_ELEVATION+.62,z,.62,.30,1.65,M.leaves,L.site,0,0,'fountain low planting',-angle);
      for(let flower=0;flower<3;flower++){const radius=r+(flower-1)*.47;add(fx+radius*Math.cos(angle),SITE_PLAZA_ELEVATION+.80,fz+radius*Math.sin(angle),.30,.055,.36,M.flowers,L.site,0,0,'fountain violet flower planting',-angle);}
    }
  }

  // The original plaza has perimeter planting, leaving its central paved area open.
  const stairEnvelope=(start,end,width)=>{const dx=end[0]-start[0],dz=end[1]-start[1],length=Math.hypot(dx,dz),nx=-dz/length*width/2,nz=dx/length*width/2;return [[start[0]+nx,start[1]+nz],[end[0]+nx,end[1]+nz],[end[0]-nx,end[1]-nz],[start[0]-nx,start[1]-nz]];};
  const treeObstacles=[...allFootprints,...retainingOutlines,canopy,rampHole,stairEnvelope(...plan([[1550,655],[1536,655]]),21),stairEnvelope(libertyPlazaStair.start,libertyPlazaStair.end,libertyPlazaStair.width),stairEnvelope(...plan([[1130,287],[1130,321]]),8)];
  const plantings=[],treeCrownRadius=2.70;
  const treeFits=(p)=>treeObstacles.every(poly=>!pointInside(p,poly)&&distanceToOutline(p,poly)>treeCrownRadius+.12)&&roadPolygons.every(poly=>!pointInside(p,poly)&&distanceToOutline(p,poly)>.92)&&!taxiHoles.some(poly=>pointInside(p,poly)||distanceToOutline(p,poly)<1.0);
  function tree(u,v,level,index) {
    const desired=sitePlanToStructure([u,v]);let fitted=null;
    // Move an approximate scan planting point the smallest distance needed to
    // clear the entire crown, not merely the trunk centre or planting well.
    for(let radius=0;radius<=6&&!fitted;radius+=.4)for(let direction=0;direction<(radius?16:1);direction++){
      const angle=direction*Math.PI/8,p=[desired[0]+radius*Math.cos(angle),desired[1]+radius*Math.sin(angle)];
      if(treeFits(p)){fitted=p;break;}
    }
    if(!fitted)return;
    const[x,z]=fitted;level=upperSurface(x,z);plantings.push({requestedPixel:[u,v],position:[x,level,z],crownRadius:treeCrownRadius,minimumBuildingClearance:Math.min(...allFootprints.map(poly=>distanceToOutline(fitted,poly)))});
    add(x,level+.07,z,1.6,.14,1.6,M.plantSoil,L.site,0,0,'street tree planting well');
    add(x,level+1.75,z,.22,3.5,.22,M.bark,L.site,0,0,'street tree trunk');
    for(let k=0;k<24;k++) {
      const angle=k*2.399+index,rr=.35+(k%6)*.22,rx=.48+(k%3)*.09,ry=.52+(k%2)*.06,rz=.55+(k%4)*.045,top=level+3.85+(k%4)*.36;
      // Smaller overlapping clusters soften the crown silhouette while its
      // entire rotated envelope remains inside the cleared 2.70 m radius.
      const p=foliageCluster(x+Math.cos(angle)*rr,top,z+Math.sin(angle)*rr,rx,ry,rz,'street tree canopy',angle);
      if(k%6===0)rod([x,level+2.45,z],[p.center[0]*C+p.center[2]*S,top,p.center[0]*S-p.center[2]*C],.07,.07,M.bark,L.site,0,0,'street tree branch');
    }
  }
  let treeIndex=0;
  const plantStreetTrees=()=>{
    treeObstacles.push(...entryPlatforms.map(platform=>platform.envelope));
    for(let u=790;u<=1130;u+=47)tree(u,283,streetLevels.vesey,treeIndex++);
    for(let u=1200;u<=1500;u+=45)tree(u,323,streetLevels.vesey,treeIndex++);
    for(let v=371;v<=982;v+=51)tree(1536,v,streetLevels.church,treeIndex++);
    for(let u=1000;u<=1490;u+=52)tree(u,1011,streetLevels.liberty,treeIndex++);
  };
  for(const [u,v,angle] of [[1150,777,0],[1315,774,0],[1090,500,0],[1290,501,0]]) {
    const[x,z]=sitePlanToStructure([u,v]);add(x,SITE_PLAZA_ELEVATION+.33,z,4.4,.18,.65,M.curb,L.site,0,0,'plaza bench seat',angle);
    for(const side of [-1,1])add(x+side*1.65,SITE_PLAZA_ELEVATION+.16,z,.24,.32,.46,M.rail,L.site,0,0,'plaza bench support');
  }
  for(const [u,v] of [[1068,520],[1340,516],[1068,765],[1330,779],[894,706],[1260,1000],[1509,675],[1147,326]]) {
    const[x,z]=sitePlanToStructure([u,v]);add(x,SITE_PLAZA_ELEVATION+2.35,z,.12,4.7,.12,M.rail,L.site,0,0,'plaza lamp post');
    add(x,SITE_PLAZA_ELEVATION+4.70,z,.64,.20,.62,M.rail,L.site,0,0,'plaza lamp housing');
    add(x,SITE_PLAZA_ELEVATION+4.62,z,.46,.026,.44,M.lamp,L.site,0,0,'plaza lamp emitter');
  }

  // Independently sourced profiles share the same registered site openings.
  const lowBuildings=buildLowBuildings({defs,builders:{add,edge,fill},materialIndices:M,layers:L,sitePlanToStructure,siteStructureToWorld,plazaElevation:SITE_PLAZA_ELEVATION,streetLevels,bearing:BEARING,getEntrySurface});
  contextBuildings.push(...lowBuildings.buildings);

  onProgress('建立共用地下层、挡水墙及交通层次…');
  // Entry callbacks have now registered their envelopes. Finish SITE once,
  // subtracting platforms from paving and clearing full crowns from entrances.
  buildForecourt();
  fill(vehicleApproachOutline,vehicleGrade,.18,M.paving,L.site,0,0,'hotel vehicle entrance flush forecourt paving',roadPolygons,hotelVehicleAccess.source);
  fill(vehicleApproachOutline,offsetGrade(vehicleGrade,-.18),.24,M.concrete,L.site,0,0,'hotel vehicle approach structural deck',roadPolygons,hotelVehicleAccess.source);
  plantStreetTrees();
  const basementLevels=[0,-4.8768,-7.9248,-10.9728,-14.0208,-17.3736,-20.7264];
  for(let f=0;f<basementLevels.length;f++) {
    const area=f<=3?block:bathtub,holes=f<=3?allFootprints:[...towerPolygons,...defs.filter(b=>b.id===3||b.id===6).map(b=>b.publicFootprint||b.footprint)];
    // Concourse EL310 is below the elevated central plaza, not a blanket slab
    // projecting through the lower West Street courts. Their upper support
    // decks belong to removable SITE; the common B1–B6 levels remain below.
    if(f===0){const completed=[];for(const plaza of raisedPlazas){fill(plaza,0,.26,M.concrete,L.basement,0,1,'main concourse floor',[...holes,...completed],SOURCE_PLAN);completed.push(plaza);}}
    else fill(area,basementLevels[f],.26,M.concrete,L.basement,0,-f,'shared parking/service basement slab',holes,SOURCE_PLAN);
  }
  // A level landing carries the vehicle opening through the stone base.
  // The estimated basement descent begins only BEHIND that landing, so no
  // retaining guard or sloped slab cuts through the exterior sidewalk.
  const vehicleLanding=[vehicleAt(-3.4,-.12),vehicleAt(3.4,-.12),vehicleAt(3.4,3.15),vehicleAt(-3.4,3.15)];
  fill(vehicleLanding,hotelVehicleAccess.threshold,.30,M.concrete,L.basement,0,0,'hotel vehicle entrance level landing',[],hotelVehicleAccess.source);
  const rampA=vehicleAt(0,hotelVehicleAccess.levelLandingDepth),rampB=plan([[974,783]])[0],rampTop=hotelVehicleAccess.threshold,rampBottom=-4.8768;
  slopingEdge(rampA,rampB,rampTop,rampBottom,.26,6.2,M.concrete,L.basement,'western parking/service access ramp',SOURCE_PLAN);
  // Omit the former unsourced 1.05 m sloping guards. They intruded into
  // the entrance interior as large pale wedges and had no observed basis.
  // Slurry wall is confined to the western bathtub, not the whole 16-acre block.
  for(let i=0;i<bathtub.length;i++)terrainCappedWall(bathtub[i],bathtub[(i+1)%bathtub.length],-22.05,2.15,3*FT,M.concrete,L.basement,0,0,'original western bathtub slurry wall','loc-basement');
  // The shallow common eastern basements also need an outer enclosure. It is
  // separate from the documented western slurry wall and follows the block,
  // with its conservative top always below the removable surface deck.
  for(let i=0;i<block.length;i++)terrainCappedWall(block[i],block[(i+1)%block.length],basementLevels[3]-.26,SITE_PLAZA_ELEVATION-.48,.38,M.concrete,L.basement,0,0,'common shallow basement perimeter enclosure',SOURCE_PLAN);
  const commonBounds=polygonBounds(block),supportPitch=9.144,supportAnchor=[commonBounds.min[0]+7,commonBounds.min[1]+7],deckBottom=SITE_PLAZA_ELEVATION-.48,beamDepth=.65,concourseCeilingTop=3.75,concourseCeilingBottom=3.69;
  for(let x=supportAnchor[0];x<commonBounds.max[0];x+=supportPitch)for(let z=supportAnchor[1];z<commonBounds.max[1];z+=supportPitch)if(pointInside([x,z],block)&&!allFootprints.some(p=>pointInside([x,z],p))) {
    const belowPlaza=raisedPlazas.some(poly=>pointInside([x,z],poly)),belowLibertyCourt=!belowPlaza&&pointInside([x,z],libertyArcadeCourt),bottom=pointInside([x,z],bathtub)?-20.8:basementLevels[3]-.26,top=belowPlaza?deckBottom-beamDepth:belowLibertyCourt?upperSurface(x,z)-.42:Math.min(-.24,upperSurface(x,z)-.40);
    add(x,(bottom+top)/2,z,.45,top-bottom,.45,M.steel,L.basement,0,0,belowLibertyCourt?'Liberty mall forecourt support column':'shared basement steel column',0,SOURCE_LOW);
  }
  const completedCeilings=[];
  const concourseFloorPieces=[];
  for(const plaza of raisedPlazas){
    fill(plaza,concourseCeilingTop,.06,M.interior,L.basement,0,1,'continuous concourse suspended ceiling',[...allFootprints,...completedCeilings],'nist-concourse-mall');
    concourseFloorPieces.push(...polygonPieces(plaza,[...allFootprints,...completedCeilings]));
    completedCeilings.push(plaza);
  }
  const concourseExteriorBoundary=polygonBoundarySegments(concourseFloorPieces),concourseEnclosureRuns=[];
  for(const [a,b] of concourseExteriorBoundary){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.05)continue;
    const tangent=[dx/length,dz/length],normal=[-tangent[1],tangent[0]],interfaces=[];
    // A merged exterior edge can touch a building for only PART of its run.
    // Remove collinear contact intervals, never the whole edge by midpoint.
    for(const poly of allFootprints)for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],ex=q[0]-p[0],ez=q[1]-p[1],edgeLength=Math.hypot(ex,ez);
      if(edgeLength<.0001||Math.abs(ex*normal[0]+ez*normal[1])>edgeLength*.001)continue;
      if(Math.max(...[p,q].map(v=>Math.abs((v[0]-a[0])*normal[0]+(v[1]-a[1])*normal[1])))>.55)continue;
      const projected=[p,q].map(v=>(v[0]-a[0])*tangent[0]+(v[1]-a[1])*tangent[1]);
      interfaces.push([Math.min(...projected),Math.max(...projected)]);
    }
    for(const [lo,hi] of subtractIntervals([[0,length]],interfaces))if(hi-lo>.05){
      const at=d=>a.map((v,i)=>v+tangent[i]*d+normal[i]*.12),start=at(Math.max(0,lo-.12)),end=at(Math.min(length,hi+.12));
      edge(start,end,(deckBottom-.26)/2,deckBottom+.26,.24,M.concrete,L.basement,0,1,'concourse exterior structural enclosure',SOURCE_PLAN);
      concourseEnclosureRuns.push({start,end,bottom:-.26,top:deckBottom});
    }
  }
  // The outer upper-floor outline is not the public-level glass line. At
  // Church Street the two short returns must turn back to that recessed line,
  // otherwise their ends leave a direct view into the shared concourse. Keep
  // the glass-side indoor connection open instead of walling the whole joint.
  for(const [id,pixelCorner] of [[5,[1478,599]],[4,[1482,718]]]){
    const building=defs.find(b=>b.id===id),cornerIndex=building.polygon.findIndex(p=>p[0]===pixelCorner[0]&&p[1]===pixelCorner[1]);
    const original=building.footprint[cornerIndex],recessed=building.lowBuildingLayout.arcade.occupiedPoly[cornerIndex],bend=[recessed[0],original[1]];
    for(const [a,b] of [[original,bend],[bend,recessed]]){
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]),tangent=b.map((v,i)=>(v-a[i])/length);
      const start=a.map((v,i)=>v-tangent[i]*.12),end=b.map((v,i)=>v+tangent[i]*.12);
      edge(start,end,(deckBottom-.26)/2,deckBottom+.26,.24,M.concrete,L.basement,0,1,'concourse recessed building interface closure',SOURCE_PLAN);
      concourseEnclosureRuns.push({start,end,bottom:-.26,top:deckBottom,role:'recessed-interface',building:id,sourceCorner:original,recessedCorner:recessed,sectionEstimated:true});
    }
  }
  // A common grid carries the plaza deck through the concourse and down to
  // the parking slabs. The 30 ft pitch is a similar-system estimate; it is
  // not a claim that every original basement member has been transcribed.
  for(const axis of [0,1])for(let row=supportAnchor[1-axis];row<commonBounds.max[1-axis];row+=supportPitch){
    const existing=[];
    for(const plaza of raisedPlazas){
      let spans=rowIntervals(axis?plaza.map(([x,z])=>[z,x]):plaza,row);
      const cuts=[...allFootprints,...existing].flatMap(poly=>rowIntervals(axis?poly.map(([x,z])=>[z,x]):poly,row));
      spans=subtractIntervals(spans,cuts);
      for(const [lo,hi] of spans)if(hi-lo>.05){
        const a=axis?[row,lo]:[lo,row],b=axis?[row,hi]:[hi,row];
        edge(a,b,deckBottom-beamDepth/2,beamDepth,.30,M.steel,L.basement,0,1,'concourse plaza deck support beam',SOURCE_LOW);
      }
      existing.push(plaza);
    }
  }
  // A-J32/A-K33 show an open north/south Concourse Gallery between auxiliary
  // services blocks east of the tower lobbies, plus open cross passages at the
  // tower fronts. Their main blocks are retained; no imaginary shop maze is made.
  const concourseServices=[plan([[1028,692],[1115,692],[1115,768],[1064,768],[1064,712.4],[1028,712.4]]),plan([[1145,680],[1222,680],[1222,774],[1145,774]])];
  for(const poly of concourseServices)for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),opening=Math.min(1.4/length,.22);
    for(const [lo,hi] of [[0,.5-opening],[.5+opening,1]])terrainCappedWall([a[0]+dx*lo,a[1]+dz*lo],[a[0]+dx*hi,a[1]+dz*hi],0,concourseCeilingBottom,.18,M.interior,L.basement,0,1,'drawing-based main concourse partition',SOURCE_PLAN);
    terrainCappedWall([a[0]+dx*(.5-opening),a[1]+dz*(.5-opening)],[a[0]+dx*(.5+opening),a[1]+dz*(.5+opening)],2.56,concourseCeilingBottom,.18,M.interior,L.basement,0,1,'main concourse portal header',SOURCE_PLAN);
  }
  // Room ceilings are underground building fabric, not the removable plaza.
  // Their underside meets the partition tops and survives hiding SITE.
  // The service blocks meet that same continuous concourse ceiling.
  // Fig. 2-3 supplies the principal retail-block relationships. Its directory
  // is schematic; register it once to the tower centres, then trim to real
  // floor envelopes and keep all circulation outside these shop blocks open.
  const northCenter=sitePlanToStructure(SITE_CALIBRATION.towerPixels[0]),southCenter=sitePlanToStructure(SITE_CALIBRATION.towerPixels[1]),mallDx=144,mallDz=-228,targetDx=southCenter[0]-northCenter[0],targetDz=southCenter[1]-northCenter[1],denom=mallDx*mallDx+mallDz*mallDz;
  const mallA=(targetDx*mallDx+targetDz*mallDz)/denom,mallB=(targetDz*mallDx-targetDx*mallDz)/denom;
  const mallPoint=([u,v])=>{const x=u-315,z=427-v;return [northCenter[0]+mallA*x-mallB*z,northCenter[1]+mallB*x+mallA*z];};
  const mallBlockPixels=[
    [[530,220],[585,220],[585,318],[530,318]],[[603,236],[769,236],[769,316],[603,316]],
    [[505,361],[575,361],[575,420],[505,420]],[[588,335],[626,335],[626,417],[588,417]],[[642,360],[675,360],[675,420],[642,420]],
    [[722,351],[766,351],[766,404],[804,404],[804,438],[757,438],[722,404]],
    [[457,450],[598,450],[598,491],[498,491],[498,475],[457,475]],
    [[457,508],[541,508],[541,556],[457,556]],[[558,504],[632,504],[632,556],[558,556]],[[642,451],[672,451],[672,557],[642,557]],
    [[683,455],[723,455],[723,516],[683,516]],[[752,478],[811,478],[811,553],[752,553]],
    [[538,596],[598,596],[598,638],[538,638]],[[539,664],[599,664],[599,735],[539,735]],
    [[620,634],[715,634],[715,657],[658,657],[658,735],[620,735]],[[752,574],[799,574],[799,645],[752,645]],[[733,693],[813,693],[813,738],[733,738]]
  ];
  const mallEnvelope=[...raisedPlazas,...defs.filter(b=>b.id===4||b.id===5).map(b=>b.lowBuildingLayout?.arcade?.occupiedPoly||b.footprint)],retailBlocks=[],retailGroups=[],mallExcluded=[...towerPolygons,...defs.filter(b=>b.id===3||b.id===6).map(b=>b.publicFootprint||b.footprint),...concourseServices,...defs.flatMap(b=>b.lowBuildingLayout?.holes||[])];
  for(const pixelPoly of mallBlockPixels){
    const poly=pixelPoly.map(mallPoint),covered=[],pieces=[];
    for(const envelope of mallEnvelope){
      for(const piece of polygonPieces(poly,[...mallExcluded,...covered,...retailBlocks],envelope))pieces.push(piece);
      covered.push(envelope);
    }
    retailBlocks.push(...pieces);if(pieces.length)retailGroups.push({sourcePixelOutline:pixelPoly,pieces,boundary:polygonBoundarySegments(pieces)});
  }
  for(const group of retailGroups){
    // Shop shells retain a glass frontage and a human-width entrance. Do not
    // fill their interiors with opaque blocks or luminous window cards.
    let frontagePlaced=false;
    for(let i=0;i<group.boundary.length;i++){
      const [boundaryA,boundaryB]=group.boundary[i],dx=boundaryB[0]-boundaryA[0],dz=boundaryB[1]-boundaryA[1],boundaryLength=Math.hypot(dx,dz);if(boundaryLength<.15)continue;
      const tangent=[dx/boundaryLength,dz/boundaryLength],normal=[-tangent[1],tangent[0]],cuts=[];
      // The exterior structural wall already closes these shop edges. A
      // second centred partition protruded outside it by 90 mm at the returns.
      for(const run of concourseEnclosureRuns){
        const ex=run.end[0]-run.start[0],ez=run.end[1]-run.start[1];
        if(Math.abs(ex*normal[0]+ez*normal[1])>Math.hypot(ex,ez)*.001)continue;
        if(Math.max(...[run.start,run.end].map(p=>Math.abs((p[0]-boundaryA[0])*normal[0]+(p[1]-boundaryA[1])*normal[1])))>.30)continue;
        const projected=[run.start,run.end].map(p=>(p[0]-boundaryA[0])*tangent[0]+(p[1]-boundaryA[1])*tangent[1]);cuts.push([Math.min(...projected),Math.max(...projected)]);
      }
      for(const [from,to] of subtractIntervals([[0,boundaryLength]],cuts)){
        const a=boundaryA.map((v,j)=>v+tangent[j]*from),b=boundaryA.map((v,j)=>v+tangent[j]*to),length=to-from;if(length<.15)continue;
        if(!frontagePlaced&&length>3.2){
          frontagePlaced=true;
          const width=Math.min(2.4,length*.4),lo=(length-width)/2/length,hi=(length+width)/2/length,at=t=>a.map((v,j)=>v+(b[j]-v)*t);
          for(const [start,end] of [[0,lo],[hi,1]])edge(at(start),at(end),concourseCeilingBottom/2,concourseCeilingBottom,.024,M.glass,L.basement,0,1,'concourse retail glazed frontage','nist-concourse-mall');
          edge(at(lo),at(hi),(2.45+concourseCeilingBottom)/2,concourseCeilingBottom-2.45,.18,M.interior,L.basement,0,1,'concourse retail doorway header','nist-concourse-mall');
        }else edge(a,b,concourseCeilingBottom/2,concourseCeilingBottom,.18,M.interior,L.basement,0,1,'concourse retail partition','nist-concourse-mall');
      }
    }
    for(const poly of group.pieces)fill(poly,concourseCeilingTop,.06,M.interior,L.basement,0,1,'concourse retail ceiling',raisedPlazas,'nist-concourse-mall');
  }
  const concourseEnvelopeContains=p=>(raisedPlazas.some(poly=>pointInside(p,poly))&&!allFootprints.some(poly=>pointInside(p,poly)))||retailBlocks.some(poly=>pointInside(p,poly));
  const undergroundFixture=(x,z,ceiling,floor,kind)=>{
    add(x,ceiling-.045,z,.72,.09,1.26,M.dark,L.basement,0,floor,`${kind} luminaire housing`,0,'nist-concourse-mall');
    add(x,ceiling-.096,z,.66,.012,1.18,M.undergroundLamp,L.lights,0,floor,`${kind} luminaire emitter`,0,'nist-concourse-mall');
  };
  for(let x=supportAnchor[0]+supportPitch/2;x<commonBounds.max[0];x+=supportPitch)for(let z=supportAnchor[1]+supportPitch/2;z<commonBounds.max[1];z+=supportPitch){
    if(concourseEnvelopeContains([x,z])){
      undergroundFixture(x,z,concourseCeilingBottom,1,'concourse');
      if(raisedPlazas.some(poly=>pointInside([x,z],poly)))add(x,(concourseCeilingTop+deckBottom)/2,z,.018,deckBottom-concourseCeilingTop,.018,M.steel,L.basement,0,1,'concourse ceiling suspension rod',0,'nist-concourse-mall');
    }
    for(let f=1;f<basementLevels.length;f++){
      const area=f<=3?block:bathtub,holes=f<=3?allFootprints:[...towerPolygons,...defs.filter(b=>b.id===3||b.id===6).map(b=>b.publicFootprint||b.footprint)];
      if(!pointInside([x,z],area)||holes.some(poly=>pointInside([x,z],poly)))continue;
      const ceiling=f===1?Math.min(-.26,upperSurface(x,z)-.42):basementLevels[f-1]-.26;
      undergroundFixture(x,z,ceiling,-f,'shared basement');
    }
  }
  // B5 relationship visible in HABS photographs: a limited track/platform
  // section provides its vertical position without inventing a complete station.
  const [pathX,pathZ]=sitePlanToStructure([1242,744]),trackY=-17.3736;
  for(const track of [-1,1])for(const rail of [-1,1])add(pathX+track*3.7+rail*.7175,trackY+.15,pathZ,.075,.15,30,M.path,L.basement,0,-5,'PATH B5 indicative rail section',0,'loc-basement');
  for(let z=pathZ-14.5;z<pathZ+14.5;z+=.65)for(const track of [-1,1])add(pathX+track*3.7,trackY+.025,z,2.55,.15,.20,M.steel,L.basement,0,-5,'PATH B5 indicative sleeper',0,'loc-basement');
  add(pathX,trackY+.72,pathZ,3.55,1.05,30,M.concrete,L.basement,0,-5,'PATH B5 indicative platform',0,'loc-basement');

  const counts={};for(const p of primitives)counts[p.tower]=(counts[p.tower]||0)+1;
  const metadata={
    lowBuildingDiagnostics:lowBuildings.diagnostics,
    period:'Original complex, circa 2000/2001; source drawings and public photographs date from different years',units:'m',geometry:'analytic oriented boxes and convex half-space prisms',bearingDegrees:29,rendererCoordinates:'right handed: X east, Y up, Z south; source architectural Z north is reflected exactly once',
    calibration:{...SITE_CALIBRATION,recommendedTowerCenters:getHistoricTowerCenters(),recommendedStructuralTowerCenters:SITE_CALIBRATION.towerPixels.map(sitePlanToStructure),suppliedTowerCenters:towers.map(t=>({id:t.id,center:t.center}))},
    layerOwnership:{site:0,sharedBasement:0,buildings:[3,4,5,6],siteLights:'Lamp poles, housings and emitters use SITE; global LIGHTS gates emission'},
    plaza:{concourseDatumFeet:310,plazaDatumFeet:332,elevation:SITE_PLAZA_ELEVATION,raisedStructuralPolygons:raisedPlazas,raisedPixelPolygons,cornerClosurePolygons:plazaCornerClosures,galleryStructuralPolygons:galleryPolygons,galleryInterfaceNote:"Plaza paving and structural-deck openings follow the offset octagonal gallery edge. The South Tower north-west plaza return meets the chamfer endpoint; scan-rounded square edges formerly left an exterior triangular void. Gallery/apron sections remain reconstructed.",retainingOutlines,retainingFootings,libertyArcadeCourt,libertyPlazaStair,libertyMallFrontageNote:"August 2001 Liberty Street photograph confirms street-level arcade glazing and mall entry, so no EL332 retaining strip crosses the frontage. Forecourt grades follow the shared estimated eastern curb field; the western plaza stair location and section remain estimates.",streetLevels,streetGradesConfirmed:false,streetGradeNote:'Western grades are approximated from the initial 1968 JK-10 curb sheet, not a 2001 survey. Church and eastern road endpoints are independent estimates; +22 ft is concourse-to-plaza only.',forecourtNote:'Concourse terraces use a fixed datum and finite, explicitly bounded road-approach bands. No nearest-building distance field changes the paving. Local door platforms and stairs are independent registered constraints; the approach runs and 2001 curb profiles remain estimates. The WTC 1 pedestrian entry terrace is EL310 and the carriageway has a 150 mm curb below it.',forecourtApproaches:roadApproaches.map(region=>({road:region.road,polygon:region.poly,run:region.run,innerElevation:region.innerElevation})),entryPlatforms:entryPlatforms.map(({height,...platform})=>platform),westernStreetEntrance:{tower:1,doorFloor:1,doorElevation:0,dropOffApproach:'two-ended curved West Street driveway with a planted central island',taxiPixelAnchors,taxiCenterline:taxiPoints,taxiOutline:taxiHoles[0],taxiWidth,plantedIsland:islandPieces,porteCochereRoofElevation:canopyTop,porteCochere:{...canopyProfile,centre:[canopyX,canopyZ],footprint:canopy.map(p=>[...p]),footprintSource:SOURCE_PLAN,fasciaTop:canopyTop-canopyProfile.fasciaCentreBelowDeck+canopyProfile.fasciaHeight/2,skylightBases:pyramidBases.map(poly=>poly.map(p=>[...p])),roofOutlineCoordinates:"source-plan east/north metres",confidence:"Conditional estimate from separate street and elevated entrance photographs; no dimensioned canopy section located."},roofElevationConfidence:"Two-photo conditional estimate; not surveyed. The deck remains below the unchanged plaza datum; skylights rise above it."},entranceGroundSuggestions:{northTower:{east:6.7056,west:0,north:6.7056,south:6.7056},southTower:{north:6.7056,east:6.7056,west:0,south:0},confidence:'Central plaza and West street/concourse relationship are documented; exact exterior door positions, side galleries and south terrace edges need further architectural plans.'},roadProfiles:roads.map(r=>({name:r.name,pixelPoints:r.points,elevations:r.grades,source:r.source,confirmed2001:false})),westReadingsFeet:{northWestBC:304.5,northWestTC:305,tower1BC:306,tower1TC:306.5,libertyApproximateBC:307.5},churchEstimateMetres:4.55},
    buildingOutlines:defs.map(b=>({id:b.id,pixelOutline:b.polygon,structuralOutline:b.footprint,...(b.typicalPolygon?{typicalPixelOutline:b.typicalPolygon,typicalStructuralOutline:b.typicalFootprint,publicPixelOutline:b.publicPolygon,publicStructuralOutline:b.publicFootprint,groundPixelOutline:b.groundPolygon,groundStructuralOutline:b.groundFootprint,podiumSource:b.podiumProfile?.source,podiumRegistration:b.podiumProfile?.registration,typicalOutlineRegistration:'SOM 1981/FEMA Fig 3-3 registered separately to the 1968 site outline; guestroom east service projection has several source-pixel uncertainty. Ground and public plates are independently registered from SOM A-302/A-303, rather than extruded from this guestroom plate.'}:{}),roofElevation:b.roofElevation,floorCount:b.floors,source:b.source,...(b.roofClosureEvidence?{roofClosureEvidence:b.roofClosureEvidence}:{}),...(b.hotelRoofEvidence?{hotelRoofEvidence:b.hotelRoofEvidence}:{})})),
    underground:{westernBathtub:bathtub,bathtubSource:'JK-10, independently registered with one tower-width scale; scan digitization estimate',levels:basementLevels,pathTrackLevel:-5,pathTrackElevation:trackY,pathSectionCenter:siteStructureToWorld([pathX,pathZ],trackY),pathSectionLength:30,fullStationPlan:false,pathHorizontalPlacement:'Illustrative section near the eastern plaza, kept out of tower foundations; the horizontal track/platform coordinates and count are not a complete station-plan transcription.',concourseServices,concourseServiceCeiling:{underside:concourseCeilingBottom,top:concourseCeilingTop,layer:L.basement},concourseDeck:{top:SITE_PLAZA_ELEVATION-.12,underside:deckBottom,beamUnderside:deckBottom-beamDepth,supportAnchor,supportPitch,layer:L.basement,sectionStatus:"representative support grid and ceiling fit-out"},concourseEnclosureRuns,retailGroups,retailSource:"NIST NCSTAR 1-7 Fig. 2-3, one similarity registration to tower centres; tenant outlines schematic and clipped to the actual supported floor envelope",concourseRoutes:'Auxiliary blocks reference A-J32/A-K33. Connected shopping-gallery blocks follow NIST Fig. 2-3, clipped to the supported plaza and WTC 4/5 concourse floors. Main north/south and cross passages remain open. The continuous deck, steel grid, suspended ceiling, shop frontage and fixtures are representative construction; section dimensions and tenant partitions are not an as-built transcription.',hotelVehicleAccess,parkingRamp:{source:'A-J32/A-K33 / JK-10 western hotel/service approach',run:'Simplified interior descent after a level vehicle landing; precise basement turns and later alterations unverified.',from:rampA,to:rampB,fromElevation:rampTop,toElevation:rampBottom},slurryWallThickness:3*FT,slurryWallTopMaximum:2.15,slurryWallBottom:-22.05,slurryWallFollowsSiteGrade:true},
    vegetation:{streetTrees:plantings,clearance:'Entire crown envelope clears building footprints, retaining walls/copings, the porte-cochere, entrance platforms and stair runs; scan planting positions shift minimally where necessary.',fountainBeds,plantingConfidence:'Flower beds, purple bedding flowers and small trees are documented in archive plaza photographs; the individual bed arcs and planting positions are photographic reconstruction.'},
    confirmed:['Plaza EL 332 relative to concourse EL 310 is 22 ft / 6.7056 m; it is not the street grade.','WTC 3 occupies the southwest of the complex between West Street, WTC 1 and WTC 2, with an obtuse bend in its elongated floor plate.','WTC 3 has 22 above-grade and six basement storeys, approximately 242 ft roof parapet height above West Street, and 9 ft 6 in typical guestroom storeys.','WTC 4 and 5 have nine storeys; WTC 6 has eight storeys. Their original setbacks/arms are retained.','WTC 5 uses a 30 ft steel column grid, 15 ft outer floor cantilevers and composite slabs.','The Sphere is a 25 ft cast-bronze sculpture above a circular fountain.','PATH railway tracks occupy B5 in the shared substructure.'],
    approximations:['All scan-digitized horizontal coordinates have approximately 0.5–2 m uncertainty, plus scan scale/line-width error; the single uniform plan scale is derived from the sourced tower width.','WTC 3 uses three independent plates: straight street-level stone base and stepped public ballroom plate registered from SOM A-302/A-303 in PA FOI 12673, and the bent typical guestroom plate registered from FEMA. Public outline coordinates and later entrance finishes remain estimates, rather than a survey of the 2001 renovation. The SOM 1981 typical guestroom-level east projection is registered independently with several normalized source-pixel uncertainty; the 1968 site sheet predates the final hotel. Public glazing, crown framing and window bays are photographic/elevation reconstructions, not dimensioned fabrication details.','WTC 4/6 storey heights, window dimensions, rooftop equipment and extrapolated framing are representative pending dimensioned elevations. WTC 5 uses the documented A-E101 floor and roof elevations.','Low building core positions, lift-cell counts, landing-door schedules, stair dimensions and ceiling luminaires are schematic explanatory fit-out, not a historic elevator inventory or tenant-floor transcription. The hotel main circulation is placed inside its east side near mid-length using FEMA prose; unlabelled southern plan symbols are not classified as confirmed lifts.','Raised plaza stair runs, individual risers, railings, furniture and tree crown shapes are reconstruction estimates. The grand central area remains paved and open.','The Sphere uses a dense curved bronze shell of analytic boxes and an approximate caryatid stem; cast-panel seams and sculpture contour are not an artist-approved reproduction.','Fountain water radius and stone surround are digitized estimates; no simulation of historical water flow or daily rotation is claimed.','Common basement perimeter/levels and PATH section are partial reconstructions. Concourse shopping-block relationships follow NIST Figure 2-3; the directory is schematic and has been uniformly registered, with no claim of exact shop dimensions. The plaza deck support grid, suspended ceiling and basement/retail luminaires are representative construction and fit-out. Low-building base glazing extends continuously to the concourse floor behind the plaza, and its basement enclosure/grid are representative foundations. The shallow eastern enclosure follows the source block but its wall section is representative. No unsupported shared elevator void is cut through the six basements; this does not claim a full as-built railway station, retail mall, complete vehicle ramps or underground tenant layout.','Surrounding ground has a subdued procedural city texture; its distant surface patterns are visual context, not a parcel or cadastral survey.'],
    primitiveCount:primitives.length,countByBuilding:counts
  };
  metadata.plaza.stairs=plazaStairs;
  metadata.plaza.westernStreetEntrance.protectedSeparatorStrips=separatorStrips;
  metadata.plaza.westernStreetEntrance.trafficSection={pedestrianDepth:6,carriagewayCentreDepth:8.9,carriagewayWidth:taxiWidth,estimated:true};
  onProgress(`原场地完成：${primitives.length.toLocaleString()} 个解析构件，WTC 3/4/5/6 独立选择`);
  return {primitives,materials:SITE_MATERIALS.map(m=>({...m,color:[...m.color],emission:[...m.emission],...(m.texture?{texture:{...m.texture}}:{})})),contextBuildings,metadata,sources:SITE_SOURCES.map(s=>({...s}))};
}

function quaternionFromAxes(x,y,z) {
  const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2],trace=m00+m11+m22;
  let q;
  if(trace>0) {const s=Math.sqrt(trace+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
  else if(m00>m11&&m00>m22) {const s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
  else if(m11>m22) {const s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
  else {const s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}
  const n=Math.hypot(...q);return q.map(v=>v/n);
}
