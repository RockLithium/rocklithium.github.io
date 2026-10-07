// Mast reconstruction from the supplied close photographs and dated 1998/
// January 2001 originals. Attachment dimensions/positions are photo estimates.
export const ANTENNA_PROFILE=Object.freeze({
  height:109.728,source:'north-mast-2001',heightSource:'north-mast-museum',surveyed:false,
  bands:Object.freeze([
    {key:'base',bottom:0,top:7.1},
    {key:'lowerWhiteMast',bottom:7.1,top:41},
    {key:'whiteConnector',bottom:41,top:61.6},
    {key:'upperCage',bottom:61.6,top:83.1},
    {key:'upperWhiteSleeve',bottom:83.1,top:102.4},
    {key:'terminalWhip',bottom:102.4,top:109.728}
  ]),
  attachmentBands:[{bottom:23.5,top:41,kind:'opposing DTV panel racks over continuous white shaft'}],
  silhouetteEvidence:'1998, January 2001 and supplied close photographs: four flared corner ribs around a quadrilateral base, white main shaft behind lower equipment, upper thin butterfly panel arrays around a dark cylindrical spine, not a four-post lattice tower. Band heights and widths are estimates.',
  radiusEvidence:'Photo estimate; recovered damaged-fragment dimensions are not a mast diameter',
  broadcastingEvidence:'Doug Lung firsthand account of opposite-side DTV panels, more panels on primary population side; exact channel/azimuth not assigned'
});
const TAU=2*Math.PI;
const outline=(r,c)=>[[-r+c,r],[r-c,r],[r,r-c],[r,-r+c],[r-c,-r],[-r+c,-r],[-r,-r+c],[-r,r-c]];
const TRI=[[0,1,2],[3,5,4],[0,3,4,1],[1,4,5,2],[2,5,3,0]];
export function buildNorthMast({b,r,slab,tube,ring,disk,panel,M}){
  b(0,1.20,0,9.4,.20,9.4,M.concrete,'antenna base plinth');
  // Four-sided folded skirt and four separately readable flared corner ribs.
  // The former rotationally symmetric frustum hid the real quadrilateral base.
  const levels=[[1.3,3.42],[2.6,3.42],[4.05,2.65],[6.15,1.68],[7.1,1.13]];
  for(let k=0;k<levels.length-1;k++){
    const [lo,a]=levels[k],[hi,c]=levels[k+1];
    for(let face=0;face<4;face++){
      const theta=face*Math.PI/2,rot=([x,h,z])=>[x*Math.cos(theta)+z*Math.sin(theta),h,-x*Math.sin(theta)+z*Math.cos(theta)];
      const front=[[-a,lo,a],[a,lo,a],[c,hi,c],[-c,hi,c]],back=front.map(([x,h,z])=>[x,h,z-.075]);
      panel([...front,...back].map(rot),M.mastWhite,'antenna quadrilateral folded base skin');
    }
    for(const sx of [-1,1])for(const sz of [-1,1]){
      r([sx*a,lo,sz*a],[sx*c,hi,sz*c],.24,.28,M.mastWhite,'antenna four flared base corner ribs');
    }
  }
  // The lower panel racks are attachments, not a replacement for this skin.
  for(const [lo,hi,a,c] of [[6.1,7.1,1.45,1.45],[7.1,24.5,1.45,1.32],[24.5,41,1.32,1.14],[41,52,1.14,.95],[52,61.6,.95,.83],[83.1,98.5,1.02,.65],[98.5,102.4,.65,.53]])
    tube(0,0,lo,hi,a,c,.055,M.mastWhite,lo>=83.1?'antenna upper white radome':lo<7.1?'antenna flared white base':'antenna enclosed white shaft',24);
  for(const sx of [-1,1])for(const sz of [-1,1])r([sx*1.05,7.1,sz*1.05],[sx*.97,23.5,sz*.97],.12,.15,M.mastWhite,'antenna base ribs extended along shaft');
  tube(0,0,61.6,83.1,.49,.44,.045,M.broadcastSteel,'antenna exposed transmitter spine',16);
  tube(0,0,102.4,109.728,.105,.065,.025,M.broadcastSteel,'antenna terminal whip',12);
  const poly=radius=>Array.from({length:24},(_,i)=>[Math.sin(i*TAU/24)*radius,Math.cos(i*TAU/24)*radius]);
  for(const [h,outer,inner,mat] of [[41,1.16,1.075,M.mastWhite],[52,.97,.885,M.mastWhite],[61.6,.86,.415,M.broadcastSteel],[83.1,1.05,.385,M.broadcastSteel]])
    slab(poly(outer),h+.06,.12,mat,'antenna diameter transition shoulder',[poly(inner)]);
  for(let h=8;h<61;h+=2.6){const rad=h<24.5?1.45+(1.32-1.45)*(h-7.1)/17.4:h<41?1.32+(1.14-1.32)*(h-24.5)/16.5:h<52?1.14+(.95-1.14)*(h-41)/11:.95+(.83-.95)*(h-52)/9.6;ring(0,0,h,rad+.006,.023,M.mastWhite,'antenna white shaft flange seam');}
  for(let h=84;h<102;h+=2.15){const rad=h<98.5?1.02+(.65-1.02)*(h-83.1)/15.4:.65+(.53-.65)*(h-98.5)/3.9;ring(0,0,h,rad+.01,.023,M.mastWhite,'antenna white radome flange seam');}

  // Rectangular service galleries, with square openings around the flared
  // base and visible posts/brackets. Upper gallery retains a round shaft hole.
  for(const [h,rad,hole] of [[2.0,6.20,3.5],[4.05,5.75,2.70],[6.95,3.15,1.5]]){
    const plan=[[-rad,rad],[rad,rad],[rad,-rad],[-rad,-rad]],opening=h<6?[[-hole,hole],[hole,hole],[hole,-hole],[-hole,-hole]]:poly(hole);
    slab(plan,h,.085,M.antenna,'antenna rectangular maintenance gallery',[opening]);
    for(let i=0;i<4;i++){
      const a=plan[i],c=plan[(i+1)%4],len=Math.hypot(c[0]-a[0],c[1]-a[1]),count=Math.ceil(len/1.2);
      for(const [y,w] of [[h+1.02,.045],[h+.49,.025],[h-.07,.12]])r([a[0],y,a[1]],[c[0],y,c[1]],w,w,M.antenna,'antenna gallery edge beam and rail');
      for(let j=0;j<count;j++){
        const q=j/count,x=a[0]+(c[0]-a[0])*q,z=a[1]+(c[1]-a[1])*q;
        r([x,h,z],[x,h+1.02,z],.04,.04,M.antenna,'antenna gallery post');
        const d=Math.hypot(x,z);r([x*hole/d,h-.7,z*hole/d],[x,h-.08,z],.06,.09,M.antenna,'antenna gallery radial brace');
      }
    }
  }
  // Sloping roof walks approach the broad equipment galleries. Guard posts
  // follow the ramp surface; no isolated short staircase on a flat roof.
  for(const side of [-1,1]){
    const x0=side*20,x1=side*6.2,z=side*2.8,y0=.10,y1=2.0,width=1.65;
    const top=[[x0,y0,z-width/2],[x0,y0,z+width/2],[x1,y1,z+width/2],[x1,y1,z-width/2]];
    panel([...top,...top.map(v=>[v[0],v[1]-.10,v[2]])],M.weatherRoof,'antenna equipment gallery roof ramp');
    for(const dz of [-width/2,width/2]){
      for(const h of [.08,.53,1.03])r([x0,y0+h,z+dz],[x1,y1+h,z+dz],.04,.04,M.antenna,'antenna approach ramp guard rail');
      for(let k=0;k<=10;k++){
        const q=k/10,x=x0+(x1-x0)*q,h=y0+(y1-y0)*q;
        r([x,h,z+dz],[x,h+1.03,z+dz],.04,.04,M.antenna,'antenna approach ramp guard post');
      }
    }
  }
  // Equipment is distributed around the square galleries, leaving the four
  // flared mast ribs readable. This is not a decorative tapered pedestal.
  for(let face=0;face<4;face++){
    const a=face*Math.PI/2,point=(u,h,d)=>[u*Math.cos(a)+d*Math.sin(a),h,-u*Math.sin(a)+d*Math.cos(a)];
    for(const [level,rad] of [[2.0,4.75],[4.05,4.40]])for(const u of [-3.2,-1.2,1.2,3.2]){
      const p=point(u,level+.48,rad);
      b(...p,.72,.96,.72,M.mastWhite,'antenna square gallery receiver cabinet');
      r(point(u,level-.8,rad),point(u,level,rad),.10,.10,M.antenna,'antenna equipment platform upright');
    }
  }

  // RCA-style butterfly panels attach radially to the cylindrical spine.
  // BME August 1979's Rosner diagram identifies the exposed 9/13 section as
  // diplexed butterfly; RCA Broadcast News 138 shows its thin reflector screen
  // and projecting split wings. Dimensions/bay count follow the photographs.
  // No full-height corner legs or generic X-braced square tower is generated.
  const lo=61.6,hi=83.1,bays=8,pitch=(hi-lo)/bays;
  for(let face=0;face<4;face++){
    const a=face*Math.PI/2,point=(u,h,d=.69)=>[u*Math.cos(a)+d*Math.sin(a),h,-u*Math.sin(a)+d*Math.cos(a)];
    for(let k=0;k<bays;k++){
      const y0=lo+k*pitch+.035,y1=lo+(k+1)*pitch-.035,h=(y0+y1)/2,w=.86;
      for(const u of [-w,w])r(point(u,y0),point(u,y1),.033,.033,M.broadcastSteel,'antenna butterfly reflector side');
      for(const y of [y0,y1])r(point(-w,y),point(w,y),.032,.032,M.broadcastSteel,'antenna butterfly reflector crossbar');
      // Thin reflector wires form the screen behind the separate radiators.
      for(let j=-5;j<=5;j++)r(point(j*w/5,y0),point(j*w/5,y1),.012,.012,M.broadcastSteel,'antenna butterfly reflector screen');
      for(const y of [h-.55,h+.55])r(point(-w,y),point(w,y),.012,.012,M.broadcastSteel,'antenna butterfly screen tie');
      for(const side of [-1,1]){
        const feed=point(side*.06,h,1.02),wingTop=point(side*.72,h+.82,1.02),wingBottom=point(side*.72,h-.82,1.02);
        r(feed,wingTop,.04,.04,M.antenna,'antenna butterfly projecting radiator');
        r(feed,wingBottom,.04,.04,M.antenna,'antenna butterfly projecting radiator');
        r(wingTop,wingBottom,.028,.028,M.antenna,'antenna butterfly wing outer strap');
        r(point(side*.06,y0,.78),point(side*.06,y1,.78),.025,.025,M.antenna,'antenna butterfly feed riser');
      }
      for(const y of [y0,y1])r(point(0,y,.45),point(0,y,.69),.05,.05,M.antenna,'antenna butterfly radial bracket');
    }
  }
  // Opposing DTV panel arrays over the intact white tube. Primary-side width
  // follows the firsthand broadcast account; azimuth and panel sizes estimated.
  for(const side of [-1,1]){
    const cols=side===1?[-.65,0,.65]:[0],z=side*1.51;
    for(const x of [-.94,.94])r([x,23.5,z],[x,41,z],.055,.065,M.broadcastSteel,'antenna lower DTV rack upright');
    for(let h=23.5;h<=41;h+=3.5)r([-.94,h,z],[.94,h,z],.045,.055,M.broadcastSteel,'antenna lower DTV rack crossmember');
    for(const x of cols)for(const h of [25.5,28,30.5,33,35.5,38]){
      b(x,h,z+side*.11,.37,1.6,.20,M.mastWhite,'antenna lower DTV panel face');
      r([x,h,side*1.05],[x,h,z],.065,.065,M.antenna,'antenna DTV panel bracket');
    }
    for(const h of [24,29.5,35,40.5])r([0,h,side*.93],[0,h,z],.07,.07,M.antenna,'antenna lower DTV rack attachment');
  }
  // Exposed ladder and feeder conduits visible on the lower white mast.
  for(const x of [-.22,.22])r([x,7.2,-1.48],[x,52,-1.15],.04,.04,M.broadcastSteel,'antenna shaft ladder stile');
  for(let h=7.3;h<52;h+=.34){const z=-1.48+.33*(h-7.2)/44.8;r([-.22,h,z],[.22,h,z],.029,.029,M.broadcastSteel,'antenna shaft ladder rung');}
  for(const x of [.47,.57,.67])r([x,7.5,-1.4],[x,51.8,-1.18],.027,.027,M.broadcastSteel,'antenna shaft feeder conduit');
  for(const sign of [-1,1])for(const h of [20,23,26,29,32]){
    const x=sign*1.61;b(x,h,0,.22,.20,.36,M.mastWhite,'antenna lower radio attachment');
    ring(x,0,h,.24,.043,M.antenna,'antenna lower radio circular element',12);
    r([sign*1.22,h,0],[x,h,0],.06,.06,M.antenna,'antenna radio attachment bracket');
  }
  // Near-vertical RF dishes at the base, each genuinely circular in its plane.
  const dish=(x,h,z,angle,radius)=>{
    const n=[Math.sin(angle),Math.cos(angle)],tan=[Math.cos(angle),-Math.sin(angle)],p=(a,d,rad=radius)=>[x+tan[0]*Math.sin(a)*rad+n[0]*d,h+Math.cos(a)*rad,z+tan[1]*Math.sin(a)*rad+n[1]*d];
    for(let i=0;i<24;i++){const a=i*TAU/24,c=(i+1)*TAU/24;panel([p(0,.08,0),p(a,.08),p(c,.08),p(0,-.08,0),p(a,-.08),p(c,-.08)],M.mastWhite,'antenna base circular microwave dish',TRI);}
    // Deep backed receiver/horn housing, rather than a ring of flat plates.
    for(let i=0;i<16;i++){
      const a=i*TAU/16,c=(i+1)*TAU/16,outer=[p(a,-.07),p(c,-.07),p(c,-.64,radius*.76),p(a,-.64,radius*.76)],inner=outer.map(v=>v.map((value,j)=>value-(j===0?n[0]*.025:j===2?n[1]*.025:0)));
      panel([...outer,...inner],M.mastWhite,'antenna microwave receiver tapered housing');
    }
    b(x,h-radius-.5,z,.09,1.1,.09,M.antenna,'antenna base dish support');
    r([0,h,0],[x,h,z],.075,.095,M.antenna,'antenna base dish bracket');
  };
  // Three equipment levels are evident in the base photograph. Individual
  // count/azimuth changed over time; these positions follow the supplied view.
  for(let face=0;face<4;face++){
    const angle=face*Math.PI/2;
    for(const [h,d,count,rad] of [[2.85,5.18,3,.60],[4.95,4.85,3,.57],[7.75,2.65,2,.48]])for(let k=0;k<count;k++){
      const u=(k-(count-1)/2)*1.80;
      dish(u*Math.cos(angle)+d*Math.sin(angle),h,-u*Math.sin(angle)+d*Math.cos(angle),angle,rad);
    }
  }
  for(let i=0;i<4;i++){const a=i*TAU/4,s=Math.sin(a),c=Math.cos(a);r([s*1.52,61.7,c*1.52],[s*23,.15,c*23],.012,.012,M.antenna,'antenna thin stay cable');}
  for(const h of [2.15,4.37,7.55,40.6,61.7,83.2])b(1.9,h,0,.15,.22,.15,M.beacon,'antenna warning beacon');
  const aerials=[[-24,-22,3.2],[-18,-26,2.6],[-11,-27,3],[-5,-27,1.9],[9,-27,2.5],[15,-26,3.5],[24,-24,2.6],[27,-15,2.9],[27,-5,2.2],[26,7,4],[27,17,2.6],[22,26,2.8],[10,27,2.1],[2,27,3.4],[-9,27,2.7],[-19,26,3.3],[-27,15,2.9],[-27,3,3.3],[-26,-10,3],[-17,-5,17.4],[18,-9,13.2],[13,12,8.3]];
  for(const [x,z,h] of aerials){
    const footHeight=Math.max(Math.abs(x),Math.abs(z))<20?.45:.1;
    b(x,footHeight+.085,z,.42,.11,.42,M.antenna,'auxiliary aerial roof foot');tube(x,z,.14,h,.055,.034,.013,M.antenna,'slender auxiliary roof aerial',8);
    if(h>10){tube(x,z,h*.55,h*.55+1.25,.22,.19,.03,M.mastWhite,'auxiliary aerial pale sleeve',12);for(const sign of [-1,1])r([x+sign*.8,.12,z],[x,h*.2,z],.02,.02,M.antenna,'auxiliary aerial short brace');}
  }
  for(const [x,z] of [[-10,13],[8,-14]])b(x,.11,z,1.1,.16,1.35,M.antenna,'small North roof access hatch');
}
