/**
 * MiniShop - QA 실습용 테스트 대상 시스템 (SUT: System Under Test)
 *
 * 이 서버는 sut/SPEC.md 의 요구사항을 구현한 것처럼 보이지만,
 * 일부 요구사항을 의도적으로 위반하고 있다. (= 주입 결함 / Seeded Defects)
 *
 * 정답지는 sut/SEEDED-DEFECTS.md 에 있다.
 * 테스트를 설계할 때는 SPEC.md 만 보고, 정답지는 마지막에 확인할 것.
 *
 * 실행: npm run sut   ->  http://localhost:4010
 */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4010;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// 저장소 (In-Memory)
// ---------------------------------------------------------------------------
let users, products, coupons, carts, orders, sessions;
let seq;

function seed() {
  seq = { user: 3, cartItem: 1, order: 1, token: 1 };

  users = [
    { id: 1, email: 'qa@test.com', password: 'Qa123456', age: 30, failCount: 0, locked: false },
    { id: 2, email: 'locked@test.com', password: 'Qa123456', age: 30, failCount: 5, locked: true },
  ];

  products = [
    { id: 1, name: '클린 코드', price: 33000, stock: 10, category: '개발' },
    { id: 2, name: 'Java의 정석', price: 30000, stock: 5, category: '개발' },
    { id: 3, name: '테스트 주도 개발', price: 22000, stock: 0, category: '개발' },
    { id: 4, name: 'HTML <div> 완전정복', price: 45000, stock: 3, category: '개발' },
    { id: 5, name: '북마크 세트', price: 2345, stock: 100, category: '문구' },
    { id: 6, name: '리팩터링 2판', price: 38000, stock: 7, category: '개발' },
    { id: 7, name: '객체지향의 사실과 오해', price: 20000, stock: 12, category: '개발' },
    { id: 8, name: 'SQL 첫걸음', price: 18000, stock: 9, category: '데이터' },
    { id: 9, name: '데이터 중심 애플리케이션 설계', price: 42000, stock: 4, category: '데이터' },
    { id: 10, name: '모두의 파이썬', price: 16000, stock: 20, category: '개발' },
    { id: 11, name: '실용주의 프로그래머', price: 27000, stock: 6, category: '개발' },
    { id: 12, name: '인간관계론', price: 14000, stock: 30, category: '인문' },
    { id: 13, name: '만년필 잉크', price: 8900, stock: 50, category: '문구' },
    { id: 14, name: '스프링 부트 핵심가이드', price: 36000, stock: 8, category: '개발' },
    { id: 15, name: 'HTTP 완벽 가이드', price: 40000, stock: 2, category: '개발' },
    // 수량 경계값(FR-06-2, 1~99) 검증 전용. 재고 제약(FR-06-3)에 걸리지 않도록
    // 재고를 충분히 크게 잡아 "수량 규칙"만 단독으로 검증할 수 있게 한다.
    { id: 16, name: '연습장 100매', price: 1200, stock: 999, category: '문구' },
  ];

  coupons = [
    { code: 'WELCOME10', type: 'RATE', value: 10, minAmount: 0, expiresAt: '2099-12-31' },
    { code: 'SAVE5000', type: 'AMOUNT', value: 5000, minAmount: 30000, expiresAt: '2099-12-31' },
    { code: 'BIG50000', type: 'AMOUNT', value: 50000, minAmount: 0, expiresAt: '2099-12-31' },
    { code: 'EXPIRED20', type: 'RATE', value: 20, minAmount: 0, expiresAt: '2020-01-01' },
  ];

  carts = new Map();    // userId -> [{ itemId, productId, qty }]
  orders = [];
  sessions = new Map(); // token -> userId
}
seed();

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------
function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = sessions.get(token);
  if (!userId) return fail(res, 401, 'UNAUTHORIZED', '인증 정보가 없거나 유효하지 않습니다.');
  req.user = users.find((u) => u.id === userId);
  req.token = token;
  next();
}

function cartOf(userId) {
  if (!carts.has(userId)) carts.set(userId, []);
  return carts.get(userId);
}

function cartView(userId) {
  const items = cartOf(userId).map((it) => {
    const p = products.find((x) => x.id === it.productId);
    return {
      itemId: it.itemId,
      productId: it.productId,
      name: p.name,
      price: p.price,
      qty: it.qty,
      subtotal: p.price * it.qty,
    };
  });
  return {
    items,
    totalQty: items.reduce((s, i) => s + i.qty, 0),
    totalPrice: items.reduce((s, i) => s + i.subtotal, 0),
  };
}

// ---------------------------------------------------------------------------
// FR-01 회원가입
// ---------------------------------------------------------------------------
app.post('/api/users', (req, res) => {
  const { email, password, age } = req.body || {};

  // [SEED-01] FR-01-1 위반: 도메인에 점(.)이 있는지 검사하지 않는 느슨한 정규식.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
  if (!email || !EMAIL_RE.test(String(email))) {
    return fail(res, 400, 'INVALID_EMAIL', '이메일 형식이 올바르지 않습니다.');
  }

  if (users.some((u) => u.email === email)) {
    return fail(res, 409, 'DUPLICATE_EMAIL', '이미 가입된 이메일입니다.');
  }

  const pw = String(password || '');
  // [SEED-02] FR-01-3 위반: 최소 길이만 검사하고 최대 길이(20자) 검사가 빠져 있다.
  if (pw.length < 8) {
    return fail(res, 400, 'INVALID_PASSWORD', '비밀번호는 8자 이상 20자 이하여야 합니다.');
  }
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    return fail(res, 400, 'INVALID_PASSWORD', '비밀번호는 영문과 숫자를 각각 1자 이상 포함해야 합니다.');
  }

  // [SEED-03] FR-01-5 위반: 하한(14)만 검사하고 상한(120) 검사가 빠져 있다.
  if (!Number.isInteger(age) || age < 14) {
    return fail(res, 400, 'INVALID_AGE', '나이는 14 이상 120 이하의 정수여야 합니다.');
  }

  const user = { id: seq.user++, email, password: pw, age, failCount: 0, locked: false };
  users.push(user);
  res.status(201).json({ id: user.id, email: user.email });
});

// ---------------------------------------------------------------------------
// FR-02 로그인
// ---------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find((u) => u.email === email);

  // [SEED-04] FR-02-3 위반: 실패 횟수는 누적하면서 정작 잠금 상태를 확인하지 않는다.
  //           (아래 잠금 체크가 통째로 빠져 있음)

  if (!user || user.password !== password) {
    if (user) {
      user.failCount += 1;
      if (user.failCount >= 5) user.locked = true;
    }
    return fail(res, 401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  user.failCount = 0; // FR-02-4 정상 구현
  const token = `tok_${seq.token++}_${Math.random().toString(36).slice(2, 10)}`;
  sessions.set(token, user.id);
  res.status(200).json({ token, user: { id: user.id, email: user.email } });
});

// ---------------------------------------------------------------------------
// FR-03 로그아웃
// ---------------------------------------------------------------------------
app.post('/api/auth/logout', auth, (req, res) => {
  // [SEED-05] FR-03-1 위반: 세션에서 토큰을 제거하지 않아 로그아웃 후에도 토큰이 살아있다.
  //           올바른 구현은 sessions.delete(req.token);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// FR-04 상품 목록
// ---------------------------------------------------------------------------
app.get('/api/products', (req, res) => {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const size = req.query.size === undefined ? 10 : Number(req.query.size);
  const keyword = req.query.keyword;

  if (!Number.isInteger(page) || page < 1) {
    return fail(res, 400, 'INVALID_PARAM', 'page는 1 이상의 정수여야 합니다.');
  }
  // [SEED-06] FR-04 위반: size 하한 검사가 `size < 0` 이라 0이 통과한다.
  //           그리고 size=0이면 아래에서 전체 목록이 반환된다.
  if (!Number.isInteger(size) || size < 0 || size > 50) {
    return fail(res, 400, 'INVALID_PARAM', 'size는 1 이상 50 이하의 정수여야 합니다.');
  }

  let list = products;
  if (keyword) {
    // [SEED-07] FR-04 위반: 대소문자를 구분하여 비교한다. (toLowerCase 누락)
    list = list.filter((p) => p.name.includes(String(keyword)));
  }

  const effectiveSize = size || list.length; // size=0 -> 전체 반환 (SEED-06의 결과)
  const start = (page - 1) * effectiveSize;
  res.status(200).json({
    page,
    size,
    total: list.length,
    items: list.slice(start, start + effectiveSize),
  });
});

// ---------------------------------------------------------------------------
// FR-05 상품 상세
// ---------------------------------------------------------------------------
app.get('/api/products/:id', (req, res) => {
  const p = products.find((x) => x.id === Number(req.params.id));
  if (!p) return fail(res, 404, 'PRODUCT_NOT_FOUND', '상품을 찾을 수 없습니다.');
  res.status(200).json(p);
});

// ---------------------------------------------------------------------------
// FR-06 / FR-07 장바구니
// ---------------------------------------------------------------------------
app.get('/api/cart', auth, (req, res) => {
  res.status(200).json(cartView(req.user.id));
});

app.post('/api/cart', auth, (req, res) => {
  const { productId, qty } = req.body || {};
  const product = products.find((p) => p.id === Number(productId));
  if (!product) return fail(res, 404, 'PRODUCT_NOT_FOUND', '상품을 찾을 수 없습니다.');

  // [SEED-08] FR-06-2 위반: 상한(99)만 검사하고 하한(1) 검사가 빠져 있다. -> 0, 음수가 통과
  if (!Number.isInteger(qty) || qty > 99) {
    return fail(res, 400, 'INVALID_QTY', '수량은 1 이상 99 이하의 정수여야 합니다.');
  }

  // [SEED-09] FR-06-3 위반: 담는 시점의 재고 확인이 통째로 빠져 있다.
  //           (재고 0인 상품도, 재고보다 많은 수량도 그대로 담긴다)

  const cart = cartOf(req.user.id);
  const exist = cart.find((i) => i.productId === product.id);
  if (exist) exist.qty += qty;                                   // FR-06-4
  else cart.push({ itemId: seq.cartItem++, productId: product.id, qty });

  res.status(201).json(cartView(req.user.id));
});

app.delete('/api/cart/:itemId', auth, (req, res) => {
  const cart = cartOf(req.user.id);
  const idx = cart.findIndex((i) => i.itemId === Number(req.params.itemId));
  // [SEED-10] FR-08-1 위반: 없는 itemId여도 404를 주지 않고 그냥 204로 성공 처리한다.
  if (idx >= 0) cart.splice(idx, 1);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// FR-09 주문
// ---------------------------------------------------------------------------
app.post('/api/orders', auth, (req, res) => {
  const { couponCode } = req.body || {};
  const view = cartView(req.user.id);

  if (view.items.length === 0) {
    return fail(res, 400, 'EMPTY_CART', '장바구니가 비어 있습니다.');
  }

  let discount = 0;
  if (couponCode) {
    const c = coupons.find((x) => x.code === couponCode);
    if (!c) return fail(res, 404, 'COUPON_NOT_FOUND', '존재하지 않는 쿠폰입니다.');

    // FR-09-4 정상 구현: 만료일 당일 23:59:59까지 사용 가능
    if (new Date(`${c.expiresAt}T23:59:59`) < new Date()) {
      return fail(res, 400, 'COUPON_EXPIRED', '만료된 쿠폰입니다.');
    }

    // [SEED-11] FR-09-3 위반: 이상(>=)이어야 하는데 초과(>)로 비교한다.
    //           -> 주문금액이 minAmount와 정확히 같으면 쿠폰이 거부된다.
    if (view.totalPrice <= c.minAmount) {
      return fail(res, 400, 'COUPON_MIN_AMOUNT', `최소 주문금액 ${c.minAmount}원 이상이어야 합니다.`);
    }

    // [SEED-12] FR-09-6 위반: RATE 할인액을 내림(Math.floor)하지 않아 소수점이 남는다.
    discount = c.type === 'RATE' ? (view.totalPrice * c.value) / 100 : c.value;
  }

  // [수정] FR-09-5 는 결제금액(finalPrice)의 0원 하한을 규정한다 → Math.max(0, ...).
  //           할인액(discount)을 주문금액까지로 깎는 것은 명세 요구가 아니라 이 구현의 선택이다.
  //           명세 확인 항목으로 올렸다 → portfolio-submissions/04-명세검토-추가.md (SPEC-DEF-007)
  discount = Math.min(discount, view.totalPrice);
  const finalPrice = Math.max(0, view.totalPrice - discount);

  // [SEED-14] FR-09-1 / FR-09-2 위반: 재고 확인 없이 차감만 하여 재고가 음수가 된다.
  for (const item of view.items) {
    const p = products.find((x) => x.id === item.productId);
    p.stock -= item.qty;
  }

  const order = {
    orderId: seq.order++,
    userId: req.user.id,
    totalPrice: view.totalPrice,
    discount,
    finalPrice,
    items: view.items,
    createdAt: new Date().toISOString(),
  };
  orders.unshift(order);
  carts.set(req.user.id, []); // FR-09-7 정상 구현

  const { userId, ...body } = order;
  res.status(201).json(body);
});

app.get('/api/orders', auth, (req, res) => {
  res.status(200).json(orders.filter((o) => o.userId === req.user.id).map(({ userId, ...o }) => o));
});

// ---------------------------------------------------------------------------
// 테스트 전용 백도어 - 테스트 격리(Test Isolation)를 위해 상태를 초기화한다.
// ---------------------------------------------------------------------------
app.post('/api/_reset', (req, res) => {
  seed();
  res.status(200).json({ ok: true });
});

app.use('/api', (req, res) => fail(res, 404, 'NOT_FOUND', '존재하지 않는 API입니다.'));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MiniShop SUT running at http://localhost:${PORT}`);
  });
}

module.exports = app;
