import { useState } from "react";
import { briefingClocks, insightView, roleLabel, isMockResponse, probeResponseLabel, roleReviewState, roleReviewBadge } from "./briefing-model.js";
import "./briefing.css";
import {roleDocumentView} from "./role-documents.js";
import {roleTaxonomyFor} from './role-taxonomy.js';
function Evidence({
  data,
  insight
}) {
  const sourceIds = insight.fact_ids.flatMap(id => data.computed.facts[id].sources);
  return <details className="brief-evidence"><summary>근거와 비교 기준 보기</summary>
    <p>숫자와 후보 변화는 저장된 엔진 결과를 코드로 비교했습니다. {isMockResponse(data) ? "해석은 모의 응답입니다." : "해석은 원문 확인이 필요한 보조 분석입니다."}</p>
    <dl>{[...new Set(sourceIds)].map(id => {
        const matches = Object.entries(data.engines).flatMap(([name, versions]) => Object.entries(versions).filter(([, source]) => source.source_id === id).map(([when, source]) => ({
          name,
          when,
          source
        })));
        return matches.map(({
          name,
          when,
          source
        }) => <div key={id}><dt>{name} · {when === "current" ? "이번" : "이전"} 결과</dt>
        <dd>{source.as_of} · {source.contract}<br /><code>{id}</code></dd></div>);
      })}</dl>
  </details>;
}
function Briefing({
  data
}) {
  const available = data.status === "ready" || data.status === "cached";
  const comparable = available && ["TENX", "MLG"].some(name => {
    const engine = data.engines[name];
    return engine.current.status === "valid" && engine.previous.status === "valid" && engine.current.session === data.session && engine.current.contract === engine.previous.contract;
  });
  return <section aria-labelledby="brief-title"><div className="brief-section-heading"><span>01 / BRIEFING</span><h2 id="brief-title">먼저 살펴볼 변화</h2><p>핵심 판단을 읽고, 필요할 때 근거를 펼쳐 보세요.</p></div>
    {!available ? <div className="brief-empty" role="status"><h3>브리핑을 준비하지 못했습니다</h3><p>스크리너 결과는 그대로 유지됩니다. 현재 시장에 대한 해석을 대신 만들지 않습니다.</p><p>다음 유효한 브리핑이 준비되면 다시 확인할 수 있습니다.</p></div> : <>
      {!data.computed.market_available ? <div className="brief-notice" role="status"><strong>시장 판단은 잠시 보류합니다</strong><p>Radar 자료가 기준일과 맞지 않거나 확인되지 않았습니다. 아래에서는 스크리너에서 확인된 변화만 살펴봅니다.</p></div> : null}
      {data.insights.length === 0 ? <div className="brief-empty"><h3>{comparable ? "추가로 짚을 주요 변화가 없습니다" : "변화를 비교할 자료가 부족합니다"}</h3><p>같은 내용을 새 변화처럼 만들지 않았습니다. 데이터 기준일과 기존 후보를 확인해 주세요.</p></div> : data.insights.map((insight, index) => {
        const view = insightView(insight, data.computed.facts);
        return <article className="brief-card" key={`${insight.kind}:${insight.fact_ids.join(",")}`}><div className="brief-card-number">{String(index + 1).padStart(2, "0")}</div><div className="brief-card-body"><h3>{view.title}</h3><p className="brief-fact"><span>확인된 사실</span>{view.fact}</p><p className="brief-interpretation"><span>함께 생각할 점 · {isMockResponse(data) ? "모의 해석" : "보조 해석"}</span>{view.interpretation}</p><details className="brief-reason"><summary>반대 근거와 다음 확인할 것</summary><h4>반대 근거 · 아직 모르는 것</h4><p>{view.counter}</p><h4>지금 확인 · 기다릴 조건</h4><p>{view.check}</p></details><Evidence data={data} insight={insight} /></div></article>;
      })}
    </>}
  </section>;
}
function CitationSource({ source, demo }) {
  if (!source) return null;
  const synthetic = source.kind === "TEST" || source.source_unit === "synthetic_contract_fixture";
  return <small>{synthetic ? "합성 검증 자료 · 실제 제공자 원문 아님" : <a href={source.url} target="_blank" rel="noreferrer">{demo ? `${source.kind} 제공 링크` : `${source.kind} 원문`}</a>}
    <br/>공시일 {source.published_on || "확인 불가"} · 보고기간 {source.report_period || "확인 불가"}
    <br/>실제 이용가능시각 {source.available_at || "확인 불가"} · 이용 확인일 {source.available_on}
    {source.availability_scope ? <><br/>수집 확인 범위의 시각이며 최초 공개 시각은 아닙니다.</> : null}
    {source.source_unit === "supplied_excerpt_only" ? <><br/>제공된 발췌문만 검토 · 전체 문서 검증 아님</> : null}
  </small>;
}
function SupplyRoles({
  data
}) {
  const [filter, setFilter] = useState("all");
  const review = roleReviewState(data);
  const roleTaxonomy = roleTaxonomyFor(data);
  const activeFilter = review.baselineDisplayAvailable ? filter : "all";
  const roles = review.roles.filter(role => activeFilter === "all" || role.comparison === "review");
  return <section aria-labelledby="supply-title"><div className="brief-section-heading"><span>02 / BUSINESS EVIDENCE</span><h2 id="supply-title">공급망에서 맡은 역할</h2><p>AI라는 단어보다 실제 공급하는 제품과 사업 시점을 확인합니다.</p></div>
    <div className="brief-notice"><strong>검토용 분류입니다 · 기존 점수·순위 유지</strong><p>원문을 구조화한 {isMockResponse(data) ? "모의 결과" : "보조 분류"}입니다. 실제 공급 여부의 최종 검증이나 AI 매출 비중 확인을 뜻하지 않습니다. 자료가 없으면 ‘미확인’으로 남깁니다.</p><p className="brief-muted">현재·계획·과거는 인용 자료의 시점을 뜻하며, 그 이후 사업 변화는 확인하지 않았습니다.</p></div>
    <div className="brief-notice" role="status" data-role-review-state={review.state}><strong>{review.title}</strong><p>{review.explanation}</p><details><summary>검토 범위와 보류 이유</summary><p>이 화면은 문서의 사업 역할을 확인하기 위한 보조 자료입니다. 과거 계산의 전체 원본 자료를 확보하지 못한 상태에서는 엔진 전체 검증이 끝났다고 표시하지 않습니다. 일부 자료의 검사는 전체 점수·순위의 재검증을 대신하지 않습니다.</p><p>자료 시점과 원문 근거를 확인한 뒤 다시 대조합니다. 새 분류를 기존 점수와 순위에 반영하지 않습니다.</p></details></div>
    {review.roles.length ? <div className="brief-filter" role="group" aria-label="분류 필터"><button aria-pressed={activeFilter === "all"} onClick={() => setFilter("all")}>전체 기업</button><button aria-pressed={activeFilter === "review"} disabled={!review.baselineDisplayAvailable} onClick={() => setFilter("review")}>기존 분류와 다른 기업</button><span>{roles.length}개 기업</span></div> : null}
    <details className="brief-evidence"><summary>공급망 역할의 판단 기준</summary><p>제품명이나 기업 상식으로 빈 근거를 채우지 않습니다. 역할과 시제는 서로 독립적으로 판단합니다.</p><dl>{roleTaxonomy.role_priority.map(role=><div key={role}><dt>{roleLabel(role)}</dt><dd>{roleTaxonomy.labels_ko[role]}</dd></div>)}</dl></details>
    {roles.length === 0 ? <p className="brief-empty">{review.roles.length ? "현재 보기 조건에 해당하는 기업이 없습니다." : "검토할 자료와 결과를 확인한 뒤 표시하겠습니다. 해당 사업이 없다는 뜻은 아닙니다."}</p> : <div className="brief-role-grid">{roles.map(role => {
        const document = roleDocumentView(data, role);
        return <article className="brief-role" key={role.symbol}><header><h3>{role.symbol}</h3><span className={role.comparison === "review" || !review.baselineDisplayAvailable ? "brief-tag review" : "brief-tag"}>{roleReviewBadge(role, review)}</span></header><h4>{roleLabel(document.role)}</h4><p>{document.statement}</p><p>{document.current}</p><dl className="brief-comparison"><div><dt>기존 규칙 표시</dt><dd>{!review.baselineDisplayAvailable ? "대조 보류" : role.baseline_supported ? "기존 가점 적용" : "기존 가점 미적용"}</dd></div><div><dt>점수 반영</dt><dd>없음</dd></div></dl><details><summary>{document.evidence.length ? "원문 근거와 한계 보기" : "미확인인 이유 보기"}</summary>
        {document.evidence.length === 0 ? <p>허용된 자료에서 근거를 확인하지 못했습니다. 해당 사업이 없다는 뜻은 아닙니다.</p> : document.evidence.map((evidence, index) => {
              const source = document.sources.find(item => item.id === evidence.source_id);
              return <div className="brief-quote" key={index}><p>{document.evidenceLabel || (data.demo ? "검증자료의 인용 구간" : "출처 · 원문")}</p><blockquote lang="en">{evidence.quote}</blockquote><CitationSource source={source} demo={data.demo} /></div>;
            })}
        {document.counterEvidence.map((evidence, index) => <div className="brief-counter" key={index}><strong>{document.counterLabel}</strong><blockquote lang="en">{evidence.quote}</blockquote><CitationSource source={document.sources.find(source => source.id === evidence.source_id)} demo={data.demo} /></div>)}<p className="brief-muted">{document.detail}</p>{document.reviewNote ? <p className="brief-muted">{document.reviewNote}<br/>문서 검토 시각 {document.assessedAt} · 브리핑 생성 시각과 별도</p> : null}<p className="brief-muted">{role.uncertainty === "revenue_not_verified" ? "AI 관련 매출 비중과 실적 기여는 확인하지 않았습니다." : "현재 사업 여부나 공급 범위를 확정할 자료가 부족합니다."}</p>
      </details></article>;
      })}</div>}
  </section>;
}
export function BriefingView({
  data,
  toolbar = null,
  timeZone = "UTC",
  receivedClocks
}) {
  const [tab, setTab] = useState("briefing");
  const clocks = briefingClocks(data, timeZone, receivedClocks);
  return <div className="brief-demo" data-build-id={__BUILD_ID__} data-input-hash={data.identity?.input_hash || "unavailable"}><a className="brief-skip" href="#brief-main" onClick={event => {event.preventDefault();document.getElementById("brief-main")?.focus();}}>본문으로 이동</a><header className="brief-top"><a href="./" className="brief-brand">GENERAL SCREENER</a><span>기능 미리보기</span><span className="brief-tag review">{data.execution_mode === "provider_test" ? probeResponseLabel(data) : data.demo ? "DEMO · 모의 데이터" : data.execution_mode === "fake_transport" ? "OFFLINE · 모의 응답" : "검토 브리핑"}</span></header>
    <div className="brief-demo-note"><strong>{data.execution_mode === "provider_test" ? "과거 합성 자료의 격리 검증" : data.demo ? "개발 검토용 예시" : "근거 확인이 필요한 분석"}</strong><span>{isMockResponse(data) ? "저장된 입력과 모의 응답입니다. 현재 시장 판단이나 추천 결과가 아닙니다." : "자료 기준일과 원문 근거를 확인하세요. 정성 분류는 점수에 반영되지 않습니다."}</span></div>
    <main id="brief-main" className="brief-main" tabIndex={-1}><div className="brief-hero"><div><p className="brief-eyebrow">MARKET & CANDIDATES</p><h1>시장과 후보를<br className="brief-mobile-break" /> 함께 읽는 브리핑</h1><p>달라진 것, 함께 볼 위험,<br className="brief-mobile-break" /> 다음 확인할 것을 한눈에.</p></div>{toolbar}</div>
      <div className="brief-clocks" aria-label="자료 기준일">{clocks.engines.map(clock => <div key={clock.name}><strong>{clock.name}</strong><span>{clock.asOf || "확인되지 않음"}</span><small>{clock.label}</small>{clock.reported ? <small>원자료 보고 {clock.reported}<br/>데이터 기준일과 다릅니다</small> : null}</div>)}<div><strong>{clocks.generationLabel}</strong><span>{clocks.generated || "생성되지 않음"}</span><small>{clocks.session ? `대상 미국 거래일 ${clocks.session}` : "대상 거래일 확인 불가"}</small>{clocks.previousGenerated ? <small>이전 브리핑 생성 {clocks.previousGenerated}</small> : null}</div></div>
      <nav className="brief-tabs" aria-label="검토 기능"><button aria-current={tab === "briefing" ? "page" : undefined} onClick={() => setTab("briefing")}>투자 브리핑</button><button aria-current={tab === "roles" ? "page" : undefined} onClick={() => setTab("roles")}>공급망 역할 검토</button></nav>
      {tab === "briefing" ? <Briefing data={data} /> : <SupplyRoles key={data.identity?.input_hash || data.status} data={data} />}
      <footer className="brief-footer"><p>{isMockResponse(data) ? "모의 응답 · 투자 판단에 사용하지 마세요" : "자료 기준일과 원문 확인 필요 · 점수 반영 없음"}</p><details><summary>처리 이력과 검토 범위</summary><p>기존 엔진의 점수·순위·경보는 변경하지 않습니다. 공급 역할은 별도 검토 결과로만 남깁니다. TENX와 Radar의 정성 입력 보강은 후속 검증 대상입니다.</p>{data.identity ? <dl><div><dt>입력 해시</dt><dd><code>{data.identity.input_hash}</code></dd></div><div><dt>모델 · 프롬프트 · 스키마</dt><dd>{data.identity.model} · {data.identity.prompt_version} · {data.identity.schema_version}</dd></div></dl> : <p>브리핑 생성이 완료되지 않았습니다.</p>}</details></footer>
    </main></div>;
}
