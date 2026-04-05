"""
方块跳跃 — 参考 Scratch「跳跃1」：物理、造型切换、多关卡与传送。
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from enum import Enum, auto
from typing import List, Tuple

import pygame

# 与参考工程一致的主题色
COLOR_PLATFORM = (255, 160, 0)  # #ffa000
COLOR_PORTAL_NEXT = (43, 234, 255)  # #2beaff
COLOR_PORTAL_PREV = (52, 235, 255)  # #34ebff
COLOR_EXIT = (46, 204, 113)  # 出口高亮
COLOR_EXIT_BORDER = (25, 140, 80)
COLOR_BG = (245, 248, 252)
COLOR_TEXT = (30, 35, 45)

SCREEN_W, SCREEN_H = 960, 540
FPS = 60
PLAYER_COLOR = (20, 22, 28)


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


def shape_size(shape: Shape) -> Tuple[float, float]:
    """各造型包围盒（宽, 高）— 短线更扁，可穿过较矮通道。"""
    if shape == Shape.SQUARE:
        return 26.0, 26.0
    if shape == Shape.CIRCLE:
        return 24.0, 24.0
    if shape == Shape.LINE:
        return 36.0, 9.0
    return 28.0, 26.0


@dataclass
class Level:
    name: str
    platforms: List[pygame.Rect]
    portal_next: pygame.Rect | None
    portal_prev: pygame.Rect | None
    spawn: Tuple[float, float]
    world_width: int = SCREEN_W + 400
    """最后一关到达此处即通关；与 portal_next 二选一（最后一关无 portal_next）。"""
    exit_rect: pygame.Rect | None = None


NUM_LEVELS = 20


def _plat(x: int, y: int, w: int, h: int) -> pygame.Rect:
    return pygame.Rect(x, y, w, h)


def build_level(level_index: int, total: int) -> Level:
    """
    构建复杂关卡：多层平台、阶梯、垂直挑战。
    初始位置在左边中间高处，玩家自然下落。
    """
    ground_h = 40
    py = SCREEN_H - ground_h
    is_final = level_index == total - 1

    platforms: List[pygame.Rect] = []

    # 基础地面（起始区域）
    platforms.append(_plat(-100, py, 200, ground_h))

    # 根据关卡索引生成不同复杂度的地图
    if level_index == 0:
        # 第1关：简单的双层平台，引导玩家下落
        # 起始平台在最左侧
        platforms.append(_plat(100, py - 150, 150, 20))  # 起始高处平台
        platforms.append(_plat(280, py - 100, 120, 20))   # 下降台阶
        platforms.append(_plat(450, py - 180, 100, 20))   # 更高平台
        platforms.append(_plat(600, py - 120, 150, 20))   # 中间平台
        platforms.append(_plat(800, py - 200, 100, 20))   # 高层小平台
        platforms.append(_plat(950, py - 80, 200, ground_h))  # 终点地面
        right_edge = 1150

    elif level_index == 1:
        # 第2关：阶梯式上升
        platforms.append(_plat(120, py - 200, 100, 20))
        platforms.append(_plat(280, py - 280, 80, 20))
        platforms.append(_plat(420, py - 200, 100, 20))
        platforms.append(_plat(580, py - 320, 80, 20))
        platforms.append(_plat(720, py - 240, 100, 20))
        platforms.append(_plat(880, py - 360, 80, 20))
        platforms.append(_plat(1050, py - 150, 150, 20))
        platforms.append(_plat(1250, py - 80, 200, ground_h))
        right_edge = 1450

    elif level_index == 2:
        # 第3关：垂直迷宫
        platforms.append(_plat(100, py - 180, 80, 20))
        platforms.append(_plat(250, py - 280, 80, 20))
        platforms.append(_plat(400, py - 150, 60, 20))
        platforms.append(_plat(520, py - 350, 80, 20))
        platforms.append(_plat(680, py - 220, 60, 20))
        platforms.append(_plat(820, py - 400, 100, 20))
        platforms.append(_plat(1000, py - 300, 80, 20))
        platforms.append(_plat(1150, py - 200, 100, 20))
        platforms.append(_plat(1350, py - 80, 200, ground_h))
        right_edge = 1550

    elif level_index == 3:
        # 第4关：多层通道
        platforms.append(_plat(100, py - 120, 200, 20))
        platforms.append(_plat(350, py - 250, 100, 20))
        platforms.append(_plat(500, py - 180, 60, 20))
        platforms.append(_plat(650, py - 320, 120, 20))
        platforms.append(_plat(480, py - 400, 100, 20))  # 上层返回
        platforms.append(_plat(300, py - 320, 80, 20))   # 上层
        platforms.append(_plat(850, py - 200, 80, 20))
        platforms.append(_plat(1000, py - 350, 100, 20))
        platforms.append(_plat(1200, py - 150, 150, 20))
        platforms.append(_plat(1450, py - 80, 250, ground_h))
        right_edge = 1700

    elif level_index == 4:
        # 第5关：狭窄通道挑战
        platforms.append(_plat(80, py - 160, 60, 20))
        platforms.append(_plat(200, py - 100, 40, 20))
        platforms.append(_plat(300, py - 220, 50, 20))
        platforms.append(_plat(400, py - 180, 30, 20))
        platforms.append(_plat(500, py - 300, 60, 20))
        platforms.append(_plat(630, py - 240, 40, 20))
        platforms.append(_plat(750, py - 380, 80, 20))
        platforms.append(_plat(900, py - 300, 50, 20))
        platforms.append(_plat(1050, py - 200, 60, 20))
        platforms.append(_plat(1200, py - 280, 100, 20))
        platforms.append(_plat(1400, py - 150, 120, 20))
        platforms.append(_plat(1600, py - 80, 200, ground_h))
        right_edge = 1800

    elif level_index == 5:
        # 第6关：长距离跳跃
        platforms.append(_plat(100, py - 200, 100, 20))
        platforms.append(_plat(350, py - 250, 80, 20))
        platforms.append(_plat(600, py - 300, 80, 20))
        platforms.append(_plat(850, py - 200, 60, 20))
        platforms.append(_plat(1100, py - 350, 100, 20))
        platforms.append(_plat(1350, py - 250, 80, 20))
        platforms.append(_plat(1550, py - 150, 100, 20))
        platforms.append(_plat(1750, py - 280, 120, 20))
        platforms.append(_plat(2000, py - 80, 250, ground_h))
        right_edge = 2250

    elif level_index == 6:
        # 第7关：上下穿梭
        platforms.append(_plat(100, py - 300, 120, 20))
        platforms.append(_plat(300, py - 150, 80, 20))
        platforms.append(_plat(450, py - 400, 100, 20))
        platforms.append(_plat(600, py - 200, 60, 20))
        platforms.append(_plat(750, py - 350, 80, 20))
        platforms.append(_plat(550, py - 100, 100, 20))  # 下降
        platforms.append(_plat(900, py - 250, 60, 20))
        platforms.append(_plat(1100, py - 400, 120, 20))
        platforms.append(_plat(1300, py - 200, 80, 20))
        platforms.append(_plat(1500, py - 320, 100, 20))
        platforms.append(_plat(1700, py - 80, 300, ground_h))
        right_edge = 2000

    elif level_index == 7:
        # 第8关：复杂立体结构
        platforms.append(_plat(80, py - 250, 100, 20))
        platforms.append(_plat(250, py - 150, 60, 20))
        platforms.append(_plat(380, py - 350, 80, 20))
        platforms.append(_plat(520, py - 200, 100, 20))
        platforms.append(_plat(320, py - 450, 120, 20))   # 高层
        platforms.append(_plat(550, py - 400, 60, 20))
        platforms.append(_plat(700, py - 300, 80, 20))
        platforms.append(_plat(880, py - 450, 100, 20))
        platforms.append(_plat(1100, py - 350, 80, 20))
        platforms.append(_plat(1300, py - 250, 100, 20))
        platforms.append(_plat(1500, py - 400, 120, 20))
        platforms.append(_plat(1700, py - 200, 150, 20))
        platforms.append(_plat(1950, py - 80, 300, ground_h))
        right_edge = 2250

    elif level_index == 8:
        # 第9关：极难挑战
        platforms.append(_plat(60, py - 200, 50, 20))
        platforms.append(_plat(180, py - 350, 60, 20))
        platforms.append(_plat(320, py - 280, 40, 20))
        platforms.append(_plat(450, py - 400, 70, 20))
        platforms.append(_plat(600, py - 180, 50, 20))
        platforms.append(_plat(720, py - 320, 60, 20))
        platforms.append(_plat(860, py - 250, 40, 20))
        platforms.append(_plat(1000, py - 420, 80, 20))
        platforms.append(_plat(1150, py - 300, 50, 20))
        platforms.append(_plat(1300, py - 450, 100, 20))
        platforms.append(_plat(1500, py - 350, 60, 20))
        platforms.append(_plat(1680, py - 200, 80, 20))
        platforms.append(_plat(1850, py - 320, 100, 20))
        platforms.append(_plat(2050, py - 150, 120, 20))
        platforms.append(_plat(2250, py - 80, 300, ground_h))
        right_edge = 2550

    elif level_index == 9:
        # 第10关：螺旋上升
        platforms.append(_plat(100, py - 250, 100, 20))
        platforms.append(_plat(250, py - 350, 80, 20))
        platforms.append(_plat(400, py - 420, 100, 20))
        platforms.append(_plat(580, py - 350, 80, 20))
        platforms.append(_plat(720, py - 280, 100, 20))
        platforms.append(_plat(600, py - 180, 80, 20))   # 内圈回落
        platforms.append(_plat(450, py - 120, 100, 20))
        platforms.append(_plat(850, py - 400, 120, 20))
        platforms.append(_plat(1050, py - 480, 100, 20))
        platforms.append(_plat(1250, py - 400, 80, 20))
        platforms.append(_plat(1450, py - 300, 100, 20))
        platforms.append(_plat(1680, py - 380, 120, 20))
        platforms.append(_plat(1900, py - 250, 150, 20))
        platforms.append(_plat(2150, py - 450, 200, 20))
        platforms.append(_plat(2450, py - 200, 200, 20))
        platforms.append(_plat(2700, py - 80, 300, ground_h))
        right_edge = 3000

    elif level_index == 10:
        # 第11关：回字形迷宫
        platforms.append(_plat(100, py - 200, 80, 20))
        platforms.append(_plat(250, py - 320, 100, 20))
        platforms.append(_plat(420, py - 400, 80, 20))
        platforms.append(_plat(580, py - 320, 100, 20))
        platforms.append(_plat(720, py - 200, 80, 20))
        platforms.append(_plat(580, py - 150, 80, 20))   # 下层回绕
        platforms.append(_plat(400, py - 100, 100, 20))
        platforms.append(_plat(850, py - 450, 120, 20))
        platforms.append(_plat(1050, py - 350, 80, 20))
        platforms.append(_plat(1220, py - 450, 100, 20))
        platforms.append(_plat(1400, py - 280, 80, 20))
        platforms.append(_plat(1580, py - 400, 100, 20))
        platforms.append(_plat(1780, py - 250, 120, 20))
        platforms.append(_plat(2000, py - 500, 150, 20))
        platforms.append(_plat(2250, py - 350, 100, 20))
        platforms.append(_plat(2450, py - 180, 150, 20))
        platforms.append(_plat(2700, py - 80, 300, ground_h))
        right_edge = 3000

    elif level_index == 11:
        # 第12关：连续跳跃挑战
        platforms.append(_plat(80, py - 180, 40, 20))
        platforms.append(_plat(180, py - 280, 40, 20))
        platforms.append(_plat(280, py - 380, 40, 20))
        platforms.append(_plat(380, py - 320, 40, 20))
        platforms.append(_plat(480, py - 420, 40, 20))
        platforms.append(_plat(580, py - 350, 40, 20))
        platforms.append(_plat(680, py - 250, 40, 20))
        platforms.append(_plat(780, py - 450, 40, 20))
        platforms.append(_plat(880, py - 380, 40, 20))
        platforms.append(_plat(980, py - 480, 40, 20))
        platforms.append(_plat(1100, py - 320, 60, 20))
        platforms.append(_plat(1250, py - 420, 50, 20))
        platforms.append(_plat(1400, py - 280, 80, 20))
        platforms.append(_plat(1580, py - 450, 60, 20))
        platforms.append(_plat(1750, py - 350, 100, 20))
        platforms.append(_plat(1950, py - 480, 120, 20))
        platforms.append(_plat(2150, py - 200, 150, 20))
        platforms.append(_plat(2400, py - 80, 300, ground_h))
        right_edge = 2700

    elif level_index == 12:
        # 第13关：高塔攀登
        platforms.append(_plat(100, py - 200, 100, 20))
        platforms.append(_plat(120, py - 350, 60, 20))
        platforms.append(_plat(140, py - 500, 40, 20))
        platforms.append(_plat(300, py - 450, 80, 20))
        platforms.append(_plat(320, py - 300, 60, 20))
        platforms.append(_plat(500, py - 550, 100, 20))
        platforms.append(_plat(520, py - 400, 60, 20))
        platforms.append(_plat(700, py - 480, 80, 20))
        platforms.append(_plat(880, py - 520, 100, 20))
        platforms.append(_plat(900, py - 380, 60, 20))
        platforms.append(_plat(920, py - 250, 40, 20))
        platforms.append(_plat(1100, py - 450, 120, 20))
        platforms.append(_plat(1300, py - 550, 150, 20))
        platforms.append(_plat(1550, py - 400, 100, 20))
        platforms.append(_plat(1750, py - 500, 120, 20))
        platforms.append(_plat(1950, py - 300, 150, 20))
        platforms.append(_plat(2200, py - 450, 200, 20))
        platforms.append(_plat(2500, py - 200, 250, ground_h))
        right_edge = 2750

    elif level_index == 13:
        # 第14关：波浪式前进
        platforms.append(_plat(100, py - 200, 80, 20))
        platforms.append(_plat(250, py - 300, 80, 20))
        platforms.append(_plat(400, py - 200, 80, 20))
        platforms.append(_plat(550, py - 350, 80, 20))
        platforms.append(_plat(700, py - 250, 80, 20))
        platforms.append(_plat(850, py - 400, 80, 20))
        platforms.append(_plat(1000, py - 300, 80, 20))
        platforms.append(_plat(1150, py - 450, 80, 20))
        platforms.append(_plat(1300, py - 350, 80, 20))
        platforms.append(_plat(1450, py - 500, 80, 20))
        platforms.append(_plat(1600, py - 400, 80, 20))
        platforms.append(_plat(1750, py - 320, 80, 20))
        platforms.append(_plat(1900, py - 480, 100, 20))
        platforms.append(_plat(2100, py - 380, 100, 20))
        platforms.append(_plat(2300, py - 280, 100, 20))
        platforms.append(_plat(2500, py - 450, 120, 20))
        platforms.append(_plat(2750, py - 250, 150, 20))
        platforms.append(_plat(3000, py - 80, 300, ground_h))
        right_edge = 3300

    elif level_index == 14:
        # 第15关：交错陷阱
        platforms.append(_plat(100, py - 250, 50, 20))
        platforms.append(_plat(200, py - 150, 50, 20))
        platforms.append(_plat(300, py - 350, 50, 20))
        platforms.append(_plat(400, py - 200, 50, 20))
        platforms.append(_plat(500, py - 400, 50, 20))
        platforms.append(_plat(600, py - 280, 50, 20))
        platforms.append(_plat(700, py - 450, 50, 20))
        platforms.append(_plat(800, py - 320, 50, 20))
        platforms.append(_plat(900, py - 500, 50, 20))
        platforms.append(_plat(1050, py - 380, 80, 20))
        platforms.append(_plat(1200, py - 220, 60, 20))
        platforms.append(_plat(1350, py - 480, 100, 20))
        platforms.append(_plat(1550, py - 300, 80, 20))
        platforms.append(_plat(1750, py - 450, 100, 20))
        platforms.append(_plat(1950, py - 180, 120, 20))
        platforms.append(_plat(2150, py - 520, 150, 20))
        platforms.append(_plat(2400, py - 350, 100, 20))
        platforms.append(_plat(2600, py - 80, 300, ground_h))
        right_edge = 2900

    elif level_index == 15:
        # 第16关：悬崖边缘
        platforms.append(_plat(60, py - 300, 80, 20))
        platforms.append(_plat(200, py - 420, 60, 20))
        platforms.append(_plat(350, py - 200, 40, 20))
        platforms.append(_plat(450, py - 480, 50, 20))
        platforms.append(_plat(600, py - 250, 40, 20))
        platforms.append(_plat(700, py - 520, 60, 20))
        platforms.append(_plat(850, py - 180, 40, 20))
        platforms.append(_plat(950, py - 450, 50, 20))
        platforms.append(_plat(1100, py - 320, 40, 20))
        platforms.append(_plat(1200, py - 550, 80, 20))
        platforms.append(_plat(1400, py - 400, 100, 20))
        platforms.append(_plat(1600, py - 280, 60, 20))
        platforms.append(_plat(1750, py - 500, 80, 20))
        platforms.append(_plat(1950, py - 200, 100, 20))
        platforms.append(_plat(2150, py - 420, 120, 20))
        platforms.append(_plat(2400, py - 320, 150, 20))
        platforms.append(_plat(2650, py - 480, 150, 20))
        platforms.append(_plat(2900, py - 80, 300, ground_h))
        right_edge = 3200

    elif level_index == 16:
        # 第17关：狭窄高台
        platforms.append(_plat(80, py - 200, 30, 20))
        platforms.append(_plat(180, py - 320, 30, 20))
        platforms.append(_plat(280, py - 440, 30, 20))
        platforms.append(_plat(380, py - 360, 30, 20))
        platforms.append(_plat(480, py - 280, 30, 20))
        platforms.append(_plat(580, py - 480, 30, 20))
        platforms.append(_plat(700, py - 400, 30, 20))
        platforms.append(_plat(820, py - 320, 30, 20))
        platforms.append(_plat(940, py - 520, 30, 20))
        platforms.append(_plat(1080, py - 440, 40, 20))
        platforms.append(_plat(1220, py - 280, 40, 20))
        platforms.append(_plat(1380, py - 550, 60, 20))
        platforms.append(_plat(1580, py - 380, 50, 20))
        platforms.append(_plat(1780, py - 480, 80, 20))
        platforms.append(_plat(2000, py - 250, 100, 20))
        platforms.append(_plat(2250, py - 520, 150, 20))
        platforms.append(_plat(2500, py - 350, 120, 20))
        platforms.append(_plat(2750, py - 80, 300, ground_h))
        right_edge = 3050

    elif level_index == 17:
        # 第18关：双向路径
        platforms.append(_plat(100, py - 200, 100, 20))
        platforms.append(_plat(150, py - 400, 50, 20))   # 上层分支
        platforms.append(_plat(350, py - 350, 80, 20))
        platforms.append(_plat(300, py - 150, 50, 20))     # 下层分支
        platforms.append(_plat(500, py - 450, 60, 20))
        platforms.append(_plat(480, py - 250, 50, 20))
        platforms.append(_plat(650, py - 380, 80, 20))
        platforms.append(_plat(620, py - 180, 60, 20))
        platforms.append(_plat(850, py - 500, 100, 20))
        platforms.append(_plat(800, py - 300, 80, 20))
        platforms.append(_plat(1050, py - 420, 60, 20))
        platforms.append(_plat(1000, py - 220, 60, 20))
        platforms.append(_plat(1250, py - 480, 100, 20))
        platforms.append(_plat(1200, py - 320, 80, 20))
        platforms.append(_plat(1450, py - 550, 120, 20))
        platforms.append(_plat(1400, py - 380, 100, 20))
        platforms.append(_plat(1650, py - 250, 80, 20))
        platforms.append(_plat(1850, py - 480, 150, 20))
        platforms.append(_plat(2100, py - 320, 120, 20))
        platforms.append(_plat(2350, py - 80, 300, ground_h))
        right_edge = 2650

    elif level_index == 18:
        # 第19关：极限挑战
        platforms.append(_plat(50, py - 180, 25, 20))
        platforms.append(_plat(130, py - 320, 25, 20))
        platforms.append(_plat(210, py - 450, 25, 20))
        platforms.append(_plat(290, py - 280, 25, 20))
        platforms.append(_plat(370, py - 520, 25, 20))
        platforms.append(_plat(460, py - 380, 25, 20))
        platforms.append(_plat(550, py - 200, 25, 20))
        platforms.append(_plat(640, py - 480, 25, 20))
        platforms.append(_plat(730, py - 320, 25, 20))
        platforms.append(_plat(820, py - 550, 30, 20))
        platforms.append(_plat(920, py - 420, 30, 20))
        platforms.append(_plat(1030, py - 250, 30, 20))
        platforms.append(_plat(1150, py - 480, 40, 20))
        platforms.append(_plat(1280, py - 350, 40, 20))
        platforms.append(_plat(1420, py - 580, 60, 20))
        platforms.append(_plat(1600, py - 450, 50, 20))
        platforms.append(_plat(1800, py - 300, 80, 20))
        platforms.append(_plat(2020, py - 550, 100, 20))
        platforms.append(_plat(2250, py - 400, 120, 20))
        platforms.append(_plat(2500, py - 200, 150, 20))
        platforms.append(_plat(2750, py - 480, 180, 20))
        platforms.append(_plat(3000, py - 80, 350, ground_h))
        right_edge = 3350

    else:
        # 第20关：终极试炼
        platforms.append(_plat(80, py - 300, 80, 20))
        platforms.append(_plat(120, py - 500, 40, 20))
        platforms.append(_plat(250, py - 400, 60, 20))
        platforms.append(_plat(380, py - 550, 50, 20))
        platforms.append(_plat(500, py - 350, 40, 20))
        platforms.append(_plat(600, py - 580, 60, 20))
        platforms.append(_plat(720, py - 450, 40, 20))
        platforms.append(_plat(820, py - 250, 30, 20))
        platforms.append(_plat(920, py - 500, 50, 20))
        platforms.append(_plat(1050, py - 380, 40, 20))
        platforms.append(_plat(1150, py - 600, 70, 20))
        platforms.append(_plat(1280, py - 480, 40, 20))
        platforms.append(_plat(1380, py - 320, 30, 20))
        platforms.append(_plat(1480, py - 550, 60, 20))
        platforms.append(_plat(1650, py - 420, 80, 20))
        platforms.append(_plat(1800, py - 620, 100, 20))
        platforms.append(_plat(1980, py - 350, 60, 20))
        platforms.append(_plat(2120, py - 580, 80, 20))
        platforms.append(_plat(2300, py - 450, 100, 20))
        platforms.append(_plat(2500, py - 650, 120, 20))
        platforms.append(_plat(2750, py - 300, 150, 20))
        platforms.append(_plat(3000, py - 550, 200, 20))
        platforms.append(_plat(3300, py - 180, 250, ground_h))
        right_edge = 3550

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

    # 初始出生点：左边中间高处，自由下落
    # 根据关卡难度调整出生高度
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

    def half_extents(self) -> Tuple[float, float]:
        w, h = shape_size(self.shape)
        return w * 0.5, h * 0.5

    def rect_at(self, cx: float, cy: float) -> RectF:
        w, h = shape_size(self.shape)
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


class Game:
    def __init__(self) -> None:
        pygame.init()
        pygame.display.set_caption("方块跳跃 — Python")
        self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("microsoftyahei", 18)
        self.font_small = pygame.font.SysFont("microsoftyahei", 15)
        self.levels = make_levels()
        self.level_index = 0
        self.player = Player(*self.levels[0].spawn)
        self.cam_x = 0.0
        self.won = False

    def current_level(self) -> Level:
        return self.levels[self.level_index]

    @property
    def world_width(self) -> int:
        return self.current_level().world_width

    def collide_platforms(self, rect: pygame.Rect) -> bool:
        for p in self.current_level().platforms:
            if rect.colliderect(p):
                return True
        return False

    def move_and_collide(self) -> None:
        """子步进碰撞，贴近 Scratch 的「步数」分解移动。"""
        p = self.player
        p.vy += 1.0
        p.vx *= 0.82

        steps = int(abs(p.vx) + abs(p.vy)) + 1
        steps = max(1, min(steps, 48))

        dx = p.vx / steps
        dy = p.vy / steps
        p.on_ground = False

        hw, hh = p.half_extents()

        for _ in range(steps):
            # 先竖直
            p.y += dy
            body = p.rect_at(p.x, p.y).to_pygame()
            hit = False
            for plat in self.current_level().platforms:
                if body.colliderect(plat):
                    hit = True
                    if dy > 0:
                        p.y = plat.top - hh - 0.01
                        p.vy = 0.0
                        p.on_ground = True
                    elif dy < 0:
                        p.y = plat.bottom + hh + 0.01
                        p.vy = 0.0
                    break
            if hit:
                body = p.rect_at(p.x, p.y).to_pygame()

            # 再水平
            p.x += dx
            body = p.rect_at(p.x, p.y).to_pygame()
            for plat in self.current_level().platforms:
                if body.colliderect(plat):
                    if dx > 0:
                        p.x = plat.left - hw - 0.01
                    elif dx < 0:
                        p.x = plat.right + hw + 0.01
                    p.vx = 0.0
                    break

        # 世界边界（防止飞出）
        p.x = max(hw + 20, min(self.world_width - hw - 20, p.x))
        if p.y > SCREEN_H + 100:
            self.respawn()

    def respawn(self) -> None:
        sp = self.current_level().spawn
        self.player.x, self.player.y = sp[0], sp[1]
        self.player.vx = self.player.vy = 0.0

    def check_portals(self) -> None:
        if self.won:
            return
        lv = self.current_level()
        body = self.player.rect_at(self.player.x, self.player.y).to_pygame()
        if lv.portal_next and body.colliderect(lv.portal_next) and self.level_index < len(self.levels) - 1:
            self.level_index += 1
            sp = self.current_level().spawn
            self.player.x, self.player.y = sp[0], sp[1]
            self.player.vx = self.player.vy = 0.0
        if lv.portal_prev and body.colliderect(lv.portal_prev) and self.level_index > 0:
            self.level_index -= 1
            sp = self.current_level().spawn
            self.player.x, self.player.y = sp[0], sp[1]
            self.player.vx = self.player.vy = 0.0

    def check_exit(self) -> None:
        if self.won:
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

    def handle_input(self) -> None:
        if self.won:
            return
        keys = pygame.key.get_pressed()
        p = self.player
        acc = 2.1
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            p.vx -= acc
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            p.vx += acc
        if (keys[pygame.K_UP] or keys[pygame.K_w] or keys[pygame.K_SPACE]) and p.on_ground:
            p.vy = -13.5
            p.on_ground = False

    def cycle_shape(self) -> None:
        order = [Shape.SQUARE, Shape.CIRCLE, Shape.LINE, Shape.TRIANGLE]
        i = order.index(self.player.shape)
        self.player.shape = order[(i + 1) % len(order)]

    def update_camera(self) -> None:
        target = self.player.x - SCREEN_W * 0.45
        self.cam_x += (target - self.cam_x) * 0.12
        self.cam_x = max(0.0, min(self.world_width - SCREEN_W, self.cam_x))

    def draw_level(self) -> None:
        surf = self.screen
        cx = self.cam_x
        surf.fill(COLOR_BG)

        for plat in self.current_level().platforms:
            r = pygame.Rect(plat.x - cx, plat.y, plat.w, plat.h)
            pygame.draw.rect(surf, COLOR_PLATFORM, r)
            pygame.draw.rect(surf, (220, 130, 0), r, 2)

        lv = self.current_level()
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

        if lv.exit_rect:
            r = pygame.Rect(lv.exit_rect.x - cx, lv.exit_rect.y, lv.exit_rect.w, lv.exit_rect.h)
            pygame.draw.rect(surf, COLOR_EXIT, r)
            pygame.draw.rect(surf, COLOR_EXIT_BORDER, r, 3)
            t1 = self.font.render("出口", True, (20, 90, 50))
            t2 = self.font_small.render("走进这里通关", True, (15, 70, 40))
            surf.blit(t1, (r.x + 12, r.y + 28))
            surf.blit(t2, (r.x + 4, r.y + 62))

        self.player.draw(surf, cx)

        prog = f"{self.level_index + 1} / {len(self.levels)}"
        title = self.font.render(f"{self.current_level().name}  ({prog})", True, COLOR_TEXT)
        surf.blit(title, (12, 10))
        hint = self.font_small.render(
            "←→ 移动  上/空格 跳跃  Tab 切换造型  R 重开本关"
            + ("  Enter 通关后再玩" if self.won else ""),
            True,
            (100, 105, 115),
        )
        surf.blit(hint, (12, 36))
        shape_names = {"SQUARE": "方形", "CIRCLE": "圆形", "LINE": "短线", "TRIANGLE": "三角"}
        st = self.font_small.render(f"造型: {shape_names[self.player.shape.name]}", True, COLOR_TEXT)
        surf.blit(st, (12, SCREEN_H - 28))

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

    def run(self) -> None:
        while True:
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
                    if event.key == pygame.K_TAB and not self.won:
                        self.cycle_shape()
                    if event.key == pygame.K_r and not self.won:
                        self.respawn()

            if not self.won:
                self.handle_input()
                self.move_and_collide()
                self.check_portals()
                self.check_exit()
            self.update_camera()
            self.draw_level()
            pygame.display.flip()
            self.clock.tick(FPS)


def main() -> None:
    Game().run()


if __name__ == "__main__":
    main()
