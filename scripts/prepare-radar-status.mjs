// No provider acquisition. Optional self-hosted publication receipt read only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {validateEngineStatus,unavailableEngineStatus} from '../src/features/radar/observation-status.js';
export function retainReceipt(value,prior,now=Date.now()){
  validateEngineStatus(prior);
  if(!value.engine_result_id||prior.engine_result_id!==value.engine_result_id
    ||prior.feed_cipher_sha256!==value.feed_cipher_sha256
    ||prior.publication_receipt_result_id!==value.engine_result_id
    ||!prior.published_at_utc||Date.parse(prior.published_at_utc)>now
    ||Date.parse(prior.published_at_utc)<Date.parse(value.model_computed_at_utc)
    ||!Number.isSafeInteger(prior.publication_deployment_id)||prior.publication_deployment_id<=0)return value;
  if(value.published_at_utc&&Date.parse(value.published_at_utc)<=Date.parse(prior.published_at_utc))return value;
  return {...value,...Object.fromEntries(['published_at_utc','publication_receipt_result_id','publication_deployment_id'].map(key=>[key,prior[key]]))};
}
export function bindStatus(value,feed,{retainPublication=false,now=Date.now()}={}){
  validateEngineStatus(value);
  const expected=createHash('sha256').update(feed).digest('hex');
  if(value.status==='UNAVAILABLE'&&value.feed_cipher_sha256===null)return value;
  if(expected!==value.feed_cipher_sha256)throw new Error('FEED_STATUS_BINDING_MISMATCH');
  const bound={...value,built_at_utc:null,published_at_utc:null,publication_receipt_result_id:null,publication_deployment_id:null};
  return retainPublication?retainReceipt(bound,value,now):bound;
}
if(process.argv[1]?.endsWith('prepare-radar-status.mjs')){
  const path=process.argv[2]||'public/data/radar-observation.json';
  const feedPath=process.argv[3]||'public/data/market-radar.enc.json';
  let value,feed;
  try{feed=await readFile(feedPath);value=bindStatus(JSON.parse(await readFile(path,'utf8')),feed,{retainPublication:process.argv.includes('--retain-publication')});}
  catch{
    value=unavailableEngineStatus('ENGINE_STATUS_UNAVAILABLE');
    if(feed)value.feed_cipher_sha256=createHash('sha256').update(feed).digest('hex');
  }
  // Retain the already verified publication time only for this exact engine result.
  if(process.argv.includes('--retain-publication')&&value.engine_result_id){
    try{
      const response=await fetch('https://swk0218.github.io/general-screener-dashboard/data/radar-observation.json',{signal:AbortSignal.timeout(5000)});
      if(response.ok){
        value=retainReceipt(value,await response.json());
      }
    }catch{/* Unknown prior receipt remains unclaimed; source/model clocks never change. */}
  }
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,JSON.stringify(value,null,2)+'\n');
}
