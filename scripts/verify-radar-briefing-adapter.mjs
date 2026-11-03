// Read-only native adapter check. No provider calls, plaintext export, or publishing.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readRadarSource,radarPublicationClock,sha256} from './lib/briefing-input.mjs';

export async function verifyRadarBriefingAdapter({raw,status,expectedHash,session,cutoff},passphrase){
  if(!/^[a-f0-9]{64}$/.test(expectedHash)||sha256(raw)!==expectedHash)throw Error('BOUND_SOURCE_REQUIRED');
  const source=await readRadarSource(raw,status,passphrase,session,cutoff);
  // The verified source remains in memory. Never serialize its market state/signals.
  return {
    schema:'radar_briefing_adapter_receipt_v1',scope:'fixed archived assessment; not a fresh market observation',
    cipher_sha256:source.sourceHash,source_session:source.snapshot.session,assessment_session:session,
    assessment_cutoff:cutoff,publication_clock:radarPublicationClock(status,cutoff),
    authenticated:true,native_contract_validated:true,admission_status:source.snapshot.status,
    model_use_admitted:source.snapshot.status==='valid',plaintext_or_signal_values_exported:false,
    provider_calls:0,operational_writes:0
  };
}

export async function runVerification(args,environment,load=readFile){
  // Explicit runner-only entry; admission precedes access to the one existing secret.
  if(args.length!==4||args[0]!=='--enable-readonly-runner-check'||environment.GITHUB_ACTIONS!=='true')throw Error('DISABLED');
  const plan=JSON.parse(await load(args[1],'utf8'));
  if(plan.schema!=='radar_adapter_readonly_plan_v1'||plan.delivery_revision!=='25dc04ab20593a3c48c45081faba88440284692c'
     ||plan.cipher_sha256!=='79f3a146d2c755157f130c929da221a6101bf4e0ac5f4e4f4b1ad21f1299c291'
     ||plan.status_sha256!=='f108f0931167aea21293634dfaa654ca3ab2910bcf5ad18c47d358d7f7ade554'
     ||plan.session!=='2026-11-02'||plan.cutoff!=='2026-11-03T10:00:00Z')throw Error('PLAN_CHANGED');
  const raw=await load(args[2]),statusRaw=await load(args[3]);
  if(sha256(raw)!==plan.cipher_sha256||sha256(statusRaw)!==plan.status_sha256)throw Error('BOUND_SOURCE_REQUIRED');
  const status=JSON.parse(statusRaw.toString('utf8'));
  if(status.feed_cipher_sha256!==plan.cipher_sha256)throw Error('BOUND_SOURCE_REQUIRED');
  const passphrase=environment.DASHBOARD_PASSPHRASE;
  if(typeof passphrase!=='string'||!passphrase)throw Error('EXISTING_RUNNER_SECRET_REQUIRED');
  return verifyRadarBriefingAdapter({raw,status,expectedHash:plan.cipher_sha256,session:plan.session,cutoff:plan.cutoff},passphrase);
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  try{console.log(JSON.stringify(await runVerification(process.argv.slice(2),process.env)));}
  catch{console.log(JSON.stringify({schema:'radar_briefing_adapter_receipt_v1',verification:'BLOCKED',
    authenticated:false,failure_code:'READONLY_ADMISSION_OR_AUTHENTICATION_FAILED',provider_calls:0,operational_writes:0}));process.exitCode=2;}
}
