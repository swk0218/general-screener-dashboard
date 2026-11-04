import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
export const sourceReviewBackendAvailable=Boolean(process.env.BRIEFING_TEST_PYTHON&&process.env.BRIEFING_TEST_BACKEND);
export async function sourceReviewedFixture(directory,{fresh=false,afterReview=false}={}){
  if(!sourceReviewBackendAvailable)throw Error('Explicit private offline backend required');
  const output=join(directory,'source-reviewed-fixture.json');
  execFileSync(process.env.BRIEFING_TEST_PYTHON,['tests/fixtures/build_source_review_fixture.py','--output',output,...(fresh?['--fresh-synthetic']:[]),...(afterReview?['--after-review']:[])],
    {cwd:process.env.BRIEFING_TEST_BACKEND,env:{...process.env,PYTHONPATH:'src'},stdio:'pipe'});
  return JSON.parse(await readFile(output,'utf8'));
}
