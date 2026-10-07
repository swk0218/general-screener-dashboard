import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, pbkdf2Sync, createCipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateSeasonality, seasonalityPercent, seasonalityMonth, seasonalityWindow } from '../src/features/radar/seasonality-contract.js';
import { decryptSeasonalityEnvelope, loadSeasonalityDelivery } from '../src/features/radar/seasonality-envelope.js';

const options = { now: new Date('2026-10-07T12:00:00Z') };
const fixture = () => ({ schema:'radar_monthly_seasonality_v1', symbol:'SPY', start_year:2006, end_year:2025,
  lookback_years:20, price_basis:'dividend_adjusted_close', source:'FMP', computed_at_utc:'2026-10-07T11:00:00Z',
  months:Array.from({length:12},(_,index)=>({month:index+1,mean_return:(index-3)/1000,n:20})) });
function seal(value, password='synthetic-test-passphrase', aad='radar_monthly_seasonality_v1') {
  const salt=randomBytes(16),iv=randomBytes(12),key=pbkdf2Sync(password,salt,600000,32,'sha256');
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]);
  return { envelope_version:'radar_monthly_seasonality_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,
    salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),
    payload_hash:createHash('sha256').update(ciphertext).digest('hex'),payload_hash_kind:'ciphertext_sha256' };
}
test('seasonality requires twelve sorted months and exactly twenty completed years',()=>{
  assert.equal(validateSeasonality(fixture(), options).months.length,12);
  for (const change of [v=>v.months.pop(),v=>v.months[1].month=1,v=>v.months[0].n=29,v=>v.months[0].mean_return=null,
    v=>v.months[0].mean_return=Infinity,v=>v.end_year=2026,v=>v.start_year=1995,v=>v.symbol='WORLD',
    v=>v.price_basis='close',v=>v.months[0].raw_prices=[],v=>v.forecast_probability=.9]) {
    const value=fixture();change(value);assert.throws(()=>validateSeasonality(value, options),/INVALID_SEASONALITY/);
  }
});
test('format is arithmetic percentage points, with zero and negative values preserved',()=>{
  assert.equal(seasonalityPercent(.0256),'+2.56%');assert.equal(seasonalityPercent(-.0046),'-0.46%');
  assert.equal(seasonalityPercent(0),'0.00%');assert.equal(seasonalityPercent(-.000001),'0.00%');
});
test('current month follows the US market calendar across UTC month boundaries',()=>{
  assert.equal(seasonalityMonth(new Date('2026-11-01T01:00:00Z')),10);
  assert.equal(seasonalityMonth(new Date('2026-11-01T07:00:00Z')),11);
});
test('optional aggregate decrypts with the existing passphrase and ciphertext integrity',async()=>{
  const value=fixture(),encrypted=seal(value);assert.deepEqual(await decryptSeasonalityEnvelope(encrypted,'synthetic-test-passphrase', options),value);
  await assert.rejects(decryptSeasonalityEnvelope(encrypted,'wrong-passphrase', options));
  await assert.rejects(decryptSeasonalityEnvelope({...encrypted,payload_hash:'0'.repeat(64)},'synthetic-test-passphrase', options),/HASH_MISMATCH/);
  await assert.rejects(decryptSeasonalityEnvelope({...encrypted,raw_values:[]},'synthetic-test-passphrase', options),/INVALID_SEASONALITY_ENVELOPE/);
  await assert.rejects(decryptSeasonalityEnvelope(seal(value,'synthetic-test-passphrase','market_radar_v1'),'synthetic-test-passphrase', options));
});
test('malformed plaintext is rejected after successful authenticated decryption',async()=>{
  const value=fixture();value.months[0].n=31;
  await assert.rejects(decryptSeasonalityEnvelope(seal(value),'synthetic-test-passphrase', options),/INVALID_SEASONALITY/);
});
test('missing optional feed and cancellation fail independently',async()=>{
  const before=global.fetch;try {
    global.fetch=async()=>({ok:false});await assert.rejects(loadSeasonalityDelivery('/missing','test'),/UNAVAILABLE/);
    const controller=new AbortController();controller.abort();global.fetch=async(_url,options)=>{options.signal.throwIfAborted();};
    await assert.rejects(loadSeasonalityDelivery('/cancelled','test',controller.signal),{name:'AbortError'});
  } finally {global.fetch=before;}
});
test('seasonality is last supplementary indicator, with no model input coupling or plaintext dataset',async()=>{
  const radar=await readFile(new URL('../src/features/radar/RadarView.jsx',import.meta.url),'utf8');
  assert.ok(radar.indexOf('<SeasonalityCard')>radar.indexOf('className="radar-reference-grid"'));
  assert.ok(radar.indexOf('<SeasonalityCard')<radar.indexOf('className="radar-support"'));
  const card=await readFile(new URL('../src/features/radar/SeasonalityCard.jsx',import.meta.url),'utf8');
  assert.match(card,/SPY 월별 평균 수익률/);assert.match(card,/if \(!data \|\| !seasonalityIsCurrent\(data\)\) return null/);
  assert.doesNotMatch(card,/경고|미래|확률|예측|positive_rate|median/);
  const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(app,/loadSeasonalityDelivery[\s\S]*unlockGeneration.current === generation/);
  assert.match(app,/function lock\(\)[\s\S]*setSeasonality\(null\)/);
  const contract=await readFile(new URL('../src/features/radar/radar-contract.js',import.meta.url),'utf8');
  assert.doesNotMatch(contract,/seasonality/);
});

test('old and future windows fail closed at the New York year boundary',()=>{
  const value=fixture();
  assert.deepEqual(seasonalityWindow(new Date('2027-01-01T01:00:00Z')),{start:2006,end:2025});
  assert.deepEqual(seasonalityWindow(new Date('2027-01-01T06:00:00Z')),{start:2007,end:2026});
  assert.throws(()=>validateSeasonality(value,{now:new Date('2027-01-01T06:00:00Z')}),/INVALID_SEASONALITY/);
  assert.equal(validateSeasonality(value,{now:new Date('2027-01-01T06:00:00Z'),allowHistorical:true}),value);
  const old=fixture();old.start_year=2005;old.end_year=2024;
  assert.throws(()=>validateSeasonality(old,options),/INVALID_SEASONALITY/);
  const future=fixture();future.computed_at_utc='2099-01-01T00:00:00Z';
  assert.throws(()=>validateSeasonality(future,options),/INVALID_SEASONALITY/);
  assert.throws(()=>validateSeasonality(future,{...options,allowHistorical:true}),/INVALID_SEASONALITY/);
});
