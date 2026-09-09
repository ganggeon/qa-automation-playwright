import { test, expect } from '@playwright/test';
import { expectSchema } from '../../utils/schema';
import { productListSchema, productSchema, errorSchema } from '../../test-data/schemas';
import { PRODUCT } from '../../test-data/minishop';

/**
 * FR-04 상품 목록 / FR-05 상품 상세
 *
 * 적용 설계기법
 *   · 경계값 분석 : page(1 이상), size(1~50)
 *   · 동등분할   : 검색 키워드(일치 / 대소문자 다름 / 미일치 / 미입력)
 *
 * 이 파일의 테스트는 재고를 소모하지 않는 **읽기 전용**이라 병렬 실행에 안전하다.
 */

test.describe('FR-04 상품 목록', () => {
  test('TC-API-PROD-001 | 기본 조회 시 200과 규격에 맞는 목록을 반환한다', async ({ request }) => {
    const res = await request.get('/api/products', { failOnStatusCode: false });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expectSchema(productListSchema, body, '상품 목록 응답');
    expect(body.page, '기본 page').toBe(1);
    expect(body.size, '기본 size').toBe(10);
    expect(body.items.length, '기본 size만큼 반환').toBe(10);
  });

  // ── size 경계값 (유효: 1 ~ 50) ───────────────────────────────────────────
  const sizeCases = [
    { tc: 'TC-API-PROD-002', size: 0, expected: 400, note: '하한 바로 아래' },
    { tc: 'TC-API-PROD-003', size: 1, expected: 200, note: '하한 경계' },
    { tc: 'TC-API-PROD-004', size: 50, expected: 200, note: '상한 경계' },
    { tc: 'TC-API-PROD-005', size: 51, expected: 400, note: '상한 바로 위' },
  ];

  for (const c of sizeCases) {
    test(`${c.tc} | [경계값] size=${c.size} → ${c.expected} (${c.note})`, async ({ request }) => {
      if (c.size === 0) {
        test.fail(true, 'BUG-006: size=0이 400으로 거부되지 않고 전체 목록이 반환된다');
      }

      const res = await request.get('/api/products', {
        params: { size: c.size },
        failOnStatusCode: false,
      });

      expect(res.status(), `size=${c.size}에 대한 응답 코드`).toBe(c.expected);
      if (c.expected === 400) {
        const body = await res.json();
        expectSchema(errorSchema, body, '오류 응답');
        // [알려진 결함 마킹 강화] 거부 사유까지 고정한다.
        expect(body.error.code).toBe('INVALID_PARAM');
      }
    });
  }

  // ── page 경계값 (유효: 1 이상) ───────────────────────────────────────────
  const pageCases = [
    { tc: 'TC-API-PROD-006', page: 0, expected: 400, note: '하한 바로 아래' },
    { tc: 'TC-API-PROD-007', page: 1, expected: 200, note: '하한 경계' },
    { tc: 'TC-API-PROD-008', page: -1, expected: 400, note: '음수' },
    // 크기가 아니라 **타입**을 어긴 경우. "1 이상 정수" 규칙의 '정수' 쪽이다.
    { tc: 'TC-API-PROD-019', page: 'abc', expected: 400, note: '숫자가 아님' },
    { tc: 'TC-API-PROD-020', page: 1.5, expected: 400, note: '정수가 아님' },
  ];

  for (const c of pageCases) {
    test(`${c.tc} | [경계값] page=${c.page} → ${c.expected} (${c.note})`, async ({ request }) => {
      const res = await request.get('/api/products', {
        params: { page: c.page },
        failOnStatusCode: false,
      });
      expect(res.status(), `page=${c.page}에 대한 응답 코드`).toBe(c.expected);
      if (c.expected === 400) {
        expect((await res.json()).error.code).toBe('INVALID_PARAM');
      }
    });
  }

  test('TC-API-PROD-009 | 마지막 페이지는 남은 건수만 반환한다', async ({ request }) => {
    // 상품 건수를 상수로 박지 않는다. 명세(SPEC 5절)는 마스터를 고정하지만,
    // 페이징 **규칙**은 건수와 무관하게 성립해야 한다. total을 먼저 읽어
    // 기대값을 계산하면 마스터가 늘어도 이 테스트는 그대로 유효하다.
    const size = 10;
    const first = await (await request.get('/api/products', { params: { page: 1, size } })).json();
    const total: number = first.total;
    const lastPage = Math.ceil(total / size);
    const expectedOnLastPage = total - (lastPage - 1) * size;

    const res = await request.get('/api/products', { params: { page: lastPage, size } });
    const body = await res.json();

    expect(body.total, '페이지가 달라도 total은 같아야 한다').toBe(total);
    expect(body.items.length, `마지막 페이지(${lastPage})의 건수`).toBe(expectedOnLastPage);
    expect(expectedOnLastPage, '마지막 페이지는 size 이하여야 한다').toBeLessThanOrEqual(size);
  });

  test('TC-API-PROD-010 | 존재하지 않는 페이지는 빈 배열을 반환한다', async ({ request }) => {
    const res = await request.get('/api/products', { params: { page: 99, size: 10 } });
    expect(res.status()).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  test('TC-API-PROD-011 | size에 숫자가 아닌 값을 주면 400을 반환한다', async ({ request }) => {
    const res = await request.get('/api/products', {
      params: { size: 'abc' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  // ── 검색 키워드 동등분할 ─────────────────────────────────────────────────
  const keywordCases = [
    { tc: 'TC-API-PROD-012', keyword: 'Java', shouldMatch: true, cls: '유효: 정확히 일치' },
    { tc: 'TC-API-PROD-013', keyword: 'java', shouldMatch: true, cls: '유효: 소문자 (대소문자 무시)' },
    { tc: 'TC-API-PROD-014', keyword: 'JAVA', shouldMatch: true, cls: '유효: 대문자 (대소문자 무시)' },
    { tc: 'TC-API-PROD-015', keyword: '존재하지않는상품', shouldMatch: false, cls: '유효: 결과 없음' },
  ];

  for (const c of keywordCases) {
    test(`${c.tc} | [동등분할] 검색어 "${c.keyword}" (${c.cls})`, async ({ request }) => {
      if (c.keyword === 'java' || c.keyword === 'JAVA') {
        test.fail(true, 'BUG-007: 검색이 대소문자를 구분하여 다른 표기로는 상품을 찾지 못한다');
      }

      const res = await request.get('/api/products', {
        params: { keyword: c.keyword, size: 50 },
      });
      const body = await res.json();
      const names: string[] = body.items.map((p: { name: string }) => p.name);

      if (c.shouldMatch) {
        expect(names, `"${c.keyword}" 검색 결과에 'Java의 정석'이 있어야 한다`).toContain(
          PRODUCT.EXACT_30000.name
        );
      } else {
        expect(body.total).toBe(0);
        expect(body.items).toEqual([]);
      }
    });
  }
});

test.describe('FR-05 상품 상세', () => {
  test('TC-API-PROD-016 | 존재하는 상품은 200과 상품 정보를 반환한다', async ({ request }) => {
    const res = await request.get(`/api/products/${PRODUCT.CART_ONLY.id}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expectSchema(productSchema, body, '상품 상세 응답');
    expect(body.name).toBe(PRODUCT.CART_ONLY.name);
    expect(body.price).toBe(PRODUCT.CART_ONLY.price);
  });

  test('TC-API-PROD-017 | 존재하지 않는 상품 id는 404를 반환한다', async ({ request }) => {
    const res = await request.get('/api/products/99999', { failOnStatusCode: false });

    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('TC-API-PROD-018 | 숫자가 아닌 상품 id는 404를 반환한다', async ({ request }) => {
    const res = await request.get('/api/products/abc', { failOnStatusCode: false });
    expect(res.status()).toBe(404);
  });
});
