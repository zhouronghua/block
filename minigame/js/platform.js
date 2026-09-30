'use strict';

// 微信小游戏运行环境适配层：所有 wx.* 调用都收敛在这里，
// 非微信环境（例如浏览器/Node 调试）下自动降级为空实现，便于本地排查逻辑。

const wx = (typeof globalThis !== 'undefined' ? globalThis.wx : undefined);

function isWechat() {
  return typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
}

function getSystemInfo() {
  if (isWechat()) {
    let info = null;
    try {
      const fn = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo : wx.getSystemInfoSync;
      info = fn.call(wx) || {};
    } catch (error) {
      info = {};
    }
    return {
      windowWidth: Math.max(1, Number(info.windowWidth) || 960),
      windowHeight: Math.max(1, Number(info.windowHeight) || 540),
      pixelRatio: Math.max(1, Number(info.pixelRatio) || 1)
    };
  }
  if (typeof globalThis !== 'undefined' && globalThis.innerWidth) {
    return {
      windowWidth: Math.max(1, globalThis.innerWidth),
      windowHeight: Math.max(1, globalThis.innerHeight),
      pixelRatio: Math.max(1, globalThis.devicePixelRatio || 1)
    };
  }
  return { windowWidth: 960, windowHeight: 540, pixelRatio: 1 };
}

function createCanvas() {
  if (isWechat()) {
    return wx.createCanvas();
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    const info = getSystemInfo();
    canvas.width = Math.round(info.windowWidth * info.pixelRatio);
    canvas.height = Math.round(info.windowHeight * info.pixelRatio);
    canvas.style.width = info.windowWidth + 'px';
    canvas.style.height = info.windowHeight + 'px';
    canvas.style.display = 'block';
    (document.getElementById('game-root') || document.body).appendChild(canvas);
    return canvas;
  }
  return { width: 960, height: 540, getContext: function () { return null; } };
}

function onTouchStart(cb) {
  if (isWechat() && typeof wx.onTouchStart === 'function') wx.onTouchStart(cb);
  else if (typeof document !== 'undefined') bindDomTouch('start', cb);
}

function onTouchMove(cb) {
  if (isWechat() && typeof wx.onTouchMove === 'function') wx.onTouchMove(cb);
  else if (typeof document !== 'undefined') bindDomTouch('move', cb);
}

function onTouchEnd(cb) {
  if (isWechat() && typeof wx.onTouchEnd === 'function') wx.onTouchEnd(cb);
  else if (typeof document !== 'undefined') bindDomTouch('end', cb);
}

function onTouchCancel(cb) {
  if (isWechat() && typeof wx.onTouchCancel === 'function') wx.onTouchCancel(cb);
  else if (typeof document !== 'undefined') bindDomTouch('end', cb);
}

function bindDomTouch(kind, cb) {
  const name = kind === 'start' ? 'touchstart' : kind === 'move' ? 'touchmove' : 'touchend';
  const handler = function (event) {
    const list = [];
    const source = event.changedTouches && event.changedTouches.length ? event.changedTouches : event.touches || [];
    for (let i = 0; i < source.length; i += 1) {
      const t = source[i];
      list.push({ identifier: t.identifier || 0, clientX: t.clientX, clientY: t.clientY });
    }
    event.preventDefault();
    cb({ touches: list, changedTouches: list });
  };
  window.addEventListener(name, handler, { passive: false });
}

function request(options) {
  return new Promise(function (resolve, reject) {
    if (!isWechat() || typeof wx.request !== 'function') {
      reject(new Error('network-unavailable'));
      return;
    }
    wx.request({
      url: options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: options.header || { 'content-type': 'application/json' },
      timeout: options.timeout || 10000,
      success: function (res) {
        resolve({ statusCode: res.statusCode, data: res.data });
      },
      fail: function (err) {
        reject(err instanceof Error ? err : new Error((err && err.errMsg) || 'request-failed'));
      }
    });
  });
}

function login() {
  return new Promise(function (resolve) {
    if (!isWechat() || typeof wx.login !== 'function') {
      resolve(null);
      return;
    }
    wx.login({
      timeout: 8000,
      success: function (res) { resolve(res && res.code ? res.code : null); },
      fail: function () { resolve(null); }
    });
  });
}

// 微信官方提供的用户信息按钮（用户点击后才会返回昵称头像，符合平台规范）
function createUserInfoButton(options) {
  if (!isWechat() || typeof wx.createUserInfoButton !== 'function') return null;
  try {
    return wx.createUserInfoButton(options);
  } catch (error) {
    return null;
  }
}

// 兜底：部分基础库仍可直接读取到 userInfo（匿名数据则不采用）
function getUserInfo() {
  return new Promise(function (resolve) {
    if (!isWechat() || typeof wx.getUserInfo !== 'function') {
      resolve(null);
      return;
    }
    try {
      wx.getUserInfo({
        lang: 'zh_CN',
        success: function (res) { resolve(res && res.userInfo ? res.userInfo : null); },
        fail: function () { resolve(null); }
      });
    } catch (error) {
      resolve(null);
    }
  });
}

function showToast(text) {
  if (!isWechat() || typeof wx.showToast !== 'function') return;
  try {
    wx.showToast({ title: String(text).slice(0, 24), icon: 'none', duration: 1500 });
  } catch (error) {
    /* ignore */
  }
}

const storage = {
  get: function (key) {
    try {
      if (isWechat()) {
        const value = wx.getStorageSync(key);
        return value === '' || value === undefined || value === null ? null : value;
      }
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
    } catch (error) {
      return null;
    }
    return null;
  },
  set: function (key, value) {
    try {
      if (isWechat()) {
        wx.setStorageSync(key, value);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      /* ignore */
    }
  }
};

function nextFrame(cb) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(cb);
  } else {
    setTimeout(cb, 16);
  }
}

module.exports = {
  isWechat: isWechat,
  getSystemInfo: getSystemInfo,
  createCanvas: createCanvas,
  onTouchStart: onTouchStart,
  onTouchMove: onTouchMove,
  onTouchEnd: onTouchEnd,
  onTouchCancel: onTouchCancel,
  request: request,
  login: login,
  createUserInfoButton: createUserInfoButton,
  getUserInfo: getUserInfo,
  showToast: showToast,
  storage: storage,
  nextFrame: nextFrame
};
