// Original PANYNJ Tower A drawings, mirrored in Public Intelligence's 210-page
// set: https://info.publicintelligence.net/wtcblueprints.zip . PDF page numbers
// below are one-based. These are original design/revision records, not a
// certification that every landing remained unchanged through September 2001.
// Tower A = WTC 1. Applying this plan to WTC 2 requires a documented assumption.
export const ELEVATOR_LAYOUT_SOURCE = Object.freeze({
  id: 'panynj-tower-a-original-drawings',
  url: 'https://info.publicintelligence.net/wtcblueprints.zip',
  catalogueUrl: 'https://publicintelligence.net/world-trade-center-north-tower-blueprints/',
  tower: 'WTC 1 / Tower A',
  calibration: {
    page: 126, drawing: 'A-A-132', title: '79th Floor Plan',
    renderedPixels: [5288, 3924],
    referenceWidthFeet: 207 + 2 / 12,
    referenceColumnLinesPixels: { west: 1035, east: 3665, north: 468, south: 3090 },
    originPixels: [2350, 1779],
    metresPerPixel: ((207 + 2 / 12) * 0.3048) / 2630,
    axes: 'x east, z architectural north; z is negative raster y',
    estimatedReadingErrorMetres: 0.30,
    method: 'One uniform scale from the tower reference-column width, followed by translation; no separate x/y scaling. Core column centres and shaft cell outlines were read from the full floor plan. Lift labels and landing faces were cross-checked in the enlarged core and L-A plans.',
    limits: 'Digitized coordinates are estimates. Cell envelopes are rounded readings of architectural shaft walls; they are not dimensioned car/platform sizes. Zones I and II use the northern local-cell row framework; Zone III uses the southern framework. Other floor plans are registered to this core-column frame; individual shaft-wall offsets and later revisions have not all been surveyed.',
  },
});

const S = ELEVATOR_LAYOUT_SOURCE.calibration.metresPerPixel;
const point = ([px, py]) => ({ x: (px - 2350) * S, z: (1779 - py) * S });

// Rectangular unions describe the usable opening around column intrusions.
// The notches are conservative reconstruction geometry: original plans show
// the corner wraps, while this model's steel-section envelopes supply their
// clearance. They are not surveyed gypsum-wall dimensions.
const subtractRect = (r, cut) => {
  const [a,b,c,d] = r, [e,f,g,h] = cut;
  const x1=Math.max(a,e),x2=Math.min(b,f),z1=Math.max(c,g),z2=Math.min(d,h);
  if(x1>=x2 || z1>=z2) return [r];
  return [[a,x1,c,d],[x2,b,c,d],[x1,x2,c,z1],[x1,x2,z2,d]]
    .filter(q=>q[1]-q[0]>.002 && q[3]-q[2]>.002);
};
const clearOpening = cell => {
  const xInset=cell.clearWidth?Math.max(.055,(cell.w-cell.clearWidth)/2):.055;
  let rects=[[cell.x-cell.w/2+xInset,cell.x+cell.w/2-xInset,
    cell.z-cell.d/2+.055,cell.z+cell.d/2-.055]];
  const notches=[];
  for(const col of ORIGINAL_CORE_COLUMN_POSITIONS) {
    const outer=col.index===0 || col.index===(col.row===8?6:7);
    const corner=(col.row===5||col.row===10)&&outer;
    // Maximum representative section over the stacked zones, including a
    // small wall/reading clearance. Outer sections turn through 90 degrees.
    const dx=(outer?(corner?1.32:1.02):.48)/2+.075;
    const dz=(outer?.34:.78)/2+.075;
    const cut=[col.x-dx,col.x+dx,col.z-dz,col.z+dz];
    if(rects.some(r=>r[0]<cut[1]&&r[1]>cut[0]&&r[2]<cut[3]&&r[3]>cut[2])) {
      notches.push({columnId:col.id,bounds:cut});
      rects=rects.flatMap(r=>subtractRect(r,cut));
    }
  }
  return {clearBounds:rects,columnNotches:notches,
    clearMethod:cell.clearWidth?'Use the dimensioned 6 ft 3 1/4 in local clear-hoistway width inside the digitized envelope, with 55 mm depth inset; subtract conservative steel-column envelopes where the original plan wraps around a column.':'Inset digitized shaft envelope by 55 mm; subtract conservative steel-column envelopes at the original plan centres where corner-wrap intrusions occur.',
    clearUncertainty:'Approximately ±0.30 m plan reading; notch depth uses representative maximum steel sections, not a dimensioned as-built enclosure survey.'};
};

// Row IDs agree with the 47-column NIST plan. The metre positions now come
// from a full original architectural plan, rather than scaling a schematic.
const columnPixels = [
  { row: 5, y: 1248, x: [1492, 1750, 2016, 2275, 2401, 2655, 2920, 3180] },
  { row: 6, y: 1473, x: [1492, 1750, 2016, 2275, 2401, 2655, 2920, 3180] },
  { row: 7, y: 1709, x: [1492, 1825, 2150, 2275, 2401, 2535, 2855, 3180] },
  { row: 8, y: 1845, x: [1492, 1825, 2150, 2401, 2535, 2855, 3180] },
  { row: 9, y: 2093, x: [1492, 1750, 2016, 2275, 2401, 2655, 2920, 3180] },
  { row: 10, y: 2305, x: [1492, 1750, 2016, 2275, 2401, 2655, 2920, 3180] },
];
export const ORIGINAL_CORE_COLUMN_POSITIONS = columnPixels.flatMap(r =>
  r.x.map((px, index) => ({ id: r.row * 100 + index + 1, row: r.row, index,
    ...point([px, r.y]), pixel: [px, r.y], sourcePage: 126, sourceDrawing: 'A-A-132',
    accuracy: 'digitized; approximately ±0.30 m' })));

// Eight columns of three stacked local hoistways. Each pair faces an elevator
// lobby: west cells open east (+x), east cells open west (-x).
const cellX = [1540, 1768, 1880, 2120, 2572, 2790, 2915, 3135];
const cellY = [1735, 1866, 2002];
const cellWidthPx = [102, 105, 104, 102, 107, 103, 101, 103];
const cellDepthPx = [119, 126, 126];
export const ORIGINAL_LOCAL_SHAFT_CELLS = cellX.flatMap((px, column) =>
  cellY.map((py, row) => ({ cell: `${column}-${row}`, column, row,
    ...point([px, py]), w: cellWidthPx[column] * S, d: cellDepthPx[row] * S,
    doorNormal: [column % 2 ? -1 : 1, 0], pixel: [px, py],
    sourcePage: 126, sourceDrawing: 'A-A-132',
    clearWidth:(6+3.25/12)*.3048,
    accuracy: 'digitized envelope; approximately ±0.30 m' }))).map(cell=>({...cell,...clearOpening(cell)}));

// Low/middle zone plans retain the same east/west bank arrangement, but their
// local shafts occupy the northern three rows. Plan 70 has a scan translation
// of about +43 x / +10 y pixels relative to plan 126; these registered readings
// preserve the structural-column frame instead of moving the columns.
const zoneCellFrames={
  I:{page:35,drawing:'A-A-37',x:[1553,1767,1886,2120,2580,2795,2910,3135],y:[1545,1666,1798],depth:[111,116,117]},
  II:{page:70,drawing:'A-A-74',x:[1555,1773,1881,2127,2595,2800,2922,3147],y:[1548,1680,1810],depth:[112,117,118]},
};
const localCell=(zone,column,row)=>{
  const prior=ORIGINAL_LOCAL_SHAFT_CELLS.find(c=>c.column===column&&c.row===row);
  const frame=zoneCellFrames[zone];
  if(!frame)return prior;
  const pixel=[frame.x[column],frame.y[row]];
  const cell={...prior,...point(pixel),pixel,d:frame.depth[row]*S,
    sourcePage:frame.page,sourceDrawing:frame.drawing,
    registration:'Registered to original core-column frame; approximately ±0.30 m including scan skew.'};
  return {...cell,...clearOpening(cell)};
};

const zones = [
  { zone: 'I', base: 1, riserPage: 194, riserDrawing: 'L-A-5', planPages: [194,195],
    groups: [['A',24,29,9,16,17,18], ['B',30,35,17,24,25,26],
      ['C',36,41,25,32,33,34], ['D',42,47,33,40,41,42]],
    columns: [[38,37,36],[39,40,41],[44,43,42],[45,46,47],
      [33,34,35],[32,31,30],[27,28,29],[26,25,24]] },
  { zone: 'II', base: 44, riserPage: 198, riserDrawing: 'L-A-7', planPages: [197,198,199],
    groups: [['A',51,56,45,54,55,56], ['B',57,62,55,61,62,63],
      ['C',63,68,62,67,68,69], ['D',69,74,68,74,75,76]],
    columns: [[65,64,63],[66,67,68],[71,70,69],[72,73,74],
      [60,61,62],[59,58,57],[54,55,56],[53,52,51]] },
  { zone: 'III', base: 78, riserPage: 177, riserDrawing: 'L-A-11', planPages: [176,177,178],
    groups: [['A',75,80,79,86,87,88], ['B',81,86,87,93,94,95],
      ['C',87,92,94,100,101,102], ['D',93,98,101,107,108,109]],
    columns: [[83,82,81],[84,85,86],[89,88,87],[90,91,92],
      [95,94,93],[96,97,98],[78,79,80],[77,76,75]] },
];
const range = (a,b) => Array.from({length: b-a+1}, (_,i) => a+i);
export const ORIGINAL_LOCAL_ELEVATOR_BANKS = zones.flatMap(zone => zone.groups.map(
  ([letter, first, last, start, end, secondaryFloor, machineFloor], group) => ({
    id: `local-${zone.base}-${group+1}`, type: 'local', zone: zone.zone, letter,
    base: zone.base, start, end, secondaryFloor, machineFloor, shaftTop: machineFloor,
    secondaryFloors: [secondaryFloor],
    maintenanceLanding: {floor:secondaryFloor,kind:'secondary maintenance landing',
      sourcePage:zone.riserPage,note:'SECONDARY FLOOR in original L-A plan; not counted as a normal passenger stop.'},
    count: 6, group, source: ELEVATOR_LAYOUT_SOURCE.id, subrangeConfirmed: true,
    sourcePage: zone.riserPage, sourceDrawing: zone.riserDrawing,
    liftIds: range(first,last).map(n => `PE${n}`),
    servedFloors: [zone.base, ...range(start,end)],
    cells: zone.columns.flatMap((ids, column) => ids.flatMap((n,row) =>
      n < first || n > last ? [] : [{
        ...localCell(zone.zone,column,row),
        id: `PE${n}`, liftNumber: n,
        pitFloor: zone.zone === 'II' ? ([66,67].includes(n) ? 42 : 43)
          : zone.zone === 'III' ? ([78,79].includes(n) ? 76 : 77) : null,
        pitNote: zone.zone === 'I' ? 'Original pits vary between Service and lower sublevels; not represented by one universal pit floor.' : null,
        extraLandingLabels: zone.zone === 'I' && [30,35].includes(n)
          ? ['Service EL 294 ft', 'Parking/Sublevel 1 EL 284 ft'] : [],
        landingFaceSourcePages: zone.planPages,
      }]))
  })));

// The original L-A-15/L-A-19 plans distinguish the 23 shuttle shaft IDs.
// Detailed through-landings and service conversions are not assumed here.
export const ORIGINAL_SHUTTLE_INVENTORY = [
  { zone: 'II', liftNumbers: range(1,11), sourcePage: 181, sourceDrawing: 'L-A-15',
    note: 'PE1–4 and PE8–11 are ordinary Zone II shuttles; PE5 is Zone I service and PE6/7 are restaurant/Zone III service in L-A-22.' },
  { zone: 'III', liftNumbers: range(12,23), sourcePage: 185, sourceDrawing: 'L-A-19',
    note: 'PE12–17 are interzone elevators with additional through-landings; PE18–23 are Zone III shuttles. See L-A-22, PDF189.' },
];

const shuttleNorthX = [1566,1698,1823,1952,2095,2228,2460,2596,2729,2860,3003,3138];
const shuttleSouthX = [1566,1698,1823,1952,2095,2228,2596,2729,2860,3003,3138];
const shuttleCell = n => {
  const north=n>=12, index=north?n-12:11-n;
  const pixel=[(north?shuttleNorthX:shuttleSouthX)[index],north?1382:2202];
  const cell={id:`PE${n}`,liftNumber:n,...point(pixel),w:2.64,d:3.75,
    pixel,doorNormal:[0,north?-1:1],sourcePage:north?185:181,
    sourceDrawing:north?'L-A-19':'L-A-15',
    accuracy:'Digitized shaft envelope; approximately ±0.30 m. Plan-wall offsets are rounded.',
    pitFloor:null,pitNote:'Pit bottom is an elevation below the service level in L-A-22; it is not mapped to one universal basement floor.',
    landingFaces:[],unknown:['Complete per-floor landing/through-door schedule and pit-to-floor mapping']};
  const face=(floors,normal,note)=>cell.landingFaces.push({floors,doorNormal:normal,note,sourcePage:cell.sourcePage});
  if(n>=12) {
    if(n<=15) {face([1],[0,1],'Concourse landing');face([78],[0,-1],'78th-floor landing');}
    else if(n===16) {face([1,44],[0,1],'Concourse/44th-floor side');face([78],[0,-1],'78th-floor side');}
    else if(n===17) {face([1,44],[0,1],'Concourse/44th-floor side');face([78],[0,-1],'78th-floor side');}
    else if(n<=19) {face([1,44],[0,1],'Concourse/44th-floor side');face([78],[0,-1],'78th-floor side');}
    else {face([1],[0,1],'Concourse side');face([78],[0,-1],'78th-floor side');}
  } else {
    if([1,2,3,4,8,9,10,11].includes(n)) {
      face([1],[0,-1],'Concourse side');face([44],[0,1],'44th-floor side');
    } else if(n===5) {
      face([1],[0,-1],'Concourse side');
      face(range(2,44),[0,1],'Zone I service side; detailed service openings require the L-A-22 schedule');
    } else {
      face([1,107,...(n===6?[106]:[])],[0,-1],'Restaurant/destination and concourse side');
      cell.servedFloors=n===6?[1,106,107]:[1,107];
    }
  }
  return {...cell,...clearOpening(cell)};
};
const shuttleBank = (id,numbers,type,servedFloors,end,shaftTop,machineFloor) => ({
  id,type,base:1,start:Math.min(...servedFloors.filter(f=>f>1)),end,shaftTop,machineFloor,
  pitFloor:null,count:numbers.length,source:ELEVATOR_LAYOUT_SOURCE.id,
  sourcePage:189,sourceDrawing:'L-A-22',servedFloors,
  secondaryFloors:machineFloor===47?[46]:machineFloor===81?[80]:[],
  maintenanceLanding:machineFloor===47?{floor:46,kind:'secondary maintenance landing',sourcePage:183}
    :machineFloor===81?{floor:80,kind:'secondary maintenance landing',sourcePage:187}:null,
  cells:numbers.map(shuttleCell),
  unknown:['Basement/service landing labels have not all been assigned model floor indices',
    ...(numbers.includes(6)||numbers.includes(7)?['Additional service openings below the destination floors are not completely transcribed']:[])],
});

// Preserve the drawing inventory separately from the 8/10-express shorthand
// in NIST. Four interzone cars share the 44th-floor transfer landing.
export const ORIGINAL_OTHER_ELEVATOR_BANKS = [
  shuttleBank('express-44',[1,2,3,4,8,9,10,11],'express',[1,44],44,47,47),
  shuttleBank('service-5',[5],'Zone I service',[1,...range(2,44)],44,47,47),
  shuttleBank('upper-destination',[6,7],'destination express',[1,106,107],107,110,110),
  shuttleBank('express-78',[12,13,14,15,20,21,22,23],'express',[1,78],78,81,81),
  shuttleBank('interzone-44-78',[16,17,18,19],'interzone express',[1,44,78],78,81,81),
  ...[
    {n:48,pixel:[2460,2148],base:-6,end:40,secondaryFloor:41,machineFloor:42,sourcePage:180,
      w:3.075,d:2.77,doorNormal:[0,1],servedFloors:[1,...range(2,40)],
    note:'L-A-14: freight 48 beside column 905 in the central south shuttle-row slot, opening north; 41st-floor secondary level and 42nd-floor machine room. Sublevel labels are preserved below; regular above-grade stops are drawn on the riser.'},
    {n:49,pixel:[2228,1666],base:-6,end:74,secondaryFloor:75,machineFloor:76,sourcePage:180,
      w:2.79,d:2.74,doorNormal:[0,1],servedFloors:[1,2,...range(39,74)],
    note:'L-A-14: freight 49 north of freight 50, opening north; 75th-floor secondary level and 76th-floor machine room. Intermediate lower-zone floors are through-shaft, not assumed passenger stops.'},
    {n:50,pixel:[2228,1798],base:-6,end:108,secondaryFloor:109,machineFloor:110,sourcePage:180,
      w:2.74,d:2.79,doorNormal:[0,-1],servedFloors:[1,...range(2,108)],
    note:'L-A-14: full-height freight 50 east of the 703/803 column line, opening south; 109th-floor secondary level and upper machine level. Riser annotates opening exceptions, which remain untranscribed.'},
    {n:99,pixel:[2080,1735],base:105,end:110,secondaryFloor:null,machineFloor:110,sourcePage:183,
      w:2.977,d:2.769,doorNormal:[0,1],servedFloors:[106,107,108,109,110],
      note:'L-A-17: FE99 pit at the 105th-floor elevation; through doors alternate between 106/107/108 and 109/110. Position read approximately from the 110th-floor core plan A-A-175 (PDF168), registered to the original core columns; less certain than the common 79th-floor calibration.'},
  ].map(f=>{
    const cell={id:`FE${f.n}`,liftNumber:f.n,...point(f.pixel),pixel:f.pixel,
      w:f.w,d:f.d,doorNormal:f.doorNormal,pitFloor:f.base,sourcePage:f.sourcePage,
      sourceDrawing:f.n===99?'L-A-17':'L-A-14',
      accuracy:f.n===99?'Approximately ±0.60 m registered plan reading':'Approximately ±0.30 m registered plan reading',
      landingFaces:f.n===99?[{floors:[106,107,108],doorNormal:[0,1],sourcePage:183},
        {floors:[109,110],doorNormal:[0,-1],sourcePage:183}]:[]};
    return {id:`service-${f.n}`,type:f.n===50?'full-height freight':f.n===99?'upper service':'zoned freight',
      base:f.base,start:f.base,end:f.end,shaftTop:f.machineFloor,machineFloor:f.machineFloor,
      pitFloor:f.base,count:1,servedFloors:f.servedFloors,
      secondaryFloor:f.secondaryFloor,secondaryFloors:f.secondaryFloor?[f.secondaryFloor]:[],
      maintenanceLanding:f.secondaryFloor?{floor:f.secondaryFloor,kind:'secondary maintenance landing',sourcePage:f.sourcePage}:null,
      source:ELEVATOR_LAYOUT_SOURCE.id,sourcePage:f.sourcePage,
      sourceDrawing:cell.sourceDrawing,cells:[{...cell,...clearOpening(cell)}],note:f.note,
      extraLandingLabels:f.n===99?[]:['Service EL 294 ft','Sublevel 1 EL 284 ft','Sublevel 2 EL 274 ft','Sublevel 3 EL 264 ft'],
      unknown:f.n===99?['Machine floor is an upper-level envelope; overhead extends above floor 110']
        :['Exact basement-to-model-floor mapping; individual riser opening exceptions; complete per-floor landing-face schedule'],
      pitMapping:'Representative model basement extent; original pit elevation and sublevel landing labels do not equal a verified -6 stop.'};
  }),
];

const stairPoint=(id,pixel,extra={})=>({id,...point(pixel),pixel,...extra});
const stairCheckpoint=(from,to,page,drawing,pixels,note)=>({
  from,to,sourcePage:page,sourceDrawing:drawing,source:ELEVATOR_LAYOUT_SOURCE.id,
  accuracy:'Approximately ±0.30 m plan reading; lower-floor extensions and transfer routes are reconstructed.',
  stairs:pixels.map(([id,x,y,rotation=0])=>stairPoint(id,[x,y],{rotation})),note,
});
// Positions are flight/enclosure centres, not door centres. Page 78 is a
// 49th-floor plan; page 102 is the 67th-floor plan (page numbers are not floors).
export const ORIGINAL_STAIR_CHECKPOINTS = [
  stairCheckpoint(2,41,35,'A-A-37',[['A',3068,2020,Math.PI/2],['B',2460,1595],['C',1614,2020,Math.PI/2]],
    '9th/10th-floor plan: A east, C west on the south side; B immediately east of the central corridor. Applying to lower floors is a reconstruction assumption.'),
  stairCheckpoint(42,47,70,'A-A-74',[['A',3258,1375],['B',2460,1595],['C',1380,2210]],
    '45th-floor plan: A is outside the northeast core; C outside the southwest core. Transfer at 42 remains from NIST.'),
  stairCheckpoint(48,65,78,'A-A-82',[['A',2630,2020,Math.PI/2],['B',2460,1595],['C',2045,2020,Math.PI/2]],
    '49th-floor plan: A/C return south of the central core corridor, north of the south shuttle row. Registered from nearby columns 903/906; flight centres are distinct from shuttle-shaft centres.'),
  stairCheckpoint(66,67,102,'A-A-106',[['A',3100,2168,Math.PI/2],['B',2460,1595],['C',1750,2210]],
    '67th-floor plan records the temporary A/C transfer positions; 66th-floor transition route itself is not completely traced.'),
  stairCheckpoint(68,75,106,'A-A-110',[['A',2630,2020,Math.PI/2],['B',2460,1595],['C',2045,2020,Math.PI/2]],
    '69th-floor plan: A/C return south of the central corridor, north of the south shuttle row; nearby column anchors confirm the 49th-floor flight positions.'),
  stairCheckpoint(76,81,126,'A-A-132',[['A',3258,2025],['B',2460,1950],['C',1380,1345]],
    '79th-floor plan: A outside southeast, C outside northwest; B transfers to the south portion of the central corridor.'),
  stairCheckpoint(82,110,134,'A-A-140',[['A',2625,1550,Math.PI/2],['B',2460,1950],['C',2180,1550,Math.PI/2]],
    '87th-floor plan, checked against 102nd and 110th-floor core plans: A/C are north of the central core corridor, south of the north shuttle row. Flight centres registered from nearby row-6/7 columns; B terminates at 107 per NIST.'),
];
