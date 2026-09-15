/**
 * history.js — 抽奖历史记录（localStorage 持久化，仅主持人端产生）
 * 每条记录：{ id, time(ISO), name, note, mode, seed, pool }
 */
const History = (() => {
  const KEY = 'picker-history';

  let records = [];

  function load() {
    try { records = JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { records = []; }
    return records;
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(records));
  }

  /** 新增一条记录，返回该记录 */
  function add({ name, note, mode, seed, pool }) {
    const rec = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      time: new Date().toISOString(),
      name,
      note: note || '',
      mode: mode || '',
      seed: seed || '',
      pool: pool || 0,
    };
    records.unshift(rec); // 最新在前
    save();
    return rec;
  }

  function updateNote(id, note) {
    const rec = records.find(r => r.id === id);
    if (rec) { rec.note = note; save(); }
  }

  function remove(id) {
    records = records.filter(r => r.id !== id);
    save();
  }

  function clear() {
    records = [];
    save();
  }

  function csvEscape(v) {
    v = String(v == null ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function exportCsv() {
    const header = 'time,name,note,mode,seed,pool';
    const lines = records.map(r => {
      const t = new Date(r.time).toLocaleString('zh-CN', { hour12: false });
      return [t, r.name, r.note, r.mode, r.seed, r.pool].map(csvEscape).join(',');
    });
    return header + '\n' + lines.join('\n') + '\n';
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
      const t = new Date(r.time).toLocaleString('zh-CN', { hour12: false });
      head.innerHTML = '<span class="history-name"></span><span class="history-time"></span>';
      head.querySelector('.history-name').textContent = r.name;
      head.querySelector('.history-time').textContent = t + (r.pool ? ' · ' + r.pool + ' 人池' : '');

      const noteInput = document.createElement('input');
      noteInput.className = 'history-note';
      noteInput.placeholder = '备注：本次抽奖内容…';
      noteInput.value = r.note;
      noteInput.addEventListener('change', () => updateNote(r.id, noteInput.value.trim()));

      const del = document.createElement('button');
      del.className = 'history-del';
      del.textContent = '✕';
      del.title = '删除此条';
      del.addEventListener('click', () => { remove(r.id); render(); });

      const row = document.createElement('div');
      row.className = 'history-row';
      row.append(noteInput, del);

      li.append(head, row);
      ul.appendChild(li);
    }
  }

  return {
    load, add, updateNote, remove, clear, render, exportCsv,
    get records() { return records; },
    get count() { return records.length; },
  };
})();
