'use strict';

const platform = require('./platform.js');
const config = require('./config.js');
const { Input } = require('./input.js');
const { World } = require('./world.js');
const { computeScore } = require('./score.js');
const net = require('./net.js');
const render = require('./render.js');
const screens = require('./screens.js');
const ui = require('./ui.js');

const state = {
  screen: 'boot',
  bootText: '正在初始化…',
  buttons: [],
  user: null,
  world: null,
  cam: { x: 0, y: 0 },
  leaderboard: null,
  rankStatus: { loading: false, error: '' },
  result: null,
  toast: { text: '', until: 0 },
  time: 0,
  input: null
};

let canvas = null;
let ctx = null;
let viewport = null;
let input = null;
let userInfoButton = null;
let lastLevelIndex = -1;
let lastFrameTime = 0;

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

function makeRunId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function toast(text) {
  state.toast = { text: String(text), until: state.time + 2.4 };
}

function buildViewport(canvasRef, info) {
  const cw = canvasRef.width;
  const ch = canvasRef.height;
  const scale = Math.min(cw / config.DESIGN_W, ch / config.DESIGN_H);
  const offsetX = (cw - config.DESIGN_W * scale) / 2;
  const offsetY = (ch - config.DESIGN_H * scale) / 2;
  const ratioX = cw / info.windowWidth;
  const ratioY = ch / info.windowHeight;
  return {
    scale: scale,
    offsetX: offsetX,
    offsetY: offsetY,
    toCanvas: function (x, y) {
      return { x: x * scale + offsetX, y: y * scale + offsetY };
    },
    // 触摸点是逻辑像素，先换算到画布像素，再反算回设计坐标
    toDesign: function (x, y) {
      return { x: (x * ratioX - offsetX) / scale, y: (y * ratioY - offsetY) / scale };
    }
  };
}

function setScreen(name) {
  state.screen = name;
  if (input) input.clear();
  if (name === 'home') state.buttons = screens.homeButtons();
  else if (name === 'result') state.buttons = screens.resultButtons();
  else if (name === 'rank') state.buttons = screens.rankButtons();
  else if (name === 'play') state.buttons = screens.PLAY_TAP_BUTTONS;
  else state.buttons = [];
  updateUserInfoButton();
}

function ensureUserInfoButton() {
  if (userInfoButton || !platform.isWechat()) return;
  const rect = screens.NICKNAME_BUTTON;
  const pos = viewport.toCanvas(rect.x, rect.y);
  userInfoButton = platform.createUserInfoButton({
    type: 'text',
    text: '使用微信昵称',
    withCredentials: false,
    style: {
      left: Math.round(pos.x),
      top: Math.round(pos.y),
      width: Math.round(rect.w * viewport.scale),
      height: Math.round(rect.h * viewport.scale),
      backgroundColor: '#2f3d55ff',
      color: '#e8eef8ff',
      fontSize: 16,
      textAlign: 'center',
      borderRadius: 12
    }
  });
  if (!userInfoButton) return;
  userInfoButton.onTap(function (res) {
    const info = res && res.userInfo;
    if (info && info.nickName) {
      state.user.nickname = info.nickName;
      state.user.avatar_url = info.avatarUrl || '';
      net.saveUser(state.user);
      toast('昵称已更新：' + info.nickName);
    } else {
      toast('未获取到微信昵称');
    }
  });
  updateUserInfoButton();
}

function updateUserInfoButton() {
  if (!userInfoButton) return;
  try {
    if (state.screen === 'home') userInfoButton.show();
    else userInfoButton.hide();
  } catch (error) {
    /* ignore */
  }
}

function startRun() {
  state.world = new World();
  state.result = null;
  lastLevelIndex = state.world.levelIndex;
  snapCamera();
  setScreen('play');
}

function snapCamera() {
  const world = state.world;
  const lv = world.level;
  const p = world.player;
  const maxX = Math.max(0, lv.width - config.DESIGN_W);
  const maxY = Math.max(0, lv.height - config.DESIGN_H);
  state.cam.x = clamp(p.x - config.DESIGN_W / 2, 0, maxX);
  state.cam.y = clamp(p.y - config.DESIGN_H / 2 - 20, 0, maxY);
}

function updateCamera(dt) {
  const world = state.world;
  const lv = world.level;
  const p = world.player;
  const maxX = Math.max(0, lv.width - config.DESIGN_W);
  const maxY = Math.max(0, lv.height - config.DESIGN_H);
  const targetX = clamp(p.x - config.DESIGN_W / 2, 0, maxX);
  const targetY = clamp(p.y - config.DESIGN_H / 2 - 20, 0, maxY);
  if (world.levelIndex !== lastLevelIndex) {
    lastLevelIndex = world.levelIndex;
    state.cam.x = targetX;
    state.cam.y = targetY;
    return;
  }
  const k = 1 - Math.pow(0.002, dt);
  state.cam.x += (targetX - state.cam.x) * k;
  state.cam.y += (targetY - state.cam.y) * k;
  state.cam.x = clamp(state.cam.x, 0, maxX);
  state.cam.y = clamp(state.cam.y, 0, maxY);
}

function buildPayload(result) {
  return {
    user_id: state.user ? state.user.user_id : '',
    nickname: state.user ? state.user.nickname : '',
    avatar_url: state.user ? state.user.avatar_url : '',
    score: result.score,
    coins: result.coins,
    level_index: result.levelsCleared,
    hidden_cleared: !!result.hiddenCleared,
    duration_ms: Math.round(result.seconds * 1000),
    run_id: result.runId
  };
}

async function submitResult() {
  const result = state.result;
  if (!result || result.submitState === 'submitting' || result.submitState === 'ok') return;
  const payload = buildPayload(result);
  if (!platform.isWechat()) {
    result.submitState = 'offline';
    net.enqueuePending(payload);
    return;
  }
  result.submitState = 'submitting';
  try {
    const data = await net.submitScore(payload);
    result.submitState = 'ok';
    result.rank = data.rank || 0;
    result.total_players = data.total_players || 0;
    if (state.user) {
      state.user.best_score = Math.max(state.user.best_score || 0, result.score);
      net.saveUser(state.user);
    }
    refreshLeaderboard();
  } catch (error) {
    result.submitState = 'error';
    result.errorText = '提交失败，成绩已缓存，稍后自动补交';
    net.enqueuePending(payload);
  }
}

function endRun(manual) {
  const world = state.world;
  if (!world) return;
  const run = world.getRun();
  const scored = computeScore(run);
  state.result = {
    runId: makeRunId(),
    score: scored.total,
    parts: scored.parts,
    coins: run.coins,
    levelsCleared: run.levelsCleared,
    hiddenCleared: run.hiddenCleared,
    deaths: run.deaths,
    seconds: run.seconds,
    manual: !!manual,
    message: world.endNote || '',
    submitState: 'idle',
    rank: 0,
    total_players: 0
  };
  setScreen('result');
  submitResult();
}

async function refreshLeaderboard() {
  if (!platform.isWechat() || state.rankStatus.loading) return;
  state.rankStatus.loading = true;
  state.rankStatus.error = '';
  try {
    const data = await net.fetchLeaderboard(state.user ? state.user.user_id : '', 10);
    state.leaderboard = data;
    if (data.me && state.user) {
      state.user.best_score = Math.max(state.user.best_score || 0, data.me.score || 0);
    }
  } catch (error) {
    state.rankStatus.error = '排行榜加载失败，可点刷新重试';
  } finally {
    state.rankStatus.loading = false;
  }
}

function onAction(id) {
  if (id === 'start' || id === 'retry') {
    startRun();
  } else if (id === 'rank') {
    setScreen('rank');
    refreshLeaderboard();
  } else if (id === 'home') {
    setScreen('home');
    refreshLeaderboard();
  } else if (id === 'refresh') {
    refreshLeaderboard();
  } else if (id === 'nickname') {
    toast(userInfoButton ? '请点击「使用微信昵称」按钮授权' : '当前环境不支持微信昵称');
  } else if (id === 'quit') {
    endRun(true);
  } else if (id === 'shape') {
    if (state.world) state.world.cycleShape();
  } else if (id === 'respawn') {
    if (state.world) state.world.respawn();
  }
}

function handleTaps() {
  const taps = input.taps();
  if (!taps.length || !state.buttons.length) return;
  for (const point of taps) {
    const id = ui.hitTestButtons(state.buttons, point);
    if (id) {
      onAction(id);
      break;
    }
  }
}

function update(dt) {
  handleTaps();
  if (state.screen !== 'play') {
    input.layout = [];
    return;
  }
  input.layout = screens.PLAY_BUTTONS;
  const world = state.world;
  const move = (input.isDown('left') ? -1 : 0) + (input.isDown('right') ? 1 : 0);
  world.update(dt, {
    move: move,
    dash: input.isDown('dash'),
    jumpPressed: input.wasPressed('jump')
  });
  updateCamera(dt);
  if (world.finished) endRun(false);
}

function draw() {
  if (!ctx) return;
  render.clearFrame(ctx, canvas);
  render.beginDesign(ctx, viewport);
  if (state.screen === 'boot') screens.drawBoot(ctx, state);
  else if (state.screen === 'play') screens.drawPlay(ctx, state);
  else if (state.screen === 'result') screens.drawResult(ctx, state);
  else if (state.screen === 'rank') screens.drawRank(ctx, state);
  else screens.drawHome(ctx, state);
  screens.drawToast(ctx, state);
}

function frame() {
  const now = Date.now();
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.1) dt = 0.1;
  state.time += dt;
  input.beginFrame();
  update(dt);
  draw();
  input.endFrame();
  platform.nextFrame(frame);
}

async function syncWechatProfile() {
  if (!platform.isWechat() || !state.user) return;
  const info = await platform.getUserInfo();
  if (!info || !info.nickName) return;
  const fallback = net.defaultNickname(state.user.user_id);
  if (!state.user.nickname || state.user.nickname === fallback) {
    state.user.nickname = info.nickName;
    state.user.avatar_url = info.avatarUrl || '';
    net.saveUser(state.user);
  }
}

async function init() {
  state.bootText = '正在获取用户ID…';
  state.user = await net.ensureUser();
  state.leaderboard = net.loadCachedRank();
  setScreen('home');
  ensureUserInfoButton();
  lastFrameTime = Date.now();
  platform.nextFrame(frame);
  syncWechatProfile();
  refreshLeaderboard();
  net.flushPending().then(function (count) {
    if (count > 0) {
      toast('已补交 ' + count + ' 条成绩');
      refreshLeaderboard();
    }
  });
}

function boot() {
  canvas = platform.createCanvas();
  ctx = canvas.getContext('2d');
  const info = platform.getSystemInfo();
  const dpr = clamp(info.pixelRatio || 1, 1, 2);
  canvas.width = Math.round(info.windowWidth * dpr);
  canvas.height = Math.round(info.windowHeight * dpr);
  viewport = buildViewport(canvas, info);
  input = new Input();
  input.setMapper(viewport.toDesign);
  state.input = input;
  init();
}

boot();
