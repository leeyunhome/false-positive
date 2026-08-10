#!/usr/bin/env node
/* data/incidents.json 을 게임 규칙으로 검증한다.
   스키마(구조)보다 강한 검사 — 게임이 성립하는지를 본다.
   사용: node tools/validate.mjs                                        */

import { readFileSync } from 'node:fs';

const doc = JSON.parse(readFileSync(new URL('../data/incidents.json', import.meta.url), 'utf8'));

/* js/policies.js 는 브라우저용 .js 확장자라 Node 가 CommonJS 로 읽는다.
   data: URL 로 감싸 ESM 으로 강제 로드한다 — package.json 도 빌드도 필요 없다. */
const esm = (rel) => import(
  'data:text/javascript;charset=utf-8,' +
  encodeURIComponent(readFileSync(new URL(rel, import.meta.url), 'utf8'))
);
const { POLICIES, POLICY_MAX } = await esm('../js/policies.js');
const { SITES } = await esm('../js/stations.js');
const errs = [];
const warn = (id, m) => errs.push(`${id}: ${m}`);

for (const s of doc.shifts) {
  for (const id of s.incidents) {
    if (!doc.incidents.some((i) => i.id === id)) warn(`shift${s.shift}`, `${id} 정의 없음`);
  }
}

for (const inc of doc.incidents) {
  const ids = inc.actions.map((a) => a.id);
  const rec = inc.actions.find((a) => a.id === inc.nereus.recommendation);
  const correct = inc.actions.filter((a) => a.correct);

  if (!rec) warn(inc.id, `nereus.recommendation "${inc.nereus.recommendation}" 이 actions 에 없음`);
  if (correct.length !== 1) warn(inc.id, `correct 조치가 ${correct.length}개 (1개여야 함)`);
  if (new Set(inc.actions.map((a) => a.treatsAsThreat)).size < 2)
    warn(inc.id, 'treatsAsThreat 가 한쪽으로만 쏠려 혼동행렬이 성립하지 않음');
  if (new Set(ids).size !== ids.length) warn(inc.id, 'action id 중복');
  if (inc.channel === 'crew' && !inc.reporter) warn(inc.id, 'crew 채널인데 reporter 없음');
  if (inc.evidence.length === 0) warn(inc.id, '증거 없음 — 조사 동사가 무의미해짐');

  for (const e of inc.evidence) {
    if (!e.site) warn(inc.id, `${e.id} 에 site 없음 — 쿼터뷰 맵에서 갈 곳이 없음`);
    else if (!SITES.some((s) => s.id === e.site))
      warn(inc.id, `${e.id} 의 site "${e.site}" 가 js/stations.js 에 없음`);
  }

  const bias = inc.nereus.bias;
  if (bias && rec?.correct) warn(inc.id, `bias(${bias})가 있는데 NEREUS 권고가 정답임`);
  if (!bias && rec && !rec.correct) warn(inc.id, 'bias 가 null 인데 NEREUS 권고가 오답임');
}

// 교대 밸런스
for (const s of doc.shifts) {
  const list = s.incidents.map((id) => doc.incidents.find((i) => i.id === id)).filter(Boolean);
  const threats = list.filter((i) => i.truth.isRealThreat).length;
  const honest = list.filter((i) => i.nereus.bias === null).length;
  const minCost = list.reduce((a, i) => a + Math.min(...i.evidence.map((e) => e.cost)), 0);

  console.log(`교대 ${s.shift}: 경보 ${list.length} · 실제위협 ${threats} · NEREUS 정답 ${honest} · 토큰 ${s.timeTokens} (전건 최소조사 ${minCost})`);
  if (honest === 0) warn(`shift${s.shift}`, 'NEREUS 가 한 번도 안 맞음 — "항상 기각"이 지배 전략이 됨');
  if (threats === 0 || threats === list.length) warn(`shift${s.shift}`, '위협이 전부/전무 — 혼동행렬 한 축이 죽음');
  if (minCost <= s.timeTokens) warn(`shift${s.shift}`, '토큰이 넉넉해 전건 조사가 가능 — 긴장이 없음');
}

/* ── 디렉터 규칙 밸런스 ──────────────────────────────────────
   규칙은 교대 2부터 적용된다(교대 1은 관측 구간).
   여기서 보는 것은 "규칙 선택이 실제로 선택인가"다.
   전부 켜는 게 지배 전략이면 디렉터 레이어는 장식이 된다.       */
const ruleShifts = doc.shifts.slice(1);
const stat = new Map(POLICIES.map((p) => [p.id, { hit: 0, miss: 0 }]));

for (const s of ruleShifts) {
  for (const id of s.incidents) {
    const inc = doc.incidents.find((i) => i.id === id);
    if (!inc) continue;
    const rec = inc.actions.find((a) => a.id === inc.nereus.recommendation);
    const nereusWrong = !rec?.correct;
    for (const p of POLICIES) {
      if (!p.match(inc)) continue;
      stat.get(p.id)[nereusWrong ? 'hit' : 'miss']++;
    }
  }
}

console.log(`\n디렉터 규칙 (교대 2~, 최대 ${POLICY_MAX}개 선택):`);
for (const p of POLICIES) {
  const { hit, miss } = stat.get(p.id);
  console.log(`  ${p.short.padEnd(9)} 적중 ${hit} · 오작동 ${miss}`);
}

if (POLICIES.some((p) => stat.get(p.id).hit === 0 && stat.get(p.id).miss === 0)) {
  const idle = POLICIES.filter((p) => !stat.get(p.id).hit && !stat.get(p.id).miss);
  console.log(`  ↳ 미발동: ${idle.map((p) => p.short).join(', ')} (과적합 함정으로 의도된 것인지 확인할 것)`);
}
if (POLICIES.every((p) => stat.get(p.id).miss === 0)) {
  warn('policy', '어떤 규칙도 옳은 권고를 깎지 않음 — 비용이 없어 "전부 켜기"가 지배 전략이 됨');
}
if (!POLICIES.some((p) => stat.get(p.id).hit > 0)) {
  warn('policy', '적중하는 규칙이 하나도 없음 — 디렉터 레이어가 무의미해짐');
}
if (POLICIES.filter((p) => stat.get(p.id).hit > 0).length <= POLICY_MAX &&
    POLICIES.length > POLICY_MAX) {
  warn('policy', `적중 규칙 수가 선택 한도(${POLICY_MAX}) 이하 — 고를 필요 없이 정답 조합이 하나로 고정됨`);
}

/* ── 배치도 활용도 ──────────────────────────────────────────
   맵에 있는데 아무 증거도 가리키지 않는 지점은 죽은 장식이다.   */
const used = new Set(doc.incidents.flatMap((i) => i.evidence.map((e) => e.site)));
const unused = SITES.filter((s) => !used.has(s.id));
console.log(`\n배치도: 지점 ${SITES.length} · 증거가 가리키는 지점 ${used.size}`);
if (unused.length) {
  console.log(`  ↳ 미사용: ${unused.map((s) => s.label).join(', ')}`);
}

if (errs.length) {
  console.error('\n✗ 검증 실패\n' + errs.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('\n✓ 검증 통과');
