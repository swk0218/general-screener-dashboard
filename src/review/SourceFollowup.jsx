import {ChevronDown,ArrowUpRight} from 'lucide-react';
const evidence={issuer_original_full_text_web_read:'발행사 원문 전체 확인',indexed_original_article_full_text:'검색 색인의 원문 전체 확인',indexed_original_article_full_text_and_tool_publication_metadata:'검색 색인의 원문 전체·발행 정보 확인',ap_authored_syndication:'AP 배포 기사 확인'};
export function SourceFollowup({note}) {
  return <details className="review-source review-followup"><summary>추가 사실 확인 · 원래 판단 보존<ChevronDown size={15} aria-hidden="true"/></summary>
    <p className="review-note">코덱스의 사후 출처 검토입니다. 새 GPT 응답·수집 성공·점수 재평가가 아닙니다.</p>
    <p>{note.note}</p>
    {note.sources.map((source,i)=><div className="review-followup-source" key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ArrowUpRight size={14} aria-hidden="true"/></a><p>{source.note}</p>{source.verified_published_at&&<p className="review-note">별도 확인 발행 시각 {source.verified_published_at}</p>}<small className="review-note">{evidence[source.evidence_class]||'별도 출처 검토'}</small></div>)}
  </details>;
}
