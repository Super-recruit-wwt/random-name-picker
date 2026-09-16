/**
 * share.js — 主持人分享：生成观众链接 + 二维码
 * 链接格式：https://host/?at=<ISO时刻>&seed=<种子>#n=<名单(URI编码,逗号分隔)>
 * 名单放在 URL fragment 里：不发送到服务器，链接自包含，
 * 发出后即使服务器名单变更，该链接的结果也不受影响。
 * 分享状态存 localStorage：关闭页面后可通过「继续开奖」恢复。
 */
const Share = (() => {
  const KEY = 'picker-share'; // localStorage：{ seed, at, names }

  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }

  function set(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  /** 把名单编码进 fragment */
  function encodeNames(names) {
    return names.map(encodeURIComponent).join(',');
  }

  /** 从 fragment 解码名单；没有则返回 null */
  function decodeNames(hash) {
    if (!hash || !hash.startsWith('#n=')) return null;
    try {
      return hash.slice(3).split(',').map(decodeURIComponent).filter(Boolean);
    } catch { return null; }
  }

  /** 构造观众链接 */
  function buildUrl(seed, atDate, names) {
    const base = location.origin + location.pathname;
    return base + '?at=' + encodeURIComponent(atDate.toISOString())
      + '&seed=' + encodeURIComponent(seed)
      + '#n=' + encodeNames(names);
  }

  /** 在容器里渲染二维码（依赖 vendor/qrcode.min.js） */
  function renderQr(container, text) {
    container.innerHTML = '';
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const img = document.createElement('img');
    img.src = qr.createDataURL(6, 8);
    img.alt = '观众链接二维码';
    container.appendChild(img);
  }

  return { get, set, clear, buildUrl, decodeNames, renderQr };
})();
