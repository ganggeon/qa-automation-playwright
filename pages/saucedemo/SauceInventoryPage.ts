import type { Locator, Page } from '@playwright/test';

export class SauceInventoryPage {
  readonly items: Locator;
  readonly names: Locator;
  readonly prices: Locator;
  readonly sortSelect: Locator;
  readonly cartLink: Locator;
  readonly cartBadge: Locator;

  constructor(private readonly page: Page) {
    this.items = page.locator('.inventory_item');
    this.names = page.locator('.inventory_item_name');
    this.prices = page.locator('.inventory_item_price');
    this.sortSelect = page.locator('[data-test="product-sort-container"]');
    this.cartLink = page.locator('.shopping_cart_link');
    this.cartBadge = page.locator('.shopping_cart_badge');
  }

  async waitLoaded(): Promise<void> {
    await this.items.first().waitFor({ state: 'visible' });
  }

  async productNames(): Promise<string[]> {
    return this.names.allTextContents();
  }

  /** "$29.99" 같은 표시 금액을 숫자로 바꿔서 반환한다 */
  async productPrices(): Promise<number[]> {
    const texts = await this.prices.allTextContents();
    return texts.map((t) => Number(t.replace('$', '')));
  }

  async sortBy(value: 'az' | 'za' | 'lohi' | 'hilo'): Promise<void> {
    await this.sortSelect.selectOption(value);
  }

  /** 상품명으로 장바구니에 담는다. 상품 카드 안에서만 버튼을 찾는다. */
  async addToCart(productName: string): Promise<void> {
    await this.items
      .filter({ hasText: productName })
      .locator('button', { hasText: 'Add to cart' })
      .click();
  }

  async openCart(): Promise<void> {
    await this.cartLink.click();
  }
}
