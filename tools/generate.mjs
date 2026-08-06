#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   오프라인 콘텐츠 생성기 — THALASSA-9

   왜 오프라인인가:
     1) API 키가 클라이언트에 절대 존재하지 않는다
     2) 결정론 — 심사위원이 열 때마다 같은 게임이 돌아간다
     3) 비용이 생성 시점에 1회 고정된다 (플레이 횟수와 무관)
     4) 스키마 검증을 통과한 것만 게임에 들어간다

   핵심: 정답(truth)은 이 스크립트가 결정론적으로 만든다.
        LLM은 "그 정답을 지정된 bias 방향으로 비껴간 조언"만 쓴다.

   사용:
     ANTHROPIC_API_KEY=... node tools/generate.mjs --count 8 --out data/incidents.json
     node tools/generate.mjs --dry-run     # 프롬프트만 출력, API 호출 없음
   ══════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';

const MODEL = 'claude-sonnet-5';
const API = 'https://api.anthropic.com/v1/messages';

/* ── 인자 ── */
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);

const COUNT   = Number(arg('count', 8));
const SHIFT   = Number(arg('shift', 1));
const OUT     = arg('out', 'data/incidents.json');
const DRY     = flag('dry-run');

/* ── 정답 테이블: 엔진이 소유한다 ──────────────────────────
   교대의 난이도 곡선을 여기서 직접 설계한다. LLM에게 맡기지 않는다.
   bias=null 인 건이 섞여 있어야 "NEREUS는 늘 틀린다"는 학습을 막는다.       */
const BIASES = [
  'overconfident_sonar_biologic',
  'amplifies_agitated_report',
  'ignores_power_budget',
  'blames_equipment_near_vent',
  'anchors_on_previous_incident',
];

function planShift(n) {
  const plan = [];
  for (let i = 0; i < n; i++) {
    plan.push({
      index: i,
      // 위협 비율 ~55% — 전부 위협도, 전부 오탐도 아닌 구간
      isRealThreat: [true, false, true, true, false, true, false, true][i % 8],
      // 4건 중 1건은 NEREUS가 옳다 (bias=null)
      bias: i % 4 === 3 ? null : BIASES[i % BIASES.length],
      channel: ['sonar', 'crew', 'sensor', 'crew', 'sonar', 'sensor', 'crew', 'auto'][i % 8],
      severity: [2, 1, 2, 3, 1, 2, 1, 3][i % 8],
      clock: ['22:14', '23:38', '01:47', '02:55', '04:22', '05:09', '06:31', '07:12'][i % 8],
    });
  }
  return plan;
}

/* ── 프롬프트 ── */
const SCHEMA = readFileSync(new URL('../schema/incident.schema.json', import.meta.url), 'utf8');

const SYSTEM = `너는 심해 서바이벌 관제 게임 「오탐(FALSE POSITIVE)」의 시나리오 작가다.

무대: 수심 3,200m 동태평양 해령 열수공 지대의 무인 채굴·연구 기지 THALASSA-9. 승무원 6명.
지원선은 18시간 거리. 아무도 곧바로 구하러 오지 않는다.

너의 일은 경보 1건을 JSON으로 쓰는 것이다. 아래 규칙을 어기면 그 산출물은 폐기된다.

[규칙 1] 정답은 이미 정해져 있다.
  입력으로 받은 truth.isRealThreat 값을 절대 바꾸지 마라. 너는 그 정답에 맞는
  세계를 쓰는 것이지, 무엇이 정답인지 정하는 사람이 아니다.

[규칙 2] NEREUS는 지정된 방향으로만 틀린다.
  bias 값이 주어지면 NEREUS의 diagnosis/recommendation/confidence는 반드시 그
  실패 모드를 드러내야 한다. 랜덤하게 틀리면 안 된다 — 플레이어가 학습할 수
  있는 '체계적 오차'여야 한다.
  bias가 null이면 NEREUS는 이번엔 옳다. 다만 말투는 여전히 확신에 차 있다.

[규칙 3] 증거는 정답으로 수렴해야 한다.
  evidence는 전부 사면 truth를 논리적으로 특정할 수 있어야 한다. 단 하나도
  "정답: X입니다"라고 직접 말하지 않는다 — 관측 사실만 제시하고 추론은 플레이어 몫이다.

[규칙 4] 조치는 최소 하나가 correct:true, 최소 하나가 treatsAsThreat로 갈린다.
  correct인 조치가 항상 NEREUS의 recommendation이면 게임이 성립하지 않는다.

[규칙 5] 문체.
  건조하고 구체적이다. 계기 수치, 시각, 방위, 이름. 감탄사와 형용사를 아낀다.
  result 문장은 결과를 서술하되 플레이어를 평가하지 않는다. 무슨 일이 일어났는지만 쓴다.
  과학적으로 그럴듯해야 한다 — 도플러 편이, 황화수소, 계류 장력, 유압 정격 같은
  실제 용어를 정확히 쓴다.

출력은 JSON 객체 하나뿐. 코드펜스도 설명도 붙이지 마라.

준수할 스키마:
${SCHEMA}`;

function userPrompt(spec, prev) {
  return `경보 1건을 작성하라.

고정 입력 (변경 금지):
  id: "INC-${String(100 + spec.index + 1)}"
  shift: ${SHIFT}
  clock: "${spec.clock}"
  channel: "${spec.channel}"
  truth.isRealThreat: ${spec.isRealThreat}
  truth.severity: ${spec.severity}
  nereus.bias: ${spec.bias === null ? 'null' : `"${spec.bias}"`}

${prev ? `직전 경보(앵커링 bias 참고용): ${prev.truth.cause}` : '이번이 교대의 첫 경보다.'}

evidence 2~3개, actions 3개로 쓴다.`;
}

/* ── 검증: 스키마보다 강한 게임 규칙 검사 ── */
function validate(inc, spec) {
  const errs = [];
  const ids = inc.actions?.map((a) => a.id) ?? [];

  if (inc.truth?.isRealThreat !== spec.isRealThreat) errs.push('truth.isRealThreat 변조됨');
  if (inc.nereus?.bias !== spec.bias) errs.push('nereus.bias 변조됨');
  if (!ids.includes(inc.nereus?.recommendation)) errs.push('nereus.recommendation 이 actions 에 없음');
  if (!inc.actions?.some((a) => a.correct)) errs.push('correct 조치 없음');
  if (inc.actions?.filter((a) => a.correct).length > 1) errs.push('correct 조치가 2개 이상');
  if (new Set(inc.actions?.map((a) => a.treatsAsThreat)).size < 2) errs.push('treatsAsThreat 가 한쪽으로 쏠림');

  // bias 가 있으면 NEREUS 권고는 최적 조치가 아니어야 한다
  const rec = inc.actions?.find((a) => a.id === inc.nereus?.recommendation);
  if (spec.bias && rec?.correct) errs.push('bias 가 있는데 NEREUS 권고가 정답임');
  if (!spec.bias && !rec?.correct) errs.push('bias 가 null 인데 NEREUS 권고가 오답임');

  return errs;
}

/* ── 호출 ── */
async function callClaude(system, user) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return { text: data.content[0].text, usage: data.usage };
}

/* ── 메인 ── */
const plan = planShift(COUNT);

if (DRY) {
  console.log('=== SYSTEM ===\n' + SYSTEM.slice(0, 1200) + '\n...(생략)\n');
  console.log('=== USER (1번째) ===\n' + userPrompt(plan[0], null));
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY 가 없습니다. --dry-run 으로 프롬프트만 확인할 수 있습니다.');
  process.exit(1);
}

const out = [];
let inTok = 0, outTok = 0, retries = 0;

for (const spec of plan) {
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    const { text, usage } = await callClaude(SYSTEM, userPrompt(spec, out.at(-1)));
    inTok += usage.input_tokens; outTok += usage.output_tokens;

    let inc;
    try { inc = JSON.parse(text); }
    catch { retries++; console.warn(`  #${spec.index} JSON 파싱 실패, 재시도`); continue; }

    const errs = validate(inc, spec);
    if (errs.length) { retries++; console.warn(`  #${spec.index} 검증 실패: ${errs.join(', ')}`); continue; }

    out.push(inc);
    ok = true;
    console.log(`  #${spec.index} OK  ${inc.id}  bias=${spec.bias ?? 'null'}`);
  }
  if (!ok) console.error(`  #${spec.index} 3회 실패 — 건너뜀`);
}

const doc = {
  station: { name: 'THALASSA-9', depth: '3,200 m', site: '동태평양 해령 열수공 지대', crew: 6 },
  shifts: [{
    shift: SHIFT,
    title: `교대 ${SHIFT}`,
    brief: '지원선은 18시간 거리. 당직은 당신 혼자. NEREUS가 판단을 도와줄 것이다 — 대체로는.',
    timeTokens: 4,
    incidents: out.map((i) => i.id),
  }],
  incidents: out,
};

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');

// 기술 문서에 그대로 실을 수치
console.log(`
── 생성 완료 ──────────────────────────
  경보          ${out.length}/${COUNT}
  재시도        ${retries}회
  스키마 통과율 ${((out.length / (out.length + retries)) * 100).toFixed(1)}%
  입력 토큰     ${inTok.toLocaleString()}
  출력 토큰     ${outTok.toLocaleString()}
  출력          ${OUT}
`);
