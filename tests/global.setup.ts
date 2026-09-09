import { test as setup, expect } from '@playwright/test';

/**
 * 전체 실행 전에 SUT 상태를 초기화한다.
 *
 * webServer가 뜬 뒤에 확실히 실행되도록 '별도 프로젝트 + dependencies' 방식을 썼다.
 * (globalSetup 옵션은 webServer 기동 순서와 얽혀 실패할 수 있다)
 */
setup('SUT 초기화', async ({ request }) => {
  // URL을 하드코딩하지 않는다. 프로젝트의 baseURL을 그대로 따라가야
  // 대상 환경이 바뀌어도 초기화 대상이 어긋나지 않는다.
  const res = await request.post('/api/_reset');
  expect(res.status(), 'SUT 초기화 실패 — 서버가 떠 있는지 확인').toBe(200);
});
