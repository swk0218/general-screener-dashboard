import {readFile,writeFile,realpath,lstat,open,unlink} from 'node:fs/promises';
import {resolve,dirname,relative,sep,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildFinalLiveReview,buildRadarSnapshotReview,attachFinalLiveReview} from '../src/review/final-live-model.js';
import {reviewBundle} from '../src/review/review-model.js';

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const fail=()=>{throw Error('FINAL_LIVE_ATTACH_FAILED');};
const outside=(root,path)=>{const rel=relative(root,path);return rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel);};
const parse=raw=>{try{return JSON.parse(raw);}catch{fail();}};
async function inputPath(path,root){
  const actual=await realpath(resolve(path));if(!outside(root,actual))fail();
  const stat=await lstat(actual);if(!stat.isFile()||stat.size>20_000_000)fail();return actual;
}
export async function privateOutputPath(path,root=checkout){
  const actualRoot=await realpath(root),parent=await realpath(dirname(resolve(path)));
  const actual=join(parent,resolve(path).split(sep).at(-1));
  if(!outside(actualRoot,actual))fail();
  try{await lstat(actual);fail();}catch(error){if(error.code!=='ENOENT')throw error;}
  return actual;
}
export async function loadArtifactProfile(directory,id,{qualityReceipt,root=checkout}={}){
  const actualRoot=await realpath(root),dir=await realpath(resolve(directory));
  if(!outside(actualRoot,dir))fail();
  const receiptPath=await inputPath(join(dir,'RECOVERY_RECEIPT.json'),actualRoot);
  const receiptRaw=await readFile(receiptPath),receipt=parse(receiptRaw);
  const archivePath=await inputPath(join(dir,'original.zip'),actualRoot),archive=await readFile(archivePath);
  if(receipt.schema!=='recovered_native_Actions_artifact_v1'||!Number.isSafeInteger(receipt.run_id)
    ||!Number.isSafeInteger(receipt.artifact_id)||!Array.isArray(receipt.files)
    ||receipt.expected_bytes!==archive.length||hash(archive)!==receipt.expected_sha256
    ||hash(archive)!==receipt.sha256)fail();
  const entries=new Map();
  for(const item of receipt.files){
    if(!item||typeof item.path!=='string'||!item.path.endsWith('.json')
      ||isAbsolute(item.path)||item.path.split(/[\\/]/).some(p=>p==='..'||!p)
      ||entries.has(item.path)||!/^[a-f0-9]{64}$/.test(item.sha256))fail();
    entries.set(item.path,item);
  }
  const artifacts=await realpath(join(dir,'artifacts'));
  async function json(name,required=true){
    const expected=entries.get(name);
    if(!expected){if(required)fail();return undefined;}
    const path=await realpath(join(artifacts,name));
    if(outside(artifacts,path))fail();
    const raw=await readFile(path);
    if(raw.length!==expected.bytes||hash(raw)!==expected.sha256)fail();
    return parse(raw);
  }
  const report=await json('report.json'),packets=await json('packets.json'),request_manifest=await json('request-manifest.json');
  const assessments={},provider_responses={},http_receipts={},runtime_results={};
  for(const row of request_manifest){
    if(typeof row.case_id!=='string'||!/^[a-z0-9-]{1,80}$/.test(row.case_id))fail();
    const caseId=row.case_id;
    for(const [target,name] of [[assessments,'assessments/'+caseId+'.json'],
      [provider_responses,'provider-response-'+caseId+'.json'],[http_receipts,'http-receipt-'+caseId+'.json'],
      [runtime_results,'runtime-result-'+caseId+'.json']]){
      const value=await json(name,false);if(value!==undefined)target[caseId]=value;
    }
  }
  let quality;
  if(qualityReceipt){
    const raw=await readFile(await inputPath(qualityReceipt,actualRoot)),value=parse(raw);
    if(value.schema!=='final_live_scope_quality_receipt_v1'||value.profile!==id
      ||String(value.run_id)!==String(receipt.run_id)||String(value.artifact_id)!==String(receipt.artifact_id)
      ||value.archive_sha256!==hash(archive)||typeof value.reviewed_at!=='string'
      ||!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value.reviewed_at)||!Number.isFinite(Date.parse(value.reviewed_at))
      ||Object.values(runtime_results).some(result=>Number.isFinite(Date.parse(result.analysis_at))
        &&Date.parse(value.reviewed_at)<Date.parse(result.analysis_at)))fail();
    quality={status:value.status,limitations:value.limitations,receipt_sha256:hash(raw)};
  }
  return {id,report,packets,request_manifest,assessments,provider_responses,http_receipts,runtime_results,
    binding:{artifact_id:String(receipt.artifact_id),run_id:String(receipt.run_id),source_head:receipt.head,
      archive_sha256:hash(archive),receipt_sha256:hash(receiptRaw)},quality};
}
export async function writePrivateJson(path,value,{root=checkout}={}){
  const target=await privateOutputPath(path,root),raw=JSON.stringify(value)+'\n';
  let handle,created=false;
  try{
    handle=await open(target,'wx',0o600);created=true;
    await handle.writeFile(raw);await handle.sync();await handle.close();handle=undefined;
  }catch(error){
    if(handle)await handle.close();
    if(created)await unlink(target);
    throw error;
  }
  return {sha256:hash(raw),bytes:Buffer.byteLength(raw)};
}
export async function attachOfflineReview(options){
  const root=await realpath(options.root??checkout),profiles=[];
  if(options.legacyArtifactDir)profiles.push(await loadArtifactProfile(options.legacyArtifactDir,'legacy_six_request',
    {qualityReceipt:options.legacyQualityReceipt,root}));
  if(options.q3ArtifactDir)profiles.push(await loadArtifactProfile(options.q3ArtifactDir,'q3_one_real_company',
    {qualityReceipt:options.q3QualityReceipt,root}));
  if(!profiles.length||!options.output||!!options.base===!!options.profilesOnly)fail();
  const review=buildFinalLiveReview({created_at:options.createdAt??new Date().toISOString(),
    selected_profile:options.selectedProfile??profiles.at(-1).id,profiles});
  let value=review;
  if(options.base){
    const base=reviewBundle(parse(await readFile(await inputPath(options.base,root))));
    let snapshot;
    if(options.radarSnapshot)snapshot=buildRadarSnapshotReview(parse(await readFile(await inputPath(options.radarSnapshot,root))));
    value=reviewBundle(attachFinalLiveReview(base,review,snapshot));
  }else if(options.radarSnapshot)fail();
  const output=await writePrivateJson(options.output,value,{root});
  return {status:options.profilesOnly?'private_profile_dto_prepared':'private_review_attached',...output,
    profiles:review.profiles.map(p=>({id:p.id,expected_requests:p.report.expected_requests,
      available_requests:p.quality.available_requests,quality:p.quality.status})),new_model_calls:0,new_http_calls:0};
}
async function main(){
  const args=process.argv.slice(2),values=new Map(),flags=new Set(['--profiles-only']);
  const names=new Map([['--base','base'],['--output','output'],['--legacy-artifact-dir','legacyArtifactDir'],
    ['--q3-artifact-dir','q3ArtifactDir'],['--legacy-quality-receipt','legacyQualityReceipt'],
    ['--q3-quality-receipt','q3QualityReceipt'],['--selected-profile','selectedProfile'],['--radar-snapshot','radarSnapshot']]);
  for(let i=0;i<args.length;i++){
    const flag=args[i];if(values.has(flag)||!names.has(flag)&&!flags.has(flag))fail();
    if(flags.has(flag)){values.set(flag,true);continue;}
    const value=args[++i];if(!value||value.startsWith('--'))fail();values.set(flag,value);
  }
  const options=Object.fromEntries([...names].filter(([flag])=>values.has(flag)).map(([flag,name])=>[name,values.get(flag)]));
  options.profilesOnly=values.get('--profiles-only')===true;
  process.stdout.write(JSON.stringify(await attachOfflineReview(options))+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{process.stderr.write('FINAL_LIVE_ATTACH_FAILED\n');process.exitCode=1;});
