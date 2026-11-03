import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {roleTaxonomyFor,DIRECT_ROLE_PROFILE,DIRECT_TAXONOMY_HASH} from '../src/features/briefing/role-taxonomy.js';
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;

test('historical role definitions do not silently change with the new profile',()=>{
  const old=roleTaxonomyFor({identity:{prompt_version:'available-facts-v2'}});
  assert.equal(old.schema,'gpt_role_taxonomy_v1');
  assert.equal(roleTaxonomyFor({taxonomy:{semiconductor:'anything'}}),old);
  const direct=roleTaxonomyFor({identity:{prompt_version:DIRECT_ROLE_PROFILE}});
  assert.equal(direct.schema,'gpt_role_taxonomy_v2');
  assert.deepEqual(direct.role_priority,old.role_priority);
  assert.equal(createHash('sha256').update(JSON.stringify(sorted(direct))).digest('hex'),DIRECT_TAXONOMY_HASH);
});

test('new prompt contract and displayed taxonomy have one canonical definition',{
  skip:!process.env.BRIEFING_TEST_BACKEND
},()=>{
  const backend=JSON.parse(readFileSync(join(process.env.BRIEFING_TEST_BACKEND,'contracts/gpt_role_taxonomy_v2.json'),'utf8'));
  assert.deepEqual(roleTaxonomyFor({identity:{prompt_version:DIRECT_ROLE_PROFILE}}),backend);
});
