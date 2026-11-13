import {useId,useState} from 'react';
import {ChevronDown} from 'lucide-react';

export function ReviewText({children,label='전체 설명'}) {
  const [open,setOpen]=useState(false),id=useId();
  if(!children)return null;
  const lengthy=children.length>170;
  return <div className="review-reading"><p id={id} className={lengthy&&!open?'review-clamped':''}>{children}</p>{lengthy&&<button type="button" className="review-text-toggle" aria-controls={id} aria-expanded={open} onClick={()=>setOpen(x=>!x)}>{open?'간단히 보기':label}<ChevronDown size={14} aria-hidden="true"/></button>}</div>;
}
