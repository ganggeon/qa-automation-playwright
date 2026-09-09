import { randomUUID } from 'node:crypto';

/**
 * MiniShop 테스트 데이터
 *
 * ── 테스트 데이터 소유권(Test Data Ownership) ──────────────────────────────
 * 상품 재고는 계정별로 분리되지 않는 **전역 상태**다. 병렬로 도는 테스트끼리
 * 같은 상품을 주문하면 서로의 재고를 깎아 결과가 흔들린다(Flaky).
 *
 * 그래서 "이 상품은 이 테스트만 건드린다"고 미리 정해두고 이름을 붙였다.
 * 재고를 소모하지 않는 조회 테스트는 아무 상품이나 함께 써도 된다.
 */

export const CREDENTIALS = {
  /** 항상 존재하는 정상 계정 (읽기 위주 시나리오용) */
  valid: { email: 'qa@test.com', password: 'Qa123456' },
  /** 잠금 상태로 시작하는 계정 (FR-02-3 검증용) */
  locked: { email: 'locked@test.com', password: 'Qa123456' },
} as const;

export const PRODUCT = {
  /** 장바구니 담기/삭제 전용. 주문(재고 차감) 금지 */
  CART_ONLY: { id: 1, name: '클린 코드', price: 33000, initialStock: 10 },
  /** 쿠폰 최소주문금액 30,000원을 '정확히' 만들기 위한 상품 */
  EXACT_30000: { id: 2, name: 'Java의 정석', price: 30000, initialStock: 5 },
  /** 재고 0 (품절) 검증 전용 — 재고가 늘어날 일이 없어 항상 안정적 */
  SOLD_OUT: { id: 3, name: '테스트 주도 개발', price: 22000, initialStock: 0 },
  /** 상품명에 HTML 특수문자 포함 — UI 렌더링(UI-01) 검증 전용 */
  HTML_NAME: { id: 4, name: 'HTML <div> 완전정복', price: 45000, initialStock: 3 },
  /** 가격이 10으로 나누어떨어지지 않음 — 할인 절사(FR-09-6) 검증 전용 */
  ODD_PRICE: { id: 5, name: '북마크 세트', price: 2345, initialStock: 100 },
  /** 재고 부족 주문(FR-09-2) 검증 전용 */
  LOW_STOCK: { id: 9, name: '데이터 중심 애플리케이션 설계', price: 42000, initialStock: 4 },
  /** 주문 후 재고 차감량(FR-09-1) 검증 전용 */
  STOCK_CHECK: { id: 10, name: '모두의 파이썬', price: 16000, initialStock: 20 },
  /** 금액 조합용 저가 상품 (쿠폰 시나리오 전용) */
  CHEAP: { id: 12, name: '인간관계론', price: 14000, initialStock: 30 },
  /** 재고 초과 담기(FR-06-3) 검증 전용 — 담기만 하고 주문하지 않는다 */
  TINY_STOCK: { id: 15, name: 'HTTP 완벽 가이드', price: 40000, initialStock: 2 },
  /** 재고 음수 발생 여부(데이터 무결성) 검증 전용 */
  NEGATIVE_CHECK: { id: 11, name: '실용주의 프로그래머', price: 27000, initialStock: 6 },
  /**
   * 수량 경계값(FR-06-2, 1~99) 검증 전용. 재고가 999라 재고 규칙(FR-06-3)에
   * 걸리지 않으므로 "수량 규칙"만 단독으로 검증할 수 있다. **주문 금지**.
   *
   * [왜 전용 상품이 필요한가]
   *   원래 이 검증은 ODD_PRICE(재고 100)를 빌려 썼다. 그런데 ODD_PRICE는
   *   주문 테스트 3종이 재고를 5개 소모한다(재고 95). 지금은 SUT가 담기 시점에
   *   재고를 확인하지 않아(BUG-009) 우연히 통과하지만, 그 결함이 수정되면
   *   "99개 담기"가 재고 부족으로 실패하고, 실행 순서에 따라 결과가 흔들린다.
   *   **결함 덕분에 통과하는 테스트는 회귀 자산이 될 수 없다.**
   */
  BULK_QTY: { id: 16, name: '연습장 100매', price: 1200, initialStock: 999 },
  /** UI E2E 주문 전용 (재고 넉넉) */
  UI_ORDER: { id: 13, name: '만년필 잉크', price: 8900, initialStock: 50 },
  /** UI 쿠폰 주문 전용 — 단가가 3만원을 넘어 SAVE5000 조건을 한 개로 충족 */
  UI_COUPON: { id: 14, name: '스프링 부트 핵심가이드', price: 36000, initialStock: 8 },
} as const;

export const COUPON = {
  /** 10% 할인, 최소금액 없음 */
  RATE10: 'WELCOME10',
  /** 5,000원 할인, 최소 주문금액 30,000원 */
  AMOUNT5000: 'SAVE5000',
  /** 50,000원 할인 — 총액보다 큰 할인 상황(FR-09-5)을 만들기 위한 쿠폰 */
  AMOUNT50000: 'BIG50000',
  /** 만료된 쿠폰 */
  EXPIRED: 'EXPIRED20',
  /** 존재하지 않는 쿠폰 */
  NOT_FOUND: 'NO_SUCH_COUPON',
} as const;

export const COUPON_SPEC = {
  [COUPON.AMOUNT5000]: { minAmount: 30000, value: 5000 },
  [COUPON.RATE10]: { minAmount: 0, value: 10 },
  [COUPON.AMOUNT50000]: { minAmount: 0, value: 50000 },
} as const;

/**
 * 테스트마다 겹치지 않는 이메일을 만든다.
 *
 * 처음에는 `Date.now() + 모듈 카운터`로 만들었는데, 병렬 워커가 각자 별도
 * 프로세스라 카운터가 워커마다 0부터 다시 시작한다. 같은 밀리초에 같은 번호가
 * 나오면 중복 가입(409)으로 테스트가 간헐 실패했다.
 * → 프로세스 경계를 넘어 유일한 값이 필요하므로 UUID를 쓴다.
 */
export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}_${randomUUID().slice(0, 12)}@test.com`;
}

/** 길이가 정확히 n인, 영문+숫자를 포함한 유효 비밀번호를 만든다 */
export function passwordOfLength(n: number): string {
  const head = 'Qa1';
  return head + 'x'.repeat(Math.max(0, n - head.length));
}
