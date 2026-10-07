/*
 * Parametric reconstruction of WTC 1 and WTC 2, before September 2001.
 * Source plans use east/north coordinates. The renderer is right-handed:
 * X east, Y up, Z south. Geometry is intersected analytically.
 * The model illustrates the documented structural SYSTEM. It is not a
 * drawing-book transcription, structural analysis, or an as-built survey.
 */

import { buildHistoricSite, getHistoricTowerCenters, SITE_CALIBRATION, sitePlanToStructure } from './site.js';
import { ORIGINAL_LOCAL_ELEVATOR_BANKS, ORIGINAL_OTHER_ELEVATOR_BANKS, ORIGINAL_STAIR_CHECKPOINTS, ORIGINAL_CORE_COLUMN_POSITIONS, ELEVATOR_LAYOUT_SOURCE } from './elevator-layout.js';
import { optimizePrimitives } from './geometry-optimizer.js';
import { polygonPieces,convexPrism } from './site-geometry.js';
import {buildTowerRoofFixtures,roofConvexPanel,TOWER_ROOF_SOURCES,TOWER_ROOF_EVIDENCE,SOUTH_ROOF_PROFILE} from './tower-roofs.js';
import {ROOF_CROWN,buildRoofCrown} from './roof-crown.js';
export {ROOF_CROWN};
export const LAYERS = Object.freeze({ facade:1, steel:2, core:4, floors:8, trusses:16, basement:32, roof:64, site:128, stairs:256, elevators:512, lights:1024, interior:2048 });
const FT = 0.3048, IN = 0.0254;
const H = (207 + 2/12) * FT / 2, CHAMFER = (6 + 11/12) * FT;
const CX = 135 * FT / 2, CZ = 87 * FT / 2;
const PITCH = 40 * IN, TRUSS_PITCH = 80 * IN, TRUSS_DEPTH = 29 * IN;
const ROOF_N = 417, ROOF_S = 415.2;
export const PLAZA_ELEVATION = 22*FT;
// Exterior finish proportions, estimated from the user-confirmed South Tower
// street entrance photo and independently checked in the North Tower photo.
// The fascia height is architectural cladding, not structural slab thickness.
// Its top remains at the documented plaza datum; no floor elevation is moved.
export const LOBBY_BAND_PROFILE=Object.freeze({bayPitch:3*PITCH,straightFasciaHeight:1.65,straightFasciaThickness:.07,ornamentalCentre:12.30,ornamentalEdgeHeight:1.15,ornamentalWaistHeight:.85,upperStripElevation:17.45,upperStripHeight:.075,source:'user-lobby-reference',referenceTower:2,northIndependentPhotoCheck:true,proportionEvidence:'data/lobby-band-proportions.json',surveyed:false});
// NCSTAR 1-5A section 4.2.2 supplies the relative curtain-wall dimensions.
// Absolute facade offsets, the spandrel setback, curved cover sections and
// finish parameters are estimated. Glass recess and nominal widths are sourced.
export const FACADE_PROFILE=Object.freeze({columnFront:.23,glassPlane:.23-11.5*IN,spandrelFront:.23-11.5*IN+.018,columnWidth:18.75*IN,coverDepth:16.5*IN,edgeWidth:.012,grooveRecess:.040,washerTrackWidth:1.5*IN,washerSlotWidth:.375*IN,windowWidth:21.25*IN,windowFrameWidth:IN,clearWindowWidth:19.25*IN,glassThickness:.25*IN,windowRecess:11.5*IN,spandrelCoverHeight:55*IN,floorEdge:.23-18*IN});
// The structural roof datum stays fixed. The unmeasured architectural crown
// rises above it, enclosing the original straight perimeter columns.

export const ENTRANCE_BAYS=Object.freeze([-7.62,-1.524,1.524,7.62]);
// Local face 0 points along +Z; WTC 2's local frame is turned 90 degrees.
// West Street / Liberty / hotel approaches are at the concourse level.
// Individual doorway-bay positions and less documented side approaches
// remain reconstructed; they are not a transcription of every original door.
export function getExteriorEntryElevation(towerId,face) {
  return towerId===1 ? (face===3?0:PLAZA_ELEVATION) : ([1,2].includes(face)?0:PLAZA_ELEVATION);
}
const STRUCTURE_NORTH = 29*Math.PI/180;
const SC=Math.cos(STRUCTURE_NORTH),SS=Math.sin(STRUCTURE_NORTH);
const MECHANICAL = new Set([7,8,41,42,75,76,108,109]);
const BEAM_FLOORS = new Set([1,2,3,4,5,6,7,8,9,41,42,43,75,76,77,108,109,110]);
const MEZZANINES = new Set([8,42,76,109]);
const SKY_LOBBIES = new Set([44,78]);

export const SOURCES = [
  ...TOWER_ROOF_SOURCES,
  {id:ELEVATOR_LAYOUT_SOURCE.id,title:'PANYNJ original Tower A drawings — floor plans and elevator risers',url:ELEVATOR_LAYOUT_SOURCE.catalogueUrl,pages:'PDF 35, 70, 78, 102, 106, 126, 134, 168, 176–189, 194–199; A-A-37 through A-A-175 and L-A plans',note:'Original Port Authority drawings reproduced in a public mirror. Uniform plan-scale digitization supplies 47 core-column centres, separate zoned local shaft plans and seven stair checkpoints; elevator drawings supply 99 numbered hoistways, bank stops, secondary landings, machine levels and available landing faces. North Tower drawings are applied to South Tower with a 90-degree rotation; that is a reconstruction assumption, not a South Tower as-built survey.'},
  { id:'nist-1-2a', title:'NIST NCSTAR 1-2A — Reference Structural Models and Baseline Performance Analysis', url:'https://nvlpubs.nist.gov/nistpubs/Legacy/NCSTAR/ncstar1-2a.pdf', pages:'1–10, 28–43, 46–55, Appendix G', note:'Final report; exterior trees, doubled trusses, two-way corner framing, bridging, beam floors and hat trusses.' },
  { id:'nist-1-1', title:'NIST NCSTAR 1-1 — Design, Construction, and Maintenance of Structural and Life Safety Systems', url:'https://nvlpubs.nist.gov/nistpubs/Legacy/NCSTAR/ncstar1-1.pdf', pages:'8–12, 18–19, 27, 123, 165–167', note:'Final report; dimensions, core orientation, skylobbies, mechanical levels, North Tower elevation drawing and full-height gypsum shaft enclosure details.' },
  { id:'nist-1-3', title:'NIST NCSTAR 1-3 — Mechanical and Metallurgical Analysis of Structural Steel', url:'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=101016', pages:'7–13; figures 2-2, 2-6, 2-8, 2-9', note:'Core column identifiers and individual box-to-wide-flange transition floors; perimeter column and spandrel dimensions.' },
  { id:'nist-1-2b',title:'NIST NCSTAR 1-2B, Vol. 1 — Analysis of Aircraft Impacts into the WTC Towers',url:'https://nvlpubs.nist.gov/nistpubs/Legacy/NCSTAR/ncstar1-2bv1.pdf',pages:'161–162; figure 7-4',note:'Structure north is approximately 29 degrees clockwise from true north; used only for site orientation.' },
  { id:'nist-1-9',title:'NIST NCSTAR 1-9 — Structural Fire Response and Probable Collapse Sequence of WTC 7',url:'https://nvlpubs.nist.gov/nistpubs/Legacy/NCSTAR/ncstar1-9.pdf',pages:'93; figure 5-2',note:'Pre-September 2001 site map used for approximate relative tower placement. The figure has no scale bar; offsets are visually digitized estimates, not surveyed dimensions.' },
  { id:'nist-1-7',title:'NIST NCSTAR 1-7 — Occupant Behavior, Egress, and Emergency Communications',url:'https://nvlpubs.nist.gov/nistpubs/Legacy/NCSTAR/ncstar1-7.pdf',pages:'12, 14–15, 20–23, 27–34, 240–243; figures 2-11 and 2-14',note:'Six-storey lobby, plaza above concourse, stair widths/endpoints and transfer floors, three elevator zones, reclaimed shaft space and upper floor uses. Original Tower A drawings supply digitized shaft and stair positions; connecting transfer corridors remain estimated.' },
  {id:'nist-1-5a',title:'NIST NCSTAR 1-5A — Visual Evidence, Damage Estimates, and Timeline Analysis, Chapters 1–8',url:'https://www.govinfo.gov/content/pkg/GOVPUB-C13-b797d5fa76a7b33ed8001bd3fe5c7450/pdf/GOVPUB-C13-b797d5fa76a7b33ed8001bd3fe5c7450.pdf',pages:'33, 35, 37–38, 40; sections 4.2.2, 4.2.3 and 4.2.7; figures 4-7 and 4-8',note:'18.75 × 16.5 in typical column cover, 21.25 in opening with 1 in frame and 19.25 in clear width, 11.5 in glass recess, 1.5 in stainless washer track with 3/8 in opening, 55 in spandrel cover, 1/4 in bronze-tinted glass; 18 in column-front-to-interior-wall distance. Level 107 has 12 in covers, 28 in openings, 11 ft 7 in windows, 5/16 in glass and 7 ft 1 in spandrel covers; 108/109 covers alternate 17/7 in and return to 12 in. Absolute facade offsets and unmeasured tree/crown curves remain estimates.'},
  {id:'wtc-photo-archive',title:'WTC Photo Archives — The Front Hall and Observation Deck',url:'https://www.wtc2.org/archive',pages:'Photographs: The Front Hall; Observation Deck',note:'Visual references for pale stone lobby columns/walls, glass mezzanine guards and South observation-deck guards. Roof crown profile uses the separately identified user supplied close photograph; no photograph supplies confirmed dimensions.'},
  {id:'user-roof-reference',title:'User supplied close photograph of the North Tower roof',url:null,pages:'Close photograph supplied in this task',note:'Visual reference for two upper pointed-window nodes and the silver inward-sloping crown. Photographer, date, elevations, slope and dimensions are not confirmed.'},
  {id:'user-lobby-reference',title:'User supplied street and lobby photographs',url:null,pages:'User-confirmed South Tower street entrance, separately identified North Tower street entrance, supplementary bridge-side view, curved gallery and pale stone interior photographs supplied in this task',note:'Independent raster readings in the South Tower entrance photo give about 61–65 px column pitch, 32–35 px straight fascia, 15–17 px bright waist (16–20 px silhouette) and 21–24 px visible near-column ornament. The North Tower oblique photo independently confirms the broad straight floor-edge fascia and pinched upper ornament, but its metre dimensions remain a shared South-photo estimate. These are reconstructed finish proportions, not surveyed dimensions. The straight fascia is 1.65 m high below the unchanged plaza datum, independently of the retained 0.18 m modeled structural slab. The upper band has estimated centre 12.30 m, 1.15 m endpoint height and 0.85 m at the waist; both edges bend inward. The true attachment behind column covers, threshold/vertical perspective calibration and exact tower/face of the supplementary bridge photo remain uncertain. Terminal glazing transom alignment is estimated. Lobby stone piers, continuous soffits, curved gallery corners and carpet palettes follow photographs; dates and the tower assignment of carpet colours remain unconfirmed.'},
  {id:'user-street-entrance-reference',title:'User supplied WTC 1 aerial and street-entry photographs',url:null,pages:'Aerial drop-off view and West Street porte-cochere photograph supplied in this task',note:'Confirms visually that the North Tower street entrance, drop-off pavement and low glazed porte-cochere belong to the street/concourse level, below the raised central plaza. Used to place the entrance at EL 310 in the model; canopy dimensions and exact surveyed pavement elevation are not provided.'},
  {id:'loc-plaza-1976',title:'Library of Congress — Towers and plaza, World Trade Center, New York',url:'https://www.loc.gov/item/2020714989/',pages:'1976 photograph',note:'Visual reference for the glazed pointed lobby openings between the exterior tree columns. Photographic profile reconstruction only.'}
];

export const MATERIALS = [
  { name:'Anodized aluminum', color:[0.78,0.79,0.78], roughness:0.36, metalness:0.84, transmission:0, ior:1.5, emission:[0,0,0], category:'facade',texture:{type:'aluminum',scale:1,variation:.045} },
  { name:'Inset bronze-tinted window glass', color:[0.72,0.68,0.60], roughness:0.035, metalness:0, transmission:0.92, ior:1.5, emission:[0,0,0], category:'glass' },
  { name:'Perimeter structural steel', color:[0.39,0.42,0.44], roughness:0.50, metalness:0.72, transmission:0, ior:1.5, emission:[0,0,0], category:'steel' },
  { name:'Core structural steel', color:[0.29,0.32,0.33], roughness:0.50, metalness:0.76, transmission:0, ior:1.5, emission:[0,0,0], category:'core' },
  { name:'Floor truss steel', color:[0.43,0.46,0.48], roughness:0.50, metalness:0.70, transmission:0, ior:1.5, emission:[0,0,0], category:'truss' },
  { name:'Lightweight concrete', color:[0.57,0.56,0.52], roughness:0.90, metalness:0, transmission:0, ior:1.5, emission:[0,0,0], category:'concrete',texture:{type:'concrete',scale:.8,variation:.10} },
  { name:'Galvanized steel deck', color:[0.51,0.54,0.55], roughness:0.48, metalness:0.85, transmission:0, ior:1.5, emission:[0,0,0], category:'deck' },
  { name:'Mechanical louvers', color:[0.40,0.42,0.42], roughness:0.44, metalness:0.75, transmission:0, ior:1.5, emission:[0,0,0], category:'mechanical' },
  { name:'Lobby stone', color:[0.78,0.72,0.61], roughness:0.80, metalness:0, transmission:0, ior:1.5, emission:[0,0,0], category:'interior',texture:{type:'stone',scale:2.8,variation:.07} },
  { name:'Warm office light', color:[0.98,0.87,0.62], roughness:0.70, metalness:0, transmission:0, ior:1.5, emission:[16.0,11.5,5.5], category:'light' },
  { name:'Cool office light', color:[0.82,0.89,0.96], roughness:0.70, metalness:0, transmission:0, ior:1.5, emission:[10.0,14.0,18.0], category:'light' },
  { name:'Roof membrane', color:[0.34,0.35,0.34], roughness:0.90, metalness:0, transmission:0, ior:1.5, emission:[0,0,0], category:'roof' },
  { name:'Antenna and roof steel', color:[0.67,0.69,0.70], roughness:0.38, metalness:0.90, transmission:0, ior:1.5, emission:[0,0,0], category:'roof' },
  { name:'Plaza paving', color:[0.64,0.61,0.56], roughness:0.90, metalness:0, transmission:0, ior:1.5, emission:[0,0,0], category:'site' },
  { name:'Low context buildings', color:[0.44,0.45,0.44], roughness:0.90, metalness:0.12, transmission:0, ior:1.5, emission:[0,0,0], category:'context' },
  { name:'Bronze plaza sculpture', color:[0.28,0.25,0.16], roughness:0.52, metalness:0.90, transmission:0, ior:1.5, emission:[0,0,0], category:'site' },
  { name:'Safety beacon', color:[0.88,0.09,0.025], roughness:0.4, metalness:0, transmission:0, ior:1.5, emission:[7,0.24,0.04], category:'light' },
  { name:'Office ceiling and gypsum shaft walls', color:[0.82,0.81,0.77], roughness:0.88, metalness:0, transmission:0, ior:1.5, emission:[0,0,0], category:'interior',texture:{type:'concrete',scale:.7,variation:.025} },
  { name:'Office desk surface', color:[0.45,0.39,0.30], roughness:0.78, metalness:0, transmission:0, ior:1.5, emission:[0,0,0], category:'interior',texture:{type:'wood',scale:.5,variation:.08} },
  {name:'Polished pale lobby marble',color:[0.79,0.77,0.72],roughness:0.26,metalness:0,transmission:0,ior:1.5,emission:[0,0,0],category:'interior',texture:{type:'stone',scale:2.8,variation:.07}},
  {name:'Observation deck surface',color:[.23,.45,.57],roughness:.88,metalness:0,transmission:0,ior:1.5,emission:[0,0,0],category:'roof'},
  {name:'White observation guard',color:[.90,.91,.91],roughness:.32,metalness:.48,transmission:0,ior:1.5,emission:[0,0,0],category:'roof'},
  {name:'Warm public lobby light',color:[.98,.87,.62],roughness:.70,metalness:0,transmission:0,ior:1.5,emission:[24.0,17.0,8.0],category:'light',nightOnly:false},
  // Photographic finish calibration, not a measured historical BRDF. The
  // recessed sheet reads rougher/darker than the projecting column covers.
  {name:'Recessed aluminum spandrel finish',color:[.58,.59,.58],roughness:.78,metalness:.70,transmission:0,ior:1.5,emission:[0,0,0],category:'facade',texture:{type:'aluminum',scale:1,variation:.025}},
  {name:'Green lobby carpet',color:[.12,.19,.14],roughness:.96,metalness:0,transmission:0,ior:1.5,emission:[0,0,0],category:'interior',texture:{type:'concrete',scale:.4,variation:.05}},
  {name:'Purple lobby carpet',color:[.23,.12,.23],roughness:.96,metalness:0,transmission:0,ior:1.5,emission:[0,0,0],category:'interior',texture:{type:'concrete',scale:.4,variation:.05}},
  {name:'White painted antenna mast and radome',color:[.87,.87,.84],roughness:.52,metalness:.12,transmission:0,ior:1.5,emission:[0,0,0],category:'roof'},
  {name:'Brown gray tower weather roof',color:[.30,.275,.22],roughness:.94,metalness:0,transmission:0,ior:1.5,emission:[0,0,0],category:'roof',texture:{type:'concrete',scale:.4,variation:.025}},
  {name:'Clear rooftop wind screen glass',color:[.95,.98,.99],roughness:.025,metalness:0,transmission:.94,ior:1.5,emission:[0,0,0],category:'glass'},
  {name:'Weathered broadcast antenna metal',color:[.20,.20,.18],roughness:.65,metalness:.55,transmission:0,ior:1.5,emission:[0,0,0],category:'roof'},
  {name:'Faded pink rooftop radio dish',color:[.68,.30,.40],roughness:.76,metalness:.12,transmission:0,ior:1.5,emission:[0,0,0],category:'roof'},
  {name:'Muted red painted roof marking',color:[.52,.22,.23],roughness:.90,metalness:0,transmission:0,ior:1.5,emission:[0,0,0],category:'roof'},
  {name:'Dark recessed rooftop mechanical screen',color:[.055,.06,.062],roughness:.9,metalness:.04,transmission:0,ior:1.5,emission:[0,0,0],category:'facade'}
];
const MAT = Object.freeze({aluminum:0,glass:1,exterior:2,core:3,truss:4,concrete:5,deck:6,louver:7,stone:8,warm:9,cool:10,roof:11,antenna:12,paving:13,context:14,bronze:15,beacon:16,gypsum:17,desk:18,marble:19,observationDeck:20,whiteFence:21,lobbyWarm:22,spandrel:23,greenCarpet:24,purpleCarpet:25,mastWhite:26,weatherRoof:27,clearWindGlass:28,broadcastSteel:29,radioDishPink:30,roofMark:31,roofScreen:32});

// Fig. 2-2 NCSTAR 1-1: the North Tower is not 110 uniformly spaced floors.
// Lower floors 3–6 include core transfer/service levels; their precise floor-top
// elevations are reconstructed from documented spandrel/tree/floor-7 levels.
function floorElevations(roof) {
  const feet = [0,0,22,40.25,53,62,71,80,92,104];
  for (let f=10;f<=110;f++) {
    let delta = 12;
    if ([41,42,43,44,45,75,76,77,79].includes(f)) delta = 14;
    if (f===68) delta = 16;
    if (f===107) delta = 14 + 4/12;
    if ([108,109,110].includes(f)) delta = (42 + 8/12)/3;
    feet[f] = feet[f-1] + delta;
  }
  const elevations = feet.map(v=>v*FT);
  elevations[111] = roof;
  return elevations;
}

// Keep the drawing-space builders in their original frame, and reflect their
// complete output once at the renderer boundary (positions AND orientations).
// Swapping tower labels or the antenna cannot repair a mirrored site.
const HISTORIC_TOWER_CENTERS=getHistoricTowerCenters().map(([x,y,z])=>[x,y,-z]);
const TOWER_DEFS = [
  {id:1,key:'north',name:'North Tower · WTC 1',center:[-35.052,0,47.244],height:ROOF_N,roofElevation:ROOF_N,orientation:0,coreLongAxis:'east–west',antennaHeight:109.728},
  {id:2,key:'south',name:'South Tower · WTC 2',center:[35.052,0,-47.244],height:ROOF_S,roofElevation:ROOF_S,orientation:Math.PI/2,coreLongAxis:'north–south',antennaHeight:0}
].map(t=>({...t,center:HISTORIC_TOWER_CENTERS[t.id-1],orientation:t.orientation+STRUCTURE_NORTH,floorCount:110,width:H*2,coreDimensions:[CX*2,CZ*2],elevations:floorElevations(t.height),floors:[]}));

function floorType(f) {
  if (f<0) return 'basement';
  if (f===1) return 'concourse / lobby';
  if (f===2) return 'plaza / lobby mezzanine';
  if (MEZZANINES.has(f)) return 'mechanical mezzanine';
  if (MECHANICAL.has(f)) return 'mechanical equipment';
  if (SKY_LOBBIES.has(f)) return 'sky lobby';
  if (f>=107) return 'hat truss / upper services';
  if (f<=6) return 'lower service / lobby transition';
  if (BEAM_FLOORS.has(f)) return 'beam-framed transition';
  return 'tenant office';
}

export function getTowerFloor(towerId=1,floor=1) {
  const t = TOWER_DEFS.find(t=>t.id===Number(towerId) || t.key===String(towerId).toLowerCase()) || TOWER_DEFS[0];
  const f = Math.max(-6,Math.min(110,Math.round(Number(floor)||1)));
  const elevation = f<0 ? [-4.8768,-7.9248,-10.9728,-14.0208,-17.3736,-20.7264][-f-1] : t.elevations[f];
  const top = f<0 ? (f===-1?0:getTowerFloor(t.id,f+1).elevation) : t.elevations[f+1];
  const use=f===107?(t.id===1?'Windows on the World restaurant':'indoor observation deck'):f===110?(t.id===1?'television studios':'mechanical equipment'):floorType(f);
  return {tower:t.id,floor:f,elevation,height:top-elevation,top,type:floorType(f),use,beamFramed:BEAM_FLOORS.has(f),mechanical:MECHANICAL.has(f),skyLobby:SKY_LOBBIES.has(f),center:[t.center[0],elevation+(top-elevation)/2,t.center[2]]};
}

// NIST 1-7 pp. 27–29 and Table 2-2: A/C leave the structural core at
// 42–47 and 76–81, then return. Positions and orientations are digitized
// original Tower A checkpoints; the intermediate transfer corridors are estimated.
// Positions describe the outgoing flight at a floor. Transfer floors also
// retain the incoming opening, joined by an enclosed orthogonal corridor.
export function getStairLayout(floor) {
  const f=Number(floor), out=[];
  const checkpoint=ORIGINAL_STAIR_CHECKPOINTS.find(c=>f>=c.from&&f<=c.to)||ORIGINAL_STAIR_CHECKPOINTS[0];
  const stair=id=>({...checkpoint.stairs.find(s=>s.id===id),source:checkpoint.source,sourcePage:checkpoint.sourcePage,sourceDrawing:checkpoint.sourceDrawing});
  if(f>=-6 && f<=107) out.push({...stair('B'),width:56*IN,from:-6,to:107,exitFloors:[1]});
  if(f>=2 && f<=110) for(const id of ['A','C']) out.push({...stair(id),width:44*IN,from:2,to:110,exitFloors:[2]});
  return out;
}
const TRANSFER_FLOORS=new Set([42,48,66,68,76,82]);

// Tower A L-A risers provide each bank's numbered cells, actual stop ranges,
// secondary landing and machine floor. Metric plan coordinates are uniformly
// digitized readings, and the rotated WTC 2 arrangement remains an assumption.
export const ELEVATOR_BANKS = [
  ...ORIGINAL_LOCAL_ELEVATOR_BANKS,
  ...ORIGINAL_OTHER_ELEVATOR_BANKS
];
function shaftCells(bank) {
  return bank.cells.map(cell=>({...cell,bank}));
}
export const ELEVATOR_SHAFTS=ELEVATOR_BANKS.flatMap(shaftCells);
const SHAFT_CELLS=ELEVATOR_SHAFTS;
export function getFloorOpenings(floor) {
  const f=Number(floor),holes=[];
  const stairs=getStairLayout(f);
  if(TRANSFER_FLOORS.has(f)) for(const s of getStairLayout(f-1)) if(s.id!=='B'||f===76) stairs.push({...s,incoming:true});
  for(const s of stairs) {
    const width=s.width*2+0.12;
    const turned=Math.abs(Math.sin(s.rotation))>.5,dx=turned?2.03:width/2,dz=turned?width/2:2.03;
    holes.push({id:`stair-${s.id}${s.incoming?'-incoming':''}`,type:'stair',bounds:[s.x-dx,s.x+dx,s.z-dz,s.z+dz]});
  }
  for(const cell of SHAFT_CELLS) if(f>=(cell.pitFloor??cell.bank.base) && f<=cell.bank.shaftTop) for(const bounds of cell.clearBounds) holes.push({id:cell.id,type:'elevator',bounds});
  return holes;
}

// Trace only the boundary of a rectangular union. Shaft corners wrap around
// the original column positions; independent rectangles would add false walls.
function openingBoundary(rects) {
  const xs=[...new Set(rects.flatMap(r=>r.slice(0,2)))].sort((a,b)=>a-b),zs=[...new Set(rects.flatMap(r=>r.slice(2,4)))].sort((a,b)=>a-b);
  const occupied=(x,z)=>rects.some(r=>x>r[0]&&x<r[1]&&z>r[2]&&z<r[3]);
  const edges=[];
  for(const [axis,coords,spans] of [[0,xs,zs],[1,zs,xs]]) for(const v of coords) {
    let current=null;
    for(let i=0;i<spans.length-1;i++) {
      const lo=spans[i],hi=spans[i+1],mid=(lo+hi)/2,eps=.00001;
      const a=axis===0?occupied(v-eps,mid):occupied(mid,v-eps),b=axis===0?occupied(v+eps,mid):occupied(mid,v+eps);
      const normal=a===b?0:a?1:-1;
      if(normal&&current&&current.normal===normal&&Math.abs(current.hi-lo)<1e-8)current.hi=hi;
      else {current=normal?{axis,v,lo,hi,normal}:null;if(current)edges.push(current);}
    }
  }
  return edges;
}
function routeSpans(a,b,holes) {
  const dx=b[0]-a[0],dz=b[1]-a[1];
  let spans=[[0,1]];
  for(const [x1,x2,z1,z2] of holes) {
    let enter=0,leave=1,intersects=true;
    for(const [origin,delta,lo,hi] of [[a[0],dx,x1,x2],[a[1],dz,z1,z2]]) {
      if(Math.abs(delta)<1e-9) {if(origin<=lo+1e-6||origin>=hi-1e-6) intersects=false;}
      else {const aa=(lo-origin)/delta,bb=(hi-origin)/delta;enter=Math.max(enter,Math.min(aa,bb));leave=Math.min(leave,Math.max(aa,bb));}
    }
    if(!intersects||leave<=enter) continue;
    const next=[];
    for(const [lo,hi] of spans) {
      if(leave<=lo||enter>=hi) next.push([lo,hi]);
      else {if(enter>lo) next.push([lo,enter]);if(leave<hi) next.push([leave,hi]);}
    }
    spans=next;
  }
  return spans;
}
const OUTER_STAIR_OPENINGS=new Map([...Array.from({length:7},(_,i)=>42+i),...Array.from({length:7},(_,i)=>76+i)].map(f=>[f,getFloorOpenings(f).filter(h=>h.type==='stair'&&(h.bounds[0]<-CX||h.bounds[1]>CX)).map(h=>h.bounds)]));

// Original architectural plan A-A-132 supplies the uniformly calibrated
// column centres. NIST supplies IDs, row topology and section transitions.
const CORE_ROWS = [
  {row:5,pz:553,px:[262,342,425,503,559,637,730,800],transition:[83,83,83,86,86,83,83,83]},
  {row:6,pz:615,px:[262,342,425,503,559,637,730,800],transition:[80,80,80,80,80,80,80,80]},
  {row:7,pz:704,px:[262,358,469,504,559,604,705,800],transition:[83,7,75,7,7,24,7,92]},
  {row:8,pz:737,px:[262,358,469,559,604,705,800],transition:[95,7,95,9,7,7,89]},
  {row:9,pz:824,px:[262,342,425,503,559,637,730,800],transition:[89,48,80,77,86,48,48,48]},
  {row:10,pz:885,px:[262,342,425,503,559,637,730,800],transition:[80,77,77,86,86,77,77,80]}
];
export const CORE_COLUMNS = CORE_ROWS.flatMap(row=>row.px.map((p,i)=>{
  const id=row.row*100+i+1,original=ORIGINAL_CORE_COLUMN_POSITIONS.find(c=>c.id===id);
  if(!original)throw new Error(`Missing original core column ${id}`);
  return {id,row:row.row,index:i,x:original.x,z:original.z,transition:row.transition[i],outer:i===0||i===row.px.length-1,corner:(row.row===5||row.row===10)&&(i===0||i===7),source:ELEVATOR_LAYOUT_SOURCE.id};
}));

function quaternionY(angle) { return [0,Math.sin(angle/2),0,Math.cos(angle/2)]; }
function multiplyQuaternion(a,b) {
  return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
}
function alongY(dx,dy,dz) {
  const length=Math.hypot(dx,dy,dz), x=dx/length,y=dy/length,z=dz/length;
  if (y<-0.999999) return [1,0,0,0];
  const q=[z,0,-x,1+y], n=Math.hypot(...q);
  return q.map(v=>v/n);
}
function random01(n) { let k=n|0; k=Math.imul(k^(k>>>16),0x45d9f3b); k=Math.imul(k^(k>>>16),0x45d9f3b); return ((k^(k>>>16))>>>0)/4294967296; }

export function buildModel(onProgress=()=>{}, {profileMerging = true} = {}) {
  let primitives=[];
  const geometryGroups=[];
  const countByKind={},countByLayer={},countByTower={0:0,1:0,2:0};
  let mainTrussPairs=0,bridgingTrusses=0;
  function progress(message) { onProgress(message); }
  function add(center,half,material,layer,tower,floor=0,kind='member',rotation,id,source='nist-1-2a') {
    if (half.some(v=>!(v>0))) return;
    const p={center,half,material,layer,tower,floor,kind,source};
    if (rotation && Math.abs(rotation[3]-1)>1e-10) p.rotation=rotation;
    if (id) p.id=id;
    primitives.push(p);
    countByKind[kind]=(countByKind[kind]||0)+1;
    countByLayer[layer]=(countByLayer[layer]||0)+1;
    countByTower[tower]=(countByTower[tower]||0)+1;
    return p;
  }
  function world(t,x,y,z) { const c=Math.cos(t.orientation),s=Math.sin(t.orientation); return [t.center[0]+c*x+s*z,y,t.center[2]-s*x+c*z]; }
  function box(t,x,y,z,sx,sy,sz,material,layer,floor,kind,angle=0,id,source) {
    return add(world(t,x,y,z),[sx/2,sy/2,sz/2],material,layer,t.id,floor,kind,quaternionY(t.orientation+angle),id,source);
  }
  function rod(t,a,b,width,depth,material,layer,floor,kind,id,source) {
    const holes=layer===LAYERS.trusses?OUTER_STAIR_OPENINGS.get(floor):null;
    const spans=holes?.length?routeSpans([a[0],a[2]],[b[0],b[2]],holes):[[0,1]];
    let result;
    for(const [lo,hi] of spans) {
      const aa=a.map((v,i)=>v+(b[i]-v)*lo),bb=a.map((v,i)=>v+(b[i]-v)*hi);
      const p=world(t,...aa),q=world(t,...bb),d=q.map((v,i)=>v-p[i]);
      const len=Math.hypot(...d);
      if(len<1e-8) continue;
      result=add(p.map((v,i)=>(v+q[i])/2),[width/2,len/2,depth/2],material,layer,t.id,floor,kind,alongY(...d),id,source);
    }
    return result;
  }
  const footprintRadius=H*(Math.abs(SC)+Math.abs(SS));
  const towers=TOWER_DEFS.map(t=>({...t,center:[...t.center],elevations:[...t.elevations],floors:Array.from({length:110},(_,i)=>getTowerFloor(t.id,i+1)),coreColumns:CORE_COLUMNS.map(c=>({...c,position:world(t,c.x,0,c.z)})),bounds:{min:[t.center[0]-footprintRadius,-21.15,t.center[2]-footprintRadius],max:[t.center[0]+footprintRadius,t.height+Math.max(t.antennaHeight,ROOF_CROWN.bottomAboveRoof+ROOF_CROWN.rise,t.id===2?SOUTH_ROOF_PROFILE.maxFixtureAboveRoof:0),t.center[2]+footprintRadius]}}));

  function faceBox(t,face,u,y,n,su,sy,sn,mat,layer,f,kind,id,source) {
    const a=face*Math.PI/2, c=Math.cos(a),s=Math.sin(a);
    return box(t,u*c+n*s,y,-u*s+n*c,su,sy,sn,mat,layer,f,kind,a,id,source);
  }
  function faceRod(t,face,a,b,w,d,mat,layer,f,kind) {
    const angle=face*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    const convert=p=>[p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];
    return rod(t,convert(a),convert(b),w,d,mat,layer,f,kind);
  }
  // Keep the depth axis normal to a face when sweeping a flat channel.
  // The generic rod quaternion is appropriate for steel bars, but does not
  // preserve a facade profile's front/back orientation on all four faces.
  function faceSegment(t,face,a,b,width,depth,n,mat,layer,f,kind,id,overlap=.008,source='wtc-photo-archive') {
    const du=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(du,dy);
    if(len<1e-9) return;
    const angle=-Math.atan2(du,dy),q=multiplyQuaternion(quaternionY(t.orientation+face*Math.PI/2),[0,0,Math.sin(angle/2),Math.cos(angle/2)]);
    const u=(a[0]+b[0])/2,y=(a[1]+b[1])/2,fa=face*Math.PI/2;
    return add(world(t,u*Math.cos(fa)+n*Math.sin(fa),y,-u*Math.sin(fa)+n*Math.cos(fa)),[width/2,(len+overlap)/2,depth/2],mat,layer,t.id,f,kind,q,id,source);
  }
  function faceSpatialSegment(t,face,a,b,width,depth,mat,f,kind,id,overlap=.008) {
    const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d);
    if(length<1e-9) return;
    const y=d.map(v=>v/length),normalLength=Math.hypot(d[1],d[2]),z=[0,-d[2]/normalLength,d[1]/normalLength];
    const x=[y[1]*z[2]-y[2]*z[1],y[2]*z[0]-y[0]*z[2],y[0]*z[1]-y[1]*z[0]];
    const xl=Math.hypot(...x);for(let i=0;i<3;i++) x[i]/=xl;
    const m=[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]],trace=m[0]+m[4]+m[8];
    let q;
    if(trace>0) {const s=2*Math.sqrt(1+trace);q=[(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s,s/4];}
    else if(m[0]>m[4]&&m[0]>m[8]) {const s=2*Math.sqrt(1+m[0]-m[4]-m[8]);q=[s/4,(m[1]+m[3])/s,(m[2]+m[6])/s,(m[7]-m[5])/s];}
    else if(m[4]>m[8]) {const s=2*Math.sqrt(1+m[4]-m[0]-m[8]);q=[(m[1]+m[3])/s,s/4,(m[5]+m[7])/s,(m[2]-m[6])/s];}
    else {const s=2*Math.sqrt(1+m[8]-m[0]-m[4]);q=[(m[2]+m[6])/s,(m[5]+m[7])/s,s/4,(m[3]-m[1])/s];}
    const fa=face*Math.PI/2,u=(a[0]+b[0])/2,n=(a[2]+b[2])/2;
    return add(world(t,u*Math.cos(fa)+n*Math.sin(fa),(a[1]+b[1])/2,-u*Math.sin(fa)+n*Math.cos(fa)),[width/2,(length+overlap)/2,depth/2],mat,LAYERS.facade,t.id,f,kind,multiplyQuaternion(quaternionY(t.orientation+fa),q),id,'loc-plaza-1976');
  }
  function faceRuledSide(t,face,a,b,frontA,frontB,rearA,rearB,mat,f,kind,id) {
    // The deep side is a planar ruled sheet. Its normal depends on the
    // facade path, not the changing front/back midpoint. Tilting that
    // normal with the midpoint depth exposes centimetre-wide end caps.
    const du=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(du,dy);
    if(length<1e-9) return;
    const inset=.012,front=Math.min(frontA,frontB)-inset,rear=Math.max(rearA,rearB)+inset;
    if(front>rear) faceSegment(t,face,a,b,.018,front-rear,(front+rear)/2,mat,LAYERS.facade,f,kind,id,.012,'loc-plaza-1976');
    const normal=[dy/length,-du/length,0];
    for(const [endA,endB,sign,label] of [[frontA,frontB,-1,'front'],[rearA,rearB,1,'rear']]) {
      // Narrow boundary ribbons cover the inward core plate's taper steps.
      // Their outer long edges follow the actual skin edge. The projection
      // of the cross-section onto Y is included in the cap support, so an
      // oblique ribbon's four corners remain inside its analytic box.
      facePlanarRibbon(t,face,[a[0],a[1],endA],[b[0],b[1],endB],[0,0,1],.016+Math.abs(endB-endA),sign,normal,mat,f,kind,`${id}-${label}`);
    }
  }
  function faceRuledCover(t,face,a,b,widthA,widthB,mat,f,kind,id,overlap=.012) {
    // A tapered front/rear cover is a trapezoid in its segment plane. Its
    // inset core cannot overhang the narrower end; two straight boundary
    // ribbons follow both real edges and conceal the core's end caps.
    const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d),normalLength=Math.hypot(d[1],d[2]);
    if(length<1e-9||normalLength<1e-9) return;
    const width=Math.min(widthA,widthB),projected=width*normalLength/length,normal=[0,-d[2]/normalLength,d[1]/normalLength];
    faceSpatialSegment(t,face,a,b,projected-.024,.018,mat,f,kind,id,overlap+width*Math.abs(d[0])/length);
    for(const side of [-1,1]) facePlanarRibbon(t,face,[a[0]+side*widthA/2,a[1],a[2]],[b[0]+side*widthB/2,b[1],b[2]],[1,0,0],.016+Math.abs(widthB-widthA)/2,-side,normal,mat,f,kind,`${id}-${side}`,overlap);
  }
  function facePlanarRibbon(t,face,a,b,sectionAxis,ribbon,sign,normal,mat,f,kind,id,overlap=.012) {
    const ca=a.map((v,i)=>v+sectionAxis[i]*sign*ribbon/2),cb=b.map((v,i)=>v+sectionAxis[i]*sign*ribbon/2);
    const delta=cb.map((v,i)=>v-ca[i]),span=Math.hypot(...delta),x=normal,y=delta.map(v=>v/span);
    const z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
    const m=[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]],trace=m[0]+m[4]+m[8];let q;
    if(trace>0) {const s=2*Math.sqrt(1+trace);q=[(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s,s/4];}
    else if(m[0]>m[4]&&m[0]>m[8]) {const s=2*Math.sqrt(1+m[0]-m[4]-m[8]);q=[s/4,(m[1]+m[3])/s,(m[2]+m[6])/s,(m[7]-m[5])/s];}
    else if(m[4]>m[8]) {const s=2*Math.sqrt(1+m[4]-m[0]-m[8]);q=[(m[1]+m[3])/s,s/4,(m[5]+m[7])/s,(m[2]-m[6])/s];}
    else {const s=2*Math.sqrt(1+m[8]-m[0]-m[4]);q=[(m[2]+m[6])/s,(m[5]+m[7])/s,s/4,(m[3]-m[1])/s];}
    const c=ca.map((v,i)=>(v+cb[i])/2),fa=face*Math.PI/2;
    const shear=ribbon*Math.abs(sectionAxis.reduce((s,v,i)=>s+v*y[i],0)),width=ribbon*Math.abs(sectionAxis.reduce((s,v,i)=>s+v*z[i],0));
    add(world(t,c[0]*Math.cos(fa)+c[2]*Math.sin(fa),c[1],-c[0]*Math.sin(fa)+c[2]*Math.cos(fa)),[.009,(span+shear+overlap)/2,width/2],mat,LAYERS.facade,t.id,f,kind,multiplyQuaternion(quaternionY(t.orientation+fa),q),id,'loc-plaza-1976');
  }
  const channelArcAngles=[0,Math.PI/8,Math.PI/4,3*Math.PI/8,Math.PI/2];
  function channelSegment(t,face,a,b,width,f,kind,id,profile) {
    const front=H+(profile?.front??FACADE_PROFILE.columnFront),rear=profile?H+profile.rear:front-FACADE_PROFILE.coverDepth;
    const source=profile?'loc-plaza-1976':'nist-1-5a';
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1e-9) return;
    const nx=(b[1]-a[1])/len,ny=-(b[0]-a[0])/len,slot=FACADE_PROFILE.washerSlotWidth,lip=.024;
    const rounded=profile?.roundDepth??.065,thickness=.018;
    // A folded, convex nose rolls into the long side return. The maximum
    // front and overall cover width retain the documented section envelope;
    // its unmeasured radii are reconstructed from the supplied close views.
    const facet=(p,q,mat,suffix,thick=thickness)=>{
      const x=(p[0]+q[0])/2,n=(p[1]+q[1])/2,du=q[0]-p[0],dn=q[1]-p[1],w=Math.hypot(du,dn);
      const primitive=faceSegment(t,face,[a[0]+nx*x,a[1]+ny*x],[b[0]+nx*x,b[1]+ny*x],w+.001,thick,n,mat,LAYERS.facade,f,kind+suffix,id,.008,source);
      primitive.rotation=multiplyQuaternion(primitive.rotation||[0,0,0,1],quaternionY(-Math.atan2(dn,du)));
    };
    for(const side of [-1,1]) {
      facet([side*slot/2,front-.0125],[side*(slot/2+lip),front-.0125],MAT.aluminum,' washer slot lip',.025);
      const start=slot/2+lip-.006,span=width/2-start;
      const arc=angle=>[side*(start+span*Math.sin(angle)),front-.014-rounded*(1-Math.cos(angle))];
      for(let k=0;k<channelArcAngles.length-1;k++) facet(arc(channelArcAngles[k]),arc(channelArcAngles[k+1]),MAT.aluminum,' face');
      facet(arc(Math.PI/2),[side*(width/2-.012),rear+.0125],MAT.aluminum,' edge',.012);
      const rail=side*(FACADE_PROFILE.washerTrackWidth/2-.002);
      faceSegment(t,face,[a[0]+nx*rail,a[1]+ny*rail],[b[0]+nx*rail,b[1]+ny*rail],.004,.032,front-.024,MAT.antenna,LAYERS.facade,f,kind+' washer track wall',id,.008,source);
    }
    faceSegment(t,face,a,b,FACADE_PROFILE.washerTrackWidth,.006,front-FACADE_PROFILE.grooveRecess-.003,MAT.antenna,LAYERS.facade,f,kind+' recessed web',id,.008,source);
    if(profile?.closed) faceSegment(t,face,a,b,width-.024,.025,rear+.0125,MAT.aluminum,LAYERS.facade,f,kind+' rear enclosure',id,.008,source);
  }
  function curvedChannel(t,face,curve,widthAt,f,kind,idPrefix,count=80) {
    const front=FACADE_PROFILE.columnFront,rear=front-FACADE_PROFILE.coverDepth;
    treeChannel(t,face,curve,widthAt,()=>front,()=>rear,curve(0)[1],curve(1)[1],idPrefix,count,{floor:f,kind,closed:false,roundDepthAt:()=>.065,arcAngles:[0,.90,Math.PI/2],source:'nist-1-5a'});
  }
  function treeChannel(t,face,curve,widthAt,frontAt,rearAt,start,end,idPrefix,count=80,options={}) {
    const points=Array.from({length:count+1},(_,i)=>curve(i/count)),slot=FACADE_PROFILE.washerSlotWidth,lip=.024;
    const floor=options.floor??7,kind=options.kind??'curved trident aluminum',source=options.source??'loc-plaza-1976',arcAngles=options.arcAngles??channelArcAngles;
    // Both photographed connections have an exactly vertical tangent.
    // A one-sided chord rotates the last section and exposes its end cap
    // against the straight cover, even when the underlying curve is C1.
    const tangent=i=>{if(i===0||i===count)return [1,0];const a=points[i-1],b=points[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);return [(b[1]-a[1])/length,-(b[0]-a[0])/length];};
    const sectionPoint=(i,p)=>{const [nx,ny]=tangent(i);return [points[i][0]+nx*p[0],points[i][1]+ny*p[0],H+p[1]];};
    const sweep=(pairAt,thickness,mat,suffix)=>{
      const pairs=points.map((_,i)=>pairAt(i/count).map(p=>sectionPoint(i,p)));
      const centers=pairs.map(p=>p[0].map((v,k)=>(v+p[1][k])/2));
      const axes=centers.slice(1).map((p,i)=>{const v=p.map((n,k)=>n-centers[i][k]),l=Math.hypot(...v);return v.map(n=>n/l);});
      for(let i=0;i<count;i++) {
        const y=axes[i],cross=pairs[i][0].map((_,k)=>(pairs[i][1][k]-pairs[i][0][k]+pairs[i+1][1][k]-pairs[i+1][0][k])/2);
        const dot=cross.reduce((s,v,k)=>s+v*y[k],0),x=cross.map((v,k)=>v-dot*y[k]),xl=Math.hypot(...x);for(let k=0;k<3;k++) x[k]/=xl;
        const z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
        const m=[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]],trace=m[0]+m[4]+m[8];let q;
        if(trace>0) {const s=2*Math.sqrt(1+trace);q=[(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s,s/4];}
        else if(m[0]>m[4]&&m[0]>m[8]) {const s=2*Math.sqrt(1+m[0]-m[4]-m[8]);q=[s/4,(m[1]+m[3])/s,(m[2]+m[6])/s,(m[7]-m[5])/s];}
        else if(m[4]>m[8]) {const s=2*Math.sqrt(1+m[4]-m[0]-m[8]);q=[(m[1]+m[3])/s,s/4,(m[5]+m[7])/s,(m[2]-m[6])/s];}
        else {const s=2*Math.sqrt(1+m[8]-m[0]-m[4]);q=[(m[2]+m[6])/s,(m[5]+m[7])/s,s/4,(m[3]-m[1])/s];}
        const width=Math.max(...[pairs[i],pairs[i+1]].map(p=>Math.abs(p[1].reduce((s,v,k)=>s+(v-p[0][k])*x[k],0))))+.001;
        const turn=Math.max(...[axes[i-1]||y,axes[i+1]||y].map(v=>Math.acos(Math.max(-1,Math.min(1,v.reduce((s,n,k)=>s+n*y[k],0))))));
        const overlap=.002+width*Math.tan(turn/2)*1.7,length=Math.hypot(...centers[i+1].map((v,k)=>v-centers[i][k])),fa=face*Math.PI/2;
        const c=centers[i].map((v,k)=>(v+centers[i+1][k])/2);
        add(world(t,c[0]*Math.cos(fa)+c[2]*Math.sin(fa),c[1],-c[0]*Math.sin(fa)+c[2]*Math.cos(fa)),[width/2,(length+overlap)/2,thickness/2],mat,LAYERS.facade,t.id,floor,kind+' '+suffix,multiplyQuaternion(quaternionY(t.orientation+fa),q),`${idPrefix}${i}`,source);
      }
    };
    for(const side of [-1,1]) {
      const arc=(q,angle)=>{const start=slot/2+lip-.006,span=widthAt(q)/2-start,rounded=options.roundDepthAt?.(q)??.09-.025*q;return [side*(start+span*Math.sin(angle)),frontAt(q)-.014-rounded*(1-Math.cos(angle))];};
      sweep(q=>[[side*slot/2,frontAt(q)-.0125],[side*(slot/2+lip),frontAt(q)-.0125]],.025,MAT.aluminum,'washer slot lip');
      for(let k=0;k<arcAngles.length-1;k++) sweep(q=>[arc(q,arcAngles[k]),arc(q,arcAngles[k+1])],.018,MAT.aluminum,'face');
      sweep(q=>[arc(q,Math.PI/2),[side*(widthAt(q)/2-.012),rearAt(q)+.0125]],.012,MAT.aluminum,'edge');
    }
    sweep(q=>[[-FACADE_PROFILE.washerTrackWidth/2,frontAt(q)-.043],[FACADE_PROFILE.washerTrackWidth/2,frontAt(q)-.043]],.006,MAT.antenna,'recessed web');
    if(options.closed!==false) sweep(q=>[[-widthAt(q)/2+.012,rearAt(q)+.0125],[widthAt(q)/2-.012,rearAt(q)+.0125]],.025,MAT.aluminum,'rear enclosure');
  }
  function flatChannel(t,face,u,lo,hi,width,kind,id,profile) {
    channelSegment(t,face,[u,lo],[u,hi],width,0,kind,id,profile);
  }

  // Hollow built-up core boxes and three-plate wide-flange upper columns.
  function coreColumn(t,column,lo,hi,f) {
    const ratio=Math.max(0.18,1-f/150), large=column.corner||column.outer;
    const w=(large?0.34:0.48)*(0.68+ratio*0.32), d=(column.corner?1.32:large?1.02:0.78)*(0.52+ratio*0.48);
    const y=(lo+hi)/2,h=hi-lo,angle=column.outer?Math.PI/2:0;
    function plate(ox,oz,sx,sz,kind) {
      const c=Math.cos(angle),s=Math.sin(angle);
      box(t,column.x+ox*c+oz*s,y,column.z-ox*s+oz*c,sx,h,sz,MAT.core,LAYERS.core,f,kind,angle,`C${column.id}-${f}`,'nist-1-3');
    }
    if (f<column.transition) {
      const p=Math.min(0.085,0.035+ratio*0.035);
      plate(0,-d/2+p/2,w,p,'core box flange');plate(0,d/2-p/2,w,p,'core box flange');
      plate(-w/2+p/2,0,p,d-p*2,'core box web');plate(w/2-p/2,0,p,d-p*2,'core box web');
    } else {
      const fw=Math.max(w,0.37), fd=Math.max(0.42,d*0.82),p=0.026+ratio*0.025;
      plate(0,-fd/2+p/2,fw,p,'core I flange');plate(0,fd/2-p/2,fw,p,'core I flange');plate(0,0,p,fd-p*2,'core I web');
    }
  }

  function exterior(t) {
    const e=t.elevations,steelN=H,glassN=H+FACADE_PROFILE.glassPlane;
    const front=H+FACADE_PROFILE.columnFront,treeSplice=(418+11.5/12-310)*FT;
    const crownBottom=t.height+ROOF_CROWN.bottomAboveRoof,treeJoin=22.4536,structuralSplit=18.9992,curveStart=structuralSplit-1.15;
    const band107Top=e[107]+17*IN,band107Bottom=band107Top-85*IN;
    const window107Top=band107Top+139*IN,band108Bottom=window107Top,band108Top=band108Bottom+74*IN;
    const band109Top=e[110]+17*IN,band109Bottom=band109Top-86*IN;
    for(let face=0;face<4;face++) {
      // The head band is built with the crown's exact shared octagonal
      // vertices in roof-crown.js; an independent box strip leaves a ledge.
      faceBox(t,face,0,(band108Top+crownBottom-.43)/2,H-.04,2*(H-CHAMFER)+.08,crownBottom-.43-band108Top+.035,.045,MAT.roofScreen,LAYERS.facade,108,'continuous mechanical weather backing',undefined,'user-roof-reference');
      const entryElevation=getExteriorEntryElevation(t.id,face),entryFloor=entryElevation===0?1:2;
      for(let j=-29;j<=29;j++) {
        const u=j*PITCH;
        for(let f=9;f<=110;f+=3) {
          const lo=f===9?treeSplice:e[f]+3*FT,hi=f+3>110?t.height:e[f+3]+3*FT;
          faceBox(t,face,u,(lo+hi)/2,steelN,14*IN,hi-lo,14*IN,MAT.exterior,LAYERS.steel,f,'perimeter box column',`P${face+1}-${j+30}-${f}`);
          faceBox(t,face,u,hi,steelN,.38,.035,.38,MAT.exterior,LAYERS.steel,f,'perimeter splice plate');
        }
        // The rounded vertical covers pass in front of the recessed bay
        // spandrels. Their washer lips and sloping returns make the section
        // readable from street level as well as in the distant elevation.
        flatChannel(t,face,u,treeJoin,band107Bottom,FACADE_PROFILE.columnWidth,'aluminum continuous column',`F${face}-rib${j}`);
        // Above the ordinary facade, the photographs show fine continuous
        // uprights and two pointed nodes. Dark metal wraps enclose the
        // unchanged structural box; a wide silver column does not run
        // through the pointed arch as it did in the earlier reconstruction.
        faceBox(t,face,u,(band107Bottom+crownBottom)/2,H+.190,.42,crownBottom-band107Bottom,.024,MAT.louver,LAYERS.facade,107,'upper dark column enclosure',undefined,'user-roof-reference');
        const mechanicalWidth=(j+29)%2?7*IN:17*IN;
        const transition=(lo,hi,from,to,floor,id)=>{
          const start=primitives.length;
          curvedChannel(t,face,q=>[u,lo+(hi-lo)*q],q=>from+(to-from)*(3*q*q-2*q*q*q),floor,'upper shaped column cover',`UC${face}-${j}-${id}-`,16);
          for(let i=start;i<primitives.length;i++) primitives[i].source='nist-1-5a';
        };
        transition(band107Bottom,band107Top,FACADE_PROFILE.columnWidth,12*IN,107,'107');
        channelSegment(t,face,[u,band107Top],[u,band108Bottom],12*IN,107,'upper 12-inch column cover',`U107${face}-${j}`);
        transition(band108Bottom,band108Top,12*IN,mechanicalWidth,108,'108');
        // The two ornamental rows bracket ONE tall 108/109 mechanical
        // opening (NCSTAR 1-5A Fig.4-8), not two stacked copies of it. The
        // incompletely reconstructed core-floor schedule cannot locate the
        // visible crown nodes: register their finish against the roof edge.
        channelSegment(t,face,[u,band108Top],[u,crownBottom-.43],mechanicalWidth,108,(j+29)%2?'upper 7-inch column cover':'upper 17-inch column cover',`U108${face}-${j}`);
        transition(crownBottom-.43,crownBottom,mechanicalWidth,12*IN,109,'109');
      }
      for(let j=-29;j<29;j++) {
        const u=(j+.5)*PITCH;
        faceBox(t,face,u,(e[7]+band107Bottom)/2,glassN,FACADE_PROFILE.clearWindowWidth,band107Bottom-e[7],FACADE_PROFILE.glassThickness,MAT.glass,LAYERS.facade,0,'inset window glazing',undefined,'nist-1-5a');
        for(const side of [-1,1]) faceBox(t,face,u+side*(FACADE_PROFILE.windowWidth-IN)/2,(e[7]+band107Bottom)/2,glassN+.008,IN,band107Bottom-e[7],.030,MAT.aluminum,LAYERS.facade,0,'window one-inch vertical frame',undefined,'nist-1-5a');
        faceBox(t,face,u,(band107Top+window107Top)/2,glassN,26*IN,139*IN,5/16*IN,MAT.glass,LAYERS.facade,107,'107 restaurant observation window',undefined,'nist-1-5a');
        // Alternating 17/7-in covers give a 28-in opening whose centre
        // alternates 2.5 inches, rather than retaining typical narrow glass.
        const upperU=u+((j+29)%2?-2.5:2.5)*IN;
        faceBox(t,face,upperU,(band108Top+crownBottom-.43)/2,glassN,26*IN,crownBottom-.43-band108Top,FACADE_PROFILE.glassThickness,MAT.glass,LAYERS.facade,108,'108-109 two-storey window',undefined,'nist-1-5a');
        // Photographs show dark mechanical screens behind these upper slots,
        // not an unobstructed view through the top-level steelwork. Keep the
        // 107 restaurant glazing clear and enclose only the mechanical crown.
        for(const [lo,hi,center,floor] of [[band108Top,crownBottom-.43,upperU,108]]){
          faceBox(t,face,center,(lo+hi)/2,H+.025,28*IN+.025,hi-lo+.025,.032,MAT.roofScreen,LAYERS.facade,floor,'upper recessed mechanical screen',undefined,'user-roof-reference');
          for(let y=lo+.10;y<hi-.04;y+=.16)faceBox(t,face,center,y,H+.065,28*IN,.014,.055,MAT.roofScreen,LAYERS.facade,floor,'upper mechanical horizontal louver',undefined,'user-roof-reference');
        }
        for(const [lo,hi,floor,center] of [[band107Top,window107Top,107,u],[band108Top,crownBottom-.43,108,upperU]]) for(const side of [-1,1]) faceBox(t,face,center+side*13.5*IN,(lo+hi)/2,glassN+.008,IN,hi-lo,.030,MAT.aluminum,LAYERS.facade,floor,'upper one-inch window frame',undefined,'nist-1-5a');
        // The photographed forks originate at the WIDE column, every other
        // pitch, and join the adjacent narrow upright. Repeating an arch in
        // every window gave twice the real rhythm and a detached A silhouette.
        if((j+29)%2===1) for(const [bottom,top,floor] of [[band108Bottom,band108Top,109],[band108Top,crownBottom,110]]) for(const side of [-1,1]) {
          // The accepted upper row rises to the adjacent upright. The lower
          // row instead leaves the upper upright and fans DOWN to its neighbour;
          // it is not another copy of the upward crown node.
          const parent=(j+side)*PITCH,count=48,tip=top-.43,h=floor===110?2.60:2.05;
          const root=17*IN/2-.025,end=PITCH-12*IN/2+.014;
          const dy=floor===110?h:-h,startY=floor===110?tip-h:top+.10;
          const curve=q=>[parent-side*(root+(end-root)*(3*q*q-2*q*q*q)),startY+dy*q];
          const section=q=>{
            const [x,y]=curve(q),dx=-side*(end-root)*6*q*(1-q),length=Math.hypot(dx,dy),nx=dy/length,ny=-dx/length,w=.055;
            return [[x-nx*w/2,y-ny*w/2,front+.002],[x+nx*w/2,y+ny*w/2,front+.002]];
          };
          const rotate=([x,y,n])=>{const a=face*Math.PI/2;return[x*Math.cos(a)+n*Math.sin(a),y,-x*Math.sin(a)+n*Math.cos(a)];};
          for(let k=0;k<count;k++){
            const a=section(k/count),b=section((k+1)/count),nose=[a[0],a[1],b[1],b[0]],points=[...nose,...nose.map(p=>[p[0],p[1],p[2]-.11])].map(rotate);
            const g=roofConvexPanel(points),member=box(t,g.center[0],g.center[1],g.center[2],...g.half.map(v=>v*2),MAT.aluminum,LAYERS.facade,floor,'upper pointed window arch',0,`UP${face}-${j}-${floor}-${side}-${k}`,'user-roof-reference');
            member.shape=g.shape;
          }
        }
      }
      for(let f=7;f<=110;f++) {
        // The exterior has no intermediate spandrel at the core-only 109
        // mezzanine. Its upper cover ends at the 110 facade boundary.
        if(f===109) continue;
        const upperBand=f===107?[band107Bottom,band107Top]:f===108?[band108Bottom,band108Top]:f===110?[band109Bottom,band109Top]:null;
        const depth=f===7?7.5*FT:upperBand?upperBand[1]-upperBand[0]-3*IN:52*IN,y=f===7?treeJoin+depth/2:upperBand?(upperBand[0]+upperBand[1])/2:e[f]-12.5*IN;
        faceBox(t,face,0,y,H-.145,2*(H-CHAMFER),depth,.048,MAT.exterior,LAYERS.steel,f,'steel spandrel');
        if(f===108)faceBox(t,face,0,y,H+.060,2*(H-CHAMFER),upperBand[1]-upperBand[0],.036,MAT.spandrel,LAYERS.facade,f,'lower crown continuous recessed finish band',undefined,'user-roof-reference');
        // NCSTAR 1-5A p.33 places each aluminum spandrel cover BETWEEN
        // column covers. Leaving these narrow recessed bay panels separate
        // lets the profiled column returns cast their continuous shadows.
        for(let j=-29;j<29;j++) {
          const u=(j+.5)*PITCH,coverHeight=depth+3*IN;
          const crownScreen=f===108||f===110;
          faceBox(t,face,u,y,crownScreen?H-.28:H+FACADE_PROFILE.spandrelFront-.018,FACADE_PROFILE.windowWidth-.006,coverHeight,.036,crownScreen?MAT.roofScreen:MAT.spandrel,LAYERS.facade,f,crownScreen?'upper dark recessed spandrel enclosure':'recessed aluminum spandrel',`SP${face}-${j}-${f}`,crownScreen?'user-roof-reference':'nist-1-5a');
          if((upperBand||f===7)&&!crownScreen) for(const side of [-1,1]) faceBox(t,face,u,y+side*(coverHeight/2-.008),H+FACADE_PROFILE.spandrelFront-.057,FACADE_PROFILE.windowWidth-.006,.016,.078,MAT.aluminum,LAYERS.facade,f,'spandrel folded edge return',undefined,'nist-1-5a');
        }
        if(MECHANICAL.has(f)&&f<108) {
          const h=e[f+1]-e[f];
          faceBox(t,face,0,e[f]+h/2,H-.11,2*(H-CHAMFER),h,.052,MAT.louver,LAYERS.facade,f,'mechanical screen backing');
          for(let yy=e[f]+.28;yy<e[f+1]-.16;yy+=.36) faceBox(t,face,0,yy,H-.035,2*(H-CHAMFER),.045,.16,MAT.aluminum,LAYERS.facade,f,'recessed mechanical louver');
        }
      }
      for(let j=-27;j<=27;j+=3) {
        const u=j*PITCH;
        faceBox(t,face,u,(-20.7264+structuralSplit)/2,steelN,.56,structuralSplit+20.7264,.80,MAT.exterior,LAYERS.steel,0,'base tree trunk');
        // Engineering transfer plates retain the NIST F/E datum and slots.
        // They sit behind an architectural curved wrap, rather than being
        // drawn as three exposed chicken-foot rods on the facade plane.
        const steelSteps=40,dy=(treeJoin-structuralSplit)/steelSteps;
        for(let k=0;k<steelSteps;k++) {
          const q=(k+.5)/steelSteps,y=structuralSplit+(k+.5)*dy;
          if(y<structuralSplit+6*FT) faceBox(t,face,u,y,steelN,.56+2*PITCH*q,dy+.003,.21,MAT.exterior,LAYERS.steel,7,'tree tapered transfer web');
          else for(const branch of [-1,0,1]) faceBox(t,face,u+branch*PITCH*q,y,steelN,.50-(q-.5)*.224,dy+.003,.21,MAT.exterior,LAYERS.steel,7,'tree slotted transfer prong');
        }
        const rAt=q=>Math.max(0,Math.min(1,(curveStart+(treeJoin-curveStart)*q-structuralSplit)/(treeJoin-structuralSplit)));
        const smooth=r=>3*r*r-2*r*r*r,slotR=6*FT/(treeJoin-structuralSplit);
        const position=(q,branch)=>branch*(.17+(PITCH-.17)*smooth(rAt(q)));
        // The architectural flutes have their own curved silhouette. The
        // wider linear steel fan is wrapped on a deeper plane below them;
        // it does not force each silver flute into a swollen white Y.
        const widthAt=q=>.26+(FACADE_PROFILE.columnWidth-.26)*smooth(rAt(q));
        const frontAt=q=>.47+(FACADE_PROFILE.columnFront-.47)*smooth(rAt(q));
        const rearAt=q=>-.44+(FACADE_PROFILE.columnFront-FACADE_PROFILE.coverDepth+.44)*smooth(rAt(q));
        for(const branch of [-1,0,1]) {
          flatChannel(t,face,u+branch*.17,0,curveStart,.26,'lobby fluted aluminum pier',`TP${face}-${j}-${branch}`,{front:.47,rear:-.44,closed:true,roundDepth:.095});
          const count=80,curve=q=>[u+position(q,branch),curveStart+(treeJoin-curveStart)*q];
          treeChannel(t,face,curve,widthAt,frontAt,rearAt,curveStart,treeJoin,`TC${face}-${j}-${branch}-`,count,{roundDepthAt:q=>.095-.030*smooth(rAt(q))});
          // The upper prongs meet the first assembly splice. No arbitrary
          // exterior X bracing or duplicated cladding is added here.
          faceBox(t,face,u+branch*PITCH,(treeJoin+treeSplice)/2,steelN,.37,treeSplice-treeJoin,.37,MAT.exterior,LAYERS.steel,7,'tree upper column');
        }
        // Preserve the real solid transfer fan, with its front wrap set
        // behind the three rounded nose covers. Upper engineering prongs
        // receive their own deeper wrap where their linear plan differs
        // from the photographic architectural curve.
        const slotQ=(structuralSplit+6*FT-curveStart)/(treeJoin-curveStart);
        const fanFront=q=>.415-.270*smooth(Math.min(1,rAt(q)/.34));
        const closureCount=40;
        for(let k=0;k<closureCount;k++) {
          const a=k/closureCount,b=Math.min((k+1)/closureCount,slotQ);if(a>=b) continue;
          const fanWidth=q=>.56+2*PITCH*rAt(q)+.036;
          for(const back of [false,true]) {
            const nAt=back?q=>rearAt(q)+.020:fanFront;
            faceRuledCover(t,face,[u,curveStart+(treeJoin-curveStart)*a,H+nAt(a)],[u,curveStart+(treeJoin-curveStart)*b,H+nAt(b)],fanWidth(a),fanWidth(b),MAT.aluminum,7,back?'curved tree fan rear closure':'curved tree fan front closure',`TF${face}-${j}-${k}`,.010);
          }
          for(const side of [-1,1]) faceRuledSide(t,face,[u+side*fanWidth(a)/2,curveStart+(treeJoin-curveStart)*a],[u+side*fanWidth(b)/2,curveStart+(treeJoin-curveStart)*b],H+fanFront(a),H+fanFront(b),H+rearAt(a)+.020,H+rearAt(b)+.020,MAT.aluminum,7,'curved tree fan side closure',`TFS${face}-${j}-${side}-${k}`);
        }
        for(const branch of [-1,0,1]) for(let k=0;k<closureCount;k++) {
          const a=Math.max(k/closureCount,slotQ),b=(k+1)/closureCount;if(a>=b) continue;
          const center=q=>u+branch*PITCH*rAt(q),width=q=>.50-(rAt(q)-.5)*.224+.036,nose=q=>.145+.060*smooth((rAt(q)-slotR)/(1-slotR));
          // Bury the first diagonal wrap's broad cap below the solid fan.
          // A small uniform overlap cannot close this Y-to-fan miter.
          const capOverlap=.012+(Math.abs(a-slotQ)<1e-8?Math.abs(branch)*width(a)*PITCH/(treeJoin-structuralSplit)+.020:0);
          for(const back of [false,true]) {
            const nAt=back?q=>rearAt(q)+.020:nose;
            faceRuledCover(t,face,[center(a),curveStart+(treeJoin-curveStart)*a,H+nAt(a)],[center(b),curveStart+(treeJoin-curveStart)*b,H+nAt(b)],width(a),width(b),MAT.aluminum,7,back?'tree transfer prong rear closure':'tree transfer prong inset front closure',`TR${face}-${j}-${branch}-${k}`,capOverlap);
          }
          for(const side of [-1,1]) faceRuledSide(t,face,[center(a)+side*width(a)/2,curveStart+(treeJoin-curveStart)*a],[center(b)+side*width(b)/2,curveStart+(treeJoin-curveStart)*b],H+nose(a),H+nose(b),H+rearAt(a)+.020,H+rearAt(b)+.020,MAT.aluminum,7,'tree transfer prong side closure',`TRS${face}-${j}-${branch}-${side}-${k}`);
        }
        if(j<27) {
          const bay=u+1.5*PITCH,span=3*PITCH-.72,door=ENTRANCE_BAYS.some(v=>Math.abs(v-bay)<1e-6),doorWidth=2.05,doorTop=entryElevation+2.65;
          if(door) {
            faceBox(t,face,bay,entryElevation/2,glassN,span,entryElevation,.015,MAT.glass,LAYERS.facade,0,'lobby portal glass below door');
            faceBox(t,face,bay,(doorTop+treeJoin)/2,glassN,span,treeJoin-doorTop,.015,MAT.glass,LAYERS.facade,0,'lobby portal glass above door');
            for(const side of [-1,1]) faceBox(t,face,bay+side*(doorWidth/2+(span-doorWidth)/4),entryElevation+1.325,glassN,(span-doorWidth)/2,2.65,.015,MAT.glass,LAYERS.facade,0,'lobby portal glass door sidelight');
          } else faceBox(t,face,bay,treeJoin/2,glassN,span,treeJoin,.015,MAT.glass,LAYERS.facade,0,'lobby portal glass');
          // The two exterior finishes use shared photographic proportions;
          // neither changes the actual plaza slab thickness or floor datum.
          const bandSpan=3*PITCH-.60,bandFront=H+.215,bandBack=glassN+.025;
          for(const y of [LOBBY_BAND_PROFILE.ornamentalCentre]) {
            // The supplied street photograph shows an hourglass silhouette:
            // both edges bend inward, rather than a constant-width ribbon
            // following one downward curve. Heights/thickness are estimates.
            const count=24,pinch=(LOBBY_BAND_PROFILE.ornamentalEdgeHeight-LOBBY_BAND_PROFILE.ornamentalWaistHeight)/2,inward=q=>pinch*(1-(1-4*q*(1-q))**1.25),top=q=>y+LOBBY_BAND_PROFILE.ornamentalEdgeHeight/2-inward(q),bottom=q=>y-LOBBY_BAND_PROFILE.ornamentalEdgeHeight/2+inward(q);
            const panel=(outline,front,back,kind,id)=>{
              const minX=Math.min(...outline.map(p=>p[0])),maxX=Math.max(...outline.map(p=>p[0])),minY=Math.min(...outline.map(p=>p[1])),maxY=Math.max(...outline.map(p=>p[1])),cx=bay,cy=(minY+maxY)/2;
              // Every facet uses the same horizontal origin. Adjacent clip
              // planes then share an identical Float32 coordinate instead of
              // opening a tiny crack when independently centred skins pack.
              // The conservative box remains confined to this single bay;
              // the six planes retain each facet's exact visible silhouette.
              const member=faceBox(t,face,cx,cy,(front+back)/2,2*Math.max(Math.abs(minX-cx),Math.abs(maxX-cx)),maxY-minY,front-back,MAT.aluminum,LAYERS.facade,2,kind,id,'user-lobby-reference');
              const area=outline.reduce((sum,p,i)=>{const next=outline[(i+1)%outline.length];return sum+p[0]*next[1]-next[0]*p[1];},0),direction=area>0?1:-1;
              const planes=outline.map((p,i)=>{const next=outline[(i+1)%outline.length],dx=next[0]-p[0],dy=next[1]-p[1],length=Math.hypot(dx,dy),nx=direction*dy/length,ny=-direction*dx/length;return [nx,ny,0,nx*(p[0]-cx)+ny*(p[1]-cy)];});
              member.shape={type:'convex',planes:[...planes,[0,0,1,(front-back)/2],[0,0,-1,(front-back)/2]]};
              return member;
            };
            const frontInner=bandFront-.034,rearInner=bandBack+.022;
            for(let k=0;k<count;k++) {
              const a=k/count,b=(k+1)/count,x1=bay-bandSpan/2+bandSpan*a,x2=bay-bandSpan/2+bandSpan*b;
              const upperA=top(a),upperB=top(b),lowerA=bottom(a),lowerB=bottom(b),outline=[[x1,lowerA],[x2,lowerB],[x2,upperB],[x1,upperA]];
              panel(outline,bandFront,frontInner,'scalloped lobby band face',`LB${face}-${j}-${y}-${k}`);
              panel([[x1,upperA],[x2,upperB],[x2,upperB-.026],[x1,upperA-.026]],frontInner,rearInner,'scalloped lobby band upper return');
              panel([[x1,lowerA],[x2,lowerB],[x2,lowerB+.026],[x1,lowerA+.026]],frontInner,rearInner,'scalloped lobby band lower return');
              panel(outline,rearInner,bandBack,'scalloped lobby band rear closure');
            }
            // End closures occupy only the space between the four skins.
            // Their bevel follows the same first/last facet, so they neither
            // overlap the returns nor extend into the clear glazing.
            const endFraction=.020/bandSpan,faceted=(edge,q)=>{const k=Math.min(count-1,Math.floor(q*count)),blend=q*count-k;return edge(k/count)*(1-blend)+edge((k+1)/count)*blend;};
            for(const [a,b] of [[0,endFraction],[1-endFraction,1]]){
              const x1=bay-bandSpan/2+bandSpan*a,x2=bay-bandSpan/2+bandSpan*b;
              panel([[x1,faceted(bottom,a)+.026],[x2,faceted(bottom,b)+.026],[x2,faceted(top,b)-.026],[x1,faceted(top,a)-.026]],frontInner,rearInner,'scalloped lobby band end return');
            }
          }
          // The broad straight white band is the exterior floor-edge finish.
          // Its photographic height is independent of the thin structural
          // slab; the finish top continues to share the true plaza datum.
          const floorSpan=3*PITCH-.60;
          faceBox(t,face,bay,PLAZA_ELEVATION-LOBBY_BAND_PROFILE.straightFasciaHeight/2,H+.18,floorSpan,LOBBY_BAND_PROFILE.straightFasciaHeight,LOBBY_BAND_PROFILE.straightFasciaThickness,MAT.aluminum,LAYERS.facade,2,'plaza floor straight exterior fascia',undefined,'user-lobby-reference');
          faceBox(t,face,bay,LOBBY_BAND_PROFILE.upperStripElevation,glassN+.020,floorSpan,LOBBY_BAND_PROFILE.upperStripHeight,.065,MAT.aluminum,LAYERS.facade,3,'lobby upper thin glazing strip',undefined,'user-lobby-reference');
        }
      }
      for(const j of [-29,29]) {
        faceBox(t,face,j*PITCH,treeSplice/2,steelN,.48,treeSplice,.58,MAT.exterior,LAYERS.steel,0,'edge base column');
        flatChannel(t,face,j*PITCH,0,treeJoin,.508,'edge lobby channel',`EC${face}-${j}`);
        // Each face ends in a half-bay between the last three-flute tree
        // and the straight column at the chamfer. The ordinary 3-pitch
        // loop stops at +/-27 and therefore cannot glaze these openings.
        // Glazing lies behind the profiled tree: its upper curved branches
        // occlude the pane naturally, without another foreground jamb.
        const side=Math.sign(j),inner=27*PITCH+.17+.26/2-.010,outer=29*PITCH-.508/2+.012;
        const span=outer-inner,bay=side*(inner+outer)/2;
        faceBox(t,face,bay,treeJoin/2,glassN,span,treeJoin,.015,MAT.glass,LAYERS.facade,0,'terminal lobby half-bay glazing',`TG${face}-${side}`,'user-lobby-reference');
        faceBox(t,face,side*(outer-.012),treeJoin/2,glassN+.018,.024,treeJoin,.038,MAT.aluminum,LAYERS.facade,0,'terminal lobby glazing edge frame',`TGF${face}-${side}`,'user-lobby-reference');
        // This representative terminal transom follows the estimated upper
        // ornament centre; it is not an independently documented crossbar.
        for(const y of [0,PLAZA_ELEVATION,LOBBY_BAND_PROFILE.ornamentalCentre,treeJoin])
          faceBox(t,face,bay,y,glassN+.015,span,.045,.038,MAT.aluminum,LAYERS.facade,0,'terminal lobby glazing transom',undefined,'user-lobby-reference');
        faceBox(t,face,bay,PLAZA_ELEVATION-LOBBY_BAND_PROFILE.straightFasciaHeight/2,H+.18,span,LOBBY_BAND_PROFILE.straightFasciaHeight,LOBBY_BAND_PROFILE.straightFasciaThickness,MAT.aluminum,LAYERS.facade,2,'terminal plaza floor exterior fascia',undefined,'user-lobby-reference');
        faceBox(t,face,bay,LOBBY_BAND_PROFILE.ornamentalCentre,H+.18,span,LOBBY_BAND_PROFILE.ornamentalEdgeHeight,.07,MAT.aluminum,LAYERS.facade,2,'terminal rectangular lobby ornament',undefined,'user-lobby-reference');
        faceBox(t,face,bay,LOBBY_BAND_PROFILE.upperStripElevation,glassN+.020,span,LOBBY_BAND_PROFILE.upperStripHeight,.065,MAT.aluminum,LAYERS.facade,3,'lobby upper thin glazing strip',undefined,'user-lobby-reference');
      }
      for(const u of ENTRANCE_BAYS) {
        for(const side of [-1,1]) {
          faceBox(t,face,u+side*.515,entryElevation+1.325,glassN+.025,.995,2.65,.018,MAT.glass,LAYERS.facade,entryFloor,entryFloor===2?'plaza entrance door':'concourse street entrance door',`D${face}-${u}-${side}`);
          faceBox(t,face,u+side*1.065,entryElevation+1.36,glassN+.052,.045,2.72,.075,MAT.aluminum,LAYERS.facade,entryFloor,'entrance portal frame');
        }
        faceBox(t,face,u,entryElevation+1.325,glassN+.052,.035,2.65,.075,MAT.aluminum,LAYERS.facade,entryFloor,'entrance door meeting stile');
        faceBox(t,face,u,entryElevation+2.69,glassN+.052,2.16,.08,.075,MAT.aluminum,LAYERS.facade,entryFloor,'entrance portal frame');
        faceBox(t,face,u,entryElevation-.12,H-.68,2.80,.24,2.40,MAT.marble,LAYERS.floors,entryFloor,'entrance continuous landing',`EL${face}-${u}`);
        faceBox(t,face,u,entryElevation-.015,glassN+.04,2.18,.03,.28,MAT.antenna,LAYERS.floors,entryFloor,'entrance flush threshold');
      }
      const levels=[0,-4.8768,-7.9248,-10.9728,-14.0208,-17.3736,-20.7264];
      for(let b=1;b<levels.length;b++) {
        const hi=levels[b-1],lo=levels[b];
        faceBox(t,face,0,lo-.18,H-.09,2*(H-CHAMFER),.72,.30,MAT.exterior,LAYERS.steel,-b,'basement perimeter girder');
        for(let j=-27;j<27;j+=9) {
          faceRod(t,face,[j*PITCH,lo,H],[(j+9)*PITCH,hi,H],.28,.27,MAT.exterior,LAYERS.steel,-b,'basement X brace');
          faceRod(t,face,[(j+9)*PITCH,lo,H],[j*PITCH,hi,H],.28,.27,MAT.exterior,LAYERS.steel,-b,'basement X brace');
        }
      }
    }
    for(const sx of [-1,1]) for(const sz of [-1,1]) {
      const x=sx*(H-CHAMFER/2),z=sz*(H-CHAMFER/2),angle=Math.atan2(sx,sz);
      for(let f=9;f<=110;f+=3) {
        const lo=f===9?treeSplice:e[f]+3*FT,hi=f+3>110?t.height:e[f+3]+3*FT;
        box(t,x,(lo+hi)/2,z,.39,hi-lo,.44,MAT.exterior,LAYERS.steel,f,'diagonal corner column',angle);
      }
      const offset=FACADE_PROFILE.columnFront-.025;
      const width=Math.sqrt(2)*CHAMFER+(2*Math.sqrt(2)-2)*offset+.065;
      // Three wide corner panels have narrow real recessed seams. Their
      // three-storey joints break the broad chamfer without extending a
      // horizontal aluminum stripe through the neighboring window bays.
      const seams=[0,treeJoin,...Array.from({length:34},(_,i)=>e[9+i*3]+3*FT).filter(y=>y>treeJoin&&y<crownBottom),crownBottom];
      for(let k=0;k<seams.length-1;k++) for(let panel=0;panel<3;panel++) {
        const u=(panel-1)*width/3,lo=seams[k]+(k?.002:0),hi=seams[k+1]-.002;
        box(t,x+sx*offset/Math.SQRT2+u*Math.cos(angle),(lo+hi)/2,z+sz*offset/Math.SQRT2-u*Math.sin(angle),width/3-.003,hi-lo,.055,MAT.aluminum,LAYERS.facade,0,'opaque continuous chamfer cladding',angle,undefined,'loc-plaza-1976');
      }
      for(const side of [-1,1]) {
        const u=side*(width/2-.020),normal=offset-.032;
        box(t,x+sx*normal/Math.SQRT2+u*Math.cos(angle),crownBottom/2,z+sz*normal/Math.SQRT2-u*Math.sin(angle),.062,crownBottom,.038,MAT.aluminum,LAYERS.facade,0,'chamfer folded corner finish',angle+side*Math.PI/8,undefined,'loc-plaza-1976');
      }
      box(t,x+sx*(offset-.12)/Math.SQRT2,crownBottom/2,z+sz*(offset-.12)/Math.SQRT2,width-.08,crownBottom,.11,MAT.louver,LAYERS.facade,0,'corner opaque backing',angle);
      box(t,x,treeSplice/2,z,.62,treeSplice,.60,MAT.exterior,LAYERS.steel,0,'corner base column',angle);
      // The flat-face channels overlap the mathematically offset chamfer
      // endpoints. No independent foreground chamfer-spandrel stripes remain.
    }
  }

  function rectangle(t,x1,x2,z1,z2,y,thickness,material,layer,f,kind) {
    if (x2-x1>0.005&&z2-z1>0.005) box(t,(x1+x2)/2,y-thickness/2,(z1+z2)/2,x2-x1,thickness,z2-z1,material,layer,f,kind);
  }
  function openings(f) {
    return getFloorOpenings(f).map(h=>h.bounds);
  }
  function cutSlab(t,x1,x2,z1,z2,y,thickness,material,layer,f,kind) {
    const holes=(layer===LAYERS.floors||kind==='continuous suspended ceiling'?openings(f):[]).filter(h=>h[1]>x1&&h[0]<x2&&h[3]>z1&&h[2]<z2).map(h=>[Math.max(x1,h[0]),Math.min(x2,h[1]),Math.max(z1,h[2]),Math.min(z2,h[3])]);
    if(!holes.length) return rectangle(t,x1,x2,z1,z2,y,thickness,material,layer,f,kind);
    const xs=[x1,x2],zs=[z1,z2];
    holes.forEach(h=>{xs.push(h[0],h[1]);zs.push(h[2],h[3]);});
    xs.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);
    const xx=[...new Set(xs)],zz=[...new Set(zs)];
    for(let k=0;k<zz.length-1;k++) {
      const z=(zz[k]+zz[k+1])/2;
      let start=null;
      for(let i=0;i<xx.length-1;i++) {
        const x=(xx[i]+xx[i+1])/2,open=holes.some(h=>x>h[0]&&x<h[1]&&z>h[2]&&z<h[3]);
        if(!open && start===null) start=xx[i];
        if(start!==null && (open||i===xx.length-2)) {
          rectangle(t,start,open?xx[i]:xx[i+1],zz[k],zz[k+1],y,thickness,material,layer,f,kind);
          start=null;
        }
      }
    }
  }
  function coreSlab(t,f,y,thickness) {
    cutSlab(t,-CX,CX,-CZ,CZ,y,thickness,MAT.concrete,LAYERS.floors,f,'core slab with shaft openings');
  }
  function polygonSlab(t,outline,y,thickness,material,layer,f,kind) {
    const holes=layer===LAYERS.floors?openings(f).map(([a,b,c,d])=>[[a,c],[b,c],[b,d],[a,d]]):[];
    for(const piece of polygonPieces(outline,holes)) {
      const shape=convexPrism(piece,y,thickness),member=add(world(t,...shape.center),shape.half,material,layer,t.id,f,kind,quaternionY(t.orientation));
      // The planes are renderer-local (+Z south), ready for the one drawing
      // to renderer reflection of tower positions and rotations below.
      member.shape=shape.shape;
    }
  }
  function ringSlab(t,f,y,thickness) {
    const R=H+(f===111?ROOF_CROWN.membraneOffset:f<0?0:FACADE_PROFILE.floorEdge);
    const C=CHAMFER+(2-Math.SQRT2)*(R-H); // parallel offset of the octagonal footprint
    const slabMaterial=f===111?MAT.roof:f===1||f===2?MAT.marble:MAT.concrete,slabLayer=f===111?LAYERS.roof:LAYERS.floors;
    const slab=(x1,x2,z1,z2,kind='perimeter floor slab')=>cutSlab(t,x1,x2,z1,z2,y,thickness,slabMaterial,slabLayer,f===111?110:f,kind);
    // Six-storey lobby: service plates remain inside the core, while the
    // surrounding volume has an actual atrium instead of five solid rings.
    if(f>=3&&f<=6) return;
    if(f===2) {
      slab(-CX,CX,CZ,CZ+3.4,'lobby mezzanine gallery');
      slab(-CX,CX,-CZ-3.4,-CZ,'lobby mezzanine gallery');
      slab(-CX-3.4,-CX,-CZ,CZ,'lobby mezzanine gallery');
      slab(CX,CX+3.4,-CZ,CZ,'lobby mezzanine gallery');
      for(const sx of [-1,1])for(const sz of [-1,1])for(let i=0;i<64;i++) {
        const a=i*Math.PI/128,b=(i+1)*Math.PI/128;
        polygonSlab(t,[[sx*CX,sz*CZ],[sx*(CX+3.4*Math.cos(a)),sz*(CZ+3.4*Math.sin(a))],[sx*(CX+3.4*Math.cos(b)),sz*(CZ+3.4*Math.sin(b))]],y,thickness,slabMaterial,slabLayer,2,'lobby mezzanine rounded corner');
      }
      // The photographed band is physically connected to this perimeter
      // gallery and the entrance bridges, including on the street faces.
      const outer=H+.215,corner=CHAMFER+(2-Math.SQRT2)*.215;
      slab(-outer+corner,outer-corner,H-3.2,outer,'plaza perimeter gallery floor');
      slab(-outer+corner,outer-corner,-outer,-H+3.2,'plaza perimeter gallery floor');
      slab(-outer,-H+3.2,-outer+corner,outer-corner,'plaza perimeter gallery floor');
      slab(H-3.2,outer,-outer+corner,outer-corner,'plaza perimeter gallery floor');
      for(const sz of [-1,1])for(const sx of [-1,1])polygonSlab(t,[[sx*(H-3.2),sz*(outer-corner)],[sx*outer,sz*(outer-corner)],[sx*(outer-corner),sz*outer],[sx*(H-3.2),sz*outer]],y,thickness,slabMaterial,slabLayer,2,'plaza perimeter gallery corner');
      for(const sign of [-1,1]) {
        slab(sign>0?CX+3.4:-R,sign>0?R:-CX-3.4,-9.3,9.3,'plaza entrance mezzanine bridge');
        slab(-9.3,9.3,sign>0?CZ+3.4:-R,sign>0?R:-CZ-3.4,'plaza entrance mezzanine bridge');
      }
      return;
    }
    if (MEZZANINES.has(f)) {
      // Real mechanical mezzanines have broad missing slab areas. These
      // perimeter/core-side catwalk extents are illustrative, not digitized.
      slab(-R+0.35,R-0.35,CZ,CZ+1.25,'mechanical mezzanine catwalk');
      slab(-R+0.35,R-0.35,-CZ-1.25,-CZ,'mechanical mezzanine catwalk');
      slab(-CX-1.25,-CX,-CZ,CZ,'mechanical mezzanine catwalk');
      slab(CX,CX+1.25,-CZ,CZ,'mechanical mezzanine catwalk');
      return;
    }
    slab(-R,R,CZ,R-C);slab(-R,R,-R+C,-CZ);slab(-R,-CX,-CZ,CZ);slab(CX,R,-CZ,CZ);
    for(const side of [-1,1])polygonSlab(t,[[-R,side*(R-C)],[R,side*(R-C)],[R-C,side*R],[-R+C,side*R]],y,thickness,slabMaterial,slabLayer,f===111?110:f,'chamfered slab edge');
  }

  function mainTruss(t,f,a,b,sideways,panels,heavy=false) {
    const y=t.elevations[f]-0.145, lower=y-TRUSS_DEPTH, d=[b[0]-a[0],b[1]-a[1]],len=Math.hypot(...d);
    const chord=heavy?0.074:0.055,web=heavy?0.038:0.030;
    mainTrussPairs++;
    for (const offset of [-0.082,0.082]) {
      const ax=a[0]+sideways[0]*offset,az=a[1]+sideways[1]*offset,bx=b[0]+sideways[0]*offset,bz=b[1]+sideways[1]*offset;
      rod(t,[ax,y,az],[bx,y,bz],chord,0.065,MAT.truss,LAYERS.trusses,f,'paired truss top chord');
      rod(t,[ax,lower,az],[bx,lower,bz],chord,0.061,MAT.truss,LAYERS.trusses,f,'paired truss bottom chord');
      for(let p=0;p<panels;p++) {
        const s=p/panels,e=(p+1)/panels;
        rod(t,[ax+d[0]*s,p%2?lower:y,az+d[1]*s],[ax+d[0]*e,p%2?y:lower,az+d[1]*e],web,web,MAT.truss,LAYERS.trusses,f,'truss diagonal web');
      }
    }
    for (const p of [a,b]) {
      box(t,p[0],y-0.08,p[1],0.30,0.15,0.29,MAT.exterior,LAYERS.trusses,f,'truss seat');
    }
    box(t,b[0]-d[0]/len*0.28,lower,b[1]-d[1]/len*0.28,0.27,0.08,0.18,MAT.core,LAYERS.trusses,f,'viscoelastic damper envelope');
  }
  function bridge(t,f,a,b,panels) {
    const y=t.elevations[f]-0.19,lower=y-TRUSS_DEPTH*0.85,d=[b[0]-a[0],b[1]-a[1]];
    rod(t,[a[0],y,a[1]],[b[0],y,b[1]],0.043,0.042,MAT.truss,LAYERS.trusses,f,'bridging top chord');
    rod(t,[a[0],lower,a[1]],[b[0],lower,b[1]],0.034,0.032,MAT.truss,LAYERS.trusses,f,'bridging bottom chord');
    for(let p=0;p<panels;p++) rod(t,[a[0]+d[0]*p/panels,p%2?lower:y,a[1]+d[1]*p/panels],[a[0]+d[0]*(p+1)/panels,p%2?y:lower,a[1]+d[1]*(p+1)/panels],0.023,0.023,MAT.truss,LAYERS.trusses,f,'bridging diagonal web');
    bridgingTrusses++;
  }
  function beam(t,f,a,b,depth=0.58,width=0.25,kind='composite floor beam',layer=LAYERS.trusses) {
    const y=t.elevations[f]-0.17-depth/2;
    // Three plates give a true open I section for principal beam floors.
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=Math.atan2(-dz,dx);
    const holes=layer===LAYERS.trusses?OUTER_STAIR_OPENINGS.get(f):null;
    const spans=holes?.length?routeSpans(a,b,holes):[[0,1]];
    for(const [lo,hi] of spans) {
      const s=(lo+hi)/2;
      if(length*(hi-lo)<0.02) continue;
      for(const dy of [-depth/2+0.014,depth/2-0.014]) box(t,a[0]+dx*s,y+dy,a[1]+dz*s,length*(hi-lo),0.028,width,MAT.core,layer,f,kind+' flange',angle);
      box(t,a[0]+dx*s,y,a[1]+dz*s,length*(hi-lo),depth-0.056,0.020,MAT.core,layer,f,kind+' web',angle);
    }
  }

  function coreBeam(t,f,a,b,kind) {
    // Subtract the union of actual model shaft voids from a beam route. A
    // structural member never casually passes across an elevator opening.
    const dx=b[0]-a[0],dz=b[1]-a[1];
    let spans=[[0,1]];
    for(const hole of openings(f)) {
      let enter=0,leave=1,intersects=true;
      for(const [origin,delta,lo,hi] of [[a[0],dx,hole[0],hole[1]],[a[1],dz,hole[2],hole[3]]]) {
        if(Math.abs(delta)<1e-9) { if(origin<=lo+1e-6||origin>=hi-1e-6) intersects=false; }
        else { const aa=(lo-origin)/delta,bb=(hi-origin)/delta;enter=Math.max(enter,Math.min(aa,bb));leave=Math.min(leave,Math.max(aa,bb)); }
      }
      if(!intersects||leave<=enter) continue;
      const next=[];
      for(const [lo,hi] of spans) {
        if(leave<=lo||enter>=hi) next.push([lo,hi]);
        else { if(enter>lo) next.push([lo,enter]); if(leave<hi) next.push([leave,hi]); }
      }
      spans=next;
    }
    const angle=Math.atan2(-dz,dx),length=Math.hypot(dx,dz);
    for(const [lo,hi] of spans) if((hi-lo)*length>0.04) {
      const s=(lo+hi)/2;
      box(t,a[0]+dx*s,t.elevations[f]-0.36,a[1]+dz*s,length*(hi-lo),0.40,0.18,MAT.core,LAYERS.core,f,kind,angle);
    }
  }

  function floorFraming(t,f) {
    const y=t.elevations[f],ordinary=!BEAM_FLOORS.has(f);
    const boundary=H-0.28;
    const outerStart=primitives.length;
    if(f===1 || f>=7) {
    // Long spans cover the two-way corner zones too, with their core-end
    // support carried by short-span collectors beside the core corners.
    for (let j=-28;j<=28;j+=2) {
      const x=j*PITCH;
      for(const sign of [-1,1]) {
        const a=[x,sign*CZ],b=[x,sign*boundary];
        if (ordinary) mainTruss(t,f,a,b,[1,0],12,Math.abs(x)>CX);
        else beam(t,f,a,b,27*IN,0.31);
      }
    }
    for(let j=-12;j<=12;j+=2) for(const sign of [-1,1]) {
      const z=j*PITCH,a=[sign*CX,z],b=[sign*boundary,z];
      if (ordinary && !SKY_LOBBIES.has(f) && f!==79) mainTruss(t,f,a,b,[0,1],8);
      else beam(t,f,a,b,16*IN,0.24,'short-span / escalator beam');
    }
    // Heavy collectors where corner main trusses meet the short-span zones.
    for (const sx of [-1,1]) for(const sz of [-1,1]) beam(t,f,[sx*CX,sz*CZ],[sx*boundary,sz*CZ],0.62,0.30,'two-way corner collector');
    if (ordinary) {
      for (const sign of [-1,1]) for(let band=1;band<=4;band++) {
        const z=sign*(CZ+(boundary-CZ)*band/5);
        bridge(t,f,[-boundary,z],[boundary,z],58);
      }
      for(const sign of [-1,1]) for(let band=1;band<=2;band++) {
        const x=sign*(CX+(boundary-CX)*band/3);
        bridge(t,f,[x,-CZ],[x,CZ],26);
      }
    } else {
      for(const sign of [-1,1]) for(let band=1;band<=4;band++) {
        const z=sign*(CZ+(boundary-CZ)*band/5);
        beam(t,f,[-boundary,z],[boundary,z],0.25,0.16,'mechanical deck support');
      }
    }
    }
    if(f===2) for(const sign of [-1,1]) {
      beam(t,f,[-CX-3.4,sign*(CZ+3.4)],[CX+3.4,sign*(CZ+3.4)],0.58,0.24,'lobby mezzanine gallery edge');
      beam(t,f,[sign*(CX+3.4),-CZ],[sign*(CX+3.4),CZ],0.58,0.24,'lobby mezzanine gallery edge');
    }
    if(primitives.length>outerStart) geometryGroups.push({tower:t.id,floor:f,start:outerStart,count:primitives.length-outerStart,type:f<7?'lobby':ordinary?(SKY_LOBBIES.has(f)||f===79?'sky transition':'typical paired truss'):'beam floor',localElevation:y,outerStairCuts:OUTER_STAIR_OPENINGS.get(f)||[]});
    // Core perimeter channels, row beams, and longitudinal beams form a
    // conventional orthogonal grid. Beam routes at the shafts remain open.
    for(const sign of [-1,1]) {
      beam(t,f,[-CX,sign*CZ],[CX,sign*CZ],0.53,0.23,'core perimeter channel',LAYERS.core);
      beam(t,f,[sign*CX,-CZ],[sign*CX,CZ],0.53,0.23,'core perimeter channel',LAYERS.core);
    }
    for(const row of CORE_ROWS) {
      const cols=CORE_COLUMNS.filter(c=>c.row===row.row);
      for(let i=0;i<cols.length-1;i++) {
        const a=cols[i],b=cols[i+1];
        // Merged box envelope for smaller conventional core beams.
        coreBeam(t,f,[a.x,a.z],[b.x,b.z],'core grid beam');
      }
    }
    for(let r=0;r<CORE_ROWS.length-1;r++) {
      const a=CORE_COLUMNS.filter(c=>c.row===CORE_ROWS[r].row),b=CORE_COLUMNS.filter(c=>c.row===CORE_ROWS[r+1].row);
      for(const c of a) {
        const dest=b.reduce((p,q)=>Math.abs(q.x-c.x)<Math.abs(p.x-c.x)?q:p,b[0]);
        coreBeam(t,f,[c.x,c.z],[dest.x,dest.z],'core longitudinal beam');
      }
    }
    for(const [x1,x2,z1,z2] of openings(f)) {
      for(const z of [z1,z2]) coreBeam(t,f,[x1,z],[x2,z],'shaft opening edge beam');
      for(const x of [x1,x2]) coreBeam(t,f,[x,z1],[x,z2],'shaft opening edge beam');
    }
  }

  function mechanicalBracing(t,f) {
    if (!MECHANICAL.has(f) && f!==3 && f!==4) return;
    const lo=t.elevations[f],hi=t.elevations[Math.min(111,f+1)];
    const size=MECHANICAL.has(f)?0.22:0.25;
    for (const rowNo of [5,6,9,10]) {
      const cols=CORE_COLUMNS.filter(c=>c.row===rowNo);
      for (let i=0;i<cols.length-1;i+=2) {
        const a=cols[i],b=cols[i+1];
        rod(t,[a.x,lo,a.z],[b.x,hi,b.z],size,size,MAT.core,LAYERS.core,f,'mechanical / lobby core brace');
        rod(t,[b.x,lo,b.z],[a.x,hi,a.z],size,size,MAT.core,LAYERS.core,f,'mechanical / lobby core brace');
      }
    }
    for(const x of [-CX,CX]) for(let z=-CZ;z<CZ-4;z+=8.8) {
      rod(t,[x,lo,z],[x,hi,Math.min(CZ,z+8.8)],size,size,MAT.core,LAYERS.core,f,'core side brace');
    }
  }

  function services(t) {
    const serviceStart=primitives.length;
    const finish=(x1,x2,z1,z2,y,thickness,mat,kind,f=1)=>{
      if(x2-x1<=.001||z2-z1<=.001)return;
      return box(t,(x1+x2)/2,y,(z1+z2)/2,x2-x1,thickness,z2-z1,mat,LAYERS.interior,f,kind,0,undefined,'user-lobby-reference');
    };
    // Photographs show a continuous lobby ceiling and pale stone on the
    // inside of the perimeter piers. Fixture receivers are part of this
    // surface, rather than isolated hanging sheets.
    const R=H+FACADE_PROFILE.floorEdge,C=CHAMFER,ceilingY=t.elevations[7]-1.05;
    for(const [x1,x2,z1,z2] of [[-R,R,CZ,R-C],[-R,R,-R+C,-CZ],[-R,-CX,-CZ,CZ],[CX,R,-CZ,CZ]])finish(x1,x2,z1,z2,ceilingY,.08,MAT.gypsum,'lobby continuous atrium ceiling',6);
    for(const sz of [-1,1])polygonSlab(t,[[-R,sz*(R-C)],[R,sz*(R-C)],[R-C,sz*R],[-R+C,sz*R]],ceilingY+.04,.08,MAT.gypsum,LAYERS.interior,6,'lobby continuous atrium ceiling');
    for(let face=0;face<4;face++)for(let j=-27;j<=27;j+=3){
      const u=j*PITCH,split=18.9992,top=22.4536;
      faceBox(t,face,u,split/2,H-.57,.62,split,.16,MAT.marble,LAYERS.interior,1,'lobby stone perimeter pier',undefined,'user-lobby-reference');
      for(let k=0;k<64;k++){
        const q=(k+.5)/64,y=split+(top-split)*q;
        if(y<split+6*FT)faceBox(t,face,u,y,H-.57,.62+2*PITCH*q,(top-split)/64+.003,.16,MAT.marble,LAYERS.interior,6,'lobby stone tree rear finish',undefined,'user-lobby-reference');
        else for(const branch of [-1,0,1])faceBox(t,face,u+branch*PITCH*q,y,H-.57,.49-(q-.5)*.224,(top-split)/64+.003,.16,MAT.marble,LAYERS.interior,6,'lobby stone tree rear finish',undefined,'user-lobby-reference');
      }
    }
    // Carpet panels leave the photographed pale stone circulation strips.
    // Palette/extent are representative photo reconstruction, not a tenant
    // schedule. The rooms and equipment remain independently removable.
    for(const level of [1]){
      const y=t.elevations[level]+.008,mat=t.id===1?MAT.greenCarpet:MAT.purpleCarpet;
      for(const sign of [-1,1]){
        for(let x=-24;x<24;x+=6)finish(x+.08,x+5.92,sign>0?CZ+4:-H+4,sign>0?H-4:-CZ-4,y,.014,mat,'lobby carpet panel',level);
        for(let z=-10;z<10;z+=5)finish(sign>0?CX+4:-H+4,sign>0?H-4:-CX-4,z+.08,z+4.92,y,.014,mat,'lobby carpet panel',level);
      }
    }
    const soffitY=PLAZA_ELEVATION-.84;
    for(const [x1,x2,z1,z2] of [[-CX,CX,CZ,CZ+3.4],[-CX,CX,-CZ-3.4,-CZ],[-CX-3.4,-CX,-CZ,CZ],[CX,CX+3.4,-CZ,CZ]])finish(x1,x2,z1,z2,soffitY,.08,MAT.marble,'lobby continuous gallery soffit');
    for(const sx of [-1,1])for(const sz of [-1,1]){
      for(let i=0;i<64;i++){
        const aa=i*Math.PI/128,bb=(i+1)*Math.PI/128,aP=[sx*(CX+3.4*Math.cos(aa)),sz*(CZ+3.4*Math.sin(aa))],bP=[sx*(CX+3.4*Math.cos(bb)),sz*(CZ+3.4*Math.sin(bb))];
        polygonSlab(t,[[sx*CX,sz*CZ],aP,bP],soffitY+.04,.08,MAT.marble,LAYERS.interior,2,'lobby rounded gallery soffit');
        const dx=bP[0]-aP[0],dz=bP[1]-aP[1],length=Math.hypot(dx,dz),angle=Math.atan2(-dz,dx),mx=(aP[0]+bP[0])/2,mz=(aP[1]+bP[1])/2;
        box(t,mx,PLAZA_ELEVATION-.44,mz,length+.007,.88,.12,MAT.marble,LAYERS.interior,2,'lobby curved gallery fascia',angle,undefined,'user-lobby-reference');
        box(t,mx,PLAZA_ELEVATION+.52,mz,length+.004,.98,.024,MAT.glass,LAYERS.interior,2,'lobby curved gallery glass guard',angle,undefined,'user-lobby-reference');
        rod(t,[aP[0],PLAZA_ELEVATION+1.05,aP[1]],[bP[0],PLAZA_ELEVATION+1.05,bP[1]],.045,.045,MAT.antenna,LAYERS.interior,2,'lobby curved gallery guard rail',undefined,'user-lobby-reference');
      }
    }
    for(const sign of [-1,1])for(const side of [-1,1]){
      const sideLength=CZ-9.3,sideZ=side*(CZ+9.3)/2;
      box(t,sign*(CX+3.4),PLAZA_ELEVATION-.44,sideZ,.12,.88,sideLength,MAT.marble,LAYERS.interior,2,'lobby gallery straight fascia',0,undefined,'user-lobby-reference');
      const northLength=CX-9.3,northX=side*(CX+9.3)/2;
      box(t,northX,PLAZA_ELEVATION-.44,sign*(CZ+3.4),northLength,.88,.12,MAT.marble,LAYERS.interior,2,'lobby gallery straight fascia',0,undefined,'user-lobby-reference');
    }
    const levels=[-6,-5,-4,-3,-2,-1,...Array.from({length:110},(_,i)=>i+1)];
    for(const f of levels) {
      const data=getTowerFloor(t.id,f),h=data.height;
      for(const stair of getStairLayout(f)) {
        const {x,z,width,id}=stair,shaftWidth=width*2+0.12;
        const turn=stair.rotation,c=Math.cos(turn),s=Math.sin(turn);
        const rotate=p=>[x+c*(p[0]-x)+s*(p[2]-z),p[1],z-s*(p[0]-x)+c*(p[2]-z)];
        const stairBox=(...args)=>{const p=rotate([args[1],args[2],args[3]]);args.splice(1,3,...p);args[11]=turn;args[13]=stair.source;return box(...args);};
        const stairRod=(...args)=>{args[1]=rotate(args[1]);args[2]=rotate(args[2]);args[10]=stair.source;return rod(...args);};
        const treadCount=Math.max(18,Math.min(26,Math.round(h/0.18/2)*2)),perFlight=treadCount/2;
        stairBox(t,x,data.elevation-0.065,z-1.75,shaftWidth,0.13,0.56,MAT.concrete,LAYERS.stairs,f,`stair ${id} floor landing`);
        if(f<stair.to) {
          for(let flight=0;flight<2;flight++) for(let n=0;n<perFlight;n++) {
            const sy=data.elevation+(flight*perFlight+n+1)/treadCount*h;
            const rz=(flight?-1:1)*(-1.49+(n+0.5)*2.98/perFlight);
            stairBox(t,x+(flight?1:-1)*(width/2+0.03),sy-0.05,z+rz,width,0.10,2.98/perFlight+0.012,MAT.concrete,LAYERS.stairs,f,`stair ${id} tread`);
          }
          stairBox(t,x,data.elevation+h/2-0.065,z+1.75,shaftWidth,0.13,0.56,MAT.concrete,LAYERS.stairs,f,`stair ${id} half landing`);
          for(const side of [-1,1]) stairRod(t,[x+side*(shaftWidth/2-0.08),data.elevation+0.9,z-1.49],[x+side*(shaftWidth/2-0.08),data.elevation+h/2+0.9,z+1.49],0.035,0.035,MAT.antenna,LAYERS.stairs,f,`stair ${id} handrail`);
        }
        // Every stair enclosure has all four wall faces. Terminal landings
        // retain a closed head enclosure instead of ending as an open tube.
        const wallHeight=f<stair.to?h:2.45;
        for(const side of [-1,1]) stairBox(t,x+side*(shaftWidth/2+.027),data.elevation+wallHeight/2,z,.054,wallHeight,4.06,MAT.gypsum,LAYERS.stairs,f,`stair ${id} gypsum enclosure`);
        stairBox(t,x,data.elevation+wallHeight/2,z+2.057,shaftWidth,wallHeight,.054,MAT.gypsum,LAYERS.stairs,f,`stair ${id} back enclosure`);
        if(id==='B'&&f===2) stairBox(t,x,data.elevation+wallHeight/2,z-2.057,shaftWidth,wallHeight,.054,MAT.gypsum,LAYERS.stairs,f,'stair B no mezzanine exit');
        else {
          for(const side of [-1,1]) stairBox(t,x+side*(.48+(shaftWidth-.96)/4),data.elevation+wallHeight/2,z-2.057,(shaftWidth-.96)/2,wallHeight,.054,MAT.gypsum,LAYERS.stairs,f,`stair ${id} front door wall`);
          stairBox(t,x,data.elevation+(wallHeight+2.08)/2,z-2.057,.96,wallHeight-2.08,.054,MAT.gypsum,LAYERS.stairs,f,`stair ${id} front door lintel`);
          stairBox(t,x,data.elevation+1.025,z-2.087,.92,2.05,.034,MAT.louver,LAYERS.stairs,f,`stair ${id} landing door`);
        }
        if(f===stair.to) stairBox(t,x,data.elevation+wallHeight+.027,z,shaftWidth+.108,.054,4.168,MAT.gypsum,LAYERS.stairs,f,`stair ${id} terminal enclosure ceiling`);
      }

      if(TRANSFER_FLOORS.has(f)) for(const dest of getStairLayout(f)) {
        if(dest.id==='B' && f!==76) continue;
        const prev=getStairLayout(f-1).find(s=>s.id===dest.id);
        if(!prev||Math.hypot(prev.x-dest.x,prev.z-dest.z)<0.01) continue;
        const minor=f===66||f===68||dest.id==='B';
        const oldDoor=[prev.x-Math.sin(prev.rotation)*2.057,prev.z-Math.cos(prev.rotation)*2.057],newDoor=[dest.x-Math.sin(dest.rotation)*2.057,dest.z-Math.cos(dest.rotation)*2.057];
        const routeZ=minor?oldDoor[1]:(f===42||f===48?-11.9:11.9);
        const path=minor?[oldDoor,[newDoor[0],oldDoor[1]],newDoor]:[oldDoor,[oldDoor[0],routeZ],[newDoor[0],routeZ],newDoor];
        box(t,prev.x-Math.sin(prev.rotation)*1.75,data.elevation-.065,prev.z-Math.cos(prev.rotation)*1.75,prev.width*2+.12,.13,.56,MAT.concrete,LAYERS.stairs,f,`stair ${dest.id} transfer incoming landing`,prev.rotation);
        const corridorWidth=dest.id==='B'?1.7:1.4;
        for(let i=0;i<path.length-1;i++) {
          const a=path[i],b=path[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
          if(len<0.01) continue;
          const angle=Math.atan2(-(b[1]-a[1]),b[0]-a[0]);
          const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
          // Transfer floors have a real corridor deck and side walls. Plan
          // route dimensions/right-angle turns are representative, not surveyed.
          box(t,mx,data.elevation-0.07,mz,len+0.2,0.14,corridorWidth,MAT.concrete,LAYERS.stairs,f,`stair ${dest.id} transfer corridor floor`,angle);
          const nx=(b[1]-a[1])/len,nz=-(b[0]-a[0])/len;
          for(const side of [-1,1]) box(t,mx+side*nx*corridorWidth/2,data.elevation+1.2,mz+side*nz*corridorWidth/2,len,2.4,0.054,MAT.gypsum,LAYERS.stairs,f,`stair ${dest.id} transfer corridor wall`,angle);
          box(t,mx,data.elevation+2.42,mz,len,0.06,corridorWidth,MAT.gypsum,LAYERS.stairs,f,`stair ${dest.id} transfer corridor ceiling`,angle);
          if(i===1 || minor) box(t,mx,data.elevation+1.02,mz,0.042,2.04,corridorWidth-0.06,MAT.louver,LAYERS.stairs,f,`stair ${dest.id} transfer smoke door`,angle);
        }
      }
    }
    for(const cell of SHAFT_CELLS) {
      const bank=cell.bank,source=bank.source,pitFloor=cell.pitFloor??bank.base,lo=getTowerFloor(t.id,pitFloor).elevation;
      const hi=bank.shaftTop===110?t.height:t.elevations[bank.shaftTop+1];
      const height=hi-lo,y=(lo+hi)/2;
      const cellBox=(x,y,z,sx,sy,sz,mat,f,kind)=>box(t,x,y,z,sx,sy,sz,mat,LAYERS.elevators,f,kind,0,cell.id,source);
      const edges=openingBoundary(cell.clearBounds),defaultNormal=cell.doorNormal;
      const sameNormal=(edge,normal)=>normal[edge.axis]===edge.normal;
      const landingEdge=normal=>edges.filter(e=>sameNormal(e,normal)).sort((a,b)=>(b.hi-b.lo)-(a.hi-a.lo))[0];
      const stops=new Set(cell.servedFloors||bank.servedFloors),secondary=new Set(bank.secondaryFloors||[]);
      const faces=cell.landingFaces?.length?cell.landingFaces:[{floors:[...stops],doorNormal:defaultNormal}];
      const possible=new Set([...faces.map(v=>landingEdge(v.doorNormal)),...(secondary.size?[landingEdge(defaultNormal)]:[])]);
      const wall=(edge,cy,h,f,kind,from=edge.lo,to=edge.hi,mat=MAT.gypsum,thick=.054,offset=thick/2)=>{
        const v=edge.v+edge.normal*offset,mid=(from+to)/2,len=to-from;if(len<=.00001||h<=.00001)return;
        cellBox(edge.axis===0?v:mid,cy,edge.axis===0?mid:v,edge.axis===0?thick:len,h,edge.axis===0?len:thick,mat,f,kind);
      };
      for(const edge of edges)if(!possible.has(edge))wall(edge,y,height,0,'elevator gypsum shaft wall');
      for(const f of levels.filter(f=>f>=pitFloor&&f<=bank.shaftTop)) {
        const info=getTowerFloor(t.id,f),el=info.elevation,h=info.height;
        const active=secondary.has(f)?[landingEdge(defaultNormal)]:stops.has(f)?faces.filter(v=>v.floors.includes(f)).map(v=>landingEdge(v.doorNormal)):[];
        for(const edge of possible) {
          if(!active.includes(edge)){wall(edge,el+h/2,h,f,'elevator non-stop front wall');continue;}
          const width=edge.hi-edge.lo,opening=Math.min(1.14,width-.16),doorHeight=Math.min(2.22,h-.1),mid=(edge.lo+edge.hi)/2,a=mid-opening/2,b=mid+opening/2;
          wall(edge,el+h/2,h,f,'elevator front door wall',edge.lo,a);wall(edge,el+h/2,h,f,'elevator front door wall',b,edge.hi);
          wall(edge,el+(h+doorHeight)/2,h-doorHeight,f,'elevator front door lintel',a,b);
          wall(edge,el+doorHeight/2-.02,doorHeight-.04,f,secondary.has(f)?'elevator secondary maintenance door':'elevator landing door',a+.02,b-.02,MAT.antenna,.05,.035);
          for(const u of [a-.04,b+.04])wall(edge,el+doorHeight/2,doorHeight+.06,f,'elevator door jamb',u-.0325,u+.0325,MAT.stone,.08,.070);
        }
      }
      for(const [x1,x2,z1,z2] of cell.clearBounds){
        cellBox((x1+x2)/2,hi-.027,(z1+z2)/2,x2-x1,.054,z2-z1,MAT.gypsum,bank.shaftTop,'elevator shaft top closure');
        cellBox((x1+x2)/2,lo-.15,(z1+z2)/2,x2-x1,.25,z2-z1,MAT.concrete,pitFloor,'elevator shaft pit closure');
      }
      const [x1,x2,z1,z2]=[...cell.clearBounds].sort((a,b)=>(b[1]-b[0])*(b[3]-b[2])-(a[1]-a[0])*(a[3]-a[2]))[0];
      for(const x of [x1+.14,x2-.14])cellBox(x,y,(z1+z2)/2,.06,height,.06,MAT.antenna,0,'elevator guide rail');
      const machineY=bank.machineFloor?t.elevations[bank.machineFloor]+.30:hi-.18;
      cellBox((x1+x2)/2,machineY,(z1+z2)/2,(x2-x1)*.65,.36,(z2-z1)*.65,MAT.louver,bank.machineFloor,'elevator overhead machine envelope');
    }
    for(const f of [7,41,75,108,...(t.id===2?[110]:[])]) {
      const y=t.elevations[f];
      for(const sign of [-1,1]) for(let x=-19;x<=19;x+=6.3) {
        box(t,x,y+1.05,sign*(CZ+6.2),3.5,2.1,2.8,MAT.louver,LAYERS.interior,f,'mechanical air handler');
        box(t,x,y+0.14,sign*(CZ+6.2),3.8,0.28,3.1,MAT.concrete,LAYERS.interior,f,'equipment pedestal');
      }
    }
    // Typical tenant ceilings conceal the floor trusses in architectural view.
    // The finish is a representative continuous ceiling, removable with
    // INTERIOR; no historical tenant finish schedule is implied.
    for(let f=9;f<=107;f++) {
      if(MECHANICAL.has(f)||MEZZANINES.has(f))continue;
      const y=t.elevations[f+1]-1.05,R=H+FACADE_PROFILE.floorEdge,C=CHAMFER;
      const ceiling=(x1,x2,z1,z2)=>cutSlab(t,x1,x2,z1,z2,y,.055,MAT.gypsum,LAYERS.interior,f,'continuous suspended ceiling');
      ceiling(-R,R,CZ,R-C);ceiling(-R,R,-R+C,-CZ);ceiling(-R,-CX,-CZ,CZ);ceiling(CX,R,-CZ,CZ);
      for(let k=0;k<8;k++) {const lo=R-C+k*C/8,hi=lo+C/8,x=R-(hi-(R-C));ceiling(-x,x,lo,hi);ceiling(-x,x,-hi,-lo);}
    }
    // Actual interior horizontal ceiling fixtures illuminate matte ceiling,
    // desk and partition surfaces. No luminous cards fill window openings.
    // Occupancy and tenant fit-out remain a deterministic artistic sample.
    for(let f=10;f<=106;f++) {
      if(MECHANICAL.has(f)||random01(f*7919+t.id*3001)<0.28) continue;
      const h=t.elevations[f+1]-t.elevations[f],ceilingY=t.elevations[f]+h-1.12;
      for(let face=0;face<4;face++) for(let block=0;block<15;block++) {
        const seed=t.id*9863+face*713+Math.floor(f/3)*301+block*43;
        if(random01(seed)>0.28) continue;
        const u=(-27.5+block*4)*PITCH;
        if(Math.abs(u)>H-CHAMFER-1.6) continue;
        for(const shift of [-0.85,0.85]) {
          faceBox(t,face,u+shift,ceilingY-0.031,H-5.6,1.18,0.034,0.59,random01(seed+1)<0.14?MAT.cool:MAT.warm,LAYERS.lights,f,'office ceiling luminaire');
          faceBox(t,face,u+shift,t.elevations[f]+0.74,H-4.7,1.4,0.055,0.75,MAT.desk,LAYERS.interior,f,'office desk receiver');
          for(const side of [-1,1]) faceBox(t,face,u+shift+side*0.58,t.elevations[f]+0.36,H-4.7,0.04,0.70,0.53,MAT.antenna,LAYERS.interior,f,'office desk leg');
        }
        if(random01(seed+2)<0.4) faceBox(t,face,u,t.elevations[f]+1.1,H-8,3.2,2.2,0.065,MAT.gypsum,LAYERS.interior,f,'office partial partition receiver');
      }
    }
    // The core side of the open lobby is faced in stone; its outer atrium
    // and mezzanine galleries remain physically open. Finish positions are
    // representative, not a tenant drawing transcription.
    for(const sign of [-1,1]) {
      box(t,sign*(CX+1.75),.6,-8.8,2.10,1.20,3.6,MAT.stone,LAYERS.interior,1,'lobby reception island');
      for(const z of [-10.0,10.0]) box(t,sign*(CX+0.09),3.35,z,0.15,6.7,5.8,MAT.stone,LAYERS.interior,1,'lobby core stone face');
      // Under-gallery lights illuminate the concourse at human scale.
      for(let z=-9;z<=9;z+=6) {
        box(t,sign*(CX+1.65),PLAZA_ELEVATION-.94,z,.58,.04,.58,MAT.lobbyWarm,LAYERS.lights,1,'lobby gallery ceiling luminaire');
      }
      for(let x=-15;x<=15;x+=7.5) {
        box(t,x,PLAZA_ELEVATION-.94,sign*(CZ+1.65),.58,.04,.58,MAT.lobbyWarm,LAYERS.lights,1,'lobby gallery ceiling luminaire');
      }
    }
    // NCSTAR 1-7 Figs. 2-4/2-5: ONE paired group on WTC 1's east
    // side, WTC 2's north side. These diagrams give side and destinations,
    // not a surveyed run, exact number of machines or millimetre positions.
    const escalatorSide=t.id===1?1:-1,runDirection=t.id===1?1:-1,run=11.6,steps=34;
    for(let lane=0;lane<2;lane++) {
      const x=escalatorSide*(CX+4.2+lane*1.55),topZ=runDirection*run;
      for(let n=0;n<steps;n++)box(t,x,(n+.5)/steps*PLAZA_ELEVATION-.05,runDirection*(n+.5)/steps*run,1.15,.10,run/steps+.005,MAT.antenna,LAYERS.interior,1,'lobby escalator step',0,undefined,'nist-1-7');
      rod(t,[x,-.35,0],[x,PLAZA_ELEVATION-.35,topZ],1.32,.60,MAT.antenna,LAYERS.interior,1,'lobby escalator enclosed machine truss',undefined,'nist-1-7');
      for(const side of [-1,1]) {
        rod(t,[x+side*.65,.52,0],[x+side*.65,PLAZA_ELEVATION+.52,topZ],.024,.76,MAT.glass,LAYERS.interior,1,'lobby escalator glazed balustrade',undefined,'nist-1-7');
        rod(t,[x+side*.67,.95,0],[x+side*.67,PLAZA_ELEVATION+.95,topZ],.065,.065,MAT.antenna,LAYERS.interior,1,'lobby escalator handrail',undefined,'nist-1-7');
      }
      box(t,x,-.05,-runDirection*.6,1.38,.10,1.2,MAT.antenna,LAYERS.interior,1,'lobby escalator lower comb landing',0,undefined,'nist-1-7');
      box(t,x,PLAZA_ELEVATION-.05,topZ+runDirection*.6,1.38,.10,1.2,MAT.antenna,LAYERS.interior,2,'lobby escalator upper comb landing',0,undefined,'nist-1-7');
    }
    const outer=CX+6.7;
    rectangle(t,escalatorSide>0?CX+2.9:-outer,escalatorSide>0?outer:-CX-2.9,runDirection>0?run-.6:-run-1.8,runDirection>0?run+1.8:-run+.6,PLAZA_ELEVATION,.22,MAT.marble,LAYERS.floors,2,'lobby escalator attached plaza landing');
    for(let face=0;face<4;face++) for(const u of [-21,-10.5,0,10.5,21]) {
      faceBox(t,face,u,ceilingY-.09,H-5.1,1.10,.06,1.10,MAT.lobbyWarm,LAYERS.lights,6,'lobby atrium ceiling luminaire');
      for(const side of [-1,1]){
        faceBox(t,face,u+side*.585,ceilingY-.065,H-5.1,.065,.09,1.23,MAT.stone,LAYERS.interior,6,'lobby ceiling fixture trim');
        faceBox(t,face,u,ceilingY-.065,H-5.1+side*.585,1.10,.09,.065,MAT.stone,LAYERS.interior,6,'lobby ceiling fixture trim');
      }
    }
    for(const f of [44,78,107]) for(let face=0;face<4;face++) for(const u of [-21,-14,-7,0,7,14,21]) {
      const top=t.elevations[f+1]-1.05;
      faceBox(t,face,u,top,H-6.0,1.2,0.04,0.59,MAT.warm,LAYERS.lights,f,f===107?'upper public floor ceiling luminaire':'sky lobby ceiling luminaire');
      faceBox(t,face,u,top+0.06,H-6.0,4.5,0.05,5.4,MAT.gypsum,LAYERS.interior,f,'public floor ceiling receiver');
      if(f===107) {
        if(t.id===1) faceBox(t,face,u,t.elevations[f]+0.73,H-5.7,1.1,0.07,1.1,MAT.desk,LAYERS.interior,f,'restaurant table receiver');
        else faceBox(t,face,u,t.elevations[f]+0.40,H-6.0,2.1,0.8,0.65,MAT.stone,LAYERS.interior,f,'indoor observation bench');
      }
    }
    if(t.id===1) {
      const ceilingY=t.height-1.55;
      for(const x of [-8,0,8]) for(const z of [-8,0,8]) {
        box(t,x,ceilingY,z,1.2,0.05,0.6,MAT.cool,LAYERS.lights,110,'TV studio ceiling luminaire');
        box(t,x,ceilingY+0.07,z,6.4,0.045,6.4,MAT.gypsum,LAYERS.interior,110,'TV studio ceiling receiver');
      }
    }
    for(const c of CORE_COLUMNS.filter(c=>c.outer||c.row===5||c.row===10)) {
      const height=t.elevations[7],thick=.055,ratio=1-1/150;
      const steelWidth=.34*(.68+ratio*.32),steelDepth=(c.corner?1.32:c.outer?1.02:.78)*(.52+ratio*.48);
      // Outer core sections turn 90 degrees in coreColumn(). Size this
      // existing stone casing around that rotated envelope, not around an
      // unrelated nominal pier rectangle; leave room behind all four skins.
      const w=Math.max(1.18,(c.outer?steelDepth:steelWidth)+2*thick+.035);
      const d=Math.max(1.28,(c.outer?steelWidth:steelDepth)+2*thick+.035);
      for(const sign of [-1,1]) {
        box(t,c.x+sign*(w/2-thick/2),height/2,c.z,thick,height,d,MAT.marble,LAYERS.interior,1,'lobby stone-clad core pier',0,`LP${c.id}`,'wtc-photo-archive');
        box(t,c.x,height/2,c.z+sign*(d/2-thick/2),w-thick*2,height,thick,MAT.marble,LAYERS.interior,1,'lobby stone-clad core pier',0,`LP${c.id}`,'wtc-photo-archive');
      }
    }
    // A photographed pale core-side lobby finish hides the lobby-level
    // structural bracing in architectural view. It exists only around the
    // six-storey atrium and is removable with INTERIOR; no tenant
    // floor gets a generic opaque infill curtain around its steel core.
    for(let face=0;face<4;face++) {
      const n=face%2?CX+.19:CZ+.19,width=face%2?CZ*2+.50:CX*2+.50;
      for(const [lo,hi,opening] of [[0,3.10,6.40],[3.10,PLAZA_ELEVATION,0],[PLAZA_ELEVATION,PLAZA_ELEVATION+3.10,9.60],[PLAZA_ELEVATION+3.10,t.elevations[7],0]]) {
        if(opening) for(const side of [-1,1]) faceBox(t,face,side*(opening/2+(width-opening)/4),(lo+hi)/2,n,(width-opening)/2,hi-lo,.14,MAT.marble,LAYERS.interior,1,'lobby core finish with passage opening');
        else faceBox(t,face,0,(lo+hi)/2,n,width,hi-lo,.14,MAT.marble,LAYERS.interior,1,'lobby core finish upper wall');
      }
    }
    // Guards end at the wider bridge openings, so public door routes do not
    // walk through a floating guard panel or drop into the concourse atrium.
    const sideGuardLength=CZ-9.3;
    for(const sign of [-1,1]) for(const zsign of [-1,1]) {
      const z=zsign*(CZ+9.3)/2,x=sign*(CX+3.4);
      rod(t,[x,PLAZA_ELEVATION+1.05,z-sideGuardLength/2],[x,PLAZA_ELEVATION+1.05,z+sideGuardLength/2],.045,.045,MAT.antenna,LAYERS.interior,2,'lobby mezzanine guard rail');
      box(t,x,PLAZA_ELEVATION+.52,z,.024,.98,sideGuardLength-.05,MAT.glass,LAYERS.interior,2,'lobby mezzanine glass guard');
      for(const zz of [z-sideGuardLength/2,z,z+sideGuardLength/2]) box(t,x,PLAZA_ELEVATION+.53,zz,.055,1.06,.055,MAT.antenna,LAYERS.interior,2,'lobby mezzanine guard post');
    }
    for(const sign of [-1,1]) for(const side of [-1,1]) {
      const x=side*(CX+9.3)/2,width=CX-9.3;
      box(t,x,PLAZA_ELEVATION+.52,sign*(CZ+3.4),width,.98,.024,MAT.glass,LAYERS.interior,2,'lobby mezzanine glass guard');
      rod(t,[x-width/2,PLAZA_ELEVATION+1.05,sign*(CZ+3.4)],[x+width/2,PLAZA_ELEVATION+1.05,sign*(CZ+3.4)],.045,.045,MAT.antenna,LAYERS.interior,2,'lobby mezzanine guard rail');
    }
    for(let i=serviceStart;i<primitives.length;i++) {
      const p=primitives[i];
      if(/^(stair |elevator |lobby )/.test(p.kind)&&!p.source) p.source='nist-1-7';
      if(/stone-clad core pier|mezzanine glass guard|mezzanine guard post|lobby core finish/.test(p.kind)) p.source='wtc-photo-archive';
    }
  }

  function hatAndRoof(t) {
    const e=t.elevations;
    // Six E–W and four N–S principal hat-truss planes; lattice at 107–roof.
    for(const rowNo of [5,6,7,8,9,10]) {
      const row=CORE_COLUMNS.filter(c=>c.row===rowNo);
      for(let f=107;f<=110;f++) {
        // Roof datum is the slab's upper face. Keep chord depth below its
        // underside instead of exposing repeated structural bars on the roof.
        const lo=e[f],hi=f===110?t.height-.49:e[f+1];
        for(let i=0;i<row.length-1;i++) {
          const a=row[i],b=row[i+1];
          rod(t,[a.x,lo,a.z],[b.x,hi,b.z],0.28,0.31,MAT.core,LAYERS.roof,f,'hat truss diagonal');
          if ((i+f)%2===0) rod(t,[b.x,lo,b.z],[a.x,hi,a.z],0.28,0.31,MAT.core,LAYERS.roof,f,'hat truss diagonal');
          rod(t,[a.x,hi,a.z],[b.x,hi,b.z],0.31,0.36,MAT.core,LAYERS.roof,f,'hat truss chord');
        }
      }
    }
    for(const x of [-CX,-8.2,8.1,CX]) for(let f=107;f<=110;f++) {
      const lo=e[f],hi=f===110?t.height-.49:e[f+1];
      for(let r=0;r<CORE_ROWS.length-1;r++) {
        const za=(719-CORE_ROWS[r].pz)/332*CZ*2,zb=(719-CORE_ROWS[r+1].pz)/332*CZ*2;
        rod(t,[x,lo,za],[x,hi,zb],0.28,0.30,MAT.core,LAYERS.roof,f,'hat transverse diagonal');
      }
    }
    for(const sign of [-1,1]) for(const u of [-12.192,-4.064,4.064,12.192]) {
      rod(t,[u,e[110],sign*CZ],[u,e[108],sign*(H-0.2)],18*IN,30*IN,MAT.core,LAYERS.roof,108,'hat outrigger long diagonal');
      rod(t,[u,e[108],sign*CZ],[u,e[108],sign*(H-0.2)],0.38,0.47,MAT.core,LAYERS.roof,108,'hat outrigger horizontal');
    }
    for(const sign of [-1,1]) for(const u of [-9.144,-3.048,3.048,9.144]) {
      rod(t,[sign*CX,e[110],u],[sign*(H-0.2),e[108],u],18*IN,26*IN,MAT.core,LAYERS.roof,108,'hat outrigger short diagonal');
      rod(t,[sign*CX,e[108],u],[sign*(H-0.2),e[108],u],0.38,0.47,MAT.core,LAYERS.roof,108,'hat outrigger horizontal');
    }
    // Roof plate obeys the chamfered footprint but intentionally has no
    // generic filled dark interior panels on every tenant floor.
    ringSlab(t,111,t.height,0.24);rectangle(t,-CX,CX,-CZ,CZ,t.height,0.24,MAT.roof,LAYERS.roof,110,'core roof slab');
    const roofBuilders={box,rod,materials:MAT,layers:LAYERS,halfWidth:H,cornerCut:CHAMFER,
      convex:(tower,geometry,material,layer,floor,kind,source)=>{
        const member=add(world(tower,...geometry.center),geometry.half,material,layer,tower.id,floor,kind,quaternionY(tower.orientation),undefined,source);
        member.shape=geometry.shape;return member;
      }
    };
    buildRoofCrown(t,roofBuilders);
    buildTowerRoofFixtures(t,roofBuilders);
  }

  progress('重建北塔、南塔的非均匀楼层与结构网格…');
  for(const t of towers) {
    progress(`${t.id===1?'北塔':'南塔'}：外围框架、三叉树柱与幕墙…`);
    exterior(t);
    for(const c of CORE_COLUMNS) {
      for(let f=1;f<=110;f+=3) {
        const lo=t.elevations[f],hi=f+3>110?t.height:t.elevations[f+3];
        // Split any three-storey piece at the documented change to I profile.
        if(c.transition>f && c.transition<f+3) {
          coreColumn(t,c,lo,t.elevations[c.transition],f);
          coreColumn(t,c,t.elevations[c.transition],hi,c.transition);
        } else coreColumn(t,c,lo,hi,f);
      }
      coreColumn(t,c,-20.7264,0,-6);
      box(t,c.x,-20.94,c.z,2.2,0.42,2.2,MAT.concrete,LAYERS.core,-6,'core column foundation');
    }
    for(let f=1;f<=110;f++) {
      if(f%10===0) progress(`${t.id===1?'北塔':'南塔'}：第 ${f} / 110 层（${primitives.length.toLocaleString()} 个解析构件）…`);
      const y=t.elevations[f],thickness=BEAM_FLOORS.has(f)?0.18:4*IN;
      ringSlab(t,f,y,thickness);coreSlab(t,f,y,MECHANICAL.has(f)?0.1524:0.127);
      floorFraming(t,f);mechanicalBracing(t,f);
    }
    for(let b=1;b<=6;b++) {
      const data=getTowerFloor(t.id,-b);
      ringSlab(t,-b,data.elevation,0.24);coreSlab(t,-b,data.elevation,0.26);
      for(let x=-CX;x<=CX;x+=6.858) for(let z=-CZ;z<CZ;z+=5.304)
        box(t,x,data.elevation-0.35,z,6.858,0.44,0.30,MAT.core,LAYERS.core,-b,'basement core floor beam');
    }
    services(t);hatAndRoof(t);
  }
  progress('接入原世贸中心路网、广场、地下结构及 WTC 3—6…');
  for(const p of primitives) {
    p.center[2]=-p.center[2];
    if(p.rotation)p.rotation=[-p.rotation[0],-p.rotation[1],p.rotation[2],p.rotation[3]];
  }
  for(const t of towers) {
    t.center[2]=-t.center[2];t.orientation=-t.orientation;t.localZSign=-1;
    for(const column of t.coreColumns)column.position[2]=-column.position[2];
    const min=t.bounds.min[2],max=t.bounds.max[2];t.bounds.min[2]=-max;t.bounds.max[2]=-min;
  }
  const historicSite=buildHistoricSite({materialBase:MATERIALS.length,layers:LAYERS,towers,onProgress:progress});
  for(const p of historicSite.primitives) {
    const member=add(p.center,p.half,p.material,p.layer,p.tower,p.floor,p.kind,p.rotation,p.id,p.source);
    if(p.shape)member.shape=p.shape;
  }
  const materials=[...MATERIALS,...historicSite.materials].map(m=>({...m,color:[...m.color],emission:[...m.emission],...(m.texture?{texture:{...m.texture}}:{})}));
  const sources=[...SOURCES,...historicSite.sources].filter((s,i,a)=>a.findIndex(v=>v.id===s.id)===i);
  progress('合并等截面的连续构件，保留井口、曲线轮廓及所有可见结构…');
  const groupEdges=new Map();
  for(const group of geometryGroups){groupEdges.set(primitives[group.start],{group,first:true});groupEdges.set(primitives[group.start+group.count-1],{group,first:false});}
  const optimized=optimizePrimitives(primitives,{profileMerging});primitives=optimized.primitives;
  for(const object of [countByKind,countByLayer,countByTower])for(const key of Object.keys(object))delete object[key];
  primitives.forEach((p,index)=>{
    countByKind[p.kind]=(countByKind[p.kind]||0)+1;countByLayer[p.layer]=(countByLayer[p.layer]||0)+1;countByTower[p.tower]=(countByTower[p.tower]||0)+1;
    const edge=groupEdges.get(p);if(edge){if(edge.first)edge.group.start=index;else edge.group.count=index-edge.group.start+1;}
  });

  const stats={primitiveCount:primitives.length,totalPrimitives:primitives.length,towerCount:2,buildingCount:6,contextBuildingCount:4,floors:220,basements:12,coreColumnsPerTower:47,perimeterColumnsPerTower:240,mainTrussPairs,mainTrussCount:mainTrussPairs*2,bridgingTrusses,representedElevatorShaftsPerTower:SHAFT_CELLS.length,countByKind,countByLayer,countByTower,optimization:optimized.stats,units:'metres',geometry:'analytic oriented boxes and convex prisms'};
  const metadata={
    title:'Original World Trade Center — architectural and structural reconstruction',
    period:'Pre-September 2001, representative configuration',
    units:'m',axisConvention:'Right-handed renderer: X east; Y up; Z south (true north is -Z). Source plan local Z is north; tower.localZSign converts source to renderer local Z.',structureNorthBearingDegrees:29,sourcePriority:'Original Port Authority drawings, final NIST reports, FEMA 403 and archive photographs',
    precision:'System-level educational reconstruction, not an as-built or finite-element model',
    confirmed:['110 above-concourse storeys and six basement levels per tower','207 ft 2 in reference-line footprint with 6 ft 11 in chamfers','59 columns per flat face plus four diagonal corner columns = 240','47 irregularly arranged core columns in six rows; documented IDs and individual wide-flange transition floors','North core E–W, South core N–S; core envelope 135 ft × 87 ft','12 ft typical storeys, distinct North lobby/mechanical/sky-lobby/upper-level elevation schedule','29 in main-truss depth; paired trusses at 6 ft 8 in centres; bridging and two-way corner collectors','Mechanical levels 7–8, 41–42, 75–76, 108–109; sky lobbies 44 and 78','Core and perimeter hat-truss connections from floor 107 to roof','North antenna 360 ft / 109.728 m','Six-storey lobby; plaza/mezzanine one level above underground concourse','Stairs A/C 44 in wide from floor 2 to 110; B 56 in wide from B6 to 107, without a mezzanine exit','Stair A/C transfers at 42, 48, 66, 68, 76, 82; B transfer at 76','Three local-elevator zones, 24 cars each; eight express cars to 44 and ten to 78','North floor 107 restaurant and 110 television studios; South floor 107 indoor observation and 110 mechanical'],
    approximations:[
      'Tower and WTC 3–6 positions share one uniform digitization scale from the 207 ft 2 in tower width on Port Authority SKA 54/84. Scan-derived horizontal positions have approximately 0.5–2 m uncertainty and are not a surveyed as-built site. Streets follow initial 1968 JK-10 western curb readings; eastern grades remain independent estimates. The complete scene is rotated 29 degrees clockwise into the true-north frame.',
      '47 core column centres now use original Tower A A-A-132 plan readings with one uniform tower-width scale, approximately ±0.30 m digitization uncertainty. NIST supplies column identifiers, six row counts and section transition floors. WTC 2 uses the rotated Tower A plan pending a complete South Tower drawing set.',
      'North floor elevations use NCSTAR 1-1 Fig. 2-2; lower floors 3–6 reconstruct transfer/service floor tops from spandrel, tree and floor-7 reference elevations. The South upper zone assumes the same floor elevations and locates its documented 6 ft roof difference in the floor-110-to-roof interval.',
      '417.0 m / 415.2 m roof heights are rounded visual-model dimensions; source heights are 1368 / 1362 ft above the Concourse.',
      'Tree assembly Fig. 3-6 reference elevations: bottom EL 363 ft (+16.1544 m); narrow trunk/fan start EL 372 ft 4 in (+18.9992 m); fan top EL 383 ft 8 in (+22.4536 m); two fan slots begin 6 ft above the fan start. Three upper prongs then run to the floor-9 assembly/splice EL 418 ft 11.5 in. Aluminum offsets, widths and architectural curved profile remain estimated.',
      'Perimeter built-up columns use solid section envelopes rather than four thin plates. Core columns retain hollow box and open I geometry, with representative size taper; exact plate thickness and member-by-member drawing-book schedules are not reproduced.',
      'Main trusses retain every paired line and all tenant levels. Their Warren webs use representative 12/8 diagonal subdivisions for long/short spans; exact dozens of truss variants, double-angle chord profiles, web knuckle loops and connections are simplified.',
      'Bridging geometry uses representative four long-span and two short-span rows. Conventional small core beams use box envelopes; principal mechanical/collector beams retain three-plate open I profiles.',
      'Stair endpoints, widths and transfer floors follow NCSTAR 1-7. Positions/orientations use seven original Tower A architectural checkpoints with about ±0.30 m reading error, including A/C outside the core at 42–47 and 76–81 and B transfer at 76. Lower-level extensions, orthogonal connecting corridors, tread counts and finishes remain representative. WTC 2 uses the rotated North Tower arrangement.',
      'Original Tower A L-A drawings provide 72 local, 23 shuttle/service/destination and FE48/49/50/99 hoistways: 99 numbered shafts per tower. Ordinary 44/78 shuttles are separated from the four interzone cars, PE5 service and PE6/7 destination cars. Each cell includes bank stops, secondary maintenance landings and machine levels; available landing faces change by floor. Shaft openings use rectangular unions inset from digitized envelopes and conservatively notch around steel columns. Complete special/service opening exceptions and basement/pit elevation mapping are not transcribed; modeled freight basement extents are not verified B6 stops. WTC 2 repeats the rotated North layout pending South drawings. Shaft doors, machines and finish thicknesses remain representative.',
      'Mechanical mezzanine catwalks, lobby gallery width, entrance bridges and elevator-door geometry remain reconstructed. NCSTAR 1-7 figures 2-4/2-5 place paired public escalators on the North Tower east side and South Tower north side, between concourse EL 310 and plaza EL 332 (6.7056 m rise); their precise coordinates, run, machine count and trim dimensions remain estimated. Public plaza doors lie between tree trunks; split glazing avoids overlap with leaves, and flush thresholds connect to the ±9.3 m bridges. Independent South Tower entrance-photo readings guide a 1.65 m high straight exterior fascia below the unchanged plaza floor datum; it is finish height, not the retained 0.18 m structural slab thickness. The separately identified North Tower photograph corroborates the exterior finish type; its shared metre dimensions are not independently calibrated. The upper ornamental band has estimated centre 12.30 m, 1.15 m endpoint height and 0.85 m waist: its top dips and its bottom rises symmetrically. The exposed near-column shape follows the measured 21–24 px visible edge; the attachment hidden behind the column is unmeasured. These finish proportions, centre and terminal-transom alignment remain photographic estimates, including perspective and threshold-reading uncertainty; they do not revise true floor elevations. The supplementary bridge photo has unverified tower/face identity. Lobby photographs guide the 3.4 m rounded inner-gallery corners, attached soffits, pale interior perimeter-pier skins, continuous upper ceiling and representative carpet palettes; their finish dimensions and carpet tower/date assignments are unconfirmed. The pale core-side finish belongs to INTERIOR. Floors 3–6 retain service/core slabs but no filled perimeter atrium floors.',
      'NCSTAR 1-5A pp. 33/40 supplies the typical 18.75 × 16.5 in column cover, 21.25 in opening with 1 in frame and 19.25 in clear width, 11.5 in glass setback, 55 in spandrel cover and 1/4 in bronze-tinted glass. Its central stainless window-washer track is 1.5 in wide with a 3/8 in visible slot. The absolute front +0.23 m is inferred to enclose the 14 in steel section; track depth, extrusion thickness and bevels are unmeasured. Glass plane is −0.0621 m and interior perimeter wall/floor edge −0.2272 m relative to the structural reference, preserving the sourced 18 in front-to-interior-wall distance.',
      'Architectural tree channels use 80 overlapping oriented segments per branch, with zero horizontal derivative at the engineering split and upper join. Constant-thickness returns and slot lips follow separate spatial curves. The deep base envelope is independently estimated: front +0.47 m, rear −0.44 m and combined width 0.60 m, enclosing the retained 0.56 × 0.80 m steel trunk. Front/rear skins transition smoothly to the sourced typical column profile; branch cover widths include the actual modeled steel-prong envelope. Thin curved metal faces close the solid engineering fan only below its two source-backed slot starts; glazed portals between trees stay open. The lower sweep starts 1.15 m below the split as a straight connection to the base wrap. These architectural tree depths/curves are photographic estimates, not dimensions confirmed by the typical curtain-wall specification.',
      'Upper facade follows NCSTAR 1-5A p.37: floor-107 covers taper to 12 in, with 28 in openings, 11 ft 7 in windows, 5/16 in glass and 7 ft 1 in spandrel covers. The 108/109 cover widths alternate 17/7 in and return to 12 in above the upper 7 ft 2 in spandrel; the lower spandrel is 6 ft 2 in. There is no exterior floor-109 spandrel through the two-storey mechanical opening. Smooth taper curves, upper band alignment relative to the incompletely documented intermediate floor schedule, dark architectural casing of unchanged steel, and two opposed curved window fork nodes are visual reconstructions. The lower node aligns to the base band of the 108/109 room; the upper node aligns to the crown underside. A single tall opening connects them; the incomplete core-floor schedule does not create a second decorative window. NCSTAR figure 4-8 and the user supplied photograph guide these profiles.',
      'Opaque aluminum corner wraps and extrusion details are representative visual reconstruction, not dimensions derived from the 6 ft 11 in footprint chamfer. The user supplied close roof photograph guides the silver sloped crown; its photographer/date and dimensions are unconfirmed. The roof datum remains 417.0/415.2 m and all straight perimeter columns reach it. Estimated crown-to-wall junction is datum plus 0.05 m, crest datum plus 3.10 m, lower/upper face offsets +0.23/-0.80 m. Exact head-band panels share the sloped skin boundary, and thin flush horizontal crest returns replace four overhanging bars; concealed counterflashing and the wall head enclose the unchanged steel tops. Four exact quadrilateral face panels and four exact triangular corner panels meet along shared vertices. The upper corner cut closes to zero at a square crest; separate closure strips and roof-side corner infill seal the skin. Pale lobby stone, glass mezzanine guards and white observation guards use public archive photographs, with estimated finish/guard dimensions. Lobby portals and mechanical louvers remain representative. North antenna total height is documented; its continuous closed lower white shaft behind opposite-side DTV panels, radial butterfly panel arrays around the upper cylindrical spine and stepped white radome follow the January 2001 photograph with estimated diameters and band heights. South walkway width and rise use the 1975 opening tour, while 2001 photos supply guards, wind screens, pipes and stairs; setbacks, access and equipment positions are still estimated. Arbitrary symmetric roof boxes and the unsupported central South viewing pad have been removed.',
      'Common substructure and western bathtub/slurry wall are now partially reconstructed in BASEMENT. Intermediate basement levels, underground vehicle/service details and the limited B5 PATH section contain representative geometry; complete station, utility and tenant layouts are not transcribed. SITE controls surface roads, soil and plaza independently, exposing the underground structure when hidden.',
      'Office occupancy, horizontal ceiling luminaires, continuous representative perimeter suspended ceilings, desk receivers, restaurant tables, studio lights and local plaza lamps are representative interior/lighting fit-out, not historical tenant records. Existing public-lobby gallery/atrium lamps use an always-on warm material for artistic daytime illumination; this is not a historical operating schedule. Emitters sit in fixtures inside the building; there are no luminous window cards.'
    ],
    rendering:{primitive:'oriented boxes and exact convex prisms',glassTransmission:0.92,glassIOR:1.5,nightEmissionCategories:['light'],floorIsolation:'Use physical elevation/height clipping; continuous glazing and three-storey columns have spanning floor tags.',facadeGlassDepth:'Typical 6.35 mm bronze-tinted glazing 292.1 mm behind column covers; real one-inch frames, recessed spandrels and narrow washer slots',enclosures:'Four-sided gypsum shafts with door openings on served floors; full walls on non-stop floors; no arbitrary service tubes'},
    floorSchedule:{northReference:'NCSTAR 1-1 Fig. 2-2, p. 18; Fig. 2-3, p. 19',concourseDatum:'EL 310 ft; displayed world Y=0',plazaApproximation:'Plaza/mezzanine is one level above concourse (NCSTAR 1-7 p. 12); modeled elevation uses North floor-2 datum, +22 ft / 6.7056 m',lowerInterpolated:[3,4,5,6],southUnverified:'Upper floor-to-roof height difference placement'},
    siteLayout:{source:'pa-18324-site',drawing:'SKA 54/84',page:328,method:SITE_CALIBRATION.method,structuralCenters:SITE_CALIBRATION.towerPixels.map(p=>{const [x,z]=sitePlanToStructure(p);return [x,0,z];}),relativeOffsetStructuralMetres:(()=>{const [a,b]=SITE_CALIBRATION.towerPixels.map(sitePlanToStructure);return [b[0]-a[0],0,b[1]-a[1]];})(),surveyed:false},
    historicSite:historicSite.metadata,
    ground:null,
    transport:{source:ELEVATOR_LAYOUT_SOURCE.id,egressSource:'nist-1-7',stairCheckpoints:ORIGINAL_STAIR_CHECKPOINTS,stairTransferFloors:{A:[42,48,66,68,76,82],B:[76],C:[42,48,66,68,76,82]},stairExtents:{A:[2,110],B:[-6,107],C:[2,110]},stairWidths:{A:44*IN,B:56*IN,C:44*IN},stairBNoExitAt:2,elevatorBanks:ELEVATOR_BANKS,representedShaftsPerTower:SHAFT_CELLS.length,planCoordinates:'Uniformly digitized original Tower A floor plans; ±0.30 m typical reading uncertainty, FE99 approximately ±0.60 m; South rotation, lower stair extensions and corridor routes remain assumptions'},
    facadeProfile:FACADE_PROFILE,
    treeProfile:{front:.47,rear:-.44,combinedBaseWidth:.60,individualFluteWidth:.26,retainedSteelTrunk:[.56,.80],splitElevation:18.9992,joinElevation:22.4536,slotStartElevation:18.9992+6*FT,surveyed:false,source:'loc-plaza-1976'},
    upperFacade:{source:'nist-1-5a',level107:{coverWidth:12*IN,openingWidth:28*IN,windowHeight:139*IN,glassThickness:5/16*IN,spandrelCoverHeight:85*IN},level108109:{alternatingCoverWidths:[17*IN,7*IN],openingWidth:28*IN,lowerSpandrelHeight:74*IN,upperSpandrelHeight:86*IN,intermediateExteriorSpandrel:false},upperReturnWidth:12*IN,transitionCurve:'photographic approximation'},
    towerRoofs:TOWER_ROOF_EVIDENCE,
    roofCrown:{...ROOF_CROWN,crestAboveRoof:ROOF_CROWN.bottomAboveRoof+ROOF_CROWN.rise,source:'user-roof-reference',surveyed:false},
    lobby:{datum:PLAZA_ELEVATION,entranceBays:[...ENTRANCE_BAYS],streetEntrance:{tower:1,face:3,floor:1,elevation:0,datumFeet:310,approach:'West Street forecourt and taxi loop',reference:'user-street-entrance-reference'},gallery:{eastWest:{inner:CX,outer:CX+3.4},northSouth:{inner:CZ,outer:CZ+3.4},cornerRadius:3.4,photoEstimate:true},perimeterGallery:{inner:H-3.2,outer:H+.215,top:PLAZA_ELEVATION,fasciaHeight:LOBBY_BAND_PROFILE.straightFasciaHeight,fasciaThickness:LOBBY_BAND_PROFILE.straightFasciaThickness,structuralSlabThickness:.18,fasciaPhotoEstimate:true},exteriorBands:{...LOBBY_BAND_PROFILE,terminalTransomElevation:LOBBY_BAND_PROFILE.ornamentalCentre,terminalTransomPhotoEstimate:true},entryBridges:{halfWidth:9.3,outer:H+.52},recommendedConcourseCameraLocal:[27.6,1.75,-17],recommendedPlazaCameraLocal:[-1.524,PLAZA_ELEVATION+1.70,H-2.7],coreFinish:{height:towers[0].elevations[7],layer:LAYERS.interior,passages:[{elevation:0,width:6.4,height:3.1},{elevation:PLAZA_ELEVATION,width:9.6,height:3.1}]}},
    geometryGroups,
    sourceURLs:sources.map(s=>s.url).filter(Boolean)
  };
  if(CORE_COLUMNS.length!==47) throw new Error('Core grid must contain 47 distinct columns');
  for(const p of primitives) {
    if(![...p.center,...p.half,...(p.rotation||[])].every(Number.isFinite)) throw new Error(`Non-finite geometry in ${p.kind}`);
    if(p.half.some(v=>v<=0)) throw new Error(`Non-positive analytic box in ${p.kind}`);
  }
  progress(`完成：${primitives.length.toLocaleString()} 个解析构件 · 220 层 · 每塔 47 核心柱 / 240 外围柱`);
  return {primitives,materials,towers,contextBuildings:historicSite.contextBuildings,stats,sources,metadata};
}
