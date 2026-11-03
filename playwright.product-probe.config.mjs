import {defineConfig} from '@playwright/test';
if(!process.env.GPT_PROBE_DIR)throw Error('GPT_PROBE_DIR must name the private sealed output');
export default defineConfig({
  testDir:'./tests/product-probe-browser',
  use:{baseURL:'http://127.0.0.1:4183'},
  projects:[320,390,1440].map(width=>({name:`probe-${width}`,use:{browserName:'chromium',viewport:{width,height:900}}})),
  webServer:{command:'node node_modules/vite/bin/vite.js --mode briefing-probe --host 127.0.0.1 --port 4183',
    url:'http://127.0.0.1:4183',reuseExistingServer:false,env:{GPT_PROBE_DIR:process.env.GPT_PROBE_DIR}},
});
