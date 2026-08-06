#!/usr/bin/env node
/* data/incidents.json 을 게임 규칙으로 검증한다.
   스키마(구조)보다 강한 검사 — 게임이 성립하는지를 본다.
   사용: node tools/validate.mjs                                        */

import { readFileSync } from 'node:fs';

const doc = JSON.parse(readFileSync(new URL('../data/incidents.json', import.meta.url), 'utf8'));
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

if (errs.length) {
  console.error('\n✗ 검증 실패\n' + errs.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('\n✓ 검증 통과');
