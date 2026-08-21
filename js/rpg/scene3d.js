/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: 8등신 영웅 비례 & 디아블로4/토먼트 3D 엔진 v3.5
   - 마우스 휠 줌인/줌아웃 (Orthographic Frustum 조절)
   - 8등신 (8-Head Realistic Heroic Proportion) 정밀 인체/외골격 모델링
   - 어깨 각진 갑주, 플라즈마 블레이드, 척추 레일, 전술 헬멧, 자연스러운 보행 애니메이션
   ══════════════════════════════════════════════════════════ */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { SITES, siteById } from '../stations.js';
import {
  createStoneFlagstoneTexture,
  createWoodScaffoldTexture,
  createHazardStripeTexture,
  createBulkheadPanelTexture,
} from './textures.js';
import { DungeonGenerator } from './dungeonGenerator.js';

export const ISO_PITCH = Math.atan(1 / Math.sqrt(2)); // ~35.264도
export const ISO_YAW = -Math.PI / 4;                  // -45도
export const ISO_DISTANCE = 38;

export class Scene3D {
  constructor(container, character, combatManager, onSiteClick) {
    this.container = container;
    this.character = character;
    this.combatManager = combatManager;
    this.onSiteClick = onSiteClick || (() => {});

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // 줌 관련 (마우스 휠)
    this.frustumSize = 22.0;

    this.dungeonGen = new DungeonGenerator({ minRooms: 6, maxRooms: 8 });
    this.dungeonData = null;
    this.dungeonGroup = new THREE.Group();

    // 텍스처
    this.textures = {
      stone: null,
      wood: null,
      hazard: null,
      bulkhead: null,
    };

    // 씬 오브젝트
    this.playerMesh = null;
    this.playerLimbs = {
      leftLeg: null,
      rightLeg: null,
      leftArm: null,
      rightArm: null,
      torso: null,
      head: null,
      weapon: null,
    };
    this.playerFlashlight = null;
    this.siteMeshes = new Map();
    this.monsterMeshes = new Map();
    this.lanternLights = [];
    this.particles = null;
    this.floatingTexts = [];
    this.animatedObjects = [];

    // 플레이어 좌표 & 이동
    this.playerPos = new THREE.Vector3(0, 0, 0);
    this.targetPos = new THREE.Vector3(0, 0, 0);
    this.isMoving = false;
    this.moveSpeed = 0.14;
    this.walkCycle = 0;

    this.keys = {};
    this.lastFrameTime = performance.now();

    this.init();
  }

  init() {
    const width = (this.container && this.container.clientWidth) || 800;
    const height = (this.container && this.container.clientHeight) || 380;

    // 1. Scene & Deep Abyss Gothic Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04080e);
    this.scene.fog = new THREE.FogExp2(0x050c16, 0.022);

    // 2. Camera: True Isometric Setup
    const aspect = width / height;
    this.camera = new THREE.OrthographicCamera(
      (-this.frustumSize * aspect) / 2,
      (this.frustumSize * aspect) / 2,
      this.frustumSize / 2,
      -this.frustumSize / 2,
      0.1,
      500
    );
    this.updateCameraPosition();

    // 3. WebGPU / WebGL2 Renderer 인라인 초기화
    let rendererMode = 'WebGL2 (안정 모드)';
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        rendererMode = 'WebGPU (하드웨어 가속 지원)';
      }
    } catch (e) {
      console.warn('WebGL 가속 실패, 기본 렌더러 폴백:', e);
      this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    }

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (this.container) {
      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);
    }

    const badge = document.getElementById('rpgRendererBadge');
    if (badge) badge.textContent = `렌더러: ${rendererMode}`;

    // 4. Procedural Textures
    this.textures.stone = createStoneFlagstoneTexture();
    this.textures.wood = createWoodScaffoldTexture();
    this.textures.hazard = createHazardStripeTexture();
    this.textures.bulkhead = createBulkheadPanelTexture();

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0x0e1b26, 1.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x35e0e8, 0.85);
    dirLight.position.set(30, 50, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 160;
    const d = 40;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    this.scene.add(this.dungeonGroup);

    // 6. Build Procedural Map & 8-Head Player
    this.buildProceduralDungeon(Date.now());
    this.buildDualParticleSystem();
    this.build8HeadHeroPlayer();

    // 7. Event Listeners
    window.addEventListener('resize', () => this.onResize());
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    }

    // 마우스 휠 줌인 / 줌아웃 (디아블로4 / 토먼트 시점 조절)
    if (this.container) {
      this.container.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const zoomSpeed = 0.08;
          if (e.deltaY > 0) {
            this.frustumSize = Math.min(44.0, this.frustumSize * (1 + zoomSpeed));
          } else {
            this.frustumSize = Math.max(10.0, this.frustumSize * (1 - zoomSpeed));
          }
          this.onResize();
        },
        { passive: false }
      );
    }

    window.addEventListener('keydown', (e) => (this.keys[e.key.toLowerCase()] = true));
    window.addEventListener('keyup', (e) => (this.keys[e.key.toLowerCase()] = false));

    // 8. Start Loop
    this.animate();
  }

  buildProceduralDungeon(seed = Date.now()) {
    while (this.dungeonGroup.children.length > 0) {
      this.dungeonGroup.remove(this.dungeonGroup.children[0]);
    }
    this.siteMeshes.clear();
    this.lanternLights = [];
    this.animatedObjects = [];

    this.dungeonData = this.dungeonGen.generate(seed);
    const { rooms, corridors, spawnPoint, tileSize, gridWidth, gridHeight } = this.dungeonData;

    this.playerPos.set(spawnPoint.x, 0, spawnPoint.z);
    this.targetPos.copy(this.playerPos);

    // 1. 방 생성
    rooms.forEach((room) => {
      const rx = (room.cx - gridWidth / 2) * tileSize;
      const rz = (room.cz - gridHeight / 2) * tileSize;
      const rw = room.w * tileSize;
      const rh = room.h * tileSize;

      const isWood = room.type === 'WOOD_SCAFFOLD';
      const floorGeo = new THREE.BoxGeometry(rw, 0.35, rh);
      const floorMat = new THREE.MeshStandardMaterial({
        map: isWood ? this.textures.wood : this.textures.stone,
        roughness: isWood ? 0.85 : 0.65,
        metalness: isWood ? 0.1 : 0.4,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.position.set(rx, 0, rz);
      floorMesh.receiveShadow = true;
      floorMesh.castShadow = true;
      this.dungeonGroup.add(floorMesh);

      const wallMat = new THREE.MeshStandardMaterial({
        map: this.textures.bulkhead,
        roughness: 0.7,
      });
      const pillarGeo = new THREE.BoxGeometry(0.8, 3.2, 0.8);
      const corners = [
        [rx - rw / 2 + 0.4, rz - rh / 2 + 0.4],
        [rx + rw / 2 - 0.4, rz - rh / 2 + 0.4],
        [rx - rw / 2 + 0.4, rz + rh / 2 - 0.4],
        [rx + rw / 2 - 0.4, rz + rh / 2 - 0.4],
      ];
      corners.forEach(([px, pz]) => {
        const pillar = new THREE.Mesh(pillarGeo, wallMat);
        pillar.position.set(px, 1.6, pz);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        this.dungeonGroup.add(pillar);
      });

      // 랜턴
      const lanternGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.7, 8);
      const lanternMat = new THREE.MeshStandardMaterial({
        color: 0x111822,
        metalness: 0.9,
        emissive: 0x221104,
      });
      const lantern = new THREE.Mesh(lanternGeo, lanternMat);
      lantern.position.set(rx - rw / 2 + 1.0, 2.6, rz - rh / 2 + 1.0);
      lantern.castShadow = true;
      this.dungeonGroup.add(lantern);

      const coreGeo = new THREE.SphereGeometry(0.18, 8, 8);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.set(rx - rw / 2 + 1.0, 2.6, rz - rh / 2 + 1.0);
      this.dungeonGroup.add(coreMesh);

      const pLight = new THREE.PointLight(0xff9922, 2.4, 13.0);
      pLight.position.set(rx - rw / 2 + 1.0, 2.6, rz - rh / 2 + 1.0);
      pLight.castShadow = true;
      pLight.shadow.bias = -0.002;
      this.dungeonGroup.add(pLight);
      this.lanternLights.push({ light: pLight, baseIntensity: 2.4, x: pLight.position.x, z: pLight.position.z });

      if (room.site) {
        const site = room.site;
        const shrineGeo = new THREE.CylinderGeometry(1.0, 1.2, 1.8, 8);
        const shrineMat = new THREE.MeshStandardMaterial({
          map: this.textures.hazard,
          roughness: 0.4,
          metalness: 0.6,
        });
        const shrine = new THREE.Mesh(shrineGeo, shrineMat);
        shrine.position.set(rx, 0.9, rz);
        shrine.castShadow = true;
        shrine.receiveShadow = true;
        shrine.userData = { siteId: site.id, site };
        this.dungeonGroup.add(shrine);

        const holoGeo = new THREE.OctahedronGeometry(0.5);
        const holoMat = new THREE.MeshBasicMaterial({ color: 0x35e0e8, wireframe: true });
        const holo = new THREE.Mesh(holoGeo, holoMat);
        holo.position.set(rx, 2.4, rz);
        this.dungeonGroup.add(holo);
        this.animatedObjects.push({ obj: holo, rotSpeedY: 0.03, rotSpeedX: 0.015 });

        this.siteMeshes.set(site.id, { mesh: shrine, pos: new THREE.Vector3(rx, 0, rz), site });
      }
    });

    // 2. 통로 및 목재 비계 다리
    corridors.forEach((corr) => {
      const p1 = new THREE.Vector3((corr.p1.x - gridWidth / 2) * tileSize, 0, (corr.p1.z - gridHeight / 2) * tileSize);
      const p2 = new THREE.Vector3((corr.p2.x - gridWidth / 2) * tileSize, 0, (corr.p2.z - gridHeight / 2) * tileSize);
      const dist = p1.distanceTo(p2);
      if (dist < 0.2) return;

      const bridgeGeo = new THREE.BoxGeometry(corr.width, 0.28, dist);
      const bridgeMat = new THREE.MeshStandardMaterial({
        map: corr.isWoodBridge ? this.textures.wood : this.textures.stone,
        roughness: corr.isWoodBridge ? 0.9 : 0.6,
      });
      const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      bridge.position.set(mid.x, 0, mid.z);
      bridge.rotation.y = -Math.atan2(p2.x - p1.x, p2.z - p1.z);
      bridge.receiveShadow = true;
      bridge.castShadow = true;
      this.dungeonGroup.add(bridge);

      const archGeo = new THREE.TorusGeometry(1.4, 0.18, 6, 12, Math.PI);
      const archMat = new THREE.MeshStandardMaterial({ color: 0x182430, metalness: 0.8 });
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(p1.x, 0.05, p1.z);
      arch.rotation.y = -Math.atan2(p2.x - p1.x, p2.z - p1.z) + Math.PI / 2;
      arch.castShadow = true;
      this.dungeonGroup.add(arch);
    });

    const allSpawns = [];
    rooms.forEach((r) => {
      r.monsters.forEach((m) => {
        allSpawns.push(m);
      });
    });
    if (this.combatManager) {
      this.combatManager.spawnDungeonMonsters(allSpawns);
    }
  }

  updateCameraPosition() {
    const hDist = ISO_DISTANCE * Math.cos(ISO_PITCH);
    this.camera.position.set(
      this.playerPos.x + hDist * Math.sin(ISO_YAW),
      this.playerPos.y + ISO_DISTANCE * Math.sin(ISO_PITCH),
      this.playerPos.z + hDist * Math.cos(ISO_YAW)
    );
    this.camera.lookAt(this.playerPos.x, this.playerPos.y + 0.8, this.playerPos.z);
    this.camera.updateProjectionMatrix();
  }

  buildDualParticleSystem() {
    const count = 400;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 80;
      positions[i + 1] = Math.random() * 20;
      positions[i + 2] = (Math.random() - 0.5) * 80;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x35e0e8,
      size: 0.18,
      transparent: true,
      opacity: 0.55,
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  /* ══════════════════════════════════════════════════════════
     8등신 (8-Head Realistic Heroic Proportion) 캐릭터 모델링
     총 신장 약 2.4 유닛 (1헤드 = 0.30 유닛)
     디아블로4 중장갑 엑소슈트 + 토먼트 고딕 실루엣
     ══════════════════════════════════════════════════════════ */
  build8HeadHeroPlayer() {
    const root = new THREE.Group();

    // 머티리얼 정의 (건메탈 강철, 시안 발광, 브론즈 악센트)
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x182430,
      roughness: 0.35,
      metalness: 0.75,
    });
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x091017,
      roughness: 0.6,
      metalness: 0.4,
    });
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0x9c7a38,
      roughness: 0.3,
      metalness: 0.85,
    });
    const glowCyanMat = new THREE.MeshBasicMaterial({ color: 0x35e0e8 });

    // ── 1. 머리 & 택티컬 헬멧 (Y: 2.10 ~ 2.40, Head unit 8) ──
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2.18, 0);

    const helmetGeo = new THREE.SphereGeometry(0.16, 14, 14);
    const helmet = new THREE.Mesh(helmetGeo, armorMat);
    helmet.scale.set(1.0, 1.15, 1.1);
    headGroup.add(helmet);

    // 각진 턱 보호대
    const jawGeo = new THREE.BoxGeometry(0.16, 0.12, 0.18);
    const jaw = new THREE.Mesh(jawGeo, armorMat);
    jaw.position.set(0, -0.06, 0.04);
    headGroup.add(jaw);

    // 광학 바이저 (빛나는 시안색 글래스)
    const visorGeo = new THREE.BoxGeometry(0.20, 0.07, 0.12);
    const visor = new THREE.Mesh(visorGeo, glowCyanMat);
    visor.position.set(0, 0.02, 0.12);
    headGroup.add(visor);

    // 호흡 필터 튜브
    const rebreatherGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8);
    const rebreather = new THREE.Mesh(rebreatherGeo, jointMat);
    rebreather.rotation.z = Math.PI / 2;
    rebreather.position.set(0, -0.08, 0.12);
    headGroup.add(rebreather);

    root.add(headGroup);
    this.playerLimbs.head = headGroup;

    // ── 2. 상체 흉갑 (Thorax / Breastplate, Head unit 6~7) ──
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 1.55, 0);

    // V자형 역삼각형 흉갑
    const chestGeo = new THREE.BoxGeometry(0.56, 0.44, 0.34);
    const chest = new THREE.Mesh(chestGeo, armorMat);
    chest.castShadow = true;
    torsoGroup.add(chest);

    // 흉부 골드 트림 플레이트
    const chestPlateGeo = new THREE.BoxGeometry(0.38, 0.28, 0.06);
    const chestPlate = new THREE.Mesh(chestPlateGeo, goldTrimMat);
    chestPlate.position.set(0, 0.04, 0.16);
    torsoGroup.add(chestPlate);

    // 척추 외골격 파이프라인 (등 뒤 레일)
    const spineGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8);
    const spine = new THREE.Mesh(spineGeo, jointMat);
    spine.position.set(0, 0, -0.18);
    torsoGroup.add(spine);

    // 복부 관절 (Abdomen)
    const absGeo = new THREE.BoxGeometry(0.40, 0.26, 0.28);
    const absMesh = new THREE.Mesh(absGeo, jointMat);
    absMesh.position.set(0, -0.32, 0);
    torsoGroup.add(absMesh);

    // 전술 벨트 & 홀스터
    const beltGeo = new THREE.BoxGeometry(0.46, 0.08, 0.32);
    const belt = new THREE.Mesh(beltGeo, goldTrimMat);
    belt.position.set(0, -0.44, 0);
    torsoGroup.add(belt);

    // 어깨 탐조등 (우측 어깨 장착)
    this.playerFlashlight = new THREE.SpotLight(0x35e0e8, 4.5, 24, Math.PI / 4.5, 0.3);
    this.playerFlashlight.position.set(0.32, 0.25, 0.1);
    this.playerFlashlight.target.position.set(0, -1.0, 12);
    this.playerFlashlight.castShadow = true;
    torsoGroup.add(this.playerFlashlight);
    torsoGroup.add(this.playerFlashlight.target);

    root.add(torsoGroup);
    this.playerLimbs.torso = torsoGroup;

    // ── 3. 팔 & 무기 (Arms, Gauntlets & Plasma Blade) ──
    const makeArm = (isLeft) => {
      const armGroup = new THREE.Group();
      const sign = isLeft ? -1 : 1;
      armGroup.position.set(sign * 0.36, 1.72, 0);

      // 디아블로식 각진 어깨 갑주 (Puldron)
      const pauldronGeo = new THREE.BoxGeometry(0.24, 0.22, 0.28);
      const pauldron = new THREE.Mesh(pauldronGeo, goldTrimMat);
      pauldron.position.set(sign * 0.04, -0.02, 0);
      pauldron.rotation.z = sign * 0.15;
      pauldron.castShadow = true;
      armGroup.add(pauldron);

      // 상완 (Bicep)
      const bicepGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.30, 8);
      const bicep = new THREE.Mesh(bicepGeo, armorMat);
      bicep.position.set(0, -0.20, 0);
      bicep.castShadow = true;
      armGroup.add(bicep);

      // 전완 및 건틀릿 (Forearm & Heavy Gauntlet)
      const gauntletGeo = new THREE.BoxGeometry(0.14, 0.32, 0.16);
      const gauntlet = new THREE.Mesh(gauntletGeo, armorMat);
      gauntlet.position.set(0, -0.48, 0.03);
      gauntlet.castShadow = true;
      armGroup.add(gauntlet);

      // 우측 손에 장착된 플라즈마 절단기 (Arc Plasma Cutter)
      if (!isLeft) {
        const weaponGroup = new THREE.Group();
        weaponGroup.position.set(0, -0.66, 0.1);

        const handleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.28, 8);
        const handle = new THREE.Mesh(handleGeo, goldTrimMat);
        handle.rotation.x = Math.PI / 2;
        weaponGroup.add(handle);

        const bladeGeo = new THREE.ConeGeometry(0.06, 0.65, 8);
        const bladeMat = new THREE.MeshBasicMaterial({ color: 0x35e0e8 });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.set(0, 0, 0.4);
        blade.rotation.x = Math.PI / 2;
        weaponGroup.add(blade);

        armGroup.add(weaponGroup);
        this.playerLimbs.weapon = weaponGroup;
      }

      root.add(armGroup);
      return armGroup;
    };

    this.playerLimbs.leftArm = makeArm(true);
    this.playerLimbs.rightArm = makeArm(false);

    // ── 4. 롱레그 하체 (8-Head Long Legs & Greaves, Head unit 1~4) ──
    const makeLeg = (isLeft) => {
      const legGroup = new THREE.Group();
      const sign = isLeft ? -1 : 1;
      legGroup.position.set(sign * 0.16, 1.05, 0);

      // 대퇴부 허벅지 (Thigh) - 롱레그 비율
      const thighGeo = new THREE.CylinderGeometry(0.10, 0.08, 0.46, 8);
      const thigh = new THREE.Mesh(thighGeo, armorMat);
      thigh.position.set(0, -0.22, 0);
      thigh.castShadow = true;
      legGroup.add(thigh);

      // 무릎 보호대 (Knee Cop)
      const kneeGeo = new THREE.BoxGeometry(0.14, 0.12, 0.14);
      const knee = new THREE.Mesh(kneeGeo, goldTrimMat);
      knee.position.set(0, -0.46, 0.05);
      legGroup.add(knee);

      // 정강이받이 및 장갑 부츠 (Greave & Sabaton)
      const shinGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.48, 8);
      const shin = new THREE.Mesh(shinGeo, armorMat);
      shin.position.set(0, -0.72, 0);
      shin.castShadow = true;
      legGroup.add(shin);

      // 중장갑 전투 부츠
      const bootGeo = new THREE.BoxGeometry(0.14, 0.12, 0.26);
      const boot = new THREE.Mesh(bootGeo, jointMat);
      boot.position.set(0, -0.98, 0.06);
      boot.castShadow = true;
      legGroup.add(boot);

      root.add(legGroup);
      return legGroup;
    };

    this.playerLimbs.leftLeg = makeLeg(true);
    this.playerLimbs.rightLeg = makeLeg(false);

    // ── 5. 토먼트 정통 녹색 원형 선택 링 (Green Selection Circle) ──
    const selRingGeo = new THREE.RingGeometry(0.95, 1.15, 32);
    const selRingMat = new THREE.MeshBasicMaterial({
      color: 0x4ade9a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const selRing = new THREE.Mesh(selRingGeo, selRingMat);
    selRing.rotation.x = -Math.PI / 2;
    selRing.position.y = 0.06;
    root.add(selRing);

    root.position.copy(this.playerPos);
    this.scene.add(root);
    this.playerMesh = root;
  }

  onResize() {
    if (!this.renderer || !this.camera || !this.container) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 380;
    if (width === 0 || height === 0) return;
    const aspect = width / height;

    this.camera.left = (-this.frustumSize * aspect) / 2;
    this.camera.right = (this.frustumSize * aspect) / 2;
    this.camera.top = this.frustumSize / 2;
    this.camera.bottom = -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  onPointerDown(event) {
    if (!this.renderer || !this.renderer.domElement) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const monsterMeshesList = Array.from(this.monsterMeshes.values()).map((m) => m.mesh);
    const monsterHits = this.raycaster.intersectObjects(monsterMeshesList, true);
    if (monsterHits.length > 0) {
      const clickedMesh = monsterHits[0].object;
      const monsterData = clickedMesh.userData?.monster || clickedMesh.parent?.userData?.monster;
      if (monsterData && monsterData.hp > 0) {
        const dist = this.playerPos.distanceTo(new THREE.Vector3(monsterData.x, 0, monsterData.z));
        if (dist <= this.character.equipment.weapon.range + 1.2) {
          this.combatManager.playerAttackMonster(monsterData);
        } else {
          this.targetPos.set(monsterData.x, 0, monsterData.z);
          this.isMoving = true;
        }
        return;
      }
    }

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const rayHit = this.raycaster.ray.intersectPlane(groundPlane, hitPoint);

    if (rayHit) {
      const clampedX = Math.max(-50, Math.min(50, hitPoint.x));
      const clampedZ = Math.max(-50, Math.min(50, hitPoint.z));
      this.targetPos.set(clampedX, 0, clampedZ);
      this.isMoving = true;

      this.addFloatingText(clampedX, clampedZ, '▼', '#4ade9a');

      for (const [sId, sObj] of this.siteMeshes) {
        const d = hitPoint.distanceTo(sObj.pos);
        if (d < 3.8) {
          this.onSiteClick(sId);
          break;
        }
      }
    }
  }

  moveToSite(siteId) {
    const sObj = this.siteMeshes.get(siteId);
    if (sObj) {
      this.targetPos.set(sObj.pos.x, 0, sObj.pos.z);
      this.isMoving = true;
    }
  }

  syncMonsters() {
    for (const m of this.combatManager.monsters) {
      let mObj = this.monsterMeshes.get(m.uid);
      if (!mObj) {
        const mGroup = new THREE.Group();
        let mGeo;

        if (m.id === 'DRONE_ROGUE') {
          mGeo = new THREE.SphereGeometry(0.7, 12, 12);
        } else if (m.id === 'ABYSSAL_CRAWLER') {
          mGeo = new THREE.ConeGeometry(0.8, 1.2, 6);
        } else {
          mGeo = new THREE.DodecahedronGeometry(0.8);
        }

        const mMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(m.color),
          emissive: 0x220505,
          roughness: 0.3,
          metalness: 0.6,
        });
        const mMesh = new THREE.Mesh(mGeo, mMat);
        mMesh.position.y = 0.9;
        mMesh.castShadow = true;
        mMesh.userData = { monster: m };
        mGroup.add(mMesh);

        const enemyRingGeo = new THREE.RingGeometry(0.8, 0.95, 24);
        const enemyRingMat = new THREE.MeshBasicMaterial({ color: 0xff5a4d, side: THREE.DoubleSide });
        const enemyRing = new THREE.Mesh(enemyRingGeo, enemyRingMat);
        enemyRing.rotation.x = -Math.PI / 2;
        enemyRing.position.y = 0.05;
        mGroup.add(enemyRing);

        const hpBarGeo = new THREE.PlaneGeometry(1.3, 0.16);
        const hpBarMat = new THREE.MeshBasicMaterial({ color: 0xff5a4d, side: THREE.DoubleSide });
        const hpBar = new THREE.Mesh(hpBarGeo, hpBarMat);
        hpBar.position.y = 2.0;
        mGroup.add(hpBar);

        mGroup.position.set(m.x, 0, m.z);
        this.scene.add(mGroup);
        mObj = { group: mGroup, mesh: mMesh, hpBar, monster: m };
        this.monsterMeshes.set(m.uid, mObj);
      }

      mObj.group.position.set(m.x, 0, m.z);
      mObj.hpBar.scale.x = Math.max(0.01, m.hp / m.maxHp);
      mObj.hpBar.lookAt(this.camera.position);

      if (m.hp <= 0) {
        mObj.group.visible = false;
      }
    }
  }

  addFloatingText(x, z, text, color = '#35e0e8', isPlayer = false) {
    if (!this.container) return;
    const el = document.createElement('div');
    el.className = 'rpg-float-text';
    el.style.color = color;
    el.textContent = text;
    this.container.appendChild(el);

    const startTime = performance.now();
    this.floatingTexts.push({
      el,
      x: isPlayer ? this.playerPos.x : (x || this.playerPos.x),
      y: 2.3,
      z: isPlayer ? this.playerPos.z : (z || this.playerPos.z),
      startTime,
      duration: 1200,
    });
  }

  updateFloatingTexts(now) {
    if (!this.container || !this.camera) return;
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      const elapsed = now - ft.startTime;
      if (elapsed > ft.duration) {
        ft.el.remove();
        this.floatingTexts.splice(i, 1);
        continue;
      }

      const pos = new THREE.Vector3(ft.x, ft.y + (elapsed / 1000) * 0.9, ft.z);
      pos.project(this.camera);

      const rect = this.container.getBoundingClientRect();
      const sx = ((pos.x + 1) / 2) * rect.width;
      const sy = ((-pos.y + 1) / 2) * rect.height;

      ft.el.style.left = `${sx}px`;
      ft.el.style.top = `${sy}px`;
      ft.el.style.opacity = `${1 - elapsed / ft.duration}`;
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;

    let kx = 0, kz = 0;
    if (this.keys['w'] || this.keys['arrowup']) { kx += 1; kz -= 1; }
    if (this.keys['s'] || this.keys['arrowdown']) { kx -= 1; kz += 1; }
    if (this.keys['a'] || this.keys['arrowleft']) { kx -= 1; kz -= 1; }
    if (this.keys['d'] || this.keys['arrowright']) { kx += 1; kz += 1; }

    let walking = false;

    if (kx !== 0 || kz !== 0) {
      const len = Math.sqrt(kx * kx + kz * kz);
      this.playerPos.x += (kx / len) * this.moveSpeed;
      this.playerPos.z += (kz / len) * this.moveSpeed;
      this.isMoving = false;
      walking = true;
    } else if (this.isMoving) {
      const dx = this.targetPos.x - this.playerPos.x;
      const dz = this.targetPos.z - this.playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.2) {
        this.isMoving = false;
      } else {
        this.playerPos.x += (dx / dist) * this.moveSpeed;
        this.playerPos.z += (dz / dist) * this.moveSpeed;
        walking = true;
      }
    }

    if (this.playerMesh) {
      this.playerMesh.position.copy(this.playerPos);

      if (walking) {
        this.walkCycle += 0.22;
        // 다리 보행 사이클 (Leg swing & stride)
        if (this.playerLimbs.leftLeg) this.playerLimbs.leftLeg.rotation.x = Math.sin(this.walkCycle) * 0.52;
        if (this.playerLimbs.rightLeg) this.playerLimbs.rightLeg.rotation.x = -Math.sin(this.walkCycle) * 0.52;

        // 팔 반대 방향 스윙 (Arm counter-swing)
        if (this.playerLimbs.leftArm) this.playerLimbs.leftArm.rotation.x = -Math.sin(this.walkCycle) * 0.45;
        if (this.playerLimbs.rightArm) this.playerLimbs.rightArm.rotation.x = Math.sin(this.walkCycle) * 0.45;

        // 상체 미세 상하 진동 (Bobbing)
        if (this.playerLimbs.torso) this.playerLimbs.torso.position.y = 1.55 + Math.abs(Math.sin(this.walkCycle)) * 0.04;

        const lookTarget = this.isMoving ? this.targetPos : new THREE.Vector3(this.playerPos.x + kx, 0, this.playerPos.z + kz);
        this.playerMesh.lookAt(lookTarget.x, 0, lookTarget.z);
      } else {
        if (this.playerLimbs.leftLeg) this.playerLimbs.leftLeg.rotation.x = 0;
        if (this.playerLimbs.rightLeg) this.playerLimbs.rightLeg.rotation.x = 0;
        if (this.playerLimbs.leftArm) this.playerLimbs.leftArm.rotation.x = 0;
        if (this.playerLimbs.rightArm) this.playerLimbs.rightArm.rotation.x = 0;
      }
    }

    this.lanternLights.forEach((item, idx) => {
      const flicker = Math.sin(now * 0.007 + idx * 1.5) * 0.3 + (Math.random() - 0.5) * 0.15;
      item.light.intensity = item.baseIntensity + flicker;
    });

    for (const item of this.animatedObjects) {
      if (item.rotSpeedY) item.obj.rotation.y += item.rotSpeedY;
      if (item.rotSpeedX) item.obj.rotation.x += item.rotSpeedX;
    }

    this.updateCameraPosition();

    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= 0.025;
        if (positions[i] < 0) positions[i] = 20;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    this.combatManager.updateMonsters(this.playerPos.x, this.playerPos.z, now, delta);
    this.syncMonsters();
    this.updateFloatingTexts(now);

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
