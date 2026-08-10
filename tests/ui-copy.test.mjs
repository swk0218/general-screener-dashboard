import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles/terminal-v2.css", import.meta.url), "utf8");

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
  assert.match(stylesSource, /@media \(min-width: 1181px\)/);
});

test("colors only actual mobile overview entries and removals", () => {
  assert.match(appSource, /className=\{`is-added\$\{item\.added\.length \? " has-change" : ""\}`\}/);
  assert.match(appSource, /className=\{`is-removed\$\{item\.removed\.length \? " has-change" : ""\}`\}/);
  assert.match(stylesSource, /\.visit-changes dd\.is-added\.has-change/);
  assert.match(stylesSource, /\.visit-changes dd\.is-removed\.has-change/);
});

test("uses Korean candidate labels and long-horizon performance tabs", () => {
  assert.match(appSource, /return "핵심 후보"/);
  assert.match(appSource, /return "관찰 후보"/);
  assert.match(appSource, /return "예비 후보"/);
  assert.match(appSource, /\["20D", "60D", "120D"\]/);
});

test("keeps reconstructed entry timing and removes noisy overview annotations", () => {
  assert.match(appSource, /저장소 확정 이후 첫 정규장부터/);
  assert.match(appSource, /formatPercentPoints\(item\.excess_return\)/);
  assert.match(appSource, /스크리너 성과/);
  assert.match(appSource, /formatMonthDay\(item\.run\.report_date \|\| item\.run\.report_created_at\)/);
  assert.match(appSource, /Updated<\/small>/);
  assert.doesNotMatch(appSource, /우측은 점수/);
});

test("uses concise Korean history, transition, and TENX method copy", () => {
  assert.match(appSource, /<h1>실행 기록<\/h1>/);
  assert.match(appSource, /return "신규 진입"/);
  assert.match(appSource, /return "재진입"/);
  assert.match(appSource, /고성장 기대 섹터/);
  assert.match(appSource, /성장성과 지속성 검증/);
  assert.match(appSource, /종합 점수 상위 5종목/);
  assert.doesNotMatch(appSource, /Focused growth universe/);
  assert.doesNotMatch(appSource, /tenx_final_score/);
});
