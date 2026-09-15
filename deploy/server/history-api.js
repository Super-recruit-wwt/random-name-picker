/**
 * history-api.js — 抽奖历史记录 API（纯 Node，零依赖）
 * 监听 127.0.0.1:3002，由 nginx 反代到 /api/history
 *
 *   GET  /          → 返回 data/history.csv 全文（text/csv，公开读）
 *   POST /          → body 为 JSON 单条记录，追加一行 CSV（需口令）
 *   PUT  /          → body 为完整 CSV 文本，整体重写文件（需口令，用于改备注/删除/清空）
 *
 * 口令：启动时读取 data/.api-token 文件内容；请求头 X-History-Token 需与之匹配。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CSV_FILE = path.join(DATA_DIR, 'history.csv');
const TOKEN_FILE = path.join(DATA_DIR, '.api-token');
const PORT = 3002;
const HEADER = 'time,name,note,mode,seed,pool\n';
const MAX_BODY = 1024 * 1024; // 1MB

let TOKEN = '';
try { TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { /* 无口令文件 */ }

function ensureCsv() {
  if (!fs.existsSync(CSV_FILE)) fs.writeFileSync(CSV_FILE, HEADER, 'utf8');
}

function csvEscape(v) {
  v = String(v == null ? '' : v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function recordToLine(r) {
  const t = new Date(r.time || Date.now()).toLocaleString('zh-CN', { hour12: false });
  return [t, r.name, r.note, r.mode, r.seed, r.pool].map(csvEscape).join(',') + '\n';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-History-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  ensureCsv();

  // 读：公开
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(CSV_FILE).pipe(res);
    return;
  }

  // 写：校验口令
  if (!TOKEN || req.headers['x-history-token'] !== TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  try {
    if (req.method === 'POST') {
      const rec = JSON.parse(await readBody(req));
      if (!rec || typeof rec.name !== 'string' || !rec.name) throw new Error('bad record');
      fs.appendFileSync(CSV_FILE, recordToLine(rec), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else if (req.method === 'PUT') {
      const csv = await readBody(req);
      if (!csv.startsWith('time,')) throw new Error('bad csv');
      fs.writeFileSync(CSV_FILE, csv.endsWith('\n') ? csv : csv + '\n', 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(405); res.end();
    }
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`history-api listening on 127.0.0.1:${PORT}, csv=${CSV_FILE}, token=${TOKEN ? 'set' : 'MISSING (writes will 401)'}`);
});
