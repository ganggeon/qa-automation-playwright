import { test, expect } from '../../fixtures/ui';
import { CREDENTIALS } from '../../test-data/minishop';

/**
 * 로그인 화면 (UI)
 *
 * API 테스트에서 이미 로그인 로직은 검증했다. UI 테스트가 추가로 확인할 것은
 * "화면이 그 결과를 사용자에게 제대로 보여주는가"다. 같은 걸 두 번 검증하면
 * 유지보수 비용만 두 배가 된다. 이것이 테스트 피라미드의 기본 사고방식이다.
 */

test.describe('로그인 화면', () => {
  test('TC-UI-LOGIN-001 | 올바른 계정으로 로그인하면 상품 목록으로 이동한다', async ({
    loginPage,
    productsPage,
    freshUser,
    page,
  }) => {
    await loginPage.open();
    await loginPage.login(freshUser.email, freshUser.password);

    await expect(page).toHaveURL(/#\/products$/);
    await expect(productsPage.rows.first()).toBeVisible();
    await expect(loginPage.whoami).toContainText(freshUser.email);
  });

  test('TC-UI-LOGIN-002 | 비밀번호가 틀리면 화면에 오류 메시지가 표시된다', async ({
    loginPage,
    freshUser,
    page,
  }) => {
    await loginPage.open();
    await loginPage.login(freshUser.email, 'WrongPw123');

    await expect(loginPage.message).toBeVisible();
    await expect(loginPage.message).toHaveText('S62 실습: 의도적으로 틀린 기대 문구');
    await expect(page, '실패 시 화면이 이동하면 안 된다').not.toHaveURL(/#\/products/);
  });

  test('TC-UI-LOGIN-003 | 잠긴 계정으로 로그인하면 잠금 안내가 표시된다', async ({ loginPage }) => {
    test.fail(true, 'BUG-004: 잠금 계정이 그대로 로그인되어 잠금 안내가 표시되지 않는다');

    await loginPage.open();
    await loginPage.login(CREDENTIALS.locked.email, CREDENTIALS.locked.password);

    await expect(loginPage.message).toBeVisible();
  });

  test('TC-UI-LOGIN-004 | 로그인하지 않고 장바구니에 접근하면 로그인 화면으로 돌아간다', async ({
    cartPage,
    loginPage,
    page,
  }) => {
    await page.goto('/#/cart');

    await expect(loginPage.loginButton, '비로그인 상태에서는 로그인 폼이 보여야 한다').toBeVisible();
    await expect(cartPage.orderButton).toHaveCount(0);
  });
});
