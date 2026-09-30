'use strict';

const platform = require('./platform.js');
const config = require('./config.js');

const USER_KEY = 'block_minigame_user_v1';
const RANK_KEY = 'block_minigame_rank_v1';
const PENDING_KEY = 'block_minigame_pending_v1';

function randomId() {
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultNickname(userId) {
  return '玩家' + String(userId).slice(-4);
}

function loadUser() {
  const user = platform.storage.get(USER_KEY);
  return user && user.user_id ? user : null;
}

function saveUser(user) {
  if (!user) return null;
  platform.storage.set(USER_KEY, user);
  return user;
}

// 用户 ID：优先用微信 code 换取 openid（服务端完成 jscode2session），失败则本地生成稳定 ID。
async function ensureUser() {
  const cached = loadUser();
  if (cached) return cached;

  let data = null;
  const code = await platform.login();
  if (code) {
    try {
      const res = await platform.request({
        url: config.API_BASE + '/api/game/login',
        method: 'POST',
        data: { code: code },
        timeout: config.REQUEST_TIMEOUT
      });
      if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.user_id) {
        data = res.data;
      }
    } catch (error) {
      data = null;
    }
  }

  const userId = (data && data.user_id) || randomId();
  return saveUser({
    user_id: userId,
    nickname: (data && data.nickname) || defaultNickname(userId),
    avatar_url: '',
    source: (data && data.source) || 'local',
    best_score: 0
  });
}

function cacheRank(data) {
  if (data && data.items) platform.storage.set(RANK_KEY, data);
}

function loadCachedRank() {
  const data = platform.storage.get(RANK_KEY);
  return data && data.items ? data : null;
}

async function submitScore(payload) {
  const res = await platform.request({
    url: config.API_BASE + '/api/game/score',
    method: 'POST',
    data: payload,
    timeout: config.REQUEST_TIMEOUT
  });
  if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok !== false) {
    return res.data;
  }
  throw new Error('submit-failed:' + res.statusCode);
}

async function fetchLeaderboard(userId, limit) {
  const url = config.API_BASE + '/api/game/leaderboard?limit=' + (limit || 10)
    + '&user_id=' + encodeURIComponent(userId || '');
  const res = await platform.request({ url: url, method: 'GET', timeout: config.REQUEST_TIMEOUT });
  if (res.statusCode === 200 && res.data && res.data.items) {
    cacheRank(res.data);
    return res.data;
  }
  throw new Error('leaderboard-failed:' + res.statusCode);
}

function enqueuePending(payload) {
  const list = platform.storage.get(PENDING_KEY) || [];
  if (Array.isArray(list) && list.length < 20) {
    list.push(payload);
    platform.storage.set(PENDING_KEY, list);
  }
}

// 断网时先缓存成绩，下次进来补交（同一 run_id 服务端幂等）。
async function flushPending() {
  const list = platform.storage.get(PENDING_KEY);
  if (!Array.isArray(list) || list.length === 0) return 0;
  const remain = [];
  for (const payload of list) {
    try {
      await submitScore(payload);
    } catch (error) {
      remain.push(payload);
    }
  }
  platform.storage.set(PENDING_KEY, remain);
  return list.length - remain.length;
}

module.exports = {
  ensureUser: ensureUser,
  loadUser: loadUser,
  saveUser: saveUser,
  defaultNickname: defaultNickname,
  submitScore: submitScore,
  fetchLeaderboard: fetchLeaderboard,
  cacheRank: cacheRank,
  loadCachedRank: loadCachedRank,
  enqueuePending: enqueuePending,
  flushPending: flushPending
};
