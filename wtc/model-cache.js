// Packed CPU scene persistence. The renderer receives the same typed arrays
// on cold and warm loads; no GPU resource or raw primitive objects are cached.
export const SCENE_CACHE_VERSION=2;
export const SCENE_CACHE_DATABASE='wtc-packed-scene';
export const SCENE_CACHE_STORE='scenes';
const keyFor=fingerprint=>`v${SCENE_CACHE_VERSION}:${fingerprint}`;
const CACHE_CHUNK_BYTES=32*1024*1024;
const chunkKey=(key,buffer,chunk)=>`${key}:buffer:${buffer}:chunk:${chunk}`;
const errorText=error=>error?`${error.name || 'Error'}: ${error.message || error}`:'IndexedDB operation failed';

// A full scene exceeds Chromium's practical single-record serialization limit.
// Keep the manifest small and store array buffers in bounded records instead.
function encodeScene(scene){
  const buffers=[],indices=new Map(),seen=new WeakMap();
  const indexFor=buffer=>{if(!indices.has(buffer)){indices.set(buffer,buffers.length);buffers.push(buffer);}return indices.get(buffer);};
  const encode=value=>{
    if(!value||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(value instanceof ArrayBuffer)return {__wtcSceneView:'ArrayBuffer',buffer:indexFor(value)};
    if(ArrayBuffer.isView(value))return {__wtcSceneView:value.constructor.name,buffer:indexFor(value.buffer),byteOffset:value.byteOffset,length:value.length};
    const result=Array.isArray(value)?[]:{};seen.set(value,result);
    for(const [key,child] of Object.entries(value))result[key]=encode(child);
    return result;
  };
  return {scene:encode(scene),buffers};
}
function decodeScene(scene,buffers){
  const constructors={Float32Array,Float64Array,Int32Array,Uint32Array,Int16Array,Uint16Array,Int8Array,Uint8Array,Uint8ClampedArray},seen=new WeakMap();
  const decode=value=>{
    if(!value||typeof value!=='object')return value;
    if(value.__wtcSceneView){
      const buffer=buffers[value.buffer];if(!(buffer instanceof ArrayBuffer))throw new Error('Missing cached array buffer');
      if(value.__wtcSceneView==='ArrayBuffer')return buffer;
      const constructor=constructors[value.__wtcSceneView];if(!constructor)throw new Error('Invalid cached array type');
      return new constructor(buffer,value.byteOffset,value.length);
    }
    if(seen.has(value))return seen.get(value);
    const result=Array.isArray(value)?[]:{};seen.set(value,result);
    for(const [key,child] of Object.entries(value))result[key]=decode(child);
    return result;
  };
  return decode(scene);
}

function localImports(source){
  const references=[],pattern=/\b(?:import|export)\s+(?:[^;'"`]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for(const match of source.matchAll(pattern)){
    const reference=match[1]||match[2];
    if(reference.startsWith('./')||reference.startsWith('../'))references.push(reference);
  }
  return references;
}

/** Hash actual source bytes, including all transitive local module imports. */
export async function fingerprintSceneSources(entryURL,{fetchSource=globalThis.fetch,digest=globalThis.crypto?.subtle}={}){
  if(typeof fetchSource!=='function'||!digest?.digest)throw new Error('Source fingerprinting is unavailable');
  const sources=new Map();
  async function visit(url){
    if(sources.has(url))return;
    // Register before following dependencies, so cyclic imports terminate.
    const pending=(async()=>{
      const response=await fetchSource(url,{cache:'no-cache'});
      if(!response.ok)throw new Error(`Cannot fingerprint scene source: ${new URL(url).pathname}`);
      return response.text();
    })();
    sources.set(url,pending);
    const source=await pending;
    if(/\.(?:m?js)(?:\?|$)/.test(url))await Promise.all(localImports(source).map(reference=>visit(new URL(reference,url).href)));
  }
  await visit(new URL(entryURL).href);
  // Sorting makes completion order irrelevant. Length-prefixing prevents
  // differently partitioned source texts from sharing a concatenation.
  const rows=await Promise.all([...sources.entries()].sort(([a],[b])=>a.localeCompare(b)).map(async([url,value])=>[url,await value]));
  const text=rows.map(([url,source])=>`${url.length}:${url}${source.length}:${source}`).join(''),bytes=new TextEncoder().encode(text),hash=await digest.digest('SHA-256',bytes);
  return {fingerprint:Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join(''),sourceCount:rows.length,sourceBytes:bytes.byteLength};
}

/** Cheap header/shape checks avoid scanning hundreds of MB on every warm load. */
export function validPackedScene(data){
  const floats=(value,length)=>value instanceof Float32Array&&value.length===length;
  if(!data||!Number.isInteger(data.primitiveCount)||data.primitiveCount<1||!Number.isInteger(data.nodeCount)||data.nodeCount<1||!Number.isInteger(data.geometryCount)||data.geometryCount<1)return false;
  if(!floats(data.nodeData,data.nodeCount*12)||!floats(data.compactNodeData,data.nodeCount*8)||!floats(data.primitiveData,data.primitiveCount*16)||!floats(data.compactPrimitiveData,data.primitiveCount*8)||!floats(data.geometryData,data.geometryCount*8))return false;
  if(!(data.shapeOffsets instanceof Int32Array)||data.shapeOffsets.length!==data.primitiveCount||!(data.shapeData instanceof Float32Array)||data.shapeData.length%4)return false;
  if(!Array.isArray(data.materials)||!data.materials.length||!Array.isArray(data.towers)||!data.towers.length||!data.towers.every(t=>Array.isArray(t.elevations)&&Array.isArray(t.floors))||!Array.isArray(data.spaces)||!data.spaces.length||!Array.isArray(data.kinds)||!Array.isArray(data.kindSources)||data.kinds.length!==data.kindSources.length)return false;
  if(!Array.isArray(data.contextBuildings)||!Array.isArray(data.sources)||!data.stats||typeof data.stats!=='object'||!data.metadata||typeof data.metadata!=='object')return false;
  const lights=data.lightingData;
  if(lights?.version!==2||!Number.isInteger(lights.size)||lights.size<2)return false;
  for(const field of ['rows','groupData','floorLookup','polygons','probes','nightProbes','directions'])if(!(lights[field] instanceof Float32Array))return false;
  return lights.rows.length%8===0&&lights.groupData.length>0&&lights.groupData.length%16===0&&lights.floorLookup.length>0&&lights.floorLookup.length%4===0&&lights.polygons.length%4===0&&lights.probes.length>0&&lights.probes.length%4===0&&lights.nightProbes.length===lights.probes.length&&lights.directions.length===lights.probes.length;
}

export function createSceneCache({indexedDB=globalThis.indexedDB,databaseName=SCENE_CACHE_DATABASE,openTimeoutMs=1500}={}){
  let connection=null,unavailable=false,writeError=null;
  async function open(){
    if(unavailable||!indexedDB?.open)return null;
    if(connection)return connection;
    connection=new Promise(resolve=>{
      let request,settled=false;
      const finish=value=>{if(settled){value?.close();return;}settled=true;clearTimeout(timer);if(!value)unavailable=true;resolve(value);};
      const timer=setTimeout(()=>finish(null),openTimeoutMs);
      try{
        request=indexedDB.open(databaseName,1);
        request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(SCENE_CACHE_STORE))db.createObjectStore(SCENE_CACHE_STORE);};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();finish(db);};
        request.onerror=()=>finish(null);
      }catch{finish(null);}
    });
    return connection;
  }
  async function operation(mode,action){
    const db=await open();if(!db)return {ok:false};
    try{return await new Promise(resolve=>{
      const transaction=db.transaction(SCENE_CACHE_STORE,mode),store=transaction.objectStore(SCENE_CACHE_STORE);let request;
      transaction.oncomplete=()=>resolve({ok:true,value:Array.isArray(request)?request.map(r=>r.result):request?.result});
      transaction.onerror=transaction.onabort=()=>resolve({ok:false,error:errorText(transaction.error)});
      try{request=action(store);}catch(error){try{transaction.abort();}catch{}resolve({ok:false,error:errorText(error)});}
    });}catch(error){return {ok:false,error:errorText(error)};}
  }
  const validBuffers=entry=>Array.isArray(entry.buffers)&&entry.buffers.length<=128&&entry.buffers.every(b=>Number.isInteger(b.byteLength)&&b.byteLength>=0&&b.byteLength<=2*1024*1024*1024&&b.chunks===Math.ceil(b.byteLength/CACHE_CHUNK_BYTES));
  async function discard(key,entry){
    await operation('readwrite',store=>{
      const requests=[store.delete(key)];
      if(validBuffers(entry))entry.buffers.forEach((buffer,index)=>{for(let chunk=0;chunk<buffer.chunks;chunk++)requests.push(store.delete(chunkKey(key,index,chunk)));});
      return requests;
    });
  }
  return {
    get writeError(){return writeError;},
    async read(fingerprint){
      const key=keyFor(fingerprint),result=await operation('readonly',store=>store.get(key));
      if(!result.ok)return {status:'unavailable',scene:null};
      if(!result.value)return {status:'miss',scene:null};
      const entry=result.value;
      if(entry.version!==SCENE_CACHE_VERSION||entry.fingerprint!==fingerprint||entry.arrayStorage!=='chunks-v1'||!validBuffers(entry)){
        // Delete only the incompatible entry requested by this load.
        await discard(key,entry);
        return {status:'corrupt',scene:null};
      }
      const parts=await operation('readonly',store=>entry.buffers.flatMap((buffer,index)=>Array.from({length:buffer.chunks},(_,chunk)=>store.get(chunkKey(key,index,chunk)))));
      if(!parts.ok)return {status:'unavailable',scene:null};
      try{
        let cursor=0;
        const buffers=entry.buffers.map(descriptor=>{
          const chunks=parts.value.slice(cursor,cursor+descriptor.chunks);cursor+=descriptor.chunks;
          for(let i=0;i<chunks.length;i++)if(!(chunks[i] instanceof ArrayBuffer)||chunks[i].byteLength!==Math.min(CACHE_CHUNK_BYTES,descriptor.byteLength-i*CACHE_CHUNK_BYTES))throw new Error('Incomplete cached buffer');
          if(chunks.length===1)return chunks[0];
          const buffer=new ArrayBuffer(descriptor.byteLength),bytes=new Uint8Array(buffer);chunks.forEach((chunk,i)=>bytes.set(new Uint8Array(chunk),i*CACHE_CHUNK_BYTES));return buffer;
        });
        const scene=decodeScene(entry.scene,buffers);if(!validPackedScene(scene))throw new Error('Invalid cached scene');
        return {status:'hit',scene};
      }catch{await discard(key,entry);return {status:'corrupt',scene:null};}
    },
    async write(fingerprint,scene){
      writeError=null;
      if(!validPackedScene(scene)){writeError='InvalidPackedScene';return false;}
      const encoded=encodeScene(scene),key=keyFor(fingerprint),buffers=encoded.buffers.map(buffer=>({byteLength:buffer.byteLength,chunks:Math.ceil(buffer.byteLength/CACHE_CHUNK_BYTES)}));
      const result=await operation('readwrite',store=>{
        // This store is owned exclusively by the packed WTC scene cache.
        // Replace all older fingerprints atomically: a quota/error abort
        // rolls the clear back too and preserves the previous warm scene.
        const requests=[store.clear(),store.put({version:SCENE_CACHE_VERSION,fingerprint,arrayStorage:'chunks-v1',scene:encoded.scene,buffers,createdAt:Date.now()},key)];
        encoded.buffers.forEach((buffer,index)=>{for(let chunk=0;chunk<buffers[index].chunks;chunk++)requests.push(store.put(buffer.slice(chunk*CACHE_CHUNK_BYTES,Math.min(buffer.byteLength,(chunk+1)*CACHE_CHUNK_BYTES)),chunkKey(key,index,chunk)));});
        return requests;
      });
      if(!result.ok)writeError=result.error || 'IndexedDB unavailable';
      return result.ok;
    },
    async close(){const db=connection?await connection:null;db?.close();connection=null;},
  };
}

/** Build/bake is called only on a miss. Persistence completes before transfer. */
export async function loadSceneWithCache({fingerprint,sourceCount=0,fingerprintMs=0,cache,buildScene,progress=()=>{},now=()=>performance.now()}){
  const started=now(),cached=fingerprint&&cache?await cache.read(fingerprint):{status:'unavailable',scene:null},readMs=now()-started;
  if(cached.status==='hit')return {...cached.scene,cacheInfo:{source:'indexeddb',fingerprint,sourceCount,fingerprintMs,buildMs:0,bvhMs:0,lightingMs:0,cacheMs:readMs,cacheStored:true}};
  const built=await buildScene();let stored=false,writeMs=0;
  if(fingerprint&&cache&&cached.status!=='unavailable'){
    progress('正在保存结构和室内光照缓存，后续启动可直接读取…');
    const before=now();stored=await cache.write(fingerprint,built.scene);writeMs=now()-before;
  }
  return {...built.scene,cacheInfo:{source:'generated',fingerprint,sourceCount,fingerprintMs,buildMs:built.buildMs,bvhMs:built.bvhMs,lightingMs:built.lightingMs,cacheMs:readMs+writeMs,cacheStored:stored,cacheStatus:cached.status,cacheWriteError:cache?.writeError || null}};
}

/** Transfer every packed/light typed array exactly once, including shared views. */
export function sceneTransferables(scene){
  const buffers=new Set(),visited=new WeakSet();
  const visit=value=>{
    if(!value||typeof value!=='object'||visited.has(value))return;
    visited.add(value);
    if(value instanceof ArrayBuffer){buffers.add(value);return;}
    if(ArrayBuffer.isView(value)){if(value.buffer instanceof ArrayBuffer)buffers.add(value.buffer);return;}
    for(const child of Object.values(value))visit(child);
  };
  visit(scene);return [...buffers];
}
