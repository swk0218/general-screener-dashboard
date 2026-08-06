import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const assetsDirectory = resolve("dist/client/assets");
const files = await readdir(assetsDirectory);
const woff2Files = files.filter((file) => file.endsWith(".woff2"));
const legacyWoffFiles = files.filter((file) => file.endsWith(".woff"));
const javascriptFiles = files.filter((file) => file.endsWith(".js"));
const javascriptSizes = await Promise.all(
  javascriptFiles.map(async (file) => ({ file, bytes: (await stat(resolve(assetsDirectory, file))).size })),
);

assert.ok(woff2Files.length <= 7, `Font budget exceeded: ${woff2Files.length} WOFF2 files.`);
assert.equal(legacyWoffFiles.length, 0, "Legacy WOFF files must not be emitted.");
assert.ok(javascriptSizes.length > 0, "No JavaScript build assets were emitted.");
for (const asset of javascriptSizes) {
  assert.ok(asset.bytes <= 550 * 1024, `${asset.file} exceeds the 550 KiB chunk budget.`);
}

process.stdout.write(
  `Build assets verified: ${woff2Files.length} WOFF2 fonts, ${javascriptSizes.length} JS chunks.\n`,
);
