// 配置文件 —— 跨站复用只需改这里或传环境变量
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3001,
  // 生产环境务必用强随机值并通过环境变量注入，否则别人能伪造 token
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me-in-prod',
  TOKEN_TTL: process.env.TOKEN_TTL || '7d',
  // 开发态：短信/邮件验证码直接返回并打印；微信用模拟扫码。生产设为 false 后接入真实服务
  DEV_MODE: process.env.DEV_MODE !== 'false',
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, 'data'),

  // ===== 微信（网站应用，来自微信开放平台 open.weixin.qq.com）=====
  WECHAT_APPID: process.env.WECHAT_APPID || '',
  WECHAT_APPSECRET: process.env.WECHAT_APPSECRET || '',
  // 本服务的微信回调地址，例如 https://auth.your-domain.com/api/auth/wechat/callback
  WECHAT_REDIRECT: process.env.WECHAT_REDIRECT || '',

  // ===== 邮件（SMTP，通用）=====
  // 可接 SendGrid / 腾讯云邮件推送(SES) / 阿里云邮件 / QQ 邮箱 / 任意 SMTP。
  // 腾讯云国际站可用其「邮件推送」服务，或任意 SMTP 中继；下面填对应 host/port/账号。
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'smtp',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT || '465',
  SMTP_SECURE: process.env.SMTP_SECURE || 'true', // 465 用 true，587 用 false
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '', // 发件人，例如 "登录中心 <no-reply@your-domain.com>"

  // ===== 短信（可切换服务商）=====
  // SMS_PROVIDER = 'tencent'（腾讯云短信）| 'twilio' | ''（未配置则生产态报错，开发态走 mock）
  SMS_PROVIDER: process.env.SMS_PROVIDER || '',

  // 腾讯云短信（国际站建议 region: ap-singapore / ap-hongkong）
  SMS_TENCENT_SECRET_ID: process.env.SMS_TENCENT_SECRET_ID || '',
  SMS_TENCENT_SECRET_KEY: process.env.SMS_TENCENT_SECRET_KEY || '',
  SMS_TENCENT_APP_ID: process.env.SMS_TENCENT_APP_ID || '',   // SmsSdkAppId
  SMS_TENCENT_SIGN: process.env.SMS_TENCENT_SIGN || '',        // 短信签名（需审核）
  SMS_TENCENT_TEMPLATE_ID: process.env.SMS_TENCENT_TEMPLATE_ID || '', // 验证码模板 ID
  SMS_TENCENT_REGION: process.env.SMS_TENCENT_REGION || 'ap-singapore',

  // Twilio（国际化首选，覆盖绝大多数国家）
  SMS_TWILIO_SID: process.env.SMS_TWILIO_SID || '',
  SMS_TWILIO_TOKEN: process.env.SMS_TWILIO_TOKEN || '',
  SMS_TWILIO_FROM: process.env.SMS_TWILIO_FROM || '', // 你的 Twilio 号码，例如 +12025550123
};
