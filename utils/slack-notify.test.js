const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verdict, message, REQUIRED } = require('./slack-notify');
function allSuccess() {
  const needs = Object.fromEntries(REQUIRED.map(([id]) => [id, { result: 'success', outputs: {} }]));
  needs.external = { result: 'success', outputs: { tests: 'success' } };
  return needs;
}
const run = { server: 'https://github.com', repository: 'o/r', id: '42', sha: '6963316abcdef', ref: 'master', event: 'push' };
test('all required jobs succeeded', () => {
  const v = verdict(allSuccess());
  assert.equal(v.ok, true);
  assert.match(message(v, run).text, /^✅ QA 필수 검사 통과 — master `6963316` \(push\)/);
});
for (const [id] of REQUIRED) {
  for (const result of ['failure', 'cancelled', 'skipped', 'neutral']) {
    test(id + ' ' + result + ' is not passed', () => {
      const needs = allSuccess();
      needs[id].result = result;
      assert.equal(verdict(needs).ok, false);
    });
  }
  test(id + ' missing is not passed', () => {
    const needs = allSuccess();
    delete needs[id];
    const v = verdict(needs);
    assert.equal(v.ok, false);
    assert.match(message(v, run).text, /결과 없음/);
  });
}
test('empty needs is not passed', () => assert.equal(verdict({}).ok, false));
test('external failure hidden by continue-on-error is shown but allowed', () => {
  const needs = allSuccess();
  needs.external.outputs.tests = 'failure';
  const v = verdict(needs);
  assert.equal(v.ok, true);
  assert.match(message(v, run).text, /외부 데모 사이트 \(실패 허용, 판정 제외\): 실패/);
});
test('external without test outcome is shown as missing', () => {
  const needs = allSuccess();
  needs.external.outputs = {};
  assert.match(message(verdict(needs), run).text, /외부 데모 사이트 \(실패 허용, 판정 제외\): 결과 없음/);
});
test('message links to the run', () => {
  assert.match(message(verdict(allSuccess()), run).text, /<https:\/\/github\.com\/o\/r\/actions\/runs\/42\|실행 결과 보기>/);
});
