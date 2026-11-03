const roles = Object.freeze({
  compute: "컴퓨팅",
  semiconductor: "반도체",
  interconnect: "연결 부품",
  power_cooling: "전력·냉각",
  cloud: "클라우드",
  unknown: "확인되지 않음"
});
export const periodLabel = Object.freeze({
  current: "현재 사업",
  planned: "계획 단계",
  past: "과거 사업",
  unknown: "시점 미확인"
});
export function roleLabel(role) {
  return roles[role] || "확인되지 않음";
}
export function isMockResponse(data) {
  if(data.execution_mode==='provider_test') return data.probe_context?.response_origin!=='openai_network'||data.probe_context?.call_status!=='complete';
  return data.demo||data.execution_mode==='fake_transport';
}
export function probeResponseLabel(data) {
  return isMockResponse(data)?'격리 시험 · 주입 응답':'격리 시험 · 실제 GPT 응답';
}
export function probeStatusLabel(context) {
  if(context?.call_status==='insufficient_zero_calls') return '자료가 부족해 GPT를 호출하지 않았습니다';
  if(context?.call_status==='failed_reservation_retained') return '응답 또는 근거 확인을 마치지 못해 새 결과를 표시하지 않습니다';
  if(context?.call_status==='not_sent') return '이번 조건의 새 응답을 생성하지 않았습니다';
  if(context?.call_status==='complete') return context.response_origin==='openai_network'?'실제 GPT 응답의 격리 검증':'오프라인 주입 응답의 계약 검증';
  return '응답 확인 전입니다';
}
export function engineState(snapshot, session) {
  if (!snapshot) return "자료 확인 불가";
  if (snapshot.status !== "valid") return "확인 보류";
  return snapshot.session === session ? "기준일 일치" : "이전 자료";
}
export function formatBriefingTime(value, timeZone = "UTC") {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date)} ${timeZone}`;
}
export function briefingClocks(data, timeZone = "UTC") {
  const complete = ["ready", "cached"].includes(data.status);
  // An archive must be supplied explicitly. Never borrow the normal scenario's clocks.
  const previous = !complete && data.previous_is_current === false ? data.previous_briefing : null;
  const visible = complete ? data : previous;
  return {
    generated: complete ? formatBriefingTime(data.generated_at, timeZone) : null,
    generationLabel: complete ? "브리핑 생성" : "새 브리핑",
    previousGenerated: previous ? formatBriefingTime(previous.generated_at, timeZone) : null,
    session: visible?.session || null,
    engines: ["Radar", "TENX", "MLG"].map(name => {
      const snapshot = visible?.engines?.[name]?.current;
      return {
        name,
        asOf: snapshot?.as_of || null,
        label: previous ? "이전 결과" : engineState(snapshot, visible?.session)
      };
    })
  };
}
export function insightView(item, facts) {
  // All prose comes from reviewed templates. Numeric differences stay code-owned.
  const changes = item.fact_ids.map(id => facts[id]).filter(fact => fact.kind === "candidate_change");
  if (item.kind === "market_conflict") return {
    title: "후보 변화와 시장 경계를 함께 보세요",
    fact: changes.map(change => `Radar는 경계 상태입니다. ${change.engine} 후보는 이전 대비 ${change.count_delta > 0 ? "+" : ""}${change.count_delta}개, 새 편입 ${change.entered.length}개·제외 ${change.exited.length}개입니다.`).join(" "),
    interpretation: "개별 후보의 변화와 시장 전체의 위험은 서로 다른 신호입니다. 후보가 늘었다는 사실만으로 시장이 좋아졌다고 보기는 어렵습니다.",
    counter: "후보 증가는 일부 업종의 변화일 수 있습니다. 시장 전반으로 확산됐는지는 확인되지 않았습니다.",
    check: "새 후보의 업종 쏠림과 가격·거래량을 확인하세요. 시장 판단은 다음 유효한 Radar 결과를 기다립니다."
  };
  if (item.kind === "shared_exposure") return {
    title: "두 엔진이 고른 같은 기업, 노출도 겹칩니다",
    fact: `공통 후보: ${facts.exposure.symbols.join(", ")}. 공통 업종: ${facts.exposure.sectors.join(", ")}.`,
    interpretation: "서로 다른 기준이 같은 기업을 선택했습니다. 동시에 비슷한 사업 위험에 노출될 가능성도 살펴볼 필요가 있습니다.",
    counter: "엔진의 일치는 독립된 수익 보장이나 추가 매수 신호가 아닙니다. 업종이 같아도 실제 매출 구성은 다를 수 있습니다.",
    check: "후보별 사업 구성과 공통 위험을 확인하세요. 현재 보유 비중은 이 화면에 포함하지 않습니다."
  };
  return {
    title: "바뀐 후보부터 확인하세요",
    fact: changes.map(change => `${change.engine} 새 편입 ${change.entered.join(", ") || "없음"} · 제외 ${change.exited.join(", ") || "없음"}. 후보 수 차이 ${change.count_delta > 0 ? "+" : ""}${change.count_delta}개.`).join(" "),
    interpretation: "후보 구성이 바뀌었습니다. 시장 전체에 대한 판단은 유효한 Radar 결과를 확인한 뒤 연결할 수 있습니다.",
    counter: "후보 변화만으로 실적 개선이나 투자 매력을 확정할 수 없습니다.",
    check: "편입·제외 기업의 근거를 비교하세요. 시장 판단은 새 유효 자료가 확인될 때까지 보류합니다."
  };
}
