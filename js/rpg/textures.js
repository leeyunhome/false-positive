/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: 토먼트 고딕-석조 & 목재 비계 프로시저럴 텍스처
   Planescape: Torment 정통 석조 타일, 목재 발판, 아치 텍스처 즉석 생성
   ══════════════════════════════════════════════════════════ */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// 1. 고딕 돌 판석 (Aged Stone Flagstone) - 토먼트 바닥 스타일
export function createStoneFlagstoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // 거친 어두운 돌 베이스
  ctx.fillStyle = '#1c2228';
  ctx.fillRect(0, 0, 512, 512);

  // 불규칙 판석 타일 그리기
  const tileSize = 64;
  for (let y = 0; y < 512; y += tileSize) {
    const shift = (y / tileSize) % 2 === 0 ? 0 : tileSize / 2;
    for (let x = -shift; x < 512; x += tileSize) {
      // 돌 색상 변화
      const shade = Math.floor(Math.random() * 25) + 38;
      ctx.fillStyle = `rgb(${shade + 4}, ${shade + 8}, ${shade + 10})`;
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

      // 돌 표면 노이즈 & 균열
      ctx.fillStyle = 'rgba(10, 15, 20, 0.4)';
      ctx.fillRect(x + 6, y + 6, tileSize - 12, tileSize - 12);

      // 돌 테두리 베벨 & 하이라이트
      ctx.strokeStyle = 'rgba(100, 130, 150, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
    }
  }

  // 깊은 몰탈 줄눈 (Dark Mortar Lines)
  ctx.strokeStyle = '#080d12';
  ctx.lineWidth = 4;
  for (let y = 0; y <= 512; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let y = 0; y < 512; y += tileSize) {
    const shift = (y / tileSize) % 2 === 0 ? 0 : tileSize / 2;
    for (let x = -shift; x <= 512; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + tileSize);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

// 2. 목재 비계 판자 (Rustic Wood Scaffold Planks) - 다리/비계 스타일
export function createWoodScaffoldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // 깊은 심연 배경 틈새
  ctx.fillStyle = '#060a0f';
  ctx.fillRect(0, 0, 512, 512);

  // 나란히 놓인 목재 판자들
  const plankH = 48;
  for (let y = 0; y < 512; y += plankH) {
    // 낡은 갈색/잿빛 목재 톤
    const r = Math.floor(Math.random() * 20) + 55;
    const g = Math.floor(Math.random() * 15) + 42;
    const b = Math.floor(Math.random() * 15) + 30;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, y + 3, 512, plankH - 6);

    // 나뭇결 라인
    ctx.strokeStyle = 'rgba(25, 18, 12, 0.45)';
    ctx.lineWidth = 1;
    for (let l = y + 8; l < y + plankH - 8; l += 8) {
      ctx.beginPath();
      ctx.moveTo(0, l);
      ctx.lineTo(512, l);
      ctx.stroke();
    }

    // 못(Nails) 자국 4개
    ctx.fillStyle = '#111820';
    [32, 128, 384, 480].forEach((nx) => {
      ctx.beginPath();
      ctx.arc(nx, y + plankH / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

// 3. 메탈 그레이팅
export function createGrateFloorTexture() {
  return createStoneFlagstoneTexture();
}

// 4. 사선 경고 스트라이프
export function createHazardStripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffa53a';
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#111822';
  ctx.lineWidth = 18;
  for (let i = -128; i < 256; i += 36) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.lineTo(i + 128 + 18, 128);
    ctx.lineTo(i + 18, 0);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 1);
  return texture;
}

// 5. 강철 방벽 패널
export function createBulkheadPanelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#15222e';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#2d4559';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 250);

  ctx.strokeStyle = '#081017';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 232, 232);

  ctx.fillStyle = '#060c12';
  for (let y = 60; y <= 190; y += 18) {
    ctx.fillRect(40, y, 176, 8);
  }

  ctx.fillStyle = '#6f93a6';
  const bolts = [
    [24, 24], [128, 24], [232, 24],
    [24, 232], [128, 232], [232, 232],
    [24, 128], [232, 128]
  ];
  bolts.forEach(([bx, by]) => {
    ctx.beginPath();
    ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  return new THREE.CanvasTexture(canvas);
}
