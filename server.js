// 片段：连接表
const clients = new Map(); // id -> ws

// 片段：注册
if (msg.type === "register") {
  ws.id = msg.id || msg.role || `anon_${Math.random().toString(36).slice(2,8)}`;
  ws.role = msg.role || ws.id;
  clients.set(ws.id, ws);
  console.log(`🟢 Registered ${ws.role}: ${ws.id}`);
  return;
}

// 片段：兼容老格式（没有外层 type:"signal"）
if (msg.offer || msg.answer || msg.candidate) {
  msg = { type: "signal", from: msg.from, to: msg.to, payload: msg };
}

// 片段：转发
if (msg.type === "signal") {
  const to = msg.to;
  const dst = clients.get(to);
  if (dst && dst.readyState === 1) { // OPEN
    dst.send(JSON.stringify(msg));
    console.log(`➡️ Signal relayed from ${msg.from} -> ${to}`);
  } else {
    console.log(`⚠️ No live client for id=${to}`);
  }
  return;
}
