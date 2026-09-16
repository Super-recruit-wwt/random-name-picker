/**
 * main.js — 主控状态机：IDLE → ROLLING → REVEAL
 * 快捷键：空格 = 开始；Esc = 重置；F = 全屏
 * 观看模式：URL 带 seed 参数时自动进入，名单取自链接 fragment，结果由种子确定
 * 历史记录：主持人端每次揭晓自动记录（含可选备注），观看模式不产生记录
 */
(() => {
  const stage = document.getElementById('stage');
  const nameDisplay = document.getElementById('name-display');
  const hint = document.getElementById('hint');
  const statusLine = document.getElementById('status-line');
  const countdown = document.getElementById('countdown');
  const noteInput = document.getElementById('note-input');

  let state = 'IDLE'; // IDLE | ROLLING | REVEAL
  let pendingNote = ''; // 本次滚动开始时锁定的备注

  /* ---------- 观看模式 / 种子分享 ---------- */

  const params = new URLSearchParams(location.search);
  const watchSeed = params.get('seed');   // 非空 → 观看模式
  const isWatch = !!watchSeed;
  let watchNames = null;                  // 链接内嵌名单
  let activeSeed = null;                  // 本次开奖使用的种子
  let rollNames = null;                   // 本次滚动使用的名单

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
      unlock() { ensure(); }, // 浏览器自动播放策略：首次用户交互时调用
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
    if (isWatch) {
      if (state === 'ROLLING') hint.textContent = '滚动中…';
      else if (state === 'REVEAL') hint.textContent = '🎉 结果已揭晓';
      return;
    }
    if (state === 'IDLE') hint.textContent = '按 空格 开始';
    else if (state === 'ROLLING') hint.textContent = '滚动中…';
    else hint.textContent = '🎉 恭喜！按 Esc 重置后可再次抽取';
  }

  function refreshStatus() {
    statusLine.textContent = Timer.describe() + '　·　' + NameList.count + ' 人在池';
  }

  /* ---------- 滚动（主持人 / 观看共用） ---------- */

  function runRoller() {
    nameDisplay.classList.remove('reveal');
    setState('ROLLING');
    Roller.run(
      rollNames,
      (display, remaining) => {
        nameDisplay.textContent = display;
        renderCountdown(remaining);
        // 只在减速阶段播放滴答声，快速滚动期太吵
        if (Roller.intervalFor(remaining) > 150) SoundFX.tick();
      },
      onReveal
    );
  }

  /* ---------- 核心流程（主持人） ---------- */

  function startRoll() {
    // 若已生成分享链接且处于指定时刻模式：
    // 用链接里的名单快照与种子开奖，保证主持人结果与观众链接一致
    const shared = Share.get();
    if (shared && Timer.mode === 'at') {
      rollNames = shared.names;
      activeSeed = shared.seed;
    } else {
      rollNames = NameList.names;
      activeSeed = null;
    }
    if (!rollNames || rollNames.length === 0) {
      alert('名单为空，请先点击右上角「名单」添加名字');
      return;
    }
    const err = Timer.start();
    if (err) { alert(err); openSettings(); return; }
    pendingNote = noteInput.value.trim(); // 锁定本次备注
    runRoller();
  }

  /* ---------- 观看模式 ---------- */

  function startWatch() {
    rollNames = watchNames;
    activeSeed = watchSeed;
    const atParam = params.get('at');
    const target = atParam ? new Date(atParam) : null;

    if (target && !isNaN(target.getTime())) {
      const ms = Timer.startAt(target); // 时刻已过返回负值，不报错
      if (ms <= 0) {
        // 迟到观众：补播 3 秒滚动再揭晓
        Timer.configure('duration', 3);
        Timer.start();
      }
    } else {
      Timer.configure('duration', 3);
      Timer.start();
    }
    runRoller();
  }

  /* ---------- 揭晓 ---------- */

  function onReveal() {
    // 有种子 → 确定性抽取（与所有观众一致）；否则停止瞬间 crypto 级随机抽取
    const { name } = activeSeed
      ? Seeded.draw(activeSeed, rollNames)
      : Picker.draw(rollNames || NameList.names);
    nameDisplay.textContent = name;
    nameDisplay.classList.add('reveal');
    clearCountdown();
    setState('REVEAL');
    SoundFX.reveal();

    // 仅主持人端记入历史：有种子的先尝试回填「待开奖」预约记录
    if (!isWatch) {
      const completed = activeSeed ? History.completeBySeed(activeSeed, name) : false;
      if (!completed) {
        History.add({
          name,
          note: pendingNote,
          mode: Timer.mode,
          seed: activeSeed || '',
          pool: rollNames.length,
        });
      }
      pendingNote = '';
      noteInput.value = '';
    }
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
    document.getElementById('history-token').value = History.token();
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
    History.setToken(document.getElementById('history-token').value.trim());
    closeSettings();
  }

  /* ---------- 分享弹窗（主持人） ---------- */

  const shareModal = document.getElementById('share-modal');
  const shareUrlInput = document.getElementById('share-url');
  const shareSeedLabel = document.getElementById('share-seed');

  function openShare() {
    if (Timer.mode !== 'at' || !Timer.targetDate) {
      alert('请先在「设置」里选择「指定时刻」模式并设定开奖时刻，再生成观众链接');
      openSettings();
      return;
    }
    if (Timer.targetDate.getTime() <= Date.now()) {
      alert('开奖时刻已过，请先在「设置」里更新时刻');
      openSettings();
      return;
    }
    if (NameList.count === 0) {
      alert('名单为空，请先添加名字');
      return;
    }
    const shared = {
      seed: Seeded.newSeed(),
      at: Timer.targetDate.toISOString(),
      names: NameList.names.slice(),
    };
    Share.set(shared);
    // 预约式记录：生成链接即建档（待开奖），关页面也不丢
    History.addPending({
      note: noteInput.value.trim(),
      at: shared.at,
      seed: shared.seed,
      pool: shared.names.length,
    });
    const url = Share.buildUrl(shared.seed, Timer.targetDate, shared.names);
    shareUrlInput.value = url;
    shareSeedLabel.textContent = 'seed: ' + shared.seed;
    Share.renderQr(document.getElementById('qr-box'), url);
    shareModal.classList.remove('hidden');
  }

  function closeShare() {
    shareModal.classList.add('hidden');
  }

  function copyShareUrl() {
    shareUrlInput.select();
    const done = ok => {
      const btn = document.getElementById('copy-url');
      btn.textContent = ok ? '已复制 ✓' : '复制失败';
      setTimeout(() => { btn.textContent = '复制链接'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrlInput.value).then(() => done(true), () => done(false));
    } else {
      try { done(document.execCommand('copy')); } catch { done(false); }
    }
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
    downloadCsv('names.csv', NameList.exportCsv());
  }

  /* ---------- 历史记录抽屉 ---------- */

  const historyDrawer = document.getElementById('history-drawer');

  function downloadCsv(filename, csvText) {
    const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportHistory() {
    if (History.count === 0) { alert('暂无历史记录'); return; }
    downloadCsv('history.csv', History.exportCsv());
  }

  /* ---------- 事件绑定 ---------- */

  function bindUI() {
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('close-settings').addEventListener('click', closeSettings);

    document.getElementById('btn-share').addEventListener('click', openShare);
    document.getElementById('copy-url').addEventListener('click', copyShareUrl);
    document.getElementById('close-share').addEventListener('click', closeShare);

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

    document.getElementById('btn-history').addEventListener('click', () => {
      History.render();
      historyDrawer.classList.remove('hidden');
    });
    document.getElementById('close-history').addEventListener('click', () => historyDrawer.classList.add('hidden'));
    document.getElementById('export-history').addEventListener('click', exportHistory);
    document.getElementById('clear-history').addEventListener('click', () => {
      if (History.count === 0) return;
      if (confirm('确定清空全部 ' + History.count + ' 条历史记录？')) {
        History.clear();
        History.render();
      }
    });

    const soundBtn = document.getElementById('btn-sound');
    const syncSoundBtn = () => { soundBtn.textContent = SoundFX.isEnabled() ? '🔊' : '🔇'; };
    soundBtn.addEventListener('click', () => { SoundFX.toggle(); syncSoundBtn(); });
    syncSoundBtn();

    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

    document.addEventListener('keydown', e => {
      // 备注框聚焦时：空格/回车 = 失焦并开始（其他键正常输入）
      if (e.target === noteInput) {
        if (state === 'IDLE' && !isWatch
          && (e.code === 'Space' || e.key === 'Enter')
          && drawer.classList.contains('hidden')
          && settingsModal.classList.contains('hidden')
          && shareModal.classList.contains('hidden')
          && historyDrawer.classList.contains('hidden')) {
          e.preventDefault();
          noteInput.blur();
          startRoll();
        }
        return;
      }
      // 其他输入框聚焦时不响应全局快捷键
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isWatch) return; // 观众无开始权
        if (state === 'IDLE'
          && drawer.classList.contains('hidden')
          && settingsModal.classList.contains('hidden')
          && shareModal.classList.contains('hidden')
          && historyDrawer.classList.contains('hidden')) {
          startRoll();
        }
        // 滚动中 / 揭晓后按空格无效，防误触
      } else if (e.key === 'Escape') {
        if (!shareModal.classList.contains('hidden')) closeShare();
        else if (isWatch) return; // 观众无重置权
        else if (!settingsModal.classList.contains('hidden')) closeSettings();
        else if (!drawer.classList.contains('hidden')) drawer.classList.add('hidden');
        else if (!historyDrawer.classList.contains('hidden')) historyDrawer.classList.add('hidden');
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
    if (isWatch) {
      // 观看模式：名单以链接内嵌为准，忽略本机名单与配置
      watchNames = Share.decodeNames(location.hash);
      if (!watchNames || watchNames.length === 0) {
        await NameList.load(); // 兼容无内嵌名单的旧链接
        watchNames = NameList.names;
      }
      const atParam = params.get('at');
      const atLabel = atParam && !isNaN(new Date(atParam).getTime())
        ? '开奖时刻：' + new Date(atParam).toLocaleString('zh-CN', { hour12: false }) + '　·　'
        : '';
      statusLine.textContent = atLabel + watchNames.length + ' 人在池';

      document.getElementById('watch-badge').classList.remove('hidden');
      for (const id of ['btn-share', 'btn-names', 'btn-settings', 'btn-history']) {
        document.getElementById(id).style.display = 'none';
      }

      bindUI();
      // 浏览器自动播放策略：首次点击页面时解锁音效
      document.addEventListener('pointerdown', () => SoundFX.unlock(), { once: true });
      startWatch(); // 观众打开即自动开始
      return;
    }

    await NameList.load();
    await History.load();
    Timer.loadConfig();

    // URL 参数优先于保存的配置：?duration=30 或 ?at=10:30 / ?at=2026-09-15T10:30
    if (params.has('duration')) Timer.configure('duration', params.get('duration'));
    if (params.has('at')) Timer.configure('at', params.get('at'));

    NameList.render();
    refreshStatus();
    setState('IDLE');
    bindUI();
  }

  boot();
})();
