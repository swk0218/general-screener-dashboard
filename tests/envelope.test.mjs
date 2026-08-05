import assert from "node:assert/strict";
import test from "node:test";

import {
  EnvelopeDecryptionError,
  EnvelopeValidationError,
  PAYLOAD_AAD,
  PBKDF2_ITERATIONS,
  decryptEnvelope,
  encryptEnvelope,
  validateEnvelope,
} from "../src/crypto/envelope.js";

const PASSPHRASE = "correct horse battery staple for dashboard";
const PAYLOAD = {
  generatedAt: "2026-08-05T12:00:00Z",
  title: "GENERAL SCREENER",
  picks: [
    { symbol: "ACME", score: 91.25 },
    { symbol: "한글", note: "브라우저 복호화 확인" },
  ],
};

test("round-trips a JSON payload with the fixed envelope parameters", async () => {
  const envelope = await encryptEnvelope(PAYLOAD, PASSPHRASE);

  assert.equal(envelope.version, 1);
  assert.equal(envelope.kdf.name, "PBKDF2");
  assert.equal(envelope.kdf.hash, "SHA-256");
  assert.equal(envelope.kdf.iterations, PBKDF2_ITERATIONS);
  assert.equal(envelope.cipher.name, "AES-GCM");
  assert.equal(envelope.cipher.tagLength, 128);
  assert.equal(envelope.aad, PAYLOAD_AAD);
  assert.equal(validateEnvelope(envelope), true);
  assert.deepEqual(await decryptEnvelope(envelope, PASSPHRASE), PAYLOAD);
});

test("rejects a wrong passphrase without exposing authentication details", async () => {
  const envelope = await encryptEnvelope(PAYLOAD, PASSPHRASE);

  await assert.rejects(
    decryptEnvelope(envelope, "this is definitely the wrong passphrase"),
    EnvelopeDecryptionError,
  );
});

test("rejects authenticated ciphertext tampering", async () => {
  const envelope = await encryptEnvelope(PAYLOAD, PASSPHRASE);
  const firstCharacter = envelope.ciphertext[0];
  const tampered = {
    ...envelope,
    ciphertext: `${firstCharacter === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}`,
  };

  assert.equal(validateEnvelope(tampered), true);
  await assert.rejects(
    decryptEnvelope(tampered, PASSPHRASE),
    EnvelopeDecryptionError,
  );
});

test("uses fresh randomness for every encryption", async () => {
  const first = await encryptEnvelope(PAYLOAD, PASSPHRASE);
  const second = await encryptEnvelope(PAYLOAD, PASSPHRASE);

  assert.notEqual(first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.cipher.iv, second.cipher.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.deepEqual(await decryptEnvelope(first, PASSPHRASE), PAYLOAD);
  assert.deepEqual(await decryptEnvelope(second, PASSPHRASE), PAYLOAD);
});

test("strictly rejects unsupported fields and parameters", async () => {
  const envelope = await encryptEnvelope(PAYLOAD, PASSPHRASE);

  assert.throws(
    () => validateEnvelope({ ...envelope, unexpected: true }),
    EnvelopeValidationError,
  );
  assert.throws(
    () =>
      validateEnvelope({
        ...envelope,
        kdf: { ...envelope.kdf, iterations: PBKDF2_ITERATIONS - 1 },
      }),
    EnvelopeValidationError,
  );
  assert.throws(
    () => validateEnvelope({ ...envelope, ciphertext: "AA=" }),
    EnvelopeValidationError,
  );
});
