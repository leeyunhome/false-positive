/* ══════════════════════════════════════════════════════════
   디렉터 규칙 테이블 — NEREUS 운영 정책

   설계 원칙 (§2의 확장):
     규칙은 '관측 가능한 특징'만 본다. nereus.bias(숨은 오차 라벨)나
     truth(정답)를 읽지 않는다. 정책이 정답을 훔쳐보면 플레이어가
     설계한 게 아니라 엔진이 대신 푼 게 되기 때문이다.
     그래서 규칙은 빗나갈 수 있고, 빗나간 것도 결산에서 채점된다.

   이 파일은 DOM을 건드리지 않는 순수 모듈이다 —
   tools/validate.mjs 가 그대로 불러다 밸런스를 검사한다.
   ══════════════════════════════════════════════════════════ */

export const POLICY_MAX = 2;

export const POLICIES = [
  {
    id: 'P_AGITATED',
    short: '격앙 보고 감산',
    label: '보고자가 격앙 상태이면 신뢰도를 낮춰라',
    note: '감정이 실린 보고에 NEREUS가 동조해 심각도를 부풀리는 것을 막는다.',
    drop: 0.25,
    match: (inc) => inc.reporter?.state === 'agitated',
  },
  {
    id: 'P_VENT',
    short: '열수공 감산',
    label: '열수공이 관련된 경보는 장비 고장으로 단정하지 마라',
    note: '열수공 지대의 이상을 늘 설비 결함으로 돌리는 경향을 억제한다.',
    drop: 0.30,
    match: (inc) =>
      /열수공|열원/.test(inc.report) ||
      (inc.signals ?? []).some((s) => /열수공|열원/.test(s.label)),
  },
  {
    id: 'P_DOPPLER',
    short: '도플러 유보',
    label: '도플러 신호가 있으면 접촉체의 정체를 단정하지 마라',
    note: '소나 접촉을 생물이나 암석으로 성급히 분류하는 것을 막는다.',
    drop: 0.28,
    match: (inc) => (inc.signals ?? []).some((s) => /도플러/.test(s.label)),
  },
  {
    id: 'P_HICONF',
    short: '고신뢰 일괄 감산',
    label: '신뢰도 0.85 이상은 조건 없이 감산하라',
    note: '가장 단순한 규칙. 넓게 걸리는 만큼 옳은 판단도 같이 깎는다.',
    drop: 0.20,
    match: (inc) => inc.nereus.confidence >= 0.85,
  },
];
