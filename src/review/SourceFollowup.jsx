import {ChevronDown,ArrowUpRight} from 'lucide-react';
import {followupPresentation} from './followup-model.js';
import {ReviewText} from './ReviewText.jsx';
import {ReviewClock} from './ReviewClock.jsx';
const evidence={issuer_original_full_text_web_read:'발행사 원문 전체 확인',indexed_original_article_full_text:'검색 색인의 원문 전체 확인',indexed_original_article_full_text_and_tool_publication_metadata:'검색 색인의 원문 전체·발행 정보 확인',ap_authored_syndication:'AP 배포 기사 확인'};
export function SourceFollowup({note,reviewedAt}) {
  const summary=followupPresentation(note.note),sources=note.sources.map(source=>({...source,presentation:followupPresentation(source.note)}));
  const reconstructed=summary.reconstructed||sources.some(source=>source.presentation.reconstructed);
  return <details className="review-source review-followup"><summary>사후 수동 출처 검토<ChevronDown size={15} aria-hidden="true"/></summary>
    <p className="review-note">{reconstructed?'이전 검토 기록 기반 · 새 원문 확인·GPT 판단 아님':'사후 수동 검토 · 새 GPT 판단 아님'} · 원판정 보존</p>
    {reviewedAt&&<p className="review-note">검토 기록 <ReviewClock value={reviewedAt}/></p>}
    <ReviewText label="검토 내용 전체">{summary.text}</ReviewText>
    {sources.map((source,i)=><div className="review-followup-source" key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ArrowUpRight size={14} aria-hidden="true"/></a><ReviewText label="출처 메모 전체">{source.presentation.text}</ReviewText>{source.verified_published_at&&<p className="review-note">별도 확인 발행 시각 <ReviewClock value={source.verified_published_at}/></p>}<small className="review-note">{evidence[source.evidence_class]||'별도 출처 검토'}</small></div>)}
    {reconstructed&&<details className="review-source review-saved-copy"><summary>저장된 검토 문구<ChevronDown size={14} aria-hidden="true"/></summary><p>{note.note}</p>{note.sources.map((source,i)=><div key={i}><h4>{source.label}</h4><p>{source.note}</p></div>)}</details>}
  </details>;
}
