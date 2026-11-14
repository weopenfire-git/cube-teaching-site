// 外部通道：开发态 mock + 生产态真实发送。验证码本身已落库（见 auth.js），这里只负责「发送」动作。
const crypto = require('crypto');
const {
  DEV_MODE,
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM,
  SMS_PROVIDER,
  SMS_TENCENT_SECRET_ID, SMS_TENCENT_SECRET_KEY, SMS_TENCENT_APP_ID, SMS_TENCENT_SIGN,
  SMS_TENCENT_TEMPLATE_ID, SMS_TENCENT_REGION,
  SMS_TWILIO_SID, SMS_TWILIO_TOKEN, SMS_TWILIO_FROM,
} = require('./config');

function genCode() {
  return String(crypto.randomInt(100000, 999999));
}

const CODE_TTL_MIN = 10; // 验证码有效期（分钟），与 auth.js 的 expires_at 保持一致

// ============ 邮件：SMTP（通用，可接 SendGrid / 腾讯云邮件 / 阿里云 / QQ / 任意 SMTP）============
let _mailer = null;
function getTransporter() {
  if (!_mailer) {
    const nodemailer = require('nodemailer');
    _mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_SECURE) === 'true',
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return _mailer;
}

// 返回 { ok, dev?, error? }
async function sendEmailCode(email, code) {
  if (DEV_MODE) {
    console.log(`\n[DEV 邮件] 收件人=${email}  验证码=${code}  (${CODE_TTL_MIN} 分钟内有效)\n`);
    return { ok: true, dev: true };
  }
  if (!SMTP_HOST || !SMTP_FROM) return { ok: false, error: '邮件服务未配置（SMTP_HOST / SMTP_FROM）' };
  try {
    await getTransporter().sendMail({
      from: SMTP_FROM,
      to: email,
      subject: '【验证码】您的登录验证码',
      text: `您的验证码是 ${code}，${CODE_TTL_MIN} 分钟内有效，请勿泄露给他人。`,
      html: `<div style="font-family:system-ui,sans-serif;padding:16px">`
        + `<p>您的验证码是 <b style="font-size:20px;color:#2563eb">${code}</b></p>`
        + `<p style="color:#666">${CODE_TTL_MIN} 分钟内有效，请勿泄露给他人。如非本人操作请忽略。</p></div>`,
    });
    return { ok: true };
  } catch (e) {
    console.error('[邮件发送失败]', e.message);
    return { ok: false, error: e.message };
  }
}

// ============ 短信：腾讯云 / Twilio 可切换 ============
// 注意：手机号请使用 E.164 格式（如 +8613812345678 / +12025550123）
async function sendSmsCode(phone, code) {
  if (DEV_MODE) {
    console.log(`\n[DEV 短信] 手机号=${phone}  验证码=${code}  (${CODE_TTL_MIN} 分钟内有效)\n`);
    return { ok: true, dev: true };
  }
  if (SMS_PROVIDER === 'tencent') return sendSmsTencent(phone, code);
  if (SMS_PROVIDER === 'twilio') return sendSmsTwilio(phone, code);
  return { ok: false, error: '短信服务未配置（SMS_PROVIDER=tencent|twilio）' };
}

async function sendSmsTencent(phone, code) {
  const missing = ['SMS_TENCENT_SECRET_ID', 'SMS_TENCENT_SECRET_KEY', 'SMS_TENCENT_APP_ID',
    'SMS_TENCENT_SIGN', 'SMS_TENCENT_TEMPLATE_ID'].filter(k => !eval(k));
  if (missing.length) return { ok: false, error: '腾讯云短信未配置：' + missing.join(',') };
  try {
    const tencentcloud = require('tencentcloud-sdk-nodejs-sms');
    const client = new tencentcloud.sms.v20210111.Client({
      credential: { secretId: SMS_TENCENT_SECRET_ID, secretKey: SMS_TENCENT_SECRET_KEY },
      region: SMS_TENCENT_REGION,
      profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } },
    });
    const resp = await client.SendSms({
      PhoneNumberSet: [phone],
      SmsSdkAppId: SMS_TENCENT_APP_ID,
      SignName: SMS_TENCENT_SIGN,
      TemplateId: SMS_TENCENT_TEMPLATE_ID,
      TemplateParamSet: [code, String(CODE_TTL_MIN)],
    });
    const status = resp?.SendStatusSet?.[0];
    if (status && status.Code === 'Ok') return { ok: true };
    return { ok: false, error: status?.Message || '腾讯云短信发送失败' };
  } catch (e) {
    console.error('[腾讯云短信失败]', e.message);
    return { ok: false, error: e.message };
  }
}

async function sendSmsTwilio(phone, code) {
  if (!SMS_TWILIO_SID || !SMS_TWILIO_TOKEN || !SMS_TWILIO_FROM)
    return { ok: false, error: 'Twilio 未配置（SMS_TWILIO_SID / TOKEN / FROM）' };
  try {
    const twilio = require('twilio')(SMS_TWILIO_SID, SMS_TWILIO_TOKEN);
    await twilio.messages.create({
      body: `您的验证码是 ${code}（${CODE_TTL_MIN} 分钟内有效）`,
      from: SMS_TWILIO_FROM,
      to: phone,
    });
    return { ok: true };
  } catch (e) {
    console.error('[Twilio 短信失败]', e.message);
    return { ok: false, error: e.message };
  }
}

// ============ 微信：真实 OAuth2 换取 ============
// 用 code 换取 access_token + openid（微信开放平台网站应用）
async function wechatExchangeCode(code) {
  const { WECHAT_APPID, WECHAT_APPSECRET } = require('./config');
  const r = await fetch(
    `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APPID}` +
    `&secret=${WECHAT_APPSECRET}&code=${code}&grant_type=authorization_code`);
  const j = await r.json();
  if (!j.openid) throw new Error(j.errmsg || '微信授权失败');
  return j; // { access_token, openid, unionid?, ... }
}

// 用 access_token + openid 取用户资料（昵称/头像）
async function wechatGetUserInfo(accessToken, openid) {
  const r = await fetch(`https://api.weixin.qq.com/sns/userinfo?access_token=${accessToken}&openid=${openid}`);
  const j = await r.json();
  if (j.errcode) throw new Error(j.errmsg || '获取微信资料失败');
  return j; // { nickname, headimgurl, ... }
}

module.exports = { genCode, sendEmailCode, sendSmsCode, wechatExchangeCode, wechatGetUserInfo };
