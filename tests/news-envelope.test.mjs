import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,pbkdf2Sync,createCipheriv,createHash} from 'node:crypto';
import {decryptRadarNewsEnvelope} from '../src/features/qualitative/news-envelope.js';
const password='TEST_ONLY_NEWS';
const packet={schema_version:'radar_news_v1',policy_version:'gs-gpt-02-radar-v1',affects_beta:false,status:'ready',run_id:'TEST_ONLY',cutoff_at:'2026-11-06T10:00:00Z',analyzed_at:'2026-11-06T10:01:00Z',events:[]};
function encrypt(value,aad='radar_news_v1'){
 const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(password,salt,600000,32,'sha256'),iv);cipher.setAAD(Buffer.from(aad));
 const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]);
 return {envelope_version:'radar_news_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:bytes.toString('base64'),payload_hash_kind:'ciphertext_sha256',payload_hash:createHash('sha256').update(bytes).digest('hex')};
}
test('news authenticated roundtrip is independent from Beta',async()=>assert.deepEqual(await decryptRadarNewsEnvelope(encrypt(packet),password),packet));
test('wrong password, domain, changed ciphertext, bad payload rejected',async()=>{
 const envelope=encrypt(packet);
 await assert.rejects(decryptRadarNewsEnvelope(envelope,'WRONG_TEST_PASSWORD'));
 await assert.rejects(decryptRadarNewsEnvelope(encrypt(packet,'market_radar_v1'),password));
 await assert.rejects(decryptRadarNewsEnvelope({...envelope,payload_hash:'0'.repeat(64)},password),/HASH_MISMATCH/);
 await assert.rejects(decryptRadarNewsEnvelope({...envelope,iterations:1},password),/INVALID/);
 await assert.rejects(decryptRadarNewsEnvelope(encrypt({...packet,affects_beta:true}),password),/INVALID_RADAR_NEWS/);
});
