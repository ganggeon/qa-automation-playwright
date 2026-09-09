import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ProductsPage extends BasePage {
  readonly keyword: Locator;
  readonly searchButton: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    super(page);
    this.keyword = page.getByTestId('input-keyword');
    this.searchButton = page.getByTestId('btn-search');
    this.rows = page.getByTestId('product-row');
  }

  async open(): Promise<void> {
    await this.page.goto('/#/products');
    await this.rows.first().waitFor({ state: 'visible' });
  }

  /** 특정 상품의 행(row)을 반환한다. 이후 조작은 이 행 안에서만 한다. */
  row(productId: number): Locator {
    return this.page.locator(`[data-testid="product-row"][data-product-id="${productId}"]`);
  }

  /** 화면에 "보이는 그대로"의 상품명 목록. HTML 이스케이프 검증에 쓴다. */
  async displayedNames(): Promise<string[]> {
    return this.page.getByTestId('product-name').allTextContents();
  }

  async displayedName(productId: number): Promise<string> {
    return (await this.row(productId).getByTestId('product-name').textContent()) ?? '';
  }

  async displayedPrice(productId: number): Promise<string> {
    return (await this.row(productId).getByTestId('product-price').textContent()) ?? '';
  }

  async search(keyword: string): Promise<void> {
    await this.keyword.fill(keyword);
    await this.searchButton.click();
  }

  async addToCart(productId: number, qty: number): Promise<void> {
    const row = this.row(productId);
    await row.getByTestId('input-qty').fill(String(qty));
    await row.getByTestId('btn-add').click();
  }
}
