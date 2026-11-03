import test from 'node:test';
import assert from 'node:assert/strict';
import {optionalDelivery} from '../src/features/briefing/optional-delivery.js';

test('deadline holds a never-settling optional source and aborts its signal',async()=>{
  let signal;
  const held=await optionalDelivery(value=>{signal=value;return new Promise(()=>{});},{timeoutMs:5,fallback:'held'});
  assert.equal(held,'held');assert.equal(signal.aborted,true);
});
test('late optional response cannot replace the held result',async()=>{
  let complete;const pending=optionalDelivery(()=>new Promise(resolve=>{complete=resolve;}),{timeoutMs:5,fallback:{status:'unavailable'}});
  const result=await pending;complete({status:'ready'});await Promise.resolve();
  assert.deepEqual(result,{status:'unavailable'});
});
test('lock cancellation aborts inflight source and prevents pre-aborted work',async()=>{
  const parent=new AbortController();let child,calls=0;
  const result=optionalDelivery(signal=>{calls++;child=signal;return new Promise(()=>{});},{signal:parent.signal,fallback:'held'});
  await Promise.resolve();parent.abort();assert.equal(await result,'held');assert.equal(child.aborted,true);
  assert.equal(await optionalDelivery(()=>{calls++;},{signal:parent.signal,fallback:'held'}),'held');assert.equal(calls,1);
});
test('optional success and rejected source retain bounded fallback semantics',async()=>{
  const data={status:'ready'};
  assert.equal(await optionalDelivery(()=>data),data);
  assert.equal(await optionalDelivery(()=>{throw Error('private body');},{fallback:'held'}),'held');
  assert.equal(await optionalDelivery(()=>undefined,{fallback:'held'}),'held');
});
test('deadline policy rejects invalid limits before starting work',()=>{
  for(const timeoutMs of [0,-1,30001,NaN,Infinity])assert.throws(()=>optionalDelivery(()=>{}, {timeoutMs}),TypeError);
});
