// Lifecycle gate for asynchronous GPU frames. Browser events may request a
// frame while boot is awaiting workers or renderer initialization.
export function createFrameScheduler({schedule, render, suspended = () => false, onError = () => {}, maxPending = 2}) {
  let ready = false, failed = false, queued = false, pending = 0;
  const request = () => {
    if (!ready || failed || suspended() || queued || pending >= maxPending) return;
    queued = true;
    schedule(run);
  };
  const fail = error => { failed = true; ready = false; onError(error); };
  function run() {
    queued = false;
    if (!ready || failed || suspended() || pending >= maxPending) return;
    try {
      // Count the submission before invoking user code, including sync errors.
      pending++;
      Promise.resolve(render()).then(() => {
        pending--;
        request();
      }, error => { pending--; fail(error); });
      request();
    } catch (error) { pending--; fail(error); }
  }
  return {
    request,
    start() { if (failed) return; ready = true; request(); },
    stop() { ready = false; },
    get state() { return {ready, failed, queued, pending}; },
  };
}
