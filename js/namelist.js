/**
 * namelist.js — 名单管理
 * 优先级：localStorage（用户改过的） > data/names.txt（默认名单） > 内置兜底
 * 负责：加载、增删、批量粘贴、导入/导出、抽屉 UI 渲染
 */
const NameList = (() => {
  const KEY = 'picker-names';
  const DEFAULT_URL = 'data/names.txt';

  // file:// 直接打开时 fetch 会失败，用这份兜底
  const FALLBACK = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十'];

  let names = [];

  function parse(text) {
    return text
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
  }

  function dedupe(list) {
    return [...new Set(list)];
  }

  async function load() {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      try { names = JSON.parse(saved); return names; } catch { /* 继续往下走 */ }
    }
    try {
      const res = await fetch(DEFAULT_URL);
      if (!res.ok) throw new Error(res.status);
      names = parse(await res.text());
    } catch {
      names = FALLBACK.slice();
    }
    return names;
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(names));
  }

  function add(input) {
    const items = parse(input);
    if (items.length === 0) return 0;
    names = dedupe(names.concat(items));
    save();
    return items.length;
  }

  function remove(name) {
    names = names.filter(n => n !== name);
    save();
  }

  async function reset() {
    localStorage.removeItem(KEY);
    names = [];
    await load();
  }

  function exportText() {
    return names.join('\n') + '\n';
  }

  /* ---------- 抽屉 UI ---------- */

  function render() {
    const ul = document.getElementById('name-list');
    const count = document.getElementById('name-count');
    if (!ul || !count) return;
    count.textContent = names.length;
    ul.innerHTML = '';
    for (const n of names) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = n;
      const btn = document.createElement('button');
      btn.textContent = '✕';
      btn.title = '删除';
      btn.addEventListener('click', () => { remove(n); render(); });
      li.append(span, btn);
      ul.appendChild(li);
    }
  }

  return {
    load, add, remove, reset, render, parse, exportText,
    get names() { return names; },
    get count() { return names.length; },
  };
})();
