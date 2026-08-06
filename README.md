# 오탐 — FALSE POSITIVE : THALASSA-9

> 수심 3,200m. 무인 해저 기지의 야간 당직 관제사.
> 온보드 AI **NEREUS**가 경보를 해석해 조치를 권고한다.
> **NEREUS는 가끔 틀린다.** 당신의 일은 언제 믿을지 정하는 것이다.

NHN GAME x AI HACKATHON 2026 (NAN2026) 사전과제 출품작.

**플레이:** https://leeyunhome.github.io/false-positive/

---

## 무엇을 하는 게임인가

한 교대(1런, 5~8분) 동안 경보 8건을 처리한다. 각 경보마다 세 가지 동사만 있다.

| 동사 | 비용 | 의미 |
|---|---|---|
| **승인** | 0 | NEREUS의 권고를 그대로 실행한다 |
| **조사** | 시간 토큰 1~3 | 하드 증거 하나를 산다 (소나 원신호 / ROV 육안 / 로그) |
| **기각** | 0 | 직접 다른 조치를 고른다 |

교대가 끝나면 점수가 **혼동행렬**로 나온다. 정탐 / **오탐** / **미탐** / 정상 기각.

### 핵심 메커닉 — NEREUS는 체계적으로 틀린다

랜덤하게 틀리는 게 아니라 **학습 가능한 실패 모드**를 가진다.

- `overconfident_sonar_biologic` — 소나 노이즈를 생물로 과신
- `amplifies_agitated_report` — 격앙된 승무원 보고에 동조해 심각도를 과대평가
- `ignores_power_budget` — 자원 제약을 판단에 반영하지 못함
- `blames_equipment_near_vent` — 열수공 근처 이상을 늘 장비 고장으로 진단
- `anchors_on_previous_incident` — 직전 경보에 앵커링

플레이어의 진짜 학습 대상은 해저 기지가 아니라 **NEREUS의 오차 분포**다.

### 디렉터 레이어 (구현 예정)

교대가 끝나면 **NEREUS의 운영 규칙을 직접 편집**한다.

```
[ ] 승무원 보고가 감정적일 때는 신뢰도를 낮춰라
[ ] 전력 예산이 30% 미만이면 보수적으로 판단하라
[ ] 소나 접촉은 도플러 편이를 확인하기 전까지 생물로 단정하지 마라
```

다음 교대에서 NEREUS는 **실제로 그 규칙을 따른다** (규칙이 프롬프트에 주입된다).
최종 교대는 **자율 모드** — 손을 떼고, 당신이 설계한 정책이 기지를 운영하는 걸 지켜본다.
클리어 조건은 "내 정책이 살아남는 것".

---

## AI 아키텍처

### 정답과 조언의 분리

이 프로젝트의 단 하나의 설계 원칙:

> **정답(`truth`)은 엔진이 소유한다. LLM은 조언의 말투와 논리만 만든다.**

`truth.isRealThreat`는 콘텐츠 생성 시점에 결정론적으로 고정되고, LLM은 그 정답을
**의도된 bias 방향으로 비껴간 조언**을 작성한다. LLM에게 판정을 맡기면 게임이 검증
불가능해지고, 같은 입력에 다른 결과가 나오며, 밸런싱이 불가능해진다.

스키마: [`schema/incident.schema.json`](schema/incident.schema.json)

### 2단 실행 모델

| 계층 | 동작 | 상태 |
|---|---|---|
| **베이크드 코퍼스** (기본값) | 오프라인에서 생성·스키마 검증한 `data/incidents.json`을 동봉. 결정론적, 무료, 오프라인 동작 | 구현됨 |
| **라이브 모드** | 프록시 경유 실시간 생성. 자유 서술 정책이 실제 프롬프트에 주입됨 | 예정 |
| **자동 폴백** | 프록시 실패·한도 초과 시 조용히 베이크드로 내려앉음 | 예정 |

API 키는 클라이언트에 존재하지 않는다. 생성은 전부 오프라인(`tools/generate.mjs`),
라이브 모드는 서버 사이드 프록시를 경유한다.

---

## 실행

빌드 스텝 없음. 의존성 0. 정적 파일이 전부다.

```bash
# 로컬 (fetch 때문에 file:// 은 안 됨)
python -m http.server 8000
# → http://localhost:8000
```

콘텐츠 재생성 (Node 18+, `ANTHROPIC_API_KEY` 필요):

```bash
node tools/generate.mjs --shift 1 --count 8 --out data/incidents.json
```

---

## 구조

```
index.html                    화면 구조
css/styles.css                심해 관제 콘솔 룩 (아트 에셋 0)
js/game.js                    게임 코어 — 상태·판정·혼동행렬·소나
data/incidents.json           베이크드 콘텐츠
schema/incident.schema.json   경보 계약 (생성 파이프라인의 검증 기준)
tools/generate.mjs            오프라인 생성기
```

---

## 크레딧

UI 패턴 일부는 제작자의 기존 개인 프로젝트
[edge-monitor](https://github.com/leeyunhome/edge-monitor)(관제 대시보드 데모)의
비주얼 언어를 재사용했다. 게임 로직·AI 시스템·콘텐츠는 본 프로젝트에서 신규 작성.

장르 계보: *Papers, Please* · *Reigns* · *Orwell*.
