// Independent reader recomputation of the fixed source/span review contract.
// Shape checks are not a semantic classifier. Missing independent review stays held.
import registry from './direct-review-registry.json' with {type:'json'};
import taxonomy from './role-taxonomy-v2.json' with {type:'json'};
import {DIRECT_ROLE_PROFILE,DIRECT_TAXONOMY_HASH} from './role-taxonomy.js';
export const DIRECT_REVIEWS_HASH='64804edf044c577c7df494a8e1cb7eda09e7fec78c0d2fa68634073e12e21679';
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const sha=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sorted(v)))))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function assertDirectRegistry(){
  if(await sha(registry)!==DIRECT_REVIEWS_HASH||await sha(taxonomy)!==DIRECT_TAXONOMY_HASH||registry.taxonomy_hash!==DIRECT_TAXONOMY_HASH)throw Error('DIRECT_REGISTRY_INVALID');
}
export function directAdmission(company,row,demo){
  const result={schema:'direct_document_review_v1',profile:DIRECT_ROLE_PROFILE,taxonomy_hash:DIRECT_TAXONOMY_HASH,
    review_registry_hash:DIRECT_REVIEWS_HASH,state:'held',reason:'disabled',display_role:'unknown',candidate:null,
    current_verification:'unverified',engine_comparison:'held',score_effect:0};
  const hold=reason=>({...result,reason});
  if(company.sources.length!==1)return hold('single_document_claim_required');
  const sourceInput=company.sources[0];
  if(typeof sourceInput.text!=='string'||new TextEncoder().encode(sourceInput.text).length>32000)return hold('invalid_or_unverifiable_evidence');
  result.candidate=structuredClone(row.claim);
  if(row.documents.length!==1||!row.claim)return hold('single_document_claim_required');
  if(row.claim.evidence.length!==1)return hold('single_complete_proposition_required');
  const source=row.documents[0],span=row.claim.evidence[0];
  if(!source.available_at)return hold('availability_unconfirmed');
  if(!['SEC','FMP','FRED','TEST'].includes(source.kind))return hold('source_provenance_unconfirmed');
  if(source.kind==='TEST'&&!demo)return hold('synthetic_evidence_not_live');
  const quote=span.quote.trim(),prefix=Array.from(source.text).slice(0,span.start).join('').trimEnd();
  if(quote.split(/\s+/).length<3||!/[.!?]$/.test(quote)||prefix&&!/[.!?]$/.test(prefix))return hold('complete_proposition_not_established');
  const entries=registry.entries.filter(e=>e.source_version_hash===span.source_version_hash&&e.start===span.start&&e.end===span.end);
  if(entries.length!==1)return hold('independent_source_review_required');
  const entry=entries[0],role=row.claim.role;
  if(entry.taxonomy_hash!==DIRECT_TAXONOMY_HASH||entry.verdict!=='direct_support'||entry.role!==role
    ||entry.document_tense!==row.claim.document_tense||role==='unknown')return hold('role_or_document_claim_not_established');
  if(JSON.stringify(Object.keys(entry.checks).sort())!==JSON.stringify([...taxonomy.review_requirements].sort())
    ||taxonomy.review_requirements.some(k=>entry.checks[k]!==true))return hold('supply_relation_or_scope_unresolved');
  const required=taxonomy.required_context[role];
  if(!taxonomy.object_families[role].includes(entry.object_family)||required!==null&&entry.context!==required)return hold('required_object_or_context_not_established');
  if(entry.demo_only){
    if(!demo||entry.review_kind!=='synthetic_contract_fixture')return hold('synthetic_review_not_live');
  }else{
    const r=entry.review_receipt;
    if(entry.review_kind!=='independent_source_only'||!r||JSON.stringify(Object.keys(r).sort())!==JSON.stringify(['library_file_id','sha256','source_version_hash','taxonomy_hash','scope'].sort())
      ||!/^libfile_[a-zA-Z0-9_]+$/.test(r.library_file_id)||!/^[a-f0-9]{64}$/.test(r.sha256)
      ||r.source_version_hash!==span.source_version_hash||r.taxonomy_hash!==DIRECT_TAXONOMY_HASH||r.scope!=='supplied_excerpt_only')return hold('independent_receipt_required');
  }
  return {...result,state:'document_reviewed',display_role:role,reason:entry.demo_only?'synthetic_contract_claim':'independently_reviewed_direct_claim'};
}
