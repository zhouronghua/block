# block 微信小游戏 上线部署文档

适配「等申请到小游戏 AppID 后再上线」的场景：先把服务端与工程准备好，拿到 AppID/AppSecret 后
按本文第 2、3 节填入即可提审发布。

## 0. 待补信息（拿到小游戏账号后填写）

| 项目 | 取值 | 填写位置 |
| --- | --- | --- |
| AppID(小游戏) | `<待填>` | `minigame/project.config.json` 的 `appid`、`docker-compose.yml` 的 `WX_APPID` |
| AppSecret | `<待填>` | 仅服务端：`docker-compose.yml` 的 `WX_APPSECRET`（不要写进小游戏代码） |
| 服务器域名 | `https://zrh.asia` | 微信公众平台 → 开发设置 → 服务器域名 → request 合法域名 |
| 服务器公网 IP | `<待填>` | DNS：`zrh.asia` / `www.zrh.asia` 的 A 记录 |

> AppSecret 只存在于服务端环境变量，小游戏端只传 `wx.login()` 的 `code`，不接触密钥。

## 1. 数据流

```text
微信小游戏(minigame/) --HTTPS--> nginx(443) --/api/--> api容器(3000) --> build/game/scores.json
        wx.login() code                                    |
        POST /api/game/login  --> jscode2session --> openid(wx_xxx) 作为用户ID
        POST /api/game/score  --> 记录最高分、返回名次
        GET  /api/game/leaderboard --> 榜单 + 我的排名
```

## 2. 服务端部署（拿到 AppID 前后都可先做）

1. 服务器拉取最新代码：

   ```bash
   cd /home/zrh/block
   git pull
   ```

2. 配置小游戏密钥（推荐用与 `docker-compose.yml` 同级的 `.env`，避免写进仓库）：

   ```bash
   # /home/zrh/block/.env
   WX_APPID=wx你的AppID
   WX_APPSECRET=你的AppSecret
   ```

   `docker-compose.yml` 已用 `${WX_APPID:-}` / `${WX_APPSECRET:-}` 读取，缺省为空时
   `/api/game/login` 返回 `source: "unconfigured"`，游戏仍能玩，只是用户 ID 退化为本地 ID。

3. 启动 / 重启：

   ```bash
   make up        # 首次
   make restart   # 改了环境变量后
   ```

4. 开启 HTTPS（微信小游戏只允许 https 请求，必须在提审前完成）：

   ```bash
   make cert      # 或 bash infra/scripts/issue-cert.sh zrh.asia admin@zrh.asia
   # 编辑 infra/nginx/conf.d/site.conf：取消 HTTPS server 段的注释（含 443 ssl + /api/ 反代）
   make restart
   ```

5. 验证：

   ```bash
   make smoke                       # 已包含 /api/game/leaderboard 与 /api/game/score 检查
   curl -fsSL https://zrh.asia/api/health
   curl -fsSL "https://zrh.asia/api/game/leaderboard?limit=5"
   ```

6. 数据持久化：榜单写在 `build/game/scores.json`（`./build` 已挂载进容器，重启不丢）。
   备份只需拷贝该文件；迁移时直接放到新机器的同路径即可。

可选环境变量：`GAME_RATE_MAX`（默认 60 次/分钟/IP）、`GAME_RATE_WINDOW_MS`（默认 60000）、
`GAME_DATA_DIR`（默认 `build/game`）。

## 3. 微信平台配置

1. **服务器域名**：微信公众平台 → 小游戏 → 开发 → 开发设置 → 服务器域名 →
   `request 合法域名` 增加 `https://zrh.asia`。保存后约 5 分钟生效；
   开发工具「详情 → 本地设置」勾选**不校验合法域名**可先跳过（真机仍会校验）。
2. **导入工程**：微信开发者工具 → 导入项目 → 目录选 `minigame/` → 项目类型「小游戏」→
   填入 AppID；把 `minigame/project.config.json` 的 `appid` 改成同一个 AppID。
3. **调试**：
   - `game.json` 已设 `deviceOrientation: "landscape"`（横屏）。
   - 若服务器还没上 HTTPS，可临时把 `js/config.js` 的 `API_BASE` 改成 `http://zrh.asia`
     配合「不校验合法域名」调试，**上线前务必改回 https**。
   - 提交成绩失败时，客户端会缓存并在下次启动自动补交（`run_id` 幂等，不会重复计分）。
4. **真机验证**：开发工具「预览/真机调试」生成体验版二维码，用手机横屏试玩一局，
   确认首页显示用户ID、结算页显示名次、排行榜能看到自己。

## 4. 上线流程

1. 开发者工具 → 上传（填版本号与备注）
2. 公众平台 → 版本管理 → 选体验版自测 → 提交审核（准备类目、测试账号/说明）
3. 审核通过后 → 发布

## 5. 上线检查清单

- [ ] `https://zrh.asia/api/health` 返回 `status: ok`
- [ ] `https://zrh.asia/api/game/leaderboard?limit=5` 返回 200
- [ ] `.env` 已配置 `WX_APPID`/`WX_APPSECRET`，且 `/api/game/login` 返回 `source: "wechat"`、
      `user_id` 以 `wx_` 开头
- [ ] 微信后台 request 合法域名已加 `https://zrh.asia`
- [ ] `minigame/project.config.json` 的 `appid` 已替换
- [ ] `js/config.js` 的 `API_BASE` 为 `https://zrh.asia`
- [ ] 真机横屏：左右移动、跳跃/二段跳、冲刺、切换造型、重生、退出结算均正常
- [ ] 真机提交成绩成功，排行榜显示昵称与名次
- [ ] `build/game/scores.json` 有数据且已做一次备份

## 6. 回滚与常见问题

- **回滚**：`git checkout <上一个commit>` 后 `make restart`；数据文件 `build/game/scores.json`
  不在 git 中，回滚不会丢榜单。
- **`url not in domain`**：合法域名未配置或未生效（保存后等几分钟，且必须是 https）。
- **`source: "unconfigured"` / 用户ID 是 `g` 开头**：服务端未读到 `WX_APPID`/`WX_APPSECRET`，
  检查 `.env` 是否在 `docker-compose.yml` 同级目录、容器是否重启过。
- **昵称显示「微信用户」或灰色头像**：平台对未授权用户返回匿名数据，
  点首页「使用微信昵称」按钮授权后即会更新。
- **排行榜为空**：先完整玩一局（通关或主动退出都会结算提交），再看榜单。
- **证书到期**：`make cert` 重新签发后 `make restart`。
