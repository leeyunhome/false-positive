/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: 3D 쿼터뷰 (Isometric) 심해 기지 엔진 v2.1
   Planescape: Torment식 고딕-인더스트리얼 디테일 & OpenMMO 3D 렌더링
   ══════════════════════════════════════════════════════════ */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { SITES, LINKS, siteById } from '../stations.js';
import {
  createGrateFloorTexture,
  createHazardStripeTexture,
  createBulkheadPanelTexture,
} from './textures.js';

// OpenMMO 표준 등각 투영(Isometric) 상수
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

    // 텍스처
    this.textures = {
      grate: null,
      hazard: null,
      bulkhead: null,
    };

    // 씬 오브젝트
    this.playerMesh = null;
    this.playerLimbs = { leftLeg: null, rightLeg: null, torso: null, head: null };
    this.playerFlashlight = null;
    this.siteMeshes = new Map();
    this.corridorGroup = new THREE.Group();
    this.monsterMeshes = new Map();
    this.particles = null;
    this.bubbleParticles = null;
    this.floatingTexts = [];
    this.animatedObjects = []; // 매 프레임 회전/맥동할 오브젝트들
    this.emergencyStrobe = null; // 비상 회전 경광등

    // 플레이어 좌표 & 이동
    this.playerPos = new THREE.Vector3(0, 0.6, 0);
    this.targetPos = new THREE.Vector3(0, 0.6, 0);
    this.isMoving = false;
    this.moveSpeed = 0.13;
    this.walkCycle = 0;

    this.keys = {};
    this.lastFrameTime = performance.now();

    this.init();
  }

  init() {
    const width = (this.container && this.container.clientWidth) || 800;
    const height = (this.container && this.container.clientHeight) || 380;

    // 1. Scene & Deep Sea Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02070e);
    this.scene.fog = new THREE.FogExp2(0x030a14, 0.024);

    // 2. Camera: True Isometric Setup
    const aspect = width / height;
    const frustumSize = 25;
    this.camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      500
    );
    this.updateCameraPosition();

    // 3. WebGPU / WebGL2 Renderer 직접 인라인 초기화
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
    this.textures.grate = createGrateFloorTexture();
    this.textures.hazard = createHazardStripeTexture();
    this.textures.bulkhead = createBulkheadPanelTexture();

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0x0d2233, 1.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x35e0e8, 1.0);
    dirLight.position.set(25, 45, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 35;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // 비상 경광등 (회전형 스팟/포인트 라이트)
    this.emergencyStrobe = new THREE.PointLight(0xff5a4d, 0, 25);
    this.emergencyStrobe.position.set(0, 8, 0);
    this.scene.add(this.emergencyStrobe);

    // 6. Build High-Detail Environment
    this.buildDetailedFloor();
    this.buildDetailedStations();
    this.buildDetailedCorridors();
    this.buildDualParticleSystem();
    this.buildDetailedPlayer();

    // 7. Event Listeners
    window.addEventListener('resize', () => this.onResize());
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    }
    window.addEventListener('keydown', (e) => (this.keys[e.key.toLowerCase()] = true));
    window.addEventListener('keyup', (e) => (this.keys[e.key.toLowerCase()] = false));

    // 8. Start Loop
    this.animate();
  }

  updateCameraPosition() {
    const hDist = ISO_DISTANCE * Math.cos(ISO_PITCH);
    this.camera.position.set(
      this.playerPos.x + hDist * Math.sin(ISO_YAW),
      this.playerPos.y + ISO_DISTANCE * Math.sin(ISO_PITCH),
      this.playerPos.z + hDist * Math.cos(ISO_YAW)
    );
    this.camera.lookAt(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.camera.updateProjectionMatrix();
  }

  buildDetailedFloor() {
    const floorGeo = new THREE.PlaneGeometry(85, 85, 32, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.textures.grate,
      roughness: 0.7,
      metalness: 0.5,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(85, 34, 0x14344c, 0x071b29);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  buildDetailedStations() {
    const SCALE = 12.0;

    for (const site of SITES) {
      const group = new THREE.Group();
      const wx = site.x * SCALE;
      const wz = site.y * SCALE;
      group.position.set(wx, 0, wz);

      let pLightColor = 0x35e0e8;

      if (site.id === 'SITE_CORE') {
        pLightColor = 0x00f0ff;
        const bGeo = new THREE.CylinderGeometry(3.6, 4.0, 0.6, 16);
        const bMat = new THREE.MeshStandardMaterial({ map: this.textures.hazard, roughness: 0.5 });
        const base = new THREE.Mesh(bGeo, bMat);
        base.position.y = 0.3;
        base.receiveShadow = true;
        group.add(base);

        const rGeo = new THREE.CylinderGeometry(2.4, 2.4, 3.2, 16);
        const rMat = new THREE.MeshStandardMaterial({
          color: 0x0c2538,
          emissive: 0x051a29,
          roughness: 0.3,
          metalness: 0.7,
        });
        const reactor = new THREE.Mesh(rGeo, rMat);
        reactor.position.y = 2.0;
        reactor.castShadow = true;
        reactor.receiveShadow = true;
        reactor.userData = { siteId: site.id, site };
        group.add(reactor);

        const ringGeo = new THREE.TorusGeometry(3.0, 0.08, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x35e0e8, wireframe: true });
        const holoRing = new THREE.Mesh(ringGeo, ringMat);
        holoRing.position.y = 2.4;
        holoRing.rotation.x = Math.PI / 3;
        group.add(holoRing);
        this.animatedObjects.push({ obj: holoRing, rotSpeedY: 0.025, rotSpeedX: 0.01 });

        const coreSphereGeo = new THREE.SphereGeometry(0.8, 16, 16);
        const coreSphereMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const coreSphere = new THREE.Mesh(coreSphereGeo, coreSphereMat);
        coreSphere.position.y = 2.2;
        group.add(coreSphere);
      } else if (site.id === 'SITE_VENT' || site.kind === 'vent') {
        pLightColor = 0xffa53a;
        const vGeo = new THREE.ConeGeometry(2.6, 3.8, 8);
        const vMat = new THREE.MeshStandardMaterial({
          color: 0x221108,
          emissive: 0x3d1704,
          roughness: 0.9,
        });
        const vent = new THREE.Mesh(vGeo, vMat);
        vent.position.y = 1.9;
        vent.castShadow = true;
        vent.receiveShadow = true;
        vent.userData = { siteId: site.id, site };
        group.add(vent);

        const lavaGeo = new THREE.RingGeometry(0.2, 1.0, 12);
        const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff7700, side: THREE.DoubleSide });
        const lava = new THREE.Mesh(lavaGeo, lavaMat);
        lava.rotation.x = -Math.PI / 2;
        lava.position.y = 3.75;
        group.add(lava);
      } else if (site.id === 'SITE_SONAR' || site.kind === 'mast') {
        pLightColor = 0x4ade9a;
        const poleGeo = new THREE.CylinderGeometry(0.4, 0.6, 4.2, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x14344c, metalness: 0.8 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 2.1;
        pole.castShadow = true;
        group.add(pole);

        const dishGeo = new THREE.CylinderGeometry(1.6, 0.2, 0.5, 12);
        const dishMat = new THREE.MeshStandardMaterial({ color: 0x1a7f8a, metalness: 0.6 });
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.y = 4.2;
        dish.rotation.z = Math.PI / 6;
        dish.castShadow = true;
        dish.userData = { siteId: site.id, site };
        group.add(dish);
        this.animatedObjects.push({ obj: dish, rotSpeedY: 0.035 });
      } else if (site.id === 'SITE_ARM' || site.kind === 'arm') {
        pLightColor = 0xffa53a;
        const bGeo = new THREE.BoxGeometry(2.4, 1.2, 2.4);
        const bMat = new THREE.MeshStandardMaterial({ map: this.textures.hazard });
        const bMesh = new THREE.Mesh(bGeo, bMat);
        bMesh.position.y = 0.6;
        group.add(bMesh);

        const armGeo = new THREE.BoxGeometry(0.6, 3.4, 0.6);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x243e54, metalness: 0.7 });
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(0.6, 2.4, 0.6);
        arm.rotation.z = -Math.PI / 4;
        arm.castShadow = true;
        arm.userData = { siteId: site.id, site };
        group.add(arm);
      } else {
        pLightColor = 0x35e0e8;
        const modGeo = new THREE.BoxGeometry(4.4, 2.6, 4.4);
        const modMat = new THREE.MeshStandardMaterial({
          map: this.textures.bulkhead,
          roughness: 0.5,
          metalness: 0.5,
        });
        const moduleMesh = new THREE.Mesh(modGeo, modMat);
        moduleMesh.position.y = 1.3;
        moduleMesh.castShadow = true;
        moduleMesh.receiveShadow = true;
        moduleMesh.userData = { siteId: site.id, site };
        group.add(moduleMesh);

        const pipeGeo = new THREE.CylinderGeometry(0.2, 0.2, 4.0, 8);
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1a7f8a, metalness: 0.8 });
        const pipe = new THREE.Mesh(pipeGeo, pipeMat);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.y = 2.7;
        group.add(pipe);
      }

      const pLight = new THREE.PointLight(pLightColor, 2.2, 11.0);
      pLight.position.set(0, 3.2, 0);
      group.add(pLight);

      const ringGeo = new THREE.RingGeometry(3.0, 3.3, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: pLightColor, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      group.add(ring);
      this.animatedObjects.push({ obj: ring, pulse: true });

      this.scene.add(group);
      const mainMesh = group.children.find((c) => c.userData?.siteId) || group.children[0];
      this.siteMeshes.set(site.id, { group, mesh: mainMesh, ring, pLight, site });
    }
  }

  buildDetailedCorridors() {
    const SCALE = 12.0;
    this.scene.add(this.corridorGroup);

    for (const [aId, bId] of LINKS) {
      const a = siteById(aId);
      const b = siteById(bId);
      if (!a || !b) continue;

      const p1 = new THREE.Vector3(a.x * SCALE, 0, a.y * SCALE);
      const p2 = new THREE.Vector3(b.x * SCALE, 0, b.y * SCALE);
      const dist = p1.distanceTo(p2);

      const pathGeo = new THREE.PlaneGeometry(1.8, dist);
      const pathMat = new THREE.MeshStandardMaterial({
        map: this.textures.grate,
        roughness: 0.6,
      });
      const pathMesh = new THREE.Mesh(pathGeo, pathMat);
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      pathMesh.position.set(mid.x, 0.04, mid.z);
      pathMesh.rotation.x = -Math.PI / 2;
      pathMesh.rotation.z = -Math.atan2(p2.x - p1.x, p2.z - p1.z);
      pathMesh.receiveShadow = true;
      this.corridorGroup.add(pathMesh);

      for (const t of [0.35, 0.65]) {
        const ribPos = new THREE.Vector3().lerpVectors(p1, p2, t);
        const archGeo = new THREE.TorusGeometry(1.3, 0.15, 6, 12, Math.PI);
        const archMat = new THREE.MeshStandardMaterial({ color: 0x14344c, metalness: 0.8 });
        const arch = new THREE.Mesh(archGeo, archMat);
        arch.position.set(ribPos.x, 0.05, ribPos.z);
        arch.rotation.y = -Math.atan2(p2.x - p1.x, p2.z - p1.z) + Math.PI / 2;
        arch.castShadow = true;
        this.corridorGroup.add(arch);
      }
    }
  }

  buildDualParticleSystem() {
    const count = 450;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 70;
      positions[i + 1] = Math.random() * 20;
      positions[i + 2] = (Math.random() - 0.5) * 70;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x35e0e8,
      size: 0.18,
      transparent: true,
      opacity: 0.6,
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);

    const bCount = 120;
    const bGeo = new THREE.BufferGeometry();
    const bPos = new Float32Array(bCount * 3);
    const ventSite = siteById('SITE_VENT');
    const vx = (ventSite?.x || 1.2) * 12.0;
    const vz = (ventSite?.y || -0.9) * 12.0;

    for (let i = 0; i < bCount * 3; i += 3) {
      bPos[i] = vx + (Math.random() - 0.5) * 4;
      bPos[i + 1] = Math.random() * 16;
      bPos[i + 2] = vz + (Math.random() - 0.5) * 4;
    }
    bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    const bMat = new THREE.PointsMaterial({
      color: 0xffa53a,
      size: 0.28,
      transparent: true,
      opacity: 0.75,
    });
    this.bubbleParticles = new THREE.Points(bGeo, bMat);
    this.scene.add(this.bubbleParticles);
  }

  buildDetailedPlayer() {
    const group = new THREE.Group();

    const torsoGeo = new THREE.BoxGeometry(0.7, 0.8, 0.45);
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x14344c,
      emissive: 0x0a1e2d,
      roughness: 0.3,
      metalness: 0.7,
    });
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    group.add(torso);
    this.playerLimbs.torso = torso;

    const headGeo = new THREE.SphereGeometry(0.28, 12, 12);
    const head = new THREE.Mesh(headGeo, armorMat);
    head.position.y = 1.5;
    group.add(head);

    const visorGeo = new THREE.BoxGeometry(0.32, 0.16, 0.2);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x35e0e8 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.5, 0.22);
    group.add(visor);

    const packGeo = new THREE.BoxGeometry(0.5, 0.6, 0.25);
    const packMat = new THREE.MeshStandardMaterial({ color: 0x092233, metalness: 0.8 });
    const pack = new THREE.Mesh(packGeo, packMat);
    pack.position.set(0, 1.0, -0.32);
    group.add(pack);

    this.playerFlashlight = new THREE.SpotLight(0x35e0e8, 4.2, 22, Math.PI / 4.5, 0.35);
    this.playerFlashlight.position.set(0.3, 1.5, 0.1);
    this.playerFlashlight.target.position.set(0, 0, 10);
    this.playerFlashlight.castShadow = true;
    group.add(this.playerFlashlight);
    group.add(this.playerFlashlight.target);

    const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8);
    const leftLeg = new THREE.Mesh(legGeo, armorMat);
    leftLeg.position.set(-0.2, 0.35, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    this.playerLimbs.leftLeg = leftLeg;

    const rightLeg = new THREE.Mesh(legGeo, armorMat);
    rightLeg.position.set(0.2, 0.35, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
    this.playerLimbs.rightLeg = rightLeg;

    const selRingGeo = new THREE.RingGeometry(0.85, 1.0, 24);
    const selRingMat = new THREE.MeshBasicMaterial({ color: 0x35e0e8, side: THREE.DoubleSide });
    const selRing = new THREE.Mesh(selRingGeo, selRingMat);
    selRing.rotation.x = -Math.PI / 2;
    selRing.position.y = 0.06;
    group.add(selRing);

    group.position.copy(this.playerPos);
    this.scene.add(group);
    this.playerMesh = group;
  }

  onResize() {
    if (!this.renderer || !this.camera || !this.container) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 380;
    if (width === 0 || height === 0) return;
    const aspect = width / height;
    const frustumSize = 25;

    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
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
    const monsterHits = this.raycaster.intersectObjects(monsterMeshesList);
    if (monsterHits.length > 0) {
      const clickedMonsterMesh = monsterHits[0].object;
      const monsterData = clickedMonsterMesh.userData.monster;
      if (monsterData && monsterData.hp > 0) {
        const dist = this.playerPos.distanceTo(new THREE.Vector3(monsterData.x, 0, monsterData.z));
        if (dist <= this.character.equipment.weapon.range + 1.2) {
          this.combatManager.playerAttackMonster(monsterData);
        } else {
          this.targetPos.set(monsterData.x, 0.6, monsterData.z);
          this.isMoving = true;
        }
        return;
      }
    }

    const stationMeshesList = Array.from(this.siteMeshes.values()).map((s) => s.mesh);
    const hits = this.raycaster.intersectObjects([...stationMeshesList, this.scene.children[0]]);

    if (hits.length > 0) {
      const hit = hits[0];
      const siteId = hit.object.userData?.siteId;

      this.targetPos.set(hit.point.x, 0.6, hit.point.z);
      this.isMoving = true;

      if (siteId) {
        this.onSiteClick(siteId);
      }
    }
  }

  moveToSite(siteId) {
    const SCALE = 12.0;
    const site = siteById(siteId);
    if (site) {
      this.targetPos.set(site.x * SCALE, 0.6, site.y * SCALE);
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
    if (this.keys['w'] || this.keys['arrowup']) { kx += 1; kz -= 1; }   // 화면 위쪽 (전방)
    if (this.keys['s'] || this.keys['arrowdown']) { kx -= 1; kz += 1; } // 화면 아래쪽 (후방)
    if (this.keys['a'] || this.keys['arrowleft']) { kx -= 1; kz -= 1; } // 화면 왼쪽
    if (this.keys['d'] || this.keys['arrowright']) { kx += 1; kz += 1; } // 화면 오른쪽

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
        this.walkCycle += 0.2;
        if (this.playerLimbs.leftLeg) this.playerLimbs.leftLeg.rotation.x = Math.sin(this.walkCycle) * 0.45;
        if (this.playerLimbs.rightLeg) this.playerLimbs.rightLeg.rotation.x = -Math.sin(this.walkCycle) * 0.45;
        if (this.playerLimbs.torso) this.playerLimbs.torso.position.y = 0.95 + Math.abs(Math.sin(this.walkCycle)) * 0.06;

        const lookTarget = this.isMoving ? this.targetPos : new THREE.Vector3(this.playerPos.x + kx, 0.6, this.playerPos.z + kz);
        this.playerMesh.lookAt(lookTarget.x, 0.6, lookTarget.z);
      } else {
        if (this.playerLimbs.leftLeg) this.playerLimbs.leftLeg.rotation.x = 0;
        if (this.playerLimbs.rightLeg) this.playerLimbs.rightLeg.rotation.x = 0;
      }
    }

    for (const item of this.animatedObjects) {
      if (item.rotSpeedY) item.obj.rotation.y += item.rotSpeedY;
      if (item.rotSpeedX) item.obj.rotation.x += item.rotSpeedX;
      if (item.pulse) {
        const s = 1.0 + Math.sin(now * 0.003) * 0.06;
        item.obj.scale.set(s, s, s);
      }
    }

    if (this.emergencyStrobe) {
      const angle = (now * 0.004) % (Math.PI * 2);
      this.emergencyStrobe.position.x = Math.cos(angle) * 14;
      this.emergencyStrobe.position.z = Math.sin(angle) * 14;
      this.emergencyStrobe.intensity = 1.5 + Math.sin(now * 0.01) * 0.8;
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
    if (this.bubbleParticles) {
      const bPositions = this.bubbleParticles.geometry.attributes.position.array;
      for (let i = 1; i < bPositions.length; i += 3) {
        bPositions[i] += 0.04;
        if (bPositions[i] > 16) bPositions[i] = 0.5;
      }
      this.bubbleParticles.geometry.attributes.position.needsUpdate = true;
    }

    this.combatManager.updateMonsters(this.playerPos.x, this.playerPos.z, now, delta);
    this.syncMonsters();
    this.updateFloatingTexts(now);

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
