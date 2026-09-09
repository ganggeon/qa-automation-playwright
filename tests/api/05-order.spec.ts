import { test, expect } from '../../fixtures/minishop';
import { expectSchema } from '../../utils/schema';
import { orderSchema } from '../../test-data/schemas';
import { PRODUCT, COUPON, uniqueEmail } from '../../test-data/minishop';

/**
 * FR-09 주문 — POST /api/orders
 *
 * 적용 설계기법: 결정표 테스트(Decision Table Testing)
 *
 *   조건이 5개면 조합은 2^5 = 32가지다. 전부 테스트하면 낭비고,
 *   실제로는 앞 조건에서 걸리면 뒤 조건을 볼 필요가 없다(무관, "-").
 *   그래서 규칙 6개로 압축한 것이 아래 표다. 이게 결정표의 핵심 가치다.
 *
 *   | 조건                          | R1 | R2 | R3 | R4 | R5 | R6 |
 *   |-------------------------------|----|----|----|----|----|----|
 *   | 장바구니 비어있음              | Y  | N  | N  | N  | N  | N  |
 *   | 쿠폰 코드 입력됨               | -  | N  | Y  | Y  | Y  | Y  |
 *   | 쿠폰 존재함                    | -  | -  | N  | Y  | Y  | Y  |
 *   | 유효기간 내                    | -  | -  | -  | N  | Y  | Y  |
 *   | 주문금액 >= 최소주문금액        | -  | -  | -  | -  | N  | Y  |
 *   | 결과                          |400 |201 |404 |400 |400 |201 |
 */

test.describe('FR-09 주문 - 결정표', () => {
  test('TC-API-ORDER-R1 | 장바구니가 비어 있으면 400 EMPTY_CART', async ({ shop }) => {
    const res = await shop.order(null);

    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('EMPTY_CART');
  });

  test('TC-API-ORDER-R2 | 쿠폰 없이 주문하면 201, 정가로 결제된다', async ({ shop }) => {
    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    const res = await shop.order(null);

    expect(res.status()).toBe(201);
    const body = await res.json();
    expectSchema(orderSchema, body, '주문 응답');
    expect(body.totalPrice).toBe(PRODUCT.CHEAP.price);
    expect(body.discount).toBe(0);
    expect(body.finalPrice).toBe(PRODUCT.CHEAP.price);
  });

  test('TC-API-ORDER-R3 | 존재하지 않는 쿠폰이면 404 COUPON_NOT_FOUND', async ({ shop }) => {
    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    const res = await shop.order(COUPON.NOT_FOUND);

    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('COUPON_NOT_FOUND');
  });

  test('TC-API-ORDER-R4 | 만료된 쿠폰이면 400 COUPON_EXPIRED', async ({ shop }) => {
    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    const res = await shop.order(COUPON.EXPIRED);

    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('COUPON_EXPIRED');
  });

  test('TC-API-ORDER-R5 | 최소 주문금액 미달이면 400 COUPON_MIN_AMOUNT', async ({ shop }) => {
    // 14,000원 < 최소 주문금액 30,000원
    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    const res = await shop.order(COUPON.AMOUNT5000);

    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('COUPON_MIN_AMOUNT');
  });

  test('TC-API-ORDER-R6 | 모든 조건을 만족하면 201, 할인이 적용된다', async ({ shop }) => {
    // 14,000 × 3 = 42,000원 >= 30,000원
    await shop.addToCart(PRODUCT.CHEAP.id, 3);
    const res = await shop.order(COUPON.AMOUNT5000);

    expect(res.status()).toBe(201);
    const body = await res.json();
    expectSchema(orderSchema, body, '주문 응답');
    expect(body.totalPrice).toBe(PRODUCT.CHEAP.price * 3);
    expect(body.discount).toBe(5000);
    expect(body.finalPrice).toBe(PRODUCT.CHEAP.price * 3 - 5000);
  });
});

test.describe('FR-09 주문 - 금액 계산 경계', () => {
  test('TC-API-ORDER-001 | [경계값] 주문금액이 최소주문금액과 정확히 같으면 쿠폰이 적용된다', async ({ shop }) => {
    test.fail(true, 'BUG-011: 최소주문금액 비교를 초과(>)로 하여 정확히 같은 금액이 거부된다');

    // 30,000원 상품 1개 = 정확히 SAVE5000의 최소 주문금액
    await shop.addToCart(PRODUCT.EXACT_30000.id, 1);
    const res = await shop.order(COUPON.AMOUNT5000);

    expect(res.status(), '"이상(>=)" 조건이므로 적용되어야 한다').toBe(201);
    expect((await res.json()).finalPrice).toBe(25000);
  });

  test('TC-API-ORDER-002 | 정률 할인액은 원 단위로 절사되어 결제금액에 소수점이 남지 않는다', async ({ shop }) => {
    test.fail(true, 'BUG-012: 정률 할인액을 절사하지 않아 결제금액에 소수점이 남는다');

    // 2,345원 × 10% = 234.5원 → 절사하면 234원, 결제금액 2,111원
    await shop.addToCart(PRODUCT.ODD_PRICE.id, 1);
    const res = await shop.order(COUPON.RATE10);
    const body = await res.json();

    expect(Number.isInteger(body.discount), `할인액이 정수가 아님: ${body.discount}`).toBe(true);
    expect(Number.isInteger(body.finalPrice), `결제금액이 정수가 아님: ${body.finalPrice}`).toBe(true);
    expect(body.discount).toBe(234);
    expect(body.finalPrice).toBe(2111);
  });

  test('TC-API-ORDER-003 | 할인액이 주문금액보다 커도 결제금액은 0원 미만이 되지 않는다', async ({ shop }) => {
    // 2,345원 주문에 50,000원 할인 쿠폰
    await shop.addToCart(PRODUCT.ODD_PRICE.id, 1);
    const res = await shop.order(COUPON.AMOUNT50000);
    const body = await res.json();

    expect(body.finalPrice, `결제금액이 음수: ${body.finalPrice}`).toBeGreaterThanOrEqual(0);
    expect(body.finalPrice).toBe(0);

    // S47: 화면(finalPrice)만 막고 discount 를 그대로 두면 정산 집계가 틀린다.
    // 리포트의 「기대 결과」 표에 있던 칸이므로 확인 테스트도 이 칸을 덮어야 한다.
    expect(body.discount, `할인액이 주문금액을 초과: ${body.discount}`).toBe(2345);
  });
});

test.describe('FR-09 주문 - 재고 처리', () => {
  test('TC-API-ORDER-004 | 주문하면 재고가 주문 수량만큼 차감된다', async ({ shop }) => {
    // 절대값(20 → 18) 대신 변화량으로 검증한다.
    // 다른 테스트나 재실행으로 재고 절대값이 달라져도 흔들리지 않는다.
    const before = await shop.stockOf(PRODUCT.STOCK_CHECK.id);

    await shop.addToCart(PRODUCT.STOCK_CHECK.id, 2);
    expect((await shop.order(null)).status()).toBe(201);

    const after = await shop.stockOf(PRODUCT.STOCK_CHECK.id);
    expect(after, '재고는 주문 수량만큼만 줄어야 한다').toBe(before - 2);
  });

  test('TC-API-ORDER-005 | 재고가 부족하면 409이고 재고는 차감되지 않는다', async ({ shop }) => {
    test.fail(true, 'BUG-014: 주문 시 재고를 확인하지 않고 차감하여 재고가 음수가 된다');

    const before = await shop.stockOf(PRODUCT.LOW_STOCK.id);
    await shop.addToCart(PRODUCT.LOW_STOCK.id, before + 6); // 재고보다 확실히 많이

    const res = await shop.order(null);

    // [알려진 결함 마킹 강화] 상태코드만 보면, 담기 단계가 먼저 고쳐졌을 때
    // "장바구니가 비어 400"이 나도 이 테스트는 여전히 '결함 재현'으로 집계된다.
    // 주문 단계의 재고 검증에 실제로 도달했는지 사유까지 확인한다.
    expect(res.status(), '재고 부족 주문은 409여야 한다').toBe(409);
    expect((await res.json()).error.code, '거부 사유가 재고 부족이어야 한다').toBe('OUT_OF_STOCK');
    expect(await shop.stockOf(PRODUCT.LOW_STOCK.id), '실패한 주문은 재고를 건드리면 안 된다').toBe(before);
  });

  test('TC-API-ORDER-006 | [데이터 무결성] 어떤 주문을 해도 재고는 음수가 되지 않는다', async ({ shop }) => {
    test.fail(true, 'BUG-014: 재고 미확인 차감으로 재고가 음수로 저장된다');

    const before = await shop.stockOf(PRODUCT.NEGATIVE_CHECK.id);
    await shop.addToCart(PRODUCT.NEGATIVE_CHECK.id, before + 10);
    await shop.order(null);

    const after = await shop.stockOf(PRODUCT.NEGATIVE_CHECK.id);
    expect(after, `주문 후 재고가 음수(${after})가 되었다`).toBeGreaterThanOrEqual(0);
  });
});

test.describe('FR-09/FR-10 주문 후처리', () => {
  test('TC-API-ORDER-007 | 주문이 완료되면 장바구니가 비워진다', async ({ shop }) => {
    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    await shop.order(null);

    const cart = await (await shop.cart()).json();
    expect(cart.items).toEqual([]);
    expect(cart.totalPrice).toBe(0);
  });

  test('TC-API-ORDER-008 | 주문 내역에는 본인 주문만 최신순으로 조회된다', async ({ shop }) => {
    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    const first = await (await shop.order(null)).json();
    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    const second = await (await shop.order(null)).json();

    const list = await (await shop.orders()).json();

    expect(list).toHaveLength(2);
    expect(list[0].orderId, '최신 주문이 앞에 와야 한다').toBe(second.orderId);
    expect(list[1].orderId).toBe(first.orderId);
  });

  test('TC-API-ORDER-009 | 토큰 없이 주문하면 401을 반환한다', async ({ request }) => {
    const res = await request.post('/api/orders', { data: { couponCode: null }, failOnStatusCode: false });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  test('TC-API-ORDER-010 | 토큰 없이 주문내역을 조회하면 401을 반환한다', async ({ request }) => {
    const res = await request.get('/api/orders', { failOnStatusCode: false });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  test('TC-API-ORDER-011 | [FR-10] 다른 회원의 주문은 내 주문내역에 보이지 않는다', async ({
    shop,
    playwright,
    baseURL,
    request,
  }) => {
    // TC-API-ORDER-008 은 "내 주문 2건이 최신순인가"만 본다. 그것만으로는
    // 서버가 userId로 걸러내는지 증명되지 않는다 — 내 주문만 있는 상태에서는
    // 필터가 없어도 똑같은 결과가 나오기 때문이다.
    // 그래서 **다른 회원의 주문이 존재하는 상태**를 일부러 만들고 검증한다.
    const email = uniqueEmail('otherorder');
    await request.post('/api/users', { data: { email, password: 'Qa123456', age: 30 } });
    const login = await request.post('/api/auth/login', { data: { email, password: 'Qa123456' } });
    const { token } = await login.json();
    const other = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });

    await other.post('/api/cart', { data: { productId: PRODUCT.CHEAP.id, qty: 1 } });
    const theirOrder = await (await other.post('/api/orders', { data: { couponCode: null } })).json();
    await other.dispose();

    await shop.addToCart(PRODUCT.CHEAP.id, 1);
    const myOrder = await (await shop.order(null)).json();

    const list = await (await shop.orders()).json();
    const ids = list.map((o: { orderId: number }) => o.orderId);

    expect(ids, '내 주문은 보여야 한다').toContain(myOrder.orderId);
    expect(ids, '다른 회원의 주문이 섞이면 안 된다').not.toContain(theirOrder.orderId);
    expect(list, '내 주문만 있어야 한다').toHaveLength(1);
  });
});
