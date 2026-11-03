// Destructive cleanup is restricted to the UUID directory created by this test.
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,readdir,rm,lstat,rmdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateProbeDirectory} from './probe-preview-config.mjs';
const {root:preview,manifest}=validateProbeDirectory(process.argv[2]);
const root=resolve('.'),parent=join(root,'public/data/briefing-probe');
const owned=join(parent,`off-build-${randomUUID()}`);
assert.ok(resolve(owned).startsWith(resolve(parent)+sep));
let createdParent=false;
try{await lstat(parent);}catch(error){if(error.code!=='ENOENT')throw error;await mkdir(parent);createdParent=true;}
assert.ok(!(await lstat(parent)).isSymbolicLink());
await mkdir(owned);
try {
  await cp(join(preview,'data/briefing-probe'),owned,{recursive:true});
  const expected=JSON.parse(await readFile('tests/fixtures/briefing-off-assets.json','utf8'));
  const env={...process.env};delete env.VITE_GPT_BRIEFING_ENABLED;delete env.VITE_GPT_SHADOW_DEMO;delete env.GPT_PROBE_DIR;
  execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','production'],{cwd:root,env,stdio:'pipe'});
  execFileSync(process.execPath,['scripts/verify-build-assets.mjs'],{cwd:root,env,stdio:'pipe'});
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const actual=Object.fromEntries(await Promise.all((await readdir('dist/client/assets')).map(async name=>[name,sha(await readFile(join('dist/client/assets',name)))])));
  assert.deepEqual(actual,expected);
  assert.equal(sha(await readFile(join(owned,'product-v1-normal/briefing.enc.json'))),manifest.files['data/briefing-probe/product-v1-normal/briefing.enc.json']);
  console.log(JSON.stringify({provider_test_ciphertext_present_during_build:true,response_origin:manifest.response_origin,
    same_asset_count:Object.keys(actual).length,private_output_scan:'PASS',source_cipher_preserved:true}));
} finally {
  assert.ok(resolve(owned).startsWith(resolve(parent)+sep));
  await rm(owned,{recursive:true,force:true});
  if(createdParent)await rmdir(parent); // Empty-only; never removes other material.
}
