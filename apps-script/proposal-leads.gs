/**
 * 사업 제안서 신청을 구글 시트에 한 줄씩 쌓고, 새 신청이 오면 메일로 알려 주는 웹 앱입니다.
 *
 * 1. 새 구글 시트를 만들고 [확장 프로그램] > [Apps Script]를 엽니다.
 * 2. 이 파일 내용을 그대로 붙여 넣고 저장합니다.
 * 3. 위쪽 함수 목록에서 testNotify를 골라 [실행]합니다. 권한을 허용하면 NOTIFY_TO로 시험 메일이 갑니다.
 * 4. [배포] > [새 배포] > 유형 "웹 앱", 실행 사용자 "나", 액세스 권한 "모든 사용자"로 배포합니다.
 * 5. 나온 웹 앱 주소(…/exec)를 proposal-download.html과 en/proposal-download.html의
 *    GOOGLE_APPS_SCRIPT_URL에 넣습니다.
 *
 * 코드를 고친 뒤에는 [배포] > [배포 관리]에서 새 버전으로 다시 배포해야 반영됩니다.
 * [새 배포]를 또 만들면 주소가 바뀌어 홈페이지와 연결이 끊깁니다.
 */

const SHEET_NAME = '제안서 신청';
const HEADERS = ['신청 시각', '이름', '기관/회사', '직책', '이메일', '연락처', '관심 분야', '언어', '페이지'];
const NOTIFY_TO = 'contact@epispace.kr';

function doPost(e) {
  const p = (e && e.parameter) || {};

  // 화면에 보이지 않는 칸입니다. 값이 들어 있으면 자동 입력 스팸으로 보고 버립니다.
  if (p.website) {
    return ContentService.createTextOutput('ok');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let sheetUrl;
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
    sheetUrl = book.getUrl();
  } finally {
    lock.releaseLock();
  }

  // 시트에는 이미 적혔으므로, 메일이 실패해도 신청은 남습니다.
  try {
    notify(p, sheetUrl);
  } catch (err) {
    console.error(err);
  }

  return ContentService.createTextOutput('ok');
}

function doGet() {
  return ContentService.createTextOutput('ok');
}

// 알림 메일에서 [답장]을 누르면 신청한 분의 이메일로 바로 갑니다.
function notify(p, sheetUrl) {
  const v = (key) => String(p[key] || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const lang = { ko: '한국어', en: '영어' }[v('lang')] || v('lang');

  const body = [
    '홈페이지에서 사업 제안서 신청이 들어왔습니다.',
    '',
    '이름: ' + v('name'),
    '기관/회사: ' + v('company'),
    '직책: ' + v('position'),
    '이메일: ' + v('email'),
    '연락처: ' + v('phone'),
    '관심 분야: ' + v('interest'),
    '신청한 페이지: ' + lang,
    '',
    '전체 신청 목록: ' + sheetUrl,
  ].join('\n');

  const options = { name: '에피스페이스 홈페이지' };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) {
    options.replyTo = v('email');
  }

  MailApp.sendEmail(NOTIFY_TO, '[제안서 신청] ' + v('company') + ' ' + v('name'), body, options);
}

// 편집기에서 한 번 실행하면 메일 보내기 권한을 허용하고, 시험 메일로 모양을 확인할 수 있습니다.
function testNotify() {
  notify({
    name: '시험 메일',
    company: '에피스페이스',
    position: '대표',
    email: 'test@example.com',
    interest: '기타',
    lang: 'ko',
  }, SpreadsheetApp.getActiveSpreadsheet().getUrl());
}

// =, +, -, @로 시작하는 값은 시트가 수식으로 읽기 때문에 글자로 고정합니다.
function clean(value) {
  const text = String(value || '').trim().slice(0, 500);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
