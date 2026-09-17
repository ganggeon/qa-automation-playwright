import { test, expect } from '../../fixtures/ui';
import { PRODUCT } from '../../test-data/minishop';

/**
 * 장바구니 담기 (UI)
 *
 * codegen 녹화본을 다듬어 만든 테스트.
 * 담기 로직 자체는 API 테스트에서 이미 검증했다(TC-API-CART-*).
 * 여기서 확인할 것은 "담은 결과를 화면이 사용자에게 제대로 보여주는가" 뿐이다.
 */
test.describe('장바구니 담기 화면', () => {
  // TC 번호 주의: `03-checkout.spec.ts:15` 가 이미 TC-UI-CART-001 을 쓰고 있다.
  // 번호가 겹치면 리포트에 "TC-UI-CART-001 실패"라고만 떠서 어느 쪽인지 알 수 없다
  // (결함 추적성이 깨진다). 그래서 이 테스트는 010 을 쓴다.
  test('TC-UI-CART-010 | 상품을 담으면 장바구니에 그 상품 1건이 표시된다', async ({
    loggedIn,
    productsPage,
    cartPage,
  }) => {
    // 준비 — loggedIn 픽스처가 계정 생성 + UI 로그인까지 끝낸 상태
    await productsPage.open();

    // 실행
    await productsPage.addToCart(PRODUCT.CART_ONLY.id, 1);
    await cartPage.open();

    // 단언 — "클릭이 에러 없이 끝났다"가 아니라 "그 상품이 담겼다"를 본다
    await expect(cartPage.rows, '담은 상품 1건만 있어야 한다').toHaveCount(1);
    await expect(cartPage.rows.first().getByTestId('cart-name')).toHaveText(PRODUCT.CART_ONLY.name);
  });
});
