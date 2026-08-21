/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: 전투 및 주사위 판정 시스템
   OpenMMO & D&D 5e / NetHack 전투 공식 기반
   ══════════════════════════════════════════════════════════ */

export function parseDice(diceStr) {
  // 예: "1d6+2" -> count=1, sides=6, bonus=2
  const match = String(diceStr).match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return { count: 1, sides: 6, bonus: 0 };
  return {
    count: parseInt(match[1], 10),
    sides: parseInt(match[2], 10),
    bonus: match[3] ? parseInt(match[3], 10) : 0,
  };
}

export function rollDice(diceStr) {
  const { count, sides, bonus } = parseDice(diceStr);
  let total = bonus;
  const rolls = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }
  return { total: Math.max(1, total), rolls, bonus };
}

// 몬스터 프리셋 (심해 이상체 및 고장난 기계)
export const MONSTER_DEFS = {
  DRONE_ROGUE: {
    id: 'DRONE_ROGUE',
    name: '폭주 용접 드론 #04',
    level: 1,
    guard: 10,
    hp: 18,
    maxHp: 18,
    attackBonus: 1,
    damageDice: '1d4+1',
    attackRange: 2.8,
    chaseRange: 8.0,
    speed: 0.035,
    attackCooldown: 1800,
    xpReward: 15,
    color: '#ff5a4d',
    desc: '수압으로 센서가 단락되어 무차별 방전 중인 유지보수 드론',
  },
  ABYSSAL_CRAWLER: {
    id: 'ABYSSAL_CRAWLER',
    name: '열수공 돌연변이 갑각체',
    level: 2,
    guard: 12,
    hp: 26,
    maxHp: 26,
    attackBonus: 3,
    damageDice: '1d6+2',
    attackRange: 2.0,
    chaseRange: 9.5,
    speed: 0.045,
    attackCooldown: 1500,
    xpReward: 25,
    color: '#ffa53a',
    desc: '열수공 주변에서 번식하여 선체 외판을 갉아먹는 생체 이상종',
  },
  PRESSURE_PHANTOM: {
    id: 'PRESSURE_PHANTOM',
    name: '초고압 초음파 잔류체',
    level: 3,
    guard: 14,
    hp: 38,
    maxHp: 38,
    attackBonus: 4,
    damageDice: '2d4+2',
    attackRange: 3.5,
    chaseRange: 12.0,
    speed: 0.03,
    attackCooldown: 2200,
    xpReward: 40,
    color: '#35e0e8',
    desc: '소나와 전자기파가 얽혀 생성된 정체불명의 심해 응집 에너지',
  },
};

export class CombatManager {
  constructor(character, onLog, onFloatText) {
    this.character = character;
    this.onLog = onLog || console.log;
    this.onFloatText = onFloatText || (() => {});
    this.monsters = [];
    this.lastPlayerAttackTime = 0;
    this.playerAttackCooldown = 1000;
  }

  spawnMonster(typeId, x, z, siteId = null) {
    const def = MONSTER_DEFS[typeId] || MONSTER_DEFS.DRONE_ROGUE;
    const monster = {
      ...def,
      uid: 'mon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      x,
      z,
      siteId,
      hp: def.hp,
      maxHp: def.maxHp,
      state: 'idle', // idle, chase, attack, dead
      lastAttackTime: 0,
      targetX: x,
      targetZ: z,
    };
    this.monsters.push(monster);
    return monster;
  }

  clearMonsters() {
    this.monsters = [];
  }

  playerAttackMonster(monster, now = performance.now()) {
    if (monster.hp <= 0) return null;
    if (now - this.lastPlayerAttackTime < this.playerAttackCooldown) return null;
    this.lastPlayerAttackTime = now;

    const d20 = Math.floor(Math.random() * 20) + 1;
    const atkBonus = this.character.attackBonus;
    const hitTotal = d20 + atkBonus;
    const isCrit = d20 === 20;
    const isHit = isCrit || (d20 !== 1 && hitTotal > monster.guard);

    if (!isHit) {
      this.onFloatText(monster.x, monster.z, '빗나감 (MISS)', '#6f93a6');
      this.onLog(`[전투] ${monster.name} 공격 빗나감! (d20: ${d20} + ${atkBonus} vs Guard: ${monster.guard})`, '⚔');
      return { hit: false, d20, damage: 0 };
    }

    const { total: rawDmg } = rollDice(this.character.equipment.weapon.dice);
    const strBonus = this.character.statMod('STR');
    const finalDmg = Math.max(1, (isCrit ? rawDmg * 2 : rawDmg) + strBonus + (this.character.equipment.weapon.bonus || 0));

    monster.hp = Math.max(0, monster.hp - finalDmg);
    const label = isCrit ? `치명타! -${finalDmg}` : `-${finalDmg}`;
    this.onFloatText(monster.x, monster.z, label, isCrit ? '#ffa53a' : '#35e0e8');
    this.onLog(`[전투] ${this.character.name}이(가) ${monster.name}에게 ${finalDmg} 대미지! (남은 HP: ${monster.hp}/${monster.maxHp})`, '⚔');

    if (monster.hp <= 0) {
      monster.state = 'dead';
      const lvlUp = this.character.addXp(monster.xpReward);
      this.onFloatText(monster.x, monster.z, `처치! +${monster.xpReward} XP`, '#4ade9a');
      this.onLog(`[전투] ${monster.name} 무력화 완료! +${monster.xpReward} XP 획득`, '◈');
      if (lvlUp) {
        this.onLog(`[성장] 레벨 업! 레벨 ${this.character.level} 도달 (스탯 & HP 증가)`, '★');
      }
    } else {
      monster.state = 'chase';
    }

    return { hit: true, damage: finalDmg, isCrit, monsterDead: monster.hp <= 0 };
  }

  monsterAttackPlayer(monster, now = performance.now()) {
    if (this.character.hp <= 0 || monster.hp <= 0) return;
    if (now - monster.lastAttackTime < monster.attackCooldown) return;
    monster.lastAttackTime = now;

    const d20 = Math.floor(Math.random() * 20) + 1;
    const hitTotal = d20 + monster.attackBonus;
    const isHit = d20 === 20 || (d20 !== 1 && hitTotal > this.character.guard);

    if (!isHit) {
      this.onFloatText(null, null, '방어 성공!', '#35e0e8', true);
      this.onLog(`[방어] ${monster.name}의 공격을 수트로 방어함! (적 roll: ${hitTotal} vs Guard: ${this.character.guard})`);
      return;
    }

    const { total: rawDmg } = rollDice(monster.damageDice);
    const isCrit = d20 === 20;
    const finalDmg = Math.max(1, isCrit ? rawDmg * 2 : rawDmg);
    this.character.takeDamage(finalDmg);

    this.onFloatText(null, null, `피격 -${finalDmg}`, '#ff5a4d', true);
    this.onLog(`[피격] ${monster.name}에게 ${finalDmg} 피해를 입음! (수트 무결성: ${this.character.hp}/${this.character.maxHp})`, '⚠');
  }

  updateMonsters(playerX, playerZ, now, delta) {
    for (const m of this.monsters) {
      if (m.state === 'dead') continue;

      const dx = playerX - m.x;
      const dz = playerZ - m.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= m.attackRange) {
        m.state = 'attack';
        this.monsterAttackPlayer(m, now);
      } else if (dist <= m.chaseRange) {
        m.state = 'chase';
        // 플레이어 방향으로 이동
        const step = m.speed * (delta / 16.6);
        m.x += (dx / dist) * step;
        m.z += (dz / dist) * step;
      } else {
        m.state = 'idle';
      }
    }
  }
}
