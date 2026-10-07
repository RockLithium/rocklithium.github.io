// South Tower roof details, in drawing coordinates (+Z north before model flip).
// User aerial photographs establish topology, not a surveyed 2001 plan.
import {polygonPieces,convexPrism} from './site-geometry.js';

export const SOUTH_ROOF_DETAIL_PROFILE=Object.freeze({
  deckAboveRoof:12*.3048,walkwayWidth:11*.3048,outerRadius:27.4,cornerCut:2.35,
  guardHeight:1.10,guardPitch:.18,windScreenHeight:1.85,
  windBayDepth:1.35,windBayWidth:4.2,securityRadius:29.65,securityHeight:1.5,
  centerCanopyWidth:8.2,centerCanopyHeight:3.45,centerFenceWidth:12.0,
  maxFixtureAboveRoof:18.29,surveyed:false,
  proportionSource:'south-roof-1975',detailSource:'south-roof-user-aerial-undated',
  planEvidence:'User photographs: raised blue loop with folded inner wind bays, opposing enclosed escalator access housings with continuous sloping roofs parallel to the tower edges, central marked canopy and mesh enclosure. Coordinates and all non-1975 dimensions are photographic estimates; photograph date and compass alignment are unverified.'
});
export const SOUTH_ROOF_DETAIL_EVIDENCE=Object.freeze({
  ...SOUTH_ROOF_DETAIL_PROFILE,
  center:'Small square marked canopy retained over service roof, with independent surrounding mesh fence; no full center viewing platform',
  equipment:'Photo-estimated edge-parallel enclosed access housings with smooth roofs running to roof level, dish mast, tall microwave array, roof anchors and peripheral rods',
  yearCaution:'User aerial dates unknown. 1975 report documents walkway rise/width; dated 1998 and 2001 pictures confirm raised loop, gable, discs, stairs and wind screens, not exact plan positions.'
});

const TAU=2*Math.PI;
const outline=(r,c)=>[[-r+c,r],[r-c,r],[r,r-c],[r,-r+c],[r-c,-r],[-r+c,-r],[-r,-r+c],[-r,r-c]];
const FACES=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
const TRI=[[0,1,2],[3,5,4],[0,3,4,1],[1,4,5,2],[2,5,3,0]];
export function southRoofConvexPanel(vertices,faces=FACES){
  const lo=[0,1,2].map(a=>Math.min(...vertices.map(v=>v[a]))),hi=[0,1,2].map(a=>Math.max(...vertices.map(v=>v[a])));
  const center=lo.map((v,i)=>(v+hi[i])/2),centroid=[0,1,2].map(a=>vertices.reduce((s,v)=>s+v[a],0)/vertices.length);
  const planes=faces.map(face=>{
    const [a,b,c]=face.map(i=>vertices[i]),ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...n);
    if(length<1e-12)throw Error('Degenerate South roof panel');
    n=n.map(v=>v/length);let d=n.reduce((s,v,i)=>s+v*a[i],0);
    if(n.reduce((s,v,i)=>s+v*centroid[i],0)>d){n=n.map(v=>-v);d=-d;}
    return[n[0],n[1],-n[2],d-n.reduce((s,v,i)=>s+v*center[i],0)];
  });
  return{center,half:lo.map((v,i)=>(hi[i]-v)/2),shape:{type:'convex',planes}};
}

// Four sides have short inward trapezoid wind pockets. Their rails and walking
// slabs share one boundary so a wind screen never hangs over an absent floor.
export function southRoofLoopPlan(profile={}){
  const P={...SOUTH_ROOF_DETAIL_PROFILE,...profile},r=P.outerRadius-P.walkwayWidth,c=P.cornerCut,w=P.windBayWidth/2;
  const inner=[];
  for(let side=0;side<4;side++){
    const a=side*Math.PI/2,s=Math.sin(a),co=Math.cos(a),point=(u,depth=0)=>[u*co+(r-depth)*s,-u*s+(r-depth)*co];
    inner.push(point(-r+c));
    const bays=side===0?[-3,9]:side===2?[-4,8]:[-16,-5,7,17];
    for(const u of bays){inner.push(point(u-w),point(u-w+.65,P.windBayDepth),point(u+w-.65,P.windBayDepth),point(u+w));}
    inner.push(point(r-c));
  }
  return{outer:outline(P.outerRadius,c),inner,profile:P};
}

export function buildSouthRoofFixtures(t,{box,rod,convex,materials:M,layers:L,halfWidth=31.5722,roofHeight=()=>0},profile={}){
  const {outer,inner,profile:P}=southRoofLoopPlan(profile),y=t.height,deck=P.deckAboveRoof,layer=L.roof,floor=110;
  const source='south-roof-user-aerial-undated';
  const b=(x,h,z,sx,sy,sz,mat,kind,angle=0,src=source)=>box(t,x,y+h,z,sx,sy,sz,mat,layer,floor,kind,angle,undefined,src);
  const r=(a,c,w,d,mat,kind,src=source)=>rod(t,[a[0],y+a[1],a[2]],[c[0],y+c[1],c[2]],w,d,mat,layer,floor,kind,undefined,src);
  const panel=(points,mat,kind,faces=FACES)=>convex(t,southRoofConvexPanel(points.map(p=>[p[0],y+p[1],p[2]]),faces),mat,layer,floor,kind,source);
  const slab=(poly,top,thickness,mat,kind,holes=[],src=source)=>{for(const piece of polygonPieces(poly,holes))convex(t,convexPrism(piece,y+top,thickness),mat,layer,floor,kind,src);};
  const tube=(x,z,lo,hi,r0,r1,mat,kind,faces=12)=>{
    const wall=Math.min(.03,r0*.3,r1*.3);
    for(let i=0;i<faces;i++){
      const a=i*TAU/faces,c=(i+1)*TAU/faces,p=(q,rad,h)=>[x+Math.sin(q)*rad,h,z+Math.cos(q)*rad];
      panel([p(a,r0,lo),p(c,r0,lo),p(c,r1,hi),p(a,r1,hi),p(a,r0-wall,lo),p(c,r0-wall,lo),p(c,r1-wall,hi),p(a,r1-wall,hi)],mat,kind);
    }
  };
  const ring=(x,z,h,rad,width,mat,kind)=>{for(let i=0;i<24;i++){const a=i*TAU/24,c=(i+1)*TAU/24;r([x+Math.sin(a)*rad,h,z+Math.cos(a)*rad],[x+Math.sin(c)*rad,h,z+Math.cos(c)*rad],width,width,mat,kind);}};
  const posts=(a,c,bottom,height,pitch,width,kind,mat=M.whiteFence)=>{
    const length=Math.hypot(c[0]-a[0],c[1]-a[1]),count=Math.ceil(length/pitch);
    for(let i=0;i<=count;i++){const q=i/count;b(a[0]+(c[0]-a[0])*q,bottom+height/2,a[1]+(c[1]-a[1])*q,width,height,width,mat,kind);}
  };
  const entries=[{x:-13,z:outer[0][1]-P.walkwayWidth,side:0},{x:13,z:-outer[0][1]+P.walkwayWidth,side:2}];
  const guard=(poly,isOuter)=>{
    for(let i=0;i<poly.length;i++){
      const a=poly[i],c=poly[(i+1)%poly.length],length=Math.hypot(c[0]-a[0],c[1]-a[1]);
      r([a[0],deck-.19,a[1]],[c[0],deck-.19,c[1]],.13,.27,M.antenna,'South walkway continuous steel edge beam');
      // Explicit guard gaps at the public access-flight landings.
      const entry=!isOuter&&Math.abs(c[1]-a[1])<1e-6&&entries.find(e=>Math.abs(e.z-a[1])<1e-6&&e.x>Math.min(a[0],c[0])+1.3&&e.x<Math.max(a[0],c[0])-1.3);
      let spans=[[a,c]];
      if(entry){const min=Math.min(a[0],c[0]),max=Math.max(a[0],c[0]);spans=[[[min,a[1]],[entry.x-1.22,a[1]]],[[entry.x+1.22,a[1]],[max,a[1]]]];}
      for(const [start,end] of spans){
        for(const h of [.08,.55,P.guardHeight])r([start[0],deck+h,start[1]],[end[0],deck+h,end[1]],.04,.045,M.whiteFence,'observation deck fence rail');
        posts(start,end,deck,P.guardHeight,P.guardPitch,.023,'observation deck fence upright');
        posts(start,end,deck,P.guardHeight,3,.07,'observation deck guard stanchion');
      }
      const bays=Math.max(1,Math.ceil(length/4.7));
      for(let k=0;k<=bays;k++){
        const q=k/bays,x=a[0]+(c[0]-a[0])*q,z=a[1]+(c[1]-a[1])*q;
        b(x,(deck-.11)/2,z,.15,deck-.11,.15,M.antenna,'South walkway steel support column');
        b(x,.045,z,.4,.09,.4,M.antenna,'South walkway column baseplate');
        if(k<bays){const q2=(k+1)/bays;r([x,.18,z],[a[0]+(c[0]-a[0])*q2,deck-.24,a[1]+(c[1]-a[1])*q2],.055,.07,M.antenna,'South walkway support diagonal');}
      }
      // The inward folded panels are the photographed V-like wind pockets.
      if(!isOuter&&length<4&&Math.abs(a[0])<25&&Math.abs(a[1])<25){
        const angle=Math.atan2(c[0]-a[0],c[1]-a[1])-Math.PI/2,mid=[(a[0]+c[0])/2,(a[1]+c[1])/2];
        b(mid[0],deck+P.windScreenHeight/2,mid[1],length,P.windScreenHeight,.012,M.clearWindGlass,'South folded transparent wind bay',angle);
        for(const h of [P.windScreenHeight,.03])r([a[0],deck+h,a[1]],[c[0],deck+h,c[1]],.065,.065,M.whiteFence,'South wind bay frame rail');
        for(const p of [a,c]){b(p[0],deck+P.windScreenHeight/2,p[1],.07,P.windScreenHeight,.07,M.whiteFence,'South wind bay frame post');}
      }
    }
  };
  slab(outer,deck,.11,M.observationDeck,'South elevated perimeter observation walkway',[inner],'south-roof-1975');
  guard(outer,true);guard(inner,false);

  // Roof-edge security rail is an independent low enclosure outside the deck.
  const security=outline(Math.min(P.securityRadius,halfWidth-1.2),2.3);
  for(let i=0;i<8;i++){
    const a=security[i],c=security[(i+1)%8];
    posts(a,c,.08,P.securityHeight,.18,.024,'South lower perimeter security fence');
    for(const h of [.15,.75,P.securityHeight+.08])r([a[0],h,a[1]],[c[0],h,c[1]],.035,.035,M.whiteFence,'South lower security fence rail');
  }

  // Asymmetric gabled escalator enclosures. The short high-end pitch is
  // essential: the photograph shows a real gable, not a single wedge. The
  // other pitch continues down the whole flight to the roof. Ridge runs
  // ACROSS the enclosure, while its long direction follows the tower edge.
  for(const [i,entry] of entries.entries()){
    const sign=i===0?1:-1,z=entry.z-sign*2.05,width=3.65;
    const ridge=entry.x,lowX=ridge-sign*10.8,endX=ridge+sign*2.05;
    const low=.08,high=deck+2.65,eave=deck+1.75;
    const p=(x,u,h)=>[x,h,z+u];
    const roof=(x0,h0,x1,h1,kind)=>{
      const top=[p(x0,-width/2,h0),p(x0,width/2,h0),p(x1,width/2,h1),p(x1,-width/2,h1)];
      panel([...top,...top.map(v=>[v[0],v[1]-.065,v[2]])],M.mastWhite,kind);
    };
    roof(lowX,low,ridge,high,'South continuous inclined access roof');
    roof(ridge,high,endX,eave,'South access short gable roof pitch');
    const roofH=x=>((x-ridge)*sign<=0?low+(high-low)*(x-lowX)/(ridge-lowX):high+(eave-high)*(x-ridge)/(endX-ridge))-.03;
    for(const side of [-1,1]){
      const outer=z+side*(width/2-.015),back=outer-side*.08;
      const wall=(a,c,bottom=.028,kind='South access housing closed side')=>{
        if(Math.abs(c-a)<1e-5)return;
        const front=[[a,bottom,outer],[c,bottom,outer],[c,roofH(c),outer],[a,roofH(a),outer]];
        panel([...front,...front.map(v=>[v[0],v[1],back])],M.weatherRoof,kind);
      };
      const a=entry.x-.6,c=entry.x+.6;
      for(const [x0,x1] of [[lowX,ridge],[ridge,endX]]){
        const loX=Math.min(x0,x1),hiX=Math.max(x0,x1);
        if(side===sign&&hiX>a&&loX<c){
          wall(loX,Math.max(loX,a));wall(Math.min(hiX,c),hiX);
          wall(Math.max(loX,a),Math.min(hiX,c),deck+2.04,'South access doorway sloped header');
        }else wall(loX,hiX);
      }
      if(side===sign)for(const x of [a,c])b(x,deck+1.02,outer,.06,2.04,.08,M.whiteFence,'South access doorway jamb');
    }
    for(const [x,h] of [[lowX,low],[endX,eave]]){
      const a=[[x,.028,z-width/2],[x,.028,z+width/2],[x,h,z+width/2],[x,h,z-width/2]];
      panel([...a,...a.map(v=>[v[0]+.07*sign,v[1],v[2]])],M.weatherRoof,'South access housing end wall');
    }
    b(entry.x,deck-.055,entry.z-sign*.45,2.15,.11,1.35,M.observationDeck,'South access upper landing');
  }

  // Clearly visible central square canopy/target, NOT a public center platform.
  const cw=P.centerCanopyWidth,fh=P.centerCanopyHeight,fw=P.centerFenceWidth;
  b(0,fh-.055,0,cw,.11,cw,M.mastWhite,'South central marked canopy');
  for(const sx of [-1,1])for(const sz of [-1,1]){
    b(sx*(cw/2-.12),(fh-.11)/2,sz*(cw/2-.12),.13,fh-.11,.13,M.antenna,'South central canopy steel post');
    b(sx*(cw/2-.12),.05,sz*(cw/2-.12),.42,.1,.42,M.antenna,'South central canopy baseplate');
  }
  // Ring marking approximates the low-resolution photographed target; no
  // invented text or claim that the surface is a certified helicopter pad.
  ring(0,0,fh+.008,2.05,.10,(M.roofMark??M.mastWhite),'South canopy circular roof marking');
  ring(0,0,fh+.01,.83,.06,(M.roofMark??M.mastWhite),'South canopy inner roof marking');
  b(0,fh+.015,0,.62,.018,.13,(M.roofMark??M.mastWhite),'South canopy center roof marking');
  for(let i=0;i<4;i++){
    const a=[[-fw/2,fw/2],[fw/2,fw/2],[fw/2,-fw/2],[-fw/2,-fw/2]][i],c=[[-fw/2,fw/2],[fw/2,fw/2],[fw/2,-fw/2],[-fw/2,-fw/2]][(i+1)%4];
    // Opening at north face midpoint to keep the service enclosure accessible.
    const spans=i===0?[[a,[-.75,fw/2]],[[.75,fw/2],c]]:[[a,c]];
    for(const [aa,cc] of spans){
      posts(aa,cc,.07,fh+.65,.48,.015,'South center service mesh vertical',M.antenna);
      posts(aa,cc,.07,fh+.65,3,.06,'South center service fence post',M.antenna);
      for(let h=.08;h<fh+.7;h+=.45)r([aa[0],h,aa[1]],[cc[0],h,cc[1]],.012,.012,M.antenna,'South center service mesh horizontal');
      r([aa[0],fh+.72,aa[1]],[cc[0],fh+.72,cc[1]],.05,.05,M.antenna,'South center service fence top rail');
    }
  }

  // Two distinct microwave assemblies visible on opposite sides in user view.
  const dish=(x,h,z,angle,radius,mat)=>{
    const n=[Math.sin(angle),Math.cos(angle)],tan=[Math.cos(angle),-Math.sin(angle)],depth=.28;
    const p=(a,d,rad=radius)=>[x+tan[0]*Math.sin(a)*rad+n[0]*d,h+Math.cos(a)*rad,z+tan[1]*Math.sin(a)*rad+n[1]*d];
    for(let i=0;i<24;i++){
      const a=i*TAU/24,c=(i+1)*TAU/24;
      panel([p(0,depth/2,0),p(a,depth/2),p(c,depth/2),p(0,-depth/2,0),p(a,-depth/2),p(c,-depth/2)],mat,'South microwave circular dish',TRI);
    }
  };
  const mast=(x,z,height,radius,kind)=>{
    const point=(i,h)=>{const a=i*TAU/3,rad=radius*(1-.24*h/height);return[x+Math.sin(a)*rad,h,z+Math.cos(a)*rad];};
    for(let i=0;i<3;i++){
      r(point(i,.08),point(i,height),.08,.08,M.antenna,kind+' leg');
      for(let h=.1;h<height-.5;h+=1.6){const hi=Math.min(height,h+1.6);r(point(i,h),point((i+1)%3,hi),.042,.042,M.antenna,kind+' diagonal');r(point(i,hi),point((i+1)%3,hi),.035,.035,M.antenna,kind+' tie');}
      const foot=point(i,.08);b(foot[0],.045,foot[2],.45,.09,.45,M.antenna,kind+' foot');
    }
  };
  mast(-12,17,9.5,1.18,'South access-side microwave mast');
  dish(-12,8.0,18.15,0,1.45,M.radioDishPink??M.mastWhite);
  r([-12,8,17],[-12,8,18.15],.12,.12,M.antenna,'South access-side dish bracket');
  mast(17,-1,16.5,1.38,'South tall microwave array');
  for(const h of [7,10,13.5]){
    const w=h===13.5?4.3:3.3;
    r([17-w,h,-1],[17+w,h,-1],.08,.08,M.antenna,'South microwave array horizontal crossarm');
    for(const x of [17-w,17-w/2,17,17+w/2,17+w])r([x,h-1,-1],[x,h+1,-1],.035,.035,M.antenna,'South microwave array vertical element');
    for(const sign of [-1,1]){r([17,h+1.1,-1],[17+sign*w,h,-1],.04,.04,M.antenna,'South microwave array angled element');}
  }
  tube(17,-1,16.5,18.29,.07,.045,M.antenna,'South microwave array terminal rod');
  for(const [x,z,h] of [[-17,-18,8],[-18,10,5],[19,15,3],[-4,17,4.8]]){const g=roofHeight(x,z);tube(x,z,g+.08,h,.055,.035,M.antenna,'South independent auxiliary aerial');b(x,g+.06,z,.34,.1,.34,M.antenna,'South aerial foot');}

  // Thin center service rods/flashing repeat across roof, without obstructing
  // stair flights, central canopy enclosure, or the continuous viewing loop.
  for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){
    const x=i*5.3,z=j*5.3;if(Math.abs(x)<7&&Math.abs(z)<7||x<-8&&z>10||x>9&&z<-9||Math.hypot(x-17,z+1)<2)continue;
    const g=roofHeight(x,z);
    b(x,g+.045,z,.38,.07,.38,M.antenna,'South weather roof anchor flashing');
    b(x,g+.32,z,.06,.50,.06,M.antenna,'South short weather roof anchor');
  }
  for(const [x,z] of [[-11,5],[9,7]]){b(x,roofHeight(x,z)+.30,z,.65,.52,.65,M.antenna,'South low roof vent');}
  // Dated 2001 pipe cluster remains compact and off the central marked canopy.
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){const x=-17+i*.62,z=2+j*.62,g=roofHeight(x,z);tube(x,z,g+.07,g+1.7,.16,.16,M.antenna,'South central ventilation pipe');}
  for(let side=0;side<4;side++)for(const u of [-18,0,18]){
    const a=side*Math.PI/2,s=Math.sin(a),co=Math.cos(a),x=u*co+26.65*s,z=-u*s+26.65*co;
    tube(x,z,deck,deck+1.17,.06,.06,M.antenna,'South telescope pedestal');
    b(x,deck+1.24,z,.53,.18,.3,M.antenna,'South observation binocular viewer',a,'south-roof-1998');
  }
  for(const [x,z] of [[-15,25.8],[7,25.8],[-8,-25.8],[22,10],[-25.8,-9]]){
    b(x,deck+.31,z,1.7,.5,.46,M.observationDeck,'South observation rectangular bench',Math.abs(x)>24?Math.PI/2:0,'south-roof-1998');
  }
  for(const [x,z] of [[-23,23],[23,23],[23,-23],[-23,-23],[-5,24.05],[0,-24.05]]){
    b(x,deck+.7,z,.07,1.4,.07,M.whiteFence,'South beacon support');b(x,deck+1.45,z,.12,.16,.12,M.beacon,'South roof red safety light');
  }
}
