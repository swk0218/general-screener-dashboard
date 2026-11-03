import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {execFileSync} from 'node:child_process';
import {nativeInput,fixturePassword} from './fixtures/briefing-native.mjs';
import {sealBriefingArtifact} from '../scripts/seal-briefing-artifact.mjs';
const python=process.env.BRIEFING_TEST_PYTHON,backend=process.env.BRIEFING_TEST_BACKEND;
const available=Boolean(python&&backend);
if(process.env.BRIEFING_REQUIRE_BACKEND==='true'&&!available)throw Error('Private offline writer required');
for(const variant of ['hdd','home_cooling','home_network','buyer','cloud_customer','ceased']){
  test(`synthetic positive injection held by writer and rejected from normal delivery: ${variant}`,{skip:!available},async()=>{
    const directory=await mkdtemp(join(tmpdir(),'saved-role-delivery-'));
    const native=await nativeInput(),input=join(directory,'input.json'),output=join(directory,'artifact.json');
    await writeFile(input,JSON.stringify(native.data));
    execFileSync(python,['tests/fixtures/build_saved_role_hold.py','--input',input,'--output',output,'--case',variant],
      {cwd:backend,env:{...process.env,PYTHONPATH:['.','src'].join(delimiter)},stdio:'pipe'});
    const artifact=JSON.parse(await readFile(output,'utf8'));
    assert.equal(artifact.role_document_contract.reviews[0].review_status,'held');
    assert.equal(artifact.role_document_contract.reviews[0].score_effect,0);
    assert.deepEqual(artifact.briefing.engines,native.data.engines);
    const destination=join(directory,'briefing.enc.json');
    // TEST evidence requires the dedicated provider_test/synthetic_probe path.
    // Do not weaken this boundary merely to make a fixture render in normal feed.
    await assert.rejects(sealBriefingArtifact(artifact,fixturePassword,destination,{executionMode:'fake_transport'}),/BRIEFING_ARTIFACT_INVALID/);
    await assert.rejects(access(destination),error=>error.code==='ENOENT');
  });
}
