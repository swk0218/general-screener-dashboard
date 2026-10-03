import { validateRadarDelivery } from './radar-contract.js';

const decode=value=>{
  if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('INVALID_RADAR_ENVELOPE');
  return Uint8Array.from(atob(value),character=>character.charCodeAt(0));
};

export async function decryptRadarEnvelope(envelope,passphrase) {
  if(envelope?.envelope_version!=='market_radar_encrypted_v1'||envelope.algorithm!=='AES-256-GCM'
    ||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==600000||typeof passphrase!=='string'
    ||!Object.keys(envelope).every(key=>['envelope_version','algorithm','kdf','iterations','salt','iv','ciphertext','payload_hash'].includes(key)))throw new Error('INVALID_RADAR_ENVELOPE');
  const salt=decode(envelope.salt),iv=decode(envelope.iv),ciphertext=decode(envelope.ciphertext);
  if(salt.length!==16||iv.length!==12||ciphertext.length<16||!/^[0-9a-f]{64}$/.test(envelope.payload_hash))throw new Error('INVALID_RADAR_ENVELOPE');
  const encoder=new TextEncoder();
  const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode('market_radar_v1'),tagLength:128},key,ciphertext);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',plaintext))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==envelope.payload_hash)throw new Error('RADAR_HASH_MISMATCH');
  return validateRadarDelivery(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext)));
}

export async function loadRadarDelivery(url,passphrase,signal) {
  const response=await fetch(url,{signal,cache:'no-store'});
  if(!response.ok)throw new Error('RADAR_UNAVAILABLE');
  return decryptRadarEnvelope(await response.json(),passphrase);
}
