import { test, expect } from "@playwright/test";

test("MLG source hold keeps document evidence and suppresses unsupported comparison",async({page})=>{
  await page.goto('/?demo=briefing');
  await page.locator('select').selectOption('mlg_input_hold');
  await expect(page.getByLabel('자료 기준일')).toContainText('확인되지 않음');
  await page.getByRole('button',{name:'공급망 역할 검토',exact:true}).click();
  const status=page.locator('[data-role-review-state="comparison_held"]');
  await expect(status).toContainText('기존 분류와의 대조는 보류');
  await expect(page.locator('.brief-role')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'기존 분류와 다른 기업',exact:true})).toBeDisabled();
  await expect(page.locator('.brief-role').first()).toContainText('대조 보류');
  await status.getByText('검토 범위와 보류 이유',{exact:true}).click();
  await expect(status).toContainText('일부 자료의 검사는 전체 점수·순위의 재검증을 대신하지 않습니다');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('select').selectOption('failure');
  await expect(page.locator('[data-role-review-state="held"]')).toBeVisible();
  await expect(page.locator('.brief-role')).toHaveCount(0);
  await expect(page.locator('.brief-main')).toContainText('해당 사업이 없다는 뜻은 아닙니다');
});

test("keyboard entry and touch targets remain accessible", async({page})=>{
  await page.goto('/?demo=briefing');
  const clocks=page.getByLabel('자료 기준일');
  await expect(clocks).toContainText('2026-11-02 12:00 UTC');
  await page.getByRole('heading',{level:1}).waitFor();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'본문으로 이동'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#brief-main')).toBeFocused();
  const heights=await page.locator('.brief-demo button, .brief-demo select, .brief-demo summary').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
  expect(heights.every(height=>height>=44)).toBe(true);
});

test("development preview: grounded briefing, evidence and supply review", async ({page}) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  await page.goto('/?demo=briefing');
  await expect(page).toHaveTitle(/GENERAL SCREENER/i);
  await expect(page.getByRole('heading',{level:1})).toContainText('시장과 후보를');
  await expect(page.getByText('DEMO · 모의 데이터',{exact:true})).toBeVisible();
  await expect(page.locator('.brief-card')).toHaveCount(2);
  await page.getByText('반대 근거와 다음 확인할 것',{exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'지금 확인 · 기다릴 조건'}).first()).toBeVisible();
  await page.getByText('근거와 비교 기준 보기',{exact:true}).first().click();
  await expect(page.getByText('demo:Radar:current',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'공급망 역할 검토',exact:true}).click();
  await expect(page.locator('.brief-role')).toHaveCount(5);
  await page.getByRole('button',{name:'기존 분류와 다른 기업',exact:true}).click();
  await expect(page.locator('.brief-role')).toHaveCount(1);
  await expect(page.locator('.brief-role')).toContainText('DEMO-B');
  await page.getByText('원문 근거와 한계 보기',{exact:true}).click();
  await expect(page.getByText('AI-related revenue is not disclosed separately.',{exact:true})).toBeVisible();
  await expect(page.getByText('AI 관련 매출 비중과 실적 기여는 확인하지 않았습니다.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("stale, held, missing and failed inputs cannot invent today's market",async({page})=>{
  await page.goto('/?demo=briefing');
  const control=page.getByLabel('상황별 미리보기');
  for(const state of ['stale','quarantined','missing']) {
    await control.selectOption(state);
    await expect(page.getByText('시장 판단은 잠시 보류합니다',{exact:true})).toBeVisible();
    await expect(page.locator('.brief-card')).toHaveCount(1);
    await expect(page.locator('.brief-card')).not.toContainText('Radar는 경계 상태');
  }
  await control.selectOption('no_change');
  await expect(page.getByRole('heading',{name:'추가로 짚을 주요 변화가 없습니다'})).toBeVisible();
  await expect(page.locator('.brief-card')).toHaveCount(0);
  await control.selectOption('failure');
  await expect(page.getByRole('heading',{name:'브리핑을 준비하지 못했습니다'})).toBeVisible();
  await expect(page.getByText('스크리너 결과는 그대로 유지됩니다.',{exact:false})).toBeVisible();
  await expect(page.getByLabel('자료 기준일')).toContainText('생성되지 않음');
  await expect(page.getByLabel('자료 기준일')).not.toContainText('2026-11-02');
  await expect(page.getByLabel('자료 기준일')).not.toContainText('2026-10-30');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
