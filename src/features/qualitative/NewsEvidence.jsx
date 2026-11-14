const incompleteReasons = {
  search_failed: '검색 처리 미완료',
  insufficient_primary_sources: '직접 확인한 출처 부족',
  publication_time_unverified: '발행 시각 미확인',
  excerpt_unverified: '원문 발췌 미확인',
  scope_or_materiality_unverified: '사건 범위·중요도 미확인',
  conflicting_sources: '출처 간 내용 차이 확인 필요',
  tool_budget_exhausted: '검색 가능 범위 소진',
};
const displayTime = value => {
  if (!value) return '미기록';
  if (!Number.isFinite(Date.parse(value))) return value;
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) + ' KST';
};
function Clock({value}) {
  return <time dateTime={value || undefined} title={value || undefined}>{displayTime(value)}</time>;
}

export function NewsCoverage({news}) {
  if (!news) return null;
  const reason = Object.hasOwn(incompleteReasons, news.incompleteReason) ? incompleteReasons[news.incompleteReason] : null;
  return <>
    {news.coverageCopy && <p className="briefing-note">{news.coverageCopy}</p>}
    {reason && <p className="briefing-note">검색 검토 미완료 사유: {reason}</p>}
    {news.searchComplete == null && ['ready', 'cached', 'stale'].includes(news.status) &&
      <p className="briefing-note">검색 완료 여부가 저장되지 않았습니다.</p>}
  </>;
}

export function newsEmptyCopy(news) {
  if (news?.status === 'disabled') return '뉴스 분석이 꺼져 있습니다.';
  if (news?.status === 'stale') return '이전 저장 자료에는 표시할 사건이 없습니다.';
  if (['ready', 'cached'].includes(news?.status)) {
    if (news.emptyResultVerified === true) return news.status === 'cached' ? '저장된 검색에서 확인된 주요 사건 없음' : '확인된 주요 사건 없음';
    if (news.otherCandidatesUnverified === true) return '표시할 저장 사건 없음 · 다른 후보 근거 미확인';
    if (news.searchComplete === false) return '표시할 저장 사건 없음 · 검색 검토 미완료';
    return '저장된 주요 사건 없음 · 검색 완료 여부 미기록';
  }
  return '검토 가능한 뉴스 자료가 없습니다.';
}

export function NewsEvidenceSummary({item}) {
  const sources = item.sources || [];
  const cited = sources.some(source => source.sourceVerification === 'provider_citation');
  const verified = sources.length > 0 && sources.every(source => source.sourceVerification === 'independent_original');
  const clockUnverified = cited || item.publicationTimeUnverified === true;
  const label = cited ? '검색 참조 포함 · 원문 별도 확인' : verified ? '발췌·발행 시각 확인' : '출처 확인 수준 미기록';
  return <p className="briefing-note" aria-label="출처 확인 수준">
    <span>{label}</span><span> · 보도 표기 <Clock value={item.publishedAt}/>
      {clockUnverified ? ' · 원문 시각 미확인' : !verified ? ' · 원문 시각 확인 여부 미기록' : ''}
    </span>
  </p>;
}

export function NewsSourceEvidence({source}) {
  const verified = source.sourceVerification === 'independent_original';
  const cited = source.sourceVerification === 'provider_citation';
  const publishedAt = source.sourcePublishedAt || source.publishedAt;
  return <>
    <p className="briefing-note">{verified ? '발췌·발행 시각 확인' : cited ? '검색 참조 · 원문 별도 확인' : '확인 수준 미기록'}</p>
    <div className="briefing-clocks"><span>{verified ? '발표' : '보도 표기'} <Clock value={publishedAt}/>
      {cited ? ' · 원문 시각 미확인' : !verified ? ' · 원문 시각 확인 여부 미기록' : ''}
    </span>{source.sourceReceivedAt ? <span>원문 수신 <Clock value={source.sourceReceivedAt}/></span> : <span>원문 수신 시각 미기록</span>}</div>
    {source.receivedByDataCutoff === false && <p className="briefing-note">원문 수신은 자료 기준 이후입니다.</p>}
    <p className="briefing-note">{verified ? '확인 범위: 제공된 원문 발췌와 발행 시각' : cited ? '확인 범위: 검색 결과에서 참조된 주소' : '원문과 발행 시각의 확인 여부가 저장되지 않았습니다.'}</p>
  </>;
}
