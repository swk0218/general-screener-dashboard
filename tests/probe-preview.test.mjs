import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readBriefingArtifact,loadBriefingDelivery} from '../src/features/briefing/briefing-artifact.js';
import {assertDashboardPayload} from '../src/data/contract.js';
import {decryptEnvelope} from '../src/crypto/envelope.js';
import {copyWebPublicAssets} from '../scripts/build-public-assets.mjs';
import {validateProbeDirectory,probePreviewConfig} from '../scripts/probe-preview-config.mjs';
const python=process.env.BRIEFING_TEST_PYTHON,backend=process.env.BRIEFING_TEST_BACKEND;
test('probe mode requires private verified source and is forbidden for build',()=>{
  const plugin=probePreviewConfig();
  assert.throws(()=>plugin.config({},{command:'build',mode:'briefing-probe'}),/forbidden/);
  assert.equal(plugin.config({},{command:'build',mode:'production'}),undefined);
});
test('offline executor -> actual encryption -> private reader and OFF copy isolation',{skip:!python||!backend},async()=>{
  const root=await mkdtemp(join(tmpdir(),'product-probe-e2e-'));
  const input=join(root,'input.json');
  execFileSync(python,['tests/fixtures/build_product_probe_fixture.py','--offline-contract-fixture','--output',input],{cwd:backend,env:{...process.env,PYTHONPATH:'src'},stdio:'pipe'});
  const output=JSON.parse(await readFile(input,'utf8'));
  const {sealProbe,PROBE_PASSPHRASE}=await import(pathToFileURL(resolve(backend,'scripts/seal_product_probe.mjs')).href);
  const preview=join(root,'private-preview');
  await assert.rejects(sealProbe(output,preview),/ORIGIN/);
  const manifest=await sealProbe(output,preview,{allowOfflineFixture:true});
  assert.equal(validateProbeDirectory(preview).manifest.response_origin,'offline_contract_fixture');
  for(const id of manifest.cases) {
    const base=join(preview,'data/briefing-probe',id);
    assertDashboardPayload(await decryptEnvelope(JSON.parse(await readFile(join(base,'payload.enc.json'),'utf8')),PROBE_PASSPHRASE));
    const cipher=JSON.parse(await readFile(join(base,'briefing.enc.json'),'utf8'));
    await assert.rejects(readBriefingArtifact(cipher,PROBE_PASSPHRASE,{expectedExecutionMode:'provider'}),/INVALID/);
    const result=await loadBriefingDelivery('status','cipher',PROBE_PASSPHRASE,{expectedExecutionMode:'provider_test',now:Date.parse('2026-11-03T05:01:00Z')},async path=>({ok:true,text:async()=>readFile(join(base,'briefing-status.json'),'utf8'),arrayBuffer:async()=>{const b=await readFile(join(base,'briefing.enc.json'));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}));
    assert.equal(result.status,id.endsWith('insufficient')?'unavailable':'ready');
    assert.equal(result.probe_context.response_origin,'offline_contract_fixture');
  }
  const publicSource=join(root,'source');await mkdir(join(publicSource,'data'),{recursive:true});
  const {cp}=await import('node:fs/promises');
  await cp(join(preview,'data/briefing-probe'),join(publicSource,'data/briefing-probe'),{recursive:true});
  await copyWebPublicAssets(publicSource,join(root,'dist'));
  await assert.rejects(readFile(join(root,'dist/data/briefing-probe/product-v1-normal/briefing.enc.json')),{code:'ENOENT'});
  await writeFile(join(publicSource,'data/leaked-probe.json'),JSON.stringify({execution_mode:'provider_test'}));
  await assert.rejects(copyWebPublicAssets(publicSource,join(root,'rejected-dist')),/Private test metadata/);
  await writeFile(join(preview,'.env'),'TEST_ONLY_FORBIDDEN');
  assert.throws(()=>validateProbeDirectory(preview),/Unexpected/);
});

test('post-build scan rejects private test material even after a manual output injection',async()=>{
  const root=await mkdtemp(join(tmpdir(),'probe-build-scan-'));
  const source=join(root,'public');await mkdir(source);
  const output=join(root,'dist/client');await copyWebPublicAssets(source,output);
  await mkdir(join(output,'assets'));await writeFile(join(output,'assets/app.js'),'// test only');
  const script=resolve('scripts/verify-build-assets.mjs');
  execFileSync(process.execPath,[script],{cwd:root,stdio:'pipe'});
  await mkdir(join(output,'data/briefing-probe'),{recursive:true});
  await writeFile(join(output,'data/briefing-probe/briefing.enc.json'),'TEST_ONLY_CIPHERTEXT');
  assert.throws(()=>execFileSync(process.execPath,[script],{cwd:root,stdio:'pipe'}),error=>String(error.stderr).includes('Private test artifacts'));
});
