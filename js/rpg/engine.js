/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: 메인 엔진 오케스트레이터
   ══════════════════════════════════════════════════════════ */

import { Character } from './character.js';
import { CombatManager, MONSTER_DEFS } from './combat.js';
import { DialogueEngine, createNereusInterrogation } from './dialogue.js';
import { Scene3D } from './scene3d.js';
import { siteById } from '../stations.js';

export class RpgEngine {
  constructor(containerEl, onLog) {
    this.containerEl = containerEl;
    this.onLog = onLog || console.log;

    this.character = new Character();
    this.combatManager = new CombatManager(
      this.character,
      (text, mark) => this.onLog(text, mark),
      (x, z, text, color, isPlayer) => {
        if (this.scene3d) this.scene3d.addFloatingText(x, z, text, color, isPlayer);
      }
    );

    this.dialogueEngine = new DialogueEngine(
      this.character,
      (inc) => this.onEvidenceDiscovered(inc),
      (hint) => this.onPolicyHint(hint),
      (text, mark) => this.onLog(text, mark)
    );

    this.scene3d = null;
    this.currentIncident = null;
    this.activeEvidenceCallback = null;
  }

  init() {
    this.scene3d = new Scene3D(
      this.containerEl,
      this.character,
      this.combatManager,
      (siteId) => this.onSiteInteraction(siteId)
    );

    this.bindHudEvents();
    this.updateCharacterSheet();
  }

  onSiteInteraction(siteId) {
    const site = siteById(siteId);
    this.onLog(`[위치 도달] ${site ? site.label : siteId} 구획에 접근함`, '▸');

    // 현재 발생 중인 경보의 증거 지점과 일치하는지 확인
    if (this.currentIncident && this.currentIncident.evidence) {
      const matchEv = this.currentIncident.evidence.find((e) => e.site === siteId);
      if (matchEv) {
        // NEREUS 및 단말기 심층 문답 대화 트리 열기
        const diag = createNereusInterrogation(this.currentIncident, this.character, {
          onEvidenceDiscovered: () => {
            if (this.activeEvidenceCallback) this.activeEvidenceCallback(matchEv);
          },
        });
        this.dialogueEngine.startDialogue(diag);
        return;
      }
    }

    // 기본 구획 단말 대화
    this.openGenericStationTerminal(siteId);
  }

  openGenericStationTerminal(siteId) {
    const site = siteById(siteId) || { label: siteId };
    const diag = {
      id: 'GENERIC_TERMINAL',
      nodes: {
        START: {
          speaker: `${site.label} 로컬 단말`,
          role: 'THALASSA-9 원격 유지보수 서브시스템',
          text: `[구획 상태 정상] 수심 3,200m 외벽 정수압: 32.4 MPa.<br/>
                 현재 구획은 대기 및 전력 그리드에 연결되어 있습니다. 비상 오버라이드 또는 정밀 진단을 수행할 수 있습니다.`,
          options: [
            {
              label: `[INT 12 판정] 구획 서브루틴 메모리를 덤프하여 숨은 이상 징후 분석`,
              check: {
                stat: 'INT',
                dc: 12,
                passNode: 'DUMP_PASS',
                failNode: 'DUMP_FAIL',
              },
            },
            {
              label: `[나노 수리 키트 사용] 방압 슈트 무결성 30 회복`,
              action: () => {
                this.character.heal(30);
                this.updateCharacterSheet();
                this.onLog(`[회복] 나노 수리 주입기 사용 ➔ 현재 HP: ${this.character.hp}/${this.character.maxHp}`, '♥');
              },
              next: 'CLOSE',
            },
            { label: `[단말기 닫기]`, next: 'CLOSE' },
          ],
        },
        DUMP_PASS: {
          speaker: `${site.label} 로컬 단말`,
          role: '진단 완료',
          text: `[성공] NEREUS가 필터링한 로우 패스 음향 데이터 3건을 백업했습니다. 경험치 +15 XP 획득.`,
          options: [
            {
              label: `확인`,
              action: () => {
                this.character.addXp(15);
                this.updateCharacterSheet();
              },
              next: 'CLOSE',
            },
          ],
        },
        DUMP_FAIL: {
          speaker: `${site.label} 로컬 단말`,
          role: '진단 실패',
          text: `데이터 패킷 손상으로 유의미한 시그니처를 추출하지 못했습니다.`,
          options: [{ label: `닫기`, next: 'CLOSE' }],
        },
      },
    };
    this.dialogueEngine.startDialogue(diag);
  }

  setIncident(inc, evidenceCallback, shiftIdx = 0) {
    this.currentIncident = inc;
    this.activeEvidenceCallback = evidenceCallback;

    // 매 경보/교대마다 디아블로식 무작위 절차적 던전 맵 재생성
    if (this.scene3d && inc) {
      const seed = (inc.id.charCodeAt(inc.id.length - 1) * 7919) + Date.now();
      this.scene3d.buildProceduralDungeon(seed);
      this.onLog(`[절차적 던전 생성] ${inc.id} 구획 석조 비계 던전 맵 재구성됨 (Seed: ${seed % 10000})`, '◈');
    }
  }

  updateCharacterSheet() {
    const c = this.character;
    const nameEl = document.getElementById('rpgCharName');
    const hpEl = document.getElementById('rpgHpVal');
    const hpBarEl = document.getElementById('rpgHpBar');
    const guardEl = document.getElementById('rpgGuardVal');
    const lvlEl = document.getElementById('rpgLvlVal');
    const xpEl = document.getElementById('rpgXpVal');

    if (nameEl) nameEl.textContent = `${c.name} (Lv.${c.level})`;
    if (hpEl) hpEl.textContent = `${c.hp}/${c.maxHp}`;
    if (hpBarEl) hpBarEl.style.width = `${(c.hp / c.maxHp) * 100}%`;
    if (guardEl) guardEl.textContent = c.guard;
    if (lvlEl) lvlEl.textContent = c.level;
    if (xpEl) xpEl.textContent = c.xp;

    // 스탯 테이블 갱신
    for (const stat of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
      const valEl = document.getElementById(`rpgStat_${stat}`);
      const modEl = document.getElementById(`rpgMod_${stat}`);
      if (valEl) valEl.textContent = c.stats[stat];
      if (modEl) {
        const mod = c.statMod(stat);
        modEl.textContent = mod >= 0 ? `+${mod}` : `${mod}`;
      }
    }
  }

  bindHudEvents() {
    const charBtn = document.getElementById('rpgCharSheetBtn');
    const charModal = document.getElementById('rpgCharModal');
    const charClose = document.getElementById('rpgCharClose');

    if (charBtn && charModal) {
      charBtn.addEventListener('click', () => {
        this.updateCharacterSheet();
        charModal.classList.toggle('active');
      });
    }
    if (charClose && charModal) {
      charClose.addEventListener('click', () => charModal.classList.remove('active'));
    }
  }
}
