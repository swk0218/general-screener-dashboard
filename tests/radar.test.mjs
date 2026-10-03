import assert from 'node:assert/strict';
import test from 'node:test';
import { MODEL_INPUTS, REFERENCE_INPUTS, validateRadarDelivery, FROZEN_MODEL_VERSION } from '../src/features/radar/radar-contract.js';
import { parseHashRoute, serializeHashRoute } from '../src/data/dashboard-model.js';
import { decryptRadarEnvelope } from '../src/features/radar/radar-envelope.js';
import { createCipheriv, pbkdf2Sync, randomBytes, createHash } from 'node:crypto';

function fixture(score=50,level='Neutral',bottom=false,top=false) {
  return {schema_version:'frozen_radar_delivery_v1',model_version:FROZEN_MODEL_VERSION,session:'2026-03-12',evidence_ready:false,
    events:{bottom,top},active:{bottom:true,top:false},scores:{bottom:.95,top:.95},
    gauge:{score,level,mixed:true,reference_version:'TEST_ONLY'},
    inputs:Object.fromEntries(MODEL_INPUTS.map(([key])=>[key,null])),
    references:Object.fromEntries(REFERENCE_INPUTS.map(([key])=>[key,null]))};
}
test('Radar route stays separate from engine strategy routes',()=>{
  assert.equal(parseHashRoute('#/radar').view,'radar');
  assert.equal(serializeHashRoute({view:'radar'}),'#/radar');
});
test('Extreme equals actual same-day event; active state is independent',()=>{
  for(const [score,level,b,t] of [[0,'Extreme Low',true,false],[19,'Extreme Low',true,false],[80,'Extreme High',false,true],[100,'Extreme High',false,true],[20,'Low',false,false],[50,'Neutral',false,false],[79,'High',false,false]]) {
    assert.equal(validateRadarDelivery(fixture(score,level,b,t)).gauge.score,score);
  }
  assert.throws(()=>validateRadarDelivery(fixture(19,'Extreme Low')));
  assert.throws(()=>validateRadarDelivery(fixture(80,'Extreme High')));
  assert.throws(()=>validateRadarDelivery(fixture(50,'Neutral',true,false)));
});
test('conflicting issued signals have no scalar',()=>{
  assert.equal(validateRadarDelivery(fixture(null,'CONFLICT',true,true)).gauge.score,null);
  assert.throws(()=>validateRadarDelivery(fixture(50,'Neutral',true,true)));
});
test('missing or malformed input is never filled with neutral',()=>{
  const value=fixture(null,'UNAVAILABLE');
  assert.equal(validateRadarDelivery(value).gauge.score,null);
  delete value.inputs.cnn_rank;
  assert.throws(()=>validateRadarDelivery(value));
  const bad=fixture();bad.scores.bottom=NaN;
  assert.throws(()=>validateRadarDelivery(bad));
  assert.throws(()=>validateRadarDelivery({...fixture(),model_version:'0'.repeat(64)}));
});

test('optional Radar envelope rejects plaintext, altered KDF and extra keys',async()=>{
  for(const value of [fixture(),{envelope_version:'market_radar_encrypted_v1',iterations:1},
    {envelope_version:'market_radar_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,raw:'forbidden'}]) {
    await assert.rejects(()=>decryptRadarEnvelope(value,'TEST_ONLY_PASSWORD'));
  }
});

test('Radar authenticates ciphertext, password and payload digest',async()=>{
  const passphrase='TEST_ONLY_NOT_A_REAL_PASSWORD';
  const payload=fixture();const plaintext=Buffer.from(JSON.stringify(payload));
  const salt=randomBytes(16),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(passphrase,salt,600000,32,'sha256'),iv);
  cipher.setAAD(Buffer.from('market_radar_v1'));
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
  const envelope={envelope_version:'market_radar_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,
    salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),payload_hash:createHash('sha256').update(plaintext).digest('hex')};
  assert.deepEqual(await decryptRadarEnvelope(envelope,passphrase),payload);
  await assert.rejects(()=>decryptRadarEnvelope(envelope,'TEST_ONLY_WRONG_PASSWORD'));
  await assert.rejects(()=>decryptRadarEnvelope({...envelope,payload_hash:'0'.repeat(64)},passphrase));
  ciphertext[0]^=1;
  await assert.rejects(()=>decryptRadarEnvelope({...envelope,ciphertext:ciphertext.toString('base64')},passphrase));
});
