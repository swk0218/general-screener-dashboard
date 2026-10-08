import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { copyWebPublicAssets, webPublicAssets } from "../scripts/build-public-assets.mjs";

test("web copy excludes only the journal subtree and leaves all source bytes intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-public-assets-"));
  try {
    const source = join(root, "public");
    const output = join(root, "dist/client");
    const fixtures = {
      "data/radar-journal/index.json": "TEST_ONLY index",
      "data/radar-journal/nested/failure.enc.json": "TEST_ONLY ciphertext",
      "data/radar-observation.json": "TEST_ONLY status",
      "data/market-radar.enc.json": "TEST_ONLY feed",
      "data/radar-seasonality.enc.json": "TEST_ONLY seasonality",
      "data/payload.enc.json": "TEST_ONLY screener",
      "data/radar-journal-other.json": "TEST_ONLY neighbor",
      "icons/radar-journal/keep.svg": "TEST_ONLY unrelated directory",
      "favicon.svg": "TEST_ONLY icon",
    };
    for (const [path, bytes] of Object.entries(fixtures)) {
      const target = join(source, path);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, bytes);
    }
    await copyWebPublicAssets(source, output);
    await assert.rejects(readdir(join(output, "data/radar-journal")), { code: "ENOENT" });
    for (const [path, bytes] of Object.entries(fixtures)) {
      assert.equal(await readFile(join(source, path), "utf8"), bytes);
      if (!path.startsWith("data/radar-journal/")) {
        assert.equal(await readFile(join(output, path), "utf8"), bytes);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filtered public copy applies only to production builds", () => {
  assert.equal(webPublicAssets().apply, "build");
});


test("artifact guard rejects journal inclusion and damaged or missing browser assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-artifact-guard-"));
  const run = promisify(execFile);
  const verifyScript = fileURLToPath(new URL("../scripts/verify-build-assets.mjs", import.meta.url));
  const verify = () => run(process.execPath, [verifyScript], { cwd: root });
  try {
    const source = join(root, "public");
    const output = join(root, "dist/client");
    await mkdir(join(source, "data"), { recursive: true });
    await writeFile(join(source, "data/radar-observation.json"), "TEST_ONLY status");
    await copyWebPublicAssets(source, output);
    await mkdir(join(output, "assets"));
    await writeFile(join(output, "assets/app.js"), "// TEST_ONLY");
    await verify();
    const journal = join(output, "data/radar-journal");
    await mkdir(journal);
    await assert.rejects(verify(), error => error.stderr.includes("Recovery journals must not"));
    await rm(journal, { recursive: true });
    const status = join(output, "data/radar-observation.json");
    await writeFile(status, "TEST_ONLY changed status");
    await assert.rejects(verify(), error => error.stderr.includes("Public asset changed or missing"));
    await rm(status);
    await assert.rejects(verify(), error => error.stderr.includes("ENOENT"));
    await symlink(join(source, "data/radar-observation.json"), status);
    await assert.rejects(verify(), error => error.stderr.includes("Built public asset symlink"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("web copy rejects symlink aliases to journal files, directories, and the public root", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-public-symlink-"));
  try {
    const source = join(root, "public");
    const journal = join(source, "data/radar-journal");
    await mkdir(journal, { recursive: true });
    await writeFile(join(journal, "index.json"), "TEST_ONLY journal");
    const alias = join(source, "alias");
    for (const target of [join(journal, "index.json"), journal]) {
      await symlink(target, alias);
      await assert.rejects(copyWebPublicAssets(source, join(root, "out")), /symlinks are not allowed/);
      await rm(alias);
    }
    await symlink(source, join(root, "public-alias"));
    await assert.rejects(copyWebPublicAssets(join(root, "public-alias"), join(root, "out")), /symlinks are not allowed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
