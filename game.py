"""
方块跳跃 — 增强版：物理、造型切换、多关卡与传送。
新增功能：
- 下蹲(按S或下键)
- 冲刺(左/右+Shift)
- 蓄力弹跳(Shift+上)
- 空中连跳
- 金币系统
- 红色尖刺(静止/移动/追踪)
- 动态塌陷地面
- 绿色边缘方块(无限跳)
- 移动方块
- 蓝色水(减速)/黑色水(加速)
- I键随机切换地图
- R键当前地图复活
- 风车(可登上到对岸)
"""
from __future__ import annotations

import sys
import random
import math
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import List, Tuple, Optional

import pygame

# ============ 颜色定义 ============
COLOR_PLATFORM = (255, 160, 0)  # 橙色平台
COLOR_PORTAL_NEXT = (43, 234, 255)
COLOR_PORTAL_PREV = (52, 235, 255)
COLOR_EXIT = (46, 204, 113)
COLOR_EXIT_BORDER = (25, 140, 80)
COLOR_BG = (245, 248, 252)
COLOR_TEXT = (30, 35, 45)
PLAYER_COLOR = (20, 22, 28)

# 新增颜色
COLOR_GRAY_BLOCK = (150, 150, 150)  # 灰色方块(可被冲刺撞掉)
COLOR_SPIKE = (255, 50, 50)  # 红色尖刺
COLOR_GREEN_EDGE = (50, 255, 100)  # 绿色边缘
COLOR_COIN = (255, 215, 0)  # 金币
COLOR_WATER_BLUE = (100, 150, 255)  # 蓝色水-减速
COLOR_WATER_BLACK = (40, 40, 40)  # 黑色水-加速
COLOR_MOVING_BLOCK = (180, 100, 255)  # 移动方块
COLOR_COLLAPSING = (200, 120, 80)  # 塌陷地面
COLOR_WINDMILL = (100, 200, 100)  # 风车

SCREEN_W, SCREEN_H = 960, 540
FPS = 60


class Shape(Enum):
    SQUARE = auto()
    CIRCLE = auto()
    LINE = auto()
    TRIANGLE = auto()


@dataclass
class RectF:
    x: float
    y: float
    w: float
    h: float

    def to_pygame(self) -> pygame.Rect:
        return pygame.Rect(int(self.x), int(self.y), int(self.w), int(self.h))

    def colliderect(self, other: pygame.Rect) -> bool:
        return self.to_pygame().colliderect(other)


def shape_size(shape: Shape, crouching: bool = False) -> Tuple[float, float]:
    """各造型包围盒（宽, 高）— 短线更扁，可穿过较矮通道。"""
    if crouching:
        return 26.0, 13.0  # 下蹲时高度减半
    if shape == Shape.SQUARE:
        return 26.0, 26.0
    if shape == Shape.CIRCLE:
        return 24.0, 24.0
    if shape == Shape.LINE:
        return 36.0, 9.0
    return 28.0, 26.0


# ============ 游戏元素类 ============

@dataclass
class Spike:
    """尖刺类 - 静止、移动或追踪"""
    x: float
    y: float
    w: float
    h: float
    spike_type: str = "static"  # static, moving, chasing
    vx: float = 0.0
    vy: float = 0.0
    move_range: float = 100.0
    move_speed: float = 2.0
    original_x: float = 0.0
    original_y: float = 0.0
    chase_speed: float = 3.0
    chase_range: float = 200.0

    def __post_init__(self):
        self.original_x = self.x
        self.original_y = self.y

    def update(self, player_x: float, player_y: float):
        if self.spike_type == "moving":
            self.x += self.vx
            if abs(self.x - self.original_x) > self.move_range:
                self.vx = -self.vx
        elif self.spike_type == "chasing":
            dist = math.sqrt((player_x - self.x)**2 + (player_y - self.y)**2)
            if dist < self.chase_range:
                dx = player_x - self.x
                dy = player_y - self.y
                if dist > 0:
                    self.x += (dx / dist) * self.chase_speed
                    self.y += (dy / dist) * self.chase_speed

    def get_rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.x), int(self.y), int(self.w), int(self.h))


@dataclass
class Coin:
    """金币类"""
    x: float
    y: float
    radius: float = 12.0
    collected: bool = False
    coin_id: int = 0

    def get_rect(self) -> pygame.Rect:
        r = int(self.radius)
        return pygame.Rect(int(self.x) - r, int(self.y) - r, r * 2, r * 2)


@dataclass
class CollapsingPlatform:
    """动态塌陷地面"""
    x: float
    y: float
    w: float
    h: float
    collapsed: bool = False
    collapse_timer: float = 0.0
    collapse_delay: float = 0.5  # 踩上后多久开始塌陷
    disappear_timer: float = 0.0
    disappear_delay: float = 2.0  # 塌陷后多久完全消失
    regenerated: bool = False

    def get_rect(self) -> pygame.Rect:
        if self.collapsed and self.disappear_timer >= self.disappear_delay:
            return pygame.Rect(0, 0, 0, 0)  # 已完全消失
        return pygame.Rect(int(self.x), int(self.y), int(self.w), int(self.h))

    def update(self, dt: float, player_on_top: bool):
        if self.regenerated:
            return
        if not self.collapsed:
            if player_on_top:
                self.collapse_timer += dt
                if self.collapse_timer >= self.collapse_delay:
                    self.collapsed = True
        else:
            self.disappear_timer += dt


@dataclass
class GreenEdgeBlock:
    """绿色边缘方块 - 碰到可无限跳"""
    x: float
    y: float
    w: float
    h: float

    def get_rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.x), int(self.y), int(self.w), int(self.h))


@dataclass
class MovingBlock:
    """移动方块"""
    x: float
    y: float
    w: float
    h: float
    vx: float = 2.0
    vy: float = 0.0
    move_range_x: float = 200.0
    move_range_y: float = 0.0
    original_x: float = 0.0
    original_y: float = 0.0
    block_type: str = "horizontal"  # horizontal, vertical, push

    def __post_init__(self):
        self.original_x = self.x
        self.original_y = self.y

    def update(self):
        if self.block_type in ["horizontal", "push"]:
            self.x += self.vx
            if abs(self.x - self.original_x) > self.move_range_x:
                self.vx = -self.vx
        elif self.block_type == "vertical":
            self.y += self.vy
            if abs(self.y - self.original_y) > self.move_range_y:
                self.vy = -self.vy

    def get_rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.x), int(self.y), int(self.w), int(self.h))


@dataclass
class WaterZone:
    """水域 - 蓝色减速，黑色加速"""
    x: float
    y: float
    w: float
    h: float
    water_type: str = "blue"  # blue(减速), black(加速)
    speed_factor: float = 0.5  # 蓝色水速度系数
    speed_boost: float = 1.5  # 黑色水加速系数

    def get_rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.x), int(self.y), int(self.w), int(self.h))


@dataclass
class Windmill:
    """风车 - 慢速旋转，可登上到对岸"""
    cx: float  # 中心x
    cy: float  # 中心y
    blade_length: float = 120.0
    blade_width: float = 30.0
    rotation_speed: float = 1.0  # 旋转速度(度/帧)
    angle: float = 0.0

    def update(self):
        self.angle = (self.angle + self.rotation_speed) % 360

    def get_blade_rects(self) -> List[pygame.Rect]:
        """获取两个叶片的位置"""
        rects = []
        rad = math.radians(self.angle)
        # 叶片1
        x1 = self.cx + math.cos(rad) * self.blade_length * 0.5
        y1 = self.cy + math.sin(rad) * self.blade_length * 0.5
        rects.append(pygame.Rect(int(x1 - self.blade_width/2), int(y1 - self.blade_length/2),
                                  int(self.blade_width), int(self.blade_length)))
        # 叶片2 (垂直)
        rad2 = math.radians(self.angle + 90)
        x2 = self.cx + math.cos(rad2) * self.blade_length * 0.5
        y2 = self.cy + math.sin(rad2) * self.blade_length * 0.5
        rects.append(pygame.Rect(int(x2 - self.blade_length/2), int(y2 - self.blade_width/2),
                                  int(self.blade_length), int(self.blade_width)))
        return rects


@dataclass
class GrayBlock:
    """灰色方块 - 可被冲刺撞掉"""
    x: float
    y: float
    w: float
    h: float
    destroyed: bool = False
    destroy_timer: float = 0.0
    disappear_delay: float = 2.0

    def update(self, dt: float):
        if self.destroyed:
            self.destroy_timer += dt

    def get_rect(self) -> pygame.Rect:
        if self.destroyed and self.destroy_timer >= self.disappear_delay:
            return pygame.Rect(0, 0, 0, 0)
        return pygame.Rect(int(self.x), int(self.y), int(self.w), int(self.h))


@dataclass
class Level:
    name: str
    platforms: List[pygame.Rect]
    portal_next: pygame.Rect | None
    portal_prev: pygame.Rect | None
    spawn: Tuple[float, float]
    world_width: int = SCREEN_W + 400
    exit_rect: pygame.Rect | None = None
    # 新增元素
    gray_blocks: List[GrayBlock] = field(default_factory=list)
    spikes: List[Spike] = field(default_factory=list)
    coins: List[Coin] = field(default_factory=list)
    collapsing_platforms: List[CollapsingPlatform] = field(default_factory=list)
    green_edge_blocks: List[GreenEdgeBlock] = field(default_factory=list)
    moving_blocks: List[MovingBlock] = field(default_factory=list)
    water_zones: List[WaterZone] = field(default_factory=list)
    windmills: List[Windmill] = field(default_factory=list)
    # 隐藏关卡
    is_hidden: bool = False
    coins_required: int = 0  # 进入隐藏关卡需要的金币数


NUM_LEVELS = 20
COINS_FOR_HIDDEN = 10  # 收集10金币解锁隐藏关卡


def _plat(x: int, y: int, w: int, h: int) -> pygame.Rect:
    return pygame.Rect(x, y, w, h)


def build_level(level_index: int, total: int) -> Level:
    """
    构建复杂关卡：多层平台、阶梯、垂直挑战。
    包含各种游戏元素。
    """
    ground_h = 40
    py = SCREEN_H - ground_h
    is_final = level_index == total - 1

    platforms: List[pygame.Rect] = []
    gray_blocks: List[GrayBlock] = []
    spikes: List[Spike] = []
    coins: List[Coin] = []
    collapsing: List[CollapsingPlatform] = []
    green_edges: List[GreenEdgeBlock] = []
    moving_blocks: List[MovingBlock] = []
    water_zones: List[WaterZone] = []
    windmills: List[Windmill] = []

    right_edge = 1200

    # 基础地面（起始区域）
    platforms.append(_plat(-100, py, 200, ground_h))

    if level_index == 0:
        # 第1关：基础教学关 - 简单平台+金币
        platforms.append(_plat(100, py - 150, 150, 20))
        platforms.append(_plat(280, py - 100, 120, 20))
        platforms.append(_plat(450, py - 180, 100, 20))
        platforms.append(_plat(600, py - 120, 150, 20))
        platforms.append(_plat(800, py - 200, 100, 20))
        platforms.append(_plat(950, py - 80, 200, ground_h))
        right_edge = 1150

        # 金币
        coins.append(Coin(175, py - 180, coin_id=0))
        coins.append(Coin(340, py - 130, coin_id=1))
        coins.append(Coin(500, py - 210, coin_id=2))

    elif level_index == 1:
        # 第2关：灰色方块+冲刺教学
        platforms.append(_plat(100, py - 150, 150, 20))
        platforms.append(_plat(300, py - 100, 100, 20))
        platforms.append(_plat(500, py - 180, 100, 20))
        platforms.append(_plat(700, py - 120, 150, 20))
        platforms.append(_plat(900, py - 200, 100, 20))
        platforms.append(_plat(1100, py - 80, 200, ground_h))
        right_edge = 1300

        # 灰色方块(可被冲刺撞掉)
        gray_blocks.append(GrayBlock(400, py - 180, 40, 40))
        gray_blocks.append(GrayBlock(800, py - 200, 40, 40))

        # 金币
        coins.append(Coin(420, py - 230, coin_id=3))
        coins.append(Coin(820, py - 250, coin_id=4))

    elif level_index == 2:
        # 第3关：尖刺挑战
        platforms.append(_plat(100, py - 200, 100, 20))
        platforms.append(_plat(250, py - 280, 80, 20))
        platforms.append(_plat(400, py - 150, 60, 20))
        platforms.append(_plat(550, py - 350, 80, 20))
        platforms.append(_plat(700, py - 220, 60, 20))
        platforms.append(_plat(850, py - 400, 100, 20))
        platforms.append(_plat(1000, py - 300, 80, 20))
        platforms.append(_plat(1150, py - 200, 100, 20))
        platforms.append(_plat(1350, py - 80, 200, ground_h))
        right_edge = 1550

        # 红色尖刺
        spikes.append(Spike(330, py - 300, 20, 20))  # 静止尖刺
        spikes.append(Spike(600, py - 370, 20, 20, "moving", vx=2.0, move_range=80))

        # 金币(放在尖刺附近，需要小心获取)
        coins.append(Coin(330, py - 350, coin_id=5))

    elif level_index == 3:
        # 第4关：塌陷地面
        platforms.append(_plat(100, py - 120, 100, 20))
        platforms.append(_plat(250, py - 200, 80, 20))
        platforms.append(_plat(400, py - 280, 60, 20))
        platforms.append(_plat(550, py - 150, 100, 20))
        platforms.append(_plat(750, py - 320, 80, 20))
        platforms.append(_plat(900, py - 200, 60, 20))
        platforms.append(_plat(1050, py - 350, 100, 20))
        platforms.append(_plat(1200, py - 250, 150, 20))
        platforms.append(_plat(1450, py - 80, 250, ground_h))
        right_edge = 1700

        # 塌陷平台
        collapsing.append(CollapsingPlatform(350, py - 200, 60, 20))
        collapsing.append(CollapsingPlatform(620, py - 150, 80, 20))
        collapsing.append(CollapsingPlatform(960, py - 200, 60, 20))

        # 金币(在塌陷平台上)
        coins.append(Coin(380, py - 240, coin_id=6))
        coins.append(Coin(990, py - 240, coin_id=7))

    elif level_index == 4:
        # 第5关：蓄力弹跳教学
        platforms.append(_plat(80, py - 160, 60, 20))
        platforms.append(_plat(200, py - 100, 40, 20))
        platforms.append(_plat(320, py - 220, 100, 20))
        platforms.append(_plat(500, py - 350, 150, 20))  # 高平台
        platforms.append(_plat(720, py - 200, 100, 20))
        platforms.append(_plat(900, py - 400, 80, 20))  # 更高
        platforms.append(_plat(1100, py - 250, 100, 20))
        platforms.append(_plat(1300, py - 150, 120, 20))
        platforms.append(_plat(1500, py - 80, 200, ground_h))
        right_edge = 1700

        # 金币在高处，需要用蓄力弹跳
        coins.append(Coin(575, py - 390, coin_id=8))
        coins.append(Coin(940, py - 440, coin_id=9))

    elif level_index == 5:
        # 第6关：绿色边缘方块(无限跳)
        platforms.append(_plat(100, py - 200, 100, 20))
        platforms.append(_plat(300, py - 350, 80, 20))
        platforms.append(_plat(500, py - 250, 60, 20))
        platforms.append(_plat(700, py - 400, 80, 20))
        platforms.append(_plat(900, py - 300, 100, 20))
        platforms.append(_plat(1100, py - 450, 80, 20))
        platforms.append(_plat(1300, py - 350, 100, 20))
        platforms.append(_plat(1500, py - 200, 150, 20))
        platforms.append(_plat(1750, py - 80, 250, ground_h))
        right_edge = 2000

        # 绿色边缘方块
        green_edges.append(GreenEdgeBlock(340, py - 370, 60, 20))
        green_edges.append(GreenEdgeBlock(940, py - 320, 60, 20))

        # 金币
        coins.append(Coin(370, py - 410, coin_id=10))
        coins.append(Coin(970, py - 360, coin_id=11))

    elif level_index == 6:
        # 第7关：水域(蓝色减速)
        platforms.append(_plat(100, py - 200, 100, 20))
        platforms.append(_plat(300, py - 300, 80, 20))
        platforms.append(_plat(500, py - 200, 100, 20))
        platforms.append(_plat(750, py - 350, 80, 20))
        platforms.append(_plat(950, py - 250, 100, 20))
        platforms.append(_plat(1200, py - 400, 80, 20))
        platforms.append(_plat(1400, py - 300, 100, 20))
        platforms.append(_plat(1600, py - 150, 150, 20))
        platforms.append(_plat(1900, py - 80, 250, ground_h))
        right_edge = 2150

        # 蓝色水域
        water_zones.append(WaterZone(400, py - 100, 200, 60, "blue"))
        water_zones.append(WaterZone(1050, py - 200, 150, 100, "blue"))

        # 金币
        coins.append(Coin(500, py - 150, coin_id=12))
        coins.append(Coin(1125, py - 250, coin_id=13))

    elif level_index == 7:
        # 第8关：黑色水域加速
        platforms.append(_plat(80, py - 250, 100, 20))
        platforms.append(_plat(300, py - 350, 150, 20))
        platforms.append(_plat(550, py - 200, 100, 20))
        platforms.append(_plat(800, py - 400, 80, 20))
        platforms.append(_plat(1000, py - 300, 150, 20))
        platforms.append(_plat(1300, py - 450, 100, 20))
        platforms.append(_plat(1500, py - 350, 80, 20))
        platforms.append(_plat(1700, py - 250, 100, 20))
        platforms.append(_plat(1950, py - 80, 300, ground_h))
        right_edge = 2250

        # 黑色水域(加速)
        water_zones.append(WaterZone(650, py - 150, 150, 70, "black"))

        # 金币
        coins.append(Coin(725, py - 200, coin_id=14))

    elif level_index == 8:
        # 第9关：移动方块
        platforms.append(_plat(60, py - 200, 50, 20))
        platforms.append(_plat(200, py - 350, 60, 20))
        platforms.append(_plat(400, py - 280, 80, 20))
        platforms.append(_plat(650, py - 400, 100, 20))
        platforms.append(_plat(900, py - 250, 80, 20))
        platforms.append(_plat(1150, py - 450, 60, 20))
        platforms.append(_plat(1350, py - 350, 80, 20))
        platforms.append(_plat(1550, py - 200, 100, 20))
        platforms.append(_plat(1800, py - 400, 120, 20))
        platforms.append(_plat(2050, py - 150, 200, ground_h))
        right_edge = 2250

        # 移动方块
        moving_blocks.append(MovingBlock(300, py - 200, 60, 20, vx=3.0, move_range_x=150))
        moving_blocks.append(MovingBlock(750, py - 320, 60, 20, vx=-2.5, move_range_x=120))
        moving_blocks.append(MovingBlock(1450, py - 280, 60, 20, vx=2.0, move_range_x=100, block_type="push"))

        # 金币(在移动方块路径上)
        coins.append(Coin(375, py - 250, coin_id=15))

    elif level_index == 9:
        # 第10关：风车挑战
        platforms.append(_plat(100, py - 250, 100, 20))
        platforms.append(_plat(350, py - 350, 80, 20))
        platforms.append(_plat(600, py - 250, 80, 20))
        platforms.append(_plat(850, py - 450, 80, 20))
        platforms.append(_plat(1100, py - 350, 80, 20))
        platforms.append(_plat(1350, py - 450, 80, 20))
        platforms.append(_plat(1600, py - 350, 80, 20))
        platforms.append(_plat(1850, py - 250, 100, 20))
        platforms.append(_plat(2100, py - 150, 200, ground_h))
        right_edge = 2300

        # 风车
        windmills.append(Windmill(500, py - 200, blade_length=100, rotation_speed=1.5))
        windmills.append(Windmill(1000, py - 300, blade_length=120, rotation_speed=-1.0))
        windmills.append(Windmill(1500, py - 250, blade_length=100, rotation_speed=2.0))

        # 金币
        coins.append(Coin(500, py - 300, coin_id=16))
        coins.append(Coin(1000, py - 400, coin_id=17))

    elif level_index == 10:
        # 第11关：追踪尖刺
        platforms.append(_plat(100, py - 200, 80, 20))
        platforms.append(_plat(280, py - 320, 80, 20))
        platforms.append(_plat(450, py - 250, 80, 20))
        platforms.append(_plat(650, py - 380, 80, 20))
        platforms.append(_plat(850, py - 300, 80, 20))
        platforms.append(_plat(1050, py - 420, 80, 20))
        platforms.append(_plat(1250, py - 350, 80, 20))
        platforms.append(_plat(1450, py - 450, 100, 20))
        platforms.append(_plat(1700, py - 280, 120, 20))
        platforms.append(_plat(1950, py - 150, 250, ground_h))
        right_edge = 2200

        # 追踪尖刺
        spikes.append(Spike(500, py - 200, 25, 25, "chasing", chase_speed=2.0, chase_range=250))
        spikes.append(Spike(900, py - 350, 25, 25, "chasing", chase_speed=2.5, chase_range=300))

        # 金币
        coins.append(Coin(1100, py - 150, coin_id=18))

    elif level_index == 11:
        # 第12关：综合挑战 - 塌陷+尖刺+金币
        platforms.append(_plat(80, py - 180, 40, 20))
        platforms.append(_plat(200, py - 280, 60, 20))
        platforms.append(_plat(350, py - 380, 60, 20))
        platforms.append(_plat(500, py - 300, 80, 20))
        platforms.append(_plat(700, py - 420, 60, 20))
        platforms.append(_plat(900, py - 350, 80, 20))
        platforms.append(_plat(1100, py - 480, 60, 20))
        platforms.append(_plat(1300, py - 400, 80, 20))
        platforms.append(_plat(1500, py - 320, 100, 20))
        platforms.append(_plat(1750, py - 450, 100, 20))
        platforms.append(_plat(2000, py - 350, 120, 20))
        platforms.append(_plat(2250, py - 200, 250, ground_h))
        right_edge = 2500

        # 塌陷平台
        collapsing.append(CollapsingPlatform(420, py - 300, 50, 20))
        collapsing.append(CollapsingPlatform(940, py - 350, 50, 20))
        collapsing.append(CollapsingPlatform(1580, py - 320, 60, 20))

        # 尖刺
        spikes.append(Spike(600, py - 320, 20, 20, "moving", vx=2.0, move_range=100))

        # 金币
        coins.append(Coin(445, py - 340, coin_id=19))
        coins.append(Coin(965, py - 390, coin_id=20))
        coins.append(Coin(2200, py - 250, coin_id=21))

    elif level_index == 12:
        # 第13关：更多风车+移动方块
        platforms.append(_plat(100, py - 200, 80, 20))
        platforms.append(_plat(300, py - 350, 60, 20))
        platforms.append(_plat(550, py - 280, 80, 20))
        platforms.append(_plat(800, py - 450, 60, 20))
        platforms.append(_plat(1050, py - 350, 80, 20))
        platforms.append(_plat(1300, py - 500, 60, 20))
        platforms.append(_plat(1550, py - 400, 80, 20))
        platforms.append(_plat(1800, py - 300, 100, 20))
        platforms.append(_plat(2050, py - 450, 120, 20))
        platforms.append(_plat(2300, py - 350, 150, 20))
        platforms.append(_plat(2600, py - 200, 250, ground_h))
        right_edge = 2850

        # 风车
        windmills.append(Windmill(450, py - 200, blade_length=90, rotation_speed=2.0))
        windmills.append(Windmill(900, py - 350, blade_length=110, rotation_speed=-1.5))
        windmills.append(Windmill(1450, py - 400, blade_length=100, rotation_speed=1.8))

        # 移动方块
        moving_blocks.append(MovingBlock(700, py - 350, 50, 20, vx=-2.0, move_range_x=100))

        # 金币
        coins.append(Coin(450, py - 300, coin_id=22))
        coins.append(Coin(1450, py - 450, coin_id=23))

    elif level_index == 13:
        # 第14关：水域综合
        platforms.append(_plat(100, py - 200, 80, 20))
        platforms.append(_plat(300, py - 300, 100, 20))
        platforms.append(_plat(550, py - 200, 80, 20))
        platforms.append(_plat(800, py - 350, 100, 20))
        platforms.append(_plat(1100, py - 250, 80, 20))
        platforms.append(_plat(1350, py - 400, 100, 20))
        platforms.append(_plat(1600, py - 300, 80, 20))
        platforms.append(_plat(1850, py - 450, 100, 20))
        platforms.append(_plat(2100, py - 350, 80, 20))
        platforms.append(_plat(2350, py - 250, 100, 20))
        platforms.append(_plat(2600, py - 150, 250, ground_h))
        right_edge = 2850

        # 蓝色水域
        water_zones.append(WaterZone(450, py - 150, 150, 70, "blue"))
        water_zones.append(WaterZone(1250, py - 250, 150, 100, "blue"))

        # 黑色水域
        water_zones.append(WaterZone(2000, py - 350, 200, 100, "black"))

        # 金币
        coins.append(Coin(525, py - 200, coin_id=24))
        coins.append(Coin(2100, py - 400, coin_id=25))

    elif level_index == 14:
        # 第15关：极限塌陷
        platforms.append(_plat(100, py - 250, 50, 20))
        platforms.append(_plat(250, py - 350, 60, 20))
        platforms.append(_plat(400, py - 200, 50, 20))
        platforms.append(_plat(550, py - 400, 60, 20))
        platforms.append(_plat(720, py - 280, 50, 20))
        platforms.append(_plat(900, py - 450, 60, 20))
        platforms.append(_plat(1080, py - 320, 50, 20))
        platforms.append(_plat(1250, py - 500, 70, 20))
        platforms.append(_plat(1450, py - 380, 60, 20))
        platforms.append(_plat(1650, py - 250, 80, 20))
        platforms.append(_plat(1880, py - 480, 80, 20))
        platforms.append(_plat(2100, py - 350, 100, 20))
        platforms.append(_plat(2350, py - 200, 250, ground_h))
        right_edge = 2600

        # 大量塌陷平台
        collapsing.append(CollapsingPlatform(220, py - 250, 50, 20))
        collapsing.append(CollapsingPlatform(470, py - 200, 50, 20))
        collapsing.append(CollapsingPlatform(770, py - 280, 50, 20))
        collapsing.append(CollapsingPlatform(1130, py - 320, 50, 20))
        collapsing.append(CollapsingPlatform(1720, py - 250, 60, 20))

        # 金币
        coins.append(Coin(245, py - 290, coin_id=26))
        coins.append(Coin(495, py - 240, coin_id=27))
        coins.append(Coin(2390, py - 250, coin_id=28))

    elif level_index == 15:
        # 第16关：灰色方块+冲刺组合
        platforms.append(_plat(60, py - 300, 60, 20))
        platforms.append(_plat(200, py - 420, 50, 20))
        platforms.append(_plat(350, py - 200, 40, 20))
        platforms.append(_plat(450, py - 480, 50, 20))
        platforms.append(_plat(600, py - 250, 40, 20))
        platforms.append(_plat(720, py - 520, 60, 20))
        platforms.append(_plat(850, py - 180, 40, 20))
        platforms.append(_plat(950, py - 450, 50, 20))
        platforms.append(_plat(1100, py - 320, 40, 20))
        platforms.append(_plat(1220, py - 550, 80, 20))
        platforms.append(_plat(1420, py - 400, 60, 20))
        platforms.append(_plat(1620, py - 280, 80, 20))
        platforms.append(_plat(1820, py - 500, 80, 20))
        platforms.append(_plat(2050, py - 350, 100, 20))
        platforms.append(_plat(2300, py - 450, 120, 20))
        platforms.append(_plat(2550, py - 300, 150, 20))
        platforms.append(_plat(2850, py - 200, 300, ground_h))
        right_edge = 3150

        # 灰色方块墙
        gray_blocks.append(GrayBlock(300, py - 300, 40, 40))
        gray_blocks.append(GrayBlock(340, py - 300, 40, 40))
        gray_blocks.append(GrayBlock(800, py - 350, 40, 40))
        gray_blocks.append(GrayBlock(1300, py - 400, 40, 40))
        gray_blocks.append(GrayBlock(1700, py - 450, 40, 40))

        # 金币(在灰色方块后面)
        coins.append(Coin(360, py - 350, coin_id=29))
        coins.append(Coin(840, py - 400, coin_id=30))

    elif level_index == 16:
        # 第17关：绿色边缘综合
        platforms.append(_plat(80, py - 200, 30, 20))
        platforms.append(_plat(200, py - 320, 30, 20))
        platforms.append(_plat(320, py - 440, 30, 20))
        platforms.append(_plat(450, py - 360, 30, 20))
        platforms.append(_plat(580, py - 480, 30, 20))
        platforms.append(_plat(720, py - 400, 30, 20))
        platforms.append(_plat(860, py - 320, 30, 20))
        platforms.append(_plat(1000, py - 520, 40, 20))
        platforms.append(_plat(1150, py - 440, 40, 20))
        platforms.append(_plat(1320, py - 550, 60, 20))
        platforms.append(_plat(1520, py - 380, 50, 20))
        platforms.append(_plat(1720, py - 480, 70, 20))
        platforms.append(_plat(1950, py - 300, 80, 20))
        platforms.append(_plat(2200, py - 520, 100, 20))
        platforms.append(_plat(2450, py - 350, 120, 20))
        platforms.append(_plat(2750, py - 200, 300, ground_h))
        right_edge = 3050

        # 多个绿色边缘
        green_edges.append(GreenEdgeBlock(230, py - 340, 50, 20))
        green_edges.append(GreenEdgeBlock(600, py - 500, 60, 20))
        green_edges.append(GreenEdgeBlock(1170, py - 460, 60, 20))
        green_edges.append(GreenEdgeBlock(2000, py - 320, 80, 20))

        # 金币
        coins.append(Coin(255, py - 380, coin_id=31))
        coins.append(Coin(630, py - 540, coin_id=32))

    elif level_index == 17:
        # 第18关：全元素综合
        platforms.append(_plat(100, py - 200, 80, 20))
        platforms.append(_plat(250, py - 350, 60, 20))
        platforms.append(_plat(400, py - 280, 80, 20))
        platforms.append(_plat(600, py - 420, 60, 20))
        platforms.append(_plat(800, py - 320, 80, 20))
        platforms.append(_plat(1000, py - 480, 60, 20))
        platforms.append(_plat(1200, py - 380, 80, 20))
        platforms.append(_plat(1400, py - 500, 60, 20))
        platforms.append(_plat(1600, py - 400, 80, 20))
        platforms.append(_plat(1800, py - 520, 80, 20))
        platforms.append(_plat(2000, py - 420, 100, 20))
        platforms.append(_plat(2250, py - 320, 100, 20))
        platforms.append(_plat(2500, py - 200, 250, ground_h))
        right_edge = 2750

        # 各种元素混合
        gray_blocks.append(GrayBlock(500, py - 280, 40, 40))
        spikes.append(Spike(900, py - 370, 20, 20, "moving", vx=2.0, move_range=100))
        collapsing.append(CollapsingPlatform(1300, py - 380, 60, 20))
        green_edges.append(GreenEdgeBlock(1650, py - 420, 70, 20))
        moving_blocks.append(MovingBlock(1900, py - 450, 60, 20, vx=-2.5, move_range_x=150))
        water_zones.append(WaterZone(2100, py - 300, 150, 80, "blue"))
        windmills.append(Windmill(1050, py - 400, blade_length=90, rotation_speed=2.0))

        # 金币
        coins.append(Coin(540, py - 330, coin_id=33))
        coins.append(Coin(1685, py - 460, coin_id=34))

    elif level_index == 18:
        # 第19关：地狱难度 - 大量追踪尖刺
        platforms.append(_plat(50, py - 180, 25, 20))
        platforms.append(_plat(150, py - 320, 25, 20))
        platforms.append(_plat(280, py - 450, 30, 20))
        platforms.append(_plat(420, py - 280, 25, 20))
        platforms.append(_plat(550, py - 520, 30, 20))
        platforms.append(_plat(700, py - 380, 25, 20))
        platforms.append(_plat(850, py - 200, 25, 20))
        platforms.append(_plat(950, py - 480, 30, 20))
        platforms.append(_plat(1100, py - 350, 30, 20))
        platforms.append(_plat(1250, py - 550, 40, 20))
        platforms.append(_plat(1420, py - 420, 35, 20))
        platforms.append(_plat(1600, py - 280, 40, 20))
        platforms.append(_plat(1780, py - 500, 50, 20))
        platforms.append(_plat(2000, py - 350, 60, 20))
        platforms.append(_plat(2200, py - 550, 70, 20))
        platforms.append(_plat(2450, py - 400, 80, 20))
        platforms.append(_plat(2700, py - 200, 300, ground_h))
        right_edge = 3000

        # 大量追踪尖刺
        spikes.append(Spike(350, py - 400, 25, 25, "chasing", chase_speed=3.0, chase_range=300))
        spikes.append(Spike(600, py - 350, 25, 25, "chasing", chase_speed=2.5, chase_range=250))
        spikes.append(Spike(1000, py - 450, 25, 25, "chasing", chase_speed=3.5, chase_range=350))

        # 金币
        coins.append(Coin(2975, py - 250, coin_id=35))

    else:
        # 第20关：终极试炼 - 所有元素
        platforms.append(_plat(80, py - 300, 80, 20))
        platforms.append(_plat(180, py - 500, 40, 20))
        platforms.append(_plat(300, py - 400, 60, 20))
        platforms.append(_plat(450, py - 550, 50, 20))
        platforms.append(_plat(600, py - 350, 40, 20))
        platforms.append(_plat(750, py - 580, 60, 20))
        platforms.append(_plat(900, py - 450, 40, 20))
        platforms.append(_plat(1050, py - 250, 30, 20))
        platforms.append(_plat(1200, py - 500, 50, 20))
        platforms.append(_plat(1380, py - 380, 40, 20))
        platforms.append(_plat(1550, py - 550, 60, 20))
        platforms.append(_plat(1750, py - 420, 80, 20))
        platforms.append(_plat(1980, py - 600, 80, 20))
        platforms.append(_plat(2200, py - 450, 80, 20))
        platforms.append(_plat(2400, py - 650, 100, 20))
        platforms.append(_plat(2650, py - 500, 100, 20))
        platforms.append(_plat(2900, py - 350, 150, 20))
        platforms.append(_plat(3200, py - 200, 350, ground_h))
        right_edge = 3550

        # 所有元素
        gray_blocks.append(GrayBlock(380, py - 400, 40, 40))
        gray_blocks.append(GrayBlock(650, py - 550, 40, 40))
        spikes.append(Spike(500, py - 420, 20, 20, "moving", vx=3.0, move_range=120))
        spikes.append(Spike(1100, py - 350, 25, 25, "chasing", chase_speed=4.0, chase_range=400))
        collapsing.append(CollapsingPlatform(800, py - 450, 50, 20))
        collapsing.append(CollapsingPlatform(1600, py - 420, 60, 20))
        green_edges.append(GreenEdgeBlock(1820, py - 440, 80, 20))
        moving_blocks.append(MovingBlock(1300, py - 450, 50, 20, vx=-3.0, move_range_x=180))
        moving_blocks.append(MovingBlock(2500, py - 550, 60, 20, vx=2.5, move_range_x=150))
        water_zones.append(WaterZone(1450, py - 350, 200, 80, "blue"))
        water_zones.append(WaterZone(2800, py - 400, 200, 100, "black"))
        windmills.append(Windmill(900, py - 400, blade_length=100, rotation_speed=2.5))
        windmills.append(Windmill(2100, py - 500, blade_length=120, rotation_speed=-2.0))

        # 金币(共5个)
        coins.append(Coin(420, py - 450, coin_id=36))
        coins.append(Coin(690, py - 600, coin_id=37))
        coins.append(Coin(1860, py - 480, coin_id=38))
        coins.append(Coin(2900, py - 250, coin_id=39))
        coins.append(Coin(3375, py - 250, coin_id=40))  # 终点前

    # 出口 / 传送门
    portal_next: pygame.Rect | None = None
    exit_rect: pygame.Rect | None = None
    if is_final:
        exit_rect = pygame.Rect(right_edge - 60, py - 150, 90, 150)
    else:
        portal_next = pygame.Rect(right_edge - 40, py - 140, 60, 140)

    world_width = max(SCREEN_W + 200, right_edge + 180)

    portal_prev = pygame.Rect(20, py - 140, 50, 140) if level_index > 0 else None

    name = f"第 {level_index + 1} 关" + (" — 出口" if is_final else "")

    # 出生点
    if level_index < 3:
        spawn_y = py - 350
    elif level_index < 7:
        spawn_y = py - 450
    elif level_index < 12:
        spawn_y = py - 500
    elif level_index < 17:
        spawn_y = py - 550
    else:
        spawn_y = py - 600

    return Level(
        name=name,
        platforms=platforms,
        portal_next=portal_next,
        portal_prev=portal_prev,
        spawn=(150.0, float(spawn_y)),
        world_width=world_width,
        exit_rect=exit_rect,
        gray_blocks=gray_blocks,
        spikes=spikes,
        coins=coins,
        collapsing_platforms=collapsing,
        green_edge_blocks=green_edges,
        moving_blocks=moving_blocks,
        water_zones=water_zones,
        windmills=windmills,
    )


def make_levels() -> List[Level]:
    return [build_level(i, NUM_LEVELS) for i in range(NUM_LEVELS)]


class Player:
    def __init__(self, x: float, y: float) -> None:
        self.x = x
        self.y = y
        self.vx = 0.0
        self.vy = 0.0
        self.on_ground = False
        self.shape = Shape.SQUARE

        # 新增属性
        self.crouching = False
        self.crouch_timer = 0.0
        self.dashing = False
        self.dash_timer = 0.0
        self.dash_cooldown = 0.0
        self.charging_jump = False
        self.charge_timer = 0.0
        self.can_double_jump = True
        self.double_jumped = False
        self.in_water = False
        self.water_type: Optional[str] = None
        self.on_green_edge = False

    def half_extents(self) -> Tuple[float, float]:
        w, h = shape_size(self.shape, self.crouching)
        return w * 0.5, h * 0.5

    def rect_at(self, cx: float, cy: float) -> RectF:
        w, h = shape_size(self.shape, self.crouching)
        return RectF(cx - w * 0.5, cy - h * 0.5, w, h)

    def draw(self, surf: pygame.Surface, cam_x: float) -> None:
        r = self.rect_at(self.x, self.y)
        px = r.x - cam_x
        py = r.y
        pr = pygame.Rect(int(px), int(py), int(r.w), int(r.h))
        if self.shape == Shape.SQUARE:
            pygame.draw.rect(surf, PLAYER_COLOR, pr)
        elif self.shape == Shape.CIRCLE:
            pygame.draw.ellipse(surf, PLAYER_COLOR, pr)
        elif self.shape == Shape.LINE:
            pygame.draw.rect(surf, PLAYER_COLOR, pr)
        elif self.shape == Shape.TRIANGLE:
            cx = px + r.w * 0.5
            cy = py + r.h * 0.5
            pts = [
                (cx, py + 2),
                (px + 2, py + r.h - 2),
                (px + r.w - 2, py + r.h - 2),
            ]
            pygame.draw.polygon(surf, PLAYER_COLOR, pts)

        # 蓄力特效
        if self.charging_jump:
            charge_ratio = min(self.charge_timer / 0.5, 1.0)
            radius = int(20 + charge_ratio * 20)
            alpha = int(100 + charge_ratio * 100)
            glow_surf = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
            pygame.draw.circle(glow_surf, (255, 200, 50, alpha), (radius, radius), radius)
            surf.blit(glow_surf, (int(px + r.w/2 - radius), int(py + r.h/2 - radius)))


class Game:
    def __init__(self) -> None:
        pygame.init()
        pygame.display.set_caption("方块跳跃增强版 — Python")
        self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("microsoftyahei", 18)
        self.font_small = pygame.font.SysFont("microsoftyahei", 15)
        self.font_large = pygame.font.SysFont("microsoftyahei", 36, bold=True)

        self.levels = make_levels()
        self.level_index = 0
        self.player = Player(*self.levels[0].spawn)
        self.cam_x = 0.0
        self.won = False

        # 金币系统
        self.collected_coins: set = set()
        self.total_coins = sum(len(l.coins) for l in self.levels)
        self.coins_collected_this_level: set = set()

        # 隐藏关卡
        self.hidden_unlocked = False
        self.showing_hidden_message = False
        self.hidden_message_timer = 0.0

        # 死亡和重生
        self.dead = False
        self.death_timer = 0.0

    def current_level(self) -> Level:
        return self.levels[self.level_index]

    @property
    def world_width(self) -> int:
        return self.current_level().world_width

    def get_all_platforms(self) -> List[pygame.Rect]:
        """获取所有可作为平台的矩形(包括各种元素)"""
        lv = self.current_level()
        platforms = list(lv.platforms)

        # 添加灰色方块
        for gb in lv.gray_blocks:
            if not gb.destroyed:
                platforms.append(gb.get_rect())

        # 添加绿色边缘方块
        for ge in lv.green_edge_blocks:
            platforms.append(ge.get_rect())

        # 添加移动方块
        for mb in lv.moving_blocks:
            platforms.append(mb.get_rect())

        # 添加风车叶片
        for wm in lv.windmills:
            for blade in wm.get_blade_rects():
                platforms.append(blade)

        # 添加未塌陷的平台
        for cp in lv.collapsing_platforms:
            rect = cp.get_rect()
            if rect.width > 0:
                platforms.append(rect)

        return platforms

    def collide_platforms(self, rect: pygame.Rect) -> bool:
        for p in self.get_all_platforms():
            if rect.colliderect(p):
                return True
        return False

    def check_spike_collision(self) -> bool:
        """检查是否碰到尖刺"""
        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        for spike in self.current_level().spikes:
            if body.colliderect(spike.get_rect()):
                return True
        return False

    def check_coin_collection(self) -> None:
        """检查金币收集"""
        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        for coin in self.current_level().coins:
            if not coin.collected and coin.coin_id not in self.collected_coins:
                if body.colliderect(coin.get_rect()):
                    coin.collected = True
                    self.collected_coins.add(coin.coin_id)
                    self.coins_collected_this_level.add(coin.coin_id)

                    # 检查是否解锁隐藏关卡
                    if len(self.collected_coins) >= COINS_FOR_HIDDEN and not self.hidden_unlocked:
                        self.hidden_unlocked = True
                        self.showing_hidden_message = True
                        self.hidden_message_timer = 3.0

    def check_water_collision(self) -> None:
        """检查水域碰撞"""
        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        self.player.in_water = False
        self.player.water_type = None

        for water in self.current_level().water_zones:
            if body.colliderect(water.get_rect()):
                self.player.in_water = True
                self.player.water_type = water.water_type
                break

    def check_green_edge_collision(self) -> None:
        """检查绿色边缘碰撞"""
        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        self.player.on_green_edge = False

        for ge in self.current_level().green_edge_blocks:
            if body.colliderect(ge.get_rect()):
                # 检查是否从上方落下
                if self.player.vy > 0:
                    feet_y = body.bottom
                    edge_top = ge.y
                    if abs(feet_y - edge_top) < 15:
                        self.player.on_green_edge = True
                        break

    def check_gray_block_collision(self) -> bool:
        """检查灰色方块碰撞，冲刺时可以撞掉"""
        if not self.player.dashing:
            return False

        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        for gb in self.current_level().gray_blocks:
            if not gb.destroyed and body.colliderect(gb.get_rect()):
                gb.destroyed = True
        return False

    def check_collapsing_platforms(self) -> Optional[CollapsingPlatform]:
        """检查当前站在哪个塌陷平台上"""
        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        for cp in self.current_level().collapsing_platforms:
            if not cp.regenerated:
                rect = cp.get_rect()
                if rect.width > 0 and body.colliderect(rect):
                    # 检查是否站在顶部
                    if body.bottom <= rect.centery + 10 and self.player.vy >= 0:
                        return cp
        return None

    def move_and_collide(self) -> None:
        """子步进碰撞，贴近 Scratch 的「步数」分解移动。"""
        if self.dead:
            return

        p = self.player
        lv = self.current_level()

        # 重力
        gravity = 1.0
        if p.in_water:
            if p.water_type == "blue":
                gravity = 0.3  # 减速水域重力减小
            elif p.water_type == "black":
                gravity = 1.5  # 加速水域重力增加

        p.vy += gravity
        p.vx *= 0.82

        # 水域影响
        if p.in_water:
            if p.water_type == "blue":
                p.vx *= 0.3  # 减速
            elif p.water_type == "black":
                p.vx *= 1.3  # 加速

        # 冲刺速度
        if p.dashing:
            p.vx *= 1.5

        steps = int(abs(p.vx) + abs(p.vy)) + 1
        steps = max(1, min(steps, 48))

        dx = p.vx / steps
        dy = p.vy / steps
        p.on_ground = False

        hw, hh = p.half_extents()

        # 检查塌陷平台
        current_collapsing = self.check_collapsing_platforms()

        for _ in range(steps):
            # 先竖直
            p.y += dy
            body = p.rect_at(p.x, p.y).to_pygame()
            hit = False
            for plat in self.get_all_platforms():
                if body.colliderect(plat):
                    hit = True
                    if dy > 0:
                        p.y = plat.top - hh - 0.01
                        p.vy = 0.0
                        p.on_ground = True
                        p.double_jumped = False  # 重置连跳
                        p.can_double_jump = True
                    elif dy < 0:
                        p.y = plat.bottom + hh + 0.01
                        p.vy = 0.0
                    break
            if hit:
                body = p.rect_at(p.x, p.y).to_pygame()

            # 再水平
            p.x += dx
            body = p.rect_at(p.x, p.y).to_pygame()
            for plat in self.get_all_platforms():
                if body.colliderect(plat):
                    if dx > 0:
                        p.x = plat.left - hw - 0.01
                    elif dx < 0:
                        p.x = plat.right + hw + 0.01
                    p.vx = 0.0
                    break

        # 更新塌陷平台
        for cp in lv.collapsing_platforms:
            player_on = (current_collapsing == cp)
            cp.update(1/FPS, player_on)

        # 世界边界
        p.x = max(hw + 20, min(self.world_width - hw - 20, p.x))

        # 检查是否掉出世界或塌陷下去
        if p.y > SCREEN_H + 100:
            # 检查是否是被塌陷平台盖住
            for cp in lv.collapsing_platforms:
                if cp.collapsed and not cp.regenerated:
                    if abs(p.x - (cp.x + cp.w/2)) < cp.w:
                        self.dead = True
                        self.death_timer = 0.5
                        return
            self.respawn()

    def respawn(self) -> None:
        sp = self.current_level().spawn
        self.player.x, self.player.y = sp[0], sp[1]
        self.player.vx = self.player.vy = 0.0
        self.player.crouching = False
        self.player.dashing = False
        self.player.charging_jump = False
        self.player.double_jumped = False
        self.dead = False

        # 重置本关塌陷平台
        for cp in self.current_level().collapsing_platforms:
            if cp.collapsed:
                cp.regenerated = True

    def check_portals(self) -> None:
        if self.won or self.dead:
            return
        lv = self.current_level()
        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        if lv.portal_next and body.colliderect(lv.portal_next) and self.level_index < len(self.levels) - 1:
            self.level_index += 1
            self.coins_collected_this_level.clear()
            self.respawn()
        if lv.portal_prev and body.colliderect(lv.portal_prev) and self.level_index > 0:
            self.level_index -= 1
            self.coins_collected_this_level.clear()
            self.respawn()

    def check_exit(self) -> None:
        if self.won or self.dead:
            return
        lv = self.current_level()
        if lv.exit_rect is None:
            return
        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        if body.colliderect(lv.exit_rect):
            self.won = True

    def restart_full_game(self) -> None:
        self.won = False
        self.level_index = 0
        self.player = Player(*self.levels[0].spawn)
        self.cam_x = 0.0
        self.collected_coins.clear()
        self.coins_collected_this_level.clear()
        self.hidden_unlocked = False
        self.dead = False

    def handle_input(self) -> None:
        if self.won or self.dead:
            return

        keys = pygame.key.get_pressed()
        p = self.player

        # 基础加速度
        acc = 2.1
        if p.in_water and p.water_type == "blue":
            acc = 0.8  # 减速水域
        elif p.in_water and p.water_type == "black":
            acc = 3.0  # 加速水域

        # 移动
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            p.vx -= acc
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            p.vx += acc

        # 下蹲
        if keys[pygame.K_s] or keys[pygame.K_DOWN]:
            if not p.charging_jump:
                p.crouching = True
                p.crouch_timer += 1/FPS
        else:
            p.crouching = False
            p.crouch_timer = 0.0

        # 冲刺 (Shift + 方向)
        if keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]:
            if (keys[pygame.K_LEFT] or keys[pygame.K_a] or
                keys[pygame.K_RIGHT] or keys[pygame.K_d]):
                if p.dash_cooldown <= 0 and not p.dashing:
                    p.dashing = True
                    p.dash_timer = 0.3  # 冲刺持续时间
                    p.dash_cooldown = 1.0  # 冷却时间
                    # 冲刺速度
                    if keys[pygame.K_LEFT] or keys[pygame.K_a]:
                        p.vx = -15.0
                    else:
                        p.vx = 15.0

        # 蓄力弹跳 (Shift + 上)
        if (keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]) and \
           (keys[pygame.K_w] or keys[pygame.K_UP]):
            if p.on_ground and not p.charging_jump:
                p.charging_jump = True
                p.charge_timer = 0.0
                p.crouching = True  # 蓄力时先蹲下
        elif p.charging_jump:
            # 释放蓄力跳
            charge_ratio = min(p.charge_timer / 0.5, 1.0)
            base_jump = 13.5
            jump_power = base_jump * (1 + charge_ratio * 9)  # 最高10倍
            p.vy = -jump_power
            p.on_ground = False
            p.charging_jump = False
            p.charge_timer = 0.0
            p.crouching = False

        # 普通跳跃
        if (keys[pygame.K_w] or keys[pygame.K_UP] or keys[pygame.K_SPACE]) and p.on_ground:
            if not p.charging_jump:
                p.vy = -13.5
                p.on_ground = False

        # 空中连跳 (在绿色边缘或普通空中一次)
        jump_pressed = keys[pygame.K_w] or keys[pygame.K_UP] or keys[pygame.K_SPACE]
        if jump_pressed and not p.on_ground and not p.double_jumped:
            if p.on_green_edge or p.can_double_jump:
                p.vy = -13.5
                p.double_jumped = True
                p.can_double_jump = False

    def update_player_states(self, dt: float) -> None:
        """更新玩家状态"""
        p = self.player

        # 冲刺计时
        if p.dashing:
            p.dash_timer -= dt
            if p.dash_timer <= 0:
                p.dashing = False
        if p.dash_cooldown > 0:
            p.dash_cooldown -= dt

        # 蓄力计时
        if p.charging_jump:
            p.charge_timer += dt
            if p.charge_timer > 1.0:  # 最大蓄力时间
                p.charge_timer = 1.0

    def cycle_shape(self) -> None:
        order = [Shape.SQUARE, Shape.CIRCLE, Shape.LINE, Shape.TRIANGLE]
        i = order.index(self.player.shape)
        self.player.shape = order[(i + 1) % len(order)]

    def update_camera(self) -> None:
        target = self.player.x - SCREEN_W * 0.45
        self.cam_x += (target - self.cam_x) * 0.12
        self.cam_x = max(0.0, min(self.world_width - SCREEN_W, self.cam_x))

    def update_level_elements(self, dt: float) -> None:
        """更新关卡元素"""
        lv = self.current_level()

        # 更新尖刺
        for spike in lv.spikes:
            spike.update(self.player.x, self.player.y)

        # 更新移动方块
        for mb in lv.moving_blocks:
            mb.update()

        # 更新风车
        for wm in lv.windmills:
            wm.update()

        # 更新灰色方块
        for gb in lv.gray_blocks:
            gb.update(dt)

    def draw_level(self) -> None:
        surf = self.screen
        cx = self.cam_x
        surf.fill(COLOR_BG)

        lv = self.current_level()

        # 绘制水域(在最底层)
        for water in lv.water_zones:
            r = pygame.Rect(water.x - cx, water.y, water.w, water.h)
            if water.water_type == "blue":
                pygame.draw.rect(surf, COLOR_WATER_BLUE, r)
            else:
                pygame.draw.rect(surf, COLOR_WATER_BLACK, r)
            # 水面波纹效果
            for i in range(0, water.w, 20):
                y_offset = int(math.sin((i + pygame.time.get_ticks() / 10) / 30) * 3)
                pygame.draw.line(surf, (255, 255, 255, 100),
                               (water.x - cx + i, water.y + 5 + y_offset),
                               (water.x - cx + i + 10, water.y + 5 + y_offset), 2)

        # 绘制塌陷平台
        for cp in lv.collapsing_platforms:
            if not cp.regenerated:
                rect = cp.get_rect()
                if rect.width > 0:
                    r = pygame.Rect(rect.x - cx, rect.y, rect.w, rect.h)
                    if cp.collapsed:
                        # 塌陷时变暗
                        alpha = max(0, 255 - int(cp.disappear_timer / cp.disappear_delay * 255))
                        color = (200 - alpha//3, 120 - alpha//3, 80 - alpha//3)
                        pygame.draw.rect(surf, color, r)
                    else:
                        pygame.draw.rect(surf, COLOR_COLLAPSING, r)
                        pygame.draw.rect(surf, (150, 80, 50), r, 2)

        # 绘制普通平台
        for plat in lv.platforms:
            r = pygame.Rect(plat.x - cx, plat.y, plat.w, plat.h)
            pygame.draw.rect(surf, COLOR_PLATFORM, r)
            pygame.draw.rect(surf, (220, 130, 0), r, 2)

        # 绘制灰色方块
        for gb in lv.gray_blocks:
            if not gb.destroyed or gb.destroy_timer < gb.disappear_delay:
                rect = gb.get_rect()
                if rect.width > 0:
                    r = pygame.Rect(rect.x - cx, rect.y, rect.w, rect.h)
                    alpha = 255
                    if gb.destroyed:
                        alpha = max(0, 255 - int(gb.destroy_timer / gb.disappear_delay * 255))
                    color = (COLOR_GRAY_BLOCK[0] * alpha // 255,
                            COLOR_GRAY_BLOCK[1] * alpha // 255,
                            COLOR_GRAY_BLOCK[2] * alpha // 255)
                    pygame.draw.rect(surf, color, r)
                    pygame.draw.rect(surf, (100, 100, 100), r, 2)

        # 绘制绿色边缘方块
        for ge in lv.green_edge_blocks:
            r = pygame.Rect(ge.x - cx, ge.y, ge.w, ge.h)
            pygame.draw.rect(surf, COLOR_GREEN_EDGE, r)
            pygame.draw.rect(surf, (30, 200, 60), r, 2)
            # 边缘高光
            pygame.draw.line(surf, (150, 255, 180),
                           (ge.x - cx + 2, ge.y + 2),
                           (ge.x - cx + ge.w - 2, ge.y + 2), 3)

        # 绘制移动方块
        for mb in lv.moving_blocks:
            r = pygame.Rect(mb.x - cx, mb.y, mb.w, mb.h)
            pygame.draw.rect(surf, COLOR_MOVING_BLOCK, r)
            pygame.draw.rect(surf, (120, 60, 200), r, 2)
            # 方向箭头
            cx_mb = mb.x - cx + mb.w/2
            cy_mb = mb.y + mb.h/2
            if mb.vx > 0:
                pygame.draw.polygon(surf, (255, 255, 255),
                                  [(cx_mb + 5, cy_mb), (cx_mb - 5, cy_mb - 4), (cx_mb - 5, cy_mb + 4)])
            elif mb.vx < 0:
                pygame.draw.polygon(surf, (255, 255, 255),
                                  [(cx_mb - 5, cy_mb), (cx_mb + 5, cy_mb - 4), (cx_mb + 5, cy_mb + 4)])

        # 绘制风车
        for wm in lv.windmills:
            # 绘制旋转的叶片
            blades = wm.get_blade_rects()
            for i, blade in enumerate(blades):
                r = pygame.Rect(blade.x - cx, blade.y, blade.w, blade.h)
                color = (COLOR_WINDMILL[0] + i * 30, COLOR_WINDMILL[1], COLOR_WINDMILL[2])
                pygame.draw.rect(surf, color, r)
                pygame.draw.rect(surf, (60, 150, 60), r, 2)
            # 中心轴
            pygame.draw.circle(surf, (80, 180, 80),
                             (int(wm.cx - cx), int(wm.cy)), 15)

        # 绘制金币
        for coin in lv.coins:
            if not coin.collected and coin.coin_id not in self.collected_coins:
                cx_coin = int(coin.x - cx)
                cy_coin = int(coin.y)
                # 金币闪烁效果
                pulse = math.sin(pygame.time.get_ticks() / 200) * 2
                pygame.draw.circle(surf, COLOR_COIN,
                                 (cx_coin, cy_coin), int(coin.radius + pulse))
                pygame.draw.circle(surf, (255, 180, 0),
                                 (cx_coin, cy_coin), int(coin.radius + pulse), 2)
                # $符号
                txt = self.font_small.render("$", True, (100, 80, 0))
                tr = txt.get_rect(center=(cx_coin, cy_coin))
                surf.blit(txt, tr)

        # 绘制尖刺
        for spike in lv.spikes:
            r = spike.get_rect()
            rx = pygame.Rect(r.x - cx, r.y, r.w, r.h)
            # 尖刺三角形
            pts = [
                (rx.x + rx.w//2, rx.y),
                (rx.x, rx.y + rx.h),
                (rx.x + rx.w, rx.y + rx.h),
            ]
            pygame.draw.polygon(surf, COLOR_SPIKE, pts)
            pygame.draw.polygon(surf, (200, 30, 30), pts, 2)

        # 绘制传送门
        if lv.portal_next:
            r = pygame.Rect(lv.portal_next.x - cx, lv.portal_next.y, lv.portal_next.w, lv.portal_next.h)
            pygame.draw.rect(surf, COLOR_PORTAL_NEXT, r)
            t = self.font_small.render("下一关", True, (0, 60, 80))
            surf.blit(t, (r.x + 2, r.y + 40))
        if lv.portal_prev:
            r = pygame.Rect(lv.portal_prev.x - cx, lv.portal_prev.y, lv.portal_prev.w, lv.portal_prev.h)
            pygame.draw.rect(surf, COLOR_PORTAL_PREV, r)
            t = self.font_small.render("返回", True, (0, 60, 80))
            surf.blit(t, (r.x + 5, r.y + 40))

        # 绘制出口
        if lv.exit_rect:
            r = pygame.Rect(lv.exit_rect.x - cx, lv.exit_rect.y, lv.exit_rect.w, lv.exit_rect.h)
            pygame.draw.rect(surf, COLOR_EXIT, r)
            pygame.draw.rect(surf, COLOR_EXIT_BORDER, r, 3)
            t1 = self.font.render("出口", True, (20, 90, 50))
            t2 = self.font_small.render("走进这里通关", True, (15, 70, 40))
            surf.blit(t1, (r.x + 12, r.y + 28))
            surf.blit(t2, (r.x + 4, r.y + 62))

        # 绘制玩家
        self.player.draw(surf, cx)

        # 绘制UI
        prog = f"{self.level_index + 1} / {len(self.levels)}"
        title = self.font.render(f"{lv.name}  ({prog})", True, COLOR_TEXT)
        surf.blit(title, (12, 10))

        # 金币计数
        coin_text = f"金币: {len(self.collected_coins)} / {self.total_coins}"
        if self.hidden_unlocked:
            coin_text += " (隐藏关卡已解锁!)"
        coin_color = (255, 180, 0) if self.hidden_unlocked else COLOR_TEXT
        ct = self.font.render(coin_text, True, coin_color)
        surf.blit(ct, (12, 32))

        # 本关金币进度
        level_coins = sum(1 for c in lv.coins if c.coin_id in self.collected_coins)
        level_total = len(lv.coins)
        if level_total > 0:
            lt = self.font_small.render(f"本关: {level_coins}/{level_total}", True, (150, 150, 150))
            surf.blit(lt, (12, 54))

        # 操作提示
        hint = self.font_small.render(
            "←→移动 S下蹲 Shift+方向=冲刺 Shift+上=蓄力跳 空格=跳跃/连跳"
            + ("  Enter通关后再玩" if self.won else "  I随机换图 R复活"),
            True, (100, 105, 115),
        )
        surf.blit(hint, (12, SCREEN_H - 50))

        shape_names = {"SQUARE": "方形", "CIRCLE": "圆形", "LINE": "短线", "TRIANGLE": "三角"}
        st = self.font_small.render(f"造型: {shape_names[self.player.shape.name]}", True, COLOR_TEXT)
        surf.blit(st, (12, SCREEN_H - 28))

        # 状态提示
        status = []
        if self.player.crouching:
            status.append("下蹲")
        if self.player.dashing:
            status.append("冲刺")
        if self.player.charging_jump:
            status.append(f"蓄力{int(self.player.charge_timer * 100)}%")
        if self.player.in_water:
            status.append("水域")
        if self.player.on_green_edge:
            status.append("无限跳")
        if status:
            status_text = " | ".join(status)
            st = self.font_small.render(status_text, True, (0, 150, 200))
            surf.blit(st, (SCREEN_W - 200, SCREEN_H - 28))

        # 隐藏关卡解锁提示
        if self.showing_hidden_message and self.hidden_message_timer > 0:
            msg = self.font_large.render("隐藏关卡已解锁!", True, (255, 200, 50))
            mr = msg.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 - 50))
            # 发光背景
            glow = pygame.Surface((mr.width + 40, mr.height + 20), pygame.SRCALPHA)
            pygame.draw.rect(glow, (0, 0, 0, 150), glow.get_rect(), border_radius=10)
            surf.blit(glow, (mr.x - 20, mr.y - 10))
            surf.blit(msg, mr)

        # 通关画面
        if self.won:
            ov = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
            ov.fill((255, 255, 255, 160))
            surf.blit(ov, (0, 0))
            big = pygame.font.SysFont("microsoftyahei", 42, bold=True)
            msg = big.render("通关！", True, (25, 120, 65))
            mr = msg.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 - 28))
            surf.blit(msg, mr)
            sub = self.font.render("Enter 再玩一局    Esc 退出", True, COLOR_TEXT)
            sr = sub.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2 + 28))
            surf.blit(sub, sr)

        # 死亡画面
        if self.dead:
            ov = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
            ov.fill((255, 0, 0, 80))
            surf.blit(ov, (0, 0))
            msg = self.font_large.render("被压住了!", True, (255, 50, 50))
            mr = msg.get_rect(center=(SCREEN_W // 2, SCREEN_H // 2))
            surf.blit(msg, mr)

    def run(self) -> None:
        while True:
            dt = 1 / FPS

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit(0)
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        pygame.quit()
                        sys.exit(0)
                    if self.won and event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                        self.restart_full_game()
                    if event.key == pygame.K_TAB and not self.won and not self.dead:
                        self.cycle_shape()
                    if event.key == pygame.K_r and not self.won:
                        self.respawn()
                    if event.key == pygame.K_i and not self.won:
                        # 随机切换地图
                        old_index = self.level_index
                        while True:
                            new_index = random.randint(0, len(self.levels) - 1)
                            if new_index != old_index:
                                self.level_index = new_index
                                break
                        self.coins_collected_this_level.clear()
                        self.respawn()

            if not self.won:
                if self.dead:
                    self.death_timer -= dt
                    if self.death_timer <= 0:
                        self.respawn()
                else:
                    self.handle_input()
                    self.update_player_states(dt)
                    self.check_gray_block_collision()
                    self.move_and_collide()

                    # 检查各种碰撞
                    if self.check_spike_collision():
                        self.dead = True
                        self.death_timer = 0.5

                    self.check_coin_collection()
                    self.check_water_collision()
                    self.check_green_edge_collision()
                    self.check_portals()
                    self.check_exit()

                self.update_level_elements(dt)

            # 更新隐藏关卡提示计时
            if self.showing_hidden_message:
                self.hidden_message_timer -= dt
                if self.hidden_message_timer <= 0:
                    self.showing_hidden_message = False

            self.update_camera()
            self.draw_level()
            pygame.display.flip()
            self.clock.tick(FPS)


def main() -> None:
    Game().run()


if __name__ == "__main__":
    main()
