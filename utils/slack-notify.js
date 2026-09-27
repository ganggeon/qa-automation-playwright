// Build the CI Slack message from job results; never report a missing, skipped or cancelled job as passed.
const REQUIRED = [
  ['local', 'MiniShop API + UI'],
  ['rebuilt', '로그인 재구현판'],
  ['newman', 'Postman 컬렉션'],
  ['cross-browser', '크로스 브라우저'],
];
const LABELS = { success: '성공', failure: '실패', cancelled: '취소', skipped: '미실행', missing: '결과 없음' };
const label = result => LABELS[result] ?? result;
function verdict(needs) {
  const jobs = REQUIRED.map(([id, name]) => ({ id, name, result: needs?.[id]?.result ?? 'missing' }));
  // continue-on-error reports needs.external.result as success even when tests fail; read the test step outcome instead.
  const external = needs?.external?.outputs?.tests || 'missing';
  return { ok: jobs.every(j => j.result === 'success'), jobs, external };
}
function message(v, run) {
  const url = run.server + '/' + run.repository + '/actions/runs/' + run.id;
  return { text: [
    (v.ok ? '✅ QA 필수 검사 통과' : '❌ QA 필수 검사 통과 아님') + ' — ' + run.ref + ' `' + String(run.sha).slice(0, 7) + '` (' + run.event + ')',
    ...v.jobs.map(j => '• ' + j.name + ': ' + label(j.result)),
    '• 외부 데모 사이트 (실패 허용, 판정 제외): ' + label(v.external),
    '통과는 각 Job이 오류 없이 끝났다는 뜻이며 릴리스 승인이 아닙니다. 기대 실패(알려진 결함)와 원인 확인 여부는 실행 요약에서 확인하십시오.',
    '<' + url + '|실행 결과 보기>',
  ].join('\n') };
}
if (require.main === module) {
  (async () => {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) throw new Error('SLACK_WEBHOOK_URL Secret이 비어 있습니다.');
    const env = process.env;
    const body = message(verdict(JSON.parse(env.NEEDS_JSON || '{}')), {
      server: env.GITHUB_SERVER_URL, repository: env.GITHUB_REPOSITORY, id: env.GITHUB_RUN_ID,
      sha: env.GITHUB_SHA, ref: env.GITHUB_REF_NAME, event: env.GITHUB_EVENT_NAME,
    });
    const res = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // fetch does not throw on HTTP errors (e.g. a revoked webhook); check the status explicitly.
    if (!res.ok) throw new Error('Slack 응답 ' + res.status + ' ' + (await res.text()));
    console.log(body.text);
  })().catch(error => {
    console.error('Slack 알림 실패:', error.message);
    process.exitCode = 1;
  });
}
module.exports = { verdict, message, REQUIRED };
