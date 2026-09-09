import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 주문내역 화면 (`#/orders`)
 *
 * ── 이 파일이 지키는 규칙 (BasePage 주석과 같은 규칙) ──────────────────────
 *   페이지 객체는 **검증(expect)하지 않는다.** "무엇을 할 수 있는가"와
 *   "무엇이 보이는가"만 제공하고, 판단은 테스트가 한다.
 *
 * ── 왜 텍스트(string)가 아니라 Locator 를 돌려주는 메서드가 따로 있는가 ────
 *   `cellText()` 처럼 문자열을 돌려주면 그 순간의 값을 **사진 찍는 것**이라
 *   자동 재시도가 없다. 화면이 아직 안 그려졌으면 그냥 빈 문자열이 잡힌다.
 *   반면 `cell()` 이 돌려주는 Locator 를 `expect(...).toHaveText()` 에 넣으면
 *   Playwright 가 조건이 맞을 때까지 다시 확인한다.
 *   → **기본은 `cell()`(Locator), 숫자 계산이 꼭 필요할 때만 `cellAmount()`.**
 *
 * [TypeScript 메모]
 *   `cell: OrderCell` 의 `OrderCell` 은 **유니온 타입**이다(아래 정의).
 *   'id' | 'total' | 'discount' | 'final' 네 글자만 허용하겠다는 뜻이고,
 *   오타를 내면 실행 전에 에디터가 잡아준다. BasePage 의
 *   `navigate(to: 'products' | 'cart' | 'orders')` 와 같은 방식이다.
 */

/** 주문내역 표의 열 이름. `data-testid="order-<이름>"` 과 1:1로 맞춰 둔다. */
export type OrderCell = 'id' | 'total' | 'discount' | 'final';

export class OrdersPage extends BasePage {
  /** 주문 한 건 = 표의 한 행 */
  readonly rows: Locator;
  /** 표 본문(tbody). 주문이 0건이어도 항상 존재한다. */
  readonly body: Locator;
  /** 주문이 없을 때 나오는 "주문 내역이 없습니다." 칸 */
  readonly empty: Locator;

  constructor(page: Page) {
    super(page);
    this.rows = page.getByTestId('order-row');
    this.body = page.getByTestId('order-rows');
    this.empty = page.getByTestId('order-empty');
  }

  /**
   * 주문내역 화면을 연다.
   *
   * ⚠ 여기서 `rows.first()` 를 기다리면 안 된다.
   *   ProductsPage.open() 은 상품이 항상 있으니 첫 행을 기다려도 되지만,
   *   주문내역은 **0건일 수 있다.** 첫 행을 기다리면 "주문이 없다"를 확인하는
   *   테스트가 타임아웃으로 죽는다. 그래서 항상 그려지는 tbody 를 기다린다.
   */
  async open(): Promise<void> {
    await this.page.goto('/#/orders');
    await this.body.waitFor({ state: 'visible' });
  }

  /** 화면에 보이는 주문 건수 */
  async count(): Promise<number> {
    return this.rows.count();
  }

  /** 맨 위 행 = 가장 최근 주문 */
  get latest(): Locator {
    return this.rows.first();
  }

  /** 주문번호로 행을 찾는다. 이후 조작·확인은 이 행 안에서만 한다. */
  row(orderId: string): Locator {
    const idCell = this.page
      .getByTestId('order-id')
      .filter({ hasText: new RegExp(`^${orderId}$`) });
    return this.rows.filter({ has: idCell });
  }

  /**
   * 한 행에서 열 하나를 집어낸다. **단언에 그대로 넣어 쓰는 것이 기본형.**
   *   await expect(ordersPage.cell(ordersPage.latest, 'final')).toHaveText('31,000원');
   */
  cell(row: Locator, cell: OrderCell): Locator {
    return row.getByTestId(`order-${cell}`);
  }

  /** 열의 화면 표시값 그대로. 예: "31,000원" */
  async cellText(row: Locator, cell: OrderCell): Promise<string> {
    return (await this.cell(row, cell).textContent()) ?? '';
  }

  /**
   * 열에서 숫자만 뽑는다. "31,000원" → 31000
   * (CartPage.totalAmount() 와 같은 방식. `-` 를 남겨 둬야 음수 노출 결함을 잡을 수 있다.)
   */
  async cellAmount(row: Locator, cell: OrderCell): Promise<number> {
    return Number((await this.cellText(row, cell)).replace(/[^0-9-]/g, ''));
  }

  /** 화면에 보이는 주문번호 목록(위에서부터) */
  async orderIds(): Promise<string[]> {
    return this.page.getByTestId('order-id').allTextContents();
  }
}
