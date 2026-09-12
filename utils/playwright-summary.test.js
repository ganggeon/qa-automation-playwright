const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize, markdown, html } = require('./playwright-summary');
function report(tests, errors = []) {
  const stats = { startTime: '2026-09-09T13:13:30.884Z', expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  for (const t of tests) stats[t.status]++;
  return { stats, errors, suites: [{ suites: [{ specs: tests.map(t => ({ title: 'TC-API-EXAMPLE-001 | private-title', tests: [{ projectName: 'api', expectedStatus: 'passed', results: [{ status: 'passed' }], ...t }] })) }] }] };
}
test('normal pass and reproduced expected failures remain separate', () => {
  const s = summarize(report([{ status: 'expected' }, { status: 'expected', expectedStatus: 'failed', results: [{ status: 'failed' }], annotations: [{ type: 'fail', description: 'BUG-001: private-details' }] }]));
  assert.equal(s.counts.Pass, 1);
  assert.equal(s.counts['알려진 실패 재현'], 1);
  assert.deepEqual(s.bugs, ['BUG-001']);
});
test('unexpected pass of a known failure is not a reproduced defect', () => {
  const s = summarize(report([{ status: 'unexpected', expectedStatus: 'failed', annotations: [{ type: 'fail', description: 'BUG-001' }] }]));
  assert.equal(s.counts['예상 밖 결과'], 1);
  assert.equal(s.counts['알려진 실패 재현'], 0);
  assert.deepEqual(s.bugs, []);
});
test('flaky and skipped cases do not become normal passes', () => {
  const s = summarize(report([{ status: 'flaky' }, { status: 'skipped', results: [] }]));
  assert.equal(s.counts.Pass, 0);
  assert.equal(s.counts.Flaky, 1);
  assert.equal(s.counts.Skip, 1);
});
test('partial execution and global errors remain visible', () => {
  const s = summarize(report([{ status: 'expected' }], [{ message: 'private-error' }]));
  assert.deepEqual(s.projects, ['api']);
  assert.ok(s.missing.includes('ui'));
  assert.equal(s.errors, 1);
  assert.match(markdown(s), /실행 오류 \| 1/);
});
test('rejects missing, empty and mismatched statistics', () => {
  assert.throws(() => summarize({}));
  assert.throws(() => summarize(report([])));
  const r = report([{ status: 'expected' }]);
  r.stats.expected = 2;
  assert.throws(() => summarize(r), /집계/);
});
test('does not label a timeout as reproduction of an expected assertion failure', () => {
  assert.throws(() => summarize(report([{ status: 'expected', expectedStatus: 'failed', results: [{ status: 'timedOut' }] }])));
});
test('public outputs omit titles, error bodies, annotation prose and attachments', () => {
  const r = report([{ status: 'expected', expectedStatus: 'failed', annotations: [{ type: 'fail', description: 'BUG-001 private-annotation', location: { file: 'private-path' } }], results: [{ status: 'failed', attachments: [{ path: 'private-attachment' }] }] }], [{ message: 'private-error' }]);
  const s = summarize(r);
  const rendered = markdown(s) + html(s, 'abc123');
  assert.doesNotMatch(rendered, /private-/);
  assert.match(rendered, /TC-API-EXAMPLE-001/);
  assert.match(rendered, /BUG-001/);
  assert.match(rendered, /2026-09-09T13:13:30.884Z/);
});
test('rejects unreviewed projects instead of publishing arbitrary metadata', () => {
  assert.throws(() => summarize(report([{ status: 'expected', projectName: 'private-project' }])));
});
