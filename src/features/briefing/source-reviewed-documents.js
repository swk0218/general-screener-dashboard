// This reader owns admission. Encrypted candidates cannot supply registries or
// select trust pins. Provenance, receipt and semantic records have separate pins.
import provenance from './source-provenance-registry-v2.json' with {type:'json'};
import receipts from './source-review-receipts-v2.json' with {type:'json'};
import semantics from './source-semantic-registry-v2.json' with {type:'json'};
import taxonomy from './role-taxonomy-v2.json' with {type:'json'};
import {SOURCE_ROLE_PROFILE} from './role-taxonomy.js';

export const SOURCE_REVIEW_SCHEMA='role_document_reviews_source_v2';
export const SOURCE_REVIEW_PINS=Object.freeze({
  provenance_hash:'d4663d477c44a3d3347608b79a9a090df36e36fe3ef9879f5f60c2e267b078f9',
  receipts_hash:'9272e8b907d9c44d8f8a569af8aba4894391e74d10b540495d1411b3b612f4fb',
  semantics_hash:'cf2468c81aa07cab4a8d7e302eee4ec4dad921c36e74da6ca590e173285febc9',
  taxonomy_hash:'d17846017269735550921380bc280b4822f73fc521b1aa1b463525a980b77838',
});
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const canonical=value=>JSON.stringify(sorted(value));
const bytes=value=>new TextEncoder().encode(value);
const hashText=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=value=>hashText(canonical(value));
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&canonical(Object.keys(value).sort())===canonical([...keys].sort());
function fail(){throw Error('SOURCE_ROLE_DOCUMENT_CONTRACT_INVALID');}
function stamp(value){
  if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail();
  return Date.parse(value);
}
function day(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail();
  return value;
}

export async function assertSourceReviewRegistries(){
  for(const [key,value] of Object.entries({provenance_hash:provenance,receipts_hash:receipts,semantics_hash:semantics,taxonomy_hash:taxonomy})){
    if(bytes(canonical(value)).length>256000||await hash(value)!==SOURCE_REVIEW_PINS[key])fail();
  }
  if(receipts.provenance_hash!==SOURCE_REVIEW_PINS.provenance_hash||receipts.taxonomy_hash!==SOURCE_REVIEW_PINS.taxonomy_hash
    ||semantics.provenance_hash!==SOURCE_REVIEW_PINS.provenance_hash||semantics.receipts_hash!==SOURCE_REVIEW_PINS.receipts_hash
    ||semantics.taxonomy_hash!==SOURCE_REVIEW_PINS.taxonomy_hash||canonical(provenance.original_pins)!==canonical(receipts.original_pins))fail();
  if(!Array.isArray(provenance.records)||provenance.records.length<1||provenance.records.length>64)fail();
  const cases=provenance.records.map(record=>record.case_id).sort();
  for(const entries of [provenance.records,receipts.judgments,semantics.entries]){
    if(!Array.isArray(entries)||new Set(entries.map(entry=>entry.case_id)).size!==entries.length
      ||canonical(entries.map(entry=>entry.case_id).sort())!==canonical(cases))fail();
  }
  for(const record of provenance.records){
    const receipt=receipts.judgments.find(row=>row.case_id===record.case_id);
    const semantic=semantics.entries.find(row=>row.case_id===record.case_id);
    if(receipt.source_version_hash!==record.source_version_hash||receipt.quote_sha256!==record.text_sha256
      ||Object.keys(receipt).some(key=>canonical(receipt[key])!==canonical(semantic[key]))
      ||receipt.scope!=='supplied_excerpt_only'||receipt.review_kind!=='independent_AI_source_only'
      ||receipt.human_gold!==false||receipt.current_verified!==false
      ||receipt.role===null&&receipt.role_claim_tense!==null)fail();
  }
}

async function sourceRecord(record,assessedAt){
  if(!record||typeof record!=='object'||Array.isArray(record)||bytes(canonical(record)).length>32000)fail();
  // Hash the complete record exactly once, before constructing claim/admission.
  // Unknown sources do not enter this explicitly source-reviewed profile.
  const version=await hash(record);
  if(provenance.records.filter(row=>row.source_version_hash===version&&row.symbol===record.symbol
    &&row.case_id===record.case_id&&row.id===record.id&&row.text_sha256===record.text_sha256).length!==1)fail();
  const source=structuredClone(record),hosts={SEC:'www.sec.gov',FMP:'financialmodelingprep.com',FRED:'fred.stlouisfed.org',TEST:'example.invalid'};
  const authority=typeof source.url==='string'?/^https:\/\/([^/?#]*)/i.exec(source.url.trim())?.[1]:null;
  if(!authority||/[%\\]/.test(authority))fail();
  const rawHostname=authority.split('@').at(-1).split(':')[0];
  if(!/^[\x00-\x7f]*$/.test(rawHostname)||rawHostname.toLowerCase()!==hosts[source.kind])fail();
  let url;try{url=new URL(source.url);}catch{fail();}
  if(url.protocol!=='https:'||url.hostname!==hosts[source.kind]||url.username||url.password||url.search||url.hash
    ||source.source_unit!=='supplied_excerpt_only'||typeof source.text!=='string'||await hashText(source.text)!==source.text_sha256)fail();
  const available=stamp(source.available_at),retrieved=stamp(source.retrieved_at),assessed=stamp(assessedAt);
  const availableDay=day(source.available_on),published=source.published_on===null?null:day(source.published_on),report=day(source.report_period);
  if(available>assessed||retrieved>assessed||new Date(available).toISOString().slice(0,10)!==availableDay
    ||published!==null&&published>availableDay||report>(published||availableDay))fail();
  return {source,version};
}

async function reviewSource(record,extraction,assessedAt){
  const {source,version}=await sourceRecord(record,assessedAt);
  let claim=null,reason='no_document_extraction',state='held';
  if(extraction!==null){
    if(!exact(extraction,['symbol','source_id','role','document_tense','spans'])||extraction.symbol!==source.symbol
      ||extraction.source_id!==source.id||!taxonomy.role_priority.includes(extraction.role)
      ||!['present_in_document','planned_in_document','past_in_document','unclear'].includes(extraction.document_tense)
      ||!Array.isArray(extraction.spans)||extraction.spans.length!==1)fail();
    const span=extraction.spans[0],points=Array.from(source.text);
    if(!exact(span,['start','end'])||!Number.isInteger(span.start)||!Number.isInteger(span.end)
      ||span.start<0||span.start>=span.end||span.end>points.length)fail();
    claim={role:extraction.role,document_tense:extraction.role==='unknown'?null:extraction.document_tense,
      evidence:[{source_id:source.id,source_version_hash:version,source_text_hash:source.text_sha256,
        start:span.start,end:span.end,span_unit:'unicode_codepoints',quote:points.slice(span.start,span.end).join('')}]};
    const receipt=receipts.judgments.find(row=>row.case_id===source.case_id),entry=semantics.entries.find(row=>row.case_id===source.case_id);
    const matches=entry.source_version_hash===version&&receipt.source_version_hash===version
      &&entry.start===span.start&&receipt.start===span.start&&entry.end===span.end&&receipt.end===span.end
      &&entry.quote_sha256===source.text_sha256&&receipt.quote_sha256===source.text_sha256
      &&entry.scope==='supplied_excerpt_only'&&receipt.scope==='supplied_excerpt_only'
      &&receipt.review_kind==='independent_AI_source_only'&&receipt.human_gold===false&&receipt.current_verified===false;
    if(!matches)reason='independent_source_review_required';
    else if(receipt.role===null||extraction.role!==receipt.role||extraction.document_tense!==receipt.role_claim_tense
      ||entry.role!==receipt.role||entry.role_claim_tense!==receipt.role_claim_tense)reason='role_or_document_claim_not_established';
    else if(entry.mapping_status!=='approved')reason='semantic_mapping_review_pending';
    else{
      const mapping=Object.fromEntries(Object.entries(entry).filter(([key])=>!['mapping_status','mapping_review_receipt'].includes(key)));
      const proof=entry.mapping_review_receipt;
      const validProof=exact(proof,['review_kind','mapping_hash','provenance_hash','receipts_hash','taxonomy_hash','library_file_id','sha256'])
        &&proof.review_kind==='independent_mapping_review'&&proof.mapping_hash===await hash(mapping)
        &&['provenance_hash','receipts_hash','taxonomy_hash'].every(key=>proof[key]===SOURCE_REVIEW_PINS[key])
        &&/^libfile_[a-zA-Z0-9_]+$/.test(proof.library_file_id)&&/^[a-f0-9]{64}$/.test(proof.sha256);
      const validMapping=entry.verdict==='direct_support'&&entry.checks_scope==='supplied_excerpt_only'
        &&exact(entry.checks,taxonomy.review_requirements)&&Object.values(entry.checks).every(value=>value===true)
        &&taxonomy.object_families[extraction.role].includes(entry.object_family)&&entry.context===taxonomy.required_context[extraction.role];
      if(!validProof)reason='mapping_receipt_required';
      else if(!validMapping)reason='supply_relation_or_scope_unresolved';
      else{reason='independently_reviewed_document_claim';state='document_reviewed';}
    }
  }
  if(source.published_on===null){reason='publication_date_unconfirmed';state='held';}
  return {symbol:source.symbol,documents:[source],claim,review_status:state,reason,assessed_at:assessedAt,
    current_verification:{state:'unverified',as_of:null,evidence_ids:[]},engine_comparison:{state:'held'},score_effect:0,
    source_admission:{profile:SOURCE_ROLE_PROFILE,pins:{...SOURCE_REVIEW_PINS},source_version_hash:version,
      candidate:structuredClone(claim),state,reason,review_kind:'independent_AI_source_only'}};
}

export async function assertSourceRoleDocumentContract(artifact){
  const contract=artifact.role_document_contract,data=artifact.briefing;
  if(bytes(JSON.stringify(artifact)).length>160000||artifact.version!==3||!['ready','cached'].includes(data?.status)
    ||!exact(contract,['schema','profile',...Object.keys(SOURCE_REVIEW_PINS),'assessed_at','source_records','reviews'])
    ||contract.schema!==SOURCE_REVIEW_SCHEMA||contract.profile!==SOURCE_ROLE_PROFILE
    ||artifact.source_binding?.source_review_profile!==SOURCE_ROLE_PROFILE)fail();
  for(const [key,value] of Object.entries(SOURCE_REVIEW_PINS)){
    if(contract[key]!==value||artifact.source_binding[`source_review_${key}`]!==value)fail();
  }
  const assessed=stamp(contract.assessed_at);
  if(assessed<stamp(data.generated_at)||assessed>stamp(artifact.created_at))fail();
  if(!Array.isArray(data.companies)||data.companies.length<1||data.companies.length>64
    ||!Array.isArray(data.roles)||!Array.isArray(contract.source_records)||!Array.isArray(contract.reviews))fail();
  const symbols=data.companies.map(company=>company.symbol);
  if(new Set(symbols).size!==symbols.length||data.companies.some(company=>!Array.isArray(company.sources)||company.sources.length)
    ||[data.roles,contract.source_records,contract.reviews].some(rows=>canonical(rows.map(row=>row?.symbol))!==canonical(symbols))
    ||data.roles.some(role=>role.role!=='unknown'||role.decision!=='unconfirmed'||role.period!=='unknown'
      ||!Array.isArray(role.evidence)||role.evidence.length||!Array.isArray(role.counter_evidence)||role.counter_evidence.length))fail();
  await assertSourceReviewRegistries();
  const expected=[];
  for(let index=0;index<symbols.length;index++){
    const row=contract.reviews[index],claim=row.claim;
    if(claim!==null&&(!exact(claim,['role','document_tense','evidence'])||!Array.isArray(claim.evidence)||claim.evidence.length!==1))fail();
    const extraction=claim===null?null:{symbol:row.symbol,source_id:claim.evidence[0].source_id,role:claim.role,
      document_tense:claim.role==='unknown'?'unclear':claim.document_tense,
      spans:claim.evidence.map(span=>({start:span.start,end:span.end}))};
    expected.push(await reviewSource(contract.source_records[index],extraction,contract.assessed_at));
  }
  if(canonical(expected)!==canonical(contract.reviews))fail();
  return structuredClone(expected);
}
