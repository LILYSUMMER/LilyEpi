/* LOOK DOWN 1단계 「돌려보내기」 — ?v=1 로 켭니다. 0단계(lookdown.js)는 이 파일을 동적으로 불러 쓰고, 플래그가 없으면 건드리지 않습니다.
 *
 * 흐름(0단계 item 단계 뒤에 끼어듭니다):
 *   item    : 분실물이 떠 있는 동안 화면 가운데에 2.5초 머무르면(응시) → reading
 *   reading : 물건이 들려 올라오고, 안에 담긴 문장(먼저 다녀간 사람이 두고 간 말)이 자막으로 뜹니다. 폰을 옆으로 기울이면 → returning
 *   returning: 물건이 기울인 쪽으로 미끄러져 물속으로 돌아갑니다. 돌려보낸 수가 1 늘고 웅디가 그만큼 옅어집니다 → offer
 *   offer   : "두고 갈 말이 있나요?" 한 줄 입력. 보내거나 건너뛰면 → leaving(0단계)
 *
 * 저장: localStorage(ld_v1_*) + V1_ENDPOINT(Apps Script 웹 앱)가 있으면 그쪽에도 보냅니다. 서버가 없어도 동작합니다.
 * 수치는 맨 위 V 에 모아 두었습니다.
 */
import * as THREE from 'three';

const V = {
  gazeHold: 2.5,      // 응시 초. 물건이 화면 가운데 반경(gazeRadius, NDC) 안에 이만큼 머물면 건져 올립니다
  gazeRadius: 0.22,
  gazeGrace: 0.35,    // 잠깐 벗어나도 이만큼은 봐줍니다
  itemStay: 10.0,     // 1단계에서는 분실물이 이만큼 떠 있습니다(0단계 T.item=5 보다 길게, 응시할 시간을 줍니다)
  lift: 0.10,         // 건져 올렸을 때 물건이 떠오르는 높이(m)
  readMax: 14.0,      // 읽기 상태로 기다리는 최대 초. 지나면 그냥 가라앉습니다
  tiltDeg: 28,        // 돌려보내기 기울기(도). 읽기 시작 때의 자세를 0으로 잡고 거기서 이만큼
  swipePx: 70,        // 센서가 없을 때(책상 테스트): 가로로 이만큼 끌면 돌려보냄
  returnDur: 1.4,     // 돌아가는 데 걸리는 초
  fadeStep: 0.07,     // 돌려보낼 때마다 웅디가 옅어지는 비율
  fadeFloor: 0.35,    // 아무리 옅어져도 이만큼은 남습니다
};
export const V1_ENDPOINT = '';   // Apps Script 웹 앱 주소(…/exec). 비어 있으면 localStorage만 씁니다.

const STR = {
  ko: {
    gaze: '물건을 가만히 바라보세요',
    lifted: '옆으로 기울이면 돌려보냅니다',
    nosensor: '옆으로 쓸어 넘기면 돌려보냅니다',
    returned: '돌아갔습니다',
    offer: '두고 갈 말이 있나요?',
    placeholder: '한 줄이면 됩니다',
    send: '두고 가기',
    skip: '그냥 가기',
    thanks: '다음 사람이 건져 올릴 거예요',
    faded: (n) => `${n}번 돌려보냈습니다. 웅디가 조금 옅어졌어요.`,
  },
  en: {
    gaze: 'Hold your gaze on the object',
    lifted: 'Tilt sideways to send it back',
    nosensor: 'Swipe sideways to send it back',
    returned: 'Gone back',
    offer: 'Anything to leave behind?',
    placeholder: 'One line is enough',
    send: 'Leave it',
    skip: 'Just go',
    thanks: 'Someone will fish it up next',
    faded: (n) => `Sent back ${n === 1 ? 'once' : n + ' times'}. Woongdi is a little fainter.`,
  },
};
STR.zh = STR.en;

// 아직 아무도 두고 간 말이 없을 때 물건이 품고 있는 문장들(임시. 작가가 바꿔 쓰면 됩니다).
const SEED = {
  ko: [
    '늦었다고 말하려다 말았어.',
    '괜찮은 척이 제일 무거웠어.',
    '우산을 두고 온 날이 더 또렷해.',
    '그때 그냥 웃어 줄걸.',
    '아직 안 보낸 답장이 있어.',
    '비 오는 날엔 길을 잃어도 돼.',
  ],
  en: [
    'I almost said it was too late.',
    'Pretending to be fine was the heaviest part.',
    'I remember the day I left the umbrella more clearly.',
    'I should have just smiled then.',
    'There is a reply I never sent.',
    'On rainy days it is fine to get lost.',
  ],
};
SEED.zh = SEED.en;

/* ---------- 저장 ---------- */
const LS = { count: 'ld_v1_returned', mine: 'ld_v1_mine', pool: 'ld_v1_pool' };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 사생활 모드 등 */ } };

async function fetchPool() {
  if (!V1_ENDPOINT) return null;
  try {
    const r = await fetch(V1_ENDPOINT, { method: 'GET' });
    const j = await r.json();
    return Array.isArray(j.lines) ? j.lines.filter((s) => typeof s === 'string' && s.trim()) : null;
  } catch { return null; }
}
function postLine(line, lang) {
  if (!V1_ENDPOINT) return;
  // text/plain + no-cors: 프리플라이트 없이 Apps Script로 보냅니다. 응답은 읽지 않습니다.
  try { fetch(V1_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ line, lang, at: Date.now() }) }); } catch { /* 무시 */ }
}

/* ---------- 화면 조각(응시 고리, 입력 칸): 이 파일 안에서 만들어 index.html을 건드리지 않습니다 ---------- */
function mountUI(S_) {
  const style = document.createElement('style');
  style.textContent = `
    .v1-gaze{position:fixed;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;pointer-events:none;opacity:0;transition:opacity .25s;
      background:conic-gradient(rgba(246,243,236,.9) calc(var(--p,0)*1turn),rgba(246,243,236,.12) 0);-webkit-mask:radial-gradient(circle,transparent 27px,#000 28px,#000 31px,transparent 32px);mask:radial-gradient(circle,transparent 27px,#000 28px,#000 31px,transparent 32px)}
    .v1-gaze.is-on{opacity:1}
    .v1-offer{position:fixed;left:0;right:0;bottom:0;padding:18px 20px calc(22px + env(safe-area-inset-bottom));background:linear-gradient(rgba(11,20,32,0),rgba(11,20,32,.92) 30%);color:#F6F3EC;font-family:Pretendard,-apple-system,sans-serif;transform:translateY(110%);transition:transform .45s cubic-bezier(.2,.8,.2,1);z-index:30}
    .v1-offer.is-on{transform:none}
    .v1-offer p{margin:0 0 10px;font-size:16px;text-align:center;opacity:.9}
    .v1-offer input{display:block;width:100%;box-sizing:border-box;padding:12px 14px;font:400 16px Pretendard,-apple-system,sans-serif;color:#F6F3EC;background:rgba(246,243,236,.08);border:1px solid rgba(246,243,236,.25);border-radius:10px;outline:none}
    .v1-offer input:focus{border-color:rgba(246,243,236,.6)}
    .v1-offer .row{display:flex;gap:10px;margin-top:10px}
    .v1-offer button{flex:1;padding:12px;font:600 15px Pretendard,-apple-system,sans-serif;border-radius:10px;border:1px solid rgba(246,243,236,.3);background:transparent;color:#F6F3EC}
    .v1-offer button.send{background:#F6F3EC;color:#0b1420;border-color:#F6F3EC}
    body.v1-offering .end{opacity:0;pointer-events:none;transition:opacity .3s}
  `;
  document.head.appendChild(style);
  const gaze = document.createElement('div'); gaze.className = 'v1-gaze'; document.body.appendChild(gaze);
  const offer = document.createElement('div'); offer.className = 'v1-offer'; offer.hidden = true;
  offer.innerHTML = `<p class="v1-offer-q"></p><input type="text" maxlength="60" autocomplete="off" enterkeyhint="done"><div class="row"><button type="button" class="skip"></button><button type="button" class="send"></button></div>`;
  document.body.appendChild(offer);
  return { gaze, offer, input: offer.querySelector('input'), q: offer.querySelector('.v1-offer-q'), skip: offer.querySelector('.skip'), send: offer.querySelector('.send') };
}

/* ---------- 본체 ---------- */
/* ctx: lookdown.js의 run() 안에서 넘겨 줍니다.
   { S, T, LANG, look, camera, puddle, items, hint, caption, ripple, mumble, track, PUDDLE, sensorReady, sceneEl } */
export async function createV1(ctx) {
  const { S, T, LANG, look, camera, puddle, items, hint, caption, ripple, mumble, track, PUDDLE, sensorReady, sceneEl } = ctx;
  const str = STR[LANG] || STR.en;
  const ui = mountUI(S);
  ui.q.textContent = str.offer; ui.input.placeholder = str.placeholder; ui.skip.textContent = str.skip; ui.send.textContent = str.send;

  T.item = V.itemStay;   // 1단계에서만 길게

  // 옅어짐: 이 폰에서 돌려보낸 횟수로. (서버가 생기면 전체 횟수로 바꿀 수 있습니다)
  let count = lsGet(LS.count, 0);
  const fadeOf = (n) => Math.max(V.fadeFloor, 1 - V.fadeStep * n);
  const api = { fade: fadeOf(count), count };

  // 문장 풀: 서버 → 이 폰에 쌓인 것 → 씨앗 문장
  let pool = (await fetchPool()) || lsGet(LS.pool, []);
  const mine = lsGet(LS.mine, []);
  const pickLine = () => {
    const cands = pool.filter((s) => !mine.includes(s));
    const src = cands.length ? cands : (SEED[LANG] || SEED.en);
    return src[Math.floor(Math.random() * src.length)];
  };

  // 상태
  let gazeT = 0, gazeLast = -1, line = '', tilt0 = null, retDir = 1, retAt = 0, readAt = 0, returned = false;
  const off = new THREE.Vector3();   // 물건에 더하는 위치 오프셋(웅덩이 로컬: x 오른쪽, y 위, z 앞)
  let lift = 0;                      // 0~1 들림
  const ndc = new THREE.Vector3();

  const currentItem = () => { const k = S.fortune && S.fortune.shape && items[S.fortune.shape] ? S.fortune.shape : null; return k ? items[k] : null; };
  const itemUV = () => { const it = currentItem(); if (!it) return null; const p = it.above.position; return new THREE.Vector2((p.x - puddle.position.x) / (PUDDLE / 2), -(p.z - puddle.position.z) / (PUDDLE / 2)); };

  function startReading(t) {
    S.phase = 'reading'; S.t0 = t; readAt = t;
    line = pickLine();
    tilt0 = look.orientation ? look.orientation.gamma : null;
    ui.gaze.classList.remove('is-on');
    caption(line);
    hint(sensorReady && tilt0 !== null ? str.lifted : str.nosensor);
    ripple(itemUV() || new THREE.Vector2(0, 0), 0.8, t);
    mumble();
    track('lookdown_v1_lift', { n: S.fortune ? S.fortune.n : -1 });
  }
  function startReturn(t, dir) {
    S.phase = 'returning'; S.t0 = t; retAt = t; retDir = dir; returned = true;
    count += 1; lsSet(LS.count, count); api.count = count; api.fade = fadeOf(count);
    hint(''); caption(str.returned);
    ripple(itemUV() || new THREE.Vector2(0, 0), 1.0, t);
    track('lookdown_v1_return', { count, dir });
  }
  function startOffer(t) {
    S.phase = 'offer'; S.t0 = t;
    caption('');
    hint(str.faded(count));
    document.body.classList.add('v1-offering');   // 공유 버튼과 겹치지 않게 잠시 감춥니다
    ui.offer.hidden = false; requestAnimationFrame(() => ui.offer.classList.add('is-on'));
  }
  function finish(t, sent) {
    document.body.classList.remove('v1-offering');
    ui.offer.classList.remove('is-on'); setTimeout(() => { ui.offer.hidden = true; }, 500);
    ui.input.blur();
    hint(sent ? str.thanks : '');
    S.phase = 'leaving'; S.t0 = t; S.pulse = t;
    track('lookdown_v1_offer', { sent: sent ? 1 : 0 });
  }
  function submit() {
    const v = ui.input.value.trim().replace(/\s+/g, ' ');
    const t = ctxClock();
    if (v) {
      mine.push(v); lsSet(LS.mine, mine.slice(-20));
      pool.push(v); lsSet(LS.pool, pool.slice(-200));
      postLine(v, LANG);
      ui.input.value = '';
    }
    finish(t, !!v);
  }
  ui.send.addEventListener('click', submit);
  ui.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  ui.skip.addEventListener('click', () => finish(ctxClock(), false));

  // 센서가 없을 때: 읽는 중 가로로 끌면 돌려보냄
  let px0 = null;
  sceneEl.addEventListener('pointerdown', (e) => { if (S.phase === 'reading') px0 = e.clientX; });
  sceneEl.addEventListener('pointerup', (e) => {
    if (S.phase === 'reading' && px0 !== null && Math.abs(e.clientX - px0) > V.swipePx) startReturn(ctxClock(), Math.sign(e.clientX - px0));
    px0 = null;
  });

  let clockNow = 0; const ctxClock = () => clockNow;

  /* 매 프레임: lookdown.js 루프에서 phase 분기 뒤에 부릅니다. */
  function update(t, dt) {
    clockNow = t;
    const it = currentItem();
    if (S.phase === 'pooling' || S.phase === 'idle') returned = false;
    // 돌려보낸 뒤에는 0단계의 leaving 분기가 물건을 다시 띄우지 않게 막습니다
    if (returned && (S.phase === 'leaving' || S.phase === 'ended')) S.item = 0;

    if (S.phase === 'item' && it && S.item > 0.9) {
      // 응시: 물건의 화면 위치가 가운데 반경 안에 있는 시간을 셉니다
      ndc.copy(it.above.position).project(camera);
      const inside = ndc.z < 1 && Math.hypot(ndc.x, ndc.y * (window.innerHeight / window.innerWidth)) < V.gazeRadius;
      if (inside) { gazeT += dt; gazeLast = t; }
      else if (t - gazeLast > V.gazeGrace) gazeT = Math.max(0, gazeT - dt * 2);
      const p = Math.min(1, gazeT / V.gazeHold);
      ui.gaze.style.setProperty('--p', p.toFixed(3));
      ui.gaze.classList.toggle('is-on', gazeT > 0.15);
      if (gazeT > 0.15 && !S.closed) hint(str.gaze);
      // 응시 중에는 가라앉지 않게 시간을 붙잡아 둡니다
      if (gazeT > 0.15) S.t0 = Math.max(S.t0, t - (T.item - 1.5));
      if (p >= 1) startReading(t);
    } else {
      ui.gaze.classList.remove('is-on');
      if (S.phase !== 'reading') gazeT = 0;
    }

    if (S.phase === 'reading') {
      lift = Math.min(1, lift + dt / 0.8);
      S.up = 1; S.item = 1;
      // 기울이기: 읽기 시작 자세에서 좌우로 tiltDeg 이상
      if (tilt0 !== null && look.orientation) {
        let d = look.orientation.gamma - tilt0;
        if (d > 180) d -= 360; if (d < -180) d += 360;
        if (Math.abs(d) > V.tiltDeg) startReturn(t, Math.sign(d));
      }
      if (t - readAt > V.readMax) { hint(''); S.phase = 'leaving'; S.t0 = t; S.pulse = t; }
    } else if (S.phase === 'returning') {
      const k = (t - retAt) / V.returnDur;
      const e = k * k * (3 - 2 * k);
      S.up = 1; S.item = Math.max(0, 1 - Math.max(0, (k - 0.35) / 0.65));
      lift = Math.max(0, 1 - k * 1.6);
      off.x = retDir * 0.22 * e;      // 기울인 쪽으로 미끄러져
      off.z = -0.06 * e;              // 조금 안쪽으로
      if (k >= 1) { off.set(0, 0, 0); startOffer(t); }
    } else if (S.phase === 'offer') {
      S.up = 1; S.item = 0; lift = 0;
    } else if (S.phase !== 'reading') {
      lift = Math.max(0, lift - dt / 0.5); off.set(0, 0, 0);
    }
  }

  /* 물건 자리 보정: lookdown.js의 itemLocal(웅덩이 로컬)에 더합니다. */
  function adjustItem(itemLocal) {
    itemLocal.x += off.x; itemLocal.z += off.z;
    itemLocal.y += V.lift * (lift * lift * (3 - 2 * lift));
  }

  // 디버그
  if (new URLSearchParams(location.search).has('debug')) window.__LD1 = { V, api, get pool() { return pool; }, startReading: () => startReading(clockNow), startReturn: (d) => startReturn(clockNow, d || 1) };

  return Object.assign(api, { update, adjustItem, get lifted() { return lift; } });
}
