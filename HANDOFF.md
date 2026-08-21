# HANDOFF — 「오탐 / FALSE POSITIVE : THALASSA-9」

이 문서를 읽는 것만으로 지금까지 대화 맥락 없이 작업을 이어받을 수 있어야 합니다. 코드보다 이 문서를 먼저 읽으세요.

## 0. 지금 상황 (가장 중요)

- **다른 진행 중인 프로젝트도 같이 넘겨받은 상태라면:** `C:\coding\my-github-repository\modu-ai-lab-3dgs\HANDOFF.md`도 읽어보세요. 완전히 다른 프로젝트(3DGS 웹뷰어+허브+PDF편집기+투두앱 스위트, NAVER Cloud VM 배포)지만 같은 세션에서 두 개를 병행할 수 있습니다. 서로 코드/자산을 공유하지는 않습니다.
- **출품 대상 대회:** **OpenAI GAME BUILDERS SEOUL 2026**
- **대회 일정 (2026-08-21 공식 사이트 검증 완료):**
  - **온라인 예선 접수:** 08/04 ~ **08/26 (23:59)** (현재 정상 접수 가능)
  - **예선 심사:** 08/27
  - **본선 진출작 발표:** 08/28 ~ 08/30
  - **서울 현장 본선:** 08/31(월)
- **Codex 요건 확인 결과:** "기존 개발 프로젝트 활용 가능" 및 "챌린지 기간 중 신규 개발 내용 및 Codex 활용 과정은 가산점 및 설명 항목"으로 명시되어 있어 기존 출품작 및 신규 확장 개발분 모두 문제없이 출품 가능.
- **개발환경:** 순수 HTML/CSS/JS (Three.js ES Module CDN 연동, 빌드 스텝 0). GitHub Pages로 직접 배포/런타임 제공 (`https://leeyunhome.github.io/false-positive/`).

## 1. 무엇을 만드는가

**장르:** **Planescape: Torment 스타일 심층 대화/스탯 판정 + 3D 쿼터뷰(Isometric) 액션 RPG + 심해 의사결정 시뮬레이션**.

**설정:** 수심 3,200m 무인 해저 채굴·연구 기지 THALASSA-9. 야간 당직 오퍼레이터(플레이어) 바스(Vass). 온보드 AI **NEREUS**가 경보를 해석해 조치를 권고하지만, **체계적으로(학습 가능한 오차 패턴으로) 틀린다.**

**코어 루프:**
1. **경보 수신 & 3D 쿼터뷰 기지 탐색**: 심해 기지 10개 구획을 3D 등각 투영(Isometric) 뷰에서 실시간 이동 및 탐색.
2. **이상체 교전 (Action Combat)**: 고장난 유지보수 드론, 열수공 변이 갑각체, 초음파 잔류체와 D&D/OpenMMO 방식의 주사위 판정(Hit Roll, Guard, 1d6+2 Damage Roll) 실시간 교전.
3. **Planescape: Torment 스타일 심층 문답**: NEREUS 및 구획 단말과 `[INT 14+] 텔레메트리 강제 해독`, `[WIS 13+] AI 신경망 모순 적발`, `[CHA 12+] 긴급 지휘권 발동` 등 6대 능력치(STR, DEX, CON, INT, WIS, CHA) 기반 다중 분기 대화 및 숨은 진실 해금.
4. **플레이어 판단 & 조치**: 승인 / 조사 / 기각 선택 및 선체 무결성/생명유지/신뢰 게이지 관리.
5. **교대 종료 & 결산**: 혼동행렬(정탐/오탐/미탐/정상기각) 결산 ➔ 디렉터 콘솔에서 운영 규칙(Policy) 주입 ➔ 2교대 연속 진행.

## 2. 핵심 설계 원칙 — 절대 어기면 안 되는 것 하나

> **정답(`truth`)은 게임 엔진/콘텐츠 파일이 소유한다. LLM은 "그 정답에 대해 지정된 방향으로 어긋난 조언의 말투와 논리"만 생성한다. LLM이 정답 자체를 결정하게 하면 안 된다.**

이유: LLM이 판정을 하면 (a) 검증 불가능해지고 (b) 결정론이 깨지며 (c) 밸런싱이 불가능해집니다. `schema/incident.schema.json`과 `tools/validate.mjs`가 이 분리와 밸런스를 강제합니다.

## 3. 구현된 주요 아키텍처 및 시스템

### 3-1. 3D 쿼터뷰 심해 기지 엔진 (`js/rpg/scene3d.js`)
- OpenMMO의 등각 투영 카메라 각도 (`ISO_PITCH = Math.atan(1 / Math.sqrt(2))`, `ISO_YAW = -Math.PI / 4`) 적용.
- 10개 구획 모듈(`SITE_CORE`, `SITE_CREW`, `SITE_LIFE`, `SITE_HULL_C3`, `SITE_HULL_C4`, `SITE_MOORING`, `SITE_VENT`, `SITE_ARM`, `SITE_SONAR`, `SITE_CABLE`) 3D 렌더링.
- 동적 포인트 라이트(시안 코어 반응로, 오렌지 열수공, 에메랄드 소나) 및 해저 부유 파티클(Marine snow) 실시간 렌더링.
- 마우스 클릭 이동(Click-to-Move) 및 WASD/방향키 이동, 실시간 플로팅 대미지 텍스트 지원.

### 3-2. 캐릭터 & 6대 능력치 시스템 (`js/rpg/character.js`)
- D&D / NetHack / OpenMMO 표준 6대 능력치 (STR, DEX, CON, INT, WIS, CHA).
- 방어력(Guard): `10 + (DEX-10)/2 + Suit Bonus` (OpenMMO Guard 공식 적용).
- 고주파 플라즈마 절단기, MK-IV 심해 방압 수트, NEREUS 신경 링크, 나노 수리 주입기 인벤토리 시스템.

### 3-3. 실시간 액션 전투 시스템 (`js/rpg/combat.js`)
- 히트 판정: `d20 + attack_bonus > target_guard`.
- 피해 판정: 주사위 노테이션 파싱 (`1d6+2`, `1d4+1`, `2d4+2`).
- 몬스터 AI 상태머신 (Idle ➔ Chase ➔ Attack ➔ Dead) 및 XP/레벨업 시스템.

### 3-4. Planescape: Torment 스타일 심층 대화 엔진 (`js/rpg/dialogue.js`)
- 심해 레트로 CRT 스타일 대화 모달.
- `[스탯 판정]` 다중 선택지 분기:
  - `[WIS 13+]` NEREUS 신경망의 바이어스 가중치와 진단 오류를 지적하여 숨겨진 증거 획득.
  - `[INT 14+]` 원시 도플러 및 원격 계측 텔레메트리 암호화 버퍼를 해독하여 실제 위협 여부(`truth`) 직접 확인.
  - `[CHA 12+]` 당직 지휘권 발동으로 구획 잠금 해제.

### 3-5. 디렉터 레이어 & 밸런스 검증기 (`js/policies.js`, `tools/validate.mjs`)
- 교대 1 결산 후 디렉터 콘솔에서 NEREUS 운영 규칙을 주입하여 교대 2에 적용.
- `node tools/validate.mjs`로 8건 경보, 토큰 소비, 지배 전략 방지, 규칙 밸런스 100% 자동 검증.

## 4. 파일 구조

```
c:\coding\my-github-repository\false-positive\
├── index.html                    메인 화면: 3D ARPG 뷰, 관제 콘솔, 대화/캐릭터 모달, 결산
├── css/styles.css                심해 관제 콘솔 + 3D 뷰포트 + Torment 대화창 룩
├── js/
│   ├── game.js                   게임 코어 (상태 오케스트레이터, 3D ARPG 뷰 토글, 교대 진행)
│   ├── policies.js               디렉터 규칙 테이블 (게임과 검증기 공유 순수 모듈)
│   ├── stations.js               기지 배치도 좌표 원장 (10개 구획 정의)
│   ├── layout.js                 2D 등각 투영 렌더러 (관측 초점 이동)
│   └── rpg/                      [신규] Planescape: Torment 3D ARPG 엔진
│       ├── character.js          캐릭터, 6대 스탯, Guard, HP, 인벤토리
│       ├── combat.js             D&D 스타일 d20 전투, 주사위 피해, 몬스터 AI
│       ├── dialogue.js           Torment풍 분기 대화 & 능력치 판정 시스템
│       ├── scene3d.js            Three.js 3D 쿼터뷰(Isometric) 심해 기지 렌더러
│       └── engine.js             RPG 메인 오케스트레이터
├── data/incidents.json           베이크드 콘텐츠 (교대 2개, 경보 8건)
├── schema/incident.schema.json   경보 스키마 정의
├── tools/validate.mjs            게임 밸런스 자동 검증기
├── false-positive.zip            OpenAI 해커톤 제출용 아카이브
├── HANDOFF.md                    인수인계 및 시스템 아키텍처 가이드
└── README.md                     프로젝트 설명서
```

## 5. 지켜야 할 제약

- **회사 자산·코드·문서·캡처 절대 포함 금지.**
- **빌드 도구(Vite, React 등) 도입 금지.** 순수 HTML/CSS/JS 및 ES Module CDN 방식 유지 (GitHub Pages 즉시 배포 가능 보장).
- **한국어 UI 텍스트 톤:** 건조하고 깊이 있는 SF 및 Planescape: Torment식 철학적 톤 유지.
