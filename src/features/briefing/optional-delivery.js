// Only the opt-in briefing session uses this bound; existing engine loaders stay intact.
export const OPTIONAL_DELIVERY_TIMEOUT_MS = 8000;
export function optionalDelivery(task, {signal, fallback=null, timeoutMs=OPTIONAL_DELIVERY_TIMEOUT_MS}={}) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<=0||timeoutMs>30000)throw new TypeError('Invalid optional delivery timeout');
  if(signal?.aborted)return Promise.resolve(fallback);
  return new Promise(resolve=>{
    const controller=new AbortController();let settled=false;
    const finish=(value,abort=false)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
      if(abort)controller.abort();
      resolve(value);
    };
    const cancel=()=>finish(fallback,true);
    const timer=setTimeout(cancel,timeoutMs);
    signal?.addEventListener('abort',cancel,{once:true});
    Promise.resolve().then(()=>settled?fallback:task(controller.signal))
      .then(value=>finish(value??fallback),()=>finish(fallback));
  });
}
