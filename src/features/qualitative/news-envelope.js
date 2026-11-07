import { radarBriefing } from './briefing-model.js';

function validateNews(value) {
  if(radarBriefing(value)?.status === 'invalid' || value == null) throw new Error('INVALID_RADAR_NEWS');
  return value;
}

const decode = value => {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('INVALID_RADAR_NEWS_ENVELOPE');
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
};

export async function decryptRadarNewsEnvelope(envelope, passphrase, validationOptions) {
  if (envelope?.envelope_version !== 'radar_news_encrypted_v1'
    || envelope.algorithm !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-SHA256'
    || envelope.iterations !== 600000 || typeof passphrase !== 'string'
    || envelope.payload_hash_kind !== 'ciphertext_sha256'
    || !Object.keys(envelope).every(key => ['envelope_version', 'algorithm', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext', 'payload_hash', 'payload_hash_kind'].includes(key))) {
    throw new Error('INVALID_RADAR_NEWS_ENVELOPE');
  }
  const salt = decode(envelope.salt), iv = decode(envelope.iv), ciphertext = decode(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > 131072
    || !/^[0-9a-f]{64}$/.test(envelope.payload_hash)) throw new Error('INVALID_RADAR_NEWS_ENVELOPE');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', ciphertext))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== envelope.payload_hash) throw new Error('RADAR_NEWS_HASH_MISMATCH');
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('radar_news_v1'), tagLength: 128 }, key, ciphertext);
  return validateNews(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)));
}

export async function loadRadarNewsDelivery(url, passphrase, signal) {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('RADAR_NEWS_UNAVAILABLE');
  const raw = await response.text();
  if(raw.length > 180000) throw new Error('RADAR_NEWS_TOO_LARGE');
  return decryptRadarNewsEnvelope(JSON.parse(raw), passphrase);
}
