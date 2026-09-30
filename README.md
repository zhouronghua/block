# zrh.asia 网站与 block 在线试玩

本仓库已扩展为网站工程，目标是将域名 `zrh.asia` 指向当前站点，并提供两类内容：

- `zhouronghua` 公开仓库主要软件展示（自动抓取 GitHub API）
- 历史博客内容展示（来自 `zhouronghua.github.io` 的 `_posts`）
- `block` 游戏网页试玩（Phaser 版本，浏览器直接运行）

同时保留原始桌面版 `game.py`（Python + pygame）作为参考实现。

## 目录结构

```text
block/
├── docker-compose.yml
├── infra/
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── conf.d/site.conf
│   └── scripts/issue-cert.sh
├── server/
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
├── web/
│   ├── index.html
│   ├── app.js
│   ├── play.html
│   ├── play.js
│   └── styles.css
├── minigame/                # 微信小游戏（触摸屏版 + 积分排行榜）
│   ├── game.js
│   ├── game.json
│   ├── project.config.json
│   └── js/
├── server/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       └── leaderboard.js    # 小游戏积分榜存储与排名
├── game.py
├── requirements.txt
└── Makefile
```

## 1) 域名与 DNS

在域名解析平台配置：

- `A 记录`：`zrh.asia -> 当前服务器公网 IP`
- `A 记录`：`www.zrh.asia -> 当前服务器公网 IP`

Nginx 已配置 `www` 跳转到裸域。

## 2) 启动站点

依赖：服务器安装 Docker 和 Docker Compose。

```bash
cd /home/zrh/block
make up
```

启动后：

- 首页：`http://zrh.asia/`
- 游戏试玩：`http://zrh.asia/play.html`
- API 健康检查：`http://zrh.asia/api/health`

## 3) HTTPS 证书

先确保 DNS 生效，再执行：

```bash
cd /home/zrh/block
bash infra/scripts/issue-cert.sh zrh.asia admin@zrh.asia
```

证书生成在 `build/certbot/conf`。随后启用 `infra/nginx/conf.d/site.conf` 中的 HTTPS server 段并重启：

```bash
make restart
```

## 4) 仓库展示 API

后端接口：`/api/repos`

- 自动抓取用户公开仓库并筛选 Top 项目
- 过滤 fork、归档仓库
- 按“全分支最近一次代码提交时间”降序排序（不是仅看 `main/master`）
- 缓存写入 `build/cache/repos.json`，默认 20 分钟

支持参数：

- `limit`：返回数量（1~30）
- `fresh=1`：跳过缓存强制刷新

## 5) 博客内容展示

后端接口：`/api/blog-posts`

- 读取 `web/content/blog/*.markdown`
- 解析 Jekyll front matter（标题、日期、分类）
- 首页展示最新文章摘要

## 6) block 在线试玩功能

页面：`/play.html`

已包含机制：

- 移动、跳跃、二段跳、冲刺
- 尖刺死亡、塌陷平台恢复
- 水域效果（蓝色减速、黑色加速）
- 风车机关碰撞判定
- 传送门
- 金币收集与隐藏关解锁
- 关卡切换与摄像机跟随

## 7) 微信小游戏与积分排行榜

工程目录：`minigame/`，由 `web/play.js`（Phaser 版）移植为原生 Canvas 实现，横屏触摸操作，
积分提交到本站后端。

- 首页：显示用户 ID、昵称、最高分、排行榜 Top 5
- 游戏：左下方向键移动，右下「跳」（二段跳）与「冲」，右上切换造型/重生，左上退出结算
- 结算：展示本局积分明细，并自动提交到 zrh.asia
- 排行榜：Top 10 + 我的排名

积分规则：`金币×100 + 通关×500 + 隐藏关 1500 + 速度奖励 max(0, 3000−秒数×5) − 死亡×30`。

后端接口（数据保存于 `build/game/scores.json`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/game/login` | 用微信 `code` 换 openid，作为排行榜用户 ID |
| POST | `/api/game/score` | 提交一局积分（`run_id` 幂等，断网可补交） |
| GET | `/api/game/leaderboard` | `limit`、`user_id`；返回榜单与我的排名 |

用户 ID 来源：服务端配置 `WX_APPID` / `WX_APPSECRET` 后为微信 openid（`wx_` 前缀），
未配置时客户端退化为本地 ID，游戏功能不受影响。

上线前需要：

1. 启用 HTTPS（`make cert` 后打开 `infra/nginx/conf.d/site.conf` 的 HTTPS 段并 `make restart`），
   微信小游戏只允许 https 请求；
2. 小游戏后台「开发设置 → 服务器域名 → request 合法域名」加入 `https://zrh.asia`；
3. `docker-compose.yml` 填写 `WX_APPID` / `WX_APPSECRET`；
4. 微信开发者工具导入 `minigame/`，替换 `project.config.json` 中的 `appid`。

详细说明见 `minigame/README.md`。

## 8) 运维命令

```bash
make up      # 构建并启动
make down    # 停止并删除容器
make restart # 重启容器
make logs    # 查看日志
```

## 9) 原始桌面版运行（可选）

如果要运行原始 pygame 版本：

```bash
pip install -r requirements.txt
python game.py
```
