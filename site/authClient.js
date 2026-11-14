// authClient.js —— 接入「统一登录模块」（独立后端服务，默认 http://localhost:3001）
// 上线时把 AUTH_BASE 改成部署后的地址（见 网站登陆功能/部署说明.md），并确保该域名在登录服务 CORS 白名单内。
// 本文件零额外依赖，直接 <script src> 引入即可；暴露 window.AuthClient = { base, auth, friends, users, store }。
(function () {
  // 开发态（file:// 直开）指向本地后端；部署态走 nginx 同源反代（空串 = 同源相对路径，
  // 页面域名下 /api/* 由 nginx proxy_pass 到登录后端容器，免 CORS、过 CSP）。
  // 若以后前端与登录后端分域名，把 '' 改成后端完整地址并在后端 CORS 白名单里加该域名。
  var AUTH_BASE = location.protocol === 'file:' ? 'http://localhost:3001' : '';

  function req(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
    return fetch(AUTH_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('请求失败 ' + res.status));
        return data;
      });
    });
  }

  var auth = {
    register:        function (p)     { return req('/api/auth/register', { method: 'POST', body: p }); },
    login:           function (p)     { return req('/api/auth/login',    { method: 'POST', body: p }); },
    sendEmailCode:   function (e)     { return req('/api/auth/send-email-code', { method: 'POST', body: { email: e } }); },
    sendPhoneCode:   function (p)     { return req('/api/auth/send-phone-code', { method: 'POST', body: { phone: p } }); },
    verifyEmail:     function (e, c)  { return req('/api/auth/verify-email', { method: 'POST', body: { email: e, code: c } }); },
    wechatAuthorizeUrl: function (client_id, redirect_uri, state) {
      state = state || '';
      return req('/api/auth/wechat/authorize-url?client_id=' + encodeURIComponent(client_id) +
        '&redirect_uri=' + encodeURIComponent(redirect_uri) + '&state=' + encodeURIComponent(state));
    },
    wechatMock:      function (p)     { return req('/api/auth/wechat/mock', { method: 'POST', body: p || {} }); },
    me:              function (token) { return req('/api/auth/me', { token: token }); }
  };

  var friends = {
    request:   function (to, token) { return req('/api/friends/request',  { method: 'POST', body: { to: to }, token: token }); },
    requests:  function (token)     { return req('/api/friends/requests', { token: token }); },
    pendingOut:function (token)     { return req('/api/friends/pending-out', { token: token }); },
    accept:    function (id, token) { return req('/api/friends/accept',  { method: 'POST', body: { id: id }, token: token }); },
    reject:    function (id, token) { return req('/api/friends/reject',  { method: 'POST', body: { id: id }, token: token }); },
    list:      function (token)     { return req('/api/friends/', { token: token }); },
    remove:    function (id, token) { return req('/api/friends/' + id, { method: 'DELETE', token: token }); }
  };

  var users = {
    search: function (q, token) { return req('/api/users/search?q=' + encodeURIComponent(q), { token: token }); }
  };

  // 本地登录态：token + user 存 localStorage（按浏览器，简单够用；跨设备需后端配合）
  var TOKEN_KEY = 'cubeAuthToken', USER_KEY = 'cubeAuthUser';
  var AuthStore = {
    getToken: function () { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
    getUser:  function () { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; } },
    isLoggedIn: function () { return !!this.getToken(); },
    set: function (token, user) {
      try {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user || null));
      } catch (e) {}
    },
    clear: function () {
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
    },
    // 用 token 换最新用户信息；过期则清登录态
    refresh: function () {
      var t = this.getToken(); if (!t) return Promise.resolve(null);
      return auth.me(t).then(function (r) { this.set(t, r.user); return r.user; }.bind(this))
        .catch(function () { this.clear(); return null; }.bind(this));
    }
  };

  window.AuthClient = { base: AUTH_BASE, auth: auth, friends: friends, users: users, store: AuthStore };
})();
