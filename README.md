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

## 7) 运维命令

```bash
make up      # 构建并启动
make down    # 停止并删除容器
make restart # 重启容器
make logs    # 查看日志
```

## 8) 原始桌面版运行（可选）

如果要运行原始 pygame 版本：

```bash
pip install -r requirements.txt
python game.py
```
