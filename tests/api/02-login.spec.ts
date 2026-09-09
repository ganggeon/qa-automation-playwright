import { test, expect, type APIRequestContext } from '@playwright/test';
import { expectSchema } from '../../utils/schema';
import { loginSchema, errorSchema } from '../../test-data/schemas';
import { CREDENTIALS, uniqueEmail } from '../../test-data/minishop';

/**
 * FR-02 로그인 / FR-03 로그아웃
 *
 * 적용 설계기법: 상태 전이 테스트(State Transition Testing)
 *
 *   계정은 "실패 횟수"라는 상태를 가진다. 단일 요청만 보내는 테스트로는
 *   절대 잡을 수 없고, **순서가 있는 요청의 연속**으로만 검증할 수 있다.
 *
 *   [실패0] --실패--> [실패1] --실패--> ... --실패--> [실패4] --실패--> [잠금]
 *      ^                                                            |
 *      |___________________ 성공(카운트 초기화) ___________________|
 *
 *   전이 커버리지
 *     T1 실패0 → 실패1        (TC-020)
 *     T2 실패4 → 잠금          (TC-023)
 *     T3 실패n → 실패0 (성공)  (TC-022)
 *     T4 잠금 → 잠금 (올바른 비밀번호로도 못 뚫음) (TC-024)
 */

/** 테스트 전용 계정을 즉석에서 만든다. 다른 테스트의 실패 카운트에 영향받지 않기 위함. */
async function createUser(request: APIRequestContext) {
  const email = uniqueEmail('login');
  const password = 'Qa123456';
  const res = await request.post('/api/users', { data: { email, password, age: 30 }, failOnStatusCode: false });
  expect(res.status()).toBe(201);
  return { email, password };
}

test.describe('FR-02 로그인', () => {
  test('TC-API-LOGIN-001 | 올바른 자격증명으로 로그인하면 200과 토큰을 반환한다', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: CREDENTIALS.valid,
      failOnStatusCode: false,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expectSchema(loginSchema, body, '로그인 응답');
    expect(body.user.email).toBe(CREDENTIALS.valid.email);
  });

  test('TC-API-LOGIN-002 | 비밀번호가 틀리면 401을 반환한다', async ({ request }) => {
    const user = await createUser(request);
    const res = await request.post('/api/auth/login', {
      data: { email: user.email, password: 'WrongPw123' },
      failOnStatusCode: false,
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expectSchema(errorSchema, body, '오류 응답');
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('TC-API-LOGIN-003 | 존재하지 않는 이메일이면 401을 반환한다', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'ghost@nowhere.com', password: 'Qa123456' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    // 보안 관점: "없는 계정"과 "비밀번호 틀림"의 응답이 구분되면 계정 존재 여부가 새어나간다.
    expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS');
  });

  test('TC-API-LOGIN-004 | [상태전이 T3] 4회 실패 후 성공하면 로그인되고 카운트가 초기화된다', async ({ request }) => {
    const user = await createUser(request);

    for (let i = 1; i <= 4; i++) {
      const fail = await request.post('/api/auth/login', {
        data: { email: user.email, password: 'WrongPw123' },
        failOnStatusCode: false,
      });
      expect(fail.status(), `${i}회차 실패 응답`).toBe(401);
    }

    const ok = await request.post('/api/auth/login', { data: user, failOnStatusCode: false });
    expect(ok.status(), '4회 실패 후에는 아직 잠기지 않아야 한다').toBe(200);

    // 카운트가 초기화됐는지 확인: 다시 4회 실패해도 여전히 잠기지 않아야 한다
    for (let i = 1; i <= 4; i++) {
      await request.post('/api/auth/login', {
        data: { email: user.email, password: 'WrongPw123' },
        failOnStatusCode: false,
      });
    }
    const again = await request.post('/api/auth/login', { data: user, failOnStatusCode: false });
    expect(again.status(), '성공 시 실패 카운트가 초기화되어야 한다').toBe(200);
  });

  test('TC-API-LOGIN-005 | [상태전이 T2] 5회 연속 실패하면 계정이 잠긴다', async ({ request }) => {
    test.fail(true, 'BUG-004: 실패 횟수는 누적되지만 잠금 상태를 확인하지 않아 계정이 잠기지 않는다');
    const user = await createUser(request);

    for (let i = 1; i <= 5; i++) {
      await request.post('/api/auth/login', {
        data: { email: user.email, password: 'WrongPw123' },
        failOnStatusCode: false,
      });
    }

    const res = await request.post('/api/auth/login', { data: user, failOnStatusCode: false });
    expect(res.status(), '잠긴 계정은 올바른 비밀번호로도 로그인되면 안 된다').toBe(423);
    expect((await res.json()).error.code).toBe('ACCOUNT_LOCKED');
  });

  test('TC-API-LOGIN-006 | [상태전이 T4] 잠긴 계정은 올바른 비밀번호로도 로그인할 수 없다', async ({ request }) => {
    test.fail(true, 'BUG-004: 잠금 계정(locked@test.com)이 정상 로그인된다');

    const res = await request.post('/api/auth/login', {
      data: CREDENTIALS.locked,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(423);
  });
});

test.describe('FR-03 로그아웃', () => {
  test('TC-API-LOGOUT-001 | 로그아웃은 204를 반환한다', async ({ request }) => {
    const login = await request.post('/api/auth/login', { data: CREDENTIALS.valid });
    const { token } = await login.json();

    const res = await request.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(204);
  });

  test('TC-API-LOGOUT-002 | 토큰 없이 로그아웃하면 401을 반환한다', async ({ request }) => {
    const res = await request.post('/api/auth/logout', { failOnStatusCode: false });
    expect(res.status()).toBe(401);
  });

  test('TC-API-LOGOUT-003 | 로그아웃한 토큰은 재사용할 수 없다', async ({ request }) => {
    test.fail(true, 'BUG-005: 로그아웃 시 세션을 무효화하지 않아 토큰이 계속 유효하다');

    const login = await request.post('/api/auth/login', { data: CREDENTIALS.valid });
    const { token } = await login.json();
    const headers = { Authorization: `Bearer ${token}` };

    await request.post('/api/auth/logout', { headers, failOnStatusCode: false });

    const res = await request.get('/api/cart', { headers, failOnStatusCode: false });
    expect(res.status(), '무효화된 토큰으로 인증 API를 호출하면 401이어야 한다').toBe(401);
  });
});
