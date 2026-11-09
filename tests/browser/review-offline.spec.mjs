import {test,expect} from '@playwright/test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {reviewFixture} from '../review-fixture.mjs';
let directory,html,password;
test.beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'gpt-review-browser-'));
 const fixture=reviewFixture();
 for(const [name,value] of [
  ['actual_numeric_tenx_run_42622109601.json',fixture.numeric.result],
  ['selected_sec_sample_inputs.json',fixture.samples.map(s=>({case_id:s.case_id,packet:s.packet}))],
  ['selected_sec_sample_report.json',fixture.samples.map(s=>s.report)]
 ])await writeFile(join(directory,name),JSON.stringify(value));
 html=join(directory,'review.html');
 execFileSync(process.execPath,[resolve('scripts/build-private-review.mjs'),'--inputs',directory,'--output',html,'--password-file',join(directory,'passphrase')],{stdio:'pipe'});
 password=(await readFile(join(directory,'passphrase'),'utf8')).trim();
 const raw=await readFile(html,'utf8');
 expect(raw).not.toContain(password);expect(raw).not.toContain('TEST_ONLY company signed a contract.');
});
test.afterAll(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
test('portable encrypted HTML opens offline without requesting any external resource',async({page})=>{
 const requests=[],errors=[];
 page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(html).href);
 await page.getByLabel('체험 암호',{exact:true}).fill(password);
 await page.getByRole('button',{name:'체험 열기',exact:true}).click();
 await expect(page.getByRole('heading',{name:'수치 결과와 정성 판단'})).toBeVisible();
 await page.getByRole('button',{name:'TENX',exact:true}).click();
 await expect(page.getByRole('article',{name:'TEST 저장 표본'})).toContainText('표본 Q +2');
 await expect(page.getByRole('region',{name:'실제 TENX 숫자 실행'})).toContainText('미평가');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'체험 잠금',exact:true}).click();
 await expect(page.getByLabel('체험 암호',{exact:true})).toHaveValue('');
 expect(requests).toEqual([]);expect(errors).toEqual([]);
});
