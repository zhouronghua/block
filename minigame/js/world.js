'use strict';

const config = require('./config.js');
const levels = require('./levels.js');

function contains(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.0001) {
    return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

// 纯逻辑世界：不依赖任何微信/浏览器 API，可在 Node 中直接跑（便于回归测试）。
class World {
  constructor() {
    this.levels = levels.LEVELS;
    this.totalCoins = this.levels
      .filter(function (lv) { return !lv.hidden; })
      .reduce(function (sum, lv) { return sum + lv.coins.length; }, 0);
    this.hiddenUnlockNeed = Math.ceil(this.totalCoins * config.HIDDEN_UNLOCK_RATIO);
    this.reset();
  }

  reset() {
    this.time = 0;
    this.elapsed = 0;
    this.coins = 0;
    this.deaths = 0;
    this.levelsCleared = 0;
    this.hiddenUnlocked = false;
    this.hiddenCleared = false;
    this.finished = false;
    this.finishReason = '';
    this.endNote = '';
    this.status = '';
    this.message = '';
    this.messageUntil = 0;
    this.collected = Object.create(null);
    this.shapeIndex = 0;
    this.lastPortalUse = -999;
    const shape = config.SHAPES[0];
    this.player = {
      x: 0, y: 0, vx: 0, vy: 0,
      w: shape.w, h: shape.h,
      onGround: false, canDoubleJump: true
    };
    this.loadLevel(0, true);
  }

  loadLevel(index, resetVelocity) {
    const lv = this.levels[index];
    this.levelIndex = index;
    this.level = lv;

    this.platforms = lv.platforms.map(function (p) {
      return {
        rect: { x: p.x, y: p.y, w: p.w, h: p.h },
        type: p.type || 'solid',
        color: p.color || null,
        enabled: true,
        broken: false,
        breakAt: 0,
        recoverAt: 0
      };
    });

    this.spikes = lv.spikes.map(function (s) {
      return { rect: { x: s.x, y: s.y, w: s.w, h: s.h } };
    });

    this.coinItems = lv.coins
      .filter((function (c) { return !this.collected[lv.id + '-' + c.id]; }).bind(this))
      .map(function (c) {
        return { key: lv.id + '-' + c.id, x: c.x, y: c.y, taken: false };
      });

    this.waters = lv.waters.map(function (w) {
      return { x: w.x, y: w.y, w: w.w, h: w.h, type: w.type };
    });

    this.portals = lv.portals.map(function (p) {
      return { rect: { x: p.x, y: p.y, w: p.w, h: p.h }, target: p.target };
    });

    this.windmills = lv.windmills.map(function (w) {
      return { x: w.x, y: w.y, bladeLength: w.bladeLength, speed: w.speed, angle: 0 };
    });

    this.exit = { x: lv.exit.x, y: lv.exit.y, w: lv.exit.w, h: lv.exit.h, next: lv.exit.next };

    this.player.x = lv.spawn[0];
    this.player.y = lv.spawn[1];
    if (resetVelocity !== false) {
      this.player.vx = 0;
      this.player.vy = 0;
    }
    this.player.onGround = false;
    this.player.canDoubleJump = true;
  }

  playerBox() {
    const p = this.player;
    return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
  }

  cycleShape() {
    this.shapeIndex = (this.shapeIndex + 1) % config.SHAPES.length;
    const shape = config.SHAPES[this.shapeIndex];
    this.player.w = shape.w;
    this.player.h = shape.h;
    this.flash('造型：' + shape.label);
  }

  flash(msg) {
    this.message = msg;
    this.messageUntil = this.time + 2.0;
  }

  respawn() {
    const spawn = this.level.spawn;
    this.player.x = spawn[0];
    this.player.y = spawn[1];
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.onGround = false;
    this.player.canDoubleJump = true;
  }

  kill(reason) {
    this.deaths += 1;
    this.flash(reason);
    this.respawn();
  }

  finish(reason) {
    this.finished = true;
    this.finishReason = reason;
    this.player.vx = 0;
    this.player.vy = 0;
  }

  reachExit() {
    this.levelsCleared += 1;
    const next = this.exit.next;
    if (next === 'hidden') {
      if (this.hiddenUnlocked) {
        const idx = this.levels.findIndex(function (lv) { return lv.hidden; });
        this.loadLevel(idx, true);
        this.flash('进入隐藏关');
        return;
      }
      const need = Math.max(0, this.hiddenUnlockNeed - this.coins);
      this.endNote = '再收集 ' + need + ' 枚金币即可解锁隐藏关';
      this.finish('clear');
      return;
    }
    if (typeof next === 'number') {
      this.loadLevel(next, true);
      this.flash('进入下一关');
      return;
    }
    this.hiddenCleared = true;
    this.finish('clear');
  }

  touchPlatform(plat) {
    if (plat.type !== 'collapsing' || plat.broken || plat.breakAt) return;
    plat.breakAt = this.time + config.COLLAPSE_DELAY;
  }

  moveX(dx) {
    const p = this.player;
    if (dx === 0) return;
    p.x += dx;
    const halfW = p.w / 2;
    const halfH = p.h / 2;
    for (const plat of this.platforms) {
      if (!plat.enabled) continue;
      const r = plat.rect;
      const left = p.x - halfW;
      const right = p.x + halfW;
      const top = p.y - halfH;
      const bottom = p.y + halfH;
      if (right <= r.x || left >= r.x + r.w || bottom <= r.y || top >= r.y + r.h) continue;
      if (dx > 0) {
        p.x = r.x - halfW;
      } else {
        p.x = r.x + r.w + halfW;
      }
      p.vx = 0;
      this.touchPlatform(plat);
    }
  }

  moveY(dy) {
    const p = this.player;
    p.y += dy;
    const halfW = p.w / 2;
    const halfH = p.h / 2;
    p.onGround = false;
    for (const plat of this.platforms) {
      if (!plat.enabled) continue;
      const r = plat.rect;
      const left = p.x - halfW;
      const right = p.x + halfW;
      const top = p.y - halfH;
      const bottom = p.y + halfH;
      if (right <= r.x || left >= r.x + r.w || bottom <= r.y || top >= r.y + r.h) continue;
      if (dy > 0) {
        p.y = r.y - halfH;
        p.vy = 0;
        p.onGround = true;
        p.canDoubleJump = true;
      } else if (dy < 0) {
        p.y = r.y + r.h + halfH;
        p.vy = 0;
      }
      this.touchPlatform(plat);
    }
  }

  update(dt, input) {
    if (this.finished) return;
    dt = Math.min(Math.max(dt, 0), 1 / 30);
    this.time += dt;
    this.elapsed += dt;

    const lv = this.level;
    const p = this.player;

    let speed = config.MOVE_SPEED;
    if (input.dash) speed = config.DASH_SPEED;

    let gravityScale = 1;
    this.status = '';
    for (const water of this.waters) {
      if (contains(water, p.x, p.y)) {
        if (water.type === 'blue') {
          speed *= config.BLUE_WATER.speed;
          gravityScale = config.BLUE_WATER.gravity;
          this.status = '蓝水减速';
        } else {
          speed *= config.BLACK_WATER.speed;
          gravityScale = config.BLACK_WATER.gravity;
          this.status = '黑水加速';
        }
      }
    }

    const move = input.move;
    p.vx = move * speed;
    if (move === 0 && p.onGround) {
      p.vx *= 0.85;
    }
    p.vy += config.GRAVITY * gravityScale * dt;

    if (p.vy > config.MAX_VY) p.vy = config.MAX_VY;
    if (p.vx > config.MAX_VX) p.vx = config.MAX_VX;
    else if (p.vx < -config.MAX_VX) p.vx = -config.MAX_VX;

    if (input.jumpPressed) {
      if (p.onGround) {
        p.vy = -config.JUMP_VELOCITY;
        p.onGround = false;
      } else if (p.canDoubleJump) {
        p.canDoubleJump = false;
        p.vy = -config.DOUBLE_JUMP_VELOCITY;
      }
    }

    this.moveX(p.vx * dt);
    this.moveY(p.vy * dt);

    if (p.x < 0) {
      p.x = 0;
      p.vx = 0;
    } else if (p.x > lv.width) {
      p.x = lv.width;
      p.vx = 0;
    }

    if (p.y - p.h / 2 > lv.height + config.FALL_DEATH_MARGIN) {
      this.kill('掉出地图');
      return;
    }

    for (const portal of this.portals) {
      if (contains(portal.rect, p.x, p.y) && this.time - this.lastPortalUse > config.PORTAL_COOLDOWN) {
        p.x = portal.target[0];
        p.y = portal.target[1];
        p.vx = 0;
        p.vy = config.PORTAL_EXIT_VELOCITY;
        this.lastPortalUse = this.time;
        this.flash('传送成功');
      }
    }

    for (const plat of this.platforms) {
      if (plat.type !== 'collapsing') continue;
      if (plat.breakAt && !plat.broken && this.time >= plat.breakAt) {
        plat.broken = true;
        plat.enabled = false;
        plat.recoverAt = this.time + config.COLLAPSE_RECOVER;
      } else if (plat.broken && this.time >= plat.recoverAt) {
        plat.broken = false;
        plat.enabled = true;
        plat.breakAt = 0;
      }
    }

    for (const wm of this.windmills) {
      wm.angle += wm.speed * dt;
      for (let i = 0; i < 4; i += 1) {
        const a = wm.angle + i * (Math.PI / 2);
        const x2 = wm.x + Math.cos(a) * wm.bladeLength;
        const y2 = wm.y + Math.sin(a) * wm.bladeLength;
        if (pointSegmentDistance(p.x, p.y, wm.x, wm.y, x2, y2) < config.WINDMILL_HIT_DISTANCE) {
          this.kill('被风车击中');
          return;
        }
      }
    }

    const box = this.playerBox();
    for (const spike of this.spikes) {
      if (overlaps(box, spike.rect)) {
        this.kill('碰到尖刺');
        return;
      }
    }

    for (const coin of this.coinItems) {
      if (coin.taken) continue;
      const coinBox = { x: coin.x - 9, y: coin.y - 9, w: 18, h: 18 };
      if (overlaps(box, coinBox)) {
        coin.taken = true;
        this.collected[coin.key] = true;
        this.coins += 1;
        if (!this.hiddenUnlocked && this.coins >= this.hiddenUnlockNeed) {
          this.hiddenUnlocked = true;
          this.flash('隐藏关卡已解锁');
        }
      }
    }

    if (contains(this.exit, p.x, p.y)) {
      this.reachExit();
    }
  }

  getRun() {
    return {
      coins: this.coins,
      levelsCleared: this.levelsCleared,
      hiddenCleared: this.hiddenCleared,
      deaths: this.deaths,
      seconds: this.elapsed
    };
  }
}

module.exports = {
  World: World,
  contains: contains,
  overlaps: overlaps,
  pointSegmentDistance: pointSegmentDistance
};
