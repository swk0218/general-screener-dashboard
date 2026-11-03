import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

export function validateProbeDirectory(directory) {
  const root=resolve(directory);
  if(root.split(/[\\/]/).some(part=>['public','dist'].includes(part.toLowerCase()))||lstatSync(root).isSymbolicLink()) throw Error('Private probe directory required');
  const manifest=JSON.parse(readFileSync(join(root,'probe-preview-manifest.json'),'utf8'));
  if(manifest.schema!=='product_probe_preview_v1'||manifest.execution_mode!=='provider_test'
    ||!['openai_network','offline_contract_fixture'].includes(manifest.response_origin)) throw Error('Invalid probe manifest');
  const expected=new Set([...Object.keys(manifest.files),'probe-preview-manifest.json']);
  const found=new Set();
  function scan(relative='') {
    for(const entry of readdirSync(join(root,relative),{withFileTypes:true})) {
      const name=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isSymbolicLink()) throw Error('Probe symlinks forbidden');
      if(entry.isDirectory()) scan(name);
      else {
        if(!expected.has(name)) throw Error('Unexpected private probe file');
        found.add(name);
        if(name==='probe-preview-manifest.json') continue;
        if(!/^data\/briefing-probe\/product-v1-(normal|date_mismatch|quarantined|insufficient|conflict)\/(payload\.enc|briefing\.enc|briefing-status)\.json$/.test(name)) throw Error('Invalid probe path');
        const bytes=readFileSync(join(root,name));
        if(bytes.length>256000||createHash('sha256').update(bytes).digest('hex')!==manifest.files[name]) throw Error('Probe file hash mismatch');
      }
    }
  }
  scan();
  if(found.size!==expected.size) throw Error('Missing private probe file');
  return {root,manifest};
}

export function probePreviewConfig() {
  return {name:'private-product-probe',config(_,{command,mode}) {
    if(mode!=='briefing-probe') return;
    if(command!=='serve'||!process.env.GPT_PROBE_DIR) throw Error('Use GPT_PROBE_DIR=<private sealed directory> npm run dev:probe; production build forbidden');
    return {publicDir:validateProbeDirectory(process.env.GPT_PROBE_DIR).root,server:{host:'127.0.0.1'}};
  }};
}
