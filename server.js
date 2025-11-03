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

// ====== MongoDB ======
const mongoCandidates = [];
if (process.env.MONGO_URI) mongoCandidates.push(process.env.MONGO_URI.trim());
if (process.env.MONGO_URI_SEED) mongoCandidates.push(process.env.MONGO_URI_SEED.trim());

let lastMongoError = null;

mongoose.set('strictQuery', false);

async function connectMongo() {
  for (const uri of mongoCandidates) {
    try {
      console.log(`[Mongo] Trying ${uri.startsWith('mongodb+srv://') ? 'SRV' : 'Seedlist'} …`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 20000,
        maxPoolSize: 10,
        family: 4, // 优先 IPv4，避免某些网络环境解析异常
      });
      console.log('✅ MongoDB connected.');
      lastMongoError = null;
      return;
    } catch (err) {
      const msg = `${err.code || err.name || 'Error'}: ${err.message}`;
      console.error('[Mongo] connect failed:', msg);
      lastMongoError = msg;
    }
  }
  console.error('[Mongo] All candidates failed, will retry in 10s…');
  setTimeout(connectMongo, 10000);
}

mongoose.connection.on('disconnected', () => console.warn('[Mongo] disconnected'));
connectMongo();

// 健康检查
app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    ok: true,
    mongoState: states[mongoose.connection.readyState] || String(mongoose.connection.readyState),
    time: new Date().toISOString(),
    lastError: lastMongoError,
  });
});


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
