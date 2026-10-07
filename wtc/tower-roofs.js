// Roof fixtures in the original tower-local drawing coordinates (+Z north).
// Dimensions not supplied by a drawing are explicitly photographic estimates.
// Convex shells have at most six planes per panel: no extra traversal limit.
import {polygonPieces,convexPrism} from './site-geometry.js';
import {buildNorthMast,ANTENNA_PROFILE} from './north-mast.js';
import {buildSouthRoofFixtures,SOUTH_ROOF_DETAIL_PROFILE,SOUTH_ROOF_DETAIL_EVIDENCE} from './south-roof.js';
export {ANTENNA_PROFILE};

export const TOWER_ROOF_SOURCES=Object.freeze([
  {id:'commission-sloped-roof',title:'9/11 Commission Report, Chapter 9 — roof access',url:'https://www.9-11commission.gov/report/911Report_Ch9.htm',pages:'Chapter 9.1',note:'Documents that the towers had sloped roofs. Does not dimension the central plateau or its rise; modeled weather-finish profile is a photograph-based estimate above the unchanged structural slab.'},
  {id:'south-roof-user-aerial-undated',title:'User supplied South Tower roof overhead and oblique photographs',url:null,pages:'Supplied 2026-10-06; historical date and photographer unknown',note:'Independent low perimeter fence, blue elevated loop with folded wind bays, two smooth edge-parallel enclosed access housings, central marked canopy and mesh fence, dish and radio mast. Dimensions and compass positions reconstructed, not surveyed.'},
  {id:'north-broadcast-firsthand',title:'Doug Lung — Antenna-Mounting Issues, TV Technology',url:'https://www.tvtechnology.com/opinions/antennamounting-issues',pages:'Firsthand broadcast-engineering account',note:'WTC DTV antennas attached on opposing mast sides, with more panels on primary population side and a single column on the back. Supports attachment type, not exact azimuth/channel assignment or fabrication dimensions.'},
  {id:'north-antenna-1979-diagram',title:'Broadcast Engineering, August 1979 — Rosner Television Systems tower section',url:'https://www.worldradiohistory.com/Archive-All-BC-Engineering/BME/70s/BME-1979-08.pdf',note:'Contemporary diagram labels the 9/13 section diplexed butterfly. Engineering labels were available in search-indexed text; direct PDF retrieval returned 403. Does not establish unchanged 2001 panel counts or dimensions.'},
  {id:'rca-butterfly-design',title:'RCA Broadcast News 138 — Butterfly VHF Panel Antenna, Brawn and Kellom',url:'https://www.worldradiohistory.com/ARCHIVE-RCA/RCA-Broadcast-News/RCA-138.pdf',pages:'Article starts printed p. 9',note:'Manufacturer description of thin split reflector screen and galvanized-steel radiating elements. Used for general construction topology only; actual WTC dimensions and equipment assignment are not inferred from an unrelated catalog illustration.'},
  {id:'north-mast-2001',title:'Duncan Rawlinson — North Tower transmission mast, 1 January 2001',url:'https://commons.wikimedia.org/wiki/File:WorldTradeCenter_January1-01_d.jpg',pages:'Original photograph and Kodak EXIF; supplemental North roof view January1-01 e',note:'Dated 2001 photograph controls mast silhouette. Broad white flared base, enclosed tapered lower shaft, continuous white main shaft behind lower external panel racks, long white connector, radial butterfly panel arrays around the upper cylindrical spine, stepped white sleeve and terminal whip. Band heights, diameters, equipment and auxiliary aerial positions are photo estimates, not fabrication drawings. CC BY 2.0.'},
  {id:'north-mast-museum',title:'National September 11 Memorial & Museum — recovered antenna fragment C.2011.179.10',url:'https://collection.911memorial.org/Detail/objects/6223/rel/1',pages:'Historical notes',note:'Documents 360 ft mast and 2000 HDTV installation. Damaged fragment dimensions are not used as mast diameter.'},
  {id:'south-roof-2001',title:'Randy von Liski — South Tower outdoor observation roof, 2 August 2001',url:'https://www.flickr.com/photos/myoldpostcards/6131687967',pages:'Photographer’s dated original image',note:'Visible steel-supported elevated walkway, open central weather roof, white picket guards, framed wind screens, stairs, pipe cluster, low canopy and roof anchors. Photograph is a research reference; it is not an application image asset. The exact 2001 plan, entry position and local center-roof levels remain unverified.'},
  {id:'south-roof-1998',title:'David Holt — South Tower outdoor viewing platform, March 1998',url:'https://commons.wikimedia.org/wiki/File:2WTC_South_Tower_observation_deck_March_1998.jpg',pages:'Dated photographer’s original roof photograph; local reference credit in review notes',note:'Supplementary detail for shallow gabled access shelter, paired microwave dishes, telescopes and rectangular benches. Precise plan positions and equipment changes by 2001 have not been surveyed. CC BY-SA 2.0.'},
  {id:'south-roof-1975',title:'Anthony Hiss — Unfinished Business, The New Yorker, 22 December 1975',url:'https://www.newyorker.com/magazine/1975/12/22/unfinished-business-5',pages:'Contemporary opening tour, published online 15 December 1975',note:'Describes an 11 ft wide walkway 12 ft above roof, perimeter window-washer tracks and corner turntables, sixteen central pipes and roof beacons. These documented opening-era proportions are retained pending a dimensioned 2001 roof plan; later equipment placement follows the 2001 photograph approximately.'},
  {id:'tower-roof-aerial-2001',title:'Jeff Mock — World Trade Center aerial, March 2001',url:'https://commons.wikimedia.org/wiki/File:World_Trade_Center,_New_York_City_-_aerial_view_(March_2001).jpg',pages:'Original aerial photograph',note:'Checks roof perimeter, relative walkway setback and antenna scale; low image resolution does not supply exact plan dimensions. CC BY-SA 3.0.'}
]);

export const SOUTH_ROOF_PROFILE=SOUTH_ROOF_DETAIL_PROFILE;
// The sloping roof is documented by the Commission and visible in the supplied
// roof photographs. The two rises and plateau outline below are estimates,
// not measured concrete-slab levels. Structural floor datum stays unchanged.
export const ROOF_FINISH_PROFILE=Object.freeze({edgeHeight:.10,centerHeight:1.10,innerHalf:11.5,outerHalf:23.0,surveyed:false});
export function roofFinishHeight(x,z){
  const P=ROOF_FINISH_PROFILE,q=Math.max(0,Math.min(1,(Math.max(Math.abs(x),Math.abs(z))-P.innerHalf)/(P.outerHalf-P.innerHalf)));
  return P.centerHeight+(P.edgeHeight-P.centerHeight)*q;
}
export const TOWER_ROOF_EVIDENCE=Object.freeze({
  finishProfile:ROOF_FINISH_PROFILE,
  north:{antenna:ANTENNA_PROFILE,weatherRoof:'Opaque brown/gray finish over closed roof slab; finish is estimated',equipment:'Slim peripheral aerials, small hatches, window-washer tracks; positions reconstructed from January 2001 and March aerial',unsupportedServiceBoxesRemoved:true},
  south:SOUTH_ROOF_DETAIL_EVIDENCE
});

const TAU=2*Math.PI;
const outline=(radius,cut)=>[[-radius+cut,radius],[radius-cut,radius],[radius,radius-cut],[radius,-radius+cut],[radius-cut,-radius],[-radius+cut,-radius],[-radius,-radius+cut],[-radius,radius-cut]];
const CUBE_FACES=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
// An exact six-face convex panel, mirrored into renderer-local coordinates.
// Its center remains in drawing coordinates for the model's one final Z flip.
export function roofConvexPanel(vertices,faces=CUBE_FACES) {
  const lo=[0,1,2].map(a=>Math.min(...vertices.map(v=>v[a]))),hi=[0,1,2].map(a=>Math.max(...vertices.map(v=>v[a])));
  const center=lo.map((v,i)=>(v+hi[i])/2),centroid=[0,1,2].map(a=>vertices.reduce((s,v)=>s+v[a],0)/vertices.length);
  const planes=faces.map(face=>{
    const [a,b,c]=face.map(i=>vertices[i]),ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...n);
    if(length<1e-12)throw Error('Degenerate roof shell panel');
    n=n.map(v=>v/length);let d=n.reduce((s,v,i)=>s+v*a[i],0);
    if(n.reduce((s,v,i)=>s+v*centroid[i],0)>d){n=n.map(v=>-v);d=-d;}
    return [n[0],n[1],-n[2],d-n.reduce((s,v,i)=>s+v*center[i],0)];
  });
  return {center,half:lo.map((v,i)=>(hi[i]-v)/2),shape:{type:'convex',planes}};
}

export function buildTowerRoofFixtures(t,{box,rod,convex,materials:M,layers:L,halfWidth,cornerCut}) {
  const y=t.height,source=t.id===1?'north-mast-2001':'south-roof-2001',layer=L.roof,floor=110;
  const b=(x,h,z,sx,sy,sz,mat,kind,angle=0,src=source)=>box(t,x,y+h,z,sx,sy,sz,mat,layer,floor,kind,angle,undefined,src);
  const r=(a,c,w,d,mat,kind,src=source)=>rod(t,[a[0],y+a[1],a[2]],[c[0],y+c[1],c[2]],w,d,mat,layer,floor,kind,undefined,src);
  const slab=(poly,top,thickness,mat,kind,holes=[],src=source)=>{
    for(const piece of polygonPieces(poly,holes))convex(t,convexPrism(piece,y+top,thickness),mat,layer,floor,kind,src);
  };
  const tube=(x,z,bottom,top,r0,r1,wall,mat,kind,faces=16)=>{
    for(let i=0;i<faces;i++){
      const a=i*TAU/faces,c=(i+1)*TAU/faces,p=(angle,radius,h)=>[x+Math.sin(angle)*radius,y+h,z+Math.cos(angle)*radius];
      const points=[p(a,r0,bottom),p(c,r0,bottom),p(c,r1,top),p(a,r1,top),p(a,r0-wall,bottom),p(c,r0-wall,bottom),p(c,r1-wall,top),p(a,r1-wall,top)];
      convex(t,roofConvexPanel(points),mat,layer,floor,kind,source);
    }
  };
  const ring=(x,z,h,radius,width,mat,kind,segments=24)=>{
    for(let i=0;i<segments;i++){
      const a=i*TAU/segments,c=(i+1)*TAU/segments;
      r([x+Math.sin(a)*radius,h,z+Math.cos(a)*radius],[x+Math.sin(c)*radius,h,z+Math.cos(c)*radius],width,width,mat,kind);
    }
  };
  const disk=(x,z,h,radius,thickness,mat,kind,segments=24)=>{
    for(let i=0;i<segments;i++){
      const a=i*TAU/segments,c=(i+1)*TAU/segments;
      slab([[x,z],[x+Math.sin(a)*radius,z+Math.cos(a)*radius],[x+Math.sin(c)*radius,z+Math.cos(c)*radius]],h,thickness,mat,kind);
    }
  };
  const weatherOutline=outline(halfWidth-.96,Math.max(.75,cornerCut-.55));
  slab(weatherOutline,.028,.035,M.weatherRoof,'continuous tower weather roof');
  const P=ROOF_FINISH_PROFILE;
  slab(weatherOutline,P.edgeHeight,.08,M.weatherRoof,'roof perimeter weather finish');
  slab([[-P.innerHalf,P.innerHalf],[P.innerHalf,P.innerHalf],[P.innerHalf,-P.innerHalf],[-P.innerHalf,-P.innerHalf]],P.centerHeight,.10,M.weatherRoof,'raised central roof finish');
  for(let face=0;face<4;face++){
    const rotate=([x,h,z])=>{const a=face*Math.PI/2;return[x*Math.cos(a)+z*Math.sin(a),y+h,-x*Math.sin(a)+z*Math.cos(a)];};
    const top=[[-P.outerHalf,P.edgeHeight,P.outerHalf],[P.outerHalf,P.edgeHeight,P.outerHalf],[P.innerHalf,P.centerHeight,P.innerHalf],[-P.innerHalf,P.centerHeight,P.innerHalf]];
    convex(t,roofConvexPanel([...top,...top.map(v=>[v[0],v[1]-.08,v[2]])].map(rotate)),M.weatherRoof,layer,floor,'sloping central weather roof','user-roof-reference');
  }
  // Outside the public loop, the washing machine follows two narrow rails.
  // The corner turntables are described in the contemporary South roof tour.
  for(const offset of [1.70,1.91]){
    const rail=outline(halfWidth-offset,cornerCut*.9);
    for(let i=0;i<rail.length;i++)r([rail[i][0],.15,rail[i][1]],[rail[(i+1)%8][0],.15,rail[(i+1)%8][1]],.038,.038,M.antenna,'roof window-washer track',t.id===2?'south-roof-1975':source);
  }
  for(const sx of [-1,1])for(const sz of [-1,1])disk(sx*(halfWidth-2.3),sz*(halfWidth-2.3),.12,.65,.075,M.antenna,'roof washer corner turntable');

  if(t.id===1){
    const panel=(vertices,mat,kind,faces)=>convex(t,roofConvexPanel(vertices.map(p=>[p[0],y+p[1],p[2]]),faces),mat,layer,floor,kind,source);
    buildNorthMast({b,r,slab,tube,ring,disk,panel,M});
  }else buildSouthRoofFixtures(t,{box,rod,convex,materials:M,layers:L,halfWidth,roofHeight:roofFinishHeight},SOUTH_ROOF_PROFILE);
}
