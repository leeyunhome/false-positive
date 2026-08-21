/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: 디아블로식 절차적 던전 생성기 (Dungeon Generator)
   입장할 때마다 완전히 새로운 방, 복도, 나무 비계 다리, 이상체 생성.
   ══════════════════════════════════════════════════════════ */

import { SITES } from '../stations.js';

export class DungeonGenerator {
  constructor(options = {}) {
    this.gridWidth = options.gridWidth || 48;
    this.gridHeight = options.gridHeight || 48;
    this.tileSize = options.tileSize || 2.4; // 1타일 = 2.4m
    this.minRooms = options.minRooms || 6;
    this.maxRooms = options.maxRooms || 9;
  }

  generate(seed = Date.now()) {
    // 의사 난수 생성기 (Deterministic Seed)
    let s = seed;
    const random = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    const numRooms = Math.floor(random() * (this.maxRooms - this.minRooms + 1)) + this.minRooms;
    const rooms = [];
    const siteKeys = [...SITES];

    // 1. 방(Room) 생성 및 비중첩 배치
    for (let i = 0; i < numRooms; i++) {
      const w = Math.floor(random() * 4) + 4; // 4~7 타일 너비
      const h = Math.floor(random() * 4) + 4; // 4~7 타일 높이
      const x = Math.floor(random() * (this.gridWidth - w - 6)) + 3;
      const z = Math.floor(random() * (this.gridHeight - h - 6)) + 3;

      const room = {
        id: `room_${i}`,
        x,
        z,
        w,
        h,
        cx: x + w / 2,
        cz: z + h / 2,
        site: siteKeys[i % siteKeys.length],
        type: i === 0 ? 'START' : (i % 2 === 0 ? 'STONE' : 'WOOD_SCAFFOLD'),
        lanterns: [],
        interactables: [],
        monsters: [],
      };

      // 중첩 검사
      let overlap = false;
      for (const other of rooms) {
        if (
          room.x < other.x + other.w + 2 &&
          room.x + room.w + 2 > other.x &&
          room.z < other.y + other.h + 2 &&
          room.z + room.h + 2 > other.z
        ) {
          overlap = true;
          break;
        }
      }

      if (!overlap || rooms.length < 4) {
        rooms.push(room);
      }
    }

    // 2. 방과 방 사이를 잇는 통로(Corridors & Wooden Bridges) 생성
    const corridors = [];
    for (let i = 0; i < rooms.length - 1; i++) {
      const rA = rooms[i];
      const rB = rooms[i + 1];

      // L자형 통로 생성 (나무 다리 또는 석조 복도)
      const p1 = { x: rA.cx, z: rA.cz };
      const p2 = { x: rB.cx, z: rA.cz };
      const p3 = { x: rB.cx, z: rB.cz };

      const isWoodBridge = random() > 0.4;
      corridors.push({ p1, p2, isWoodBridge, width: isWoodBridge ? 1.6 : 2.2 });
      corridors.push({ p1: p2, p2: p3, isWoodBridge, width: isWoodBridge ? 1.6 : 2.2 });
    }

    // 루프 연결 하나 추가
    if (rooms.length >= 3) {
      corridors.push({
        p1: { x: rooms[0].cx, z: rooms[0].cz },
        p2: { x: rooms[rooms.length - 1].cx, z: rooms[rooms.length - 1].cz },
        isWoodBridge: true,
        width: 1.6,
      });
    }

    // 3. 몬스터, 랜턴, 오브젝트 배치
    rooms.forEach((room, idx) => {
      // 방 모서리 랜턴 배치
      room.lanterns.push({
        x: (room.x + 0.8 - this.gridWidth / 2) * this.tileSize,
        z: (room.z + 0.8 - this.gridHeight / 2) * this.tileSize,
      });

      if (idx > 0) {
        // 몬스터 스폰 (방당 1~2마리)
        const monsterCount = Math.floor(random() * 2) + 1;
        const monsterTypes = ['DRONE_ROGUE', 'ABYSSAL_CRAWLER', 'PRESSURE_PHANTOM'];
        for (let m = 0; m < monsterCount; m++) {
          const mType = monsterTypes[Math.floor(random() * monsterTypes.length)];
          const mx = (room.cx + (random() - 0.5) * (room.w - 2) - this.gridWidth / 2) * this.tileSize;
          const mz = (room.cz + (random() - 0.5) * (room.h - 2) - this.gridHeight / 2) * this.tileSize;
          room.monsters.push({ type: mType, x: mx, z: mz });
        }

        // 증거/단말기 비석 배치
        room.interactables.push({
          siteId: room.site.id,
          label: room.site.label,
          desc: room.site.desc,
          x: (room.cx - this.gridWidth / 2) * this.tileSize,
          z: (room.cz - this.gridHeight / 2) * this.tileSize,
        });
      }
    });

    const startRoom = rooms[0];
    const spawnPoint = {
      x: (startRoom.cx - this.gridWidth / 2) * this.tileSize,
      z: (startRoom.cz - this.gridHeight / 2) * this.tileSize,
    };

    return {
      rooms,
      corridors,
      spawnPoint,
      tileSize: this.tileSize,
      gridWidth: this.gridWidth,
      gridHeight: this.gridHeight,
    };
  }
}
