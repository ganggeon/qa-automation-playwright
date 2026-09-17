import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { uniqueEmail } from '../test-data/minishop';

/**
 * MiniShop 전용 테스트 픽스처(Fixture)
 *
 * ── 이 파일이 해결하는 문제 ────────────────────────────────────────────────
 * 테스트는 서로 영향을 주면 안 된다(Test Isolation). 그런데 SUT는 메모리에
 * 상태를 들고 있어서, A 테스트가 장바구니에 담아두면 B 테스트가 영향을 받는다.
 *
 * 흔한 해결책인 "매 테스트 전에 서버 전체 초기화"는 병렬 실행과 충돌한다.
 * (내가 초기화하는 순간 옆 워커의 테스트가 죽는다)
 *
 * 그래서 여기서는 **테스트마다 새 계정을 만든다**. 장바구니/주문은 계정별로
 * 분리돼 있으므로 이것만으로 격리가 성립하고, 병렬 실행도 안전하다.
 * 전역 상태(상품 재고)에 의존하는 검증은 "절대값" 대신 "변화량"으로 확인한다.
 */

export type TestUser = {
  id: number;
  email: string;
  password: string;
};

export type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
};

/**
 * 서비스 객체(Service Object) — API판 Page Object.
 * 테스트 코드가 URL/헤더/본문 형태를 직접 알지 않도록 감싼다.
 * API 경로가 바뀌면 이 파일 한 곳만 고치면 된다.
 */
export class ShopApi {
  constructor(private readonly ctx: APIRequestContext) {}

  products(query: Record<string, string | number> = {}) {
    return this.ctx.get('/api/products', { params: query, failOnStatusCode: false });
  }

  product(id: number | string) {
    return this.ctx.get(`/api/products/${id}`, { failOnStatusCode: false });
  }

  addToCart(productId: number, qty: number) {
    return this.ctx.post('/api/cart', { data: { productId, qty }, failOnStatusCode: false });
  }

  cart() {
    return this.ctx.get('/api/cart', { failOnStatusCode: false });
  }

  removeFromCart(itemId: number | string) {
    return this.ctx.delete(`/api/cart/${itemId}`, { failOnStatusCode: false });
  }

  order(couponCode: string | null = null) {
    return this.ctx.post('/api/orders', { data: { couponCode }, failOnStatusCode: false });
  }

  orders() {
    return this.ctx.get('/api/orders', { failOnStatusCode: false });
  }

  logout() {
    return this.ctx.post('/api/auth/logout', { failOnStatusCode: false });
  }

  /** 재고 변화량 검증용 — 특정 상품의 현재 재고를 읽는다. */
  async stockOf(productId: number): Promise<number> {
    const res = await this.product(productId);
    const body = (await res.json()) as Product;
    return body.stock;
  }
}

type MiniShopFixtures = {
  /** 이 테스트만 쓰는 새 계정. 다른 테스트와 절대 겹치지 않는다. */
  freshUser: TestUser;
  /** freshUser로 로그인된 토큰 */
  token: string;
  /** 인증 헤더가 붙은 API 컨텍스트 */
  authedApi: APIRequestContext;
  /** 인증된 서비스 객체 */
  shop: ShopApi;
};

export const test = base.extend<MiniShopFixtures>({
  freshUser: async ({ request }, use) => {
    const email = uniqueEmail('fixture');
    const password = 'Qa123456';
    const res = await request.post('/api/users', {
      data: { email, password, age: 30 },
      failOnStatusCode: false,
    });
    expect(res.status(), `테스트 계정 생성 실패: ${await res.text()}`).toBe(201);
    const body = await res.json();
    await use({ id: body.id, email, password });
  },

  token: async ({ request, freshUser }, use) => {
    const res = await request.post('/api/auth/login', {
      data: { email: freshUser.email, password: freshUser.password },
      failOnStatusCode: false,
    });
    expect(res.status(), '테스트 계정 로그인 실패').toBe(200);
    const body = await res.json();
    await use(body.token as string);
  },

  authedApi: async ({ playwright, baseURL, token }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await use(ctx);
    await ctx.dispose();
  },

  shop: async ({ authedApi }, use) => {
    await use(new ShopApi(authedApi));
  },
});

export { expect };
