/**
 * timer.js — 计时模块
 * 双模式：duration（滚动 N 秒）/ at（指定时刻开奖）
 * 启动时对一次表，之后用 performance.now() 单调时钟推算剩余时间，
 * 不受系统时间被修改的影响。
 */
const Timer = (() => {
  const KEY = 'picker-config';

  let mode = 'duration';      // 'duration' | 'at'
  let durationSec = 30;
  let targetDate = null;      // Date，at 模式用

  let startPerf = 0;
  let totalMs = 0;

  /**
   * 解析 at 值，支持：
   *   "10:30"              → 今天 10:30
   *   "2026-09-15 10:30"   → 空格分隔的日期时刻
   *   "2026-09-15T10:30"   → ISO 格式（链接同款）
   */
  function parseAt(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    const hm = v.match(/^(\d{1,2}):(\d{2})$/);
    if (hm) {
      const d = new Date();
      d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
      return d;
    }
    const normalized = v.replace(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2}(?::\d{2})?)$/, '$1T$2');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }

  /** 配置模式；at 模式下 value 为时间字符串，duration 模式下 value 为秒数 */
  function configure(m, value) {
    if (m === 'duration') {
      const sec = Number(value);
      if (!Number.isFinite(sec) || sec < 1) return '时长无效（至少 1 秒）';
      mode = 'duration';
      durationSec = Math.round(sec);
    } else if (m === 'at') {
      const d = parseAt(value);
      if (!d) return '时刻格式无效';
      mode = 'at';
      targetDate = d;
    }
    saveConfig();
    return null;
  }

  /** 开始计时。返回错误字符串或 null。 */
  function start() {
    if (mode === 'at') {
      if (!targetDate) return '请先设置开奖时刻';
      const delta = targetDate.getTime() - Date.now();
      if (delta <= 0) return '目标时刻已过，请重新设置';
      totalMs = delta;
    } else {
      totalMs = durationSec * 1000;
    }
    startPerf = performance.now();
    return null;
  }

  /** 距停止的剩余毫秒数（单调时钟） */
  function remaining() {
    return totalMs - (performance.now() - startPerf);
  }

  /**
   * 观看模式专用：向指定时刻开始计时。
   * 与 start() 不同，时刻已过不报错，返回剩余毫秒（可能为负），由调用方决定补播逻辑。
   */
  function startAt(date) {
    totalMs = date.getTime() - Date.now();
    startPerf = performance.now();
    return totalMs;
  }

  function describe() {
    if (mode === 'at' && targetDate) {
      return '开奖时刻：' + targetDate.toLocaleString('zh-CN', { hour12: false });
    }
    return '模式：滚动 ' + durationSec + ' 秒';
  }

  function saveConfig() {
    localStorage.setItem(KEY, JSON.stringify({
      mode,
      durationSec,
      at: targetDate ? targetDate.toISOString() : null,
    }));
  }

  function loadConfig() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY));
      if (!c) return;
      if (c.mode === 'at' && c.at) {
        const d = new Date(c.at);
        if (!isNaN(d.getTime())) { mode = 'at'; targetDate = d; }
      } else {
        mode = 'duration';
        if (Number.isFinite(c.durationSec)) durationSec = c.durationSec;
      }
    } catch { /* 忽略损坏配置 */ }
  }

  return {
    configure, start, startAt, remaining, describe, loadConfig, parseAt,
    get mode() { return mode; },
    get durationSec() { return durationSec; },
    get targetDate() { return targetDate; },
  };
})();
