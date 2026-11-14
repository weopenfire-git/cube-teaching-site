// 入口：纯后端 API 服务（无界面），统一暴露认证 + 好友 + 应用客户端 REST API
const express = require('express');
const { PORT, DEV_MODE } = require('./config');
const { db, genId } = require('./db');
const authRoutes = require('./auth');
const friendRoutes = require('./friends');
const { authMiddleware, publicUser } = require('./auth');

const app = express();
app.use(express.json());

// 跨站调用需要 CORS。开发态允许任意来源；生产请改成白名单。
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, dev: DEV_MODE }));

app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);

// 用户搜索（用于加好友）：按用户名/邮箱/手机号模糊匹配，排除自己
app.get('/api/users/search', authMiddleware, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ users: [] });
  const users = db.prepare(
    `SELECT id, username, email, phone, email_verified, phone_verified, avatar, created_at
     FROM users WHERE id<>? AND (username LIKE ? OR email LIKE ? OR phone LIKE ?) LIMIT 20`
  ).all(req.user.uid, `%${q}%`, `%${q}%`, `%${q}%`).map(publicUser);
  res.json({ users });
});

// ===== 应用客户端注册（多应用接入用）=====
// 各网站先来注册一个 client_id + 允许的 redirect_uri，后续 SSO 回跳才会被放行。
app.post('/api/clients', (req, res) => {
  const { client_id, name, redirect_uri } = req.body || {};
  if (!client_id) return res.status(400).json({ error: 'client_id 必填' });
  const exist = db.prepare('SELECT 1 FROM app_clients WHERE client_id=?').get(client_id);
  if (exist) return res.status(409).json({ error: 'client_id 已存在' });
  db.prepare('INSERT INTO app_clients (client_id, name, redirect_uri, created_at) VALUES (?,?,?,?)')
    .run(client_id, name || '', redirect_uri || '', new Date().toISOString());
  res.json({ ok: true, client: { client_id, name: name || '', redirect_uri: redirect_uri || '' } });
});

app.get('/api/clients', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT client_id, name, redirect_uri, created_at FROM app_clients').all();
  res.json({ clients: rows });
});

app.listen(PORT, () => {
  console.log(`\n✅ 登录模块（纯后端）已启动: http://localhost:${PORT}`);
  console.log(`   开发态 DEV_MODE=${DEV_MODE}（短信/邮件验证码直接返回，微信用模拟扫码）`);
  console.log(`   接口前缀: /api/auth/*  /api/friends/*  /api/users/search  /api/clients`);
  console.log(`   数据库: ${require('path').join(require('./config').DATA_DIR, 'auth.db')}\n`);
});
