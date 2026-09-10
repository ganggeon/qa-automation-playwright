const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verdict, known } = require('./newman-verdict');
function baseline() {
  return { run: {
    stats: { requests: { total: 14, failed: 0 }, assertions: { total: 28, failed: 3 } },
    executions: known.map(([, name, , code]) => ({ item: { name }, response: { code } })),
    failures: known.map(([, name, test, code]) => ({
      source: { name }, error: { name: 'AssertionError', test,
        message: 'expected response to have status code 400 but got ' + code }
    })),
  } };
}
test('reviewed known defects remain visible', () => {
  const result = verdict(baseline());
  assert.equal(result.ok, true);
  assert.equal(result.known.length, 3);
});
for (const [name, mutate] of [
  ['same count but a new failure', s => { s.run.failures[0].error.test = 'new regression'; }],
  ['different error cause', s => { s.run.failures[0].error.message = 'server timeout'; }],
  ['wrong request identity', s => { s.run.failures[0].source.name = 'another request'; }],
  ['different actual status', s => { s.run.executions[0].response.code = 500; }],
  ['known defect now passes', s => { s.run.failures.shift(); s.run.stats.assertions.failed = 2; }],
  ['duplicate failure', s => { s.run.failures.push(s.run.failures[0]); s.run.stats.assertions.failed++; }],
  ['incomplete coverage', s => { s.run.stats.requests.total = 13; }],
  ['runtime error', s => { s.run.error = { message: 'stopped' }; }],
  ['request error', s => { s.run.executions[0].requestError = { message: 'ECONNREFUSED' }; }],
  ['skipped assertion', s => { s.run.executions[0].assertions = [{ skipped: true }]; }],
]) {
  test(name + ' fails CI', () => { const s = baseline(); mutate(s); assert.equal(verdict(s).ok, false); });
}
test('missing report fails closed', () => assert.equal(verdict({}).ok, false));

test('real Newman serialized results preserve exact failure matching', async () => {
  const http = require('node:http');
  const newman = require('newman');
  const server = http.createServer((req, res) => {
    res.writeHead(Number(req.url.slice(1)) || 200);
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    const items = known.map(([, name, assertion, status]) => ({
      name, request: { method: 'GET', url: url + '/' + status },
      event: [{ listen: 'test', script: { exec: [
        'pm.test(' + JSON.stringify(assertion) + ', function () { pm.response.to.have.status(400); });'
      ] } }],
    }));
    for (let i = 0; i < 11; i++) {
      items.push({ name: 'normal-' + i, request: { method: 'GET', url: url + '/200' },
        event: [{ listen: 'test', script: { exec: Array.from({ length: i === 10 ? 5 : 2 },
          (_, j) => 'pm.test("normal-' + j + '", function () { pm.response.to.have.status(200); });') } }] });
    }
    const summary = await new Promise((resolve, reject) => newman.run({
      collection: { info: { name: 'Local verdict verification',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: items },
      reporters: [], timeoutRequest: 2000, timeout: 15000,
    }, (error, result) => error ? reject(error) : resolve(result)));
    assert.deepEqual(verdict(JSON.parse(JSON.stringify(summary))),
      { ok: true, known: ['BUG-001', 'BUG-006', 'BUG-008'], issues: [] });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});