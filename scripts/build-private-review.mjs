import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,dirname,join,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {encryptEnvelope,decryptEnvelope} from '../src/crypto/envelope.js';
import {reviewBundle} from '../src/review/review-model.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const input=arg('--inputs'),output=arg('--output'),passwordFile=arg('--password-file');
if(!input||!output||!passwordFile)throw Error('Use --inputs PRIVATE_INPUT_DIRECTORY --output PRIVATE_HTML --password-file PRIVATE_NEW_PASSPHRASE');
for(const path of [output,passwordFile]){
  const rel=relative(root,resolve(path));
  if(!rel.startsWith('..'))throw Error('Review artifacts must be outside the source checkout.');
}
const names=['actual_numeric_tenx_run_42622109601.json','selected_sec_sample_inputs.json','selected_sec_sample_report.json'];
const sources=await Promise.all(names.map(name=>readFile(join(input,name))));
const [numeric,inputs,reports]=sources.map(raw=>JSON.parse(raw));
const bundle=reviewBundle({schema:'gpt_private_review_v1',created_at:new Date().toISOString(),
  source_files:sources.map((raw,i)=>({name:names[i],sha256:createHash('sha256').update(raw).digest('hex')})),
  numeric:{run_id:'42622109601',result:numeric},
  samples:inputs.map(x=>({...x,report:reports.find(r=>r.case_id===x.case_id)}))});
const legacyPath=arg('--legacy-seed');
if(legacyPath){
 const wrapper=JSON.parse(await readFile(legacyPath,'utf8')),state=wrapper.state;
 const fingerprint=createHash('sha256').update(JSON.stringify(state)).digest('hex');
 if(wrapper.sha256!==fingerprint||state?.schema!=='mlg_qualitative_risk_history_v1'
   ||!Array.isArray(state.covered_symbols)
   ||Object.keys(state.active||{}).length!==0||!state.legacy_observations)throw Error('Invalid carry-only seed');
 const reviewed=state.covered_symbols;
 if(reviewed.some(symbol=>!state.legacy_observations[symbol]
   ||state.coverage_reviews?.[symbol]?.status!=='reviewed_retained_legacy_risks'
   ||JSON.stringify([...state.coverage_reviews[symbol].observation_ids].sort())!==JSON.stringify(Object.keys(state.legacy_observations[symbol]).sort())))throw Error('Invalid retained review');
 bundle.legacy_review={mode:reviewed.length?'reviewed_retained':'carry_only',evaluation_coverage:reviewed.length,reviewed_symbols:reviewed,state_sha256:fingerprint,
   source_run_id:state.legacy_source.run_id,observed_by:state.legacy_source.observed_by,
   companies:Object.entries(state.legacy_observations).map(([symbol,records])=>{
     const rows=Object.values(records);
     return {symbol,reviewed:reviewed.includes(symbol),review_reason:state.coverage_reviews?.[symbol]?.reason||null,level:rows.some(r=>r.mlg_state==='severe')?'severe':'watch',
       observations:rows.length,missing_publication:rows.filter(r=>!r.source_publication_raw).length,
       action_dates:[...new Set(rows.map(r=>r.original_event_date).filter(Boolean))].sort()};
   }).sort((a,b)=>a.symbol.localeCompare(b.symbol))};
 reviewBundle(bundle);
}
const radarPath=arg('--radar-receipt');
if(radarPath){
 const r=JSON.parse(await readFile(radarPath,'utf8'));
 if(!Number.isSafeInteger(r.run_id)||r.run_id<=0||r.provider_calls!==1
   ||r.search_execution_verified!==true||r.search_queries_completed!==1
   ||r.analysis_complete!==false||r.reason!=='search_evidence_incomplete'
   ||r.adopted_events!==0||r.retried!==false||r.actual_billing_confirmed!==false
   ||r.news?.status!=='unavailable'||r.news?.events?.length!==0
   ||!/^[a-f0-9]{64}$/.test(r.artifact_sha256))throw Error('Invalid actual Radar receipt');
 bundle.radar_validation={status:'incomplete',run_id:r.run_id,provider_requests:1,
   search_completed:false,search_queries_completed:1,reason:'search_evidence_incomplete',
   retries:0,actual_billing_confirmed:false,artifact_sha256:r.artifact_sha256,
   cutoff:r.cutoff,analyzed_at:r.analyzed_at};
 reviewBundle(bundle);
}
const observedPath=arg('--observed-review');
if(observedPath){
 const report=JSON.parse(await readFile(join(observedPath,'report.json'),'utf8'));
 const rows=JSON.parse(await readFile(join(observedPath,'all-company-review.json'),'utf8'));
 const tenx=JSON.parse(await readFile(join(observedPath,'tenx-reviewed-cohort.json'),'utf8'));
 const cases=await Promise.all(rows.map(async row=>{
  const a=JSON.parse(await readFile(join(observedPath,'assessments',row.strategy+'-'+row.symbol+'.json'),'utf8'));
  const e=a.envelope,d=a.decision,v=row.strategy==='mlg'?d.semantic_rule_validation:d;
  const valid=['evaluated','cached'].includes(row.semantic_rule_status);
  const events=(valid?(row.strategy==='mlg'?v.events:(d.event?[d.event]:[])):e.events)||[];
  const urls=new Set(events.map(x=>x.source_url));if(e.ai_evidence?.source_url)urls.add(e.ai_evidence.source_url);
  const n=tenx.find(x=>x.symbol===row.symbol);
  return {...row,ai_reason:e.ai_reason||'',events:events.map(x=>({quote:x.quote,reason:x.reason,
    published_at:x.published_at,occurred_at:x.occurred_at,mlg_state:x.mlg_state})),
    sources:(e.evidence||[]).filter(x=>urls.has(x.url)).map(x=>({url:x.url,quote:x.quote,
     published_at:x.published_at,timezone_unknown:!!x.publication_time,observed_at:x.source_observation?.observed_at})),
    ...(row.strategy==='mlg'?{baseline_e:d.baseline_e,baseline_a:d.baseline_a,
      proposed_e:d.proposed_e,proposed_a:d.proposed_a}: {quantitative_score:n.quantitative_score,
      q:valid?n.qualitative_adjustment:null,adjusted_score:valid?n.adjusted_score:null})};
 }));
 bundle.observed_review={schema:'observed_company_preview_v1',data_as_of:report.source_cutoff,
  numeric_run_id:bundle.numeric.run_id,monthly_allocation_microusd:4000000,
  production_adopted:false,cases};
 reviewBundle(bundle);
}
const password=randomBytes(15).toString('base64url');
const encrypted=await encryptEnvelope(bundle,password);
reviewBundle(await decryptEnvelope(encrypted,password));
const temp=await mkdtemp(join(tmpdir(),'gpt-private-review-'));
try{
 await build({root,configFile:false,publicDir:false,base:'./',plugins:[react()],logLevel:'warn',
  build:{outDir:temp,emptyOutDir:true,assetsInlineLimit:10000000,rollupOptions:{input:join(root,'review.html'),output:{inlineDynamicImports:true}}}});
 let html=await readFile(join(temp,'review.html'),'utf8');
 const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)];
 for(const m of scripts){
  const js=await readFile(resolve(temp,m[1]),'utf8');
  if(/<\/script/i.test(js))throw Error('Unsafe inline script');
  html=html.replace(m[0],()=>'<script type="module">'+js+'</script>');
 }
 const css=[...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)];
 for(const m of css){
  const style=await readFile(resolve(temp,m[1]),'utf8');
  if(/url\((?!["']?data:)/.test(style))throw Error('External review asset');
  html=html.replace(m[0],()=>'<style>'+style+'</style>');
 }
 html=html.replace('</head>',"<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'\"></head>");
 html=html.replace('<div id="root">','<script type="application/json" id="review-bundle">'+JSON.stringify(encrypted)+'</script><div id="root">');
 const markup=html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g,'<script$1></script>');
 if(/<(?:script|link)\b[^>]*(?:src|href)=/.test(markup))throw Error('Review has external assets');
 await writeFile(output,html,{mode:0o600,flag:'wx'});
 await writeFile(passwordFile,password+'\n',{mode:0o600,flag:'wx'});
 await writeFile(output+'.enc.json',JSON.stringify(encrypted),{mode:0o600,flag:'wx'});
 process.stdout.write(JSON.stringify({status:'private_review_built',output:resolve(output),bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),source_files:bundle.source_files})+'\n');
}finally{await rm(temp,{recursive:true,force:true});}
