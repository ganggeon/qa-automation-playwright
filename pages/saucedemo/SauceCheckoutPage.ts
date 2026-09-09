import type { Locator, Page } from '@playwright/test';

/** 장바구니 → 배송정보 입력 → 확인 → 완료 까지의 화면들 */
export class SauceCheckoutPage {
  readonly cartItems: Locator;
  readonly checkoutButton: Locator;
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly postalCode: Locator;
  readonly continueButton: Locator;
  readonly finishButton: Locator;
  readonly completeHeader: Locator;
  readonly itemTotal: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.cartItems = page.locator('.cart_item');
    this.checkoutButton = page.locator('[data-test="checkout"]');
    this.firstName = page.locator('#first-name');
    this.lastName = page.locator('#last-name');
    this.postalCode = page.locator('#postal-code');
    this.continueButton = page.locator('#continue');
    this.finishButton = page.locator('#finish');
    this.completeHeader = page.locator('.complete-header');
    this.itemTotal = page.locator('.summary_subtotal_label');
    this.error = page.locator('[data-test="error"]');
  }

  async startCheckout(): Promise<void> {
    await this.checkoutButton.click();
  }

  async fillShipping(first: string, last: string, zip: string): Promise<void> {
    await this.firstName.fill(first);
    await this.lastName.fill(last);
    await this.postalCode.fill(zip);
    await this.continueButton.click();
  }

  /** "Item total: $29.99" → 29.99 */
  async subtotal(): Promise<number> {
    const text = (await this.itemTotal.textContent()) ?? '';
    return Number(text.replace(/[^0-9.]/g, ''));
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }
}
