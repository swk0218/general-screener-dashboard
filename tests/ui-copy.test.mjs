import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("keeps the development password label and positive benchmark celebration copy", () => {
  assert.match(appSource, /label="PASSWORD"/);
  assert.match(appSource, /대비 \$\{formatPercentPoints\(value\)\} 앞섰습니다/);
});

test("uses Korean candidate labels and long-horizon performance tabs", () => {
  assert.match(appSource, /return "핵심 후보"/);
  assert.match(appSource, /return "관찰 후보"/);
  assert.match(appSource, /return "예비 후보"/);
  assert.match(appSource, /\["20D", "60D", "120D"\]/);
});

test("keeps reconstructed entry timing and excess return units explicit", () => {
  assert.match(appSource, /저장소 확정 이후 첫 정규장부터/);
  assert.match(appSource, /formatPercentPoints\(item\.excess_return\)/);
  assert.match(appSource, /우측은 점수/);
});
