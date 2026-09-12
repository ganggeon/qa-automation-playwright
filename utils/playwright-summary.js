// Read an existing Playwright JSON report; never run tests or copy raw attachments.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PROJECTS = ['setup', 'api', 'ui', 'ui-firefox', 'ui-webkit', 'external-api', 'external-ui'];
const LABELS = ['Pass', '알려진 실패 재현', '예상 밖 결과', 'Flaky', 'Skip'];
function summarize(report) {
  if (!Array.isArray(report.suites) || !report.stats || !Array.isArray(report.errors)) throw new Error('Playwright 리포트 구조가 올바르지 않습니다.');
  const rows = [];
  function walk(suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      if (!PROJECTS.includes(test.projectName)) throw new Error('검토되지 않은 프로젝트입니다.');
      if (!['expected', 'unexpected', 'flaky', 'skipped'].includes(test.status)) throw new Error('알 수 없는 테스트 상태입니다.');
      const last = test.results?.at(-1);
      let verdict;
      if (test.status === 'skipped') verdict = 'Skip';
      else if (test.status === 'flaky') verdict = 'Flaky';
      else if (test.status === 'unexpected') verdict = '예상 밖 결과';
      else if (test.expectedStatus === 'failed' && last?.status === 'failed') verdict = '알려진 실패 재현';
      else if (test.expectedStatus === 'passed' && last?.status === 'passed') verdict = 'Pass';
      else throw new Error('기대 상태와 실행 결과가 일치하지 않습니다.');
      // Allowlisted identifiers only: no titles, error bodies, credentials or local paths.
      const id = String(spec.title).match(/^(TC-[A-Z0-9-]+)(?:\s*\||\s*$)/)?.[1]
        ?? (test.projectName === 'setup' ? 'SETUP' : 'UNMAPPED');
      const bugs = [...new Set((test.annotations ?? []).filter(a => a.type === 'fail')
        .flatMap(a => String(a.description ?? '').match(/\b(?:EXT-)?BUG-\d+\b/g) ?? []))];
      rows.push({ id, project: test.projectName, verdict, bugs });
    }
    for (const child of suite.suites ?? []) walk(child);
  }
  walk(report);
  if (!rows.length) throw new Error('테스트 결과가 없습니다.');
  const stats = report.stats;
  for (const key of ['expected', 'unexpected', 'flaky', 'skipped']) {
    if (!Number.isInteger(stats[key]) || stats[key] < 0) throw new Error('결과 통계가 올바르지 않습니다.');
  }
  const counts = Object.fromEntries(LABELS.map(label => [label, rows.filter(r => r.verdict === label).length]));
  if (stats.expected !== counts.Pass + counts['알려진 실패 재현']
    || stats.unexpected !== counts['예상 밖 결과'] || stats.flaky !== counts.Flaky || stats.skipped !== counts.Skip) throw new Error('개별 결과와 집계 통계가 다릅니다.');
  if (!Number.isFinite(Date.parse(stats.startTime))) throw new Error('실행 시각이 없습니다.');
  return {
    rows, counts, startTime: new Date(stats.startTime).toISOString(), errors: report.errors.length,
    projects: PROJECTS.filter(p => rows.some(r => r.project === p)),
    missing: PROJECTS.filter(p => !rows.some(r => r.project === p)),
    bugs: [...new Set(rows.filter(r => r.verdict === '알려진 실패 재현').flatMap(r => r.bugs))].sort(),
  };
}
function markdown(s) {
  return [
    '## Playwright 결과', '',
    '실행 시각(UTC): ' + s.startTime,
    '결과가 있는 프로젝트: ' + s.projects.join(', '),
    '결과가 없는 프로젝트: ' + (s.missing.join(', ') || '없음'),
    '', '| 구분 | 건수 |', '|---|---:|',
    ...Object.entries(s.counts).map(([k, v]) => '| ' + k + ' | ' + v + ' |'),
    '| 실행 오류 | ' + s.errors + ' |',
    '', '알려진 실패 재현은 정상 Pass와 별도입니다. test.fail()의 기대 실패를 집계하며 실패 원인의 동일성까지 보증하지 않습니다.',
    '재현된 결함 ID: ' + (s.bugs.join(', ') || '없음'),
    'Flaky·Skip·예상 밖 결과·실행 오류를 함께 검토하십시오. 이 요약은 Job 종료 상태나 릴리스 승인을 대신하지 않습니다.',
    '외부 사이트 Job은 참고용으로 전체 워크플로 실패를 허용합니다. 이 결과에는 Newman이 포함되지 않습니다.', '',
  ].join('\n');
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function html(s, hash) {
  const e = escapeHtml;
  return '<!doctype html>\n<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>QA 테스트 결과 — ' + e(s.startTime.slice(0, 10)) + '</title>'
    + '<style>body{font:16px/1.65 system-ui,sans-serif;max-width:1050px;margin:40px auto;padding:0 20px;color:#172536;background:#f7f9fc}table{border-collapse:collapse;width:100%;background:white;margin:20px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce2eb}th{background:#e7eef7}.notice{border-left:4px solid #ad6700;background:#fff2d8;padding:16px}code{overflow-wrap:anywhere}a{color:#0757aa}</style>'
    + '<main><h1>QA 테스트 결과</h1><p class="notice">보관된 로컬 Playwright 실행의 정적 스냅샷입니다. 최신 CI 상태나 릴리스 승인 결과가 아닙니다. 알려진 실패 재현은 제품 결함 해결을 뜻하지 않습니다.</p>'
    + '<p>실행 시각(UTC): ' + e(s.startTime) + '<br>결과가 있는 프로젝트: ' + e(s.projects.join(', '))
    + '<br>결과가 없는 프로젝트: ' + e(s.missing.join(', ') || '없음') + '</p>'
    + '<table><caption>총 ' + s.rows.length + '건 — 브라우저별 실행과 setup 포함, Newman 제외</caption><thead><tr><th scope="col">구분</th><th scope="col">건수</th></tr></thead><tbody>'
    + Object.entries(s.counts).map(([k, v]) => '<tr><td>' + e(k) + '</td><td>' + v + '</td></tr>').join('')
    + '<tr><td>실행 오류</td><td>' + s.errors + '</td></tr></tbody></table>'
    + '<p>재현된 결함 ID: ' + e(s.bugs.join(', ') || '없음') + '</p>'
    + '<p>알려진 실패는 test.fail()과 마지막 실행 상태로 분류합니다. 같은 원인으로 실패했는지까지 증명하지 않습니다. Flaky·Skip·예상 밖 결과는 별도로 검토해야 합니다.</p>'
    + '<p><a href="https://github.com/ganggeon/qa-automation-playwright/blob/master/artifacts/03-%EA%B2%B0%ED%95%A8%EB%A6%AC%ED%8F%AC%ED%8A%B8.md">결함 내용과 재현 절차</a> · <a href="https://github.com/ganggeon/qa-automation-playwright/actions/workflows/qa.yml">최신 CI 실행 확인</a></p>'
    + '<h2>테스트별 결과</h2><p>공개 범위: 테스트 ID·프로젝트·판정·결함 ID. 원본 요청/응답, 계정, 로컬 경로, 스크린샷·영상·trace는 포함하지 않습니다.</p>'
    + '<table><thead><tr><th scope="col">테스트 ID</th><th scope="col">프로젝트</th><th scope="col">판정</th><th scope="col">관련 결함</th></tr></thead><tbody>'
    + s.rows.map(r => '<tr><td>' + e(r.id) + '</td><td>' + e(r.project) + '</td><td>' + e(r.verdict) + '</td><td>' + e(r.bugs.join(', ')) + '</td></tr>').join('\n')
    + '</tbody></table><p>원본 JSON SHA-256: <code>' + e(hash) + '</code></p></main></html>\n';
}
if (require.main === module) {
  try {
    const [input = 'reports/results.json', output] = process.argv.slice(2);
    const raw = fs.readFileSync(input);
    const s = summarize(JSON.parse(raw));
    const md = markdown(s);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, 'index.html'), html(s, crypto.createHash('sha256').update(raw).digest('hex')), { flag: 'wx' });
    }
    console.log(md);
  } catch (error) {
    const message = 'Playwright 요약 생성 실패: 결과 파일 누락 또는 형식/통계 오류입니다. 실행 로그를 확인하십시오.\n';
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, message);
    console.error(message, error.message);
    process.exitCode = 1;
  }
}
module.exports = { summarize, markdown, html };
