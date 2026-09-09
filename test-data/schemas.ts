/**
 * MiniShop API 응답 스키마 (JSON Schema Draft-07)
 *
 * SPEC.md 의 응답 정의를 기계가 읽을 수 있는 형태로 옮긴 것.
 * `additionalProperties: false` 를 켠 이유:
 *   서버가 실수로 password 같은 필드를 더 내려주면 그것도 결함이기 때문이다.
 */

export const errorSchema = {
  type: 'object',
  required: ['error'],
  additionalProperties: false,
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      additionalProperties: false,
      properties: {
        code: { type: 'string', minLength: 1 },
        message: { type: 'string', minLength: 1 },
      },
    },
  },
} as const;

export const productSchema = {
  type: 'object',
  required: ['id', 'name', 'price', 'stock', 'category'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 1 },
    price: { type: 'integer', minimum: 0 },
    stock: { type: 'integer', minimum: 0 }, // SPEC FR-09-1: 재고는 음수가 될 수 없다
    category: { type: 'string' },
  },
} as const;

export const productListSchema = {
  type: 'object',
  required: ['page', 'size', 'total', 'items'],
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1 },
    size: { type: 'integer', minimum: 1, maximum: 50 },
    total: { type: 'integer', minimum: 0 },
    items: { type: 'array', items: productSchema },
  },
} as const;

export const signupSchema = {
  type: 'object',
  required: ['id', 'email'],
  additionalProperties: false, // password가 섞여 나오면 실패해야 한다
  properties: {
    id: { type: 'integer', minimum: 1 },
    email: { type: 'string', format: 'email' },
  },
} as const;

export const loginSchema = {
  type: 'object',
  required: ['token', 'user'],
  additionalProperties: false,
  properties: {
    token: { type: 'string', minLength: 8 },
    user: {
      type: 'object',
      required: ['id', 'email'],
      additionalProperties: false,
      properties: {
        id: { type: 'integer' },
        email: { type: 'string' },
      },
    },
  },
} as const;

export const cartSchema = {
  type: 'object',
  required: ['items', 'totalQty', 'totalPrice'],
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['itemId', 'productId', 'name', 'price', 'qty', 'subtotal'],
        additionalProperties: false,
        properties: {
          itemId: { type: 'integer', minimum: 1 },
          productId: { type: 'integer', minimum: 1 },
          name: { type: 'string' },
          price: { type: 'integer', minimum: 0 },
          qty: { type: 'integer', minimum: 1, maximum: 99 }, // SPEC FR-06-2
          subtotal: { type: 'integer', minimum: 0 },
        },
      },
    },
    totalQty: { type: 'integer', minimum: 0 },
    totalPrice: { type: 'integer', minimum: 0 }, // SPEC FR-07-1: 음수 불가
  },
} as const;

export const orderSchema = {
  type: 'object',
  required: ['orderId', 'totalPrice', 'discount', 'finalPrice', 'items', 'createdAt'],
  additionalProperties: false,
  properties: {
    orderId: { type: 'integer', minimum: 1 },
    totalPrice: { type: 'integer', minimum: 0 },
    discount: { type: 'integer', minimum: 0 }, // SPEC FR-09-6: 원 단위 절사 -> 정수
    finalPrice: { type: 'integer', minimum: 0 }, // SPEC FR-09-5: 0원 미만 불가
    items: { type: 'array', minItems: 1 },
    createdAt: { type: 'string', format: 'date-time' }, // SPEC FR-09: ISO-8601
  },
} as const;
