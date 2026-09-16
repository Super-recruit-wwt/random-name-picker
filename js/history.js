/**
 * history.js — 抽奖历史记录
 * 存储：服务器 data/history.csv（/api/history 读写）与本机 localStorage 双向合并，
 *       本机独有的记录会自动补传到服务器（需口令），不再被服务器覆盖丢失。
 *
 * 记录生命周期：
 *   生成分享链接 → 立即建档 status='pending'（⏳ 待开奖，含预定时刻 at 与名单快照 names）
 *   揭晓（同种子） → 回填 name / drawnAt，status='done'
 *   普通抽取（无种子） → 直接建 status='done' 记录
 *
 * CSV 列：time,name,note,mode,seed,pool,status,at,drawn_at,names
 * （旧 6 列记录读取时自动视为 status='done'；names 以 | 分隔）
 */
const History = (() => {
  const LS_KEY = 'picker-history';
  const TOKEN_KEY = 'picker-history-token';
  const API = new URLSearchParams(location.search).get('api') || (location.origin + '/api/history');

  let records = [];
  let serverOk = false;
  let warned401 = false;

  /** 由 main.js 注入：点击「继续开奖」时回调 */
  let onResume = null;

  /** 由 main.js 注入：任何记录变动后回调（刷新角标/提示条） */
  let onChange = null;

  /* ---------- CSV 解析 / 生成 ---------- */

  function parseCsvLine(line) {
    const fields = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else cur += ch;
    }
    fields.push(cur);
    return fields;
  }

  function parseCsv(text) {
    const out = [];
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
      if (i === 0 && lines[i].startsWith('time,')) continue; // 表头
      const f = parseCsvLine(lines[i]);
      if (f.length < 2) continue;
      out.push({
        id: 'srv' + i + '_' + (f[0] + f[1]).length + f[0].length,
        time: f[0], name: f[1] || '', note: f[2] || '',
        mode: f[3] || '', seed: f[4] || '', pool: Number(f[5]) || 0,
        status: f[6] || 'done',   // 旧格式没有此列 → 已完成
        at: f[7] || '', drawnAt: f[8] || '',
        names: f[9] ? f[9].split('|').filter(Boolean) : null,
      });
    }
    return out;
  }

  function csvEscape(v) {
    v = String(v == null ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function fmtTime(t) {
    if (!t) return '';
    const d = new Date(t);
    return isNaN(d) ? String(t) : d.toLocaleString('zh-CN', { hour12: false });
  }

  function exportCsv() {
    const header = 'time,name,note,mode,seed,pool,status,at,drawn_at,names';
    const lines = records.map(r =>
      [fmtTime(r.time), r.name, r.note, r.mode, r.seed, r.pool,
       r.status || 'done', fmtTime(r.at), fmtTime(r.drawnAt),
       (r.names || []).join('|')].map(csvEscape).join(','));
    return header + '\n' + lines.join('\n') + '\n';
  }

  /* ---------- 存储层 ---------- */

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t || ''); }

  function persistLocal() {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
    if (onChange) { try { onChange(); } catch { /* 忽略回调异常 */ } }
  }

  function warnAuth() {
    if (warned401) return;
    warned401 = true;
    alert('历史同步口令未设置或不正确：记录已保存在本机，但不会写入服务器 CSV。\n可在「设置 → 历史同步口令」中填写。');
  }

  async function apiPost(rec) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-History-Token': token() },
        body: JSON.stringify(rec),
      });
      if (res.status === 401) warnAuth();
    } catch { /* 离线时静默，已有本地副本 */ }
  }

  async function apiPutAll() {
    try {
      const res = await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/csv;charset=utf-8', 'X-History-Token': token() },
        body: exportCsv(),
      });
      if (res.status === 401) warnAuth();
    } catch { /* 离线时静默 */ }
  }

  /** 去重键：有种子的按种子（分享链接唯一），否则按 时间(到分钟)+中奖人 */
  function keyOf(r) {
    if (r.seed) return 'seed:' + r.seed;
    return fmtTime(r.time).slice(0, 16) + '|' + r.name;
  }

  async function load() {
    let local = [];
    try { local = JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { /* 空 */ }

    try {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const serverRecs = parseCsv(await res.text());
      serverOk = true;
      // 合并：本机有而服务器没有的记录（如未设口令时的离线记录）补传上去
      const serverKeys = new Set(serverRecs.map(keyOf));
      const missing = local.filter(r => !serverKeys.has(keyOf(r)));
      if (missing.length) {
        records = [...missing, ...serverRecs];
        persistLocal();
        if (token()) {
          await apiPutAll();
          // 以服务器回读为准，统一格式
          const res2 = await fetch(API, { cache: 'no-store' });
          if (res2.ok) { records = parseCsv(await res2.text()); persistLocal(); }
        } else {
          records = [...missing, ...serverRecs];
        }
      } else {
        records = serverRecs;
        persistLocal();
      }
    } catch {
      serverOk = false;
      records = local;
    }
    return records;
  }

  /* ---------- 记录操作 ---------- */

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** 生成分享链接时建档：待开奖（含名单快照，用于重建链接/继续开奖） */
  function addPending({ note, at, seed, pool, names }) {
    const rec = {
      id: makeId(),
      time: new Date().toISOString(),
      name: '',
      note: note || '',
      mode: 'at',
      seed: seed || '',
      pool: pool || 0,
      status: 'pending',
      at: at || '',
      drawnAt: '',
      names: names || null,
    };
    records.unshift(rec);
    persistLocal();
    if (serverOk) apiPost(rec);
    return rec;
  }

  /** 揭晓时按种子回填待开奖记录；返回是否命中 */
  function completeBySeed(seed, name) {
    const rec = records.find(r => r.seed === seed && r.status === 'pending');
    if (!rec) return false;
    rec.name = name;
    rec.status = 'done';
    rec.drawnAt = new Date().toISOString();
    persistLocal();
    if (serverOk) apiPutAll();
    return true;
  }

  /** 新增一条已完成记录（普通抽取） */
  function add({ name, note, mode, seed, pool }) {
    const rec = {
      id: makeId(),
      time: new Date().toISOString(),
      name,
      note: note || '',
      mode: mode || '',
      seed: seed || '',
      pool: pool || 0,
      status: 'done',
      at: '',
      drawnAt: new Date().toISOString(),
      names: null,
    };
    records.unshift(rec);
    persistLocal();
    if (serverOk) apiPost(rec);
    return rec;
  }

  function updateNote(id, note) {
    const rec = records.find(r => r.id === id);
    if (rec) {
      rec.note = note;
      persistLocal();
      if (serverOk) apiPutAll();
    }
  }

  function remove(id) {
    records = records.filter(r => r.id !== id);
    persistLocal();
    if (serverOk) apiPutAll();
  }

  function clear() {
    records = [];
    persistLocal();
    if (serverOk) apiPutAll();
  }

  function pendingList() {
    return records.filter(r => r.status === 'pending');
  }

  /* ---------- 抽屉 UI ---------- */

  function render() {
    const ul = document.getElementById('history-list');
    const count = document.getElementById('history-count');
    if (!ul || !count) return;
    count.textContent = records.length;
    ul.innerHTML = '';

    for (const r of records) {
      const li = document.createElement('li');
      li.className = 'history-item';

      const head = document.createElement('div');
      head.className = 'history-head';
      const pending = r.status === 'pending';
      head.innerHTML = '<span class="history-name"></span><span class="history-time"></span>';
      const nameSpan = head.querySelector('.history-name');
      nameSpan.textContent = pending ? '⏳ 待开奖' : r.name;
      if (pending) nameSpan.classList.add('pending');
      const timeText = pending && r.at
        ? '预定 ' + fmtTime(r.at) + (r.pool ? ' · ' + r.pool + ' 人池' : '')
        : fmtTime(r.time) + (r.pool ? ' · ' + r.pool + ' 人池' : '');
      head.querySelector('.history-time').textContent = timeText;

      const noteInput = document.createElement('input');
      noteInput.className = 'history-note';
      noteInput.placeholder = '备注：本次抽奖内容…';
      noteInput.value = r.note;
      noteInput.addEventListener('change', () => updateNote(r.id, noteInput.value.trim()));

      const row = document.createElement('div');
      row.className = 'history-row';
      row.appendChild(noteInput);

      // 待开奖条目：复制链接 + 继续开奖
      if (pending) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'history-act';
        copyBtn.textContent = '复制链接';
        copyBtn.addEventListener('click', () => {
          const names = r.names || NameList.names;
          const url = Share.buildUrl(r.seed, new Date(r.at), names);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(
              () => { copyBtn.textContent = '已复制 ✓'; setTimeout(() => { copyBtn.textContent = '复制链接'; }, 1500); },
              () => { copyBtn.textContent = '复制失败'; });
          }
        });
        row.appendChild(copyBtn);

        if (onResume) {
          const resumeBtn = document.createElement('button');
          resumeBtn.className = 'history-act primary';
          resumeBtn.textContent = '继续开奖';
          resumeBtn.addEventListener('click', () => onResume(r));
          row.appendChild(resumeBtn);
        }
      }

      const del = document.createElement('button');
      del.className = 'history-del';
      del.textContent = '✕';
      del.title = '删除此条';
      del.addEventListener('click', () => { remove(r.id); render(); });
      row.appendChild(del);

      li.append(head, row);
      ul.appendChild(li);
    }
  }

  return {
    load, add, addPending, completeBySeed, updateNote, remove, clear,
    render, exportCsv, setToken, token, pendingList,
    set onResume(fn) { onResume = fn; },
    set onChange(fn) { onChange = fn; },
    get records() { return records; },
    get count() { return records.length; },
    get serverOk() { return serverOk; },
  };
})();
