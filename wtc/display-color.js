// The creative HDR shoulder is the one used by ../raytracing.html.
// Return linear scRGB, keeping values above SDR white for HDR/JPEG XR.
export function hdrChannel(value) {
  const x=Math.max(0,value)*1.8;
  const boosted=x+Math.max(x-.6,0)*.5;
  const signal=Math.pow(Math.max(0,boosted<=1/12?Math.sqrt(3*boosted):.17883277*Math.log(Math.max(12*boosted-.28466892,1e-6))+.55991073),1.8);
  return signal<=.04045?signal/12.92:Math.pow((signal+.055)/1.055,2.4);
}
const fit=x=>(x*(x+.0245786)-.000090537)/(x*(.983729*(x+.432951))+.238081);
const encode=x=>x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055;
export function writeDisplayPixel(r,g,b,out,offset,exposure=1,hdr=false) {
  if(hdr){out[offset]=hdrChannel(r*exposure);out[offset+1]=hdrChannel(g*exposure);out[offset+2]=hdrChannel(b*exposure);out[offset+3]=1;return;}
  r*=exposure/.6;g*=exposure/.6;b*=exposure/.6;
  const x=fit(.59719*r+.35458*g+.04823*b),y=fit(.076*r+.90834*g+.01566*b),z=fit(.0284*r+.13383*g+.83777*b);
  const toByte=v=>Math.round(encode(Math.max(0,Math.min(1,v)))*255);
  out[offset]=toByte(1.60475*x-.53108*y-.07367*z);
  out[offset+1]=toByte(-.10208*x+1.10813*y-.00605*z);
  out[offset+2]=toByte(-.00327*x-.07276*y+1.07602*z);out[offset+3]=255;
}
export function pngDimensions(bytes) {
  if(bytes.length<24||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error('Export did not produce PNG data');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {width:v.getUint32(16),height:v.getUint32(20)};
}
export function jxrDimensions(bytes) {
  if(bytes.length<10||bytes[0]!==73||bytes[1]!==73||bytes[2]!==188||bytes[3]!==1)throw Error('Export did not produce JPEG XR data');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),directory=view.getUint32(4,true);
  if(directory+2>bytes.length)throw Error('Invalid JPEG XR directory');
  const count=view.getUint16(directory,true);let width,height;
  for(let i=0;i<count;i++){
    const offset=directory+2+i*12;if(offset+12>bytes.length)throw Error('Truncated JPEG XR directory');
    const tag=view.getUint16(offset,true);
    if((tag===0xbc80||tag===0xbc81)&&view.getUint16(offset+2,true)===4&&view.getUint32(offset+4,true)===1){
      const value=view.getUint32(offset+8,true);if(tag===0xbc80)width=value;else height=value;
    }
  }
  if(!width||!height)throw Error('Missing JPEG XR image dimensions');return {width,height};
}
