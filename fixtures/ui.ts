import { test as minishopTest, expect } from './minishop';
import { LoginPage } from '../pages/LoginPage';
import { ProductsPage } from '../pages/ProductsPage';
import { CartPage } from '../pages/CartPage';
import { OrdersPage } from '../pages/OrdersPage';

/**
 * UI 테스트용 픽스처
 *
 * minishop 픽스처(freshUser/token/shop)를 그대로 물려받고 페이지 객체를 추가한다.
 * minishop의 테스트별 계정 격리를 UI 테스트에서도 그대로 재사용한다.
 *
 * `loggedIn` 픽스처는 **UI로 실제 로그인**한다.
 *   API로 토큰만 심어넣으면 빠르지만, 그러면 로그인 화면은 아무도 안 밟는다.
 *   여기서는 로그인 화면도 매번 거치도록 실제 로그인 경로를 쓴다.
 *   (테스트 수가 늘어 실행 시간이 문제가 되면 storageState 재사용으로 전환한다)
 */
type UiFixtures = {
  loginPage: LoginPage;
  productsPage: ProductsPage;
  cartPage: CartPage;
  ordersPage: OrdersPage;
  /** 새 계정으로 UI 로그인까지 마친 상태 */
  loggedIn: void;
};

export const test = minishopTest.extend<UiFixtures>({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  productsPage: async ({ page }, use) => { await use(new ProductsPage(page)); },
  cartPage: async ({ page }, use) => { await use(new CartPage(page)); },
  ordersPage: async ({ page }, use) => { await use(new OrdersPage(page)); },

  loggedIn: async ({ loginPage, freshUser, page }, use) => {
    await loginPage.open();
    await loginPage.login(freshUser.email, freshUser.password);
    await expect(page.getByTestId('whoami')).toContainText(freshUser.email);
    await use();
  },
});

export { expect };
