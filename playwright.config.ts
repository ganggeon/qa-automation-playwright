import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 설정
 *
 * `defineConfig` 로 감싸 설정 필드명의 오타를 타입 검사 단계에서 잡는다.
 */

const SUT_PORT = 4010;
const SUT_URL = `http://localhost:${SUT_PORT}`;

export default defineConfig({
  testDir: './tests',

  // 테스트 실행 시간 상한 (단일 테스트 30초)
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // 병렬 실행. 파일 단위로 동시에 돌린다.
  fullyParallel: true,

  // CI에서는 test.only가 남아 있으면 실패시킨다. (실수로 일부만 돌리는 사고 방지)
  forbidOnly: !!process.env.CI,

  // 재시도: 로컬 0회, CI 1회.
  //   재시도를 많이 주면 불안정한 테스트(Flaky)가 숨겨진다. 일부러 낮게 잡음.
  retries: process.env.CI ? 1 : 0,

  // 워커 수 상한을 명시한다.
  //
  // [실제로 겪은 문제]
  //   기본값(코어수/2 = 9)으로 전체 프로젝트를 한 번에 돌렸더니 Firefox 테스트
  //   6건이 40~60초 타임아웃으로 실패했다. 코드 문제가 아니라 자원 경합이었다.
  //   브라우저 9개 × 3종류가 동시에 뜨고, 단일 스레드인 SUT까지 같은 PC에서
  //   돌기 때문이다. 워커를 2개로 줄여 같은 테스트를 돌리니 19건 전부 통과했다.
  //
  //   "가끔 실패하는 테스트"의 원인이 항상 테스트 코드인 것은 아니다.
  //   실행 환경도 함께 의심해야 한다.
  workers: process.env.CI ? 2 : 4,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],

  use: {
    actionTimeout: 10_000,
    // 실패한 테스트만 추적 파일(trace)을 남긴다. 결함 리포트에 첨부할 핵심 증거.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // 테스트 시작 전 SUT를 자동으로 띄운다. 이미 떠 있으면 재사용.
  webServer: {
    command: 'node sut/server.js',
    url: `${SUT_URL}/api/products`,
    // 로컬에서는 이미 띄워둔 SUT를 재사용해 실행이 빠르다.
    // CI에서는 절대 재사용하지 않는다 — 같은 포트에 다른 버전의 서버가 떠 있으면
    // "엉뚱한 대상"을 테스트하고도 초록불이 나온다.
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },

  projects: [
    // SUT 상태 초기화. 아래 프로젝트들이 dependencies로 이걸 먼저 실행시킨다.
    { name: 'setup', testMatch: /global\.setup\.ts/, use: { baseURL: SUT_URL } },
    {
      name: 'api',
      testDir: './tests/api',
      dependencies: ['setup'],
      use: { baseURL: SUT_URL },
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], baseURL: SUT_URL },
    },
    {
      name: 'ui-firefox',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'], baseURL: SUT_URL },
    },
    {
      name: 'ui-webkit',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], baseURL: SUT_URL },
    },

    // ---- 외부 공개 데모 사이트 대상 ----------------------------------------
    // 남의 서비스라 언제든 바뀌거나 죽을 수 있다. 그래서 프로젝트를 분리해서
    // 메인 스위트(api/ui)의 신뢰도를 오염시키지 않는다. CI에서도 별도 Job으로 돌린다.
    {
      name: 'external-api',
      testDir: './tests/external/api',
      use: { baseURL: 'https://restful-booker.herokuapp.com' },
      retries: 2, // 외부 서비스는 일시적 장애가 잦아 재시도를 허용한다
    },
    {
      name: 'external-ui',
      testDir: './tests/external/ui',
      use: { ...devices['Desktop Chrome'], baseURL: 'https://www.saucedemo.com' },
      retries: 2,
    },
  ],
});
