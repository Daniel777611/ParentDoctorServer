// server.js —— Express + Mongo + WS + 静态文件（Render 可直接跑）
require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

// 静态资源：把 doctor.html 放到 ./public/doctor.html
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 10000;

/* -------------------- Mongo 连接（SRV 优先，失败回退 seedlist） -------------------- */
const uriCandidates = [
  process.env.MONGO_URI,
  process.env.MONGO_URI_SEED,
].filter(Boolean);

const mongoOpts = {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 30000,
  w: 'majority',
};

let lastErr = null;
async function connectMongo() {
  for (const uri of uriCandidates) {
    try {
      if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
        throw new Error('MONGO_URI 格式不正确');
      }
      console.log(`\n[Mongo] 尝试连接：${uri.startsWith('mongodb+srv://') ? 'SRV' : 'Seedlist'} …`);
      await mongoose.connect(uri, mongoOpts);
      console.log('[Mongo] ✅ 连接成功');
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[Mongo] ❌ 连接失败：${err.message}`);
    }
  }
  console.error('[Mongo] 所有候选连接串均失败，稍后自动重试…');
}
mongoose.connection.on('connected',   () => console.log('[Mongo] connected'));
mongoose.connection.on('disconnected',()=> console.log('[Mongo] disconnected'));
mongoose.connection.on('error',       (e) => console.error('[Mongo] error:', e.message));

connectMongo();
setInterval(() => {
  if (mongoose.connection.readyState !== 1) connectMongo();
}, 20000);

const stateMap = { 0:'disconnected', 1:'connected', 2:'connecting', 3:'disconnecting' };

/* -------------------------- HTTP 路由 -------------------------- */
app.get('/', (_req, res) => {
  res.send('ParentDoctor Server is running.');
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mongoState: stateMap[mongoose.connection.readyState] || 'unknown',
    time: new Date().toISOString(),
    lastError: lastErr ? String(lastErr.message) : null,
  });
});

// 首次写入测试（可用于自动建库/集合）
const TestSchema = new mongoose.Schema({ at: Date }, { collection: 'health_tests' });
const TestModel  = mongoose.model('HealthTest', TestSchema);
app.post('/api/test-write', async (_req, res) => {
  try { const doc = await TestModel.create({ at: new Date() }); res.json({ ok:true, id:doc._id }); }
  catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

/* -------------------------- WebSocket 信令 -------------------------- */
const server = http.createServer(app);
const { WebSocket } = require('ws');
const wss = new WebSocketServer({ server, path: '/ws' });

const peers = new Map(); // id -> ws
wss.on('connection', (ws) => {
  let myId = null;

  ws.on('message', (buf) => {
    try {
      const msg = JSON.parse(buf.toString() || '{}');

      if (msg.type === 'register') {
        myId = String(msg.id || ('anon_' + Date.now()));
        peers.set(myId, ws);
        ws.send(JSON.stringify({ type:'registered', id: myId }));
        return;
      }

      if (msg.type === 'signal' && msg.to) {
        const peer = peers.get(String(msg.to));
        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify(msg));
        }
        return;
      }
    } catch (_) {}
  });

  ws.on('close', () => { if (myId) peers.delete(myId); });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}\n`);
});
