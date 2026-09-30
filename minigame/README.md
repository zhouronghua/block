# block 微信小游戏（触摸屏版 + 积分排行榜）

从 `web/play.html` 的 Phaser 网页版移植而来：**原生 Canvas 实现，不依赖任何游戏引擎**，
玩法、关卡坐标、机关参数与原版一致；操作改为触摸屏虚拟按键，积分通过 `zrh.asia` 服务端保存并排名。

## 1) 目录结构

```text
minigame/
├── game.js                 # 小游戏入口（只做 require）
├── game.json               # 横屏、网络超时配置
├── project.config.json     # 微信开发者工具工程配置（appid 需替换）
└── js/
    ├── main.js             # 主循环、界面状态机、成绩提交
    ├── config.js           # 设计分辨率、物理参数、积分规则、后端地址
    ├── levels.js           # 关卡数据（从 web/play.js 原样移植）
    ├── world.js            # 纯逻辑世界：物理、碰撞、机关、金币、隐藏关
    ├── score.js            # 积分计算
    ├── render.js           # 关卡/角色绘制
    ├── screens.js          # 首页 / 游戏 / 结算 / 排行榜界面与按钮布局
    ├── input.js            # 触摸输入（虚拟按键 + 点击）
    ├── ui.js               # 绘制与命中检测小工具
    ├── net.js              # 排行榜接口封装、本地缓存、断网补交
    └── platform.js         # wx API 适配层（非微信环境自动降级）
```

## 2) 玩法与触摸操作

关卡内容与原网页版一致：三关（含隐藏关）、尖刺、风车、蓝水减速、黑水加速、传送门、
塌陷平台、金币收集；收集到 70% 金币（6 枚中的 5 枚）解锁隐藏关。

横屏操作（设计分辨率 960x540，按屏幕等比缩放居中）：

| 位置 | 按钮 | 说明 |
| --- | --- | --- |
| 左下 | `◀` `▶` | 左右移动 |
| 右下 | `跳` | 跳跃；在空中再点一次触发二段跳 |
| 右下 | `冲` | 冲刺（按住时移动速度 260 → 390） |
| 右上 | `造型` | 切换方形/圆形/短线/三角（碰撞体随之变化） |
| 右上 | `重生` | 回到本关起点 |
| 左上 | `退出` | 结束本局并结算 |

## 3) 积分规则（`js/config.js` 的 `SCORE`）

```
积分 = 金币 × 100 + 通过关卡数 × 500 + 隐藏关通关 1500
     + 速度奖励 max(0, 3000 − 用时秒数 × 5) − 死亡次数 × 30
```
最低 0 分，一局结束（通关、进入隐藏关失败或主动退出）时提交。

## 4) 用户 ID 与排行榜

1. 小游戏启动调用 `wx.login()` 拿到 `code`；
2. `POST https://zrh.asia/api/game/login` 由服务端用 `appid + secret` 调
   `jscode2session` 换取 `openid`，返回 `wx_<openid>` 作为**稳定用户 ID**；
3. 客户端把用户 ID 存进本地 Storage，后续每次结算都用它提交积分；
4. 若服务端未配置 `WX_APPID` / `WX_APPSECRET`（或微信接口异常），自动退化为本地生成的
   ID（`g` 开头），游戏仍可正常提交与排名，只是换设备后 ID 会变。

接口：

- `POST /api/game/login` → `{ ok, user_id, source }`
- `POST /api/game/score` → `{ ok, rank, total_players, player }`，`run_id` 相同则幂等（断网补交不会重复计分）
- `GET /api/game/leaderboard?limit=10&user_id=xxx` → `{ items, me, total_players }`

服务端把数据落盘在 `build/game/scores.json`（见 `server/src/leaderboard.js`），
`docker-compose.yml` 已把 `./build` 挂进容器，重启不丢数据。

断网时成绩会先缓存，下次启动自动补交。

## 5) 接入步骤

1. **服务端开启 HTTPS**：微信小游戏只允许 https 请求。先 `make cert` 签发证书，
   再启用 `infra/nginx/conf.d/site.conf` 里的 HTTPS server 段并 `make restart`。
2. **配置服务器域名**：微信公众平台 → 小游戏 → 开发 → 开发设置 → 服务器域名 →
   `request 合法域名` 增加 `https://zrh.asia`。
3. **配置 AppID/Secret**：`docker-compose.yml` 里填 `WX_APPID` / `WX_APPSECRET`
   （或用 `.env` 文件提供），重启 API 容器。
4. **导入工程**：微信开发者工具 → 导入项目 → 选 `minigame/` 目录 → 项目类型选「小游戏」，
   把 `project.config.json` 里的 `appid` 换成你自己的小游戏 AppID。
5. 真机/模拟器横屏运行；也可在开发工具「详情 → 本地设置」勾选**不校验合法域名**先跑通逻辑
   （此时可把 `js/config.js` 的 `API_BASE` 临时改成 `http://zrh.asia`）。

## 6) 本地自检

核心玩法逻辑不依赖微信环境，可直接在 Node 里跑（自行构造 `World` 调用 `update(dt, input)` 即可），
`js/world.js`、`js/levels.js`、`js/score.js` 都是纯 JS 模块。
