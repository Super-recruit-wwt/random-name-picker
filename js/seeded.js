/**
 * seeded.js — 种子驱动的确定性抽取
 * 同一个 seed + 同一份名单，任何设备、任何时间算出的获奖者都相同。
 * 用途：主持人分享链接后，观众端与主持人端结果一致。
 */
const Seeded = (() => {
  /** FNV-1a 32bit 哈希：把任意字符串折叠成整数种子 */
  function hashSeed(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** mulberry32 PRNG：同一个整数种子产生同一个伪随机序列 */
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 生成一个随机种子（8 位十六进制），仅在主持人创建链接时调用 */
  function newSeed() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0].toString(16).padStart(8, '0');
  }

  /**
   * 确定性抽取：结果只取决于 seed 和名单内容。
   * seed 混入名单长度与完整名单文本，防止"换名单不换结果"。
   */
  function draw(seed, names) {
    const key = seed + '|' + names.length + '|' + names.join('');
    const rand = mulberry32(hashSeed(key));
    const index = Math.floor(rand() * names.length);
    return { index, name: names[index] };
  }

  return { newSeed, draw, hashSeed };
})();
