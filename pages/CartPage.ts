import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class CartPage extends BasePage {
  readonly rows: Locator;
  readonly total: Locator;
  readonly coupon: Locator;
  readonly orderButton: Locator;
  readonly empty: Locator;

  constructor(page: Page) {
    super(page);
    this.rows = page.getByTestId('cart-row');
    this.total = page.getByTestId('cart-total');
    this.coupon = page.getByTestId('input-coupon');
    this.orderButton = page.getByTestId('btn-order');
    this.empty = page.getByTestId('cart-empty');
  }

  async open(): Promise<void> {
    await this.page.goto('/#/cart');
    await this.orderButton.waitFor({ state: 'visible' });
  }

  async itemCount(): Promise<number> {
    return this.rows.count();
  }

  /** 화면에 표시된 총액 문자열 (예: "45,000원") */
  async totalText(): Promise<string> {
    return (await this.total.textContent()) ?? '';
  }

  /** 표시된 총액에서 숫자만 뽑아낸다. "45,000원" → 45000 */
  async totalAmount(): Promise<number> {
    return Number((await this.totalText()).replace(/[^0-9-]/g, ''));
  }

  async order(couponCode?: string): Promise<void> {
    if (couponCode) await this.coupon.fill(couponCode);
    await this.orderButton.click();
  }

  async removeFirst(): Promise<void> {
    await this.rows.first().getByTestId('btn-remove').click();
  }
}
