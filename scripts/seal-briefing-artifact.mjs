// Optional local/server callable. No environment key lookup, publishing or workflow trigger.
import { writeFile, rename, readFile, rm, open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { decryptEnvelope } from '../src/crypto/envelope.js';
import { assertBriefingArtifact, assertBriefingDeliveryStatus, encryptBriefingArtifact, readBriefingArtifact } from '../src/features/briefing/briefing-artifact.js';
export async function sealBriefingArtifact(artifact, passphrase, destination) {
  return withLock(destination, async () => {
    try {
      const existing = await readFile(destination, 'utf8');
      const prior = assertBriefingArtifact(await decryptEnvelope(existing, passphrase));
      const comparable = value => JSON.stringify({
        ...value,
        created_at: null,
        briefing: {
          ...value.briefing,
          status: 'ready',
          attempts: 0
        }
      });
      if (comparable(prior) === comparable(artifact)) return JSON.parse(existing);
      if (!['ready', 'cached'].includes(artifact.briefing?.status)) return JSON.parse(existing);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const envelope = await encryptBriefingArtifact(artifact, passphrase);
    await readBriefingArtifact(envelope, passphrase, {
      expectedSession: artifact.source_binding.assessment_session,
      now: Date.parse(artifact.created_at)
    });
    const temporary = `${destination}.pending-${randomUUID()}`;
    // Exclusive temp creation and atomic replacement preserve the old feed on failure.
    await replaceBytes(JSON.stringify(envelope), destination, temporary);
    return envelope;
  });
}
async function replaceBytes(raw, destination, temporary = `${destination}.pending-${randomUUID()}`) {
  let owned = false;
  try {
    await writeFile(temporary, raw, {
      flag: 'wx',
      mode: 0o600
    });
    owned = true;
    await rename(temporary, destination);
  } finally {
    if (owned) await rm(temporary, {
      force: true
    });
  }
}
async function withLock(destination, operation) {
  const path = `${destination}.lock`,
    handle = await open(path, 'wx', 0o600);
  try {
    return await operation();
  } finally {
    await handle.close();
    await rm(path, {
      force: true
    });
  }
}
export async function writeBriefingDeliveryStatus(attempt, cipherRaw, destination, {stale=false, attemptedAt=attempt.created_at}={}) {
  assertBriefingArtifact(attempt);
  const status = assertBriefingDeliveryStatus({
    schema: 'briefing_delivery_status_v1',
    status: stale ? 'STALE' : ['ready', 'cached'].includes(attempt.briefing.status) ? 'READY' : 'FAILED',
    expected_session: attempt.source_binding.assessment_session,
    expected_input_hash: attempt.source_binding.input_hash,
    cipher_sha256: createHash('sha256').update(cipherRaw).digest('hex'),
    last_attempt_at: attemptedAt
  });
  await withLock(destination, () => replaceBytes(JSON.stringify(status), destination));
  return status;
}
export async function rollbackBriefingArtifact(raw, expectedHash, passphrase, destination) {
  return withLock(destination, async () => {
    if (createHash('sha256').update(raw).digest('hex') !== expectedHash) throw new Error('ROLLBACK_DIGEST_MISMATCH');
    const prior = await decryptEnvelope(raw.toString(), passphrase);
    // Validate purpose/schema even when it is a deliberately older, dated result.
    await readBriefingArtifact(JSON.parse(raw), passphrase, {
      expectedSession: prior.source_binding?.assessment_session,
      now: Date.parse(prior.created_at)
    });
    await replaceBytes(raw, destination);
  });
}
