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


def make_levels() -> List[Level]:
    """三关：平台 + 空隙；右侧青色进下一关，左侧进上一关。"""
    ground_h = 40
    py = SCREEN_H - ground_h

    def plat(x: int, y: int, w: int, h: int) -> pygame.Rect:
        return pygame.Rect(x, y, w, h)

    # 关卡 1：学习跳跃
    lv1_platforms = [
        plat(0, py, 320, ground_h),
        plat(400, py - 0, 280, ground_h),
        plat(760, py, SCREEN_W - 760 + 200, ground_h),
    ]
    lv1 = Level(
        "第 1 关",
        lv1_platforms,
        portal_next=pygame.Rect(SCREEN_W - 70, py - 120, 50, 120),
        portal_prev=None,
        spawn=(80.0, float(py - 80)),
        world_width=SCREEN_W + 200,
    )

    # 关卡 2：空隙宽度 = gap（第一块右缘到第二块左缘）。
    # 原先第二块 x 写成 300+gap，但第一块只到 x=200，实际空隙变成 220px，
    # 且悬浮平台盖在 (300~420) 上空，跳跃顶点会顶到板底掉进坑里 —— 已修正。
    gap = 130
    p1_right = -100 + 300
    p2_left = p1_right + gap
    p2_w, p3_w = 400, 500
    p3_left = p2_left + p2_w + gap
    lv2_platforms = [
        plat(-100, py, 300, ground_h),
        plat(p2_left, py, p2_w, ground_h),
        plat(p3_left, py, p3_w, ground_h),
        # 第二段地面上的小凸起（不挡空隙上方的跳跃弧线）
        plat(p2_left + 140, py - 14, 70, 14),
    ]
    lv2 = Level(
        "第 2 关",
        lv2_platforms,
        portal_next=pygame.Rect(SCREEN_W - 70, py - 120, 50, 120),
        portal_prev=pygame.Rect(10, py - 120, 50, 120),
        spawn=(80.0, float(py - 80)),
        world_width=max(1600, p3_left + p3_w + 120),
    )

    # 关卡 3：终点
    lv3_platforms = [
        plat(0, py, 220, ground_h),
        plat(300, py - 80, 100, 20),
        plat(480, py, SCREEN_W - 480 + 100, ground_h),
    ]
    lv3 = Level(
        "第 3 关 — 终点",
        lv3_platforms,
        portal_next=None,
        portal_prev=pygame.Rect(10, py - 120, 50, 120),
        spawn=(80.0, float(py - 80)),
        world_width=SCREEN_W + 200,
    )

    return [lv1, lv2, lv3]


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

    def handle_input(self) -> None:
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

        self.player.draw(surf, cx)

        title = self.font.render(self.current_level().name, True, COLOR_TEXT)
        surf.blit(title, (12, 10))
        hint = self.font_small.render(
            "←→ 移动  上/空格 跳跃  Tab 切换造型（□ ● — △）  R 重开本关",
            True,
            (100, 105, 115),
        )
        surf.blit(hint, (12, 36))
        shape_names = {"SQUARE": "方形", "CIRCLE": "圆形", "LINE": "短线", "TRIANGLE": "三角"}
        st = self.font_small.render(f"造型: {shape_names[self.player.shape.name]}", True, COLOR_TEXT)
        surf.blit(st, (12, SCREEN_H - 28))

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
                    if event.key == pygame.K_TAB:
                        self.cycle_shape()
                    if event.key == pygame.K_r:
                        self.respawn()

            self.handle_input()
            self.move_and_collide()
            self.check_portals()
            self.update_camera()
            self.draw_level()
            pygame.display.flip()
            self.clock.tick(FPS)


def main() -> None:
    Game().run()


if __name__ == "__main__":
    main()
