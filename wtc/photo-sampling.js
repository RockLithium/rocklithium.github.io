// Keep a short queue to reduce per-sample CPU/GPU round trips without queuing
// a long, uncancellable GPU workload. Progress is reported at batch boundaries.
export async function accumulatePhotoSamples({count,render,finish,abort=()=>{},progress=()=>{},now=()=>performance.now(),batchSize=4,maxBatch=8,targetMs=40}) {
  if(!Number.isInteger(count)||count<0)throw new RangeError('Sample count must be a nonnegative integer.');
  maxBatch=Number.isFinite(maxBatch)?Math.max(1,Math.floor(maxBatch)):8;
  batchSize=Number.isFinite(batchSize)?Math.max(1,Math.floor(batchSize)):4;
  targetMs=Number.isFinite(targetMs)&&targetMs>0?targetMs:40;
  let completed=0,batch=Math.min(maxBatch,Math.max(1,batchSize));
  while(completed<count){
    abort();const start=now(),size=Math.min(batch,count-completed);
    for(let i=0;i<size;i++)render(completed+i);
    await finish();completed+=size;abort();progress(completed);
    const elapsed=Math.max(1,now()-start);
    batch=Math.min(maxBatch,Math.max(1,Math.floor(size*targetMs/elapsed)));
  }
  return completed;
}
