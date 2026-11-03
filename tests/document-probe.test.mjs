import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readBriefingArtifact,assertBriefingArtifact} from '../src/features/briefing/briefing-artifact.js';
import {decryptEnvelope} from '../src/crypto/envelope.js';
const python=process.env.BRIEFING_TEST_PYTHON,backend=process.env.BRIEFING_TEST_BACKEND;

test('document contradiction traverses Responses fixture, encryption and test reader',{skip:!python||!backend},async()=>{
  const root=await mkdtemp(join(tmpdir(),'document-probe-r5-')),input=join(root,'fixture.json');
  execFileSync(python,['tests/fixtures/build_document_probe_fixture.py','--offline-contract-fixture','--output',input],
    {cwd:backend,env:{...process.env,PYTHONPATH:'src'},stdio:'pipe'});
  const output=JSON.parse(await readFile(input,'utf8'));
  assert.equal(output.report.actual_network_calls,0);
  assert.equal(output.report.injected_contract_responses,4);
  const {sealProbe,PROBE_PASSPHRASE}=await import(pathToFileURL(resolve(backend,'scripts/seal_product_probe.mjs')).href);
  const preview=join(root,'private-preview');
  await sealProbe(output,preview,{allowOfflineFixture:true});
  for(const row of output.display_cases){
    const cipher=JSON.parse(await readFile(join(preview,'data/briefing-probe',row.case_id,'briefing.enc.json'),'utf8'));
    const artifact=await decryptEnvelope(cipher,PROBE_PASSPHRASE);
    const opts={expectedExecutionMode:'provider_test',expectedSession:artifact.source_binding.assessment_session,now:Date.parse(artifact.created_at)+60000};
    const result=await readBriefingArtifact(cipher,PROBE_PASSPHRASE,opts);
    await assert.rejects(readBriefingArtifact(cipher,PROBE_PASSPHRASE,{...opts,expectedExecutionMode:'provider'}),/INVALID/);
    assert.equal(result.probe_context.response_origin,'offline_contract_fixture');
    if(row.case_id.endsWith('conflict')){
      assert.equal(result.roles[0].decision,'unconfirmed');
      assert.match(result.roles[0].evidence[0].quote,/supplies server processors/);
      assert.match(result.roles[0].counter_evidence[0].quote,/does not supply server processors/);
      assert.ok(result.companies[0].sources.every(s=>s.kind==='TEST'&&s.url.startsWith('https://example.invalid/')));
      for(const mode of ['provider','fake_transport']){
        const promoted=structuredClone(artifact);promoted.execution_mode=mode;
        promoted.source_binding.normalizer_version='briefing-native-input-v1';
        promoted.source_binding.screening_archive_sha256='a'.repeat(64);
        promoted.briefing.execution_mode=mode;promoted.briefing.identity.execution_mode=mode;
        promoted.briefing.provider_receipt.transport=mode==='provider'?'network':'fake';
        if(mode==='provider')promoted.briefing.demo=false;
        assert.throws(()=>assertBriefingArtifact(promoted),/INVALID/);
      }
    }
  }
});
