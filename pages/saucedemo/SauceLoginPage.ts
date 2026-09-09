import type { Locator, Page } from '@playwright/test';

/**
 * SauceDemo 로그인 화면 (https://www.saucedemo.com)
 *
 * 이 사이트는 "여러 성격의 사용자"를 제공한다. 같은 화면인데 계정에 따라
 * 동작이 달라지므로, 계정 자체가 훌륭한 동등분할 클래스가 된다.
 */
export const SAUCE_USERS = {
  standard: 'standard_user',
  lockedOut: 'locked_out_user',
  problem: 'problem_user',
  performanceGlitch: 'performance_glitch_user',
} as const;

export const SAUCE_PASSWORD = 'secret_sauce';

export class SauceLoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.username = page.locator('#user-name');
    this.password = page.locator('#password');
    this.loginButton = page.locator('#login-button');
    this.error = page.locator('[data-test="error"]');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
    await this.loginButton.waitFor({ state: 'visible' });
  }

  async login(user: string, password: string = SAUCE_PASSWORD): Promise<void> {
    await this.username.fill(user);
    await this.password.fill(password);
    await this.loginButton.click();
  }
}
