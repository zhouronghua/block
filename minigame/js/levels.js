'use strict';

// 关卡数据从 web/play.js 的 buildLevels() 原样移植（坐标、尺寸、机关参数保持一致）。
function buildLevels() {
  return [
    {
      id: 'lv1',
      name: '第一关 试跑',
      width: 2400,
      height: 900,
      hidden: false,
      spawn: [90, 620],
      platforms: [
        { x: 0, y: 700, w: 650, h: 200 },
        { x: 760, y: 640, w: 230, h: 30 },
        { x: 1100, y: 570, w: 240, h: 28 },
        { x: 1480, y: 520, w: 210, h: 28 },
        { x: 1840, y: 460, w: 220, h: 28 },
        { x: 2130, y: 430, w: 200, h: 28 }
      ],
      spikes: [
        { x: 680, y: 685, w: 50, h: 16 },
        { x: 930, y: 685, w: 60, h: 16 },
        { x: 1730, y: 685, w: 110, h: 16 }
      ],
      coins: [
        { id: 'c1', x: 830, y: 610 },
        { id: 'c2', x: 1180, y: 530 },
        { id: 'c3', x: 1900, y: 420 }
      ],
      waters: [
        { x: 1350, y: 700, w: 300, h: 150, type: 'blue' }
      ],
      windmills: [
        { x: 1660, y: 640, bladeLength: 74, speed: 2.8 }
      ],
      portals: [],
      exit: { x: 2320, y: 360, w: 70, h: 120, next: 1 }
    },
    {
      id: 'lv2',
      name: '第二关 机关区',
      width: 2750,
      height: 1000,
      hidden: false,
      spawn: [80, 620],
      platforms: [
        { x: 0, y: 720, w: 760, h: 260 },
        { x: 840, y: 660, w: 150, h: 22, type: 'collapsing' },
        { x: 1060, y: 620, w: 170, h: 22, type: 'collapsing' },
        { x: 1300, y: 575, w: 220, h: 24 },
        { x: 1640, y: 525, w: 220, h: 24 },
        { x: 1920, y: 490, w: 200, h: 24 },
        { x: 2220, y: 450, w: 240, h: 24 }
      ],
      spikes: [
        { x: 770, y: 705, w: 60, h: 15 },
        { x: 1240, y: 705, w: 56, h: 15 },
        { x: 1510, y: 705, w: 56, h: 15 }
      ],
      coins: [
        { id: 'c4', x: 900, y: 620 },
        { id: 'c5', x: 1120, y: 580 },
        { id: 'c6', x: 2040, y: 450 }
      ],
      waters: [
        { x: 940, y: 730, w: 330, h: 220, type: 'black' },
        { x: 1760, y: 730, w: 320, h: 200, type: 'blue' }
      ],
      windmills: [
        { x: 1420, y: 650, bladeLength: 66, speed: 3.5 },
        { x: 1760, y: 620, bladeLength: 72, speed: -2.4 }
      ],
      portals: [
        { x: 2060, y: 418, w: 50, h: 72, target: [2440, 370] }
      ],
      exit: { x: 2610, y: 360, w: 80, h: 120, next: 'hidden' }
    },
    {
      id: 'lv3-hidden',
      name: '隐藏关 冲刺试炼',
      width: 2900,
      height: 980,
      hidden: true,
      spawn: [120, 620],
      platforms: [
        { x: 0, y: 740, w: 620, h: 240 },
        { x: 720, y: 670, w: 210, h: 24, type: 'collapsing' },
        { x: 1020, y: 620, w: 180, h: 24 },
        { x: 1290, y: 580, w: 170, h: 24 },
        { x: 1540, y: 540, w: 170, h: 24, type: 'collapsing' },
        { x: 1800, y: 500, w: 200, h: 24 },
        { x: 2100, y: 460, w: 220, h: 24 },
        { x: 2400, y: 430, w: 200, h: 24 },
        { x: 2670, y: 390, w: 160, h: 24 }
      ],
      spikes: [
        { x: 630, y: 725, w: 80, h: 15 },
        { x: 1200, y: 725, w: 70, h: 15 },
        { x: 1715, y: 725, w: 70, h: 15 },
        { x: 2330, y: 725, w: 70, h: 15 }
      ],
      coins: [
        { id: 'c7', x: 1080, y: 580 },
        { id: 'c8', x: 1860, y: 460 },
        { id: 'c9', x: 2450, y: 390 }
      ],
      waters: [
        { x: 1350, y: 750, w: 300, h: 220, type: 'black' }
      ],
      windmills: [
        { x: 930, y: 690, bladeLength: 62, speed: 3.9 },
        { x: 1600, y: 660, bladeLength: 68, speed: -3.3 },
        { x: 2200, y: 620, bladeLength: 68, speed: 3.2 }
      ],
      portals: [
        { x: 2600, y: 350, w: 50, h: 70, target: [400, 620] }
      ],
      exit: { x: 2820, y: 320, w: 70, h: 120, next: null }
    }
  ];
}

module.exports = {
  buildLevels: buildLevels,
  LEVELS: buildLevels()
};
