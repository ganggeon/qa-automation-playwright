# 결과 요약과 HTML 공개

README의 CI 배지는 master의 QA Test Suite 상태다. 외부 사이트 Job은 실패가 허용되고,
Newman은 알려진 결함 3건의 정확한 재현을 별도 판정하므로 초록불이 제품 정상이나 릴리스 승인은 아니다.

utils/playwright-summary.js는 기존 Playwright JSON을 읽어 정상 Pass, 알려진 실패 재현,
예상 밖 결과(기대 실패가 통과한 경우 포함), Flaky, Skip, 실행 오류를 분리한다.
결과가 있는/없는 프로젝트를 표시하며 테스트를 실행하지 않는다.
test.fail() 재현은 같은 결함 원인의 재현까지 보증하지 않는다. Newman 판정은 별도다.
JSON이 없거나 통계가 맞지 않으면 요약 생성 단계도 실패한다.

## 로컬 검토

node utils/playwright-summary.js reports/results.json

HTML을 만들려면 두 번째 인자로 새로운 출력 폴더를 지정한다.
기존 index.html은 덮어쓰지 않는다. 파일과 테스트 데이터는 삭제하지 않는다.

node utils/playwright-summary.js reports/results.json reports/new-preview-folder

공개 준비 파일: docs/site/index.html.
2026-09-09T13:13:30.884Z 로컬 실행의 보관 스냅샷이며 최신 CI 결과가 아니다.
총 176건의 테스트 ID, 프로젝트, 판정, 결함 ID, 실행 시각, 원본 JSON의 SHA-256만 공개한다.
원본 JSON, 요청/응답, 계정, 로컬 경로, 스크린샷, 영상, trace, 개인 학습 기록은 포함하지 않는다.
이 HTML은 Playwright 원본 HTML 뷰어가 아닌 공개용 결과 표다.

## 게시 절차 (아직 미실행)

1. README, 요약 코드, 두 workflow, 이 문서, docs/site/index.html을 검토한다.
2. 승인 후 작업 브랜치에 커밋/push하고 PR 필수 체크를 확인한다. 보호 규칙을 우회하지 않는다.
3. 병합 승인 후 master에 반영한다. 브랜치를 삭제하지 않는다.
4. 저장소 Pages의 Source를 GitHub Actions로 설정한다.
5. Publish reviewed QA report를 master에서 수동 실행한다.
6. 실제 반환된 Pages URL을 열어 확인한 뒤 README에 게시 링크를 추가한다.

게시 workflow는 docs/site만 업로드하고 테스트를 실행하지 않는다.
QA 실행마다 자동 갱신하지 않으므로 스냅샷 날짜를 항상 확인한다.
이 준비 작업은 원격 게시/병합/Actions 실행이 완료되었다는 의미가 아니다.
