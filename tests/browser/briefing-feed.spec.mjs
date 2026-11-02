import { test, expect } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipelineFixture } from '../fixtures/briefing-pipeline.mjs';
import { fixturePassword, cutoff } from '../fixtures/briefing-native.mjs';
import { sealBriefingArtifact, writeBriefingDeliveryStatus } from '../../scripts/seal-briefing-artifact.mjs';
test('actual adapter/transport/artifact reader supplies the shared UI', async ({
  page
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'briefing-feed-browser-'));
  const {
    artifact
  } = await pipelineFixture(directory);
  const file = join(directory, 'briefing.enc.json');
  await sealBriefingArtifact(artifact, fixturePassword, file);
  const encrypted = await readFile(file, 'utf8');
  const status = await writeBriefingDeliveryStatus(artifact, Buffer.from(encrypted), join(directory, 'briefing-status.json'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({
    time: new Date(cutoff)
  });
  await page.route('**/data/briefing.enc.json', route => route.fulfill({
    body: encrypted,
    contentType: 'application/json'
  }));
  await page.route('**/data/briefing-status.json', route => route.fulfill({
    json: status
  }));
  await page.goto('/?demo=briefing#/briefing');
  await page.getByLabel('확인할 자료 기준 거래일').fill('2026-10-30');
  await page.getByLabel('결과 암호').fill(fixturePassword);
  await page.getByRole('button', {
    name: '브리핑 열기',
    exact: true
  }).click();
  await expect(page.locator('.brief-card')).toHaveCount(2);
  const originalUrl=page.url();
  await page.getByRole('link',{name:'본문으로 이동'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#brief-main')).toBeFocused();
  expect(page.url()).toBe(originalUrl);
  await expect(page.getByLabel('자료 기준일')).toContainText('2026-11-02 12:00 UTC');
  await page.getByRole('button', {
    name: '공급망 역할 검토',
    exact: true
  }).click();
  await expect(page.locator('.brief-role')).toHaveCount(5);
  await page.getByRole('button', {
    name: '결과 닫기',
    exact: true
  }).click();
  await expect(page.getByLabel('결과 암호')).toHaveValue('');
  await page.getByLabel('확인할 자료 기준 거래일').fill('2026-11-02');
  await page.getByLabel('결과 암호').fill(fixturePassword);
  await page.getByRole('button', {
    name: '브리핑 열기',
    exact: true
  }).click();
  await expect(page.getByLabel('자료 기준일')).toContainText('이전 결과');
  await expect(page.getByLabel('자료 기준일')).toContainText('새 브리핑');
  await expect(page.getByLabel('자료 기준일')).toContainText('생성되지 않음');
  await expect(page.getByLabel('자료 기준일')).toContainText('이전 브리핑 생성 2026-11-02 12:00 UTC');
  await expect(page.locator('.brief-card')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('missing optional artifact keeps existing dashboard route independent', async ({
  page
}) => {
  await page.route('**/data/briefing.enc.json', route => route.fulfill({
    status: 404
  }));
  await page.goto('/?demo=briefing#/briefing');
  await page.getByLabel('확인할 자료 기준 거래일').fill('2026-10-30');
  await page.getByLabel('결과 암호').fill(fixturePassword);
  await page.getByRole('button', {
    name: '브리핑 열기',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '브리핑을 준비하지 못했습니다'
  })).toBeVisible();
  await expect(page.getByLabel('자료 기준일')).not.toContainText('2026-10-30');
  await page.goto('/');
  await expect(page.locator('input[type=password]')).toBeVisible();
  await expect(page.locator('.brief-card')).toHaveCount(0);
});
