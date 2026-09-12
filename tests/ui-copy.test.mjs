import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles/terminal-v2.css", import.meta.url), "utf8");
const errorBoundarySource = await readFile(new URL("../src/components/AppErrorBoundary.jsx", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const faviconSource = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");

test("ships a local favicon without a static-host root request", () => {
  assert.match(indexSource, /rel="icon" href="\.\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(faviconSource, /<svg[^>]+viewBox="0 0 64 64"/);
  assert.match(faviconSource, /#45ff8a/);
});

test("keeps the development password treatment and restrained benchmark celebration copy", () => {
  assert.match(appSource, /label="PASSWORD"/);
  assert.match(appSource, /placeholder="\*\*\*\*\*\*\*\*"/);
  assert.doesNotMatch(appSource, /ENCRYPTED STATIC VAULT/);
  assert.match(appSource, /className="benchmark-copy-value"/);
  assert.match(appSource, /"앞섰습니다" : "뒤쳐졌습니다"/);
  assert.doesNotMatch(appSource, /className="benchmark-copy-desktop"/);
  assert.doesNotMatch(appSource, /`\+\$\{\(value \* 100\)\.toFixed\(2\)\}%`/);
  assert.match(stylesSource, /\.benchmark-copy-value \{\s*font-weight: 700;/);
  assert.match(stylesSource, /\.benchmark-copy-prefix,\s*\.benchmark-copy-status \{\s*font-weight: 400;/);
  assert.match(stylesSource, /\.benchmark-copy-result \{\s*white-space: nowrap;/);
  assert.match(stylesSource, /@media \(min-width: 1181px\)/);
});

test("colors only actual mobile overview entries and removals", () => {
  assert.match(appSource, /className=\{`is-added\$\{item\.added\.length \? " has-change" : ""\}`\}/);
  assert.match(appSource, /className=\{`is-removed\$\{item\.removed\.length \? " has-change" : ""\}`\}/);
  assert.match(stylesSource, /\.visit-changes dd\.is-added\.has-change/);
  assert.match(stylesSource, /\.visit-changes dd\.is-removed\.has-change/);
});

test("overview uses official run transitions, never browser visit state", () => {
  const overview = appSource.slice(appSource.indexOf("function OverviewView("), appSource.indexOf("function HistoryView("));
  assert.match(overview, /getIndexedRunChanges\(index, strategy, run\?\.run_id\)/);
  assert.match(overview, /item\.status === "RETAINED"/);
  assert.match(overview, /item\.rankDelta > 0/);
  assert.match(overview, /item\.rankDelta < 0/);
  assert.match(overview, /직전 보고 대비/);
  assert.doesNotMatch(appSource, /LAST_SEEN_STORAGE_KEY|markStrategyRead|loadLastSeenRuns|seenIndex/);
});

test("uses Korean candidate labels and long-horizon performance tabs", () => {
  assert.match(appSource, /return "핵심 후보"/);
  assert.match(appSource, /return "관찰 후보"/);
  assert.match(appSource, /return "예비 후보"/);
  assert.match(appSource, /\["20D", "60D", "120D"\]/);
  assert.match(appSource, /<dt>전략 점수<\/dt>/);
  assert.match(appSource, /<dt>후보 상태<\/dt>/);
});

test("offers a recoverable render-error state without exposing internals", () => {
  assert.match(appSource, /<AppErrorBoundary/);
  assert.match(errorBoundarySource, /다시 시도/);
  assert.match(errorBoundarySource, /잠금 화면으로/);
  assert.doesNotMatch(errorBoundarySource, /error\.message/);
});

test("keeps reconstructed entry timing and removes noisy overview annotations", () => {
  assert.match(appSource, /저장소 확정 이후 첫 정규장부터/);
  assert.match(appSource, /formatPercentPoints\(item\.excess_return\)/);
  assert.match(appSource, /스크리너 성과/);
  assert.match(appSource, /formatMonthDay\(item\.run\.report_date \|\| item\.run\.report_created_at\)/);
  assert.match(appSource, /Updated<\/small>/);
  assert.doesNotMatch(appSource, /우측은 점수/);
});

test("shows matching unified MLG and TENX 20-day performance summaries on overview", () => {
  assert.match(appSource, /const performancePreviews = Object\.keys\(STRATEGIES\)\.map/);
  assert.match(appSource, /getUnifiedPerformanceCell\(/);
  assert.match(appSource, /payload\.performance_backcast/);
  assert.match(appSource, /"20D"/);
  assert.match(appSource, /className="backcast-performance-list"/);
  assert.match(appSource, /key=\{strategy\}/);
  assert.match(stylesSource, /\.backcast-performance-item \+ \.backcast-performance-item/);
});

test("uses concise Korean history, transition, and TENX method copy", () => {
  assert.match(appSource, /<h1>실행 기록<\/h1>/);
  assert.match(appSource, /return "신규 진입"/);
  assert.match(appSource, /return "재진입"/);
  assert.match(appSource, /투자대상 확인/);
  assert.match(appSource, /동반 성장 확인/);
  assert.match(appSource, /상위 5종목 선정/);
  assert.match(appSource, /\$2B–50B/);
  assert.match(appSource, /42GV \+ 33GY \+ 25GCV/);
  assert.match(appSource, /배점 산정/);
  assert.match(appSource, /중소형 초고속 성장주 Top5/);
  assert.match(appSource, /if \(normalized === "RELATIVE_TOP5"\) return "is-investable"/);
  assert.doesNotMatch(appSource, /상위 관찰 후보|점수를 읽는 법|이 순위가 말하지 않는 것|서로 독립된 배점이 아닙니다/);
  assert.match(appSource, /산식 변경/);
  assert.doesNotMatch(appSource, /Core v3\.1|path gap|약 45개|\$0\.25B–40B/);
  assert.match(appSource, /각 엔진의 검증을 통과한 결과만 발송/);
  assert.match(appSource, /화면에서 점수를 다시 계산하거나 순위를 바꾸지 않습니다/);
  assert.match(appSource, /과거 전체 성과를 현재 V3.8의 실적으로 해석하지 않습니다/);
  assert.doesNotMatch(
    appSource,
    /데이터·신호·보고서 품질 검증을 통과한 공식 실행만 Telegram/,
  );
  assert.doesNotMatch(appSource, /SEC가 없거나 직접 비교할 수 없고 유효한 연간 대체값/);
  assert.doesNotMatch(appSource, /Focused growth universe/);
  assert.doesNotMatch(appSource, /tenx_final_score/);
});

test("isolates the desktop workstation layout from the reviewed mobile views", () => {
  assert.match(appSource, /className=\{`app-shell view-\$\{route\.view\}`\}/);
  assert.match(appSource, /className="overview-history-link"/);
  assert.match(appSource, /className="history-column-head"/);
  assert.match(stylesSource, /Desktop workstation recomposition/);
  assert.match(stylesSource, /\.overview-history-link,\s*\.history-column-head \{\s*display: none;/);
  assert.match(stylesSource, /grid-template-columns: minmax\(0, 1fr\) clamp\(320px, 26vw, 360px\);/);
  assert.match(stylesSource, /@media \(min-width: 1181px\) and \(max-width: 1399px\)/);
});

test("keeps desktop chrome compact and aligns the screener inspector grid", () => {
  assert.match(appSource, /<span className="sync-label">Last Update<\/span>/);
  assert.match(appSource, /formatKstDate\(generatedAt\)/);
  assert.doesNotMatch(appSource, /LAST SYNC/);
  assert.match(stylesSource, /--sidebar-width: 208px;/);
  assert.match(stylesSource, /\.top-search input \{\s*font-size: 13px !important;/);
  assert.match(stylesSource, /--selection-heading-rail: 38px;/);
  assert.match(stylesSource, /--selection-filter-rail: 40px;/);
  assert.match(stylesSource, /height: calc\(var\(--selection-heading-rail\) \+ var\(--selection-filter-rail\) \+ var\(--selection-column-rail\)\);/);
  assert.match(stylesSource, /grid-auto-rows: var\(--selection-row-rail\);/);
});
