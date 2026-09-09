import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly email: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    super(page);
    // 로케이터는 "찾는 방법"만 담은 지연 객체다. 여기서 실제로 DOM을 찾지 않는다.
    // 그래서 생성자에서 미리 만들어둬도 안전하다.
    this.email = page.getByTestId('input-email');
    this.password = page.getByTestId('input-password');
    this.loginButton = page.getByTestId('btn-login');
  }

  async open(): Promise<void> {
    await this.page.goto('/#/login');
    await this.loginButton.waitFor({ state: 'visible' });
  }

  async login(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.loginButton.click();
  }
}
