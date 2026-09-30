'use strict';

const config = require('./config.js');
const ui = require('./ui.js');
const render = require('./render.js');
const { computeScore } = require('./score.js');

// 触摸屏虚拟按键（设计坐标系 960x540，横屏）
const PLAY_BUTTONS = [
  { id: 'left', shape: 'circle', x: 82, y: 452, r: 54, label: '◀', fontSize: 30 },
  { id: 'right', shape: 'circle', x: 210, y: 452, r: 54, label: '▶', fontSize: 30 },
  { id: 'jump', shape: 'circle', x: 760, y: 430, r: 62, label: '跳', fontSize: 30 },
  { id: 'dash', shape: 'circle', x: 890, y: 356, r: 46, label: '冲', fontSize: 24 },
  { id: 'shape', shape: 'rect', x: 686, y: 14, w: 96, h: 44, label: '造型', fontSize: 18 },
  { id: 'respawn', shape: 'rect', x: 792, y: 14, w: 76, h: 44, label: '重生', fontSize: 18 },
  { id: 'quit', shape: 'rect', x: 14, y: 14, w: 84, h: 44, label: '退出', fontSize: 18 }
];

const PLAY_TAP_BUTTONS = PLAY_BUTTONS.filter(function (btn) { return btn.shape === 'rect'; });

function homeButtons() {
  return [
    { id: 'start', shape: 'rect', x: 60, y: 398, w: 236, h: 78, label: '开始游戏', fontSize: 26, primary: true },
    { id: 'rank', shape: 'rect', x: 316, y: 398, w: 156, h: 78, label: '排行榜', fontSize: 24 },
    { id: 'nickname', shape: 'rect', x: 492, y: 398, w: 208, h: 78, label: '使用微信昵称', fontSize: 22 }
  ];
}

// 微信官方用户信息按钮需要覆盖在这个位置上（真实按钮由 wx.createUserInfoButton 创建）
const NICKNAME_BUTTON = { x: 492, y: 398, w: 208, h: 78 };

function resultButtons() {
  return [
    { id: 'retry', shape: 'rect', x: 230, y: 396, w: 150, h: 64, label: '再来一局', fontSize: 22, primary: true },
    { id: 'rank', shape: 'rect', x: 400, y: 396, w: 130, h: 64, label: '排行榜', fontSize: 22 },
    { id: 'home', shape: 'rect', x: 550, y: 396, w: 130, h: 64, label: '返回首页', fontSize: 22 }
  ];
}

function rankButtons() {
  return [
    { id: 'refresh', shape: 'rect', x: 600, y: 452, w: 130, h: 56, label: '刷新', fontSize: 22 },
    { id: 'home', shape: 'rect', x: 750, y: 452, w: 130, h: 56, label: '返回', fontSize: 22 }
  ];
}

function formatSeconds(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return value.toFixed(1) + ' 秒';
  return Math.floor(value / 60) + ' 分 ' + Math.round(value % 60) + ' 秒';
}

function drawBoot(ctx, state) {
  const text = state.bootText || '正在加载…';
  ui.drawText(ctx, 'block 小游戏', config.DESIGN_W / 2, config.DESIGN_H / 2 - 20, {
    font: 'bold 40px sans-serif', color: config.COLORS.text, align: 'center'
  });
  ui.drawText(ctx, text, config.DESIGN_W / 2, config.DESIGN_H / 2 + 24, {
    font: '18px sans-serif', color: config.COLORS.subtext, align: 'center'
  });
}

function drawHome(ctx, state) {
  ui.drawText(ctx, 'block 小游戏', config.DESIGN_W / 2, 84, {
    font: 'bold 40px sans-serif', color: config.COLORS.text, align: 'center'
  });
  ui.drawText(ctx, '触摸屏版 · 积分排行榜由 zrh.asia 保存', config.DESIGN_W / 2, 116, {
    font: '18px sans-serif', color: config.COLORS.subtext, align: 'center'
  });

  const user = state.user || {};
  ui.drawPanel(ctx, 60, 150, 400, 220);
  ui.drawText(ctx, '我的档案', 84, 186, { font: 'bold 22px sans-serif', color: config.COLORS.accent });
  ui.drawText(ctx, '用户ID：' + ui.clipText(user.user_id || '-', 20), 84, 226, { font: '18px sans-serif', color: config.COLORS.text });
  ui.drawText(ctx, '昵称：' + ui.clipText(user.nickname || '-', 14), 84, 258, { font: '18px sans-serif', color: config.COLORS.text });
  ui.drawText(ctx, '最高分：' + String(user.best_score || 0), 84, 290, { font: '18px sans-serif', color: config.COLORS.gold });
  const me = state.leaderboard && state.leaderboard.me;
  ui.drawText(ctx, '我的排名：' + (me ? '第 ' + me.rank + ' 名 / 共 ' + (state.leaderboard.total_players || 0) + ' 人' : '暂无'), 84, 322, {
    font: '18px sans-serif', color: config.COLORS.subtext
  });
  ui.drawText(ctx, '身份来源：' + (user.source === 'wechat' ? '微信 openid' : '本机ID'), 84, 354, {
    font: '16px sans-serif', color: config.COLORS.subtext
  });

  ui.drawPanel(ctx, 500, 150, 400, 220);
  ui.drawText(ctx, '排行榜 Top 5', 524, 186, { font: 'bold 22px sans-serif', color: config.COLORS.accent });
  const items = (state.leaderboard && state.leaderboard.items) || [];
  if (!items.length) {
    ui.drawText(ctx, state.rankStatus.loading ? '加载中…' : '暂无数据', 524, 230, {
      font: '18px sans-serif', color: config.COLORS.subtext
    });
  } else {
    for (let i = 0; i < Math.min(5, items.length); i += 1) {
      const item = items[i];
      const y = 226 + i * 30;
      const color = item.user_id === (state.user && state.user.user_id) ? config.COLORS.gold : config.COLORS.text;
      ui.drawText(ctx, String(item.rank), 524, y, { font: 'bold 18px sans-serif', color: color });
      ui.drawText(ctx, ui.clipText(item.nickname || '玩家', 12), 566, y, { font: '18px sans-serif', color: color });
      ui.drawText(ctx, String(item.score), 876, y, { font: 'bold 18px sans-serif', color: color, align: 'right' });
    }
  }

  for (const btn of state.buttons) {
    ui.drawRectButton(ctx, btn, { active: false });
  }

  ui.drawText(ctx, '操作：左下 ◀ ▶ 移动，右下「跳」跳跃（空中再点一次二段跳）、「冲」冲刺；右上角可切换造型与重生。',
    config.DESIGN_W / 2, 506, { font: '16px sans-serif', color: config.COLORS.subtext, align: 'center' });
}

function drawPlay(ctx, state) {
  const world = state.world;
  render.drawWorld(ctx, world, state.cam);

  const live = computeScore(world.getRun());
  ui.drawText(ctx, world.level.name + '（' + (world.levelIndex + 1) + '/' + world.levels.length + '）', 112, 42, {
    font: 'bold 20px sans-serif', color: config.COLORS.text
  });
  ui.drawText(ctx, '金币 ' + world.coins + '/' + world.totalCoins
    + ' | 积分 ' + live.total
    + ' | 死亡 ' + world.deaths
    + ' | ' + formatSeconds(world.elapsed), 112, 68, {
    font: '16px sans-serif', color: config.COLORS.gold
  });
  if (world.status) {
    ui.drawText(ctx, world.status, 112, 92, { font: '16px sans-serif', color: config.COLORS.subtext });
  }

  if (world.message && world.time < world.messageUntil) {
    const alpha = Math.max(0, Math.min(1, (world.messageUntil - world.time) / 0.9));
    ctx.save();
    ctx.globalAlpha = alpha;
    ui.drawText(ctx, world.message, config.DESIGN_W / 2, 110, {
      font: 'bold 26px sans-serif', color: config.COLORS.accent, align: 'center', stroke: '#052015', strokeWidth: 5
    });
    ctx.restore();
  }

  for (const btn of PLAY_BUTTONS) {
    if (btn.shape === 'circle') {
      ui.drawCircleButton(ctx, btn, state.input && state.input.isDown(btn.id));
    } else {
      ui.drawRectButton(ctx, btn, { active: state.input && state.input.isDown(btn.id) });
    }
  }
}

function drawResult(ctx, state) {
  const result = state.result || {};
  ui.drawPanel(ctx, 200, 50, 560, 330);
  ui.drawText(ctx, result.manual ? '已退出本局' : '本局结束', config.DESIGN_W / 2, 92, {
    font: 'bold 28px sans-serif', color: config.COLORS.text, align: 'center'
  });
  ui.drawText(ctx, String(result.score || 0), config.DESIGN_W / 2, 152, {
    font: 'bold 52px sans-serif', color: config.COLORS.gold, align: 'center'
  });
  ui.drawText(ctx, '本局积分', config.DESIGN_W / 2, 176, {
    font: '16px sans-serif', color: config.COLORS.subtext, align: 'center'
  });

  const parts = result.parts || {};
  ui.drawText(ctx, '金币 ' + (result.coins || 0) + ' | 通关 ' + (result.levelsCleared || 0)
    + ' | 隐藏关 ' + (result.hiddenCleared ? '已通' : '未通') + ' | 死亡 ' + (result.deaths || 0)
    + ' | 用时 ' + formatSeconds(result.seconds), 232, 210, {
    font: '17px sans-serif', color: config.COLORS.text
  });
  ui.drawText(ctx, '明细：金币 +' + (parts.coinScore || 0) + ' · 通关 +' + (parts.levelScore || 0)
    + ' · 隐藏 +' + (parts.hiddenScore || 0) + ' · 速度 +' + (parts.timeScore || 0)
    + ' · 死亡 -' + (parts.penalty || 0), 232, 240, {
    font: '16px sans-serif', color: config.COLORS.subtext
  });

  let statusText = '';
  let statusColor = config.COLORS.subtext;
  if (result.submitState === 'submitting') {
    statusText = '正在提交积分到 zrh.asia…';
  } else if (result.submitState === 'ok') {
    statusText = '积分已提交' + (result.rank ? '，当前第 ' + result.rank + ' 名 / 共 ' + (result.total_players || 0) + ' 人' : '');
    statusColor = config.COLORS.accent;
  } else if (result.submitState === 'error') {
    statusText = '积分提交失败（已缓存，稍后自动补交）';
    statusColor = config.COLORS.danger;
  } else if (result.submitState === 'offline') {
    statusText = '未连接服务，积分已缓存';
    statusColor = config.COLORS.danger;
  }
  ui.drawText(ctx, statusText, 232, 278, { font: '17px sans-serif', color: statusColor });
  if (result.message) {
    ui.drawText(ctx, result.message, 232, 306, { font: '16px sans-serif', color: config.COLORS.subtext });
  }
  if (result.errorText) {
    ui.drawText(ctx, result.errorText, 232, 334, { font: '16px sans-serif', color: config.COLORS.danger });
  }

  for (const btn of state.buttons) {
    ui.drawRectButton(ctx, btn, { active: false });
  }
}

function drawRank(ctx, state) {
  ui.drawPanel(ctx, 160, 40, 640, 400);
  ui.drawText(ctx, '积分排行榜', config.DESIGN_W / 2, 82, {
    font: 'bold 28px sans-serif', color: config.COLORS.text, align: 'center'
  });

  const items = (state.leaderboard && state.leaderboard.items) || [];
  const myId = state.user ? state.user.user_id : '';
  if (!items.length) {
    ui.drawText(ctx, state.rankStatus.loading ? '加载中…' : '暂无排行榜数据', config.DESIGN_W / 2, 200, {
      font: '20px sans-serif', color: config.COLORS.subtext, align: 'center'
    });
  } else {
    for (let i = 0; i < Math.min(10, items.length); i += 1) {
      const item = items[i];
      const y = 128 + i * 30;
      const mine = item.user_id === myId;
      const color = mine ? config.COLORS.gold : config.COLORS.text;
      if (mine) {
        ctx.fillStyle = 'rgba(255,190,46,0.10)';
        ui.roundRectPath(ctx, 184, y - 20, 592, 26, 6);
        ctx.fill();
      }
      ui.drawText(ctx, String(item.rank), 200, y, { font: 'bold 18px sans-serif', color: color });
      ui.drawText(ctx, ui.clipText(item.nickname || '玩家', 16), 250, y, { font: '18px sans-serif', color: color });
      ui.drawText(ctx, String(item.score), 756, y, { font: 'bold 18px sans-serif', color: color, align: 'right' });
    }
  }

  const me = state.leaderboard && state.leaderboard.me;
  ui.drawText(ctx, me
    ? '我的排名：第 ' + me.rank + ' 名 · 最高分 ' + me.score + ' · 共 ' + (state.leaderboard.total_players || 0) + ' 人'
    : '我的排名：暂无（先玩一局再回来看看）', config.DESIGN_W / 2, 418, {
    font: '18px sans-serif', color: config.COLORS.accent, align: 'center'
  });
  if (state.rankStatus.error) {
    ui.drawText(ctx, state.rankStatus.error, config.DESIGN_W / 2, 440, {
      font: '15px sans-serif', color: config.COLORS.danger, align: 'center'
    });
  }

  for (const btn of state.buttons) {
    ui.drawRectButton(ctx, btn, { active: false });
  }
}

function drawToast(ctx, state) {
  if (!state.toast || !state.toast.text || state.time > state.toast.until) return;
  const width = Math.max(220, state.toast.text.length * 18 + 40);
  const x = (config.DESIGN_W - width) / 2;
  ctx.fillStyle = 'rgba(10,16,24,0.88)';
  ui.roundRectPath(ctx, x, 470, width, 46, 12);
  ctx.fill();
  ui.drawText(ctx, state.toast.text, config.DESIGN_W / 2, 499, {
    font: '18px sans-serif', color: config.COLORS.text, align: 'center'
  });
}

module.exports = {
  PLAY_BUTTONS: PLAY_BUTTONS,
  PLAY_TAP_BUTTONS: PLAY_TAP_BUTTONS,
  NICKNAME_BUTTON: NICKNAME_BUTTON,
  homeButtons: homeButtons,
  resultButtons: resultButtons,
  rankButtons: rankButtons,
  formatSeconds: formatSeconds,
  drawBoot: drawBoot,
  drawHome: drawHome,
  drawPlay: drawPlay,
  drawResult: drawResult,
  drawRank: drawRank,
  drawToast: drawToast
};
