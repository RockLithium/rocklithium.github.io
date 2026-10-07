// West Street entrance: supplied intact exterior/close photographs, not the
// LEGO/model illustration. All finish dimensions are photographic estimates.
import {roofConvexPanel} from './tower-roofs.js';
export const HOTEL_ENTRANCE_PROFILE=Object.freeze({width:32.4,projection:4.6,wingProjection:3.2,fasciaHeight:.52,canopyHeight:3.65,screenHeight:10.4,wingHeight:7.1,screenTopProjection:.16,modules:9,groups:Object.freeze([3,3,3]),columnDiameter:.30,backingProjection:1.25,centralBackingProjection:1.75,backingSideExtension:2.4,centralBackingSideExtension:.24,backingCapThickness:.16,backingBandHeight:.46,source:'user-hotel-west-entrance',surveyed:false});
export function buildHotelPublicFacade({F,portal,vehicleAccess,levels,f,ee,bb,M,L,edgeIndex},P=HOTEL_ENTRANCE_PROFILE){
  const src=P.source,bottom=levels[f],top=levels[f+1],centre=portal?F.length*portal.t:null;
  const strip=(a,b,y,h,n,d,m,kind)=>ee(F.at(a,n),F.at(b,n),y,h,d,m,L.facade,f+1,kind,src,{facadeZone:'public',evidenceStatus:'photographic-finish-estimate'});
  if(f===0){
    // The stone base is a mostly solid wall with a few differently sized
    // service openings. It does not have a uniform row of office windows.
    const stone=M.hotelBase??M.hotel,openings=[];
    if(portal){
      openings.push({lo:centre-P.width/2,hi:centre+P.width/2,bottom,top});
      for(const [fraction,width,sill,height] of [[.83,2.1,1.45,1.20],[.72,6.8,.10,2.95],[.58,2.4,1.4,1.25],[.09,3.0,1.2,1.35]]){
        const u=F.length*fraction,lo=u-width/2,hi=u+width/2,vehicle=fraction===.72;
        const floor=vehicle?(vehicleAccess?.threshold??bottom):bottom+sill;
        if(lo>=0&&hi<=F.length&&!openings.some(o=>lo<o.hi&&hi>o.lo))openings.push({lo,hi,bottom:floor,top:floor+height,vehicle});
      }
    }else if(F.length<36&&F.length>10){
      const width=Math.min(8,F.length*.48),u=F.length*.54;openings.push({lo:u-width/2,hi:u+width/2,bottom:bottom+.38,top:bottom+3.25});
    }
    openings.sort((a,b)=>a.lo-b.lo);
    let cursor=0;
    for(const o of [...openings,{lo:F.length,hi:F.length,bottom,top}]){
      if(o.lo>cursor+.01)strip(cursor,o.lo,(bottom+top)/2,top-bottom,0,.24,stone,'hotel independent solid stone-base wall');
      if(o.hi>o.lo+.01){
        if(o.bottom>bottom+.01)strip(o.lo,o.hi,(bottom+o.bottom)/2,o.bottom-bottom,0,.24,stone,'hotel stone ground-storey sill');
        if(o.top<top-.01)strip(o.lo,o.hi,(o.top+top)/2,top-o.top,0,.24,stone,'hotel stone ground-storey lintel');
        if(!o.vehicle&&(!portal||o.lo!==centre-P.width/2))strip(o.lo,o.hi,(o.bottom+o.top)/2,o.top-o.bottom,.17,.025,M.hotelGlass,'hotel podium discrete service opening');
      }
      cursor=o.hi;
    }
  }else{
    const sill=f===1?.42:.32,band=f===1?1.02:1.15,height=top-bottom-sill-band;
    strip(0,F.length,bottom+sill/2,sill,-.01,.18,M.hotel,'hotel public continuous stone sill');
    strip(0,F.length,top-band/2,band,-.01,.18,M.hotel,'hotel public continuous stone spandrel');
    strip(.05,F.length-.05,bottom+sill+height/2,height,.20,.022,M.hotelMirror??M.hotelGlass,'hotel public horizontal glazing band');
    const count=Math.round(F.length/2.48);
    for(let k=0;k<=count;k++){
      const u=F.length*k/count,p=F.at(u,.14);
      bb(p[0],bottom+sill+height/2,p[1],.045,height,.07,M.hotelAluminum??M.steel,L.facade,f+1,'hotel public fine vertical mullion',-Math.atan2(F.t[1],F.t[0]),src);
    }
  }
}
export function buildHotelEntrance({F,portal,levels,bb,ee,slopingPanel,rod,M,L,localZSign=-1},P=HOTEL_ENTRANCE_PROFILE){
  M={...M,rail:M.hotelAluminum??M.rail??M.steel,canopyGlass:M.canopyGlass??M.hotelGlass};
  const src=P.source,centre=F.length*portal.t,width=Math.min(P.width,F.length-1.2),lo=centre-width/2,hi=centre+width/2,grade=portal.threshold;
  const at=(u,n,y)=>{const p=F.at(u,n);return[p[0],y,p[1]];};
  const strip=(a,b,n,y,h,d,m,kind)=>ee(F.at(a,n),F.at(b,n),y,h,d,m,L.facade,1,kind,src,{evidenceStatus:'photographic-finish-estimate'});
  const wall=u=>{
    const q=(u-lo)/(width/9),k=Math.max(0,Math.min(8,Math.floor(q))),t=q-k,samples=portal.screenBackSamples;
    return samples?samples[k]*(1-t)+samples[k+1]*t:(portal.screenBackRecess??-P.screenTopProjection);
  };
  // Three banks of three glazed modules, with the middle bank projecting
  // farther and rising higher. Their railings
  // meet the broad raised threshold platform, rather than one tiny doorway.
  const pitch=width/P.modules,doorHeight=2.55;
  for(let k=0;k<P.modules;k++){
    const u=lo+(k+.5)*pitch,doorWidth=2.15;
    strip(u-doorWidth/2,u+doorWidth/2,.24,grade+doorHeight/2,doorHeight,.022,M.hotelGlass,'hotel west entrance glazing');
    for(const offset of [-doorWidth/2,0,doorWidth/2])strip(u+offset-.027,u+offset+.027,.19,grade+doorHeight/2,doorHeight,.085,M.rail,'hotel west entrance door frame');
    for(const offset of [-.11,.11])strip(u+offset-.015,u+offset+.015,.11,grade+1.12,.72,.035,M.rail,'hotel entrance door pull');
    strip(u-pitch/2,u-doorWidth/2,.23,grade+doorHeight/2,doorHeight,.022,M.hotelGlass,'hotel recessed entrance side glazing');
    strip(u+doorWidth/2,u+pitch/2,.23,grade+doorHeight/2,doorHeight,.022,M.hotelGlass,'hotel recessed entrance side glazing');
  }
  strip(lo,hi,.23,grade+(doorHeight+P.canopyHeight-.15)/2,P.canopyHeight-.15-doorHeight,.022,M.hotelGlass,'hotel recessed entrance header glazing');
  const banks=Array.from({length:3},(_,i)=>({index:i,lo:lo+i*3*pitch,hi:lo+(i+1)*3*pitch,projection:i===1?P.projection:P.wingProjection,high:grade+(i===1?P.screenHeight:P.wingHeight),rows:i===1?5:3}));
  const solid=(vertices,m,kind,metadata={},faces)=>{
    const g=roofConvexPanel(vertices,faces);
    const part=bb(...g.center,...g.half.map(v=>v*2),m,L.facade,metadata.entranceBackingTier?metadata.entranceBackingTier+1:1,kind,0,src,{...metadata,evidenceStatus:'photographic-finish-estimate'});
    part.shape=localZSign===1?{...g.shape,planes:g.shape.planes.map(([x,y,z,d])=>[x,y,-z,d])}:g.shape;
    return part;
  };
  const panel=(vertices,thickness,m,kind,metadata={},faces)=>{
    const a=vertices[1].map((v,j)=>v-vertices[0][j]),b=vertices[2].map((v,j)=>v-vertices[0][j]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=Math.hypot(...n);
    if(len<1e-8)return;
    return solid([...vertices.map(p=>p.map((v,j)=>v+n[j]/len*thickness/2)),...vertices.map(p=>p.map((v,j)=>v-n[j]/len*thickness/2))],m,kind,metadata,faces);
  };
  const sheet=(vertices,m,kind,metadata={})=>{
    // Exact closed triangular prisms. The earlier return's clipping plane
    // used the opposite local Z and produced reflected shards above the roof.
    const faces=[[0,1,2],[3,5,4],[0,3,4,1],[1,4,5,2],[2,5,3,0]];
    for(let k=1;k<vertices.length-1;k++){
      const tri=[vertices[0],vertices[k],vertices[k+1]];
      panel(tri,.021,m,kind,{...metadata,paneVertices:tri},faces);
    }
  };
  // The supplied oblique photograph shows a broad projecting lower volume
  // and a taller central box behind the three glass banks. Both have flat
  // tops and vertical returns; the glass does not meet the main wall plane.
  const volumes=[
    {tier:1,lo:lo-P.backingSideExtension,hi:hi+P.backingSideExtension,bottom:levels[1]+.01,top:grade+P.wingHeight,projection:P.backingProjection},
    {tier:2,lo:banks[1].lo-P.centralBackingSideExtension,hi:banks[1].hi+P.centralBackingSideExtension,bottom:grade+P.wingHeight-.02,top:Math.max(levels[3],grade+P.screenHeight+.38),projection:P.centralBackingProjection}
  ];
  portal.entranceBacking={source:src,surveyed:false,volumes:volumes.map(v=>({...v,width:v.hi-v.lo,frontStations:[v.lo,v.hi].map(u=>({u,n:wall(u)-v.projection}))}))};
  for(const v of volumes){
    const info={entranceBacking:true,entranceBackingTier:v.tier,facadeZone:'public'},front=u=>wall(u)-v.projection;
    const footprint=[F.at(v.lo,front(v.lo)),F.at(v.hi,front(v.hi)),F.at(v.hi,wall(v.hi)+.35),F.at(v.lo,wall(v.lo)+.35)];
    const slab=(top,kind)=>solid([...footprint.map(([x,z])=>[x,top,z]),...footprint.map(([x,z])=>[x,top-P.backingCapThickness,z])],M.hotel,kind,{...info,backingFootprint:footprint});
    slab(v.top,'hotel backing flat roof cap');slab(v.bottom,'hotel backing lower slab');
    const face=(a,b,bottom,top,nudge,m,kind)=>panel([at(a,front(a)+nudge,bottom),at(b,front(b)+nudge,bottom),at(b,front(b)+nudge,top),at(a,front(a)+nudge,top)],m===M.hotel?.14:.024,m,kind,info);
    const sill=v.bottom+.34,head=v.top-P.backingBandHeight;
    face(v.lo,v.hi,v.bottom,sill,0,M.hotel,'hotel backing front sill');
    face(v.lo,v.hi,head,v.top,0,M.hotel,'hotel backing front fascia');
    face(v.lo,v.hi,sill,head,.015,M.hotelMirror??M.hotelGlass,'hotel backing vertical glazing');
    const count=v.tier===2?3:Math.ceil((v.hi-v.lo)/pitch);
    for(let k=0;k<=count;k++){
      const u=v.lo+(v.hi-v.lo)*k/count;
      face(u-.028,u+.028,sill,head,-.025,M.rail,'hotel backing vertical mullion');
    }
    for(const u of [v.lo,v.hi]){
      panel([at(u,front(u),v.bottom),at(u,wall(u)+.35,v.bottom),at(u,wall(u)+.35,v.top),at(u,front(u),v.top)],.12,M.hotel,'hotel backing vertical side return',info);
    }
    if(v.tier===2)face(v.lo,v.hi,grade+P.screenHeight-.05,grade+P.screenHeight+.05,-.025,M.rail,'hotel backing central head transom');
  }
  for(const bank of banks)for(let k=0;k<=3;k++){
    const u=bank.lo+k*pitch,p=F.at(u,-bank.projection+.15),a=-Math.atan2(F.t[1],F.t[0]);
    // Faceted round aluminum column, not a square masonry pier.
    for(let face=0;face<12;face++){
      const theta=face*Math.PI/6,rad=P.columnDiameter/2,dx=Math.cos(theta)*rad,dz=Math.sin(theta)*rad;
      bb(p[0]+dx,grade+(P.canopyHeight-.2)/2,p[1]+dz,2*rad*Math.tan(Math.PI/12)+.002,P.canopyHeight-.2,.025,M.rail,L.facade,1,'hotel entrance round aluminum column',theta+Math.PI/2,src);
    }
    const q=F.at(u,-bank.projection+.13);
    bb(q[0],grade+.27,q[1],.52,.54,.52,M.dark,L.facade,1,'hotel entrance dark column foot',a,src);
    if(k<3){
      const m=bank.lo+(k+.5)*pitch,end=wall(m)-(bank.index===1?P.centralBackingProjection:P.backingProjection)-.20,start=-bank.projection+.125,p=F.at(m,(start+end)/2);
      bb(p[0],grade+P.canopyHeight-.21,p[1],pitch-.18,.075,end-start,M.rail,L.facade,1,'hotel entrance canopy underside rib',a,src);
    }
  }
  const low=grade+P.canopyHeight;
  for(const bank of banks){
    const back=u=>wall(u)-(bank.index===1?P.centralBackingProjection:P.backingProjection)-.20;
    const n0=-bank.projection+.04;
    strip(bank.lo,bank.hi,-bank.projection,grade+P.canopyHeight-P.fasciaHeight/2,P.fasciaHeight,.20,M.rail,'hotel entrance projecting fascia');
    sheet([at(bank.lo,-bank.projection+.08,low-.10),at(bank.hi,-bank.projection+.08,low-.10),at(bank.hi,back(bank.hi),low-.10),at(bank.lo,back(bank.lo),low-.10)],M.canopyGlass,'hotel canopy horizontal underside glazing',{entranceBank:bank.index});
    for(let k=0;k<3;k++){
      const a=bank.lo+k*pitch,b=a+pitch,high=bank.high,rows=bank.rows,info={entranceBank:bank.index,entranceModule:k};
      const point=(u,q)=>at(u,n0+(back(u)-n0)*q,low+(high-low)*q);
      for(let row=0;row<rows;row++)sheet([point(a+.045,row/rows),point(b-.045,row/rows),point(b-.045,(row+1)/rows),point(a+.045,(row+1)/rows)],M.canopyGlass,'hotel inclined entrance glazing',{...info,entranceRow:row});
      for(const u of [a,b])rod(at(u,n0-.02,low),at(u,back(u)-.02,high),.105,.125,M.rail,'hotel inclined entrance mullion',src);
      for(let row=0;row<=rows;row++){
        const q=row/rows;
        rod(point(a,q),point(b,q),.055,.075,M.rail,'hotel inclined entrance transom',src);
      }
      for(const u of [a+.13,b-.13])rod(at(u,n0+.12,low+.03),at(u,back(u)-.05,high),.06,.08,M.rail,'hotel inclined screen inner frame',src);
      sheet([at(a,back(a),high),at(b,back(b),high),at(b,back(b)+.14,high),at(a,back(a)+.14,high)],M.rail,'hotel screen folded rear head',{...info});
    }
    for(const u of [bank.lo,bank.hi]){
      const n1=back(u),q=F.at(u,(n0+n1)/2),angle=-Math.atan2(F.t[1],F.t[0]);
      bb(q[0],low-.26,q[1],.07,.08,n1-n0,M.rail,L.facade,1,'hotel canopy return beam',angle,src);
      rod(at(u,n0,low),at(u,n1,low),.055,.07,M.rail,'hotel entrance side horizontal frame',src);
      rod(at(u,n1,low),at(u,n1,bank.high),.055,.07,M.rail,'hotel entrance rear vertical frame',src);
      sheet([at(u,n0,low),at(u,n1,low),at(u,n1,bank.high)],M.canopyGlass,'hotel entrance triangular side glazing',{entranceBank:bank.index});
      const p=F.at(u,-bank.projection/2);
      bb(p[0],low-P.fasciaHeight/2,p[1],.20,P.fasciaHeight,bank.projection,M.rail,L.facade,1,'hotel fascia side return',angle,src);
    }
  }
  // Railings separate each entrance flight, as visible in the close view.
  // The site module supplies the shared broad platform and actual treads.
  for(let k=0;k<=P.modules;k++){
    const u=lo+k*pitch;
    const access=portal.exteriorAccess??{depth:P.projection,run:1.16,approach:grade-.54};
    rod(at(u,-access.depth,grade+.90),at(u,-access.depth-access.run,access.approach+.90),.038,.038,M.rail,'hotel entry stair handrail',src);
    rod(at(u,-.12,grade+.90),at(u,-access.depth,grade+.90),.038,.038,M.rail,'hotel entry landing handrail',src);
    for(const n of [-.2,-1.75,-access.depth+.05])rod(at(u,n,grade),at(u,n,grade+.90),.035,.035,M.rail,'hotel entry rail post',src);
    const p=F.at(u,-1.6),angle=-Math.atan2(F.t[1],F.t[0]);
    bb(p[0],grade+.23,p[1],.52,.46,.58,M.dark,L.facade,1,'hotel entrance dark planter',angle,src);
    bb(p[0],grade+.52,p[1],.38,.28,.42,M.leaves??M.dark,L.facade,1,'hotel entrance planter foliage',angle,src);
  }
}
