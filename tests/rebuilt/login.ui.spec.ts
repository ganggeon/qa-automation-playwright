import { test, expect } from '../../fixtures/ui';

/**
 * 로그인 화면 — 재구현판 (docs/test-strategy.md 5절 추적표의 UI 2행)
 *
 * 로그인 규칙(401·423·실패 횟수)은 login.api.spec.ts에서 확인한다.
 * 여기서는 그 결과가 화면에 제대로 보이는지만 본다.
 * 계정은 API로 새로 만들고(freshUser), 로그인만 화면에서 한다.
 *
 * 명세(SPEC.md 4절)에 있는 것: 실패 시 오류 메시지 노출, 오류는 #message 영역(UI-03)
 * 명세에 없는 것: 오류 문구, 로그인 성공 후 이동할 화면 → 명세 확인 필요
 */

test.describe('로그인 화면', () => {
  test('TC-RB-LOGIN-UI-001 | FR-02-1 올바른 계정으로 로그인하면 로그인된 화면이 보인다', async ({
    loginPage,
    freshUser,
    page,
  }) => {
    await loginPage.open();
    await loginPage.login(freshUser.email, freshUser.password);

    // 명세에 없는 가정: 성공하면 상품 목록으로 이동하고 상단에 로그인한 이메일이 보인다.
    await expect(page).toHaveURL(/#\/products$/);
    await expect(loginPage.whoami).toContainText(freshUser.email);
  });

  test('TC-RB-LOGIN-UI-002 | FR-02-2 비밀번호가 틀리면 #message 영역에 오류 메시지가 보인다', async ({
    loginPage,
    freshUser,
    page,
  }) => {
    await loginPage.open();
    await loginPage.login(freshUser.email, 'WrongPw123');

    // 문구는 명세에 없으므로 고정하지 않는다. 보이는지, 비어 있지 않은지만 확인한다.
    await expect(loginPage.message).toBeVisible();
    await expect(loginPage.message).not.toBeEmpty();
    await expect(page, '실패하면 상품 화면으로 넘어가면 안 된다').not.toHaveURL(/#\/products/);
  });
});
