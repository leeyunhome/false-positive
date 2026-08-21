/* ══════════════════════════════════════════════════════════
   THALASSA-9 RPG: Planescape: Torment 스타일 대화 & 판정 엔진 v2.0
   포트레이트 시스템, d20 주사위 롤 팝업, 심층 철학적 문답
   ══════════════════════════════════════════════════════════ */

export const PORTRAITS = {
  NEREUS: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23041320"/><polygon points="50,15 85,75 15,75" fill="none" stroke="%2335e0e8" stroke-width="4"/><circle cx="50" cy="50" r="18" fill="%2335e0e8" opacity="0.3"/><circle cx="50" cy="50" r="8" fill="%2300ffff"/><path d="M25,85 L75,85" stroke="%2335e0e8" stroke-width="2"/><text x="50" y="93" fill="%2335e0e8" font-size="8" font-family="monospace" text-anchor="middle">AI CORE 4.19</text></svg>',
  VASS: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23091e30"/><circle cx="50" cy="45" r="28" fill="%2314344c" stroke="%236f93a6" stroke-width="3"/><rect x="35" y="38" width="30" height="12" rx="4" fill="%2335e0e8"/><path d="M20,88 Q50,68 80,88" fill="%23071624" stroke="%2335e0e8" stroke-width="2"/><text x="50" y="94" fill="%23cfe6f0" font-size="8" font-family="monospace" text-anchor="middle">OP. VASS</text></svg>',
  TERMINAL: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%2306141a"/><rect x="15" y="15" width="70" height="55" rx="4" fill="%23030910" stroke="%23ffa53a" stroke-width="3"/><line x1="25" y1="30" x2="65" y2="30" stroke="%23ffa53a" stroke-width="2"/><line x1="25" y1="42" x2="75" y2="42" stroke="%23ffa53a" stroke-width="2"/><line x1="25" y1="54" x2="50" y2="54" stroke="%23ffa53a" stroke-width="2"/><text x="50" y="88" fill="%23ffa53a" font-size="8" font-family="monospace" text-anchor="middle">SUB-TELEMETRY</text></svg>',
};

export class DialogueEngine {
  constructor(character, onEvidenceFound, onPolicyHint, onLog) {
    this.character = character;
    this.onEvidenceFound = onEvidenceFound || (() => {});
    this.onPolicyHint = onPolicyHint || (() => {});
    this.onLog = onLog || console.log;
    this.currentDialogue = null;
    this.currentNode = null;
    this.isOpen = false;
  }

  startDialogue(dialogueData, startNodeId = 'START') {
    this.currentDialogue = dialogueData;
    this.currentNode = dialogueData.nodes[startNodeId];
    this.isOpen = true;
    this.renderUI();
  }

  showDiceRollPopup(res, onFinish) {
    const dicePopup = document.getElementById('rpgDicePopup');
    if (!dicePopup) {
      if (onFinish) onFinish();
      return;
    }

    dicePopup.classList.add('active');
    document.getElementById('rpgDiceValue').textContent = res.d20;
    document.getElementById('rpgDiceBonus').textContent = `+${res.mod} (${res.statName})`;
    document.getElementById('rpgDiceTotal').textContent = res.total;
    document.getElementById('rpgDiceTarget').textContent = `DC ${res.dc}`;

    const resBadge = document.getElementById('rpgDiceResultBadge');
    if (res.success) {
      resBadge.textContent = res.crit ? '대성공 (NATURAL 20!)' : '판정 성공 (SUCCESS)';
      resBadge.className = 'dice-result-badge dice-result-badge--pass';
    } else {
      resBadge.textContent = res.fumble ? '대실패 (NATURAL 1)' : '판정 실패 (FAIL)';
      resBadge.className = 'dice-result-badge dice-result-badge--fail';
    }

    setTimeout(() => {
      dicePopup.classList.remove('active');
      if (onFinish) onFinish();
    }, 1100);
  }

  selectOption(optionIndex) {
    if (!this.currentNode || !this.currentNode.options) return;
    const option = this.currentNode.options[optionIndex];
    if (!option) return;

    if (option.check) {
      const { stat, dc, passNode, failNode } = option.check;
      const res = this.character.rollCheck(stat, dc);
      this.onLog(`[능력치 판정] [${stat} DC ${dc}] 주사위: ${res.d20} + 보정(${res.mod}) = ${res.total} ➔ ${res.success ? '성공!' : '실패'}`, '🎲');

      this.showDiceRollPopup(res, () => {
        if (res.success) {
          if (option.onSuccess) option.onSuccess(this);
          this.currentNode = this.currentDialogue.nodes[passNode];
        } else {
          if (option.onFail) option.onFail(this);
          this.currentNode = this.currentDialogue.nodes[failNode];
        }
        this.checkAndRender();
      });
    } else {
      if (option.action) option.action(this);
      if (option.next === 'CLOSE') {
        this.closeDialogue();
        return;
      }
      this.currentNode = this.currentDialogue.nodes[option.next];
      this.checkAndRender();
    }
  }

  checkAndRender() {
    if (!this.currentNode || this.currentNode.close) {
      this.closeDialogue();
    } else {
      this.renderUI();
    }
  }

  closeDialogue() {
    this.isOpen = false;
    const modal = document.getElementById('rpgDialogueModal');
    if (modal) modal.classList.remove('active');
  }

  renderUI() {
    const modal = document.getElementById('rpgDialogueModal');
    if (!modal || !this.currentNode) return;

    modal.classList.add('active');
    const speakerEl = document.getElementById('rpgSpeakerName');
    const roleEl = document.getElementById('rpgSpeakerRole');
    const textEl = document.getElementById('rpgDialogueText');
    const optionsEl = document.getElementById('rpgDialogueOptions');
    const avatarImg = document.getElementById('rpgSpeakerPortrait');

    speakerEl.textContent = this.currentNode.speaker || 'NEREUS';
    roleEl.textContent = this.currentNode.role || 'THALASSA-9 AI SUITE';
    textEl.innerHTML = this.currentNode.text;

    // 포트레이트 세팅
    if (avatarImg) {
      const pKey = this.currentNode.portrait || (this.currentNode.speaker === 'NEREUS' ? 'NEREUS' : 'TERMINAL');
      avatarImg.src = PORTRAITS[pKey] || PORTRAITS.NEREUS;
    }

    optionsEl.innerHTML = '';
    (this.currentNode.options || []).forEach((opt, idx) => {
      let reqBadge = '';
      let isEligible = true;
      if (opt.check) {
        reqBadge = `<span class="stat-badge">[${opt.check.stat} 난이도 ${opt.check.dc}]</span> `;
      } else if (opt.reqStat) {
        const val = this.character.stats[opt.reqStat.name];
        if (val < opt.reqStat.val) {
          isEligible = false;
          reqBadge = `<span class="stat-badge stat-badge--lock">[${opt.reqStat.name} ${opt.reqStat.val} 필요]</span> `;
        } else {
          reqBadge = `<span class="stat-badge stat-badge--pass">[${opt.reqStat.name} ${opt.reqStat.val}+]</span> `;
        }
      }

      const btn = document.createElement('button');
      btn.className = 'dialogue-opt-btn' + (isEligible ? '' : ' dialogue-opt-btn--disabled');
      btn.disabled = !isEligible;
      btn.innerHTML = `<span class="opt-num">${idx + 1}.</span> ${reqBadge}${opt.label}`;
      btn.addEventListener('click', () => this.selectOption(idx));
      optionsEl.appendChild(btn);
    });
  }
}

export function createNereusInterrogation(incident, character, callbacks) {
  return {
    id: 'NEREUS_INCIDENT_INTERROGATE',
    nodes: {
      START: {
        speaker: 'NEREUS',
        role: '온보드 심해 의사결정 인공지능 [버전 4.19b]',
        portrait: 'NEREUS',
        text: `오퍼레이터 바스. 현재 경보 <b>[${incident.id}]</b>에 대한 제 분석은 확고합니다.<br/><br/>
               진단: <span style="color:#35e0e8">"${incident.nereus.diagnosis}"</span><br/>
               권고 조치: <b style="color:#ffa53a">${incident.nereus.recommendation}</b> (신뢰도: ${(incident.nereus.confidence * 100).toFixed(1)}%)<br/><br/>
               수심 3,200m에서의 망설임은 산소와 전력 낭비에 불과합니다. 승인 절차를 밟으시겠습니까?`,
        options: [
          {
            label: `"NEREUS, 네 진단 모델의 논리적 모순을 지적하겠다."`,
            check: {
              stat: 'WIS',
              dc: 13,
              passNode: 'PASS_LOGIC',
              failNode: 'FAIL_LOGIC',
            },
          },
          {
            label: `"원시 도플러 및 원격 계측 텔레메트리 로그를 강제로 열람하겠다."`,
            check: {
              stat: 'INT',
              dc: 14,
              passNode: 'PASS_TELEMETRY',
              failNode: 'FAIL_TELEMETRY',
            },
          },
          {
            label: `"당직 지휘권을 발동한다. 승무원들의 안전을 위해 모든 가설을 재검증하라."`,
            check: {
              stat: 'CHA',
              dc: 12,
              passNode: 'PASS_COMMAND',
              failNode: 'FAIL_COMMAND',
            },
          },
          {
            label: `[단말기 닫기] "직접 해당 구획으로 이동해 눈으로 확인하겠다."`,
            next: 'CLOSE',
          },
        ],
      },

      PASS_LOGIC: {
        speaker: 'NEREUS',
        role: '온보드 심해 의사결정 인공지능 [신경망 동기화 지연]',
        portrait: 'NEREUS',
        text: `...당신의 지적을 파싱 중입니다. <br/><br/>
               <i>"신호의 파형 감쇠 곡선과 선체 장력 데이터의 계단식 변위..."</i><br/><br/>
               인정합니다, 오퍼레이터. 제 신경망이 ${incident.nereus.bias ? '특정 바이어스(' + incident.nereus.bias + ')' : '과도한 확신'}에 가중치를 두었을 가능성이 28.4% 상승했습니다.<br/>
               <b style="color:#4ade9a">숨겨진 계측 단서가 해금되었습니다.</b>`,
        options: [
          {
            label: `"그렇다면 현장에서 증거를 확보하고 기지 콘솔에서 조치를 확정하겠다."`,
            action: () => {
              if (callbacks.onEvidenceDiscovered) callbacks.onEvidenceDiscovered(incident);
            },
            next: 'CLOSE',
          },
        ],
      },

      FAIL_LOGIC: {
        speaker: 'NEREUS',
        role: '온보드 심해 의사결정 인공지능',
        portrait: 'NEREUS',
        text: `오퍼레이터의 추론에는 통계적 오류가 포함되어 있습니다. 심해 정수압 하에서의 생물 음향학적 반사는 일반 대기역학 모델과 다릅니다.<br/>
               신뢰도 지표를 유지합니다. 결정을 서두르십시오.`,
        options: [
          {
            label: `"직접 현장을 조사해 증명해 보이겠다."`,
            next: 'CLOSE',
          },
        ],
      },

      PASS_TELEMETRY: {
        speaker: 'THALASSA-9 원격 계측 코어',
        role: '원시 센서 메모리 버퍼',
        portrait: 'TERMINAL',
        text: `[보안 레벨 인가됨: INT 14+] <br/><br/>
               NEREUS의 필터링을 거치지 않은 원시 음향 및 압력 스펙트로그램이 콘솔에 투사됩니다.<br/>
               <b>실제 진실:</b> ${incident.truth.cause}<br/>
               (실제 위협 여부: <b style="color:${incident.truth.isRealThreat ? '#ff5a4d' : '#4ade9a'}">${incident.truth.isRealThreat ? '치명적 위협 [O]' : '허위 경보/경미 [X]'}</b>)`,
        options: [
          {
            label: `"이 데이터를 바탕으로 최적의 결정을 내리겠다."`,
            action: () => {
              if (callbacks.onEvidenceDiscovered) callbacks.onEvidenceDiscovered(incident);
            },
            next: 'CLOSE',
          },
        ],
      },

      FAIL_TELEMETRY: {
        speaker: 'THALASSA-9 원격 계측 코어',
        role: '접근 거부',
        portrait: 'TERMINAL',
        text: `[암호화 버퍼 해독 실패] 심해 노이즈 필터링 실패로 원시 신호가 손상되었습니다. 추가적인 시간 토큰이나 현장 직접 검측이 필요합니다.`,
        options: [
          {
            label: `"현장 단말로 이동하겠다."`,
            next: 'CLOSE',
          },
        ],
      },

      PASS_COMMAND: {
        speaker: 'NEREUS',
        role: '온보드 심해 의사결정 인공지능 [지휘 우선권 수용]',
        portrait: 'NEREUS',
        text: `오퍼레이터 바스의 지휘권 행사를 확인했습니다. 임시 프로토콜에 따라 해당 구획의 방벽 잠금을 해제하고 보조 조명을 최대로 전환합니다.`,
        options: [
          {
            label: `"기동 개시."`,
            next: 'CLOSE',
          },
        ],
      },

      FAIL_COMMAND: {
        speaker: 'NEREUS',
        role: '온보드 심해 의사결정 인공지능',
        portrait: 'NEREUS',
        text: `지휘 프로토콜 발동에는 명확한 물리적 근거가 필요합니다. 사기를 우선시한 조치는 전체 생명유지 시스템의 전력 고갈을 초래할 수 있습니다.`,
        options: [
          {
            label: `"알겠다. 규정에 따라 조사하겠다."`,
            next: 'CLOSE',
          },
        ],
      },
    },
  };
}
