// Deterministic periodic 3D density, generated once for the cached cloud sky.
export function createCloudVolume(size=64) {
  const hash=(x,y,z,n)=>{
    x=((x%n)+n)%n;y=((y%n)+n)%n;z=((z%n)+n)%n;
    let h=Math.imul(x+1777,1597334677)^Math.imul(y+7919,3812015801)^Math.imul(z+3571,1103515245)^n;
    h=Math.imul(h^(h>>>16),2246822519);h=Math.imul(h^(h>>>13),3266489917);
    return ((h^(h>>>16))>>>0)/4294967295;
  };
  const ease=t=>t*t*(3-2*t);
  const noise=(x,y,z,n)=>{
    x*=n;y*=n;z*=n;const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),a=ease(x-ix),b=ease(y-iy),c=ease(z-iz);
    let value=0;
    for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)value+=hash(ix+dx,iy+dy,iz+dz,n)*(dx?a:1-a)*(dy?b:1-b)*(dz?c:1-c);
    return value;
  };
  const data=new Uint8Array(size**3);
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size,w=z/size;
    const a=noise(u,v,w,4),b=noise(u+.17,v+.31,w+.23,8),c=noise(u+.41,v+.11,w+.47,16),d=noise(u,v,w,32);
    data[(z*size+y)*size+x]=Math.round((a*.45+b*.26+c*.17+d*.12)*255);
  }
  return data;
}

export function celestialState(minutes) {
  const phase=minutes/1440*2*Math.PI,angle=phase-Math.PI,latitude=40.711*Math.PI/180;
  const sun=[-Math.sin(angle),Math.cos(angle)*Math.cos(latitude),Math.cos(angle)*Math.sin(latitude)];
  const altitude=sun[1],day=Math.max(0,altitude),moon=Math.max(0,-altitude);
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  // Astronomical night has no sunset tint. Twilight reaches only the horizon
  // around the rising/setting sun and fades entirely below -13 degrees.
  const twilight=smooth(-.225,-.035,altitude)*(1-smooth(.055,.3,altitude));
  return {phase,sun,twilight,
    sunPower:9*Math.exp(-.11/Math.max(day,.01))*Math.max(0,Math.min(1,(altitude+.015)/.05)),
    moonPower:.025*Math.exp(-.08/Math.max(moon,.01)),
    sunColor:[1,.72+.27*Math.min(1,day*4),.4+.58*Math.min(1,day*4)],
    night:1-smooth(-.15,.04,altitude),
  };
}
