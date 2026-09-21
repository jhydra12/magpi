import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['graph-colors.spec.ts', 'graph-renderer.spec.ts', 'graph-rotation.spec.ts'],
  reporter: 'list',
  use: { browserName: 'chromium' },
});
