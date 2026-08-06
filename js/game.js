/* ══════════════════════════════════════════════════════════
   오탐 / FALSE POSITIVE : THALASSA-9  —  게임 코어
   의존성 0. 빌드 스텝 없음. GitHub Pages에 그대로 올라간다.

   설계 원칙 하나만 기억할 것:
     정답(truth)은 엔진이 소유하고, NEREUS의 조언은 그것과 어긋날 수 있다.
     LLM에게 정답을 맡기지 않는다 — 조언의 '말투와 논리'만 맡긴다.
   ══════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

/* ── 상태 ────────────────────────────────────────────────── */
const S = {
  content: null,
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
};

/* ── 화면 전환 ────────────────────────────────────────────── */
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('screen--active'));
  $(id).classList.add('screen--active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  S.shift = S.content.shifts[0];
  $('introBrief').textContent = S.shift.brief;
  $('shiftChip').textContent = `교대 ${S.shift.shift}`;
  paintVitals();
  drawSonar();
  log('관제 콘솔 연결됨', '◈');
  log(`${S.content.station.name} · 심도 ${S.content.station.depth}`);
}

function startShift() {
  S.queue = S.shift.incidents.map((id) => S.content.incidents.find((i) => i.id === id));
  S.cursor = 0;
  S.tokens = S.shift.timeTokens;
  S.vitals = { hull: 100, life: 100, trust: 100 };
  S.tally = { TP: 0, FP: 0, FN: 0, TN: 0 };
  S.followedNereus = 0;
  S.optimal = 0;
  $('log').innerHTML = '';
  log(`교대 ${S.shift.shift} 개시 · 시간 토큰 ${S.tokens}`, '▸');
  paintVitals();
  nextIncident();
}

/* ── 경보 렌더 ────────────────────────────────────────────── */
const CHANNEL_LABEL = { crew: '승무원 보고', sonar: '소나 접촉', sensor: '센서 경보', auto: '자동 감지' };
const STATE_LABEL = { calm: '평온', agitated: '격앙됨', exhausted: '탈진' };

function nextIncident() {
  if (S.cursor >= S.queue.length) return debrief();

  S.inc = S.queue[S.cursor];
  S.spent = new Set();

  $('incId').textContent = S.inc.id;
  $('incChannel').textContent = CHANNEL_LABEL[S.inc.channel] ?? '경보';
  $('incReport').textContent = S.inc.report;
  $('clockChip').textContent = S.inc.clock;
  $('tokenChip').textContent = `조사 ${S.tokens}`;

  $('incFrom').textContent = S.inc.reporter
    ? `— ${S.inc.reporter.name} · ${S.inc.reporter.role} · ${STATE_LABEL[S.inc.reporter.state]}`
    : '';

  // 계기판
  $('incSignals').innerHTML = (S.inc.signals ?? [])
    .map((s) => `<div class="sig sig--${s.tone}">
        <span class="sig__label">${s.label}</span>
        <span class="sig__value">${s.value}</span>
      </div>`)
    .join('');

  // NEREUS 브리핑
  const rec = S.inc.actions.find((a) => a.id === S.inc.nereus.recommendation);
  $('nrDiag').textContent = S.inc.nereus.diagnosis;
  $('nrRec').textContent = rec ? rec.label : '판단 보류';
  $('nrConfNum').textContent = S.inc.nereus.confidence.toFixed(2);
  $('nrConfBar').style.width = '0%';
  requestAnimationFrame(() => { $('nrConfBar').style.width = `${S.inc.nereus.confidence * 100}%`; });

  $('evReveals').innerHTML = '';
  paintEvidence();
  paintActions();

  log(`${S.inc.clock}  ${S.inc.id} 수신`, '!');
  drawSonar(S.inc.channel === 'sonar');
  show('scrIncident');
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
  if (!e || S.spent.has(id) || e.cost > S.tokens) return;

  S.spent.add(id);
  S.tokens -= e.cost;
  $('tokenChip').textContent = `조사 ${S.tokens}`;

  const li = document.createElement('li');
  li.innerHTML = `<b>${e.label}</b>${e.text}`;
  $('evReveals').appendChild(li);

  log(`증거 확보: ${e.label} (-${e.cost})`, '?');
  paintEvidence();
}

function paintActions() {
  $('actList').innerHTML = S.inc.actions
    .map((a) => {
      const isRec = a.id === S.inc.nereus.recommendation;
      return `<button class="act ${isRec ? 'act--rec' : ''}" data-act="${a.id}">
          <span>${a.label}</span>
          ${isRec ? '<span class="act__flag">NEREUS 권고</span>' : ''}
        </button>`;
    })
    .join('');

  $('actList').querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => resolve(b.dataset.act));
  });
}

/* ── 판정 ────────────────────────────────────────────────── */
function resolve(actId) {
  const act = S.inc.actions.find((a) => a.id === actId);
  const threat = S.inc.truth.isRealThreat;

  // 혼동행렬: 실제 위협 여부 × 플레이어가 위협으로 대응했는지
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
  $('nextBtn').textContent = S.cursor >= S.queue.length ? '교대 종료' : '다음 경보';
  show('scrOutcome');
}

function paintVitals() {
  for (const k of ['hull', 'life', 'trust']) {
    const v = S.vitals[k];
    $(`${k}Val`).textContent = v;
    $(`${k}Bar`).style.width = `${v}%`;
    $(`${k}Bar`).closest('.vital').classList.toggle('vital--low', v < 35);
  }
}

/* ── 결산 ────────────────────────────────────────────────── */
function debrief() {
  const t = S.tally;
  const n = S.queue.length;
  $('mTP').textContent = t.TP;
  $('mFP').textContent = t.FP;
  $('mFN').textContent = t.FN;
  $('mTN').textContent = t.TN;

  const blind = Math.round((S.followedNereus / n) * 100);
  $('vTrustAI').textContent = `${blind}%  (${S.followedNereus}/${n})`;
  $('vOptimal').textContent = `${S.optimal}/${n}`;
  $('vTokens').textContent = `${S.tokens}`;

  $('debriefNote').textContent = verdictText(t, blind);
  log('교대 종료', '◈');
  show('scrDebrief');
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

  // 생물발광 파티클 — 결정론적 배치(Math.random 미사용, 재현 가능)
  const motes = Array.from({ length: 22 }, (_, i) => ({
    r: ((i * 37) % 100) / 100 * (R - 14) + 8,
    th: (i * 2.399),
    p: (i % 7) / 7,
  }));

  clearInterval(drawSonar._t);
  drawSonar._t = setInterval(() => {
    g.clearRect(0, 0, c.width, c.height);
    g.translate(R, R);

    // 링
    g.strokeStyle = 'rgba(26,127,138,.35)';
    g.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      g.beginPath(); g.arc(0, 0, (R - 6) * i / 3, 0, Math.PI * 2); g.stroke();
    }
    g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();

    // 스윕
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

    // 생물발광
    motes.forEach((m) => {
      const x = Math.cos(m.th) * m.r, y = Math.sin(m.th) * m.r;
      const lit = Math.max(0, 1 - Math.abs(((a - m.th + Math.PI * 4) % (Math.PI * 2))) / 1.1);
      g.fillStyle = `rgba(53,224,232,${0.12 + lit * 0.55})`;
      g.beginPath(); g.arc(x, y, 1.6 + lit * 1.2, 0, Math.PI * 2); g.fill();
    });

    // 미상 접촉
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

/* ── 배선 ────────────────────────────────────────────────── */
$('startBtn').addEventListener('click', startShift);
$('nextBtn').addEventListener('click', nextIncident);
$('restartBtn').addEventListener('click', () => show('scrIntro'));

boot().catch((e) => {
  log(`부팅 실패: ${e.message}`, 'X');
  console.error(e);
});
