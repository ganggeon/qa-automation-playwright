// Match reviewed defects exactly; never change the collection's assertions.
const known = [
  ['BUG-001', '회원가입 - 경계값 비밀번호 21자 (400 기대 / BUG-001)', '[BUG-001] 21자 비밀번호는 거부되어야 한다', 201],
  ['BUG-006', '상품 목록 - 경계값 size=0 (400 기대 / BUG-006)', '[BUG-006] size=0은 400으로 거부되어야 한다', 200],
  ['BUG-008', '장바구니 담기 - 경계값 수량 0 (400 기대 / BUG-008)', '[BUG-008] 수량 0은 400으로 거부되어야 한다', 201],
];

function verdict(summary) {
  const run = summary?.run;
  const issues = [];
  if (!run || !Array.isArray(run.failures) || !Array.isArray(run.executions)) {
    return { ok: false, known: [], issues: ['Missing or invalid Newman results'] };
  }
  if (run.error) issues.push('Newman execution error');
  // Reviewed baseline: incomplete runs or changed coverage require review.
  if (run.stats?.requests?.total !== 14 || run.stats?.assertions?.total !== 28)
    issues.push('Expected 14 requests and 28 assertions; review coverage');
  for (const [name, stat] of Object.entries(run.stats || {})) {
    if (name !== 'assertions' && stat.failed > 0) issues.push(name + ' execution failure');
    if (stat.pending > 0) issues.push(name + ' incomplete');
  }
  const matched = [];
  const remaining = [...run.failures];
  for (const [id, item, assertion, status] of known) {
    const message = 'expected response to have status code 400 but got ' + status;
    const index = remaining.findIndex(f => f.source?.name === item &&
      f.error?.name === 'AssertionError' && f.error?.test === assertion &&
      f.error?.message === message);
    const executions = run.executions.filter(e => e.item?.name === item);
    if (index < 0 || executions.length !== 1 || executions[0].response?.code !== status) {
      issues.push(id + ': expected reproduction missing or changed; review fix/baseline');
    } else {
      remaining.splice(index, 1);
      matched.push(id);
    }
  }
  if (remaining.length) issues.push(remaining.length + ' unexpected failure(s); inspect raw report');
  if (run.stats?.assertions?.failed !== run.failures.length)
    issues.push('Assertion failure count does not match failure records');
  if (run.executions.some(e => e.requestError || e.assertions?.some(a => a.skipped)))
    issues.push('Request error or skipped assertion');
  return { ok: issues.length === 0, known: matched, issues };
}
module.exports = { verdict, known };
