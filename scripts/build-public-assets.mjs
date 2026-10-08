import { cp, lstat } from "node:fs/promises";
import { resolve } from "node:path";

// The canonical recovery journal is read from Git, not from the website.
// Keep Vite's development public directory; filter only the production copy.
export function webPublicAssets() {
  let publicDirectory;
  let outputDirectory;
  return {
    name: "web-public-assets",
    apply: "build",
    configResolved(config) {
      publicDirectory = config.publicDir;
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    async writeBundle() {
      await copyWebPublicAssets(publicDirectory, outputDirectory);
    },
  };
}

export async function copyWebPublicAssets(publicDirectory, outputDirectory) {
  const journalDirectory = resolve(publicDirectory, "data/radar-journal");
  await cp(publicDirectory, outputDirectory, {
    recursive: true,
    filter: async (source) => {
      if (resolve(source) === journalDirectory) return false;
      if ((await lstat(source)).isSymbolicLink()) {
        throw new Error("Public asset symlinks are not allowed in the web build.");
      }
      return true;
    },
  });
}
