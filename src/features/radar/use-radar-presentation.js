import { useEffect, useState } from 'react';
import { radarPresentation } from './radar-presentation.js';

// Re-evaluate a retained observation in a long-open tab without fetching feeds
// or keeping the unlock passphrase. Only the mounted Radar view subscribes.
export function useRadarPresentation(delivery,status) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    const refresh=()=>{if(!document.hidden)setNow(Date.now());};
    const timer=window.setInterval(refresh,60000);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{
      window.clearInterval(timer);
      window.removeEventListener('focus',refresh);
      document.removeEventListener('visibilitychange',refresh);
    };
  },[]);
  return radarPresentation(delivery,status,now);
}
