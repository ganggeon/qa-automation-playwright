const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const newman = require('newman');
const { verdict } = require('./newman-verdict');

async function main() {
  const root = path.resolve(__dirname, '..');
  const dir = path.join(root, 'reports', 'newman',
    new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
  fs.mkdirSync(dir, { recursive: true });
  const raw = path.join(dir, 'results.json');
  let server;
  let decision;
  try {
    // A new in-memory SUT belongs solely to this invocation. Never reuse port 4010.
    const app = require('../sut/server');
    server = http.createServer((req, res) => {
      if (req.method === 'DELETE' || req.url.split('?')[0] === '/api/_reset') {
        res.writeHead(403);
        res.end('Reset/deletion requests are disabled in this runner');
        return;
      }
      app(req, res);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const baseUrl = 'http://127.0.0.1:' + server.address().port;
    const collection = JSON.parse(fs.readFileSync(
      path.join(root, 'postman/minishop.postman_collection.json'), 'utf8'));
    const preparation = collection.item[0]?.item?.[0];
    if (preparation?.request?.url?.raw !== '{{baseUrl}}/api/_reset') {
      throw new Error('Collection preparation changed; review the safe runner');
    }
    // Only the in-memory execution copy changes. Business assertions stay intact.
    // Keep the 200 readiness assertion and email setup, without resetting any data.
    preparation.name = 'SUT 준비 확인 (초기화 없음)';
    preparation.request = { method: 'GET', url: '{{baseUrl}}/api/products' };
    fs.writeFileSync(path.join(dir, 'executed-collection.json'), JSON.stringify(collection, null, 2));
    console.log('Isolated local SUT: ' + baseUrl + ' (reset disabled)');
    const summary = await new Promise((resolve, reject) => newman.run({
      collection,
      environment: { values: [{ key: 'baseUrl', value: baseUrl, enabled: true }] },
      reporters: ['cli', 'json', 'htmlextra'],
      reporter: { json: { export: raw }, htmlextra: { export: path.join(dir, 'index.html') } },
      timeoutRequest: 5000,
      timeoutScript: 5000,
      timeout: 60000,
    }, (error, result) => error ? reject(error) : resolve(result)));
    decision = verdict(summary);
    // Reporter failures must not result in a successful CI verdict.
    for (const file of [raw, path.join(dir, 'index.html')]) {
      if (!fs.existsSync(file) || fs.statSync(file).size === 0)
        throw new Error('Missing raw report: ' + file);
    }
  } catch (error) {
    decision = { ok: false, known: decision?.known || [], issues: [error.message] };
  } finally {
    if (server?.listening) {
      await new Promise(resolve => server.close(resolve));
    }
  }
  const markdown = [
    '## Newman CI 판정',
    decision.ok ? '예상한 결함 재현 확인. 제품 결함이 해결되었다는 뜻은 아닙니다.' :
      '검토 필요: 예상 결과와 다르거나 실행에 문제가 있습니다.',
    '',
    '미해결 결함 재현: ' + (decision.known.join(', ') || '확인된 항목 없음'),
    ...decision.issues.map(issue => '- ' + issue),
    '',
    '격리된 새 메모리 SUT 사용. 초기화 대신 GET 준비 확인 실행 (14요청 / 28검증).',
    '원본 JSON 및 HTML: newman-report 아티팩트의 이번 실행 폴더.',
    '원본 검증 실패는 리포트에 그대로 남습니다.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'verdict.md'), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
  console.log('Reports: ' + dir);
  process.exitCode = decision.ok ? 0 : 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
