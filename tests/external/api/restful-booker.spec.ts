import { test, expect, type APIRequestContext } from '@playwright/test';
import { expectSchema } from '../../../utils/schema';

/**
 * 외부 공개 API — restful-booker (https://restful-booker.herokuapp.com)
 *
 * 자체 제작 SUT는 내가 결함을 심었으니 "찾을 줄 안다"는 증명이 약하다.
 * 여기서는 **남이 만든, 스펙 문서만 공개된 실제 API**를 REST 규약과 대조해
 * 결함을 찾는다. 아래 EXT-BUG 5건은 이 프로젝트에서 직접 발견한 것이다.
 *
 * 공식 문서: https://restful-booker.herokuapp.com/apidoc/
 *
 * 주의: 남의 서버다. 응답이 느리거나 잠깐 죽을 수 있어 별도 프로젝트로 분리하고
 *       retries를 2로 두었다. 메인 스위트의 신뢰도를 오염시키지 않기 위함이다.
 */

const CREDS = { username: 'admin', password: 'password123' };

const bookingSchema = {
  type: 'object',
  required: ['firstname', 'lastname', 'totalprice', 'depositpaid', 'bookingdates'],
  properties: {
    firstname: { type: 'string' },
    lastname: { type: 'string' },
    totalprice: { type: 'number' },
    depositpaid: { type: 'boolean' },
    bookingdates: {
      type: 'object',
      required: ['checkin', 'checkout'],
      properties: {
        checkin: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        checkout: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
    },
    additionalneeds: { type: 'string' },
  },
} as const;

/** 이 API는 Accept 헤더가 없으면 XML을 돌려준다. JSON을 원하면 명시해야 한다. */
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

function newBooking(overrides: Record<string, unknown> = {}) {
  return {
    firstname: 'QA',
    lastname: 'Portfolio',
    totalprice: 120,
    depositpaid: true,
    bookingdates: { checkin: '2026-09-01', checkout: '2026-09-05' },
    additionalneeds: 'Breakfast',
    ...overrides,
  };
}

async function getToken(request: APIRequestContext): Promise<string> {
  const res = await request.post('/auth', { headers: JSON_HEADERS, data: CREDS });
  return (await res.json()).token;
}

async function createBooking(request: APIRequestContext, data = newBooking()): Promise<number> {
  const res = await request.post('/booking', { headers: JSON_HEADERS, data });
  return (await res.json()).bookingid;
}

test.describe('restful-booker — 인증', () => {
  test('TC-EXT-AUTH-001 | 올바른 자격증명이면 토큰을 발급한다', async ({ request }) => {
    const res = await request.post('/auth', { headers: JSON_HEADERS, data: CREDS });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token, `토큰이 없다: ${JSON.stringify(body)}`).toBeTruthy();
    expect(String(body.token).length).toBeGreaterThan(8);
  });

  test('TC-EXT-AUTH-002 | 잘못된 자격증명이면 401을 반환해야 한다', async ({ request }) => {
    test.fail(
      true,
      'EXT-BUG-001: 인증 실패인데 200 OK + {"reason":"Bad credentials"} 를 반환한다. ' +
        '클라이언트가 상태코드만 보면 성공으로 오인한다.'
    );

    const res = await request.post('/auth', {
      headers: JSON_HEADERS,
      data: { username: 'admin', password: 'WRONG_PASSWORD' },
    });

    expect(res.status(), '인증 실패는 401이어야 한다').toBe(401);
  });
});

test.describe('restful-booker — 예약 CRUD', () => {
  test('TC-EXT-BOOK-001 | 예약을 생성하면 201과 생성된 예약을 반환해야 한다', async ({ request }) => {
    test.fail(true, 'EXT-BUG-002: 리소스 생성인데 201이 아니라 200을 반환한다 (REST 규약 위반)');

    const res = await request.post('/booking', { headers: JSON_HEADERS, data: newBooking() });
    expect(res.status()).toBe(201);
  });

  test('TC-EXT-BOOK-002 | 생성된 예약은 요청한 내용 그대로 조회된다', async ({ request }) => {
    const payload = newBooking({ firstname: 'Round', lastname: 'Trip' });
    const id = await createBooking(request, payload);

    const res = await request.get(`/booking/${id}`, { headers: JSON_HEADERS });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expectSchema(bookingSchema, body, '예약 조회 응답');
    expect(body.firstname).toBe(payload.firstname);
    expect(body.totalprice).toBe(payload.totalprice);
    expect(body.bookingdates).toEqual(payload.bookingdates);
  });

  test('TC-EXT-BOOK-003 | 존재하지 않는 예약은 404를 반환한다', async ({ request }) => {
    const res = await request.get('/booking/99999999', { headers: JSON_HEADERS });
    expect(res.status()).toBe(404);
  });

  test('TC-EXT-BOOK-004 | 토큰 없이 수정하면 403을 반환한다', async ({ request }) => {
    const id = await createBooking(request);

    const res = await request.put(`/booking/${id}`, {
      headers: JSON_HEADERS,
      data: newBooking({ firstname: 'Hacked' }),
    });

    expect(res.status(), '인증 없는 수정은 거부되어야 한다').toBe(403);
  });

  test('TC-EXT-BOOK-005 | 토큰이 있으면 예약을 수정할 수 있다', async ({ request }) => {
    const token = await getToken(request);
    const id = await createBooking(request);

    const res = await request.put(`/booking/${id}`, {
      headers: { ...JSON_HEADERS, Cookie: `token=${token}` },
      data: newBooking({ firstname: 'Updated', totalprice: 999 }),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.firstname).toBe('Updated');
    expect(body.totalprice).toBe(999);
  });

  test('TC-EXT-BOOK-006 | 삭제하면 204를 반환해야 한다', async ({ request }) => {
    test.fail(
      true,
      'EXT-BUG-003: 삭제 성공에 201 Created + 본문 "Created" 를 반환한다. 삭제는 204여야 한다.'
    );

    const token = await getToken(request);
    const id = await createBooking(request);

    const res = await request.delete(`/booking/${id}`, {
      headers: { ...JSON_HEADERS, Cookie: `token=${token}` },
    });

    expect(res.status()).toBe(204);
  });

  test('TC-EXT-BOOK-007 | 삭제된 예약은 더 이상 조회되지 않는다', async ({ request }) => {
    const token = await getToken(request);
    const id = await createBooking(request);

    await request.delete(`/booking/${id}`, {
      headers: { ...JSON_HEADERS, Cookie: `token=${token}` },
    });

    const res = await request.get(`/booking/${id}`, { headers: JSON_HEADERS });
    expect(res.status(), '삭제 후 조회는 404여야 한다').toBe(404);
  });
});

test.describe('restful-booker — 입력값 검증', () => {
  test('TC-EXT-VAL-001 | 체크아웃이 체크인보다 빠르면 400을 반환해야 한다', async ({ request }) => {
    test.fail(
      true,
      'EXT-BUG-004: 체크아웃(1/5)이 체크인(1/10)보다 빠른 예약이 그대로 생성된다. ' +
        '날짜 순서 검증이 전혀 없다.'
    );

    const res = await request.post('/booking', {
      headers: JSON_HEADERS,
      data: newBooking({ bookingdates: { checkin: '2026-01-10', checkout: '2026-01-05' } }),
    });

    expect(res.status(), '비즈니스 규칙 위반은 400이어야 한다').toBe(400);
  });

  test('TC-EXT-VAL-002 | 필수 필드가 빠지면 400을 반환해야 한다', async ({ request }) => {
    test.fail(
      true,
      'EXT-BUG-005: 필수 필드 누락 시 500 Internal Server Error가 발생한다. ' +
        '입력값 검증 없이 처리하다 서버가 터진 것으로, 400이어야 한다.'
    );

    const res = await request.post('/booking', {
      headers: JSON_HEADERS,
      data: { firstname: 'OnlyName' },
    });

    expect(res.status(), `실제 응답: ${res.status()}`).toBe(400);
  });

  test('TC-EXT-VAL-003 | [경계값] 총액 0원 예약은 생성할 수 있다', async ({ request }) => {
    const res = await request.post('/booking', {
      headers: JSON_HEADERS,
      data: newBooking({ totalprice: 0 }),
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).booking.totalprice).toBe(0);
  });
});
