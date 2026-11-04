// Versioned document semantics. Registry is code-owned; no model field can extend it.
import registry from './document-review-registry.json' with {type:'json'};
import {assertDirectRegistry,directAdmission,DIRECT_REVIEWS_HASH} from './direct-evidence.js';
import {DIRECT_ROLE_PROFILE,DIRECT_TAXONOMY_HASH,SOURCE_ROLE_PROFILE} from './role-taxonomy.js';
import {assertSourceRoleDocumentContract,SOURCE_REVIEW_SCHEMA} from './source-reviewed-documents.js';
export const ROLE_REGISTRY_HASH='c5b8c9d058c1a31f40725a7179aeb1e8c2d65138677bcff6ab5e80abfa8a16d8';
const roles=['compute','semiconductor','interconnect','power_cooling','cloud','unknown'];
const tenses=['present_in_document','planned_in_document','past_in_document','unclear'];
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const canonical=value=>JSON.stringify(sorted(value));
const bytes=text=>new TextEncoder().encode(text);
async function hashText(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const sha=value=>hashText(canonical(value));
function fail(){throw Error('ROLE_DOCUMENT_CONTRACT_INVALID');}
function stamp(value){if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail();return Date.parse(value);}
function day(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail();return value;}
const exact=(value,keys)=>value&&canonical(Object.keys(value).sort())===canonical([...keys].sort());
async function sourceRecord(symbol,source,demo){
  const base=await sha(source);
  const entry=registry.entries.find(e=>e.symbol===symbol&&e.base_source_hash===base&&(demo||!e.demo_only));
  return {symbol,...source,available_at:source.available_at??null,report_period:entry?.report_period??null,source_unit:entry?.source_unit??'supplied_source_record'};
}
async function reviewCompany(company,extraction,assessedAt,demo){
  const assessed=stamp(assessedAt),documents=await Promise.all(company.sources.map(s=>sourceRecord(company.symbol,s,demo)));
  for(const source of documents){
    const published=source.published_on===null?null:day(source.published_on),report=source.report_period===null?null:day(source.report_period);
    const availableDay=day(source.available_on),available=source.available_at===null?null:stamp(source.available_at);
    if(availableDay>new Date(assessed).toISOString().slice(0,10)||available!==null&&(available>assessed||new Date(available).toISOString().slice(0,10)!==availableDay)
      ||published&&published>availableDay||report&&report>(published||availableDay))fail();
  }
  const result={symbol:company.symbol,documents,claim:null,review_status:'held',reason:'no_document_extraction',assessed_at:assessedAt,
    current_verification:{state:'unverified',as_of:null,evidence_ids:[]},engine_comparison:{state:'held'},score_effect:0};
  if(documents.length!==1){if(extraction)fail();result.reason=documents.length?'multi_document_held':'missing_document';return result;}
  if(!extraction)return result;
  if(!exact(extraction,['symbol','source_id','role','document_tense','spans'])||extraction.symbol!==company.symbol||!roles.includes(extraction.role)||!tenses.includes(extraction.document_tense))fail();
  const source=documents[0];
  if(extraction.source_id!==source.id||!Array.isArray(extraction.spans)||!extraction.spans.length||extraction.spans.length>8)fail();
  const points=Array.from(source.text),seen=new Set(),evidence=[];
  for(const span of extraction.spans){
    if(!exact(span,['start','end'])||!Number.isInteger(span.start)||!Number.isInteger(span.end)||span.start<0||span.start>=span.end||span.end>points.length||seen.has(`${span.start}:${span.end}`))fail();
    seen.add(`${span.start}:${span.end}`);
    evidence.push({source_id:source.id,source_version_hash:await sha(source),source_text_hash:await hashText(source.text),
      start:span.start,end:span.end,span_unit:'unicode_codepoints',quote:points.slice(span.start,span.end).join('')});
  }
  result.claim={role:extraction.role,document_tense:extraction.document_tense,evidence};
  const admitted=source.available_at!==null&&evidence.every(e=>registry.entries.some(entry=>e.source_version_hash===entry.source_version_hash
    &&e.start===entry.start&&e.end===entry.end&&extraction.role===entry.role&&extraction.document_tense===entry.tense&&(demo||!entry.demo_only)));
  result.review_status=admitted?'document_reviewed':'held';result.reason=admitted?'complete_proposition_registry_match':'semantic_review_pending';
  return result;
}
export async function assertRoleDocumentContract(artifact){
  // Dispatch before legacy registry metadata is built. New provenance must never
  // inherit report periods/source units or admission from an older profile.
  if(artifact.version===3||artifact.role_document_contract?.profile===SOURCE_ROLE_PROFILE
    ||artifact.role_document_contract?.schema===SOURCE_REVIEW_SCHEMA)return assertSourceRoleDocumentContract(artifact);
  if(bytes(JSON.stringify(artifact)).length>160000||artifact.briefing.companies.length>64)fail();
  if(await sha(registry)!==ROLE_REGISTRY_HASH)fail();
  const contract=artifact.role_document_contract,data=artifact.briefing;
  const direct=contract?.schema==='role_document_reviews_direct_v1';
  if(direct)await assertDirectRegistry();
  if(artifact.version!==2||!['ready','cached'].includes(data.status)||!exact(contract,direct?['schema','registry_version','registry_hash','reviews','profile','taxonomy_hash']:['schema','registry_version','registry_hash','reviews'])
    ||(direct?(contract.profile!==DIRECT_ROLE_PROFILE||contract.taxonomy_hash!==DIRECT_TAXONOMY_HASH||contract.registry_version!=='2026-11-03.contract-fixtures-1'||contract.registry_hash!==DIRECT_REVIEWS_HASH)
      :(contract.schema!=='role_document_reviews_v2'||contract.registry_version!==registry.version||contract.registry_hash!==ROLE_REGISTRY_HASH))
    ||!Array.isArray(contract.reviews)||contract.reviews.length!==data.companies.length)fail();
  const expected=[];
  for(let index=0;index<data.companies.length;index++){
    const row=contract.reviews[index],claim=row?.claim;
    if(row?.symbol!==data.companies[index].symbol)fail();
    const extraction=claim?{symbol:row.symbol,source_id:claim.evidence?.[0]?.source_id,role:claim.role,document_tense:claim.document_tense,
      spans:claim.evidence.map(e=>({start:e.start,end:e.end}))}:null;
    const reviewed=await reviewCompany(data.companies[index],extraction,data.generated_at,data.demo);
    if(direct){
      const admission=directAdmission(data.companies[index],reviewed,data.demo);
      Object.assign(reviewed,{direct_evidence:admission,review_status:admission.state,reason:admission.reason});
    }
    expected.push(reviewed);
  }
  if(canonical(expected)!==canonical(contract.reviews))fail();
  return structuredClone(contract.reviews);
}
const tenseLabels={present_in_document:'문서상 제공 주장',planned_in_document:'문서상 계획',past_in_document:'문서상 과거 내용',unclear:'문서상 시점 불명확'};
const sourceHoldLabels={
  publication_date_unconfirmed:'공시일이 확인되지 않아 역할 주장을 보류합니다. 보고기간이나 수집일을 공시일로 대신하지 않습니다.',
  role_or_document_claim_not_established:'제공된 발췌문만으로 허용된 공급 역할과 문서 시제를 확정하지 못했습니다. 해당 사업이 없다는 뜻은 아닙니다.',
  semantic_mapping_review_pending:'원문에 대한 독립 AI 검토 기록이 있습니다. 제품 분류와 검토 항목의 연결은 아직 독립 검토 중이므로 역할 주장을 보류합니다.',
  source_provenance_unconfirmed:'출처 기록이 승인된 원문 기록과 일치하는지 확인하지 못해 역할 주장을 보류합니다.',
};
export function roleDocumentView(data,role){
  const review=data._validated_role_documents?.find(r=>r.symbol===role.symbol);
  const company=data.companies?.find(c=>c.symbol===role.symbol);
  const sourceReviewed=data._validated_role_profile===SOURCE_ROLE_PROFILE&&review?.source_admission?.profile===SOURCE_ROLE_PROFILE;
  const admitted=review?.review_status==='document_reviewed';
  return {role:admitted?review.claim.role:'unknown',statement:admitted?tenseLabels[review.claim.document_tense]:review?'문서 해석 보류':'이전 분류 · 시간축 분리 전 기록',
    current:'현시점 확인: 미확인',comparison:'대조 보류',admitted,
    evidence:sourceReviewed?(review.claim?.evidence||review.documents.map(source=>({source_id:source.id,quote:source.text}))):review?(review.claim?.evidence||[]):(role.evidence||[]),counterEvidence:review?[]:(role.counter_evidence||[]),
    evidenceLabel:sourceReviewed?'검토한 발췌문 · 역할 확정 아님':null,
    reviewNote:sourceReviewed?`${review.review_disagreement?'독립 검토 사이에 문서 역할 해석이 일치하지 않아 보류합니다. ':''}독립 AI 원문 검토 기록이며 사람 정답이나 분류 정확도 검증을 뜻하지 않습니다.`:null,
    assessedAt:sourceReviewed?review.assessed_at:null,
    counterLabel:'이전 추출의 추가 인용 · 의미 확인 보류',
    sources:review?.documents||(company?.sources||[]).map(source=>({...source,report_period:null})),
    detail:sourceReviewed&&!admitted?(sourceHoldLabels[review.reason]||'출처와 문서 의미의 검증이 완료되지 않아 역할 주장을 보류합니다.'):review?.reason==='multi_document_held'?'문서가 여러 개라 역할과 시제를 합치지 않았습니다. 문서별 근거 검토가 필요합니다.':admitted?'문서의 역할 주장만 검토했습니다. 현재 사업의 지속 여부를 확인한 결과가 아닙니다.':'완전한 명제와 의미 검증을 마치기 전에는 역할 주장을 확정하지 않습니다.'};
}
