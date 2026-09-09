import { test, expect } from '../../fixtures/minishop';
import { expectSchema } from '../../utils/schema';
import { cartSchema, errorSchema } from '../../test-data/schemas';
import { PRODUCT, uniqueEmail } from '../../test-data/minishop';

/**
 * FR-06 장바구니 담기 / FR-07 조회 / FR-08 삭제
 *
 * 적용 설계기법
 *   · 경계값 분석 : 수량 1~99
 *   · 동등분할   : 상품 존재 여부, 재고 충분/부족/품절
 *   · 인증 경로  : 토큰 없음 / 잘못된 토큰
 *
 * 이 파일은 fixtures/minishop.ts 의 `shop` 픽스처를 쓴다.
 * 테스트마다 새 계정이 생기므로 장바구니는 항상 비어 있는 상태에서 시작한다.
 */

test.describe('FR-06 장바구니 담기', () => {
  test('TC-API-CART-001 | 정상 담기 시 201과 장바구니 전체를 반환한다', async ({ shop }) => {
    const res = await shop.addToCart(PRODUCT.CART_ONLY.id, 2);

    expect(res.status()).toBe(201);
    const body = await res.json();
    expectSchema(cartSchema, body, '장바구니 응답');
    expect(body.items).toHaveLength(1);
    expect(body.totalQty).toBe(2);
    expect(body.totalPrice, '소계 = 가격 × 수량').toBe(PRODUCT.CART_ONLY.price * 2);
  });

  // ── 수량 경계값 (유효: 1 ~ 99) ───────────────────────────────────────────
  const qtyCases = [
    { tc: 'TC-API-CART-002', qty: 0, expected: 400, note: '하한 바로 아래' },
    { tc: 'TC-API-CART-003', qty: 1, expected: 201, note: '하한 경계' },
    { tc: 'TC-API-CART-004', qty: 99, expected: 201, note: '상한 경계' },
    { tc: 'TC-API-CART-005', qty: 100, expected: 400, note: '상한 바로 위' },
  ];

  for (const c of qtyCases) {
    test(`${c.tc} | [경계값] 수량 ${c.qty} → ${c.expected} (${c.note})`, async ({ shop }) => {
      if (c.qty === 0) {
        test.fail(true, 'BUG-008: 수량 하한(1) 검증 누락으로 0·음수가 그대로 담긴다');
      }

      // 수량 상한(99)을 검증하려면 재고가 그보다 넉넉한 **전용** 상품이 필요하다.
      // 재고를 다른 테스트와 나눠 쓰면, 재고 검증 결함이 수정되는 순간
      // "수량 규칙" 테스트가 "재고 부족"으로 깨진다. (test-data/minishop.ts 주석 참고)
      const productId = c.qty >= 99 ? PRODUCT.BULK_QTY.id : PRODUCT.CART_ONLY.id;
      const res = await shop.addToCart(productId, c.qty);

      expect(res.status(), `수량 ${c.qty}에 대한 응답 코드`).toBe(c.expected);
      if (c.expected === 400) {
        expect((await res.json()).error.code).toBe('INVALID_QTY');
      }
    });
  }

  test('TC-API-CART-006 | 음수 수량은 총액을 음수로 만들면 안 된다', async ({ shop }) => {
    test.fail(true, 'BUG-008: 수량 -3이 담겨 총 결제금액이 음수가 된다');

    await shop.addToCart(PRODUCT.CART_ONLY.id, -3);
    const body = await (await shop.cart()).json();

    // 스키마가 qty>=1, totalPrice>=0 을 요구하므로 여기서 바로 잡힌다.
    expectSchema(cartSchema, body, '장바구니 응답');
    expect(body.totalPrice, '총 결제금액은 음수가 될 수 없다').toBeGreaterThanOrEqual(0);
  });

  test('TC-API-CART-007 | 품절 상품은 담을 수 없다 (409)', async ({ shop }) => {
    test.fail(true, 'BUG-009: 담기 시점에 재고를 확인하지 않아 품절 상품도 담긴다');

    const res = await shop.addToCart(PRODUCT.SOLD_OUT.id, 1);

    expect(res.status(), '재고 0인 상품은 409여야 한다').toBe(409);
    expect((await res.json()).error.code).toBe('OUT_OF_STOCK');
  });

  test('TC-API-CART-008 | 재고보다 많은 수량은 담을 수 없다 (409)', async ({ shop }) => {
    test.fail(true, 'BUG-009: 재고 2개인 상품에 5개를 담아도 성공한다');

    const res = await shop.addToCart(PRODUCT.TINY_STOCK.id, 5);
    expect(res.status(), `재고 ${PRODUCT.TINY_STOCK.initialStock}개 상품에 5개 담기`).toBe(409);
    expect((await res.json()).error.code).toBe('OUT_OF_STOCK');
  });

  test('TC-API-CART-009 | 존재하지 않는 상품은 404를 반환한다', async ({ shop }) => {
    const res = await shop.addToCart(99999, 1);

    expect(res.status()).toBe(404);
    const body = await res.json();
    expectSchema(errorSchema, body, '오류 응답');
    expect(body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('TC-API-CART-010 | 같은 상품을 다시 담으면 수량이 합산된다', async ({ shop }) => {
    await shop.addToCart(PRODUCT.CART_ONLY.id, 2);
    const res = await shop.addToCart(PRODUCT.CART_ONLY.id, 3);
    const body = await res.json();

    expect(body.items, '항목이 새로 추가되지 않고 하나로 합쳐져야 한다').toHaveLength(1);
    expect(body.items[0].qty).toBe(5);
    expect(body.totalPrice).toBe(PRODUCT.CART_ONLY.price * 5);
  });

  test('TC-API-CART-018 | [경계값] 합산 결과가 상한(99)을 넘으면 거부되어야 한다', async ({ shop }) => {
    test.fail(true, 'BUG-016: 합산 시 수량 상한을 다시 검사하지 않아 99를 초과한 수량이 담긴다');

    // FR-06-4 는 "합산 결과도 FR-06-2/3 규칙을 지켜야 한다"고 명시한다.
    // 요청 하나만 보면 99도 1도 전부 유효 범위다. 규칙이 깨지는 것은 **합산 이후**다.
    //
    // 재고 999짜리 전용 상품을 쓰므로 99+1=100 은 재고 규칙(FR-06-3)에는 걸리지 않는다.
    // 즉 여기서 잡히는 위반은 오직 FR-06-2(수량 상한) 하나다.
    expect((await shop.addToCart(PRODUCT.BULK_QTY.id, 99)).status(), '99개는 유효 범위').toBe(201);

    const res = await shop.addToCart(PRODUCT.BULK_QTY.id, 1); // 합산하면 100

    expect(res.status(), '합산 결과 100은 상한 99를 넘으므로 거부되어야 한다').toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_QTY');
  });

  test('TC-API-CART-021 | [동등분할] 수량이 정수가 아니면 400을 반환한다', async ({ shop }) => {
    const res = await shop.addToCart( PRODUCT.CART_ONLY.id , 2.5);
    
    expect(res.status(), '소수 수량은 정수 규칙 위반').toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_QTY');

  });


});

test.describe('FR-06 인증', () => {
  test('TC-API-CART-011 | 토큰 없이 담으면 401을 반환한다', async ({ request }) => {
    const res = await request.post('/api/cart', {
      data: { productId: PRODUCT.CART_ONLY.id, qty: 1 },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('TC-API-CART-012 | 잘못된 토큰으로 담으면 401을 반환한다', async ({ request }) => {
    const res = await request.post('/api/cart', {
      headers: { Authorization: 'Bearer tok_invalid_xxxxx' },
      data: { productId: PRODUCT.CART_ONLY.id, qty: 1 },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  // 인증은 엔드포인트마다 따로 걸려 있다. 하나가 막혀 있다고 나머지도 막혀 있다는
  // 보장은 없다 — 실제로 "쓰기는 막고 읽기는 열어둔" 사고가 가장 흔하다.
  // SPEC FR-07 / FR-08 / FR-10 모두 토큰이 필요하다고 명시한다.
  const noTokenCases = [
    { tc: 'TC-API-CART-019', label: 'GET /api/cart', call: '/api/cart', method: 'get' as const },
    { tc: 'TC-API-CART-020', label: 'DELETE /api/cart/:itemId', call: '/api/cart/1', method: 'delete' as const },
  ];

  for (const c of noTokenCases) {
    test(`${c.tc} | 토큰 없이 ${c.label} 를 호출하면 401을 반환한다`, async ({ request }) => {
      const res = await request[c.method](c.call, { failOnStatusCode: false });

      expect(res.status(), `${c.label} 무토큰 호출`).toBe(401);
      expect((await res.json()).error.code).toBe('UNAUTHORIZED');
    });
  }
});

test.describe('FR-07 장바구니 조회', () => {
  test('TC-API-CART-013 | 빈 장바구니는 빈 목록과 0원을 반환한다', async ({ shop }) => {
    const res = await shop.cart();

    expect(res.status()).toBe(200);
    const body = await res.json();
    expectSchema(cartSchema, body, '장바구니 응답');
    expect(body.items).toEqual([]);
    expect(body.totalQty).toBe(0);
    expect(body.totalPrice).toBe(0);
  });

  test('TC-API-CART-014 | 여러 상품의 총액은 각 소계의 합이다', async ({ shop }) => {
    await shop.addToCart(PRODUCT.CART_ONLY.id, 2);
    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    const body = await (await shop.cart()).json();

    const expected = PRODUCT.CART_ONLY.price * 2 + PRODUCT.CHEAP.price;
    expect(body.totalPrice).toBe(expected);
    expect(body.totalQty).toBe(3);
    for (const item of body.items) {
      expect(item.subtotal, `${item.name} 소계`).toBe(item.price * item.qty);
    }
  });
});

test.describe('FR-08 장바구니 삭제', () => {
  test('TC-API-CART-015 | 담긴 항목을 삭제하면 204이고 목록에서 사라진다', async ({ shop }) => {
    const added = await (await shop.addToCart(PRODUCT.CART_ONLY.id, 1)).json();
    const itemId = added.items[0].itemId;

    const res = await shop.removeFromCart(itemId);
    expect(res.status()).toBe(204);

    const after = await (await shop.cart()).json();
    expect(after.items).toEqual([]);
  });

  test('TC-API-CART-016 | 존재하지 않는 항목을 삭제하면 404를 반환한다', async ({ shop }) => {
    test.fail(true, 'BUG-010: 없는 itemId를 삭제해도 404가 아니라 204(성공)로 응답한다');

    const res = await shop.removeFromCart(999999);
    expect(res.status(), '없는 리소스 삭제는 404여야 한다').toBe(404);
    expect((await res.json()).error.code).toBe('CART_ITEM_NOT_FOUND');
  });

  test('TC-API-CART-017 | 다른 회원의 장바구니 항목은 삭제할 수 없다', async ({ shop, playwright, baseURL, request }) => {
    test.fail(true, 'BUG-010: 소유자 확인 없이 항상 204를 반환한다');

    // 내 계정으로 담아서 itemId를 확보
    const mine = await (await shop.addToCart(PRODUCT.CART_ONLY.id, 1)).json();
    const myItemId = mine.items[0].itemId;

    // 다른 계정을 만들어 그 계정으로 내 itemId 삭제를 시도한다
    const email = uniqueEmail('attacker');
    await request.post('/api/users', { data: { email, password: 'Qa123456', age: 30 } });
    const login = await request.post('/api/auth/login', { data: { email, password: 'Qa123456' } });
    const { token } = await login.json();
    const other = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });

    const res = await other.delete(`/api/cart/${myItemId}`, { failOnStatusCode: false });
    await other.dispose();

    expect(res.status(), '남의 리소스는 404로 감춰야 한다').toBe(404);
    expect((await res.json()).error.code).toBe('CART_ITEM_NOT_FOUND');

    // 그리고 남의 장바구니가 실제로 훼손되지 않았는지까지 확인한다.
    // 상태코드만 맞고 데이터는 지워지는 경우가 실제로 있다.
    const stillThere = await (await shop.cart()).json();
    expect(stillThere.items, '거부됐다면 내 항목은 그대로 남아 있어야 한다').toHaveLength(1);
  });
});
