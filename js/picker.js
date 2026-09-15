/**
 * picker.js — 抽奖核心（方案 B：停止瞬间才抽取）
 * 使用 crypto.getRandomValues（密码学级随机源），拒绝采样保证均匀分布。
 */
const Picker = (() => {
  /**
   * 返回 [0, n) 的均匀随机整数。
   * 拒绝采样：丢弃会导致取模偏差的尾部值。
   */
  function secureIndex(n) {
    if (!Number.isInteger(n) || n <= 0) return -1;
    const UINT32 = 0x100000000; // 2^32
    const limit = Math.floor(UINT32 / n) * n;
    const buf = new Uint32Array(1);
    let x;
    do {
      crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % n;
  }

  /** 从名单中抽取一名，返回 { index, name } */
  function draw(names) {
    const index = secureIndex(names.length);
    return { index, name: names[index] };
  }

  return { secureIndex, draw };
})();
