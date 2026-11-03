import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {nativeInput,cutoff} from './briefing-native.mjs';
export async function roleDocumentsFixture(directory,{fragment=false,multiDocument=false,unicode=false,direct=false}={}){
  const python=process.env.BRIEFING_TEST_PYTHON,backend=process.env.BRIEFING_TEST_BACKEND;
  if(!python||!backend)throw Error('Explicit private offline backend required');
  const native=await nativeInput();
  native.data.companies[0].sources[0].available_at='2026-10-28T10:00:00Z';
  if(unicode)native.data.companies[0].sources[0].text='🙂 '+native.data.companies[0].sources[0].text;
  if(multiDocument)native.data.companies[0].sources.push({...native.data.companies[0].sources[0],id:'later-cessation',text:'The company no longer supplies cooling systems for data centers.'});
  await writeFile(join(directory,'input.json'),JSON.stringify(native.data));
  execFileSync(python,['scripts/run_gpt_postprocess_offline.py','--enable-offline','--input',join(directory,'input.json'),
    '--response-fixture','tests/fixtures/gpt_shadow/response.json','--output',join(directory,'result.json'),
    '--ledger',join(directory,'budget.db'),'--completed-at',cutoff],{cwd:backend,env:{...process.env,PYTHONPATH:'src'},stdio:'pipe'});
  const result=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));
  const artifact={artifact_kind:'general_screener_briefing_v1',version:1,created_at:cutoff,execution_mode:'fake_transport',
    source_binding:{...native.binding,input_hash:result.input_hash},briefing:result.briefing};
  const company=native.data.companies[0],source=company.sources[0];
  const extraction={symbol:company.symbol,source_id:source.id,role:'power_cooling',document_tense:'present_in_document',spans:[{start:0,end:fragment?3:Array.from(source.text).length}]};
  await writeFile(join(directory,'artifact.json'),JSON.stringify(artifact));
  await writeFile(join(directory,'extractions.json'),JSON.stringify([extraction]));
  execFileSync(python,['scripts/write_role_documents.py','--enable-role-documents-v2',...(direct?['--enable-direct-document-evidence']:[]),'--artifact',join(directory,'artifact.json'),
    '--extractions',join(directory,'extractions.json'),'--output',join(directory,'role-v2.json')],{cwd:backend,env:{...process.env,PYTHONPATH:'src'},stdio:'pipe'});
  return {artifact:JSON.parse(await readFile(join(directory,'role-v2.json'),'utf8')),legacy:artifact};
}
