import { test, expect } from '@playwright/test';
import { SauceLoginPage, SAUCE_USERS, SAUCE_PASSWORD } from '../../../pages/saucedemo/SauceLoginPage';
import { SauceInventoryPage } from '../../../pages/saucedemo/SauceInventoryPage';
import { SauceCheckoutPage } from '../../../pages/saucedemo/SauceCheckoutPage';

/**
 * 외부 공개 데모 사이트 — SauceDemo (https://www.saucedemo.com)
 *
 * 실제 서비스 형태의 쇼핑몰 UI를 대상으로 한 E2E 자동화.
 * 이 사이트는 QA 연습용으로 "성격이 다른 계정"을 제공한다.
 *   standard_user             : 정상
 *   locked_out_user           : 잠금 계정
 *   problem_user              : UI가 고장난 사용자 (이미지 깨짐 등)
 *   performance_glitch_user   : 응답이 느린 사용자
 *
 * 적용 설계기법
 *   · 동등분할  : 계정 유형별 로그인 결과
 *   · 정렬 검증 : 표시 순서를 "코드로 정렬한 결과"와 비교
 */

test.describe('SauceDemo — 로그인', () => {
  const loginCases = [
    { tc: 'TC-SD-LOGIN-001', user: SAUCE_USERS.standard, pw: SAUCE_PASSWORD, ok: true, cls: '정상 계정' },
    { tc: 'TC-SD-LOGIN-002', user: SAUCE_USERS.standard, pw: 'wrong_pw', ok: false, cls: '비밀번호 불일치' },
    { tc: 'TC-SD-LOGIN-003', user: SAUCE_USERS.lockedOut, pw: SAUCE_PASSWORD, ok: false, cls: '잠금 계정' },
    { tc: 'TC-SD-LOGIN-004', user: '', pw: SAUCE_PASSWORD, ok: false, cls: '아이디 미입력' },
  ];

  for (const c of loginCases) {
    test(`${c.tc} | [동등분할] ${c.cls} → ${c.ok ? '로그인 성공' : '오류 표시'}`, async ({ page }) => {
      const login = new SauceLoginPage(page);
      await login.open();
      await login.login(c.user, c.pw);

      if (c.ok) {
        await expect(page).toHaveURL(/inventory\.html/);
        await expect(new SauceInventoryPage(page).items.first()).toBeVisible();
      } else {
        await expect(login.error).toBeVisible();
        await expect(page).not.toHaveURL(/inventory\.html/);
      }
    });
  }

  test('TC-SD-LOGIN-005 | 잠금 계정은 잠금 사유를 명확히 안내한다', async ({ page }) => {
    const login = new SauceLoginPage(page);
    await login.open();
    await login.login(SAUCE_USERS.lockedOut);

    await expect(login.error).toContainText('locked out');
  });
});

test.describe('SauceDemo — 상품 목록', () => {
  test.beforeEach(async ({ page }) => {
    const login = new SauceLoginPage(page);
    await login.open();
    await login.login(SAUCE_USERS.standard);
    await new SauceInventoryPage(page).waitLoaded();
  });

  test('TC-SD-PROD-001 | 상품이 6건 표시되고 모든 상품에 가격이 있다', async ({ page }) => {
    const inventory = new SauceInventoryPage(page);

    await expect(inventory.items).toHaveCount(6);
    const prices = await inventory.productPrices();
    expect(prices).toHaveLength(6);
    for (const p of prices) {
      expect(p, '가격은 0보다 커야 한다').toBeGreaterThan(0);
    }
  });

  test('TC-SD-PROD-002 | 이름 오름차순(A to Z) 정렬이 올바르다', async ({ page }) => {
    const inventory = new SauceInventoryPage(page);
    await inventory.sortBy('az');

    const names = await inventory.productNames();
    // 화면 결과를 "정답"으로 삼지 않는다. 코드로 직접 정렬해서 비교한다.
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test('TC-SD-PROD-003 | 가격 낮은순 정렬이 올바르다', async ({ page }) => {
    const inventory = new SauceInventoryPage(page);
    await inventory.sortBy('lohi');

    const prices = await inventory.productPrices();
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test('TC-SD-PROD-004 | 가격 높은순 정렬이 올바르다', async ({ page }) => {
    const inventory = new SauceInventoryPage(page);
    await inventory.sortBy('hilo');

    const prices = await inventory.productPrices();
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  test('TC-SD-CART-001 | 상품을 담으면 장바구니 배지 숫자가 증가한다', async ({ page }) => {
    const inventory = new SauceInventoryPage(page);

    await expect(inventory.cartBadge, '초기에는 배지가 없어야 한다').toHaveCount(0);

    await inventory.addToCart('Sauce Labs Backpack');
    await expect(inventory.cartBadge).toHaveText('1');

    await inventory.addToCart('Sauce Labs Bike Light');
    await expect(inventory.cartBadge).toHaveText('2');
  });
});

test.describe('SauceDemo — 주문 E2E', () => {
  test('TC-SD-E2E-001 | 로그인부터 주문 완료까지 전 과정이 정상 처리된다', async ({ page }) => {
    const login = new SauceLoginPage(page);
    const inventory = new SauceInventoryPage(page);
    const checkout = new SauceCheckoutPage(page);

    await test.step('정상 계정으로 로그인한다', async () => {
      await login.open();
      await login.login(SAUCE_USERS.standard);
      await inventory.waitLoaded();
    });

    await test.step('상품 2건을 담는다', async () => {
      await inventory.addToCart('Sauce Labs Backpack');
      await inventory.addToCart('Sauce Labs Fleece Jacket');
      await expect(inventory.cartBadge).toHaveText('2');
    });

    await test.step('장바구니에 2건이 담겨 있다', async () => {
      await inventory.openCart();
      await expect(checkout.cartItems).toHaveCount(2);
    });

    await test.step('배송 정보를 입력한다', async () => {
      await checkout.startCheckout();
      await checkout.fillShipping('길동', '홍', '06236');
    });

    await test.step('합계 금액이 담은 상품 가격의 합과 같다', async () => {
      // Backpack $29.99 + Fleece Jacket $49.99 = $79.98
      expect(await checkout.subtotal()).toBeCloseTo(79.98, 2);
    });

    await test.step('주문을 완료한다', async () => {
      await checkout.finish();
      await expect(checkout.completeHeader).toHaveText(/Thank you for your order/i);
    });
  });

  test('TC-SD-E2E-002 | 배송 정보를 비우고 진행하면 오류가 표시된다', async ({ page }) => {
    const login = new SauceLoginPage(page);
    const inventory = new SauceInventoryPage(page);
    const checkout = new SauceCheckoutPage(page);

    await login.open();
    await login.login(SAUCE_USERS.standard);
    await inventory.waitLoaded();
    await inventory.addToCart('Sauce Labs Backpack');
    await inventory.openCart();
    await checkout.startCheckout();

    await checkout.continueButton.click(); // 아무것도 입력하지 않고 진행

    await expect(checkout.error).toBeVisible();
    await expect(checkout.error).toContainText('First Name is required');
  });
});
