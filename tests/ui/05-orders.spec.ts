import { test, expect } from '../../fixtures/ui';
import { PRODUCT } from '../../test-data/minishop';

/**
 * 주문내역 E2E — `OrdersPage` 를 쓰는 테스트 1건
 *
 * 담기 → 주문 → **주문내역에 제대로 쌓였는가**까지가 한 건의 흐름이다.
 * 03-checkout.spec.ts 의 E2E-001 은 주문내역을 `page.getByTestId('order-row')` 로
 * 직접 뒤졌다(테스트 안에 셀렉터가 박혀 있다). 여기서는 그 부분을 전부
 * `OrdersPage` 에 맡긴다 — 화면이 바뀌면 고칠 곳이 페이지 객체 한 군데다.
 *
 * `ordersPage` 는 `fixtures/ui.ts` 픽스처에서 받는다(테스트 안에서 직접 생성하지 않음).
 */

test.describe('주문내역 화면', () => {
  test.beforeEach(async ({ loggedIn }) => {});

  test('TC-UI-E2E-004 | 주문하면 주문내역 맨 위에 금액이 그대로 쌓인다', async ({
    productsPage,
    cartPage,
    ordersPage,
  }) => {
    const expected = PRODUCT.UI_ORDER.price * 2;
    const won = (n: number) => n.toLocaleString('ko-KR') + '원';

    await test.step('주문 전에는 주문내역이 비어 있다', async () => {
      await ordersPage.open();
      await expect(ordersPage.rows).toHaveCount(0);
      await expect(ordersPage.empty).toBeVisible();
    });

    await test.step('상품을 담아 주문한다', async () => {
      await productsPage.open();
      await productsPage.addToCart(PRODUCT.UI_ORDER.id, 2);
      await cartPage.open();
      expect(await cartPage.totalAmount()).toBe(expected);

      await cartPage.order();
      await expect(cartPage.message).toContainText('주문이 완료되었습니다.');
    });

    await test.step('주문내역 맨 위에 방금 주문 1건이 보인다', async () => {
      await ordersPage.open();
      await expect(ordersPage.rows).toHaveCount(1);
      await expect(ordersPage.empty).toHaveCount(0);
    });

    await test.step('금액 3열이 장바구니에서 본 금액과 일치한다', async () => {
      const latest = ordersPage.latest;

      await expect(ordersPage.cell(latest, 'total')).toHaveText(won(expected));
      await expect(ordersPage.cell(latest, 'discount')).toHaveText(won(0));
      await expect(ordersPage.cell(latest, 'final')).toHaveText(won(expected));
    });

    await test.step('주문번호가 비어 있지 않다', async () => {
      const orderId = await ordersPage.cellText(ordersPage.latest, 'id');
      expect(orderId.trim(), '주문번호가 표시되어야 한다').not.toBe('');

      // 뽑아낸 주문번호로 다시 그 행을 찾을 수 있어야 한다 (row() 동작 확인)
      await expect(ordersPage.row(orderId.trim())).toHaveCount(1);
    });
  });
});
