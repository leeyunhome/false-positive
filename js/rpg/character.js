/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: 캐릭터 & 6대 능력치 시스템
   Planescape: Torment / NetHack / D&D 룰셋 기반
   ══════════════════════════════════════════════════════════ */

export const ATTRIBUTES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export class Character {
  constructor(name = '오퍼레이터 바스 (Vass)', role = '당직 심해 엔지니어') {
    this.name = name;
    this.role = role;
    this.level = 1;
    this.xp = 0;

    // 6대 핵심 스탯 (D&D / Torment 기준 72점 분배)
    this.stats = {
      STR: 12, // 근력: 물리 타격력, 차단문 수동 개폐
      DEX: 14, // 민첩: 이동 속도, 회피 및 방어(Guard)
      CON: 13, // 건강: 최대 HP, 심해 수압 내성
      INT: 15, // 지능: 원격 계측 분석, 시스템 해킹/진단
      WIS: 14, // 지혜: AI 모순 감지, 직관, 오차 식별
      CHA: 11, // 매력: 승무원 사기 진작, 긴급 지휘
    };

    this.recalculateDerived();
    this.hp = this.maxHp;

    // 장비 및 무기 (OpenMMO / D&D 스타일)
    this.equipment = {
      weapon: {
        id: 'WEAPON_PLASMA_CUTTER',
        name: '고주파 플라즈마 절단기',
        dice: '1d6',
        bonus: 2,
        range: 2.5,
        type: 'energy',
        desc: '심해 구조물 긴급 절단 및 방어용 공구',
      },
      suit: {
        id: 'SUIT_DEEP_EXO',
        name: 'MK-IV 심해 방압 수트',
        guardBonus: 2,
        desc: '수심 4,000m 정수압을 견디는 외골격',
      },
      trinket: {
        id: 'TRINKET_NEURAL_LINK',
        name: 'NEREUS 직접 신경 링크',
        intBonus: 1,
        desc: '온보드 AI의 계측 스트림을 직결하는 단말',
      },
    };

    this.inventory = [
      { id: 'ITEM_MED_KIT', name: '나노 수리 주입기', count: 3, effect: 'hp_heal', value: 30, desc: '생명유지 수트 무결성 30 회복' },
      { id: 'ITEM_STIM_PACK', name: '신경 각성제', count: 2, effect: 'temp_focus', value: 2, desc: '지혜/지능 판정 +2 일시 보너스' },
      { id: 'ITEM_SONAR_DECOY', name: '음향 미끼 캡슐', count: 1, effect: 'distract', desc: '심해 변이체 및 센서 이상 유인' },
    ];
  }

  recalculateDerived() {
    const dexMod = Math.floor((this.stats.DEX - 10) / 2);
    const conMod = Math.floor((this.stats.CON - 10) / 2);
    const suitGuard = this.equipment?.suit?.guardBonus || 0;

    // OpenMMO & D&D 공식: 기본 10 + DEX보정 + 슈트보정
    this.guard = Math.min(20, Math.max(1, 10 + dexMod + suitGuard));
    // Max HP: 16 + CON보정*2 + 레벨 보너스
    this.maxHp = Math.max(10, 16 + conMod * 2 + (this.level - 1) * 8);
    // 공격 보너스: STR 보정 + 레벨/2
    this.attackBonus = Math.floor((this.stats.STR - 10) / 2) + Math.floor(this.level / 2);
  }

  statMod(statName) {
    const val = this.stats[statName] || 10;
    return Math.floor((val - 10) / 2);
  }

  rollCheck(statName, dc = 12) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const mod = this.statMod(statName);
    const total = d20 + mod;
    const success = d20 === 20 || (d20 !== 1 && total >= dc);
    return {
      success,
      d20,
      mod,
      total,
      dc,
      crit: d20 === 20,
      fumble: d20 === 1,
      statName,
    };
  }

  takeDamage(amt) {
    this.hp = Math.max(0, this.hp - amt);
    return this.hp;
  }

  heal(amt) {
    this.hp = Math.min(this.maxHp, this.hp + amt);
    return this.hp;
  }

  addXp(amount) {
    this.xp += amount;
    const reqXp = 40 * Math.pow(2, this.level - 1);
    if (this.xp >= reqXp) {
      this.level++;
      this.stats.INT += 1;
      this.stats.WIS += 1;
      this.stats.CON += 1;
      this.recalculateDerived();
      this.hp = this.maxHp;
      return true; // Level up
    }
    return false;
  }
}
