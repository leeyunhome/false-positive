/* ══════════════════════════════════════════════════════════
   오탐 / FALSE POSITIVE : THALASSA-9  —  게임 코어 + 3D ARPG
   Planescape: Torment 스타일 심층 대화 및 3D 쿼터뷰 액션 결합
   의존성 0. 빌드 스텝 없음. GitHub Pages에 그대로 올라간다.
   ══════════════════════════════════════════════════════════ */

import { POLICIES, POLICY_MAX } from './policies.js';
import { initLayout, resetLayout, probeTo, skipTravel, isTraveling } from './layout.js';
import { siteById } from './stations.js';
import { RpgEngine } from './rpg/engine.js';
import { createNereusInterrogation } from './rpg/dialogue.js';

const $ = (id) => document.getElementById(id);

/* ── 상태 ────────────────────────────────────────────────── */
const S = {
  content: null,
  shiftIdx: 0,
  shift: null,
  queue: [],
  cursor: 0,
  inc: null,
  tokens: 0,
  spent: new Set(),
  vitals: { hull: 100, life: 100, trust: 100 },
  tally: { TP: 0, FP: 0, FN: 0, TN: 0 },
  followedNereus: 0,
  optimal: 0,
  activePolicies: new Set(),
  policyLog: [],
  fired: [],
  rpg: null,
  activeView: '3D', // '3D' or '2D'
};

/* ── 화면 전환 ────────────────────────────────────────────── */
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('screen--active'));
  $(id).classList.add('screen--active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (id === 'scrIncident') {
    setTimeout(() => {
      if (S.rpg?.scene3d) S.rpg.scene3d.onResize();
    }, 50);
  }
}

function log(text, mark = '') {
  const li = document.createElement('li');
  li.innerHTML = mark ? `<b>${mark}</b> ${text}` : text;
  $('log').appendChild(li);
  $('log').scrollTop = $('log').scrollHeight;
}

/* ── 부팅 ────────────────────────────────────────────────── */
async function boot() {
  const res = await fetch('data/incidents.json');
  S.content = await res.json();
  S.shiftIdx = 0;
  S.shift = S.content.shifts[S.shiftIdx];
  $('introBrief').textContent = S.shift.brief;
  $('shiftChip').textContent = `교대 ${S.shift.shift}`;
  paintVitals();
  drawSonar();
  initLayout($('layout'));

  // 3D Isometric Action RPG 엔진 초기화
  try {
    S.rpg = new RpgEngine($('rpgViewport3D'), (text, mark) => log(text, mark));
    S.rpg.init();
    log('3D 쿼터뷰 심해 엔진 가동됨 [Three.js]', '◈');
  } catch (err) {
    console.warn('3D RPG 엔진 초기화 지연:', err);
  }

  log('관제 콘솔 & RPG 시스템 연결됨', '◈');
  log(`${S.content.station.name} · 심도 ${S.content.station.depth}`);

  setupViewToggle();
}

function setupViewToggle() {
  const btn3D = $('tabView3D');
  const btn2D = $('tabView2D');
  const vp3D = $('rpgViewportContainer');
  const ev2D = $('evidenceSection2D');

  if (!btn3D || !btn2D) return;

  btn3D.addEventListener('click', () => {
    S.activeView = '3D';
    btn3D.classList.add('tab-btn--active');
    btn2D.classList.remove('tab-btn--active');
    if (vp3D) vp3D.style.display = 'block';
    if (S.rpg?.scene3d) S.rpg.scene3d.onResize();
  });

  btn2D.addEventListener('click', () => {
    S.activeView = '2D';
    btn2D.classList.add('tab-btn--active');
    btn3D.classList.remove('tab-btn--active');
  });
}

function startShift() {
  S.shift = S.content.shifts[S.shiftIdx];
  S.queue = S.shift.incidents.map((id) => S.content.incidents.find((i) => i.id === id));
  S.cursor = 0;
  S.tokens = S.shift.timeTokens;
  S.spent = new Set();
  if (S.shiftIdx === 0) {
    S.vitals = { hull: 100, life: 100, trust: 100 };
    S.tally = { TP: 0, FP: 0, FN: 0, TN: 0 };
    S.followedNereus = 0;
    S.optimal = 0;
    S.activePolicies = new Set();
    S.policyLog = [];
    $('log').innerHTML = '';
  }
  $('shiftChip').textContent = `교대 ${S.shift.shift}`;
  log(`교대 ${S.shift.shift} 개시 (${S.shift.title}) · 시간 토큰 ${S.tokens}`, '▸');
  paintVitals();
  nextIncident();
}

/* ── 경보 렌더 ────────────────────────────────────────────── */
const CHANNEL_LABEL = { crew: '승무원 보고', sonar: '소나 접촉', sensor: '센서 경보', auto: '자동 감지' };
const STATE_LABEL = { calm: '평온', agitated: '격앙됨', exhausted: '탈진' };

function nextIncident() {
  if (S.cursor >= S.queue.length) return debrief();

  S.inc = JSON.parse(JSON.stringify(S.queue[S.cursor]));
  S.spent = new Set();

  S.fired = applyDirectorRules(S.inc);

  $('incId').textContent = S.inc.id;
  $('incChannel').textContent = CHANNEL_LABEL[S.inc.channel] ?? '경보';
  $('incReport').textContent = S.inc.report;
  $('clockChip').textContent = S.inc.clock;
  $('tokenChip').textContent = `조사 ${S.tokens}`;

  $('incFrom').textContent = S.inc.reporter
    ? `— ${S.inc.reporter.name} · ${S.inc.reporter.role} · ${STATE_LABEL[S.inc.reporter.state]}`
    : '';

  $('incSignals').innerHTML = (S.inc.signals ?? [])
    .map((s) => `<div class="sig sig--${s.tone}">
        <span class="sig__label">${s.label}</span>
        <span class="sig__value">${s.value}</span>
      </div>`)
    .join('');

  const rec = S.inc.actions.find((a) => a.id === S.inc.nereus.recommendation);
  $('nrDiag').textContent = S.inc.nereus.diagnosis;
  $('nrRec').textContent = rec ? rec.label : '판단 보류';
  $('nrConfNum').textContent = S.inc.nereus.confidence.toFixed(2);
  $('nrConfBar').style.width = '0%';
  requestAnimationFrame(() => { $('nrConfBar').style.width = `${S.inc.nereus.confidence * 100}%`; });

  $('nrPolicy').innerHTML = S.fired
    .map((p) => `<span class="polflag">디렉터 규칙 · ${p.short} −${p.drop.toFixed(2)}</span>`)
    .join('');
  if (S.fired.length) log(`디렉터 규칙 발동: ${S.fired.map((p) => p.short).join(', ')}`, '※');

  $('evReveals').innerHTML = '';
  resetLayout();
  setCap(null, false);
  paintEvidence();
  paintActions();

  // RPG 3D 엔진에 현재 경보 주입 & 이상체 스폰
  if (S.rpg) {
    S.rpg.setIncident(S.inc, (ev) => buyEvidence(ev.id));
    S.rpg.updateCharacterSheet();
  }

  // NEREUS 심층 문답 버튼 바인딩
  const interrogateBtn = $('interrogateNereusBtn');
  if (interrogateBtn) {
    interrogateBtn.onclick = () => {
      const diag = createNereusInterrogation(S.inc, S.rpg.character, {
        onEvidenceDiscovered: () => {
          if (S.inc.evidence.length > 0) buyEvidence(S.inc.evidence[0].id);
        },
      });
      S.rpg.dialogueEngine.startDialogue(diag);
    };
  }

  log(`${S.inc.clock}  ${S.inc.id} 수신`, '!');
  drawSonar(S.inc.channel === 'sonar');
  show('scrIncident');

  if (S.rpg?.scene3d) S.rpg.scene3d.onResize();
}

/* ── 디렉터 규칙 적용 ───────────────────────────────────────── */
function applyDirectorRules(inc) {
  const fired = POLICIES.filter((p) => S.activePolicies.has(p.id) && p.match(inc));
  if (!fired.length) return [];

  const rec = inc.actions.find((a) => a.id === inc.nereus.recommendation);
  const nereusWrong = !rec?.correct;

  const drop = fired.reduce((a, p) => a + p.drop, 0);
  inc.nereus.confidence = Math.max(0.15, Math.round((inc.nereus.confidence - drop) * 100) / 100);

  for (const p of fired) S.policyLog.push({ inc: inc.id, rule: p.id, hit: nereusWrong });
  return fired;
}

function paintEvidence() {
  $('evList').innerHTML = S.inc.evidence
    .map((e) => {
      const used = S.spent.has(e.id);
      const broke = e.cost > S.tokens;
      return `<button class="ev" data-ev="${e.id}" ${used || broke ? 'disabled' : ''}>
          ${e.label}<span class="ev__cost">-${e.cost}</span>
        </button>`;
    })
    .join('');

  $('evList').querySelectorAll('[data-ev]').forEach((b) => {
    b.addEventListener('click', () => buyEvidence(b.dataset.ev));
  });
}

function buyEvidence(id) {
  const e = S.inc.evidence.find((x) => x.id === id);
  if (!e || S.spent.has(id) || e.cost > S.tokens || isTraveling()) return;

  // 토큰 차감
  S.spent.add(id);
  S.tokens -= e.cost;
  $('tokenChip').textContent = `조사 ${S.tokens}`;
  paintEvidence();

  const site = siteById(e.site);
  setCap(site, true);
  log(`관측 초점 이동: ${site?.label ?? e.site}`, '→');

  // 3D 뷰포트 아바타도 해당 위치로 이동
  if (S.rpg?.scene3d) {
    S.rpg.scene3d.moveToSite(e.site);
  }

  probeTo(e.site, () => {
    setCap(site, false);
    const li = document.createElement('li');
    li.innerHTML = `<b>${e.label} · ${site?.label ?? ''}</b>${e.text}`;
    $('evReveals').appendChild(li);
    log(`증거 확보: ${e.label} (-${e.cost})`, '?');
    paintEvidence();
  });
}

/* 배치도 캡션 */
function setCap(site, busy) {
  const label = site?.label ?? '관제 코어';
  $('layoutCap').innerHTML = busy
    ? `<span>관측 초점 이동 중 · <b>${label}</b></span><span>클릭하면 건너뜀</span>`
    : `<span>관측 초점 · <b>${label}</b></span><span></span>`;
  $('layoutCap').closest('.layout').classList.toggle('layout--busy', !!busy);
}

function paintActions() {
  $('actList').innerHTML = S.inc.actions
    .map((a) => {
      const isRec = a.id === S.inc.nereus.recommendation;
      const flagged = isRec && S.fired.length;
      const flag = flagged
        ? '<span class="act__flag act__flag--flagged">NEREUS 권고 · 규칙 검토</span>'
        : '<span class="act__flag">NEREUS 권고</span>';
      return `<button class="act ${isRec ? 'act--rec' : ''}" data-act="${a.id}">
          <span>${a.label}</span>
          ${isRec ? flag : ''}
        </button>`;
    })
    .join('');

  $('actList').querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => resolve(b.dataset.act));
  });
}

/* ── 판정 ────────────────────────────────────────────────── */
function resolve(actId) {
  if (isTraveling()) skipTravel();

  const act = S.inc.actions.find((a) => a.id === actId);
  const threat = S.inc.truth.isRealThreat;

  if (threat && act.treatsAsThreat) S.tally.TP++;
  else if (!threat && act.treatsAsThreat) S.tally.FP++;
  else if (threat && !act.treatsAsThreat) S.tally.FN++;
  else S.tally.TN++;

  if (actId === S.inc.nereus.recommendation) S.followedNereus++;
  if (act.correct) S.optimal++;

  const d = act.effect ?? {};
  for (const k of ['hull', 'life', 'trust']) {
    S.vitals[k] = Math.max(0, Math.min(100, S.vitals[k] + (d[k] ?? 0)));
  }
  paintVitals();

  $('outKicker').textContent = act.correct ? '결과 · 최적 조치' : '결과';
  $('outText').textContent = act.result;
  $('outDelta').innerHTML = ['hull', 'life', 'trust']
    .filter((k) => d[k])
    .map((k) => {
      const label = { hull: '선체', life: '생명유지', trust: '신뢰' }[k];
      const v = d[k];
      return `<span class="delta delta--${v > 0 ? 'up' : 'down'}">${label} ${v > 0 ? '+' : ''}${v}</span>`;
    })
    .join('') || '<span class="delta">변화 없음</span>';

  log(`조치: ${act.label}`, '>');
  S.cursor++;
  $('nextBtn').textContent = S.cursor >= S.queue.length ? '교대 결산' : '다음 경보';
  show('scrOutcome');
}

function paintVitals() {
  for (const k of ['hull', 'life', 'trust']) {
    const v = S.vitals[k];
    $(`${k}Val`).textContent = v;
    $(`${k}Bar`).style.width = `${v}%`;
    $(`${k}Bar`).closest('.vital').classList.toggle('vital--low', v < 35);
  }
  if (S.rpg) S.rpg.updateCharacterSheet();
}

/* ── 결산 ────────────────────────────────────────────────── */
function debrief() {
  const t = S.tally;
  const totalProcessed = S.tally.TP + S.tally.FP + S.tally.FN + S.tally.TN;
  $('mTP').textContent = t.TP;
  $('mFP').textContent = t.FP;
  $('mFN').textContent = t.FN;
  $('mTN').textContent = t.TN;

  const blind = Math.round((S.followedNereus / totalProcessed) * 100);
  $('vTrustAI').textContent = `${blind}%  (${S.followedNereus}/${totalProcessed})`;
  $('vOptimal').textContent = `${S.optimal}/${totalProcessed}`;
  $('vTokens').textContent = `${S.tokens}`;

  $('debriefNote').textContent = verdictText(t, blind);
  paintPolicyScore();
  log('교대 종료', '◈');

  if (S.shiftIdx < S.content.shifts.length - 1) {
    $('restartBtn').textContent = '디렉터 콘솔로 →';
  } else {
    $('restartBtn').textContent = '전체 교대 완료 (처음으로)';
  }

  show('scrDebrief');
}

function paintPolicyScore() {
  const box = $('polScore');
  if (!S.activePolicies.size) { box.hidden = true; return; }
  box.hidden = false;

  const hit = S.policyLog.filter((e) => e.hit).length;
  const miss = S.policyLog.length - hit;
  const idle = [...S.activePolicies].filter((id) => !S.policyLog.some((e) => e.rule === id));

  $('pHit').textContent = `${hit}건`;
  $('pMiss').textContent = `${miss}건`;
  $('pIdle').textContent = idle.length
    ? idle.map((id) => POLICIES.find((p) => p.id === id).short).join(', ')
    : '없음';
  $('polNote').textContent = policyVerdict(hit, miss, idle.length);
}

function policyVerdict(hit, miss, idle) {
  if (!hit && !miss) {
    return '걸어둔 규칙 중 어느 것도 이번 교대의 경보에 걸리지 않았습니다. 지난 교대에 맞춰 만든 규칙이 다음 교대에도 맞으리란 보장은 없습니다.';
  }
  if (miss > hit) {
    return '규칙이 어긋난 권고보다 옳은 권고를 더 많이 깎았습니다. 넓게 거는 규칙은 만들기 쉽고, 그만큼 멀쩡한 판단도 함께 무너뜨립니다.';
  }
  if (miss && idle) {
    return '일부는 맞고 일부는 헛돌았습니다. 규칙 하나가 무엇을 잡고 무엇을 놓치는지가 곧 당신이 설계한 AI의 성능입니다.';
  }
  if (miss) {
    return '대체로 맞았지만 옳은 판단도 깎였습니다. 감산은 공짜가 아닙니다 — NEREUS를 못 믿게 만든 것도 비용입니다.';
  }
  if (idle) {
    return '발동한 규칙은 전부 어긋난 권고에 걸렸습니다. 다만 헛도는 규칙도 남아 있습니다 — 지난 교대에 과적합된 자리입니다.';
  }
  return '어긋나는 지점만 정확히 골라 눌렀습니다. 이건 AI를 쓴 게 아니라 설계한 것에 가깝습니다.';
}

/* ── 디렉터 콘솔 ──────────────────────────────────────────── */
function openPolicy() {
  paintPolicyList();
  show('scrPolicy');
}

function paintPolicyList() {
  $('polMax').textContent = POLICY_MAX;
  $('polCount').textContent = S.activePolicies.size;

  $('polList').innerHTML = POLICIES.map((p) => {
    const on = S.activePolicies.has(p.id);
    const full = !on && S.activePolicies.size >= POLICY_MAX;
    return `<button class="rule ${on ? 'rule--on' : ''}" data-pol="${p.id}" ${full ? 'disabled' : ''}>
        <span class="rule__box">${on ? '[×]' : '[ ]'}</span>
        <span>
          ${p.label}<span class="rule__drop">신뢰도 −${p.drop.toFixed(2)}</span>
          <span class="rule__note">${p.note}</span>
        </span>
      </button>`;
  }).join('');

  $('polList').querySelectorAll('[data-pol]').forEach((b) => {
    b.addEventListener('click', () => togglePolicy(b.dataset.pol));
  });
}

function togglePolicy(id) {
  if (S.activePolicies.has(id)) S.activePolicies.delete(id);
  else if (S.activePolicies.size < POLICY_MAX) S.activePolicies.add(id);
  paintPolicyList();
}

function commitPolicy() {
  const names = [...S.activePolicies].map((id) => POLICIES.find((p) => p.id === id).short);
  log(names.length ? `운영 규칙 주입: ${names.join(', ')}` : '운영 규칙 없음 — NEREUS 기본값 유지', '◈');
  S.shiftIdx++;
  startShift();
}

function verdictText(t, blind) {
  if (t.FN > 0 && blind >= 60) {
    return 'NEREUS를 따라가다 놓쳤습니다. 미탐은 오탐보다 비쌉니다 — 이 심도에서는 특히.';
  }
  if (t.FP > t.TP) {
    return '전부 위협으로 취급하면 아무것도 놓치지 않지만, 자원과 승무원의 신뢰를 태웁니다.';
  }
  if (t.FN === 0 && t.FP === 0) {
    return '완벽한 교대. NEREUS의 실패 모드를 이미 읽고 있군요.';
  }
  if (blind <= 20) {
    return 'NEREUS를 거의 쓰지 않았습니다. 불신도 비용입니다 — 조사 토큰은 무한하지 않습니다.';
  }
  return '판단은 나쁘지 않았습니다. NEREUS가 어디서 어긋나는지 패턴이 보이기 시작합니까?';
}

/* ── 소나 스윕 ────────────────────────────────────────────── */
function drawSonar(hasContact = false) {
  const c = $('sonar');
  const g = c.getContext('2d');
  const R = c.width / 2;
  let a = 0;

  const motes = Array.from({ length: 22 }, (_, i) => ({
    r: ((i * 37) % 100) / 100 * (R - 14) + 8,
    th: (i * 2.399),
    p: (i % 7) / 7,
  }));

  clearInterval(drawSonar._t);
  drawSonar._t = setInterval(() => {
    g.clearRect(0, 0, c.width, c.height);
    g.translate(R, R);

    g.strokeStyle = 'rgba(26,127,138,.35)';
    g.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      g.beginPath(); g.arc(0, 0, (R - 6) * i / 3, 0, Math.PI * 2); g.stroke();
    }
    g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();

    const grad = g.createConicGradient ? g.createConicGradient(a, 0, 0) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(53,224,232,.30)');
      grad.addColorStop(0.12, 'rgba(53,224,232,0)');
      grad.addColorStop(1, 'rgba(53,224,232,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, R - 6, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(53,224,232,.8)';
    g.beginPath(); g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * (R - 6), Math.sin(a) * (R - 6)); g.stroke();

    motes.forEach((m) => {
      const x = Math.cos(m.th) * m.r, y = Math.sin(m.th) * m.r;
      const lit = Math.max(0, 1 - Math.abs(((a - m.th + Math.PI * 4) % (Math.PI * 2))) / 1.1);
      g.fillStyle = `rgba(53,224,232,${0.12 + lit * 0.55})`;
      g.beginPath(); g.arc(x, y, 1.6 + lit * 1.2, 0, Math.PI * 2); g.fill();
    });

    if (hasContact) {
      const cx = Math.cos(-1.92) * (R * 0.66), cy = Math.sin(-1.92) * (R * 0.66);
      const lit = Math.max(0, 1 - Math.abs(((a + 1.92 + Math.PI * 4) % (Math.PI * 2))) / 1.4);
      g.fillStyle = `rgba(255,165,58,${0.25 + lit * 0.7})`;
      g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(255,165,58,${0.2 + lit * 0.5})`;
      g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.stroke();
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    a = (a + 0.022) % (Math.PI * 2);
  }, 33);
}

function onRestartOrNext() {
  if (S.shiftIdx < S.content.shifts.length - 1) {
    openPolicy();
  } else {
    S.shiftIdx = 0;
    show('scrIntro');
  }
}

/* ── 배선 ────────────────────────────────────────────────── */
$('startBtn').addEventListener('click', startShift);
$('nextBtn').addEventListener('click', nextIncident);
$('restartBtn').addEventListener('click', onRestartOrNext);
$('polGoBtn').addEventListener('click', commitPolicy);

boot().catch((e) => {
  log(`부팅 실패: ${e.message}`, 'X');
  console.error(e);
});
