/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: 프로시저럴 텍스처 생성기 (Canvas 2D)
   외부 이미지 다운로드 0. 브라우저 캔버스로 즉석 생성.
   ══════════════════════════════════════════════════════════ */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function createGrateFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // 베이스 어두운 메탈
  ctx.fillStyle = '#06131f';
  ctx.fillRect(0, 0, 256, 256);

  // 그레이팅 금속 격자
  ctx.strokeStyle = '#14344c';
  ctx.lineWidth = 4;
  for (let x = 0; x <= 256; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // 타일 경계 리벳
  ctx.fillStyle = '#35e0e8';
  for (let x = 0; x <= 256; x += 64) {
    for (let y = 0; y <= 256; y += 64) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  return texture;
}

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

export function createBulkheadPanelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // 방벽 강판 베이스
  ctx.fillStyle = '#0a2033';
  ctx.fillRect(0, 0, 256, 256);

  // 외곽 음영 베벨
  ctx.strokeStyle = '#1a496b';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 250);

  ctx.strokeStyle = '#05101a';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 232, 232);

  // 중앙 통풍 슬롯
  ctx.fillStyle = '#040d14';
  for (let y = 60; y <= 190; y += 18) {
    ctx.fillRect(40, y, 176, 8);
  }

  // 볼트 리벳 8개
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

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
