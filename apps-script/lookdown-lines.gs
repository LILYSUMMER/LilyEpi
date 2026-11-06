/**
 * LOOK DOWN 1단계 「돌려보내기」 — 관객이 두고 간 한 줄을 구글 시트에 쌓고, 다음 사람에게 돌려주는 웹 앱입니다.
 *
 * 1. 새 구글 시트를 만들고 [확장 프로그램] > [Apps Script]를 엽니다.
 * 2. 이 파일 내용을 그대로 붙여 넣고 저장합니다.
 * 3. [배포] > [새 배포] > 유형 "웹 앱", 실행 사용자 "나", 액세스 권한 "모든 사용자"로 배포합니다.
 * 4. 나온 웹 앱 주소(…/exec)를 lookdown/lookdown-v1.js 의 V1_ENDPOINT 에 넣습니다.
 *
 * GET  …/exec            → { lines: [최근 문장 200개] }
 * POST …/exec (text/plain JSON { line, lang, at }) → 시트에 한 줄 추가
 * 코드를 고친 뒤에는 [배포] > [배포 관리]에서 새 버전으로 다시 배포해야 반영됩니다.
 */

const SHEET_NAME = '두고 간 말';
const HEADERS = ['시각', '문장', '언어', '보임'];
const MAX_LINES = 200;
const MAX_LEN = 60;

function doGet() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  let lines = [];
  if (last > 1) {
    const from = Math.max(2, last - MAX_LINES * 2);
    const rows = sheet.getRange(from, 1, last - from + 1, 4).getValues();
    lines = rows.filter((r) => r[1] && r[3] !== 'N').map((r) => String(r[1])).slice(-MAX_LINES);
  }
  return ContentService.createTextOutput(JSON.stringify({ lines })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  const line = clean(body.line);
  if (!line) return ContentService.createTextOutput('empty');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 4번째 칸 "보임"을 N 으로 바꾸면 그 줄은 내려가지 않습니다(작가가 시트에서 거를 수 있게).
    getSheet().appendRow([new Date(), line, clean(body.lang).slice(0, 5) || 'ko', 'Y']);
  } finally { lock.releaseLock(); }
  return ContentService.createTextOutput('ok');
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) { sheet.appendRow(HEADERS); sheet.setFrozenRows(1); }
  return sheet;
}

function clean(v) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
}
