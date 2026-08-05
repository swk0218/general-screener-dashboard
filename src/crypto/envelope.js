const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export const ENVELOPE_VERSION = 1;
export const PAYLOAD_AAD = "general-screener|envelope-v1|payload-v1";
export const PBKDF2_ITERATIONS = 600_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const GCM_TAG_BITS = 128;
const utf8Encoder = new TextEncoder();

export class EnvelopeValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "EnvelopeValidationError";
  }
}

export class EnvelopeDecryptionError extends Error {
  constructor() {
    super("The encrypted payload could not be decrypted.");
    this.name = "EnvelopeDecryptionError";
  }
}

function webCrypto() {
  const crypto = globalThis.crypto;

  if (!crypto?.subtle || typeof crypto.getRandomValues !== "function") {
    throw new Error("Web Crypto is not available in this environment.");
  }

  return crypto;
}

function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new TypeError("Passphrase must be a non-empty string.");
  }
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new EnvelopeValidationError(`${label} must be an object.`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();

  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new EnvelopeValidationError(`${label} has an invalid shape.`);
  }
}

function encodeBase64Url(bytes) {
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;

    encoded += BASE64URL_ALPHABET[first >>> 2];
    encoded += BASE64URL_ALPHABET[((first & 0x03) << 4) | (second >>> 4)];

    if (hasSecond) {
      encoded +=
        BASE64URL_ALPHABET[((second & 0x0f) << 2) | (third >>> 6)];
    }

    if (hasThird) {
      encoded += BASE64URL_ALPHABET[third & 0x3f];
    }
  }

  return encoded;
}

function decodeBase64Url(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new EnvelopeValidationError(`${label} must be canonical base64url.`);
  }

  const bytes = new Uint8Array(Math.floor((value.length * 6) / 8));
  let accumulator = 0;
  let bitCount = 0;
  let outputIndex = 0;

  for (const character of value) {
    accumulator =
      (accumulator << 6) | BASE64URL_ALPHABET.indexOf(character);
    bitCount += 6;

    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[outputIndex] = (accumulator >>> bitCount) & 0xff;
      outputIndex += 1;
      accumulator &= (1 << bitCount) - 1;
    }
  }

  if (accumulator !== 0 || encodeBase64Url(bytes) !== value) {
    throw new EnvelopeValidationError(`${label} must be canonical base64url.`);
  }

  return bytes;
}

function decodeEnvelope(envelope) {
  assertRecord(envelope, "Envelope");
  assertExactKeys(
    envelope,
    ["version", "kdf", "cipher", "aad", "ciphertext"],
    "Envelope",
  );

  if (envelope.version !== ENVELOPE_VERSION) {
    throw new EnvelopeValidationError("Envelope version is not supported.");
  }

  assertRecord(envelope.kdf, "Envelope kdf");
  assertExactKeys(
    envelope.kdf,
    ["name", "hash", "iterations", "salt"],
    "Envelope kdf",
  );

  if (
    envelope.kdf.name !== "PBKDF2" ||
    envelope.kdf.hash !== "SHA-256" ||
    envelope.kdf.iterations !== PBKDF2_ITERATIONS
  ) {
    throw new EnvelopeValidationError("Envelope kdf parameters are invalid.");
  }

  assertRecord(envelope.cipher, "Envelope cipher");
  assertExactKeys(
    envelope.cipher,
    ["name", "iv", "tagLength"],
    "Envelope cipher",
  );

  if (
    envelope.cipher.name !== "AES-GCM" ||
    envelope.cipher.tagLength !== GCM_TAG_BITS
  ) {
    throw new EnvelopeValidationError("Envelope cipher parameters are invalid.");
  }

  if (envelope.aad !== PAYLOAD_AAD) {
    throw new EnvelopeValidationError("Envelope AAD is invalid.");
  }

  const salt = decodeBase64Url(envelope.kdf.salt, "Envelope salt");
  const iv = decodeBase64Url(envelope.cipher.iv, "Envelope IV");
  const ciphertext = decodeBase64Url(
    envelope.ciphertext,
    "Envelope ciphertext",
  );

  if (salt.byteLength !== SALT_BYTES) {
    throw new EnvelopeValidationError("Envelope salt must be 16 bytes.");
  }

  if (iv.byteLength !== IV_BYTES) {
    throw new EnvelopeValidationError("Envelope IV must be 12 bytes.");
  }

  if (ciphertext.byteLength < GCM_TAG_BITS / 8) {
    throw new EnvelopeValidationError("Envelope ciphertext is too short.");
  }

  return { salt, iv, ciphertext };
}

function parseEnvelopeJson(serialized) {
  if (typeof serialized !== "string") {
    throw new EnvelopeValidationError("Serialized envelope must be a string.");
  }

  try {
    return JSON.parse(serialized);
  } catch {
    throw new EnvelopeValidationError("Envelope is not valid JSON.");
  }
}

async function deriveAesKey(passphrase, salt, usage) {
  const crypto = webCrypto();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8Encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export function validateEnvelope(envelope) {
  decodeEnvelope(envelope);
  return true;
}

export function parseEnvelope(serialized) {
  const envelope = parseEnvelopeJson(serialized);
  validateEnvelope(envelope);
  return envelope;
}

export function serializeEnvelope(envelope) {
  validateEnvelope(envelope);
  return JSON.stringify(envelope);
}

export async function encryptEnvelope(payload, passphrase) {
  assertPassphrase(passphrase);

  let plaintext;
  try {
    plaintext = JSON.stringify(payload);
  } catch {
    throw new TypeError("Payload must be JSON-serializable.");
  }

  if (plaintext === undefined) {
    throw new TypeError("Payload must be JSON-serializable.");
  }

  const crypto = webCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt, "encrypt");
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: utf8Encoder.encode(PAYLOAD_AAD),
      tagLength: GCM_TAG_BITS,
    },
    key,
    utf8Encoder.encode(plaintext),
  );

  return {
    version: ENVELOPE_VERSION,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: encodeBase64Url(salt),
    },
    cipher: {
      name: "AES-GCM",
      iv: encodeBase64Url(iv),
      tagLength: GCM_TAG_BITS,
    },
    aad: PAYLOAD_AAD,
    ciphertext: encodeBase64Url(new Uint8Array(encrypted)),
  };
}

export async function decryptEnvelope(envelopeOrSerialized, passphrase) {
  assertPassphrase(passphrase);

  const envelope =
    typeof envelopeOrSerialized === "string"
      ? parseEnvelopeJson(envelopeOrSerialized)
      : envelopeOrSerialized;
  const { salt, iv, ciphertext } = decodeEnvelope(envelope);
  const key = await deriveAesKey(passphrase, salt, "decrypt");

  try {
    const decrypted = await webCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: utf8Encoder.encode(PAYLOAD_AAD),
        tagLength: GCM_TAG_BITS,
      },
      key,
      ciphertext,
    );
    const plaintext = new TextDecoder("utf-8", { fatal: true }).decode(decrypted);
    return JSON.parse(plaintext);
  } catch {
    throw new EnvelopeDecryptionError();
  }
}

export const encryptPayload = encryptEnvelope;
export const decryptPayload = decryptEnvelope;
