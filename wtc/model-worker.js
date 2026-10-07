import { buildModel } from './model.js';
import { buildBVH } from './bvh.js';
import {prepareLightGrid} from './lighting.js';
import {createSceneCache,fingerprintSceneSources,loadSceneWithCache,sceneTransferables} from './model-cache.js';
self.onmessage = async () => {
  try {
    const progress = text => self.postMessage({type:'progress',text});
    progress('正在检查结构和光照缓存版本…');
    const fingerprintStarted=performance.now();let fingerprint=null,sourceCount=0;
    try{({fingerprint,sourceCount}=await fingerprintSceneSources(import.meta.url));}catch{progress('缓存版本检查不可用，正在重新生成完整结构…');}
    const fingerprintMs=performance.now()-fingerprintStarted,cache=createSceneCache();
    const scene=await loadSceneWithCache({fingerprint,sourceCount,fingerprintMs,cache,progress,buildScene:async()=>{
      const buildStarted=performance.now(),model=await buildModel(progress),buildMs=performance.now()-buildStarted;
      const bvhStarted=performance.now(),packed=buildBVH(model.primitives,progress,{towers:model.towers,materials:model.materials}),bvhMs=performance.now()-bvhStarted;
      const data={...packed,materials:model.materials,towers:model.towers,contextBuildings:model.contextBuildings,stats:model.stats,sources:model.sources,metadata:model.metadata};
      progress('正在计算室内与地下灯具的遮挡光照…');
      const lightingStarted=performance.now();data.lightingData=prepareLightGrid(data);
      return {scene:data,buildMs,bvhMs,lightingMs:performance.now()-lightingStarted};
    }});
    await cache.close();
    self.postMessage({type:'ready',...scene},sceneTransferables(scene));
  } catch(error) {
    self.postMessage({type:'error',message:error.stack || error.message});
  }
};
