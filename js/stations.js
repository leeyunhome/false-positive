/* ══════════════════════════════════════════════════════════
   THALASSA-9 기지 배치도 — 쿼터뷰 맵의 좌표 원장

   x, y 는 위에서 내려다본 평면 좌표 (대략 -1.3 ~ 1.3).
   화면 좌표로의 등각 투영은 js/layout.js 가 담당한다.
   kind 는 그리는 방식만 결정한다 — 판정에는 아무 영향이 없다.

   data/incidents.json 의 모든 evidence[].site 는 여기 있는 id 중
   하나여야 한다. tools/validate.mjs 가 이 대응을 검사한다.

   이 파일은 DOM을 건드리지 않는 순수 모듈이다.
   ══════════════════════════════════════════════════════════ */

/** 관측 초점의 기본 위치 — 당직 콘솔이 있는 곳. */
export const HOME_SITE = 'SITE_CORE';

export const SITES = [
  { id: 'SITE_CORE',     label: '관제 코어',        kind: 'module', x:  0.00, y:  0.00, h: 30 },
  { id: 'SITE_CREW',     label: '거주 구획',        kind: 'module', x: -0.74, y: -0.52, h: 22 },
  { id: 'SITE_LIFE',     label: '생명유지 모듈',    kind: 'module', x:  0.74, y: -0.52, h: 22 },
  { id: 'SITE_HULL_C3',  label: '3구획',            kind: 'module', x: -0.74, y:  0.52, h: 20 },
  { id: 'SITE_HULL_C4',  label: '4구획 외판',       kind: 'module', x:  0.74, y:  0.52, h: 20 },
  { id: 'SITE_MOORING',  label: '2번 계류 케이블',  kind: 'anchor', x: -1.28, y: -1.02, h: 0 },
  { id: 'SITE_VENT',     label: '열수공',           kind: 'vent',   x:  1.20, y: -0.90, h: 0 },
  { id: 'SITE_ARM',      label: '채굴 아암 3번',    kind: 'arm',    x:  1.15, y:  0.90, h: 0 },
  { id: 'SITE_SONAR',    label: '소나 어레이',      kind: 'mast',   x: -1.20, y:  0.95, h: 0 },
  { id: 'SITE_CABLE',    label: '해저 전력 케이블', kind: 'cable',  x:  0.00, y:  1.30, h: 0 },
];

export const siteById = (id) => SITES.find((s) => s.id === id);

/** 코어와 물리적으로 이어진 지점 — 배선/도관을 그리는 데만 쓴다. */
export const LINKS = [
  ['SITE_CORE', 'SITE_CREW'],
  ['SITE_CORE', 'SITE_LIFE'],
  ['SITE_CORE', 'SITE_HULL_C3'],
  ['SITE_CORE', 'SITE_HULL_C4'],
  ['SITE_HULL_C3', 'SITE_SONAR'],
  ['SITE_HULL_C4', 'SITE_ARM'],
  ['SITE_CREW', 'SITE_MOORING'],
  ['SITE_LIFE', 'SITE_VENT'],
  ['SITE_CORE', 'SITE_CABLE'],
];
