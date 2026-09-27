import { defineConfig, devices } from '@playwright/test';

/**
 * 로그인 재구현판 전용 설정
 *
 * 기본 설정(playwright.config.ts)과의 차이
 *   - 서버 초기화 API(/api/_reset)를 부르지 않는다. setup 프로젝트가 없다.
 *     각 테스트가 자기 계정을 새로 만들어 쓰므로 서버 상태를 되돌릴 필요가 없다.
 *   - 서버를 4011 포트로 따로 띄운다. 4010에 떠 있는 기본 스위트용 서버를
 *     재사용하면 다른 테스트가 바꿔 놓은 상태나 다른 버전의 서버를 검사하게 된다.
 *   - tests/rebuilt/ 의 두 파일만 실행한다.
 *
 * 실행: npx playwright test -c playwright.rebuilt.config.ts
 */

const SUT_PORT = 4011;
const SUT_URL = `http://localhost:${SUT_PORT}`;

export default defineConfig({
  testDir: './tests/rebuilt',

  timeout: 30_000,
  expect: { timeout: 5_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,

  // 결과 파일을 기본 스위트와 따로 둔다. 같은 경로를 쓰면 서로의 결과를 덮어쓴다.
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-rebuilt', open: 'never' }],
    ['json', { outputFile: 'reports/rebuilt-results.json' }],
  ],
  outputDir: 'test-results-rebuilt',

  use: {
    baseURL: SUT_URL,
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    command: 'node sut/server.js',
    // server.js는 PORT 환경변수를 읽어 그 포트로 뜬다.
    env: { PORT: String(SUT_PORT) },
    url: `${SUT_URL}/api/products`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },

  projects: [
    {
      name: 'rebuilt-api',
      testMatch: /login\.api\.spec\.ts/,
    },
    {
      name: 'rebuilt-ui',
      testMatch: /login\.ui\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
