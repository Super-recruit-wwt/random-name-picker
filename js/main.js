/**
 * main.js — 主控状态机：IDLE → ROLLING → REVEAL
 * 快捷键：空格 = 开始；Esc = 重置；F = 全屏
 */
(() => {
  const stage = document.getElementById('stage');
  const nameDisplay = document.getElementById('name-display');
  const hint = document.getElementById('hint');
  const statusLine = document.getElementById('status-line');
  const countdown = document.getElementById('countdown');

  let state = 'IDLE'; // IDLE | ROLLING | REVEAL

  /* ---------- 倒计时显示 ---------- */

  // 剩余 ≥ 60s 显示 mm:ss，否则显示秒（一位小数），最后 5 秒变暖色
  function renderCountdown(remainingMs) {
    const sec = remainingMs / 1000;
    if (sec >= 60) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      countdown.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    } else {
      countdown.textContent = Math.max(0, sec).toFixed(1);
    }
    countdown.classList.toggle('urgent', sec <= 5);
  }

  function clearCountdown() {
    countdown.textContent = '';
    countdown.classList.remove('urgent');
  }

  /* ---------- 音效（Web Audio 合成，无外部文件依赖） ---------- */
  const SoundFX = (() => {
    let ctx = null;
    let enabled = localStorage.getItem('picker-sound') !== 'off';

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function blip(freq, dur, type, gainVal) {
      if (!enabled) return;
      const c = ensure();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.value = gainVal || 0.03;
      o.connect(g);
      g.connect(c.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.stop(c.currentTime + dur);
    }

    return {
      tick() { blip(880, 0.05); },
      reveal() {
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => blip(f, 0.3, 'triangle', 0.07), i * 130));
      },
      toggle() {
        enabled = !enabled;
        localStorage.setItem('picker-sound', enabled ? 'on' : 'off');
        return enabled;
      },
      isEnabled() { return enabled; },
    };
  })();

  /* ---------- 状态切换 ---------- */

  function setState(s) {
    state = s;
    stage.dataset.state = s.toLowerCase();
    updateHint();
  }

  function updateHint() {
    if (state === 'IDLE') hint.textContent = '按 空格 开始';
    else if (state === 'ROLLING') hint.textContent = '滚动中…';
    else hint.textContent = '🎉 恭喜！按 Esc 重置后可再次抽取';
  }

  function refreshStatus() {
    statusLine.textContent = Timer.describe() + '　·　' + NameList.count + ' 人在池';
  }

  /* ---------- 核心流程 ---------- */

  function startRoll() {
    if (NameList.count === 0) {
      alert('名单为空，请先点击右上角「名单」添加名字');
      return;
    }
    const err = Timer.start();
    if (err) { alert(err); openSettings(); return; }
    nameDisplay.classList.remove('reveal');
    setState('ROLLING');
    Roller.run(
      NameList.names,
      (display, remaining) => {
        nameDisplay.textContent = display;
        renderCountdown(remaining);
        // 只在减速阶段播放滴答声，快速滚动期太吵
        if (Roller.intervalFor(remaining) > 150) SoundFX.tick();
      },
      onReveal
    );
  }

  function onReveal() {
    // 方案 B：停止这一瞬间才执行真正的抽取
    const { name } = Picker.draw(NameList.names);
    nameDisplay.textContent = name;
    nameDisplay.classList.add('reveal');
    clearCountdown();
    setState('REVEAL');
    SoundFX.reveal();
  }

  function reset() {
    Roller.stop();
    nameDisplay.classList.remove('reveal');
    nameDisplay.textContent = '准备好了吗';
    clearCountdown();
    setState('IDLE');
    refreshStatus();
  }

  /* ---------- 设置弹窗 ---------- */

  const settingsModal = document.getElementById('settings-modal');
  const durationInput = document.getElementById('duration-input');
  const atInput = document.getElementById('at-input');

  function toLocalInputValue(d) {
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function openSettings() {
    const radios = settingsModal.querySelectorAll('input[name="mode"]');
    radios.forEach(r => { r.checked = r.value === Timer.mode; });
    durationInput.value = Timer.durationSec;
    if (Timer.targetDate) atInput.value = toLocalInputValue(Timer.targetDate);
    settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
    refreshStatus();
  }

  function saveSettings() {
    const m = settingsModal.querySelector('input[name="mode"]:checked').value;
    const err = m === 'duration'
      ? Timer.configure('duration', durationInput.value)
      : Timer.configure('at', atInput.value);
    if (err) { alert(err); return; }
    closeSettings();
  }

  /* ---------- 名单抽屉 ---------- */

  const drawer = document.getElementById('names-drawer');
  const newNameInput = document.getElementById('new-name');
  const fileInput = document.getElementById('file-input');

  function addFromInput() {
    if (NameList.add(newNameInput.value) > 0) {
      newNameInput.value = '';
      NameList.render();
      refreshStatus();
    }
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const n = NameList.add(String(reader.result));
      NameList.render();
      refreshStatus();
      alert('成功导入 ' + n + ' 个名字');
    };
    reader.readAsText(file);
  }

  function exportFile() {
    const blob = new Blob([NameList.exportText()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'names.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- 事件绑定 ---------- */

  function bindUI() {
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('close-settings').addEventListener('click', closeSettings);

    document.getElementById('btn-names').addEventListener('click', () => {
      NameList.render();
      drawer.classList.remove('hidden');
    });
    document.getElementById('close-names').addEventListener('click', () => drawer.classList.add('hidden'));
    document.getElementById('add-name').addEventListener('click', addFromInput);
    newNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addFromInput(); });
    document.getElementById('import-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) importFile(fileInput.files[0]); fileInput.value = ''; });
    document.getElementById('export-btn').addEventListener('click', exportFile);
    document.getElementById('reset-names').addEventListener('click', async () => {
      await NameList.reset();
      NameList.render();
      refreshStatus();
    });

    const soundBtn = document.getElementById('btn-sound');
    const syncSoundBtn = () => { soundBtn.textContent = SoundFX.isEnabled() ? '🔊' : '🔇'; };
    soundBtn.addEventListener('click', () => { SoundFX.toggle(); syncSoundBtn(); });
    syncSoundBtn();

    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

    document.addEventListener('keydown', e => {
      // 输入框聚焦时不响应全局快捷键
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (state === 'IDLE' && drawer.classList.contains('hidden') && settingsModal.classList.contains('hidden')) {
          startRoll();
        }
        // 滚动中 / 揭晓后按空格无效，防误触
      } else if (e.key === 'Escape') {
        if (!settingsModal.classList.contains('hidden')) closeSettings();
        else if (!drawer.classList.contains('hidden')) drawer.classList.add('hidden');
        else reset();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  /* ---------- 启动 ---------- */

  async function boot() {
    await NameList.load();
    Timer.loadConfig();

    // URL 参数优先于保存的配置：?duration=30 或 ?at=10:30 / ?at=2026-09-15T10:30
    const params = new URLSearchParams(location.search);
    if (params.has('duration')) Timer.configure('duration', params.get('duration'));
    if (params.has('at')) Timer.configure('at', params.get('at'));

    NameList.render();
    refreshStatus();
    setState('IDLE');
    bindUI();
  }

  boot();
})();
