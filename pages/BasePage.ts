import type { Page, Locator } from '@playwright/test';

/**
 * 모든 페이지 객체의 공통 부모
 *
 * ── Page Object Model(POM)을 쓰는 이유 ────────────────────────────────────
 * 화면의 셀렉터를 테스트 코드에 직접 쓰면, 버튼 id 하나 바뀔 때 테스트 20개를
 * 전부 고쳐야 한다. 화면 조작을 클래스 안에 가둬두면 고칠 곳이 한 군데다.
 *
 * 규칙 하나만 지키면 된다:
 *   **페이지 객체는 검증(expect)하지 않는다.** 검증은 테스트가 한다.
 *   페이지 객체는 "무엇을 할 수 있는가"와 "무엇이 보이는가"만 제공한다.
 *
 * [TypeScript 메모]
 *   `protected readonly page: Page`
 *     protected = 자식 클래스에서만 접근 가능
 *     readonly   = 한 번 대입하면 못 바꿈
 *   생성자 매개변수에 이 키워드를 붙이면 `this.page = page` 를 자동으로 해준다.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** 상단 알림/오류 영역 */
  get message(): Locator {
    return this.page.getByTestId('message');
  }

  get whoami(): Locator {
    return this.page.getByTestId('whoami');
  }

  async gotoHash(hash: string): Promise<void> {
    await this.page.goto(`/#/${hash}`);
  }

  /** 헤더 네비게이션 이동 */
  async navigate(to: 'products' | 'cart' | 'orders'): Promise<void> {
    await this.page.getByTestId(`nav-${to}`).click();
  }
}
