// Focus is a mode, not a one-shot command. Point targets remain in world space.
export function createPhotoFocusController({interval=100}={}) {
  let mode=null,signature=null,lastQuery=-Infinity,target=null,selected=false;
  const reset=()=>{mode=null;signature=null;lastQuery=-Infinity;target=null;selected=false;};
  const plane=(point,pose)=>{
    if(!point)return {focusInfinity:true};
    const distance=point.reduce((sum,value,i)=>sum+(value-pose.origin[i])*pose.forward[i],0);
    return distance<=0?{focusInfinity:true}:{focusDistance:Math.min(5000,Math.max(.3,distance)),focusInfinity:false};
  };
  return {
    reset,
    update({state,pose,viewKey,query,now=0,force=false}) {
      if(mode!==state.focusMode){mode=state.focusMode;signature=null;lastQuery=-Infinity;}
      if(!state.dof||mode==='manual')return null;
      if(mode==='point')return selected?plane(target,pose):null;
      if(!force&&(signature===viewKey||now-lastQuery<interval))return null;
      const center=query(.5,.5);signature=viewKey;lastQuery=now;
      return plane(center,pose);
    },
    pick({state,pose,query,u,v}) {
      if(state.focusMode!=='point')return null;
      target=query(u,v);selected=true;
      // Null is an explicit selection of the sky, so keep infinity on movement.
      signature=null;mode='point';
      return plane(target,pose);
    },
  };
}
