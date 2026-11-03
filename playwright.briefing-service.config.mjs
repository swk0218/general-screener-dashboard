import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/briefing-service-browser',
  use:{baseURL:'http://127.0.0.1:4190'},
  projects:[320,390,1440].map(width=>({name:`service-${width}`,use:{browserName:'chromium',viewport:{width,height:900}}})),
  webServer:{command:'node node_modules/vite/bin/vite.js --mode briefing --host 127.0.0.1 --port 4190',
    url:'http://127.0.0.1:4190',reuseExistingServer:false,env:{VITE_GPT_BRIEFING_ENABLED:'true'}},
});
