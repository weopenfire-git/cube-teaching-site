// 好友系统：关系挂在统一用户库，任何接入站点共享同一套关系（数据全部走 SQLite）
const express = require('express');
const { db, genId } = require('./db');
const { authMiddleware, publicUser } = require('./auth');

const router = express.Router();
router.use(authMiddleware); // 以下全部需要登录

// 发送好友请求（to 可为 id / 用户名 / 邮箱）
router.post('/request', (req, res) => {
  const { to } = req.body || {};
  const target = db.prepare('SELECT * FROM users WHERE id=? OR username=? OR email=?').get(to || '', to || '', to || '');
  if (!target) return res.status(404).json({ error: '找不到该用户' });
  const me = req.user.uid;
  if (target.id === me) return res.status(400).json({ error: '不能添加自己为好友' });
  const existing = db.prepare('SELECT * FROM friendships WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)')
    .get(me, target.id, target.id, me);
  if (existing) return res.status(400).json({ error: '已存在好友关系或待处理请求', status: existing.status });
  db.prepare('INSERT INTO friendships (id, from_id, to_id, status, created_at) VALUES (?,?,?,?,?)')
    .run(genId(), me, target.id, 'pending', new Date().toISOString());
  res.json({ ok: true });
});

// 我收到的待处理请求
router.get('/requests', (req, res) => {
  const all = db.prepare(`
    SELECT f.id AS fid, u.id, u.username, u.email, u.phone, u.email_verified, u.phone_verified, u.avatar, u.created_at
    FROM friendships f JOIN users u ON u.id = f.from_id
    WHERE f.to_id=? AND f.status='pending'`).all(req.user.uid);
  res.json({ requests: all.map(r => ({ id: r.fid, user: publicUser(r) })) });
});

// 我发出的待处理请求
router.get('/pending-out', (req, res) => {
  const all = db.prepare(`
    SELECT f.id AS fid, u.id, u.username, u.email, u.phone, u.email_verified, u.phone_verified, u.avatar, u.created_at
    FROM friendships f JOIN users u ON u.id = f.to_id
    WHERE f.from_id=? AND f.status='pending'`).all(req.user.uid);
  res.json({ requests: all.map(r => ({ id: r.fid, user: publicUser(r) })) });
});

// 接受
router.post('/accept', (req, res) => {
  const { id } = req.body || {};
  const f = db.prepare('SELECT * FROM friendships WHERE id=? AND to_id=?').get(id, req.user.uid);
  if (!f) return res.status(404).json({ error: '请求不存在' });
  db.prepare("UPDATE friendships SET status='accepted' WHERE id=?").run(id);
  res.json({ ok: true });
});

// 拒绝
router.post('/reject', (req, res) => {
  const { id } = req.body || {};
  const r = db.prepare('DELETE FROM friendships WHERE id=? AND to_id=?').run(id, req.user.uid);
  if (r.changes === 0) return res.status(404).json({ error: '请求不存在' });
  res.json({ ok: true });
});

// 好友列表（双向）
router.get('/', (req, res) => {
  const me = req.user.uid;
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.phone, u.email_verified, u.phone_verified, u.avatar, u.created_at
    FROM friendships f JOIN users u ON u.id = (CASE WHEN f.from_id=? THEN f.to_id ELSE f.from_id END)
    WHERE f.status='accepted' AND (f.from_id=? OR f.to_id=?)`).all(me, me, me);
  res.json({ friends: rows.map(publicUser) });
});

// 删除好友
router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM friendships WHERE (from_id=? AND to_id=?) OR (to_id=? AND from_id=?)')
    .run(req.user.uid, req.params.id, req.user.uid, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: '关系不存在' });
  res.json({ ok: true });
});

module.exports = router;
