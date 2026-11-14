import {ReviewClock} from './ReviewClock.jsx';
import {ReviewText} from './ReviewText.jsx';
import {safeSourceUrl} from '../features/qualitative/briefing-model.js';

const apiLabels = {completed: 'API 응답 기록 완료', failed: '평가 실패·미완료', missing: '응답 기록 미수신'};
const adoptionLabels = {evaluated: '규칙 적용 기록', cached: '저장된 규칙 적용 기록', held: '채택 보류', unevaluated: '미평가', missing: '채택 기록 미수신'};
const reasonLabels = {
  provider_completed: 'API 평가 응답이 완료됐습니다.',
  incomplete_collection: '뉴스 수집 범위가 불완전해 정성 점수 채택을 보류했습니다.',
  provider_or_contract_failure: '분석 응답을 확인할 수 없어 평가를 보류했습니다.',
  not_evaluated: '정성 평가를 수행하지 않았습니다.',
};
const profileLabels = {
  q3_one_real_company: '저장 회사 1건의 실제 API 검토',
  legacy_six_request: '과거 6요청 저장 검토',
};
const code = value => typeof value === 'string' && /^[a-z][a-z0-9_]{1,99}$/.test(value);
const reasonText = value => Object.hasOwn(reasonLabels, value) ? reasonLabels[value] : code(value) ? '판정 상태의 추가 확인이 필요합니다.' : value;
const label = (map, key, fallback) => Object.hasOwn(map, key) ? map[key] : fallback;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR', {maximumFractionDigits: 3}) : '미기록';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : '미기록';
const accepted = adoption => ['evaluated', 'cached'].includes(adoption?.status);
const profileTitle = profile => label(profileLabels, profile.id, '저장 API 검토');
const qualityScope = value => ['one_company', 'q3_one_real_company'].includes(value) ? '저장 회사 1건의 선택 근거 범위' : ['legacy_six_request', 'six_case_legacy'].includes(value) ? '과거 6요청에 기록된 검토 범위' : code(value) ? '연결된 영수증의 한정 범위' : value;

function Adoption({item}) {
  const value = item.adoption;
  if (!value) return <p className="review-hold">정성 채택 기록이 없습니다. 미평가를 0점으로 채우지 않습니다.</p>;
  const adopted = accepted(value);
  const fields = item.strategy === 'tenx'
    ? [['원점수 S', value.quantitative_score], ['채택 Q', adopted ? value.q : '미평가'], ['참고 T', adopted ? value.adjusted_score : '미산출']]
    : [['기존 E', value.baseline_e], ['제안 E', adopted ? value.proposed_e : '미평가'], ['기존 A', value.baseline_a], ['제안 A', adopted ? value.proposed_a : '미평가']];
  return <details className="review-source">
    <summary>규칙 적용 결과 · 채택/보류</summary>
    <p className="review-note">{label(adoptionLabels, value.status, '채택 상태 확인 필요')}{!adopted && ' · 점수 미평가'}</p>
    <dl className={'review-score-strip'+(item.strategy==='mlg'?' is-mlg':'')}>{fields.map(([name, score]) => <div key={name}><dt>{name}</dt><dd>{typeof score === 'string' ? score : score == null ? (name === '참고 T' ? '미산출' : '미평가') : number(score)}</dd></div>)}</dl>
    {adopted && item.strategy === 'mlg' && (typeof value.adopted_e === 'number' || typeof value.adopted_a === 'number') && <p className="review-note">기록된 적용 E {number(value.adopted_e)} · A {number(value.adopted_a)}</p>}
    {adopted && typeof value.score_delta === 'number' && <p className="review-note">기록된 총점 변화 {number(value.score_delta)}</p>}
    {value.reason && <ReviewText>{reasonText(value.reason)}</ReviewText>}
    {code(value.reason) && <details className="review-source"><summary>판정 상태 기록</summary><p className="review-note">{value.status} · {value.reason}</p></details>}
  </details>;
}

function ProposalEvents({events}) {
  if (!events?.length) return null;
  return <details className="review-source"><summary>모델 제안 사건 {events.length}건</summary>
    <p className="review-note">모델의 제안과 위의 규칙 적용 결과를 각각 보존합니다.</p>
    {events.map((event, index) => <section key={event.id || index}>
      {event.reason && <ReviewText>{reasonText(event.reason)}</ReviewText>}
      {typeof event.model_q === 'number' ? <p className="review-note">모델 제안 Q {number(event.model_q)}</p> : typeof event.q === 'number' ? <p className="review-note">모델 제안 Q {number(event.q)}</p> : null}
      {event.scoring_excluded === true && <p className="review-note">점수 제외 기록</p>}
    </section>)}
  </details>;
}

function Case({item, controlNumber}) {
  const title = item.kind === 'fictional_control' ? '가상 대조 ' + controlNumber : item.company_name || item.symbol || 'Radar';
  const apiCompleted = item.api_status === 'completed';
  const apiReason = item.api_reason === 'provider_completed' && !apiCompleted
    ? '완료 기록과 필수 근거의 결속을 확인하지 못했습니다.' : reasonText(item.api_reason);
  return <article className="review-card" aria-label={title + ' API 검토'}>
    <header><h3>{title}{item.symbol && item.company_name ? <small> · {item.symbol}</small> : null}</h3><span className="review-tag">{label(apiLabels, item.api_status, '응답 상태 미확인')}</span></header>
    <p className="review-note">{item.kind === 'fictional_control' ? '명시적 가상 경계 사례 · 실제 회사 판단·추천 통계에서 제외' : item.kind === 'radar' ? '저장된 Radar API 응답 기록 · 원문 채택·봉인은 별도 검토' : '원래 저장 입력의 새 API 평가 · 선택된 회사 근거 범위'}</p>
    <p className="review-note">자료 기준 <ReviewClock value={item.source_cutoff}/> · API 분석 <ReviewClock value={item.api_analyzed_at}/></p>
    {item.collection_complete === false && <p className="review-note">저장 입력의 수집 범위는 불완전합니다. 선택 근거 검토와 회사 전체 수집 완료는 별개입니다.</p>}
    {apiReason && <p className="review-note">{apiCompleted ? '평가 상태: ' : '보류 사유: '}{apiReason}</p>}
    {item.kind !== 'radar' && <>
      {item.ai_reason && <><p className="review-note">모델의 AI 사업 제안</p><ReviewText>{item.ai_reason}</ReviewText></>}
      {item.ai_supply === 'unknown' && <p className="review-note">AI 공급 역할은 미확인입니다. 기존 가점 유지 기록과 새 공급 가점 판정을 구분합니다.</p>}
      <Adoption item={item}/><ProposalEvents events={item.events}/>
    </>}
    {item.sources?.length > 0 && <details className="review-source"><summary>입력 근거 URL·원래 발표 표기</summary>
      {item.sources.map((source, index) => <div key={source.url + '-' + index}><p className="review-note">원래 발표 표기 {source.published_at || '미기록'}</p>{safeSourceUrl(source.url) && <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label || '원문 열기'}</a>}</div>)}
    </details>}
    <details className="review-source"><summary>실행 식별 기록</summary>
      <p className="review-note">{item.case_id}</p>
      {item.api_reason && <p className="review-note">실행 상태 코드 {item.api_reason}</p>}
    </details>
  </article>;
}

function Profile({profile}) {
  const cases = profile.cases || [];
  const actual = cases.filter(item => item.kind === 'actual_saved_company');
  const controls = cases.filter(item => item.kind === 'fictional_control');
  const radar = cases.filter(item => item.kind === 'radar');
  const complete = cases.filter(item => item.api_status === 'completed').length;
  const report = profile.report || {};
  const execution = profile.execution || {};
  const quality = profile.quality || {};
  const estimate = report.estimated_cost_microusd;
  return <section className="review-section" aria-label={profileTitle(profile)}>
    <header className="review-section-heading"><h3>{profileTitle(profile)}</h3><span className="review-tag">운영 미반영</span></header>
    <p>요청 구성: 실제 저장 회사 {count(report.actual_companies)}건 · 가상 대조 {count(report.fictional_controls)}건 · Radar {count(report.radar_requests)}건입니다. 완료된 API 응답 기록 {complete}/{count(report.expected_requests)}건을 표시합니다.</p>
    <p className="review-hold">API 응답 완료·정성 채택·품질 검토는 서로 다른 상태입니다. 요청 수와 자동검사 결과로 전체 품질을 판정하지 않습니다.</p>
    <p className="review-note">{['complete_within_scope', 'reviewed_with_limitations'].includes(quality.status) ? '표시된 범위의 수동 품질 검토 기록이 연결돼 있습니다.' : quality.status === 'partial' || quality.status === 'held' ? '품질 검토의 일부가 보류되었거나 추가 확인이 필요합니다.' : '수동 품질 검토 기록은 아직 연결되지 않았습니다.'}</p>
    {quality.scope && <p className="review-note">검토 범위: {qualityScope(quality.scope)}</p>}
    <p className="review-note">현재 회사 전체 사실·수집 완료·숫자 보정의 확인 범위는 각 검토 기록의 한계를 따릅니다.</p>
    {quality.limitations?.length > 0 && <details className="review-source"><summary>검토 범위와 남은 한계</summary>{quality.limitations.map((text, index) => <ReviewText key={index}>{text}</ReviewText>)}</details>}
    <p className="review-note">{profile.binding?.receipt_sha256 ? '연결된 실행·결속 근거 기록을 아래에서 확인할 수 있습니다.' : '실행·요청·사용량 결속 근거 기록 미연결'}</p>
    {actual.map(item => <Case key={item.case_id} item={item}/>)}
    {controls.length > 0 && <details className="review-archive"><summary>가상 대조 {controls.length}건 · 실기업 아님</summary><div>{controls.map((item, index) => <Case key={item.case_id} item={item} controlNumber={index + 1}/>)}</div></details>}
    {radar.map(item => <Case key={item.case_id} item={item}/>)}
    {report.radar_requests === 0 && <p className="review-note">이 요청 묶음의 Radar API 요청은 0건입니다. 기존 저장 뉴스와 별도 원문 검토는 Radar 탭에서 확인합니다.</p>}
    <details className="review-source"><summary>실행 출처·비용·검토 기록</summary>
      <p className="review-note">실행 {execution.run_id || '미기록'} · artifact {execution.artifact_id || '미기록'}</p>
      <p className="review-note">저장 실행 기준 <ReviewClock value={execution.source_cutoff}/> · 기록된 분석 <ReviewClock value={execution.analyzed_at}/></p>
      <p className="review-note">소스 {execution.source_head || profile.binding?.source_head || '미기록'}</p>
      {profile.binding?.archive_sha256 && <p className="review-note">artifact SHA-256 {profile.binding.archive_sha256}</p>}
      {profile.binding?.receipt_sha256 && <p className="review-note">검토 기록 SHA-256 {profile.binding.receipt_sha256}</p>}
      <p className="review-note">실행·artifact를 대조한 자체 검토 기록에 따릅니다. JSON 자체가 실제 API 출처를 인증하지 않습니다.</p>
      <p className="review-note">설정 단가 기준 비용 추정 {typeof estimate === 'number' ? '$' + (estimate / 1000000).toFixed(6) : '미기록'} · 실제 청구액 미확인</p>
      <p className="review-note">예약액과 불명 비용을 사용량 0이나 실제 청구액으로 바꾸지 않습니다. 이 화면에서 새 API 요청을 실행하지 않습니다.</p>
    </details>
  </section>;
}

export function FinalLiveReview({value}) {
  if (!value?.profiles?.length) return null;
  const selected = value.profiles.find(profile => profile.id === value.selected_profile) || value.profiles[0];
  const previous = value.profiles.filter(profile => profile !== selected);
  return <section className="review-section" aria-label="저장 API 검증 부록">
    <header className="review-section-heading"><h2>저장 API 검증 부록</h2><span className="review-tag">운영 미반영</span></header>
    <Profile profile={selected}/>
    {previous.length > 0 && <details className="review-archive"><summary>이전 요청 묶음 {previous.length}개</summary><div>{previous.map(profile => <Profile key={profile.id} profile={profile}/>)}</div></details>}
    <p className="review-note">부록 구성 <ReviewClock value={value.created_at}/> · 기존 회사·숫자·저장 뉴스는 입력 원본의 기록을 유지합니다. 수동 주석의 포함 여부는 검토 자료 범위를 따릅니다.</p>
  </section>;
}
