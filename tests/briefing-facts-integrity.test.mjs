import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { encryptEnvelope } from '../src/crypto/envelope.js';
import { ARTIFACT_KIND, encryptBriefingArtifact, readBriefingArtifact } from '../src/features/briefing/briefing-artifact.js';

// Synthetic offline fixture only. This is a reader/writer integrity test, not model quality evidence.
const fixture = JSON.parse(await readFile(new URL('../src/features/briefing/fixtures/ready.json', import.meta.url), 'utf8'));
const password = 'synthetic-fact-integrity-test-only';
function artifact() {
  const data = structuredClone(fixture);
  data.execution_mode = data.identity.execution_mode = 'fake_transport';
  data.provider_receipt = { transport: 'fake' };
  const value = { artifact_kind: ARTIFACT_KIND, version: 1, created_at: data.generated_at,
    execution_mode: 'fake_transport', source_binding: { assessment_session: data.session,
      screening_archive_sha256: 'a'.repeat(64), normalizer_version: 'briefing-native-input-v1' }, briefing: data };
  rebind(value);
  return value;
}
function rebind(value) {
  const data = value.briefing;
  data.input_canonical_json = JSON.stringify(Object.fromEntries(
    ['schema_version', 'demo', 'session', 'engines', 'companies'].map(key => [key, data[key]])
  ));
  const inputHash = createHash('sha256').update(data.input_canonical_json).digest('hex');
  data.identity.input_hash = value.source_binding.input_hash = inputHash;
}
const options = value => ({ expectedSession: value.briefing.session, now: Date.parse(value.created_at) });

test('original source-bound facts retain the encrypted offline reader path', async () => {
  const value = artifact();
  const before = JSON.stringify(value.briefing.engines);
  const envelope = await encryptBriefingArtifact(value, password);
  const result = await readBriefingArtifact(envelope, password, options(value));
  assert.equal(result.status, 'ready');
  assert.equal(JSON.stringify(result.engines), before);
});

const faults = {
  'invented candidate count': value => { value.briefing.computed.facts.tenx_changes.count_delta = 999; },
  'invented candidate symbol': value => { value.briefing.computed.facts.tenx_changes.entered = ['TEST_ONLY_INVENTED']; },
  'unbound candidate source ID': value => { value.briefing.computed.facts.tenx_changes.sources = ['TEST_ONLY_UNBOUND']; },
  'candidate engine relabeling': value => { value.briefing.computed.facts.tenx_changes.engine = 'MLG'; },
  'invented shared exposure': value => { value.briefing.computed.facts.exposure.symbols = ['TEST_ONLY_INVENTED']; },
  'contradictory Radar market state': value => {
    value.briefing.engines.Radar.current.market_state = 'balanced';
    rebind(value);
  },
  'quarantined TENX retaining candidate facts': value => {
    value.briefing.engines.TENX.current.status = 'quarantined';
    rebind(value);
  },
  'stale TENX retaining candidate facts': value => {
    value.briefing.engines.TENX.current.session = value.briefing.engines.TENX.previous.session;
    rebind(value);
  }
};
for (const [name, mutate] of Object.entries(faults)) {
  test(`writer rejects ${name}`, async () => {
    const value = artifact();
    mutate(value);
    await assert.rejects(encryptBriefingArtifact(value, password), /BRIEFING_ARTIFACT_INVALID/);
  });
  test(`reader rejects ${name} even under valid authenticated encryption`, async () => {
    const value = artifact();
    mutate(value);
    // Bypass writer validation to exercise the reader's independent trust boundary.
    const envelope = await encryptEnvelope(value, password);
    await assert.rejects(readBriefingArtifact(envelope, password, options(value)), /BRIEFING_ARTIFACT_INVALID/);
  });
}

const { sourceFacts } = await import('../src/features/briefing/briefing-facts.js');
const { spawnSync } = await import('node:child_process');
const python = process.env.BRIEFING_TEST_PYTHON;
const backend = process.env.BRIEFING_TEST_BACKEND;
test('reader facts exactly match Python producer over independent engine availability and contract states', {skip: !python || !backend}, () => {
  const inputs = [];
  for (const name of ['Radar', 'TENX', 'MLG']) {
    for (const when of ['current', 'previous']) {
      for (const status of ['valid', 'missing', 'quarantined', 'invalid']) {
        for (const changedContract of [false, true]) {
          const data = structuredClone(fixture);
          data.engines[name][when].status = status;
          if (changedContract) data.engines[name][when].contract += '-changed';
          inputs.push(Object.fromEntries(['schema_version', 'demo', 'session', 'generated_at', 'engines', 'companies'].map(key => [key, data[key]])));
        }
      }
    }
  }
  const result = spawnSync(python, ['-c', 'import json,sys; from briefing.shadow import compute_facts; print(json.dumps([compute_facts(v) for v in json.load(sys.stdin)]))'], {
    input: JSON.stringify(inputs), encoding: 'utf8', env: {...process.env, PYTHONPATH: `${backend}/src`}
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(inputs.map(sourceFacts), JSON.parse(result.stdout));
});

test('all saved fixtures with computed facts retain exact producer facts', async () => {
  for (const name of ['ready', 'missing', 'mlg_input_hold', 'no_change', 'quarantined', 'stale']) {
    const data = JSON.parse(await readFile(new URL(`../src/features/briefing/fixtures/${name}.json`, import.meta.url), 'utf8'));
    const before = JSON.stringify(data.engines);
    assert.deepEqual(sourceFacts(data), data.computed, name);
    assert.equal(JSON.stringify(data.engines), before, name);
  }
});
