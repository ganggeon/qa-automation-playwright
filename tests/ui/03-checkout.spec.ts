import { test, expect } from '../../fixtures/ui';
import { PRODUCT, COUPON } from '../../test-data/minishop';

/**
 * 장바구니 · 주문 (UI E2E)
 *
 * 여기서만 "사용자가 실제로 밟는 전체 흐름"을 검증한다.
 * E2E는 느리고 잘 깨지므로 많이 만들지 않는다. 핵심 매출 경로 1~2개면 충분하고,
 * 나머지 경우의 수는 앞서 만든 API 테스트가 훨씬 싸게 커버한다.
 */

test.describe('장바구니 화면', () => {
  test.beforeEach(async ({ loggedIn }) => {});

  test('TC-UI-CART-001 | 담은 상품이 장바구니에 표시되고 총액이 소계의 합과 같다', async ({
    productsPage,
    cartPage,
  }) => {
    await productsPage.open();
    await productsPage.addToCart(PRODUCT.UI_ORDER.id, 3);
    await cartPage.open();

    await expect(cartPage.rows).toHaveCount(1);
    await expect(cartPage.rows.first().getByTestId('cart-qty')).toHaveText('3');
    await expect(cartPage.total).toHaveText(
      (PRODUCT.UI_ORDER.price * 3).toLocaleString('ko-KR') + '원'
    );
  });

  test('TC-UI-CART-002 | 장바구니에서 삭제하면 목록에서 사라진다', async ({
    productsPage,
    cartPage,
  }) => {
    await productsPage.open();
    await productsPage.addToCart(PRODUCT.UI_ORDER.id, 1);
    await cartPage.open();
    await expect(cartPage.rows).toHaveCount(1);

    await cartPage.removeFirst();

    await expect(cartPage.rows).toHaveCount(0);
    await expect(cartPage.empty).toBeVisible();
    await expect(cartPage.total).toHaveText('0원');
  });

  test('TC-UI-CART-003 | 빈 장바구니에서 주문하면 오류 메시지가 표시된다', async ({ cartPage }) => {
    await cartPage.open();
    await cartPage.order();

    await expect(cartPage.message).toHaveText('장바구니가 비어 있습니다.');
    await expect(cartPage.message).toHaveClass(/error/);
  });
});

test.describe('주문 E2E', () => {
  test.beforeEach(async ({ loggedIn }) => {});

  test('TC-UI-E2E-001 | 로그인 → 담기 → 주문 → 주문내역까지 정상 처리된다', async ({
    productsPage,
    cartPage,
    page,
  }) => {
    await test.step('상품을 장바구니에 담는다', async () => {
      await productsPage.open();
      await productsPage.addToCart(PRODUCT.UI_ORDER.id, 2);
      await expect(productsPage.message).toHaveText('장바구니에 담았습니다.');
    });

    await test.step('장바구니 금액을 확인한다', async () => {
      await cartPage.open();
      expect(await cartPage.totalAmount()).toBe(PRODUCT.UI_ORDER.price * 2);
    });

    await test.step('주문한다', async () => {
      await cartPage.order();
      await expect(cartPage.message).toContainText('주문이 완료되었습니다.');
      await expect(cartPage.message).toHaveClass(/ok/);
    });

    await test.step('장바구니가 비워진다', async () => {
      await expect(cartPage.rows).toHaveCount(0);
    });

    await test.step('주문내역에 방금 주문이 보인다', async () => {
      await cartPage.navigate('orders');
      const rows = page.getByTestId('order-row');
      await expect(rows).toHaveCount(1);
      await expect(rows.first().getByTestId('order-final')).toHaveText(
        (PRODUCT.UI_ORDER.price * 2).toLocaleString('ko-KR') + '원'
      );
    });
  });

  test('TC-UI-E2E-002 | 쿠폰을 적용하면 할인된 금액으로 결제된다', async ({
    productsPage,
    cartPage,
  }) => {
    await productsPage.open();
    await productsPage.addToCart(PRODUCT.UI_COUPON.id, 1); // 36,000원
    await cartPage.open();

    await cartPage.order(COUPON.AMOUNT5000); // 5,000원 할인

    await expect(cartPage.message).toContainText('31,000원');
  });

  test('TC-UI-E2E-003 | 할인액이 주문금액보다 커도 음수 금액이 화면에 노출되지 않는다', async ({
    productsPage,
    cartPage,
  }) => {
    await productsPage.open();
    await productsPage.addToCart(PRODUCT.ODD_PRICE.id, 1); // 2,345원
    await cartPage.open();

    await cartPage.order(COUPON.AMOUNT50000); // 50,000원 할인

    // 주문 '성공' 메시지가 그려질 때까지 기다린다 — 문지기가 없으면 빈 문자열을 읽고
    // not.toMatch 가 무조건 통과해 "검증하지 않는 단언" 이 된다.
    // ⚠ '원' 으로 기다리면 안 된다: 실패 응답에도 '원' 이 들어 있어 주문이 실패해도
    //    문지기를 통과한다. 예를 들어 SAVE5000(minAmount 30,000) 경로의 실패 응답은
    //    `최소 주문금액 30000원 이상이어야 합니다.`(server.js:280) 이다 — 서버가
    //    `${c.minAmount}원` 템플릿을 쓰므로 콤마가 없다.
    //    ※ 이 테스트가 쓰는 BIG50000 은 minAmount 가 0 이라 그 분기로는 빠지지 않는다.
    //       '원' 이 성공 판별에 쓸 수 없는 문자열이라는 예시로 든 것이다.
    //    성공 메시지에만 있는 '결제금액' 으로 잠근다.
    await expect(cartPage.message).toContainText('결제금액');

    const text = (await cartPage.message.textContent()) ?? '';
    expect(text, `화면에 음수 금액이 노출됨: "${text}"`).not.toMatch(/-[\d,]+원/);
  });
});
