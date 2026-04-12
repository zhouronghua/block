const SCREEN_W = 960;
const SCREEN_H = 540;

const SHAPES = [
  { key: "shape-square", label: "方形", w: 30, h: 30 },
  { key: "shape-circle", label: "圆形", w: 30, h: 30 },
  { key: "shape-line", label: "短线", w: 42, h: 14 },
  { key: "shape-triangle", label: "三角", w: 34, h: 32 }
];

class BlockScene extends Phaser.Scene {
  constructor() {
    super("block-scene");
    this.levels = buildLevels();
    this.levelIndex = 0;
    this.playerShapeIndex = 0;
    this.collectedCoins = new Set();
    this.hiddenUnlocked = false;
    this.hiddenEntryShown = false;
    this.lastPortalUse = 0;
    this.totalCoins = this.levels
      .filter((l) => !l.hidden)
      .reduce((sum, lv) => sum + lv.coins.length, 0);
  }

  create() {
    this.makeTextures();

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      a: "A",
      d: "D",
      w: "W",
      r: "R",
      shift: "SHIFT",
      tab: "TAB",
      space: "SPACE"
    });

    this.input.keyboard.on("keydown-TAB", (e) => {
      e.preventDefault();
      this.cycleShape();
    });
    this.input.keyboard.on("keydown-R", () => this.respawn());

    this.platforms = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.coins = this.physics.add.staticGroup();
    this.waters = [];
    this.portals = [];
    this.windmills = [];
    this.collapsingPlatforms = [];

    this.player = this.physics.add.sprite(0, 0, SHAPES[0].key);
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);
    this.player.body.setMaxVelocity(650, 1400);
    this.playerCanDoubleJump = true;

    this.platformCollider = this.physics.add.collider(this.player, this.platforms, (_player, platform) => {
      const data = platform.getData("meta");
      if (data && data.type === "collapsing") {
        this.beginCollapse(platform);
      }
      if (this.player.body.blocked.down) {
        this.playerCanDoubleJump = true;
      }
    });

    this.physics.add.overlap(this.player, this.spikes, () => this.killPlayer("你碰到了尖刺"));
    this.physics.add.overlap(this.player, this.coins, (_p, coin) => this.collectCoin(coin));

    this.levelTitleText = this.add.text(14, 10, "", { fontSize: "20px", color: "#ffffff" }).setScrollFactor(0);
    this.statusText = this.add.text(14, 38, "", { fontSize: "16px", color: "#ffe38f" }).setScrollFactor(0);
    this.hintText = this.add.text(14, SCREEN_H - 30, "", { fontSize: "14px", color: "#98a8bf" }).setScrollFactor(0);
    this.msgText = this.add.text(SCREEN_W / 2, 70, "", {
      fontSize: "26px",
      color: "#6fffb1",
      stroke: "#00130a",
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0);

    this.loadLevel(0, false);
  }

  makeTextures() {
    const g = this.add.graphics();

    g.clear().fillStyle(0xffcc44).fillRect(0, 0, 30, 30);
    g.generateTexture("shape-square", 30, 30);

    g.clear().fillStyle(0x5ad5ff).fillCircle(15, 15, 15);
    g.generateTexture("shape-circle", 30, 30);

    g.clear().fillStyle(0xff8f7a).fillRect(0, 6, 42, 14);
    g.generateTexture("shape-line", 42, 20);

    g.clear().fillStyle(0x8cff9b).beginPath().moveTo(17, 0).lineTo(0, 32).lineTo(34, 32).closePath().fillPath();
    g.generateTexture("shape-triangle", 34, 32);

    g.clear().fillStyle(0xffbe2e).fillCircle(9, 9, 8);
    g.lineStyle(2, 0x7a4b00).strokeCircle(9, 9, 8);
    g.generateTexture("coin", 18, 18);

    g.destroy();
  }

  clearLevelObjects() {
    this.platforms.clear(true, true);
    this.spikes.clear(true, true);
    this.coins.clear(true, true);

    for (const water of this.waters) {
      water.overlay.destroy();
    }
    this.waters = [];

    for (const portal of this.portals) {
      portal.overlay.destroy();
    }
    this.portals = [];

    this.windmills = [];
    this.collapsingPlatforms = [];
    if (this.windmillGfx) {
      this.windmillGfx.destroy();
    }
    this.windmillGfx = this.add.graphics();
  }

  loadLevel(index, keepVelocity = false) {
    const lv = this.levels[index];
    this.levelIndex = index;
    this.clearLevelObjects();

    this.physics.world.setBounds(0, 0, lv.width, lv.height);
    this.cameras.main.setBounds(0, 0, lv.width, lv.height);
    this.cameras.main.startFollow(this.player, true, 0.07, 0.08);

    for (const p of lv.platforms) {
      const platform = this.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, p.color || 0xf29445).setOrigin(0.5);
      this.physics.add.existing(platform, true);
      platform.setDataEnabled();
      platform.setData("meta", { type: p.type || "solid" });
      this.platforms.add(platform);
      if (p.type === "collapsing") {
        this.collapsingPlatforms.push({
          platform,
          cooldownUntil: 0,
          broken: false
        });
      }
    }

    for (const s of lv.spikes) {
      const spike = this.add.triangle(s.x + s.w / 2, s.y + s.h / 2, 0, s.h, s.w / 2, 0, s.w, s.h, 0xd65252);
      this.physics.add.existing(spike, true);
      this.spikes.add(spike);
    }

    for (const c of lv.coins) {
      const key = `${lv.id}-${c.id}`;
      if (this.collectedCoins.has(key)) continue;
      const coin = this.add.image(c.x, c.y, "coin");
      this.physics.add.existing(coin, true);
      coin.setDataEnabled();
      coin.setData("coinId", key);
      this.coins.add(coin);
    }

    for (const w of lv.waters) {
      const color = w.type === "blue" ? 0x57a8ff : 0x454545;
      const alpha = w.type === "blue" ? 0.35 : 0.3;
      const overlay = this.add.rectangle(w.x + w.w / 2, w.y + w.h / 2, w.w, w.h, color, alpha);
      const rect = new Phaser.Geom.Rectangle(w.x, w.y, w.w, w.h);
      this.waters.push({ type: w.type, rect, overlay });
    }

    for (const p of lv.portals) {
      const overlay = this.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, 0x63fff8, 0.28);
      overlay.setStrokeStyle(2, 0x63fff8, 0.8);
      this.portals.push({
        rect: new Phaser.Geom.Rectangle(p.x, p.y, p.w, p.h),
        target: p.target,
        overlay
      });
    }

    for (const w of lv.windmills) {
      this.windmills.push({
        x: w.x,
        y: w.y,
        bladeLength: w.bladeLength,
        speed: w.speed,
        angle: 0
      });
    }

    this.exit = lv.exit;
    if (this.exitRect) {
      this.exitRect.destroy();
    }
    this.exitRect = this.add.rectangle(
      lv.exit.x + lv.exit.w / 2,
      lv.exit.y + lv.exit.h / 2,
      lv.exit.w,
      lv.exit.h,
      0x6cf0b2,
      0.23
    );
    this.exitRect.setStrokeStyle(2, 0x6cf0b2, 0.9);

    this.player.setPosition(lv.spawn[0], lv.spawn[1]);
    if (!keepVelocity) {
      this.player.setVelocity(0, 0);
    }
    this.playerCanDoubleJump = true;

    this.refreshPlayerBody();
    this.refreshHud("");
    this.msgText.setText("");
  }

  refreshPlayerBody() {
    const shape = SHAPES[this.playerShapeIndex];
    this.player.setTexture(shape.key);
    this.player.body.setSize(shape.w, shape.h, true);
    this.player.body.setOffset((this.player.width - shape.w) / 2, (this.player.height - shape.h) / 2);
  }

  cycleShape() {
    this.playerShapeIndex = (this.playerShapeIndex + 1) % SHAPES.length;
    this.refreshPlayerBody();
  }

  collectCoin(coin) {
    const coinId = coin.getData("coinId");
    if (this.collectedCoins.has(coinId)) return;
    this.collectedCoins.add(coinId);
    coin.destroy();

    const required = Math.ceil(this.totalCoins * 0.7);
    if (!this.hiddenUnlocked && this.collectedCoins.size >= required) {
      this.hiddenUnlocked = true;
      this.flashMessage("隐藏关卡已解锁");
    }
  }

  flashMessage(msg) {
    this.msgText.setText(msg);
    this.msgText.setAlpha(1);
    this.tweens.killTweensOf(this.msgText);
    this.tweens.add({
      targets: this.msgText,
      alpha: 0,
      duration: 2000,
      delay: 900,
      ease: "Sine.easeOut"
    });
  }

  beginCollapse(platformObj) {
    const item = this.collapsingPlatforms.find((c) => c.platform === platformObj);
    if (!item || item.broken) return;
    item.broken = true;
    item.cooldownUntil = this.time.now + 2800;
    this.time.delayedCall(360, () => {
      platformObj.visible = false;
      platformObj.body.enable = false;
    });
  }

  respawn() {
    const spawn = this.levels[this.levelIndex].spawn;
    this.player.setPosition(spawn[0], spawn[1]);
    this.player.setVelocity(0, 0);
    this.playerCanDoubleJump = true;
    this.refreshHud("已重生");
  }

  killPlayer(reason) {
    this.flashMessage(reason);
    this.respawn();
  }

  inRect(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  update(_time, deltaMs) {
    const dt = deltaMs / 1000;
    const playerBody = this.player.body;

    let move = 0;
    if (this.cursors.left.isDown || this.keys.a.isDown) move -= 1;
    if (this.cursors.right.isDown || this.keys.d.isDown) move += 1;

    let speed = 260;
    if (this.keys.shift.isDown) speed = 390;

    let gravityScale = 1;
    let status = "";
    const px = this.player.x;
    const py = this.player.y;

    for (const water of this.waters) {
      if (this.inRect(water.rect, px, py)) {
        if (water.type === "blue") {
          speed *= 0.45;
          gravityScale = 0.45;
          status = "蓝水减速";
        } else {
          speed *= 1.2;
          gravityScale = 1.35;
          status = "黑水加速";
        }
      }
    }
    playerBody.setGravityY(1300 * gravityScale);

    playerBody.setVelocityX(move * speed);
    if (move === 0 && playerBody.blocked.down) {
      playerBody.setVelocityX(playerBody.velocity.x * 0.85);
    }

    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.w) ||
      Phaser.Input.Keyboard.JustDown(this.keys.space);

    if (jumpPressed) {
      if (playerBody.blocked.down) {
        playerBody.setVelocityY(-580);
      } else if (this.playerCanDoubleJump) {
        this.playerCanDoubleJump = false;
        playerBody.setVelocityY(-520);
      }
    }
    if (playerBody.blocked.down) {
      this.playerCanDoubleJump = true;
    }

    if (this.player.y > this.physics.world.bounds.height + 200) {
      this.killPlayer("掉落出地图");
    }

    for (const portal of this.portals) {
      if (this.inRect(portal.rect, this.player.x, this.player.y)) {
        if (this.time.now - this.lastPortalUse > 650) {
          this.player.setPosition(portal.target[0], portal.target[1]);
          this.player.setVelocity(0, -120);
          this.lastPortalUse = this.time.now;
          this.flashMessage("传送成功");
        }
      }
    }

    for (const item of this.collapsingPlatforms) {
      if (item.broken && this.time.now >= item.cooldownUntil) {
        item.broken = false;
        item.platform.visible = true;
        item.platform.body.enable = true;
      }
    }

    this.windmillGfx.clear();
    for (const wm of this.windmills) {
      wm.angle += wm.speed * dt;
      this.windmillGfx.fillStyle(0x2b2f38).fillCircle(wm.x, wm.y, 8);
      this.windmillGfx.lineStyle(5, 0xf6f6f6, 1);

      for (let i = 0; i < 4; i += 1) {
        const a = wm.angle + i * (Math.PI / 2);
        const x2 = wm.x + Math.cos(a) * wm.bladeLength;
        const y2 = wm.y + Math.sin(a) * wm.bladeLength;
        this.windmillGfx.strokeLineShape(new Phaser.Geom.Line(wm.x, wm.y, x2, y2));

        const distance = Phaser.Math.Distance.BetweenPoints(
          { x: this.player.x, y: this.player.y },
          closestPointOnSegment(this.player.x, this.player.y, wm.x, wm.y, x2, y2)
        );
        if (distance < 18) {
          this.killPlayer("被风车击中");
          break;
        }
      }
    }

    if (this.inRect(this.exit, this.player.x, this.player.y)) {
      if (this.exit.next === "hidden") {
        if (this.hiddenUnlocked) {
          const hiddenIndex = this.levels.findIndex((lv) => lv.hidden);
          this.loadLevel(hiddenIndex);
        } else if (!this.hiddenEntryShown) {
          this.hiddenEntryShown = true;
          this.flashMessage("收集更多金币后可进入隐藏关");
        }
      } else if (typeof this.exit.next === "number") {
        this.loadLevel(this.exit.next);
      } else {
        this.flashMessage("恭喜通关，欢迎再玩");
      }
    }

    const shape = SHAPES[this.playerShapeIndex].label;
    const lv = this.levels[this.levelIndex];
    const hint = "A/D移动 W或空格跳跃 Shift冲刺 Tab切换造型 R重生";
    this.levelTitleText.setText(`${lv.name} (${this.levelIndex + 1}/${this.levels.length})`);
    this.statusText.setText(`金币 ${this.collectedCoins.size}/${this.totalCoins} | 造型 ${shape}${status ? ` | ${status}` : ""}`);
    this.hintText.setText(hint);
  }

  refreshHud(msg) {
    if (msg) {
      this.flashMessage(msg);
    }
  }
}

function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.0001) return { x: x1, y: y1 };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

function buildLevels() {
  return [
    {
      id: "lv1",
      name: "第一关 试跑",
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
        { id: "c1", x: 830, y: 610 },
        { id: "c2", x: 1180, y: 530 },
        { id: "c3", x: 1900, y: 420 }
      ],
      waters: [
        { x: 1350, y: 700, w: 300, h: 150, type: "blue" }
      ],
      windmills: [
        { x: 1660, y: 640, bladeLength: 74, speed: 2.8 }
      ],
      portals: [],
      exit: { x: 2320, y: 360, w: 70, h: 120, next: 1 }
    },
    {
      id: "lv2",
      name: "第二关 机关区",
      width: 2750,
      height: 1000,
      hidden: false,
      spawn: [80, 620],
      platforms: [
        { x: 0, y: 720, w: 760, h: 260 },
        { x: 840, y: 660, w: 150, h: 22, type: "collapsing", color: 0x8e8e8e },
        { x: 1060, y: 620, w: 170, h: 22, type: "collapsing", color: 0x8e8e8e },
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
        { id: "c4", x: 900, y: 620 },
        { id: "c5", x: 1120, y: 580 },
        { id: "c6", x: 2040, y: 450 }
      ],
      waters: [
        { x: 940, y: 730, w: 330, h: 220, type: "black" },
        { x: 1760, y: 730, w: 320, h: 200, type: "blue" }
      ],
      windmills: [
        { x: 1420, y: 650, bladeLength: 66, speed: 3.5 },
        { x: 1760, y: 620, bladeLength: 72, speed: -2.4 }
      ],
      portals: [
        { x: 2060, y: 418, w: 50, h: 72, target: [2440, 370] }
      ],
      exit: { x: 2610, y: 360, w: 80, h: 120, next: "hidden" }
    },
    {
      id: "lv3-hidden",
      name: "隐藏关 冲刺试炼",
      width: 2900,
      height: 980,
      hidden: true,
      spawn: [120, 620],
      platforms: [
        { x: 0, y: 740, w: 620, h: 240 },
        { x: 720, y: 670, w: 210, h: 24, type: "collapsing", color: 0x93a2a6 },
        { x: 1020, y: 620, w: 180, h: 24 },
        { x: 1290, y: 580, w: 170, h: 24 },
        { x: 1540, y: 540, w: 170, h: 24, type: "collapsing", color: 0x93a2a6 },
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
        { id: "c7", x: 1080, y: 580 },
        { id: "c8", x: 1860, y: 460 },
        { id: "c9", x: 2450, y: 390 }
      ],
      waters: [
        { x: 1350, y: 750, w: 300, h: 220, type: "black" }
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

const config = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: SCREEN_W,
  height: SCREEN_H,
  backgroundColor: "#111822",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 1300 },
      debug: false
    }
  },
  scene: [BlockScene]
};

new Phaser.Game(config);
