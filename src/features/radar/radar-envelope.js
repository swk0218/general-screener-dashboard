import { validateRadarDelivery } from './radar-contract.js';
import { validateObservationStatus } from './observation-status.js';

const decode=value=>{
  if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('INVALID_RADAR_ENVELOPE');
  return Uint8Array.from(atob(value),character=>character.charCodeAt(0));
};

export async function decryptRadarEnvelope(envelope,passphrase) {
  if(envelope?.envelope_version!=='market_radar_encrypted_v1'||envelope.algorithm!=='AES-256-GCM'
    ||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==600000||typeof passphrase!=='string'
    ||!Object.keys(envelope).every(key=>['envelope_version','algorithm','kdf','iterations','salt','iv','ciphertext','payload_hash','payload_hash_kind'].includes(key))
    ||envelope.payload_hash_kind!==undefined&&envelope.payload_hash_kind!=='ciphertext_sha256')throw new Error('INVALID_RADAR_ENVELOPE');
  const salt=decode(envelope.salt),iv=decode(envelope.iv),ciphertext=decode(envelope.ciphertext);
  if(salt.length!==16||iv.length!==12||ciphertext.length<16||!/^[0-9a-f]{64}$/.test(envelope.payload_hash))throw new Error('INVALID_RADAR_ENVELOPE');
  const encoder=new TextEncoder();
  const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode('market_radar_v1'),tagLength:128},key,ciphertext);
  const digestInput=envelope.payload_hash_kind==='ciphertext_sha256'?ciphertext:plaintext;
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',digestInput))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==envelope.payload_hash)throw new Error('RADAR_HASH_MISMATCH');
  const delivery=validateRadarDelivery(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext)));
  if(delivery.operating_status==='OBSERVATION_COMPUTED'&&envelope.payload_hash_kind!=='ciphertext_sha256')throw new Error('OBSERVATION_REQUIRES_CIPHERTEXT_HASH');
  return delivery;
}

export async function loadRadarDelivery(url,passphrase,signal,expectedCipherHash=null) {
  const response=await fetch(url,{signal,cache:'no-store'});
  if(!response.ok)throw new Error('RADAR_UNAVAILABLE');
  if(expectedCipherHash){
    const raw=await response.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(digest!==expectedCipherHash)throw new Error('FEED_STATUS_BINDING_MISMATCH');
    return decryptRadarEnvelope(JSON.parse(new TextDecoder().decode(raw)),passphrase);
  }
  return decryptRadarEnvelope(await response.json(),passphrase);
}

export async function loadOptionalRadarDelivery(statusUrl,url,passphrase,signal) {
  const response=await fetch(statusUrl,{signal,cache:'no-store'});
  let expectedCipherHash=null;
  if(response.ok) {
    // A published observation-only status explicitly has no live model feed.
    const status=validateObservationStatus(await response.json());
    if(status.mode==='OBSERVATION_BETA'&&status.score_delivery_available!==true)return null;
    if(status.schema_version==='radar_engine_status_v1'){
      if(!status.feed_cipher_sha256)return null;
      expectedCipherHash=status.feed_cipher_sha256;
    }
  }
  return loadRadarDelivery(url,passphrase,signal,expectedCipherHash);
}
