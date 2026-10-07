import {pngDimensions,jxrDimensions} from './display-color.js';
export async function encodeSnapshot({pixels,width,height,hdr}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Invalid screenshot dimensions');
  if(pixels.length!==width*height*4)throw Error('Screenshot pixel dimensions do not match render dimensions');
  if(hdr){
    if(!(pixels instanceof Float32Array))throw TypeError('HDR screenshots require linear Float32 RGBA pixels');
    // A view can cover only part of its backing buffer. Transfer exactly this
    // frame rather than passing surrounding pixels to the worker.
    const buffer=pixels.byteOffset===0&&pixels.byteLength===pixels.buffer.byteLength?pixels.buffer:pixels.buffer.slice(pixels.byteOffset,pixels.byteOffset+pixels.byteLength);
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./export-jxr-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{
        worker.terminate();
        try{if(data.error)throw Error(data.error);const actual=jxrDimensions(new Uint8Array(data.buffer));if(actual.width!==width||actual.height!==height)throw Error('JPEG XR export dimensions changed');resolve(new Blob([data.buffer],{type:'image/vnd.ms-photo'}));}catch(error){reject(error);}
      };
      worker.onerror=e=>{worker.terminate();reject(Error(e.message));};
      worker.postMessage({width,height,pixels:buffer},[buffer]);
    });
  }
  const output=new OffscreenCanvas(width,height),ctx=output.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer,pixels.byteOffset,pixels.byteLength),width,height),0,0);
  const blob=await output.convertToBlob({type:'image/png'}),bytes=new Uint8Array(await blob.arrayBuffer()),actual=pngDimensions(bytes);
  if(actual.width!==width||actual.height!==height)throw Error('PNG export dimensions changed');
  return blob;
}
