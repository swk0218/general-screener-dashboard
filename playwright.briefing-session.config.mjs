import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/session-browser',use:{baseURL:'http://127.0.0.1:4182'},
  projects:[320,390,1440].map(width=>({name:`session-${width}`,use:{browserName:'chromium',viewport:{width,height:900}}})),
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4182',url:'http://127.0.0.1:4182',env:{VITE_GPT_BRIEFING_ENABLED:'true'},reuseExistingServer:false}
});
