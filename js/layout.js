/* ══════════════════════════════════════════════════════════
   쿼터뷰 배치도 — 관측 초점 이동 연출

   조사(증거 구매)는 원래 즉시 텍스트가 뜨는 버튼이었다.
   여기서는 관측 초점이 코어에서 해당 지점까지 이동하고,
   도착한 뒤에 증거가 공개된다. 판정 로직은 건드리지 않는다 —
   연출이 실패하거나 건너뛰어도 게임은 똑같이 성립한다.

   아트 에셋 0. 전부 Canvas 2D 도형이다.
   ══════════════════════════════════════════════════════════ */

import { SITES, LINKS, HOME_SITE, siteById } from './stations.js';

const ISO = { sx: 72, sy: 32, cx: 310, cy: 112 };
const TRAVEL_MS = 1150;

const C = {
  floor:  'rgba(26,127,138,.20)',
  link:   'rgba(26,127,138,.45)',
  edge:   'rgba(53,224,232,.55)',
  fill:   'rgba(9,32,48,.85)',
  top:    'rgba(18,58,80,.9)',
  dim:    'rgba(111,147,166,.75)',
  focus:  '#35e0e8',
  target: '#ffa53a',
};

let cv = null;
let g = null;
let raf = 0;

/* 관측 초점 상태 */
const F = {
  from: HOME_SITE,
  to: HOME_SITE,
  t: 1,            // 0=출발, 1=도착
  started: 0,
  target: null,    // 강조할 목적지 (도착 후에도 유지)
  done: null,      // 도착 콜백
  phase: 0,        // 스캔 링 위상
};

const proj = (x, y) => [ISO.cx + (x - y) * ISO.sx, ISO.cy + (x + y) * ISO.sy];
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function initLayout(canvas) {
  cv = canvas;
  g = cv.getContext('2d');
  cv.addEventListener('click', skipTravel);
  loop();
}

/** 새 경보로 넘어갈 때 — 초점을 코어로 되돌리고 강조를 지운다. */
export function resetLayout() {
  F.from = F.to = HOME_SITE;
  F.t = 1;
  F.target = null;
  F.done = null;
}

/** 초점을 siteId 로 이동시키고, 도착하면 done() 을 부른다. */
export function probeTo(siteId, done) {
  const dest = siteById(siteId) ? siteId : HOME_SITE;
  F.from = currentSiteId();
  F.to = dest;
  F.target = dest;
  F.t = 0;
  F.started = performance.now();
  F.done = done ?? null;
  if (F.from === F.to) { F.t = 1; finish(); }   // 같은 지점이면 이동 없이 즉시
}

/** 연출을 기다리지 않고 즉시 도착시킨다 (맵 클릭 / 반복 플레이용). */
export function skipTravel() {
  if (F.t < 1) { F.t = 1; finish(); }
}

export const isTraveling = () => F.t < 1;

function currentSiteId() {
  return F.t >= 1 ? F.to : F.from;
}

function finish() {
  const cb = F.done;
  F.done = null;
  if (cb) cb();
}

/* ── 렌더 루프 ─────────────────────────────────────────────── */
function loop() {
  cancelAnimationFrame(raf);
  const step = (now) => {
    if (F.t < 1) {
      F.t = Math.min(1, (now - F.started) / TRAVEL_MS);
      if (F.t >= 1) finish();
    }
    F.phase = (now / 620) % (Math.PI * 2);
    draw();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function focusPos() {
  const a = siteById(F.from);
  const b = siteById(F.to);
  const k = easeInOut(F.t);
  return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
}

function draw() {
  g.clearRect(0, 0, cv.width, cv.height);

  drawFloor();

  for (const [a, b] of LINKS) drawLink(siteById(a), siteById(b));

  // 먼 것부터 그린다 (등각 투영의 깊이 = x + y)
  const byDepth = [...SITES].sort((p, q) => p.x + p.y - (q.x + q.y));
  for (const s of byDepth) drawSite(s, s.id === F.target);

  // 라벨은 도형을 전부 그린 뒤 한 번에 — 앞쪽 구조물에 가리지 않게.
  for (const s of byDepth) drawLabel(s, s.id === F.target);

  drawFocus();
}

function drawFloor() {
  g.strokeStyle = C.floor;
  g.lineWidth = 1;
  const N = 1.55, STEP = 0.31;
  for (let v = -N; v <= N + 1e-9; v += STEP) {
    let [x1, y1] = proj(v, -N); let [x2, y2] = proj(v, N);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    [x1, y1] = proj(-N, v); [x2, y2] = proj(N, v);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
}

function drawLink(a, b) {
  const [x1, y1] = proj(a.x, a.y);
  const [x2, y2] = proj(b.x, b.y);
  g.strokeStyle = C.link;
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(x1, y1 - a.h * 0.35); g.lineTo(x2, y2 - b.h * 0.35); g.stroke();
}

function drawSite(s, hot) {
  const [x, y] = proj(s.x, s.y);
  const glow = hot ? C.target : C.edge;

  if (hot) {
    const r = 15 + Math.sin(F.phase * 1.6) * 3;
    g.strokeStyle = 'rgba(255,165,58,.55)';
    g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(x, y, r * 1.5, r * 0.62, 0, 0, Math.PI * 2); g.stroke();
  }

  if (s.kind === 'module') drawBox(x, y, s.h, glow, hot);
  else if (s.kind === 'vent') drawVent(x, y, glow);
  else if (s.kind === 'mast') drawMast(x, y, glow);
  else if (s.kind === 'arm') drawArm(x, y, glow);
  else if (s.kind === 'anchor') drawAnchor(x, y, glow);
  else if (s.kind === 'cable') drawCable(x, y, glow);
}

/* 라벨은 전부 바닥(발자국) 기준 — 지붕 위에 띄우면 어느 구조물의
   이름인지 헷갈린다. 가려짐은 이 패스가 마지막이라 문제되지 않는다. */
function drawLabel(s, hot) {
  const [x, y] = proj(s.x, s.y);
  const ty = y + 16;

  g.font = `${hot ? 600 : 400} 10px ui-monospace, Consolas, monospace`;
  g.textAlign = 'center';

  // 어두운 판 위에 얹어 격자·와이어와 겹쳐도 읽히게
  const w = g.measureText(s.label).width;
  g.fillStyle = 'rgba(3,12,20,.72)';
  g.fillRect(x - w / 2 - 3, ty - 8, w + 6, 12);

  g.fillStyle = hot ? C.target : C.dim;
  g.fillText(s.label, x, ty);
}

/* 등각 육면체 — 위 마름모 + 두 측면 */
function drawBox(x, y, h, edge, hot) {
  const w = 30, d = 15;
  const top = y - h;
  g.fillStyle = hot ? 'rgba(255,165,58,.14)' : C.fill;
  g.beginPath();
  g.moveTo(x - w, y - d); g.lineTo(x, y); g.lineTo(x, y - h);
  g.lineTo(x - w, y - d - h); g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(x + w, y - d); g.lineTo(x, y); g.lineTo(x, y - h);
  g.lineTo(x + w, y - d - h); g.closePath(); g.fill();

  g.fillStyle = hot ? 'rgba(255,165,58,.22)' : C.top;
  g.beginPath();
  g.moveTo(x, top - d * 2); g.lineTo(x + w, top - d);
  g.lineTo(x, top); g.lineTo(x - w, top - d); g.closePath();
  g.fill();

  g.strokeStyle = edge; g.lineWidth = 1.2;
  g.stroke();
  g.beginPath();
  g.moveTo(x - w, top - d); g.lineTo(x - w, y - d); g.lineTo(x, y);
  g.lineTo(x + w, y - d); g.lineTo(x + w, top - d); g.stroke();
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, top); g.stroke();
}

function drawVent(x, y, edge) {
  g.strokeStyle = edge; g.lineWidth = 1.3;
  g.beginPath(); g.ellipse(x, y, 13, 5.5, 0, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 3; i++) {
    const sway = Math.sin(F.phase + i) * 3.5;
    g.strokeStyle = `rgba(255,165,58,${0.30 - i * 0.07})`;
    g.beginPath();
    g.moveTo(x - 5 + i * 5, y - 2);
    g.quadraticCurveTo(x - 5 + i * 5 + sway, y - 16, x - 3 + i * 5 + sway * 1.6, y - 30);
    g.stroke();
  }
}

function drawMast(x, y, edge) {
  g.strokeStyle = edge; g.lineWidth = 1.3;
  g.beginPath(); g.ellipse(x, y, 10, 4.5, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x, y - 26); g.stroke();
  g.beginPath(); g.arc(x, y - 29, 3, 0, Math.PI * 2); g.stroke();
  const r = 7 + ((F.phase * 2.4) % 12);
  g.strokeStyle = `rgba(53,224,232,${Math.max(0, 0.4 - r / 34)})`;
  g.beginPath(); g.ellipse(x, y - 29, r, r * 0.45, 0, 0, Math.PI * 2); g.stroke();
}

function drawArm(x, y, edge) {
  g.strokeStyle = edge; g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(x, y, 11, 5, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  g.moveTo(x, y - 2); g.lineTo(x + 9, y - 17); g.lineTo(x + 26, y - 11);
  g.stroke();
  g.beginPath(); g.arc(x + 9, y - 17, 2.4, 0, Math.PI * 2); g.stroke();
}

function drawAnchor(x, y, edge) {
  g.strokeStyle = edge; g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(x - 9, y + 3); g.lineTo(x, y - 4); g.lineTo(x + 9, y + 3);
  g.closePath(); g.stroke();
  g.strokeStyle = 'rgba(26,127,138,.6)';
  g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 24, y - 20); g.stroke();
}

function drawCable(x, y, edge) {
  g.strokeStyle = edge; g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x - 34, y - 6); g.quadraticCurveTo(x, y + 7, x + 34, y - 6);
  g.stroke();
}

function drawFocus() {
  const [fx, fy] = focusPos();
  const [x, y] = proj(fx, fy);
  const moving = F.t < 1;

  // 이동 경로
  if (moving) {
    const a = siteById(F.from), b = siteById(F.to);
    const [ax, ay] = proj(a.x, a.y), [bx, by] = proj(b.x, b.y);
    g.strokeStyle = 'rgba(53,224,232,.30)';
    g.setLineDash([4, 5]); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.setLineDash([]);
  }

  const pulse = moving ? 1 : 0.55 + Math.sin(F.phase * 1.4) * 0.2;
  g.strokeStyle = `rgba(53,224,232,${0.5 * pulse})`;
  g.lineWidth = 1.4;
  g.beginPath(); g.ellipse(x, y, 11, 5, 0, 0, Math.PI * 2); g.stroke();

  g.fillStyle = C.focus;
  g.shadowColor = C.focus; g.shadowBlur = 12;
  g.beginPath(); g.arc(x, y - 4, 3.4, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;

  // 십자선
  g.strokeStyle = `rgba(53,224,232,${0.35 * pulse})`;
  g.beginPath();
  g.moveTo(x - 16, y - 4); g.lineTo(x - 6, y - 4);
  g.moveTo(x + 6, y - 4); g.lineTo(x + 16, y - 4);
  g.stroke();
}
