'use strict';

const platform = require('./platform.js');
const ui = require('./ui.js');

// 触摸输入：把原始触摸点换算到设计坐标系，再按当前界面布局判定按下/点击。
class Input {
  constructor() {
    this.mapper = null;
    this.active = new Map();
    this.starts = [];
    this.layout = [];
    this.down = Object.create(null);
    this.pressed = Object.create(null);
    this.prevDown = Object.create(null);

    const self = this;
    const toList = function (event) {
      const source = (event && event.changedTouches && event.changedTouches.length)
        ? event.changedTouches
        : ((event && event.touches) || []);
      return source;
    };

    platform.onTouchStart(function (event) {
      for (const touch of toList(event)) {
        const point = self.toDesign(touch.clientX, touch.clientY);
        if (!point) continue;
        self.active.set(self.keyOf(touch), point);
        self.starts.push(point);
      }
    });

    platform.onTouchMove(function (event) {
      for (const touch of toList(event)) {
        const point = self.toDesign(touch.clientX, touch.clientY);
        if (!point) continue;
        self.active.set(self.keyOf(touch), point);
      }
    });

    const clear = function (event) {
      for (const touch of toList(event)) {
        self.active.delete(self.keyOf(touch));
      }
    };
    platform.onTouchEnd(clear);
    platform.onTouchCancel(clear);
  }

  keyOf(touch) {
    return touch && touch.identifier !== undefined ? touch.identifier : 0;
  }

  setMapper(fn) {
    this.mapper = fn;
  }

  toDesign(clientX, clientY) {
    if (!this.mapper) return null;
    return this.mapper(clientX, clientY);
  }

  beginFrame() {
    this.down = Object.create(null);
    this.pressed = Object.create(null);
    const points = Array.from(this.active.values());
    for (const point of points) {
      for (const btn of this.layout) {
        if (!ui.hitButton(btn, point)) continue;
        this.down[btn.id] = true;
        if (!this.prevDown[btn.id]) this.pressed[btn.id] = true;
      }
    }
  }

  endFrame() {
    this.prevDown = this.down;
    this.starts.length = 0;
  }

  isDown(id) {
    return this.down[id] === true;
  }

  wasPressed(id) {
    return this.pressed[id] === true;
  }

  taps() {
    return this.starts;
  }

  clear() {
    this.active.clear();
    this.starts.length = 0;
    this.prevDown = Object.create(null);
    this.down = Object.create(null);
    this.pressed = Object.create(null);
  }
}

module.exports = { Input: Input };
