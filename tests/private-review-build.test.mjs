import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {encryptEnvelope,decryptEnvelope} from '../src/crypto/envelope.js';
import {reviewFixture} from './review-fixture.mjs';

test('UI-only private rebuild preserves the exact encrypted input and rejects changed or mutable inputs',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'review-preserved-envelope-'));
 try{
  const fixture=reviewFixture(),password='TEST_ONLY_PRESERVED_REVIEW';
  const encrypted=JSON.stringify(await encryptEnvelope(fixture,password));
  const input=join(directory,'input.enc.json'),output=join(directory,'review.html');
  await writeFile(input,encrypted,{mode:0o600});
  const digest=createHash('sha256').update(encrypted).digest('hex');
  const args=[resolve('scripts/build-private-review.mjs'),'--encrypted-bundle',input,'--expected-envelope-sha256',digest,'--output',output];
  execFileSync(process.execPath,args,{stdio:'pipe'});
  const html=await readFile(output,'utf8'),embedded=html.match(/<script type="application\/json" id="review-bundle">([\s\S]*?)<\/script>/)?.[1];
  assert.equal(embedded,encrypted);
  assert.equal(await readFile(output+'.enc.json','utf8'),encrypted);
  assert.equal(await readFile(input,'utf8'),encrypted);
  assert.deepEqual(await decryptEnvelope(embedded,password),fixture);
  assert.equal((await stat(output)).mode&0o777,0o600);
  assert.ok(!html.includes(password));
  assert.ok(!html.includes('TEST_ONLY company signed a contract.'));
  assert.ok(html.includes("connect-src 'none'"));
  // Duplicate JSON keys can parse to a valid object; reject raw closing markup
  // before embedding even when a caller supplies its matching file hash.
  const unsafe=encrypted.replace('\"version\":1','\"version\":\"</script>\",\"version\":1');
  assert.notEqual(unsafe,encrypted);
  await writeFile(input,unsafe,{mode:0o600});
  const unsafeArgs=[...args];unsafeArgs[unsafeArgs.indexOf('--expected-envelope-sha256')+1]=createHash('sha256').update(unsafe).digest('hex');
  assert.throws(()=>execFileSync(process.execPath,unsafeArgs,{stdio:'pipe'}),error=>String(error.stderr).includes('Unsafe encrypted input markup'));
  await writeFile(input,encrypted,{mode:0o600});
  for(const extra of [['--expected-envelope-sha256','0'.repeat(64)],['--password-stdin'],['--radar-result',input]]){
   const attempt=[...args];
   if(extra[0]==='--expected-envelope-sha256')attempt[attempt.indexOf(extra[0])+1]=extra[1];else attempt.push(...extra);
   assert.throws(()=>execFileSync(process.execPath,attempt,{stdio:'pipe'}));
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
