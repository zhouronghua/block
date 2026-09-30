'use strict';

// 设计分辨率：所有界面/按钮坐标都基于这个虚拟坐标系，渲染时整体缩放并居中（letterbox）。
const DESIGN_W = 960;
const DESIGN_H = 540;

const SHAPES = [
  { key: 'square', label: '方形', w: 30, h: 30, color: '#ffcc44' },
  { key: 'circle', label: '圆形', w: 30, h: 30, color: '#5ad5ff' },
  { key: 'line', label: '短线', w: 42, h: 14, color: '#ff8f7a' },
  { key: 'triangle', label: '三角', w: 34, h: 32, color: '#8cff9b' }
];

module.exports = {
  DESIGN_W: DESIGN_W,
  DESIGN_H: DESIGN_H,

  // zrh.asia 后端地址（微信小游戏要求 https，且需在「小游戏后台 - 开发 - 服务器域名」配置 request 合法域名）
  API_BASE: 'https://zrh.asia',
  REQUEST_TIMEOUT: 10000,

  // 物理参数与原 Phaser 版保持一致
  GRAVITY: 1300,
  MOVE_SPEED: 260,
  DASH_SPEED: 390,
  JUMP_VELOCITY: 580,
  DOUBLE_JUMP_VELOCITY: 520,
  MAX_VX: 650,
  MAX_VY: 1400,
  BLUE_WATER: { speed: 0.45, gravity: 0.45 },
  BLACK_WATER: { speed: 1.2, gravity: 1.35 },
  COLLAPSE_DELAY: 0.36,
  COLLAPSE_RECOVER: 2.8,
  PORTAL_COOLDOWN: 0.65,
  PORTAL_EXIT_VELOCITY: -120,
  WINDMILL_HIT_DISTANCE: 20,
  HIDDEN_UNLOCK_RATIO: 0.7,
  FALL_DEATH_MARGIN: 200,
  SHAPES: SHAPES,

  // 积分规则
  SCORE: {
    COIN: 100,
    LEVEL: 500,
    HIDDEN: 1500,
    TIME_BASE: 3000,
    TIME_DECAY: 5,
    DEATH: 30,
    MAX: 9999999
  },

  COLORS: {
    bg: '#111822',
    outside: '#070a10',
    grid: 'rgba(255,255,255,0.04)',
    panel: 'rgba(24,33,48,0.92)',
    panelBorder: '#2f3d55',
    text: '#e8eef8',
    subtext: '#98a8bf',
    accent: '#6cf0b2',
    gold: '#ffbe2e',
    danger: '#ff7b7b',
    platform: '#f29445',
    platformCollapsing: '#8e8e8e',
    spike: '#d65252',
    coin: '#ffbe2e',
    blueWater: 'rgba(87,168,255,0.35)',
    blackWater: 'rgba(69,69,69,0.32)',
    portal: 'rgba(99,255,248,0.26)',
    portalBorder: 'rgba(99,255,248,0.85)',
    exit: 'rgba(108,240,178,0.22)',
    exitBorder: 'rgba(108,240,178,0.9)',
    blade: '#f6f6f6',
    button: 'rgba(255,255,255,0.14)',
    buttonPrimary: 'rgba(108,240,178,0.28)',
    buttonActive: 'rgba(108,240,178,0.55)',
    buttonBorder: 'rgba(255,255,255,0.45)'
  }
};
