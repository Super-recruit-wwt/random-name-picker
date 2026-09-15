/**
 * namelist.js — 名单管理（CSV 存储）
 * 优先级：localStorage（用户改过的） > data/names.csv（默认名单） > 内置兜底
 * CSV 格式：首行为表头 `name`，之后一行一个名字；# 开头的行视为注释跳过。
 * 负责：加载、增删、批量粘贴、导入/导出（同时兼容旧 txt）、抽屉 UI 渲染
 */
const NameList = (() => {
  const KEY = 'picker-names';
  const DEFAULT_URL = 'data/names.csv';

  // file:// 直接打开时 fetch 会失败，用这份兜底
  const FALLBACK = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十'];

  let names = [];

  /** 解析单行 CSV（支持双引号包裹与 "" 转义），返回字段数组 */
  function parseCsvLine(line) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else cur += ch;
    }
    fields.push(cur);
    return fields;
  }

  /**
   * 把文本解析成名字数组。CSV / 纯文本均可：
   * 取每行第一个字段为名字；跳过空行、# 注释行和 `name` 表头行。
   */
  function parse(text) {
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => parseCsvLine(line)[0].trim())
      .filter((name, i) => name && !(i === 0 && name.toLowerCase() === 'name'));
  }

  /** 把名字转义为 CSV 字段（含逗号/引号/换行时加引号） */
  function csvEscape(name) {
    return /[",\n\r]/.test(name) ? '"' + name.replace(/"/g, '""') + '"' : name;
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

  function exportCsv() {
    return 'name\n' + names.map(csvEscape).join('\n') + '\n';
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
    load, add, remove, reset, render, parse, exportCsv,
    get names() { return names; },
    get count() { return names.length; },
  };
})();
