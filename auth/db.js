// 数据库层（SQLite，零外部依赖，文件落盘，可随时换 Postgres）
// 表结构即为本模块的「数据库设计」，生产可等比例迁移到 Supabase/Postgres。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'auth.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  email           TEXT UNIQUE,
  phone           TEXT UNIQUE,
  password_hash   TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  phone_verified  INTEGER NOT NULL DEFAULT 0,
  wechat_openid   TEXT UNIQUE,
  avatar          TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS friendships (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted
  created_at  TEXT NOT NULL,
  UNIQUE(from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_from ON friendships(from_id);
CREATE INDEX IF NOT EXISTS idx_friend_to   ON friendships(to_id);

CREATE TABLE IF NOT EXISTS verification_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,            -- email | phone
  target      TEXT NOT NULL,            -- 邮箱或手机号
  code        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,         -- epoch ms
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vc_target ON verification_codes(target, kind);

CREATE TABLE IF NOT EXISTS app_clients (
  client_id    TEXT PRIMARY KEY,
  name         TEXT,
  redirect_uri TEXT,                    -- 该应用允许回跳的地址（SSO 校验用）
  created_at   TEXT NOT NULL
);
`);

function genId() { return crypto.randomUUID(); }

module.exports = { db, genId };
