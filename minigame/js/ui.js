'use strict';

const config = require('./config.js');

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawText(ctx, text, x, y, options) {
  const opts = options || {};
  ctx.font = opts.font || '20px sans-serif';
  ctx.fillStyle = opts.color || config.COLORS.text;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  if (opts.stroke) {
    ctx.lineWidth = opts.strokeWidth || 4;
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillText(text, x, y);
}

function drawPanel(ctx, x, y, w, h) {
  ctx.fillStyle = config.COLORS.panel;
  roundRectPath(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = config.COLORS.panelBorder;
  ctx.stroke();
}

function drawRectButton(ctx, btn, state) {
  const active = state && state.active;
  ctx.fillStyle = btn.primary
    ? (active ? config.COLORS.buttonActive : config.COLORS.buttonPrimary)
    : (active ? 'rgba(255,255,255,0.32)' : config.COLORS.button);
  roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, btn.r || 12);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = config.COLORS.buttonBorder;
  ctx.stroke();
  drawText(ctx, btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + (btn.fontSize ? btn.fontSize * 0.36 : 8), {
    font: 'bold ' + (btn.fontSize || 22) + 'px sans-serif',
    color: config.COLORS.text,
    align: 'center'
  });
}

function drawCircleButton(ctx, btn, active) {
  ctx.beginPath();
  ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
  ctx.fillStyle = active ? config.COLORS.buttonActive : config.COLORS.button;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = config.COLORS.buttonBorder;
  ctx.stroke();
  drawText(ctx, btn.label, btn.x, btn.y + (btn.fontSize || 26) * 0.36, {
    font: 'bold ' + (btn.fontSize || 26) + 'px sans-serif',
    color: config.COLORS.text,
    align: 'center'
  });
}

function hitRect(btn, point) {
  return point.x >= btn.x && point.x <= btn.x + btn.w && point.y >= btn.y && point.y <= btn.y + btn.h;
}

function hitCircle(btn, point) {
  const dx = point.x - btn.x;
  const dy = point.y - btn.y;
  return dx * dx + dy * dy <= btn.r * btn.r;
}

function hitButton(btn, point) {
  return btn.shape === 'circle' ? hitCircle(btn, point) : hitRect(btn, point);
}

function hitTestButtons(buttons, point) {
  for (let i = 0; i < buttons.length; i += 1) {
    if (hitButton(buttons[i], point)) return buttons[i].id;
  }
  return null;
}

function clipText(text, max) {
  const value = String(text === undefined || text === null ? '' : text);
  if (value.length <= max) return value;
  return value.slice(0, Math.max(1, max - 1)) + '…';
}

module.exports = {
  roundRectPath: roundRectPath,
  drawText: drawText,
  drawPanel: drawPanel,
  drawRectButton: drawRectButton,
  drawCircleButton: drawCircleButton,
  hitRect: hitRect,
  hitCircle: hitCircle,
  hitButton: hitButton,
  hitTestButtons: hitTestButtons,
  clipText: clipText
};
