import * as THREE from 'three/webgpu';
import { createUI, getDiagonalFov, getVerticalFov, DEFAULT_DFOV, getRenderDimensions } from './ui.js?v=20261007-details-2';
import { createTracer } from './tracer.js?v=20261007-runtime-3';
import { pickBVH } from './bvh.js';
import { FreeCameraControls } from './camera-controls.js';
import {encodeSnapshot} from './image-export.js';
import {createPhotoUI} from './photo-ui.js?v=20261007-details-2';
import {PHOTO_DEFAULTS,normalizePhotoSettings,getPreviewDimensions,getPhotoOptics,diagonalFovToFocalLength,focalLengthToDiagonalFov,clampPhotoField,createPhotoRay} from './photo-settings.js?v=20261007-details-2';
import {createPhotoFocusController} from './photo-focus.js?v=20261007-details-2';
import {estimatePhotoWhiteBalance} from './photo-color.js?v=20261007-details-2';
import {accumulatePhotoSamples} from './photo-sampling.js?v=20261007-details-2';
import {createFrameScheduler} from './frame-scheduler.js';

const viewport=document.getElementById('viewport'),loading=document.getElementById('loading'),loadingStatus=document.getElementById('loading_status');
const canvas=document.createElement('canvas');canvas.id='wtc_canvas';canvas.tabIndex=0;canvas.style.outline='none';canvas.setAttribute('aria-label','Interactive 3D model of the World Trade Center towers');viewport.append(canvas);
const camera=new THREE.PerspectiveCamera(getVerticalFov(DEFAULT_DFOV,16/9),1,.01,5000);
const controls=new FreeCameraControls(camera);
let tracer=null,data=null,floorHelper=null,band=[-10000,10000];
let paused=false,lastTime=performance.now(),frameCount=0,fpsTime=performance.now(),fps=0;
let capturing=false,resizeRequested=false;
let photoSession=null,captureCancelled=false;
const photoFocus=createPhotoFocusController();
let balancePromise=null,balanceSignature='',lastBalanceTime=-Infinity;
const renderChannel=new MessageChannel();
let queuedRender=null;
const frames=createFrameScheduler({schedule:callback=>{queuedRender=callback;renderChannel.port1.postMessage(null);},render:animate,suspended:()=>paused||document.hidden,onError:renderError});
const queueFrame=()=>frames.request();
function renderError(error){console.error(error);ui.status(`Render error: ${error.message}`,true);window.__wtcError=error.stack;}
let clockStartTime=performance.now(),clockStartMinutes=900;
const keys=new Set(),pointers=new Map();let down=null;
const ui=createUI((state,key)=>{
  if(capturing){if(['scaleIdx','force16_9','preset'].includes(key))resizeRequested=true;return;}
  if(key==='view')setView(state.view);
  if(key==='floor'){updateBand();if(state.floor&&state.view==='floor')setView('floor');}
  if(key==='towers'){updateBand();if(state.floor&&state.view==='floor')setView('floor');}
  if(['minutes','playing','daySeconds'].includes(key)){clockStartMinutes=state.minutes;clockStartTime=performance.now();}
  if(['scaleIdx','force16_9','preset'].includes(key))resize();
  if(key==='screenshot')saveImage().catch(()=>{});
  if(key==='hdr'&&tracer){const actual=tracer.configureHDR(state.hdr);if(state.hdr&&!actual){ui.setState({hdr:false},false);ui.notice?.('HDR presentation is unavailable on this display/browser.');}}
});
const photoUI=createPhotoUI((event,state,key)=>{
  if(event==='enter')enterPhotoMode();
  if(event==='exit')exitPhotoMode();
  if(event==='change'&&photoSession&&!capturing){
    if(['pitch','yaw','roll'].includes(key))applyPhotoRotation();
    if(['focalLength','dfov','lensMode','width','height','ratio','orientation','resolutionPreset'].includes(key))resize();
    if(['dof','focusMode'].includes(key))updatePhotoFocus(true);
    if(key==='focusMode')photoUI.status(state.focusMode==='point'?'Point focus: click any surface to choose a target.':state.focusMode==='auto'?'Automatic focus follows the center when depth of field is enabled.':'Manual focus uses your distance or infinity setting.');
    if(key==='autoWhiteBalance'){balanceSignature='';lastBalanceTime=-Infinity;photoUI.status(state.autoWhiteBalance?'Automatic white balance is estimating the current view.':'Manual temperature and tint restored.');}
    updatePhotoHints();
  }
  if(event==='capture')capturePhoto().catch(error=>{photoUI.status(error.message);});
  if(event==='cancel')captureCancelled=true;
  if(event==='level'){photoUI.setState({pitch:0,roll:0});applyPhotoRotation();}
  if(event==='north'){photoUI.setState({yaw:0});applyPhotoRotation();}
});
const degrees=value=>value*180/Math.PI;
function cameraAngles(){return {pitch:degrees(controls.pitch),yaw:((-degrees(controls.yaw)%360)+360)%360,roll:degrees(controls.roll)};}
function syncPhotoAngles(){if(photoSession)photoUI.setState(cameraAngles());}
function applyPhotoRotation(){
  if(!photoSession||capturing)return;
  controls.pitch=photoUI.state.pitch*Math.PI/180;controls.yaw=-photoUI.state.yaw*Math.PI/180;controls.roll=photoUI.state.roll*Math.PI/180;
  camera.rotation.set(controls.pitch,controls.yaw,controls.roll,'YXZ');camera.updateMatrixWorld();
}
function updatePhotoHints(){
  const hints=document.getElementById('control_hints');
  if(hints)hints.textContent=photoSession?`${photoUI.state.shiftEnabled?'DRAG TO SHIFT':'DRAG TO LOOK'} · WHEEL ${photoUI.state.lensMode==='mm'?'FOCAL LENGTH':'DFOV'} · WASD/QE MOVE · SHIFT FAST`:'DRAG TO LOOK · WHEEL FOV · WASD FLY · Q/E WORLD Y';
}
function enterPhotoMode(){
  if(!tracer||capturing){photoUI.close();return;}
  photoSession={fov:camera.fov,force16_9:ui.state.force16_9};
  keys.clear();pointers.clear();down=null;tracer.select(-1);ui.selection(null);
  photoUI.setState({...PHOTO_DEFAULTS,bounces:ui.state.bounces,shadowSamples:ui.state.shadowSamples,
    focalLength:diagonalFovToFocalLength(getDiagonalFov(camera.fov,camera.aspect)),...cameraAngles()});
  photoFocus.reset();balanceSignature='';lastBalanceTime=-Infinity;photoUI.setState({autoBalance:[1,1,1]});
  resize();updatePhotoHints();photoUI.status('Preview uses Graphics settings. Shutter uses the photo quality settings.');
}
function exitPhotoMode(){
  if(!photoSession)return;
  const previous=photoSession;photoSession=null;photoFocus.reset();balanceSignature='';keys.clear();pointers.clear();down=null;
  camera.fov=previous.fov;ui.setState({force16_9:previous.force16_9},false);
  photoUI.setState({dof:false,shiftEnabled:false,shiftX:0,shiftY:0});
  controls.adoptOrientation();camera.updateProjectionMatrix();resize();tracer?.reset();updatePhotoHints();
}
function photoPickRay(u,v){
  camera.updateMatrixWorld();
  return createPhotoRay({origin:camera.position.toArray(),forward:camera.getWorldDirection(new THREE.Vector3()).toArray(),
    right:new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).toArray(),up:new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).toArray(),
    uv:[u,v],optics:getPhotoOptics(photoUI.state,camera.aspect),dof:false});
}
function probePhotoTarget(u,v){
  const ray=photoPickRay(u,v),origin=[...ray.origin];let hit=null;
  // Skip thin transparent panes so a window does not monopolize indoor focus.
  for(let i=0;i<16;i++){
    hit=pickBVH(data,origin,ray.direction,ui.state,band);
    if(!hit)break;
    if((data.materials[Math.round(hit.record[3])]?.transmission || 0)<=.5)return [...hit.position];
    for(let axis=0;axis<3;axis++)origin[axis]=hit.position[axis]+ray.direction[axis]*.02;
  }
  return null;
}
function photoPose(){camera.updateMatrixWorld();return {origin:camera.position.toArray(),forward:camera.getWorldDirection(new THREE.Vector3()).toArray()};}
function photoViewKey(){
  const p=photoUI.state,s=ui.state;
  return [...camera.position.toArray(),...camera.quaternion.toArray(),camera.fov,camera.aspect,p.shiftEnabled,p.shiftX,p.shiftY,s.layers,s.towers,s.cutMode,s.cutHeight,s.cutSide,s.floor,...band].join(',');
}
function applyFocus(result){
  if(!result)return false;
  const p=photoUI.state;
  if(result.focusInfinity===p.focusInfinity&&(result.focusInfinity||Math.abs(result.focusDistance-p.focusDistance)<Math.max(.005,p.focusDistance*.0001)))return false;
  photoUI.setState(result);return true;
}
function updatePhotoFocus(force=false,now=performance.now()){
  if(!photoSession||!data)return;
  applyFocus(photoFocus.update({state:photoUI.state,pose:photoPose(),viewKey:photoViewKey(),query:probePhotoTarget,now,force}));
}
function focusPhotoAt(u,v){
  if(!photoSession||!data||capturing)return;
  const result=photoFocus.pick({state:photoUI.state,pose:photoPose(),query:probePhotoTarget,u,v});
  if(!result)return;
  applyFocus(result);photoUI.status(result.focusInfinity?'Point focus: infinity (no visible target)':`Point focus: ${photoUI.state.focusDistance.toFixed(1)} m · click another target to refocus`);
}
async function refreshPhotoWhiteBalance(force=false){
  if(!photoSession||!photoUI.state.autoWhiteBalance||!tracer||(capturing&&!force))return;
  if(balancePromise){await balancePromise.catch(()=>{});return;}
  const balanceKey=()=>`${photoViewKey()},${ui.state.minutes},${ui.state.cloud},${ui.state.fog},${ui.state.bounces},${ui.state.shadowSamples},${photoUI.state.dof},${photoUI.state.focusDistance},${photoUI.state.focusInfinity}`;
  const session=photoSession,now=performance.now(),signature=balanceKey();
  if(!force&&(signature===balanceSignature||now-lastBalanceTime<500||tracer.samples<2))return;
  lastBalanceTime=now;
  balancePromise=(async()=>{
    const sample=await tracer.readWhiteBalanceSamples();
    if(session!==photoSession||!photoUI.state.autoWhiteBalance)return;
    // Reject a stale frame if the camera moved during the GPU readback.
    const current=balanceKey();
    if(current!==signature)return;
    photoUI.setState({autoBalance:estimatePhotoWhiteBalance(sample.pixels,sample)});balanceSignature=signature;
  })();
  try{await balancePromise;}catch(error){
    if(session===photoSession){photoUI.setState({autoWhiteBalance:false});photoUI.status(`Automatic white balance unavailable: ${error.message}`);}
    console.error(error);
  }finally{balancePromise=null;}
}
function setLoading(text){if(loadingStatus)loadingStatus.textContent=text;ui.status(text);}
function levelInfo(){
  const tower=(ui.state.towers&3)===2?2:1;
  return floorHelper?.(tower,Math.max(1,ui.state.floor)) || {elevation:Math.max(0,(ui.state.floor-1)*3.6576),height:3.6576};
}
function updateBand(){
  if(!ui.state.floor){band=[-10000,10000];return;}
  const info=levelInfo(),elevation=info.elevation ?? info.y ?? info.base ?? 0,height=info.height || 3.6576;
  band=[elevation-.3,elevation+height-.08];
}
function setView(view){
  const id=(ui.state.towers&3)===2?2:1,tower=data?.towers?.find(t=>t.id===id),center=tower?.center || [0,0,0];
  const local=(x,y,z)=>{
    const angle=tower?.orientation || 0,c=Math.cos(angle),s=Math.sin(angle);
    z*=tower?.localZSign ?? 1;
    return [center[0]+c*x+s*z,y,center[2]-s*x+c*z];
  };
  if(view==='overview'||view==='reset'){
    ui.setState({view:'overview',floor:0,cutMode:0,towers:63},false);
    controls.pose([575,330,-656],[0,210,0],120);
  }
  if(view==='north'||view==='south'){
    const which=view==='north'?1:2,c=data?.towers?.find(t=>t.id===which)?.center || [0,0,0];
    ui.setState({view,towers:which,floor:0,cutMode:0},false);
    controls.pose([c[0]+(which===1?-365:470),255,c[2]-510],[c[0],205,c[2]],100);
  }
  if(view==='lobby'){
    ui.setState({view,towers:id,floor:0,cutMode:0},false);
    // Start at eye height in the concourse gallery and look along the open
    // circulation space; aiming at the mezzanine datum points straight into
    // the ceiling and made the lobby feel like an empty blank soffit.
    controls.pose(local(27.6,1.75,-17),local(24.7,3,7),4);
  }
  if(view==='floor'){
    ui.setState({view,towers:id,floor:ui.state.floor || 84,cutMode:0},false);
    const info=levelInfo(),eye=(info.elevation ?? 0)+1.75;
    if([3,4,5,6,8,42,76,109].includes(ui.state.floor))controls.pose(local(3.5,eye,11.8),local(-7,eye,9.5),5);
    else controls.pose(local(5,eye,27),local(-12,eye,19),7);
  }
  if(view==='top'){
    ui.setState({view,towers:id,floor:0,cutMode:0},false);
    const roof=tower?.height || 417;
    controls.pose(local(83,roof+63,110),local(0,roof+1,0),25);
  }
  camera.fov=getVerticalFov(DEFAULT_DFOV,16/9);if(photoSession){syncPhotoAngles();camera.fov=getPhotoOptics(photoUI.state,camera.aspect).verticalFov;}
  camera.updateProjectionMatrix();ui.stats({dfov:getDiagonalFov(camera.fov,camera.aspect)});
  updateBand();tracer?.reset();
}
function resize(){
  if(!tracer)return;
  if(capturing){resizeRequested=true;return;}
  let cssW=window.innerWidth,cssH=window.innerHeight;
  const common={cssWidth:cssW,cssHeight:cssH,devicePixelRatio:window.devicePixelRatio || 1,screenWidth:window.screen.width,screenHeight:window.screen.height,scaleIdx:ui.state.scaleIdx,maxSize:Math.min(8192,tracer.maxTextureSize)};
  let dimensions;
  if(photoSession){dimensions=getPreviewDimensions({...common,aspect:photoUI.state.width/photoUI.state.height});cssW=dimensions.cssWidth;cssH=dimensions.cssHeight;}
  else{
    if(ui.state.force16_9){if(cssW/cssH>16/9)cssW=cssH*16/9;else cssH=cssW*9/16;}
    dimensions=getRenderDimensions({...common,cssWidth:cssW,cssHeight:cssH,force16_9:ui.state.force16_9});
  }
  canvas.style.width=`${Math.floor(cssW)}px`;canvas.style.height=`${Math.floor(cssH)}px`;
  const {width,height,requestedWidth,requestedHeight,scale,capped}=dimensions;
  tracer.resize(width,height);camera.aspect=photoSession?photoUI.state.width/photoUI.state.height:width/height;
  if(photoSession)camera.fov=getPhotoOptics(photoUI.state,camera.aspect).verticalFov;
  camera.updateProjectionMatrix();
  ui.stats({width,height,dfov:getDiagonalFov(camera.fov,camera.aspect),scaleLabel:ui.state.force16_9&&!photoSession?`${width}×${height}`:`${scale}x`,warning:capped?`GPU texture limit: requested ${requestedWidth}×${requestedHeight}, using ${width}×${height}.`:ui.state.force16_9&&!photoSession?`Fixed 16:9 output · ${width}×${height}`:''});
  if(photoSession)photoUI.stats({width,height});
}
function downloadImage(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.download=name;link.href=url;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const sceneTime=state=>`${String(Math.floor(state.minutes/60)).padStart(2,'0')}${String(Math.floor(state.minutes%60)).padStart(2,'0')}`;
async function capturePhoto({tileSize=512,download=true}={}){
  if(!photoSession||!tracer||capturing)return;
  updatePhotoFocus(true);
  const photo=normalizePhotoSettings({...photoUI.state}),state={...ui.state,bounces:photo.bounces,shadowSamples:photo.shadowSamples,playing:false};
  const previewState={...ui.state},session=photoSession;
  const snapshotCamera=camera.clone(),snapshotBand=[...band],width=photo.width,height=photo.height,hdr=state.hdr;
  // Keep both output sides <=8192. Tiles bound GPU working memory only.
  if(width>8192||height>8192)throw Error('Photo output is limited to 8192 pixels per side.');
  snapshotCamera.aspect=width/height;snapshotCamera.fov=getPhotoOptics(photo).verticalFov;snapshotCamera.updateProjectionMatrix();
  const wasPaused=paused;capturing=true;captureCancelled=false;pause();
  const button=document.getElementById('btn_screenshot');if(button)button.disabled=true;
  const size=Math.min(512,Math.max(64,Math.floor(tileSize))),columns=Math.ceil(width/size),rows=Math.ceil(height/size),total=columns*rows*photo.samples;
  let completed=0,frozen=null,lastProgress=-Infinity;
  const abort=()=>{if(captureCancelled)throw new DOMException('Photo capture cancelled','AbortError');};
  photoUI.progress({active:true,total,message:'Preparing photo…'});
  try{
    await balancePromise;await tracer.finish();abort();
    // Preserve the composed preview while the same GPU traces offscreen tiles.
    tracer.render(snapshotCamera,previewState,snapshotBand,{photo});
    if(photo.autoWhiteBalance){
      const sample=await tracer.readWhiteBalanceSamples();abort();
      photo.autoBalance=estimatePhotoWhiteBalance(sample.pixels,sample);
      if(session===photoSession)photoUI.setState({autoBalance:photo.autoBalance});
      // Freeze the same WB gains for every tile and update the held preview.
      tracer.render(snapshotCamera,previewState,snapshotBand,{photo});
    }
    const preview=await tracer.readImage({hdr:false});abort();
    frozen=document.createElement('canvas');frozen.id='photo_capture_preview';frozen.width=preview.width;frozen.height=preview.height;
    frozen.style.cssText=`position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${canvas.style.width};height:${canvas.style.height};pointer-events:none;z-index:1`;
    frozen.getContext('2d').putImageData(new ImageData(preview.pixels,preview.width,preview.height),0,0);viewport.append(frozen);canvas.style.visibility='hidden';
    const pixels=hdr?new Float32Array(width*height*4):new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y+=size)for(let x=0;x<width;x+=size){
      abort();const w=Math.min(size,width-x),h=Math.min(size,height-y);
      tracer.resize(Math.max(16,w),Math.max(16,h));tracer.reset();
      const before=completed;
      await accumulatePhotoSamples({count:photo.samples,abort,finish:()=>tracer.finish(),
        render:sample=>tracer.render(snapshotCamera,state,snapshotBand,{photo,tile:{x,y,width,height},sampleIndex:sample,present:false}),
        progress:count=>{completed=before+count;const now=performance.now();if(now-lastProgress>=100||completed===total){lastProgress=now;photoUI.progress({active:true,completed,total,message:`Rendering ${Math.floor(completed/total*100)}% · ${width} × ${height}`});}}
      });
      abort();const image=await tracer.readImage({hdr});
      for(let row=0;row<h;row++)pixels.set(image.pixels.subarray(row*image.width*4,(row*image.width+w)*4),((y+row)*width+x)*4);
    }
    abort();photoUI.progress({active:true,completed,total,message:hdr?'Encoding HDR JXR…':'Encoding PNG…'});
    const blob=await encodeSnapshot({pixels,width,height,hdr});abort();
    if(download)downloadImage(blob,`wtc-photo-${sceneTime(state)}-${width}x${height}-${Date.now()}.${hdr?'jxr':'png'}`);
    photoUI.status(`Saved ${width} × ${height} ${hdr?'HDR JXR':'PNG'}`);
    return {blob,width,height,hdr,samples:photo.samples,state,photo};
  }catch(error){
    photoUI.status(error.name==='AbortError'?'Photo cancelled':`Photo failed: ${error.message}`);
    if(error.name!=='AbortError')throw error;
    return {cancelled:true};
  }finally{
    capturing=false;photoUI.progress({active:false});if(button)button.disabled=false;resizeRequested=false;
    try{
      if(ui.state.view!==state.view)setView(ui.state.view);updateBand();resize();
      const actual=tracer.configureHDR(ui.state.hdr);if(ui.state.hdr&&!actual)ui.setState({hdr:false},false);
      tracer.render(camera,ui.state,band,{photo:photoSession?photoUI.state:null});await tracer.finish();
    }finally{
      canvas.style.visibility='';frozen?.remove();
      clockStartMinutes=ui.state.minutes;clockStartTime=performance.now();
      if(!wasPaused)resume();
    }
  }
}
async function saveImage(){
  if(!tracer||capturing)return;
  const wasPaused=paused,state={...ui.state},snapshotCamera=camera.clone(),snapshotBand=[...band],button=document.getElementById('btn_screenshot');
  capturing=true;pause();if(button)button.disabled=true;
  try{
    ui.notice('正在读取渲染尺寸的图片…',60000);
    await tracer.finish();tracer.render(snapshotCamera,state,snapshotBand,{photo:photoSession?photoUI.state:null});
    const image=await tracer.readImage();
    ui.notice(image.hdr?'正在编码 HDR JPEG XR…':'正在编码 PNG…',60000);
    const blob=await encodeSnapshot(image);downloadImage(blob,`wtc-rt-${sceneTime(state)}-${image.width}x${image.height}.${image.hdr?'jxr':'png'}`);
    ui.notice(`已导出 ${image.width}×${image.height} ${image.hdr?'HDR JXR':'PNG'}`);
    return {blob,width:image.width,height:image.height,hdr:image.hdr};
  }catch(error){console.error(error);ui.notice(`图片导出失败：${error.message}`,10000);throw error;}
  finally{
    capturing=false;if(button)button.disabled=false;
    if(ui.state.hdr!==state.hdr){const actual=tracer.configureHDR(ui.state.hdr);if(ui.state.hdr&&!actual)ui.setState({hdr:false},false);}
    if(ui.state.view!==state.view)setView(ui.state.view);
    updateBand();if(resizeRequested){resizeRequested=false;resize();}
    if(!wasPaused)resume();
  }
}
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('pointerdown',event=>{
  if(capturing)return;
  canvas.focus({preventScroll:true});
  canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});down={x:event.clientX,y:event.clientY,time:performance.now()};
});
canvas.addEventListener('pointermove',event=>{
  const previous=pointers.get(event.pointerId);if(!previous)return;
  if(capturing)return;
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
  if(photoSession&&photoUI.state.shiftEnabled){
    const rect=canvas.getBoundingClientRect(),optics=getPhotoOptics(photoUI.state,camera.aspect);
    photoUI.setState({shiftX:photoUI.state.shiftX-dx/rect.width*optics.sensorWidth,shiftY:photoUI.state.shiftY+dy/rect.height*optics.sensorHeight});
  }else if(event.buttons===2||event.shiftKey)controls.pan(dx,dy);else controls.look(dx,dy);
  syncPhotoAngles();
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
});
canvas.addEventListener('pointerup',event=>{
  pointers.delete(event.pointerId);
  if(capturing){down=null;return;}
  if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<4&&performance.now()-down.time<500&&data){
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*2-1,y=1-(event.clientY-rect.top)/rect.height*2;
    if(photoSession){if(photoUI.state.focusMode==='point')focusPhotoAt((x+1)/2,(1-y)/2);down=null;return;}
    const direction=new THREE.Vector3(x,y,.5).unproject(camera).sub(camera.position).normalize();
    const hit=pickBVH(data,camera.position.toArray(),direction.toArray(),ui.state,band);
    tracer.select(hit?.index);
    if(hit){const r=hit.record,m=data.materials[Math.round(r[3])],layerNames={1:'Façade',2:'Perimeter steel',4:'Core structure',8:'Floor slab',16:'Floor truss',32:'Basement',64:'Roof / antenna',128:'Site',256:'Stairs',512:'Elevators',1024:'Lights',2048:'Interior'};
      const source=data.sources?.find(s=>s.id===data.kindSources?.[Math.round(r[7])]);
      const towerId=Math.round(r[13]),contextBuildings=Array.isArray(data.contextBuildings)?data.contextBuildings:Object.values(data.contextBuildings || {}),contextBuilding=contextBuildings.find(building=>Number(building.id)===towerId);
      const towerName=towerId===1?'North Tower':towerId===2?'South Tower':contextBuilding?.name;
      ui.selection({name:data.kinds?.[Math.round(r[7])] || m.name,material:m.name,tower:towerId?`WTC ${towerId}${towerName?` · ${towerName}`:''}`:'Site',floor:r[14] || 'Spanning member',layer:layerNames[r[12]],dimensions:`${(r[4]*2).toFixed(3)} × ${(r[5]*2).toFixed(3)} × ${(r[6]*2).toFixed(3)} m`,position:hit.position.map(v=>v.toFixed(2)).join(', ')+' m',roughness:m.roughness,metalness:m.metalness,source:source?`${source.title}; reconstruction notes distinguish inferred details.`:'Representative reconstruction detail; see reconstruction notes.'});
    }else ui.selection(null);
  }
  down=null;
});
canvas.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);down=null;});
canvas.addEventListener('wheel',event=>{event.preventDefault();if(capturing)return;
  if(photoSession){const focalLength=clampPhotoField('focalLength',photoUI.state.focalLength*Math.exp(-event.deltaY*.001));photoUI.setState({focalLength,dfov:focalLengthToDiagonalFov(focalLength)});resize();}
  else controls.zoom(event.deltaY);
  ui.stats({dfov:getDiagonalFov(camera.fov,camera.aspect)});
},{passive:false});
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'){
    pointers.clear();keys.clear();down=null;
    tracer?.select(-1);ui.selection(null);
    if(photoUI.visible)photoUI.close();
    return;
  }
  if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(event.code)){keys.add(event.code);event.preventDefault();}
});
window.addEventListener('keyup',event=>keys.delete(event.code));window.addEventListener('blur',()=>{keys.clear();pointers.clear();});
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
window.screen.orientation?.addEventListener('change',resize);
window.addEventListener('orientationchange',resize);
function watchDPR(){
  const query=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`);
  query.addEventListener('change',()=>{resize();watchDPR();},{once:true});
}
watchDPR();
function pause(){paused=true;keys.clear();pointers.clear();}
function resume(){paused=false;lastTime=performance.now();queueFrame();}
document.addEventListener('visibilitychange',()=>{keys.clear();pointers.clear();if(!document.hidden){lastTime=performance.now();queueFrame();}});
setView('overview');

async function start(){
  try{
    setLoading('正在生成双塔主体结构…');
    const worker=new Worker(new URL('./model-worker.js',import.meta.url),{type:'module'});
    const modelPromise=new Promise((resolve,reject)=>{
      worker.onmessage=({data:message})=>{if(message.type==='progress')setLoading(message.text);if(message.type==='ready'){resolve(message);worker.terminate();}if(message.type==='error'){reject(new Error(message.message));worker.terminate();}};
      worker.onerror=error=>{reject(new Error(error.message));worker.terminate();};
    });worker.postMessage({});
    data=await modelPromise;
    floorHelper=(id,floor)=>data.towers.find(t=>t.id===id)?.floors?.[Math.max(0,Math.min(109,Math.floor(floor)-1))];updateBand();
    setLoading(`正在编译光追着色器（${data.primitiveCount.toLocaleString()} 个构件）…`);
    tracer=await createTracer(canvas,data);
    // Warm up at a tiny size so shader validation completes before the loading screen disappears.
    tracer.resize(64,48);camera.aspect=4/3;camera.updateProjectionMatrix();
    const device=tracer.renderer.backend.device;device?.pushErrorScope('validation');
    tracer.render(camera,ui.state,band);await tracer.finish();
    const validation=device?await device.popErrorScope():null;if(validation)throw Error(validation.message);
    resize();
    if(loading)loading.hidden=true;
    ui.status('Ready · drag to look · right-drag to pan · wheel adjusts FOV · WASD/QE to move');
    window.__wtc={ui,photoUI,camera,controls,tracer,data,setView,updateBand,pause,resume,saveImage,capturePhoto,focusPhotoAt,updatePhotoFocus,refreshPhotoWhiteBalance,get photoActive(){return !!photoSession;},get capturing(){return capturing;},get ready(){return frames.state.ready;},get renderState(){return frames.state;}};
    lastTime=performance.now();clockStartTime=lastTime;clockStartMinutes=ui.state.minutes;
    frames.start();
  }catch(error){frames.stop();console.error(error);setLoading(`无法启动：${error.message}`);ui.status(error.message,true);if(loading)loading.classList.add('error');window.__wtcError=error.stack;}
}
function animate(){
  const now=performance.now();
  const dt=Math.min(.2,(now-lastTime)/1000);lastTime=now;
  if(ui.state.playing){const minutes=(clockStartMinutes+(now-clockStartTime)*1.44/ui.state.daySeconds)%1440;ui.setState({minutes},false);}
  if(keys.size)controls.move(keys,dt);
  updatePhotoFocus(false,now);
  const result=tracer.render(camera,ui.state,band,{photo:photoSession?photoUI.state:null});
  void refreshPhotoWhiteBalance();
  if(result&&now-fpsTime>650){fps=frameCount*1000/(now-fpsTime);frameCount=0;fpsTime=now;ui.stats({fps,width:result.width,height:result.height,dfov:getDiagonalFov(camera.fov,camera.aspect)});}
  return tracer.finish().then(()=>{frameCount++;});
}
renderChannel.port2.onmessage=()=>{const callback=queuedRender;queuedRender=null;callback?.();};
start();
