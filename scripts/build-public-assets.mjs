import { cp, lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
export const PRIVATE_WEB_SUBTREES = ['data/radar-journal', 'data/briefing-probe'];
export const isPrivateWebPath = path => {
  const normalized=path.replaceAll('\\','/').toLowerCase();
  return PRIVATE_WEB_SUBTREES.some(root=>normalized===root||normalized.startsWith(`${root}/`))
    || ['probe-preview-manifest.json','product-probe-results.json','product-probe-report.json'].includes(normalized.split('/').at(-1));
};
export const isPrivateWebMetadata = value => value?.execution_mode==='provider_test'
  ||String(value?.schema||value?.report?.schema||'').startsWith('product_probe_');

// Recovery journals and synthetic provider test material never enter website output.
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
  await cp(publicDirectory, outputDirectory, {
    recursive: true,
    filter: async (source) => {
      const relative=resolve(source).slice(resolve(publicDirectory).length+1).replaceAll('\\','/');
      if (isPrivateWebPath(relative)) return false;
      const stat=await lstat(source);
      if (stat.isSymbolicLink()) {
        throw new Error("Public asset symlinks are not allowed in the web build.");
      }
      if(stat.isFile()&&source.toLowerCase().endsWith('.json')) {
        let value;try{value=JSON.parse(await readFile(source,'utf8'));}catch{/* Non-JSON public bytes keep their existing contract. */}
        if(isPrivateWebMetadata(value))throw Error('Private test metadata outside excluded directory');
      }
      return true;
    },
  });
}
