import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:4178' },
  projects: [320,390,1440].map(width=>({ name:`chromium-${width}`, use:{browserName:'chromium', viewport:{width,height:900}} })),
  webServer: { command:'npm run dev -- --host 127.0.0.1 --port 4178', url:'http://127.0.0.1:4178', reuseExistingServer:!process.env.CI },
});
