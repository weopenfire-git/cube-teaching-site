// 认证路由：邮箱/手机号/微信 三种登录 + JWT 签发与鉴权中间件（数据全部走 SQLite）
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, TOKEN_TTL, DEV_MODE } = require('./config');
const { db, genId } = require('./db');
const { genCode, sendEmailCode, sendSmsCode, wechatExchangeCode, wechatGetUserInfo } = require('./services');

const router = express.Router();

// ---- 验证码：落库 + 校验 ----
function issueCode(kind, target) {
  const code = genCode();
  const now = Date.now();
  db.prepare(
    'INSERT INTO verification_codes (kind, target, code, expires_at, created_at) VALUES (?,?,?,?,?)'
  ).run(kind, target, code, now + 10 * 60 * 1000, new Date().toISOString());
  return code;
}
function verifyCode(kind, target, code) {
  const row = db.prepare(
    'SELECT * FROM verification_codes WHERE kind=? AND target=? ORDER BY id DESC LIMIT 1'
  ).get(kind, target);
  if (!row) return false;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM verification_codes WHERE id=?').run(row.id);
    return false;
  }
  if (String(row.code) !== String(code)) return false;
  db.prepare('DELETE FROM verification_codes WHERE id=?').run(row.id);
  return true;
}

function makeToken(user) {
  return jwt.sign(
    { uid: user.id, username: user.username, email: user.email, phone: user.phone },
    JWT_SECRET, { expiresIn: TOKEN_TTL }
  );
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, email: u.email, phone: u.phone,
    emailVerified: !!u.email_verified, phoneVerified: !!u.phone_verified,
    avatar: u.avatar || null, createdAt: u.created_at,
  };
}

const authMiddleware = (req, res, next) => {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/);
  if (!m) return res.status(401).json({ error: '未登录' });
  try { req.user = jwt.verify(m[1], JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: '登录已过期，请重新登录' }); }
};

// ============ 注册 ============
router.post('/register', async (req, res) => {
  const { email, phone, password, username } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (!email && !phone) return res.status(400).json({ error: '邮箱或手机号至少填一个' });
  if (email && db.prepare('SELECT 1 FROM users WHERE email=?').get(email))
    return res.status(400).json({ error: '该邮箱已注册' });
  if (phone && db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone))
    return res.status(400).json({ error: '该手机号已注册' });

  const user = {
    id: genId(),
    username: username || (email ? email.split('@')[0] : '用户' + (phone || '').slice(-4)),
    email: email || null, phone: phone || null,
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO users (id, username, email, phone, password_hash, created_at) VALUES (?,?,?,?,?,?)'
  ).run(user.id, user.username, user.email, user.phone, user.password_hash, user.created_at);

  const dev = {};
  if (email) {
    const c = issueCode('email', email);
    const r = await sendEmailCode(email, c);
    if (r.dev) dev.emailCode = c;
    else if (!r.ok) console.error('[注册邮件发送失败]', r.error);
  }
  if (phone) {
    const c = issueCode('phone', phone);
    const r = await sendSmsCode(phone, c);
    if (r.dev) dev.phoneCode = c;
    else if (!r.ok) console.error('[注册短信发送失败]', r.error);
  }

  res.json({ ok: true, user: publicUser(user), dev: DEV_MODE ? dev : undefined });
});

// ============ 登录 ============
router.post('/login', (req, res) => {
  const { email, phone, password, code } = req.body || {};
  let user;

  // 手机号 + 验证码（免密，可自动注册）
  if (phone && code) {
    if (!verifyCode('phone', phone, code)) return res.status(400).json({ error: '验证码错误或已过期' });
    user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
    if (!user) {
      user = {
        id: genId(), username: '用户' + phone.slice(-4), email: null, phone,
        password_hash: '', phone_verified: 1, created_at: new Date().toISOString(),
      };
      db.prepare('INSERT INTO users (id, username, email, phone, password_hash, phone_verified, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(user.id, user.username, user.email, user.phone, user.password_hash, 1, user.created_at);
    } else {
      db.prepare('UPDATE users SET phone_verified=1 WHERE id=?').run(user.id);
    }
  } else {
    user = db.prepare('SELECT * FROM users WHERE email=? OR phone=?').get(email || '', phone || '');
    if (!user || !user.password_hash || !bcrypt.compareSync(password || '', user.password_hash))
      return res.status(401).json({ error: '账号或密码错误' });
  }
  res.json({ ok: true, token: makeToken(user), user: publicUser(user) });
});

// ============ 邮箱验证 ============
router.post('/send-email-code', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: '邮箱必填' });
  const c = issueCode('email', email);
  const r = await sendEmailCode(email, c);
  if (!r.ok && !r.dev) return res.status(502).json({ error: '发送失败：' + (r.error || '未配置邮件服务') });
  res.json({ ok: true, dev: r.dev ? { code: c } : undefined });
});

router.post('/verify-email', (req, res) => {
  const { email, code } = req.body || {};
  if (!verifyCode('email', email, code)) return res.status(400).json({ error: '验证码错误或已过期' });
  const u = db.prepare('SELECT 1 FROM users WHERE email=?').get(email);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  db.prepare('UPDATE users SET email_verified=1 WHERE email=?').run(email);
  res.json({ ok: true });
});

// ============ 手机验证码 ============
router.post('/send-phone-code', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: '手机号必填' });
  const c = issueCode('phone', phone);
  const r = await sendSmsCode(phone, c);
  if (!r.ok && !r.dev) return res.status(502).json({ error: '发送失败：' + (r.error || '未配置短信服务') });
  res.json({ ok: true, dev: r.dev ? { code: c } : undefined });
});

// ============ 微信 ============
router.get('/wechat/authorize-url', (req, res) => {
  const { client_id = '', redirect_uri = '', state = '' } = req.query;
  if (DEV_MODE) {
    res.json({ url: `/api/auth/wechat/mock?client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${encodeURIComponent(state)}` });
  } else {
    const { WECHAT_APPID, WECHAT_REDIRECT } = require('./config');
    const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APPID}` +
      `&redirect_uri=${encodeURIComponent(WECHAT_REDIRECT)}&response_type=code` +
      `&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`;
    res.json({ url });
  }
});

// 开发态模拟扫码登录
router.post('/wechat/mock', (req, res) => {
  const { openid, nickname } = req.body || {};
  const oid = openid || 'mock_openid_' + genId().slice(0, 8);
  let user = db.prepare('SELECT * FROM users WHERE wechat_openid=?').get(oid);
  if (!user) {
    user = {
      id: genId(), username: nickname || '微信用户' + oid.slice(-4),
      email: null, phone: null, password_hash: '', wechat_openid: oid,
      created_at: new Date().toISOString(),
    };
    db.prepare('INSERT INTO users (id, username, email, phone, password_hash, wechat_openid, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(user.id, user.username, user.email, user.phone, user.password_hash, oid, user.created_at);
  }
  res.json({ ok: true, token: makeToken(user), user: publicUser(user) });
});

// 生产回调（DEV_MODE=false 时启用）：用 code 换取 openid，真实落地用户
router.get('/wechat/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('missing code');
  try {
    const token = await wechatExchangeCode(code); // { access_token, openid }
    let info = {};
    try { info = await wechatGetUserInfo(token.access_token, token.openid); } catch { /* 拿不到资料就用 openid 兜底 */ }
    let user = db.prepare('SELECT * FROM users WHERE wechat_openid=?').get(token.openid);
    if (!user) {
      user = {
        id: genId(),
        username: info.nickname || ('微信用户' + token.openid.slice(-4)),
        email: null, phone: null, password_hash: '', wechat_openid: token.openid,
        avatar: info.headimgurl || null,
        created_at: new Date().toISOString(),
      };
      db.prepare('INSERT INTO users (id, username, email, phone, password_hash, wechat_openid, avatar, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(user.id, user.username, user.email, user.phone, user.password_hash, token.openid, user.avatar, user.created_at);
    } else if (info.nickname || info.headimgurl) {
      db.prepare('UPDATE users SET username=COALESCE(NULLIF(?,username),username), avatar=COALESCE(?,avatar) WHERE id=?')
        .run(info.nickname || null, info.headimgurl || null, user.id);
    }
    const t = makeToken(user);
    // state 形如 "client_id|redirect_uri"，回跳时校验 redirect_uri 归属
    let back = null;
    if (state && state.includes('|')) {
      const [cid, uri] = state.split('|');
      const client = db.prepare('SELECT redirect_uri FROM app_clients WHERE client_id=?').get(cid);
      if (client && uri.startsWith(client.redirect_uri)) back = uri;
    }
    if (back) return res.redirect(`${back}${back.includes('?') ? '&' : '?'}token=${t}`);
    res.json({ ok: true, token: t, user: publicUser(user) });
  } catch (e) {
    res.status(500).send('微信登录异常：' + e.message);
  }
});

// ============ 当前用户 ============
router.get('/me', authMiddleware, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.uid);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: publicUser(u) });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
module.exports.publicUser = publicUser;
