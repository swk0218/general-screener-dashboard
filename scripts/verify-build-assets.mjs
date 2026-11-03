import assert from "node:assert/strict";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { PRIVATE_WEB_SUBTREES, isPrivateWebPath, isPrivateWebMetadata } from './build-public-assets.mjs';

const publicDirectory = resolve("public");
const outputDirectory = resolve("dist/client");
for (const directory of [publicDirectory, outputDirectory]) {
  assert.ok(!(await lstat(directory)).isSymbolicLink(), "Public asset roots must not be symlinks.");
}
await assert.rejects(lstat(resolve(outputDirectory, "data/radar-journal")), { code: "ENOENT" },
  "Recovery journals must not be included in the web build.");
for(const path of PRIVATE_WEB_SUBTREES) await assert.rejects(lstat(resolve(outputDirectory,path)),{code:'ENOENT'},'Private test artifacts must not be included in the web build.');
async function scanOutput(directory='') {
  for(const entry of await readdir(resolve(outputDirectory,directory),{withFileTypes:true})) {
    const path=directory?`${directory}/${entry.name}`:entry.name;
    assert.ok(!isPrivateWebPath(path),`Private test artifact in web build: ${path}`);
    assert.ok(!entry.isSymbolicLink(),`Built asset symlink: ${path}`);
    if(entry.isDirectory()) await scanOutput(path);
    else if(path.endsWith('.json')) {
      const text=await readFile(resolve(outputDirectory,path),'utf8');
      let value;try{value=JSON.parse(text);}catch{continue;}
      assert.ok(!isPrivateWebMetadata(value),`Private test metadata in web build: ${path}`);
    }
  }
}
await scanOutput();

// Verify every other public asset, including all encrypted feeds and status.
async function verifyPublicAssets(directory = "") {
  for (const entry of await readdir(resolve(publicDirectory, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (isPrivateWebPath(path)) continue;
    assert.ok(!entry.isSymbolicLink(), `Public asset symlink: ${path}`);
    assert.ok(!(await lstat(resolve(outputDirectory, path))).isSymbolicLink(),
      `Built public asset symlink: ${path}`);
    if (entry.isDirectory()) {
      await verifyPublicAssets(path);
    } else {
      assert.deepEqual(await readFile(resolve(outputDirectory, path)),
        await readFile(resolve(publicDirectory, path)), `Public asset changed or missing: ${path}`);
    }
  }
}
await verifyPublicAssets();

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
