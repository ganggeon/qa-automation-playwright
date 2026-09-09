# Playwright 기초 — QA 자동화

---

## 1. 왜 Playwright인가

| | Selenium | Cypress | **Playwright** |
|---|---|---|---|
| 브라우저 | 전부 | Chromium 계열 위주 | Chromium/Firefox/WebKit |
| 자동 대기 | 직접 구현 | 있음 | **있음 (강력)** |
| API 테스트 | 별도 도구 | 부분 지원 | **내장 (같은 코드에서)** |
| 병렬 실행 | Grid 필요 | 유료 | **기본 내장** |
| 디버깅 | 로그 | Time-travel | **Trace Viewer** |
| 언어 | 다양 | JS/TS만 | JS/TS, Python, Java, .NET |

QA 입장에서 결정적인 두 가지
1. **자동 대기** — `sleep(3000)` 을 쓸 일이 거의 없어진다. Flaky 테스트의 최대 원인이 사라진다
2. **API + UI 통합** — 로그인은 API로 빠르게, 검증은 UI로. 같은 픽스처를 공유한다

---

## 2. 핵심 개념 5가지

### 2.1 로케이터(Locator) — 지연 평가

```ts
const btn = page.getByTestId('btn-login');   // 이 시점엔 DOM을 찾지 않는다
await btn.click();                            // 클릭할 때 찾는다
```

이게 왜 중요한가: **화면이 다시 그려져도 로케이터는 유효하다.**
Selenium의 WebElement는 재렌더링 후 `StaleElementReferenceException` 이 난다.
Playwright는 매번 다시 찾으므로 그 문제가 없다.

### 2.2 자동 대기(Auto-waiting)

`click()` 하나에 Playwright가 자동으로 기다리는 조건들:
- 요소가 DOM에 붙음
- 보임(visible)
- 안정됨(애니메이션 종료)
- 다른 요소에 가려지지 않음
- 활성화됨(enabled)

```ts
await page.waitForTimeout(3000);          // ❌ 절대 쓰지 마라. Flaky의 근원
await expect(locator).toBeVisible();      // ✅ 조건이 만족될 때까지 재시도
```

### 2.3 `expect` 의 두 종류

```ts
// 자동 재시도 O — 로케이터 대상
await expect(page.getByTestId('message')).toHaveText('주문이 완료되었습니다.');

// 자동 재시도 X — 값 대상 (이미 확정된 값)
expect(await cartPage.totalAmount()).toBe(26700);
```

첫 번째는 조건이 만족될 때까지 최대 5초(설정값) 재시도한다.
두 번째는 그 순간의 값을 한 번만 본다.
**비동기로 갱신되는 화면은 반드시 첫 번째 형태로 써야 한다.**

### 2.4 로케이터 우선순위

```ts
// 권장 순서 (위로 갈수록 좋음)
page.getByRole('button', { name: '주문하기' })   // 접근성 기준. 사용자가 인식하는 방식
page.getByLabel('이메일')
page.getByPlaceholder('상품명 검색')
page.getByText('장바구니가 비어 있습니다.')
page.getByTestId('btn-order')                    // 테스트 전용 속성 (안정적)
page.locator('.btn.btn-primary > span:nth-child(2)')  // ❌ CSS 구조 의존. 최악
```

마지막 형태는 **디자인 리뉴얼 한 번에 전부 깨진다.**
이 프로젝트는 `data-testid` 를 주력으로 쓴다. 개발자에게 요청해서 심는 것도 QA의 일이다.

### 2.5 픽스처(Fixture)

테스트마다 필요한 준비/정리를 선언적으로 관리한다.

```ts
export const test = base.extend<MiniShopFixtures>({
  freshUser: async ({ request }, use) => {
    const email = uniqueEmail('fixture');
    await request.post('/api/users', { data: { email, password: 'Qa123456', age: 30 } });
    await use({ email, password: 'Qa123456' });   // ← 테스트가 여기서 실행된다
    // use() 이후에 쓰면 정리(teardown) 코드가 된다
  },
});
```

사용하는 쪽:

```ts
test('...', async ({ shop }) => {     // shop만 적으면 freshUser → token → authedApi가 자동으로 준비된다
  await shop.addToCart(1, 2);
});
```

**필요한 것만 적으면 의존성이 알아서 연쇄 실행된다.** `beforeEach` 를 줄줄이 쓰는 것보다 깔끔하다.

---

## 3. Page Object Model (POM)

### 원칙

```
테스트          "무엇을 검증하는가"   → expect
페이지 객체     "무엇을 할 수 있는가" → 화면 조작 + 상태 조회
```

**페이지 객체 안에 `expect` 를 넣지 않는다.** 넣는 순간 재사용이 불가능해진다.
(성공을 기대하는 테스트와 실패를 기대하는 테스트가 같은 메서드를 못 쓴다)

### 예 (이 프로젝트)

```ts
// pages/CartPage.ts — 조작과 조회만 제공
export class CartPage extends BasePage {
  readonly total: Locator;

  async order(couponCode?: string): Promise<void> {
    if (couponCode) await this.coupon.fill(couponCode);
    await this.orderButton.click();
  }

  async totalAmount(): Promise<number> {
    return Number((await this.totalText()).replace(/[^0-9-]/g, ''));
  }
}

// tests/ui/03-checkout.spec.ts — 검증은 테스트에서
await cartPage.order(COUPON.AMOUNT5000);
await expect(cartPage.message).toContainText('31,000원');
```

---

## 4. 프로젝트(Project) 분리

`playwright.config.ts` 의 `projects` 는 "같은 테스트를 다른 조건으로" 또는
"다른 테스트를 다른 설정으로" 돌리는 장치다.

```ts
projects: [
  { name: 'setup', testMatch: /global\.setup\.ts/ },
  { name: 'api',   testDir: './tests/api', dependencies: ['setup'] },
  { name: 'ui',    testDir: './tests/ui',  dependencies: ['setup'], use: devices['Desktop Chrome'] },
  { name: 'ui-firefox', testDir: './tests/ui', use: devices['Desktop Firefox'] },
  { name: 'external-api', testDir: './tests/external/api', retries: 2 },   // 외부 서비스는 재시도 허용
]
```

**핵심 활용**
- `dependencies` 로 초기화를 먼저 실행 (`globalSetup` 보다 순서가 확실하다)
- 외부 의존 테스트를 분리해 **메인 스위트의 신뢰도를 지킨다**
- 같은 UI 테스트를 3개 브라우저로 재활용

---

## 5. `test.fail()` — 알려진 결함 관리

```ts
test('TC-API-ORDER-003 | 결제금액은 0원 미만이 되지 않는다', async ({ shop }) => {
  test.fail(true, 'BUG-013: 결제금액 하한 처리가 없어 음수 결제금액이 생성된다');
  ...
});
```

| 상황 | 결과 |
|---|---|
| 결함이 그대로 → 테스트 실패 | **통과로 집계** (기대한 실패) |
| 결함이 수정됨 → 테스트 통과 | **실패** — `Expected to fail, but passed` |

두 번째가 이 기능의 진짜 가치다. 개발자가 조용히 고쳐도 **QA가 알게 된다.**
그때 `test.fail()` 한 줄을 지우면 그 케이스는 회귀 방지 테스트로 승격된다.

> 대안인 `test.skip()` 은 쓰지 마라. 스킵된 테스트는 아무도 다시 안 본다.

---

## 6. 디버깅 3종

```bash
npx playwright test --debug              # 단계별 실행 (Inspector)
npx playwright test --ui                 # UI 모드. 타임트래블 + 재실행
npx playwright show-trace trace.zip      # 실패한 테스트의 전 과정 재생
npx playwright codegen http://localhost:4010   # 조작하면 코드가 생성됨
```

**Trace Viewer가 핵심이다.** 각 단계의 DOM 스냅샷, 네트워크 요청, 콘솔 로그,
스크린샷이 전부 들어 있다. 결함 리포트에 trace.zip을 첨부하면 개발자가
"내 PC에선 되는데요"라고 할 수 없다.

이 프로젝트 설정:

```ts
use: {
  trace: 'retain-on-failure',       // 실패한 것만 (용량 절약)
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```

---

## 7. Flaky 테스트 대처

| 증상 | 원인 | 해결 |
|---|---|---|
| 가끔 요소를 못 찾음 | 명시적 sleep 사용 | `expect().toBeVisible()` 로 교체 |
| 병렬 실행 시에만 실패 | 테스트 간 데이터 공유 | 테스트마다 데이터를 새로 생성 |
| 특정 브라우저에서만 실패 | 자원 경합 / 브라우저 차이 | 워커 수 제한, 타임아웃 조정 |
| 실행 순서에 따라 실패 | 순서 의존 | 각 테스트가 사전조건을 스스로 준비 |
| 재고/카운터 검증 실패 | 절대값 단언 | 변화량으로 검증 |

> **이 프로젝트에서 실제로 겪은 사례**
> 전체 프로젝트를 워커 9개로 한꺼번에 돌리자 Firefox 테스트 6건이 40~60초
> 타임아웃으로 실패했다. 같은 테스트를 워커 2개로 돌리니 19건 전부 통과.
> 원인은 테스트 코드가 아니라 **자원 경합**이었다 (브라우저 27개 + 단일 스레드 SUT).
> → `workers: 4` 로 상한을 두어 해결. `playwright.config.ts` 에 경위를 주석으로 남겼다.
>
> **"가끔 실패한다"의 원인이 항상 코드인 것은 아니다. 실행 환경도 의심해야 한다.**

---

## 8. 자주 쓰는 명령

```bash
npm run sut                  # SUT 기동
npm test                     # API + UI (기본)
npm run test:api             # API만
npm run test:ui              # UI만
npm run test:crossbrowser    # Chromium + Firefox + WebKit
npm run test:external        # 외부 데모 사이트
npm run test:headed          # 브라우저를 보면서 실행
npm run report               # HTML 리포트 열기
npm run typecheck            # 타입 검사
npm run newman               # Postman 컬렉션 실행

npx playwright test -g "경계값"          # 제목으로 필터
npx playwright test tests/api/05-order.spec.ts   # 파일 지정
npx playwright test --last-failed        # 직전에 실패한 것만
```
