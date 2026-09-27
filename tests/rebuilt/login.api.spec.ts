import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from '../../utils/schema';
import { loginSchema, errorSchema } from '../../test-data/schemas';
import { CREDENTIALS, uniqueEmail } from '../../test-data/minishop';

/**
 * FR-02 로그인 — 재구현판 (docs/test-strategy.md 5절 추적표의 API 7행)
 *
 * 실패 원인 구분
 *   준비(계정 생성, 틀린 비밀번호 n회)는 test.fail() 선언 전에 응답까지 확인한다.
 *   잠금 판정(expectLocked)은 마지막 응답을 먼저 분류한 뒤에만 실패 예상을 선언한다.
 *
 *   준비 실패 / 예상 밖 응답   → 선언 전에 실패 → 새 문제
 *   200 + 토큰 (알려진 증상)   → 선언 후 실패   → 결함 재현 확인 (symptom-confirmed)
 *   423 ACCOUNT_LOCKED        → 선언 후 통과   → 결함 수정 여부 재확인
 *
 * 데이터 격리: 테스트마다 계정을 새로 만든다. 서버 초기화 API는 쓰지 않는다.
 */

const WRONG_PASSWORD = 'WrongPw123';

async function createUser(request: APIRequestContext): Promise<{ email: string; password: string }> {
  const email = uniqueEmail('rebuilt');
  const password = 'Qa123456';
  const res = await request.post('/api/users', {
    data: { email, password, age: 30 },
    failOnStatusCode: false,
  });

  expect(res.status(), '준비 실패: 계정 생성').toBe(201);

  return { email, password };
}

async function failLogin(request: APIRequestContext, email: string, times: number): Promise<void> {
  for (let i = 1; i <= times; i++) {
    const res = await request.post('/api/auth/login', {
      data: { email, password: WRONG_PASSWORD },
      failOnStatusCode: false,
    });
    expect(res.status(), `준비 실패: 틀린 비밀번호 ${i}회차 응답`).toBe(401);
  }
}

async function expectLocked(res: APIResponse, bugId: string): Promise<void> {
  const status = res.status();

  const body = await res.json().catch(() => null);
  const locked = status === 423 && body?.error?.code === 'ACCOUNT_LOCKED';
  const knownSymptom = status === 200 && typeof body?.token === 'string';

  expect(locked || knownSymptom, `예상 밖 응답 ${status}: 명세(423)도 알려진 증상(200+토큰)도 아님`).toBe(true);

  if (knownSymptom) {
    test.info().annotations.push({ type: 'symptom-confirmed', description: bugId });
  }
  test.fail(true, `${bugId}: 잠긴 계정에 토큰이 발급된다`);

  expect(status, '잠긴 계정은 올바른 비밀번호로도 거부돼야 한다').toBe(423);
  expect(body?.error?.code).toBe('ACCOUNT_LOCKED');
}

async function login(request: APIRequestContext, email: string, password: string): Promise<APIResponse> {
  return request.post('/api/auth/login', { data: { email, password }, failOnStatusCode: false });
}

test.describe('FR-02 로그인', () => {
  test('TC-RB-LOGIN-001 | FR-02-1 올바른 비밀번호로 로그인하면 200과 토큰을 반환한다', async ({ request }) => {
    const user = await createUser(request);

    const res = await login(request, user.email, user.password);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expectSchema(loginSchema, body, '로그인 응답');
    expect(body.user.email).toBe(user.email);
  });

  test('TC-RB-LOGIN-002 | FR-02-2 비밀번호가 틀리면 401 INVALID_CREDENTIALS를 반환한다', async ({ request }) => {
    const user = await createUser(request);

    const res = await login(request, user.email, WRONG_PASSWORD);

    expect(res.status()).toBe(401);
    const body = await res.json();
    expectSchema(errorSchema, body, '오류 응답');
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(body.token, '실패 응답에 토큰이 섞여 오면 안 된다').toBeUndefined();
  });

  test('TC-RB-LOGIN-003 | FR-02-2 가입되지 않은 이메일이면 401 INVALID_CREDENTIALS를 반환한다', async ({ request }) => {
    // 고정 주소는 누군가 그 주소로 가입하면 "없는 이메일"이 아니게 된다. 매번 새 주소를 쓴다.
    const res = await login(request, uniqueEmail('nobody'), 'Qa123456');

    expect(res.status()).toBe(401);
    // "없는 계정"과 "비밀번호 틀림"의 응답이 다르면 계정 존재 여부가 드러난다.
    expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS');
  });

  test('TC-RB-LOGIN-004 | FR-02-3 4회 틀린 뒤에는 아직 잠기지 않아 로그인된다', async ({ request }) => {
    const user = await createUser(request);
    await failLogin(request, user.email, 4);

    const res = await login(request, user.email, user.password);

    expect(res.status(), '잠금 기준(5회) 바로 아래에서는 로그인돼야 한다').toBe(200);
  });

  test('TC-RB-LOGIN-005 | FR-02-3 5회 틀린 뒤에는 올바른 비밀번호로도 423 ACCOUNT_LOCKED', async ({ request }) => {
    const user = await createUser(request);
    await failLogin(request, user.email, 5);

    const res = await login(request, user.email, user.password);

    await expectLocked(res, 'BUG-004');
  });

  test('TC-RB-LOGIN-006 | FR-02-3 처음부터 잠긴 계정은 올바른 비밀번호로도 423 ACCOUNT_LOCKED', async ({ request }) => {
    // 준비 확인의 한계: 잠금 상태를 조회하는 API가 없어, 서버 시작 시 시드 데이터로
    // 잠겨 있다는 전제를 확인할 수 없다. 직접 5회 틀려 잠그면 TC-RB-LOGIN-005와 같아진다.
    const res = await login(request, CREDENTIALS.locked.email, CREDENTIALS.locked.password);

    await expectLocked(res, 'BUG-004');
  });

  test('TC-RB-LOGIN-007 | FR-02-4 로그인 성공 시 실패 횟수가 0으로 초기화된다', async ({ request }) => {
    const user = await createUser(request);
    await failLogin(request, user.email, 3);
    const first = await login(request, user.email, user.password);
    expect(first.status(), '준비 실패: 3회 틀린 뒤 로그인').toBe(200);

    // 초기화됐으면 실패 4회(기준 바로 아래) → 200, 안 됐으면 3+4=7회 → 423
    await failLogin(request, user.email, 4);
    const res = await login(request, user.email, user.password);

    expect(res.status(), '성공 시 실패 횟수가 초기화돼야 한다').toBe(200);
  });
});
