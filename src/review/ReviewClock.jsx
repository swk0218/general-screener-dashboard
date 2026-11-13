export const reviewTime=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' KST':'미확인';
export function ReviewClock({value}) {
  return <time dateTime={value||undefined} title={value||undefined}>{reviewTime(value)}</time>;
}
