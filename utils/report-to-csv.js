/**
 * Playwright JSON 리포트 → QA 테스트 결과 보고서(CSV + 요약)
 *
 * 왜 만들었나?
 *   개발팀은 HTML 리포트를 보지만, QA 산출물로 제출해야 하는 건 보통
 *   "테스트케이스별 수행 결과 표"다. 매번 손으로 옮기는 대신 자동 변환한다.
 *
 * 사용법:
 *   npx playwright test            # reports/results.json 생성
 *   node utils/report-to-csv.js    # artifacts/생성물 갱신
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INPUT = path.join(ROOT, 'reports', 'results.json');
const OUT_CSV = path.join(ROOT, 'artifacts', '04-테스트수행결과.csv');
const OUT_MD = path.join(ROOT, 'artifacts', '04-테스트수행결과-요약.md');

if (!fs.existsSync(INPUT)) {
  console.error(`리포트가 없습니다: ${INPUT}\n먼저 "npx playwright test" 를 실행하세요.`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

/** 중첩된 suite 구조를 평탄하게 펼친다 */
function collectSpecs(suite, acc = []) {
  for (const child of suite.suites ?? []) collectSpecs(child, acc);
  for (const spec of suite.specs ?? []) acc.push({ ...spec, file: suite.file ?? spec.file });
  return acc;
}

const specs = [];
for (const suite of report.suites ?? []) collectSpecs(suite, specs);

/** "TC-API-CART-002 | [경계값] 수량 0 → 400" 에서 ID와 설명을 분리한다 */
function splitTitle(title) {
  const idx = title.indexOf('|');
  if (idx < 0) return { id: '', name: title.trim() };
  return { id: title.slice(0, idx).trim(), name: title.slice(idx + 1).trim() };
}

const rows = [];
for (const spec of specs) {
  for (const t of spec.tests ?? []) {
    const result = t.results?.[t.results.length - 1] ?? {};
    const { id, name } = splitTitle(spec.title);

    // test.fail() 은 annotations 에 { type: 'fail', description } 로 남는다.
    const failAnnotation = (t.annotations ?? []).find((a) => a.type === 'fail');
    const knownBug = failAnnotation?.description ?? '';
    const bugId = (knownBug.match(/((?:EXT-)?BUG-\d+)/) ?? [])[1] ?? '';

    // Playwright 판정
    //   expected  : 기대대로 (통과 또는 "실패할 것으로 표시된 테스트가 실패")
    //   unexpected: 기대와 다름 (진짜 실패)
    let verdict;
    if (t.status === 'expected' && failAnnotation) verdict = '결함확인'; // 알려진 결함 재현됨
    else if (t.status === 'expected') verdict = 'Pass';
    else if (t.status === 'skipped') verdict = 'Skip';
    else if (t.status === 'flaky') verdict = 'Flaky';
    else verdict = 'Fail';

    rows.push({
      id,
      name,
      project: t.projectName ?? '',
      file: (spec.file ?? '').replace(/\\/g, '/'),
      verdict,
      bugId,
      note: knownBug,
      ms: result.duration ?? 0,
    });
  }
}

rows.sort((a, b) => (a.id || a.name).localeCompare(b.id || b.name));

// ── CSV ────────────────────────────────────────────────────────────────────
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const header = ['TC ID', '테스트 항목', '대상', '수행결과', '관련 결함', '비고', '소요(ms)', '파일'];
const csv = [
  header.map(esc).join(','),
  ...rows.map((r) => [r.id, r.name, r.project, r.verdict, r.bugId, r.note, r.ms, r.file].map(esc).join(',')),
].join('\r\n');

fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
// Excel에서 한글이 깨지지 않도록 BOM을 붙인다.
fs.writeFileSync(OUT_CSV, '﻿' + csv, 'utf8');

// ── 요약 ───────────────────────────────────────────────────────────────────
const count = (v) => rows.filter((r) => r.verdict === v).length;
const bugs = [...new Set(rows.map((r) => r.bugId).filter(Boolean))].sort();
const byProject = {};
for (const r of rows) {
  byProject[r.project] ??= { total: 0, pass: 0, defect: 0, fail: 0 };
  byProject[r.project].total++;
  if (r.verdict === 'Pass') byProject[r.project].pass++;
  if (r.verdict === '결함확인') byProject[r.project].defect++;
  if (r.verdict === 'Fail') byProject[r.project].fail++;
}

const totalMs = rows.reduce((s, r) => s + r.ms, 0);

// 이 문서가 "전체 결과"인지 "일부 프로젝트만 돌린 결과"인지 밝힌다.
// 밝히지 않으면 부분 실행 결과가 전체 결과 문서로 오인된다.
// (CI의 local job은 api+ui만 돌리는데, 그 산출물이 전체 156건짜리 보고서처럼 보였다)
const ranProjects = Object.keys(byProject);
const ALL_PROJECTS = ['setup', 'api', 'ui', 'ui-firefox', 'ui-webkit', 'external-api', 'external-ui'];
const missing = ALL_PROJECTS.filter((p) => !ranProjects.includes(p));
const scopeLine =
  missing.length === 0
    ? '**범위: 전체 스위트**(모든 프로젝트 실행)'
    : `**범위: 부분 실행** — 실행됨 \`${ranProjects.join('`, `')}\` / 미실행 \`${missing.join('`, `')}\`\n>\n> ⚠️ 이 수치는 전체 결과가 아닙니다. 릴리스 판단에는 전체 실행 결과를 쓰십시오.`;

// 벽시계 시간(실제 소요)과 테스트 소요 시간 합계는 다르다. 병렬 실행이라
// 합계가 벽시계보다 훨씬 크게 나온다. 둘 다 표기해 혼동을 없앤다.
const wallMs = report.stats?.duration ?? 0;

const md = `# 테스트 수행 결과 요약 (자동 생성)

> \`node utils/report-to-csv.js\` 로 Playwright 실행 결과에서 자동 생성된 문서입니다.
> 상세 내역: [04-테스트수행결과.csv](04-테스트수행결과.csv)
>
> ${scopeLine}

## 총괄

| 항목 | 값 |
|---|---:|
| 총 테스트케이스 | ${rows.length} |
| Pass (정상 동작 확인) | ${count('Pass')} |
| 결함확인 (알려진 결함 재현) | ${count('결함확인')} |
| Fail (미해결/예상 밖 실패) | ${count('Fail')} |
| Flaky | ${count('Flaky')} |
| Skip | ${count('Skip')} |
| 검출 결함 수 | ${bugs.length} |
| 실제 소요 시간 (벽시계) | ${(wallMs / 1000).toFixed(1)}초 |
| 테스트 소요 시간 합계 | ${(totalMs / 1000).toFixed(1)}초 (병렬 실행이라 벽시계보다 큼) |

## 대상별

| 대상 | 총계 | Pass | 결함확인 | Fail |
|---|---:|---:|---:|---:|
${Object.entries(byProject)
  .map(([k, v]) => `| ${k} | ${v.total} | ${v.pass} | ${v.defect} | ${v.fail} |`)
  .join('\n')}

## 검출된 결함

${bugs.length === 0 ? '_없음_' : bugs.map((b) => `- **${b}** — ${rows.filter((r) => r.bugId === b).length}건의 테스트케이스에서 검출`).join('\n')}

---
_생성 시각: ${new Date().toISOString()}_
`;

fs.writeFileSync(OUT_MD, md, 'utf8');

console.log(`총 ${rows.length}건  |  Pass ${count('Pass')}  결함확인 ${count('결함확인')}  Fail ${count('Fail')}`);
console.log(`검출 결함 ${bugs.length}건: ${bugs.join(', ')}`);
console.log(`→ ${path.relative(ROOT, OUT_CSV)}`);
console.log(`→ ${path.relative(ROOT, OUT_MD)}`);
