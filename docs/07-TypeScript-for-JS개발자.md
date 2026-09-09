# JavaScript는 아는데 TypeScript는 처음이라면

> 이 프로젝트의 테스트 코드는 전부 TypeScript(`.ts`)다.
> 하지만 걱정할 필요 없다. **TypeScript는 JavaScript에 타입 표기를 얹은 것**이고,
> 유효한 JS는 거의 그대로 유효한 TS다. 새 언어를 배우는 게 아니라 표기법 몇 개를 배우는 것이다.

---

## 0. 왜 QA가 TypeScript를 쓰는가

QA 자동화에서 TS의 가치는 "고급스러워 보여서"가 아니다. 아주 실용적이다.

| 상황 | JavaScript | TypeScript |
|---|---|---|
| `page.getByTestId()` 를 `getByTestID` 로 오타 | 실행해봐야 알 수 있음 (5분 후) | 저장하는 순간 빨간 줄 |
| API 응답의 `body.finalPrice` 를 `body.finalprice` 로 씀 | `undefined` 와 비교해서 **테스트가 조용히 통과** | 타입 지정 시 즉시 오류 |
| 페이지 객체에 어떤 메서드가 있는지 모름 | 파일 열어서 확인 | `.` 찍으면 자동완성 |

두 번째가 결정적이다. **오타 난 테스트는 실패하는 게 아니라 통과한다.**
`expect(undefined).toBeUndefined()` 는 통과하니까. QA 입장에서 이건 최악의 사고다.
"테스트가 있는데 버그가 나갔다"가 여기서 나온다.

---

## 1. 문법 — 이것만 알면 이 프로젝트 코드를 다 읽는다

### 1.1 변수/매개변수에 타입 붙이기

```ts
// JavaScript
function won(n) { return n.toLocaleString('ko-KR') + '원'; }

// TypeScript — 콜론 뒤에 타입을 쓴다
function won(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}
//         ↑ 매개변수 타입      ↑ 반환 타입 (대부분 생략 가능. 알아서 추론한다)
```

기본 타입: `string`, `number`, `boolean`, `null`, `undefined`, `any`, `unknown`, `void`

```ts
const email: string = 'qa@test.com';
const qty: number = 3;
const isLocked: boolean = false;
const names: string[] = ['클린 코드', '리팩터링'];   // 문자열 배열
```

> **대부분은 안 써도 된다.** `const qty = 3` 이라고만 써도 TS가 알아서 `number` 로 추론한다.
> 타입을 명시하는 건 주로 **함수 매개변수**와 **외부에서 들어오는 데이터**다.

### 1.2 객체 모양에 이름 붙이기 — `type` / `interface`

```ts
// 이 프로젝트 실제 코드 (test-data/minishop.ts 계열)
type TestUser = {
  id: number;
  email: string;
  password: string;
};

function login(user: TestUser) {
  console.log(user.email);   // 여기서 user. 을 찍으면 id/email/password 가 자동완성된다
  console.log(user.emial);   // ← 오타. 저장하자마자 빨간 줄
}
```

`interface` 도 거의 같다. 이 프로젝트는 `type` 으로 통일했다. 둘 중 하나만 골라 쓰면 된다.

### 1.3 물음표 두 종류

```ts
type Coupon = {
  code: string;
  minAmount?: number;      // ← ? : "없을 수도 있는 필드" (선택적)
};

function order(couponCode?: string) { }   // ← 인자를 안 넘겨도 된다

const name = user?.email;                 // ← 옵셔널 체이닝. user가 null이면 undefined 반환 (JS에도 있음)
const size = query.size ?? 10;            // ← null 병합. null/undefined일 때만 10 (JS에도 있음)
```

뒤의 두 개(`?.`, `??`)는 **원래 JavaScript 문법**이다. TS와 무관하다.

### 1.4 여러 타입 중 하나 — 유니온 `|`

```ts
// 실제 코드: pages/CartPage.ts
async sortBy(value: 'az' | 'za' | 'lohi' | 'hilo'): Promise<void> { }

await inventory.sortBy('az');    // OK
await inventory.sortBy('asc');   // ← 오류. 넷 중 하나여야 한다
```

이게 QA에서 아주 유용하다. **정렬 옵션 값을 외울 필요가 없다.**
따옴표를 여는 순간 에디터가 네 개를 다 보여준다.

```ts
function order(couponCode: string | null) { }   // 문자열이거나 null
```

### 1.5 `as const` — "이 값은 절대 안 바뀐다"

```ts
export const PRODUCT = {
  CART_ONLY: { id: 1, name: '클린 코드', price: 33000 },
} as const;
```

`as const` 없이 쓰면 `price` 의 타입이 그냥 `number` 지만,
붙이면 **정확히 `33000`** 이 된다. 테스트 데이터를 실수로 바꾸는 걸 막아준다.

### 1.6 `import type`

```ts
import type { Page, Locator } from '@playwright/test';
```

"이건 타입으로만 쓰고 실제 코드는 안 가져온다"는 표시다. 없어도 동작하지만 붙이는 게 관례다.

### 1.7 제네릭 `<T>` — 처음엔 그냥 넘어가도 된다

```ts
export const test = base.extend<MiniShopFixtures>({ ... });
//                             ↑ "이 픽스처들이 추가된다"고 알려주는 자리
```

제네릭은 "타입을 나중에 정하는 자리"다. 직접 만들 일은 한참 뒤고,
**남이 만든 것을 쓰기만 할 때는 꺾쇠 안에 타입 이름 하나 넣는 게 전부**다.

---

## 2. 자주 만나는 빨간 줄 3가지

### (1) `'x' is possibly 'null'`

```ts
const text = await cell.textContent();   // 타입: string | null
console.log(text.length);                // ← 오류: null일 수도 있잖아
```

**해결 3가지**

```ts
const text = (await cell.textContent()) ?? '';   // ① null이면 빈 문자열 (권장)
if (text !== null) { console.log(text.length); } // ② 확인 후 사용
const text = (await cell.textContent())!;        // ③ ! = "내가 책임진다" (되도록 쓰지 말 것)
```

이 프로젝트는 ①을 쓴다. `pages/ProductsPage.ts` 를 보면 전부 `?? ''` 로 처리돼 있다.

> 이건 TS가 잔소리하는 게 아니라 **실제로 존재하는 버그의 씨앗**이다.
> 셀렉터가 안 맞으면 `null` 이 오고, JS였다면 `Cannot read property 'length' of null` 로
> 런타임에 터진다.

### (2) `Property 'x' does not exist on type '{}'`

API 응답처럼 "뭐가 올지 모르는" 데이터에서 나온다.

```ts
const body = await res.json();          // 타입: any
expect(body.finalPrice).toBe(0);        // any라 그냥 통과 (검사 안 됨)
```

**타입을 붙이면 오타를 잡을 수 있다**

```ts
type OrderResponse = { orderId: number; totalPrice: number; finalPrice: number };

const body = (await res.json()) as OrderResponse;
expect(body.finalprice).toBe(0);   // ← 오류! 소문자 p 오타를 잡아준다
```

> 단, `as` 는 "내가 이 타입이라고 우기는 것"이지 실제 검증이 아니다.
> 진짜 검증은 이 프로젝트의 `expectSchema()` (Ajv 스키마 검사)가 한다.
> **타입은 개발 시점, 스키마는 실행 시점.** 둘 다 필요하다.

### (3) `Argument of type 'string' is not assignable to parameter of type 'number'`

```ts
await shop.addToCart('1', 2);   // ← productId는 number여야 한다
await shop.addToCart(1, 2);     // OK
```

---

## 3. 이 프로젝트 코드로 읽어보기

`fixtures/minishop.ts` 의 일부다. 한 줄씩 뜯어보자.

```ts
export class ShopApi {
  constructor(private readonly ctx: APIRequestContext) {}
//            ↑ private readonly 를 매개변수에 붙이면
//              this.ctx = ctx 를 자동으로 해준다 (TS 전용 문법)

  addToCart(productId: number, qty: number) {
    return this.ctx.post('/api/cart', { data: { productId, qty }, failOnStatusCode: false });
  }

  async stockOf(productId: number): Promise<number> {
//                                  ↑ async 함수의 반환 타입은 항상 Promise<무엇>
    const res = await this.product(productId);
    const body = (await res.json()) as Product;
    return body.stock;
  }
}
```

JavaScript로 쓰면 이렇게 된다. **구조는 완전히 같다.**

```js
class ShopApi {
  constructor(ctx) { this.ctx = ctx; }
  addToCart(productId, qty) { ... }
  async stockOf(productId) { ... }
}
```

**타입 표기만 걷어내면 그냥 JS다.** 이 사실만 붙들고 있으면 겁먹을 이유가 없다.

---

## 4. 단계별 학습 순서

이 프로젝트를 확장하면서 이 순서로 익히면 부담이 적다.

| 단계 | 익힐 것 | 연습 |
|---|---|---|
| **1단계** | `: string` `: number` 매개변수 타입, `?? ''` 로 null 처리 | 기존 테스트에 TC를 1건 추가해보기 |
| **2단계** | `type` 으로 API 응답 모양 정의, `as` 로 단언 | `test-data/schemas.ts` 의 스키마에 대응하는 `type` 을 직접 작성 |
| **3단계** | 유니온 `'a' \| 'b'`, `as const` | 새 페이지 객체를 만들고 옵션 값을 유니온으로 제한 |
| **4단계** | 제네릭 `<T>`, 픽스처 확장 | `fixtures/` 에 새 픽스처 추가 |

### 확인 방법

```bash
npm run typecheck     # tsc --noEmit — 타입 오류만 검사하고 파일은 만들지 않는다
```

에디터(VS Code)는 저장 없이도 실시간으로 알려준다. CI에도 이 명령이 들어 있다.

---

## 5. 자주 하는 오해

| 오해 | 사실 |
|---|---|
| "TS는 컴파일이 필요해서 번거롭다" | Playwright가 `.ts` 를 그대로 실행한다. 빌드 단계가 없다 |
| "타입을 전부 다 써야 한다" | 대부분 추론된다. 함수 매개변수와 외부 데이터에만 붙이면 충분하다 |
| "타입이 있으면 런타임 오류가 없다" | 아니다. 타입은 **실행 전** 검사다. 서버가 이상한 값을 주는 건 못 막는다 → 그래서 스키마 검증을 같이 쓴다 |
| "`any` 를 쓰면 안 된다" | 급할 땐 써도 된다. 다만 `any` 를 쓰는 순간 그 줄은 JS와 같아진다는 걸 알고 쓰면 된다 |
