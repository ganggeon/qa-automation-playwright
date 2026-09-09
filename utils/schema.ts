import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { expect } from '@playwright/test';

/**
 * JSON 스키마 검증 유틸
 *
 * 왜 필요한가?
 *   API 테스트에서 값만 검사하면(`expect(body.id).toBe(1)`) 계약(Contract) 변화를 놓친다.
 *   필드가 사라지거나, 타입이 number -> string 으로 바뀌거나, null이 들어오는 사고는
 *   "값 비교"로는 잘 안 잡힌다. 스키마 검증은 응답의 '모양'을 통째로 검사한다.
 *
 * [TypeScript 메모]
 *   `data: unknown` 은 "뭐가 올지 모른다"는 뜻이다. `any`와 달리 그냥 쓸 수 없고
 *   검사한 뒤에야 쓸 수 있다. 외부에서 받은 데이터에는 unknown이 정답이다.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export type SchemaResult = {
  valid: boolean;
  errors: string[];
};

export function validateSchema(schema: object, data: unknown): SchemaResult {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim()
  );
  return { valid, errors };
}

/** 스키마에 맞지 않으면 어디가 틀렸는지 보여주며 테스트를 실패시킨다. */
export function expectSchema(schema: object, data: unknown, label = '응답'): void {
  const { valid, errors } = validateSchema(schema, data);
  expect(
    valid,
    `${label} 스키마 불일치:\n - ${errors.join('\n - ')}\n실제 값: ${JSON.stringify(data, null, 2)}`
  ).toBe(true);
}
