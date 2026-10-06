/**
 * 사업 제안서 신청을 구글 시트에 한 줄씩 쌓는 웹 앱입니다.
 *
 * 1. 새 구글 시트를 만들고 [확장 프로그램] > [Apps Script]를 엽니다.
 * 2. 이 파일 내용을 그대로 붙여 넣고 저장합니다.
 * 3. [배포] > [새 배포] > 유형 "웹 앱", 실행 사용자 "나", 액세스 권한 "모든 사용자"로 배포합니다.
 * 4. 나온 웹 앱 주소(…/exec)를 proposal-download.html과 en/proposal-download.html의
 *    GOOGLE_APPS_SCRIPT_URL에 넣습니다.
 *
 * 코드를 고친 뒤에는 [배포] > [배포 관리]에서 새 버전으로 다시 배포해야 반영됩니다.
 */

const SHEET_NAME = '제안서 신청';
const HEADERS = ['신청 시각', '이름', '기관/회사', '직책', '이메일', '연락처', '관심 분야', '언어', '페이지'];

function doPost(e) {
  const p = (e && e.parameter) || {};

  // 화면에 보이지 않는 칸입니다. 값이 들어 있으면 자동 입력 스팸으로 보고 버립니다.
  if (p.website) {
    return ContentService.createTextOutput('ok');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      new Date(),
      clean(p.name),
      clean(p.company),
      clean(p.position),
      clean(p.email),
      clean(p.phone),
      clean(p.interest),
      clean(p.lang),
      clean(p.page),
    ]);
  } finally {
    lock.releaseLock();
  }

  return ContentService.createTextOutput('ok');
}

function doGet() {
  return ContentService.createTextOutput('ok');
}

// =, +, -, @로 시작하는 값은 시트가 수식으로 읽기 때문에 글자로 고정합니다.
function clean(value) {
  const text = String(value || '').trim().slice(0, 500);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
