# API 테스트

---

## 1. 왜 API 테스트인가

| 비교 | UI 테스트 | API 테스트 |
|---|---|---|
| 속도 | 건당 2~10초 | 건당 50~300ms |
| 안정성 | 렌더링·애니메이션·타이밍에 취약 | HTTP 요청/응답만 |
| 커버 범위 | 화면에서 만들 수 있는 입력만 | **화면에서 못 만드는 입력까지** |
| 시점 | 화면 완성 후 | **화면 개발 전부터 가능** |

세 번째가 결정적이다. UI에서 `<input type="number">` 는 음수를 못 넣게 막을 수 있지만,
**API는 누구나 직접 호출할 수 있다.** 이 프로젝트의 BUG-008(음수 수량 → 음수 총액)이
정확히 그런 결함이다. UI만 테스트했다면 절대 못 잡는다.

> **"화면에서 막혀 있으니 괜찮다"는 서버 검증을 생략할 이유가 되지 못한다.**
> 이걸 증명하는 게 API 테스트의 존재 이유다.

---

## 2. HTTP 기초 복습

### 메서드

| 메서드 | 의미 | 멱등성 | 본문 |
|---|---|---|---|
| GET | 조회 | O | 없음 |
| POST | 생성 / 처리 | X | 있음 |
| PUT | 전체 교체 | O | 있음 |
| PATCH | 부분 수정 | △ | 있음 |
| DELETE | 삭제 | O | 보통 없음 |

**멱등(Idempotent)**: 같은 요청을 여러 번 보내도 결과 상태가 같다.
→ 테스트 포인트: "DELETE를 두 번 호출하면? 두 번째는 404여야 한다"
→ 이 프로젝트 BUG-010이 여기서 나왔다.

### 상태 코드 — 반드시 외울 것

| 코드 | 의미 | 언제 |
|---|---|---|
| 200 OK | 성공 | 조회, 수정 |
| **201 Created** | 생성됨 | POST로 리소스 생성. `Location` 헤더 권장 |
| **204 No Content** | 성공, 본문 없음 | DELETE 성공 |
| 400 Bad Request | 요청이 잘못됨 | 입력값 검증 실패 |
| **401 Unauthorized** | **인증** 안 됨 | 토큰 없음/만료 |
| **403 Forbidden** | **인가** 안 됨 | 로그인은 됐는데 권한 없음 |
| 404 Not Found | 리소스 없음 | 없는 id |
| **409 Conflict** | 상태 충돌 | 재고 부족, 중복 가입 |
| 422 Unprocessable | 문법은 맞으나 의미상 처리 불가 | 400 대신 쓰기도 함 |
| **423 Locked** | 잠김 | 계정 잠금 |
| 429 Too Many Requests | 요청 과다 | 레이트 리밋 |
| 500 Internal Server Error | **서버 잘못** | 예외 미처리 |

> **401 vs 403**: "너 누구야?"(401) vs "너인 건 알겠는데 안 돼"(403).
> **400 vs 500**: 클라이언트 잘못 vs 서버 잘못. **클라이언트 실수에 500이 나오면 그것 자체가 결함**이다.
> 이 프로젝트의 EXT-BUG-005가 그 예다.

**404 vs 403 — 보안 관점**
남의 리소스에 접근했을 때 403을 주면 "그 리소스는 존재한다"는 정보가 새어나간다.
민감한 경우 **404로 감추는 것이 맞다**. (이 프로젝트 SPEC FR-08-2)

---

## 3. API 테스트에서 무엇을 검증하는가

### 3.1 6개 층

```
① 상태 코드      200/201/400/401/404/409 ...
② 응답 본문 값    금액, 개수, id
③ 응답 스키마     필드 존재·타입·형식 (계약)
④ 응답 헤더      Content-Type, Location, Set-Cookie
⑤ 부수 효과      DB 상태 변화 (재고 차감, 장바구니 비워짐)
⑥ 비기능        응답시간, 동시성
```

**⑤를 빼먹는 사람이 많다.** "주문 API가 201을 줬다"와 "실제로 재고가 줄었다"는 다른 얘기다.

```ts
// 이 프로젝트 TC-API-ORDER-004
const before = await shop.stockOf(PRODUCT.STOCK_CHECK.id);
await shop.addToCart(PRODUCT.STOCK_CHECK.id, 2);
expect((await shop.order(null)).status()).toBe(201);   // ① 상태코드
const after = await shop.stockOf(PRODUCT.STOCK_CHECK.id);
expect(after).toBe(before - 2);                        // ⑤ 부수 효과
```

### 3.2 스키마 검증 (계약 테스트)

값만 비교하면 **계약 변화**를 놓친다.

```ts
expect(body.id).toBe(1);   // id가 number → string 으로 바뀌어도 못 잡는다 (== 비교 아님이라 잡히긴 하나)
                           // 새 필드가 추가되거나 필드가 사라지는 건 전혀 못 잡는다
```

JSON Schema로 응답의 **모양 전체**를 검사한다.

```ts
export const signupSchema = {
  type: 'object',
  required: ['id', 'email'],
  additionalProperties: false,   // ← 이게 핵심
  properties: {
    id: { type: 'integer', minimum: 1 },
    email: { type: 'string', format: 'email' },
  },
} as const;
```

`additionalProperties: false` 를 켜면 **서버가 실수로 `password` 를 더 내려줄 때 즉시 실패**한다.
개인정보 유출 사고의 상당수가 "응답에 불필요한 필드가 딸려 나간" 케이스다.

스키마에 비즈니스 규칙도 넣을 수 있다.

```ts
stock:      { type: 'integer', minimum: 0 },   // 재고는 음수 불가 → BUG-014 검출
totalPrice: { type: 'integer', minimum: 0 },   // 총액은 음수 불가 → BUG-008 검출
finalPrice: { type: 'integer', minimum: 0 },   // 결제금액은 음수 불가 → BUG-013 검출
discount:   { type: 'integer' },               // 정수 → 소수점 잔여 검출 → BUG-012
```

> 이 프로젝트에서 **스키마 하나로 결함 4건이 자동으로 걸렸다.**
> 개별 단언을 다 안 써도 잡힌다는 게 스키마 검증의 힘이다.

---

## 4. 인증 테스트

| 확인 항목 | 케이스 |
|---|---|
| 토큰 없음 | `Authorization` 헤더 생략 → 401 |
| 잘못된 토큰 | 임의 문자열 → 401 |
| 만료된 토큰 | 만료 후 호출 → 401 |
| **폐기된 토큰** | 로그아웃 후 재사용 → 401 ← **자주 빠뜨린다** |
| 다른 사용자 토큰 | 남의 리소스 접근 → 403 또는 404 |
| 토큰 위조 | 서명 변조(JWT) → 401 |

이 프로젝트의 BUG-005(로그아웃 후에도 토큰 유효)가 4번째 항목이다.
개발자가 "로그아웃 = 클라이언트에서 토큰 지우기"로만 구현하는 아주 흔한 실수다.

---

## 5. 도구 비교

| 도구 | 장점 | 단점 | 언제 |
|---|---|---|---|
| **Postman** | GUI, 학습 곡선 낮음, 팀 공유 쉬움 | 복잡한 로직·데이터 조작 한계 | 탐색적 API 테스트, 문서 겸용 |
| **Newman** | Postman 컬렉션을 CLI로 실행 | Postman에 종속 | CI에서 컬렉션 실행 |
| **Playwright API** | UI 테스트와 코드/픽스처 공유 | 코드 작성 필요 | 자동화 스위트 본체 |
| **REST Assured** | Java 생태계 | Java 필요 | 백엔드가 Java일 때 |
| **k6 / JMeter** | 부하 테스트 | 기능 테스트엔 과함 | 성능 검증 |

이 프로젝트는 **Playwright(본체) + Postman/Newman(보조)** 를 함께 쓴다.
Postman 컬렉션은 "개발자에게 결함을 재현시켜 보여줄 때" 특히 유용하다 —
링크 하나 던지면 상대가 바로 실행해볼 수 있다.

### Postman 테스트 스크립트 예

```js
pm.test('상태코드 201', function () {
    pm.response.to.have.status(201);
});

pm.test('응답 시간 1초 이내', function () {
    pm.expect(pm.response.responseTime).to.be.below(1000);
});

pm.test('[보안] 응답에 비밀번호가 포함되지 않는다', function () {
    pm.expect(pm.response.text()).to.not.include('Qa123456');
});

// 다음 요청에서 쓰도록 토큰 저장
pm.collectionVariables.set('token', pm.response.json().token);
```

---

## 6. API 테스트 체크리스트

### 기능
- [ ] CRUD 각각의 정상 케이스
- [ ] 필수 필드 누락 → 400
- [ ] 타입 불일치(문자열에 숫자) → 400
- [ ] 경계값(길이·범위·개수)
- [ ] 존재하지 않는 리소스 → 404
- [ ] 비즈니스 규칙 위반 → 409
- [ ] 부수 효과(상태 변화) 확인

### 계약
- [ ] 응답 스키마 (필드·타입·필수 여부)
- [ ] 예상 밖 필드가 없는가 (`additionalProperties: false`)
- [ ] Content-Type 헤더
- [ ] 오류 응답도 일관된 형식인가

### 인증/인가
- [ ] 토큰 없음/무효/만료/폐기
- [ ] 타인 리소스 접근
- [ ] 권한별 접근 제어

### 견고성
- [ ] 아주 긴 문자열
- [ ] 특수문자·이모지·한글
- [ ] SQL/스크립트 삽입 문자열
- [ ] 동시 요청 (같은 재고 마지막 1개를 둘이 주문)
- [ ] 같은 요청 반복 (멱등성)
