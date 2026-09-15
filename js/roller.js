/**
 * roller.js — 滚动渲染 + 减速曲线
 * 滚动期间只做视觉噪音（随机显示名单中的名字），不做任何抽取。
 * 刷新间隔随剩余时间变化：
 *   剩余 > 5s    ：60ms（快速滚动）
 *   剩余 5s → 2s ：60ms → 400ms 二次曲线爬升
 *   剩余 < 2s    ：400ms → 900ms 二次曲线，最后几个名字逐个"顿"出来
 *   剩余 ≤ 0     ：触发 onStop，由外部执行真正的抽取
 */
const Roller = (() => {
  let running = false;

  function intervalFor(remainingMs) {
    if (remainingMs > 5000) return 60;
    if (remainingMs > 2000) {
      const t = (5000 - remainingMs) / 3000; // 0 → 1
      return 60 + (400 - 60) * t * t;
    }
    const t = Math.min(1, (2000 - remainingMs) / 2000); // 0 → 1
    return 400 + (900 - 400) * t * t;
  }

  /**
   * @param {string[]} names  名单
   * @param {(display: string, remainingMs: number) => void} onTick  每帧回调
   * @param {() => void} onStop  到达目标时间后的回调（外部在此执行抽取）
   */
  function run(names, onTick, onStop) {
    running = true;
    function tick() {
      if (!running) return;
      const r = Timer.remaining();
      if (r <= 0) {
        running = false;
        onStop();
        return;
      }
      const display = names[Picker.secureIndex(names.length)];
      onTick(display, r);
      setTimeout(tick, intervalFor(r));
    }
    tick();
  }

  function stop() {
    running = false;
  }

  return { run, stop, intervalFor };
})();
