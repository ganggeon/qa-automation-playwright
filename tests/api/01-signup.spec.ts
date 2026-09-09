import { test, expect } from '@playwright/test';
import { expectSchema } from '../../utils/schema';
import { signupSchema, errorSchema } from '../../test-data/schemas';
import { uniqueEmail, passwordOfLength } from '../../test-data/minishop';

/**
 * FR-01 회원가입 — POST /api/users
 *
 * 적용 설계기법
 *   · 동등분할(Equivalence Partitioning) : 이메일 형식, 비밀번호 구성
 *   · 경계값 분석(Boundary Value Analysis): 비밀번호 길이 8~20, 나이 14~120
 *
 * 경계값은 "유효구간의 양 끝과 그 바로 바깥"을 본다. 8자 규칙이면 7/8 을 보고,
 * 20자 규칙이면 20/21 을 본다. 개발자가 <= 와 < 를 헷갈리는 지점이 정확히 여기다.
 */

test.describe('FR-01 회원가입', () => {
  test('TC-API-SIGNUP-001 | 유효한 값으로 가입하면 201과 회원 정보를 반환한다', async ({ request }) => {
    const email = uniqueEmail('signup');

    const res = await request.post('/api/users', {
      data: { email, password: 'Qa123456', age: 30 },
      failOnStatusCode: false,
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    // 스키마에 additionalProperties:false 를 걸어두었기 때문에
    // 응답에 password가 섞여 나오면 여기서 잡힌다.
    expectSchema(signupSchema, body, '회원가입 응답');
    expect(body.email).toBe(email);
  });

  test('TC-API-SIGNUP-002 | 이미 가입된 이메일이면 409를 반환한다', async ({ request }) => {
    const email = uniqueEmail('dup');
    const payload = { email, password: 'Qa123456', age: 30 };

    await request.post('/api/users', { data: payload, failOnStatusCode: false });
    const res = await request.post('/api/users', { data: payload, failOnStatusCode: false });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expectSchema(errorSchema, body, '오류 응답');
    expect(body.error.code).toBe('DUPLICATE_EMAIL');
  });

  // ── 비밀번호 길이 경계값 (유효: 8 ~ 20) ───────────────────────────────────
  //
  //        7        8              20       21
  //   ─────┼────────┼──────────────┼────────┼─────
  //     무효 |            유효            | 무효
  //
  const passwordLengthCases = [
    { tc: 'TC-API-SIGNUP-003', len: 7, expected: 400, note: '하한 경계 바로 아래' },
    { tc: 'TC-API-SIGNUP-004', len: 8, expected: 201, note: '하한 경계' },
    { tc: 'TC-API-SIGNUP-005', len: 20, expected: 201, note: '상한 경계' },
    { tc: 'TC-API-SIGNUP-006', len: 21, expected: 400, note: '상한 경계 바로 위' },
  ];

  for (const c of passwordLengthCases) {
    test(`${c.tc} | [경계값] 비밀번호 ${c.len}자 → ${c.expected} (${c.note})`, async ({ request }) => {
      if (c.len === 21) {
        test.fail(true, 'BUG-001: 비밀번호 최대 길이(20자) 검증 누락으로 21자가 가입된다');
      }

      const res = await request.post('/api/users', {
        data: { email: uniqueEmail('pw'), password: passwordOfLength(c.len), age: 30 },
        failOnStatusCode: false,
      });

      expect(res.status(), `비밀번호 ${c.len}자에 대한 응답 코드`).toBe(c.expected);
      if (c.expected === 400) {
        expect((await res.json()).error.code).toBe('INVALID_PASSWORD');
      }
    });
  }

  // ── 나이 경계값 (유효: 14 ~ 120) ─────────────────────────────────────────
  const ageCases = [
    { tc: 'TC-API-SIGNUP-007', age: 13, expected: 400, note: '하한 바로 아래' },
    { tc: 'TC-API-SIGNUP-008', age: 14, expected: 201, note: '하한 경계' },
    { tc: 'TC-API-SIGNUP-009', age: 120, expected: 201, note: '상한 경계' },
    { tc: 'TC-API-SIGNUP-010', age: 121, expected: 400, note: '상한 바로 위' },
  ];

  for (const c of ageCases) {
    test(`${c.tc} | [경계값] 나이 ${c.age} → ${c.expected} (${c.note})`, async ({ request }) => {
      if (c.age === 121) {
        test.fail(true, 'BUG-002: 나이 상한(120) 검증 누락으로 121이 가입된다');
      }

      const res = await request.post('/api/users', {
        data: { email: uniqueEmail('age'), password: 'Qa123456', age: c.age },
        failOnStatusCode: false,
      });

      expect(res.status(), `나이 ${c.age}에 대한 응답 코드`).toBe(c.expected);
      // [알려진 결함 마킹 강화] 상태코드만 보면 "어떤 이유로든 실패"가 전부
      // 결함 재현으로 집계된다. 거부 사유(error.code)까지 고정해 둔다.
      if (c.expected === 400) {
        expect((await res.json()).error.code).toBe('INVALID_AGE');
      }
    });
  }

  // ── 이메일 동등분할 ──────────────────────────────────────────────────────
  const emailCases = [
    { tc: 'TC-API-SIGNUP-011', value: 'valid@example.com', expected: 201, cls: '유효: 표준 형식' },
    { tc: 'TC-API-SIGNUP-012', value: 'no-at-sign.com', expected: 400, cls: '무효: @ 없음' },
    { tc: 'TC-API-SIGNUP-013', value: '@example.com', expected: 400, cls: '무효: 로컬부 없음' },
    { tc: 'TC-API-SIGNUP-014', value: 'a@b', expected: 400, cls: '무효: 도메인에 점 없음' },
    { tc: 'TC-API-SIGNUP-015', value: '', expected: 400, cls: '무효: 빈 값' },
  ];

  for (const c of emailCases) {
    test(`${c.tc} | [동등분할] 이메일 "${c.value}" → ${c.expected} (${c.cls})`, async ({ request }) => {
      if (c.value === 'a@b') {
        test.fail(true, 'BUG-003: 이메일 정규식이 느슨해 도메인에 점이 없어도 통과한다');
      }

      // 유효 케이스는 중복 가입을 피하려고 매번 다른 주소를 쓴다
      const email = c.expected === 201 ? uniqueEmail('emailok') : c.value;
      const res = await request.post('/api/users', {
        data: { email, password: 'Qa123456', age: 30 },
        failOnStatusCode: false,
      });

      expect(res.status(), `이메일 "${c.value}"에 대한 응답 코드`).toBe(c.expected);
      if (c.expected === 400) {
        expect((await res.json()).error.code).toBe('INVALID_EMAIL');
      }
    });
  }

  // ── 비밀번호 구성 규칙 (FR-01-4) ─────────────────────────────────────────
  const compositionCases = [
    { tc: 'TC-API-SIGNUP-016', pw: 'abcdefgh', expected: 400, cls: '무효: 숫자 없음' },
    { tc: 'TC-API-SIGNUP-017', pw: '12345678', expected: 400, cls: '무효: 영문 없음' },
    { tc: 'TC-API-SIGNUP-018', pw: 'abcd1234', expected: 201, cls: '유효: 영문+숫자' },
  ];

  for (const c of compositionCases) {
    test(`${c.tc} | [동등분할] 비밀번호 "${c.pw}" → ${c.expected} (${c.cls})`, async ({ request }) => {
      const res = await request.post('/api/users', {
        data: { email: uniqueEmail('comp'), password: c.pw, age: 30 },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(c.expected);
    });
  }

  // ── 필수 / 타입 (FR-01-5 "필수. 정수", FR-01-3 "필수") ────────────────────
  //
  // 경계값은 "값의 크기"만 본다. 그런데 실제 클라이언트 버그는 값이 아니라
  // **타입**에서 더 자주 난다. 폼에서 넘어온 "30"(문자열), 계산 결과 30.5(소수),
  // 필드 자체 누락(undefined), 명시적 null — 네 가지는 전부 다른 코드 경로다.
  const ageTypeCases = [
    { tc: 'TC-API-SIGNUP-019', label: '누락(undefined)', age: undefined },
    { tc: 'TC-API-SIGNUP-020', label: '문자열 "30"', age: '30' },
    { tc: 'TC-API-SIGNUP-021', label: '소수 30.5', age: 30.5 },
    { tc: 'TC-API-SIGNUP-022', label: 'null', age: null },
    { tc: 'TC-API-SIGNUP-024', label: '문자열 "abc"', age: 'abc' }
  ];

  for (const c of ageTypeCases) {
    test(`${c.tc} | [동등분할] 나이 ${c.label} → 400 (필수·정수 위반)`, async ({ request }) => {
      const res = await request.post('/api/users', {
        data: { email: uniqueEmail('agetype'), password: 'Qa123456', age: c.age },
        failOnStatusCode: false,
      });

      expect(res.status(), `나이 ${c.label}에 대한 응답 코드`).toBe(400);
      const body = await res.json();
      expectSchema(errorSchema, body, '오류 응답');
      expect(body.error.code).toBe('INVALID_AGE');
    });
  }

  test('TC-API-SIGNUP-023 | [동등분할] 비밀번호 필드가 없으면 400을 반환한다', async ({ request }) => {
    const res = await request.post('/api/users', {
      data: { email: uniqueEmail('nopw'), age: 30 },
      failOnStatusCode: false,
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_PASSWORD');
  });


  
});
