'use strict';

const config = require('./config.js');
const ui = require('./ui.js');

function hexOf(value) {
  if (typeof value === 'string') return value;
  return '#' + Number(value).toString(16).padStart(6, '0');
}

function clearFrame(ctx, canvas) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = config.COLORS.outside;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function beginDesign(ctx, viewport) {
  ctx.setTransform(viewport.scale, 0, 0, viewport.scale, viewport.offsetX, viewport.offsetY);
  ctx.fillStyle = config.COLORS.bg;
  ctx.fillRect(0, 0, config.DESIGN_W, config.DESIGN_H);
}

function drawGrid(ctx, world, cam) {
  const startX = Math.floor(cam.x / 120) * 120;
  const endX = cam.x + config.DESIGN_W;
  ctx.strokeStyle = config.COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = startX; x <= endX; x += 120) {
    ctx.moveTo(x, cam.y);
    ctx.lineTo(x, cam.y + config.DESIGN_H);
  }
  const startY = Math.floor(cam.y / 120) * 120;
  const endY = cam.y + config.DESIGN_H;
  for (let y = startY; y <= endY; y += 120) {
    ctx.moveTo(cam.x, y);
    ctx.lineTo(cam.x + config.DESIGN_W, y);
  }
  ctx.stroke();
}

function drawWaters(ctx, world) {
  for (const water of world.waters) {
    ctx.fillStyle = water.type === 'blue' ? config.COLORS.blueWater : config.COLORS.blackWater;
    ctx.fillRect(water.x, water.y, water.w, water.h);
  }
}

function drawPlatforms(ctx, world) {
  for (const plat of world.platforms) {
    if (!plat.enabled) continue;
    const r = plat.rect;
    ctx.fillStyle = plat.color ? hexOf(plat.color) : config.COLORS.platform;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(r.x, r.y, r.w, 4);
    if (plat.type === 'collapsing') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.setLineDash([]);
    }
  }
}

function drawSpikes(ctx, world) {
  ctx.fillStyle = config.COLORS.spike;
  for (const spike of world.spikes) {
    const r = spike.rect;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x + r.w / 2, r.y);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPortals(ctx, world) {
  for (const portal of world.portals) {
    const r = portal.rect;
    ctx.fillStyle = config.COLORS.portal;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = config.COLORS.portalBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }
}

function drawExit(ctx, world) {
  const exit = world.exit;
  ctx.fillStyle = config.COLORS.exit;
  ctx.fillRect(exit.x, exit.y, exit.w, exit.h);
  ctx.strokeStyle = config.COLORS.exitBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(exit.x + 1, exit.y + 1, exit.w - 2, exit.h - 2);
  ui.drawText(ctx, '终点', exit.x + exit.w / 2, exit.y + 22, {
    font: 'bold 16px sans-serif',
    color: config.COLORS.accent,
    align: 'center'
  });
}

function drawCoins(ctx, world) {
  const bob = Math.sin(world.time * 4) * 3;
  for (const coin of world.coinItems) {
    if (coin.taken) continue;
    ctx.beginPath();
    ctx.arc(coin.x, coin.y + bob, 9, 0, Math.PI * 2);
    ctx.fillStyle = config.COLORS.coin;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#7a4b00';
    ctx.stroke();
  }
}

function drawWindmills(ctx, world) {
  for (const wm of world.windmills) {
    ctx.fillStyle = '#2b2f38';
    ctx.beginPath();
    ctx.arc(wm.x, wm.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = config.COLORS.blade;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const a = wm.angle + i * (Math.PI / 2);
      ctx.moveTo(wm.x, wm.y);
      ctx.lineTo(wm.x + Math.cos(a) * wm.bladeLength, wm.y + Math.sin(a) * wm.bladeLength);
    }
    ctx.stroke();
  }
}

function drawPlayer(ctx, world) {
  const p = world.player;
  const shape = config.SHAPES[world.shapeIndex];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = shape.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  if (shape.key === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (shape.key === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -p.h / 2);
    ctx.lineTo(-p.w / 2, p.h / 2);
    ctx.lineTo(p.w / 2, p.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    const radius = shape.key === 'line' ? 6 : 4;
    ui.roundRectPath(ctx, -p.w / 2, -p.h / 2, p.w, p.h, radius);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorld(ctx, world, cam) {
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  drawGrid(ctx, world, cam);
  drawWaters(ctx, world);
  drawPlatforms(ctx, world);
  drawSpikes(ctx, world);
  drawPortals(ctx, world);
  drawExit(ctx, world);
  drawCoins(ctx, world);
  drawWindmills(ctx, world);
  drawPlayer(ctx, world);
  ctx.restore();
}

module.exports = {
  clearFrame: clearFrame,
  beginDesign: beginDesign,
  drawWorld: drawWorld,
  hexOf: hexOf
};
