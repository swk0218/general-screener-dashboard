import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { nativeInput, cutoff } from './briefing-native.mjs';
import { ARTIFACT_KIND } from '../../src/features/briefing/briefing-artifact.js';
export async function pipelineFixture(directory, options = {}) {
  const python = process.env.BRIEFING_TEST_PYTHON,
    backend = process.env.BRIEFING_TEST_BACKEND;
  if (!python || !backend) throw new Error('Explicit test Python/backend required; no external calls');
  const native = await nativeInput(options);
  await writeFile(join(directory, 'input.json'), JSON.stringify(native.data));
  execFileSync(python, ['scripts/run_gpt_postprocess_offline.py', '--enable-offline', '--input', join(directory, 'input.json'), '--response-fixture', 'tests/fixtures/gpt_shadow/response.json', '--output', join(directory, 'result.json'), '--ledger', join(directory, 'budget.db'), '--completed-at', cutoff], {
    cwd: backend,
    env: {
      ...process.env,
      PYTHONPATH: 'src'
    },
    stdio: 'pipe'
  });
  const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
  return {
    artifact: {
      artifact_kind: ARTIFACT_KIND,
      version: 1,
      created_at: cutoff,
      execution_mode: 'fake_transport',
      source_binding: {
        ...native.binding,
        input_hash: result.input_hash
      },
      briefing: result.briefing
    },
    native
  };
}
