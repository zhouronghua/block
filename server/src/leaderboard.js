"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

// block 小游戏积分榜：按 user_id（微信 openid 或本地 ID）聚合最高分，落盘保存。
const DATA_DIR = process.env.GAME_DATA_DIR || path.resolve(process.cwd(), "build", "game");
const DATA_FILE = path.join(DATA_DIR, "scores.json");
const SCHEMA_VERSION = 1;
const MAX_RUNS = 200;
const WX_APPID = process.env.WX_APPID || "";
const WX_APPSECRET = process.env.WX_APPSECRET || "";

// 控制字符（含 \u0000-\u001f 与 \u007f）
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

let cache = null;
let writeQueue = Promise.resolve();

function isoNow() {
  return new Date().toISOString();
}

function safeInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : fallback;
}

function clampInt(value, min, max, fallback = min) {
  const num = safeInt(value, fallback);
  return Math.min(max, Math.max(min, num));
}

// 去掉控制字符，避免污染 JSON / 前端渲染
function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, " ").trim().slice(0, maxLength);
}

function isValidUserId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(value);
}

function emptyStore() {
  return { schema_version: SCHEMA_VERSION, updated_at: isoNow(), players: {}, runs: [] };
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== "object" || !raw.players || typeof raw.players !== "object") {
    return emptyStore();
  }
  const players = {};
  Object.keys(raw.players).forEach((id) => {
    if (!isValidUserId(id)) return;
    const item = raw.players[id];
    if (!item || typeof item !== "object") return;
    players[id] = {
      nickname: cleanText(item.nickname, 24),
      avatar_url: cleanText(item.avatar_url, 300),
      best_score: clampInt(item.best_score, 0, 9999999),
      best_coins: clampInt(item.best_coins, 0, 99999),
      best_level: clampInt(item.best_level, 0, 99),
      play_count: clampInt(item.play_count, 0, 999999),
      updated_at: typeof item.updated_at === "string" ? item.updated_at : new Date(0).toISOString()
    };
  });
  const runs = Array.isArray(raw.runs)
    ? raw.runs
      .filter((run) => run && typeof run === "object" && isValidUserId(run.user_id))
      .slice(-MAX_RUNS)
      .map((run) => ({
        run_id: cleanText(run.run_id, 40),
        user_id: run.user_id,
        score: clampInt(run.score, 0, 9999999),
        coins: clampInt(run.coins, 0, 99999),
        level_index: clampInt(run.level_index, 0, 99),
        duration_ms: clampInt(run.duration_ms, 0, 86400000),
        created_at: typeof run.created_at === "string" ? run.created_at : new Date(0).toISOString()
      }))
    : [];
  return {
    schema_version: SCHEMA_VERSION,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : isoNow(),
    players,
    runs
  };
}

async function load() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    cache = normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      console.warn(`[${isoNow()}] leaderboard load failed, start empty:`, error.message);
    }
    cache = emptyStore();
  }
  return cache;
}

function persist() {
  const snapshot = cache;
  writeQueue = writeQueue.then(async () => {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmpFile = `${DATA_FILE}.tmp`;
      await fs.writeFile(tmpFile, JSON.stringify(snapshot, null, 2), "utf8");
      await fs.rename(tmpFile, DATA_FILE);
    } catch (error) {
      console.error(`[${isoNow()}] leaderboard persist failed`, error);
    }
  });
  return writeQueue;
}

function publicPlayer(userId, player) {
  return {
    user_id: userId,
    nickname: player.nickname || `玩家${String(userId).slice(-4)}`,
    avatar_url: player.avatar_url || "",
    score: player.best_score,
    best_coins: player.best_coins,
    best_level: player.best_level,
    play_count: player.play_count,
    updated_at: player.updated_at
  };
}

function sortedPlayers(store) {
  return Object.keys(store.players)
    .map((id) => ({ id, player: store.players[id] }))
    .sort((a, b) => {
      if (b.player.best_score !== a.player.best_score) {
        return b.player.best_score - a.player.best_score;
      }
      return a.player.updated_at < b.player.updated_at ? -1 : 1;
    });
}

function rankOf(store, userId) {
  const list = sortedPlayers(store);
  const index = list.findIndex((item) => item.id === userId);
  return index < 0 ? 0 : index + 1;
}

async function submitScore(input) {
  const store = await load();
  const userId = input.user_id;
  if (!isValidUserId(userId)) {
    const err = new Error("invalid user_id");
    err.status = 400;
    throw err;
  }

  const now = isoNow();
  let player = store.players[userId];
  if (!player) {
    player = {
      nickname: "",
      avatar_url: "",
      best_score: 0,
      best_coins: 0,
      best_level: 0,
      play_count: 0,
      updated_at: now
    };
    store.players[userId] = player;
  }

  // 同一 run_id 重复提交（断网补交）视为幂等，不重复计数
  const duplicated = Boolean(input.run_id)
    && store.runs.some((run) => run.run_id && run.run_id === input.run_id);
  if (duplicated) {
    return {
      ok: true,
      duplicated: true,
      rank: rankOf(store, userId),
      total_players: Object.keys(store.players).length,
      player: publicPlayer(userId, player)
    };
  }

  if (input.nickname) player.nickname = cleanText(input.nickname, 24);
  if (input.avatar_url) player.avatar_url = cleanText(input.avatar_url, 300);
  player.play_count += 1;

  const isBest = input.score > player.best_score;
  if (isBest) {
    player.best_score = input.score;
    player.best_coins = Math.max(player.best_coins, input.coins);
    player.best_level = Math.max(player.best_level, input.level_index);
  }
  player.updated_at = now;

  store.runs.push({
    run_id: cleanText(input.run_id, 40),
    user_id: userId,
    score: input.score,
    coins: input.coins,
    level_index: input.level_index,
    duration_ms: input.duration_ms,
    created_at: now
  });
  if (store.runs.length > MAX_RUNS) {
    store.runs = store.runs.slice(-MAX_RUNS);
  }
  store.updated_at = now;

  await persist();

  return {
    ok: true,
    duplicated: false,
    is_best: isBest,
    rank: rankOf(store, userId),
    total_players: Object.keys(store.players).length,
    player: publicPlayer(userId, player)
  };
}

async function getLeaderboard(options = {}) {
  const store = await load();
  const limit = clampInt(options.limit, 1, 50, 10);
  const items = sortedPlayers(store)
    .slice(0, limit)
    .map((entry, index) => Object.assign({ rank: index + 1 }, publicPlayer(entry.id, entry.player)));

  const userId = options.userId;
  const me = userId && store.players[userId]
    ? Object.assign({ rank: rankOf(store, userId) }, publicPlayer(userId, store.players[userId]))
    : null;

  return {
    items,
    me,
    total_players: Object.keys(store.players).length,
    total_runs: store.runs.length,
    updated_at: store.updated_at
  };
}

// 用小程序/小游戏登录 code 换 openid，作为稳定的用户 ID
async function loginWithCode(code) {
  if (!WX_APPID || !WX_APPSECRET || !code) {
    return { user_id: "", source: "unconfigured" };
  }
  const url = "https://api.weixin.qq.com/sns/jscode2session"
    + `?appid=${encodeURIComponent(WX_APPID)}`
    + `&secret=${encodeURIComponent(WX_APPSECRET)}`
    + `&js_code=${encodeURIComponent(code)}`
    + "&grant_type=authorization_code";
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data || !data.openid) {
      console.warn(`[${isoNow()}] jscode2session failed:`, data && data.errmsg ? data.errmsg : "unknown");
      return { user_id: "", source: "wechat-error" };
    }
    return { user_id: `wx_${data.openid}`, source: "wechat", unionid: data.unionid || "" };
  } catch (error) {
    console.error(`[${isoNow()}] jscode2session request failed`, error);
    return { user_id: "", source: "wechat-error" };
  }
}

module.exports = {
  DATA_FILE,
  isValidUserId,
  cleanText,
  submitScore,
  getLeaderboard,
  loginWithCode
};
