const short=(x,n)=>typeof x==='string'&&x.trim()&&x.length<=n?x.trim():null;
const labels={positive:'긍정',negative:'부정',neutral:'중립',mixed:'혼합',uncertain:'불확실'};
export function newsPresentation(value) {
  if(value.watch_point===undefined&&value.market_impact===undefined)return {
    watchPoint:'확인할 포인트 미평가 · 기존 해석은 상세에서 확인',
    impact:{direction:'unassessed',label:'시장 영향 미평가',scope:null,condition:null},
  };
  const watchPoint=short(value.watch_point,180),impact=value.market_impact;
  if(!watchPoint||/[\r\n]/.test(watchPoint)||!impact||!Object.hasOwn(labels,impact.direction)
    ||!short(impact.scope,180)||!short(impact.condition,240))return null;
  return {watchPoint,impact:{direction:impact.direction,label:'시장 영향 '+labels[impact.direction],
    scope:short(impact.scope,180),condition:short(impact.condition,240)}};
}
