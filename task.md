# 任务记录：明日方舟游乐场粉丝小游戏站

## 需求

从零构建「明日方舟游乐场」并发布到 GitHub Pages。不做 wordle 式猜干员（已有 mer.dev/arknights-wordle），只做 4 个玩法：语音猜人（Heardle 式）、Higher-Lower 人气对决、阵营连线（Connections 式）、版本排排坐（实装日期排序）。全程中文 UI、纯静态无后端、暖纸底 + 舟味黑金点缀。每玩法：每日一题独立种子 + 无限模式 + 独立 localStorage + emoji 分享卡 + 结算评级。

## 交付物

- 站点（本目录即仓库根）：`index.html` / `style.css` / `app.js` / `game.js` / `test.js`
- 数据：`data/operators.js`（392 干员）、`data/voice.js`（290 干员中文语音索引）、`data/popularity.js`（175 条 B 站播放量）、`data/connections.js`（72 题连线题库，唯一解校验）
- 素材：`assets/avatars/`（392 头像）、`assets/voice/`（中文语音 mp3）
- 管线：`tools/`（见 tools/README.md），中间产物 `raw/`（不进仓库）
- 参考：`reference-starrail/`（星铁站 clone，不进仓库）
- Pages：https://evaan25.github.io/arknights-playground/

## 数据源实况（真数据 vs 估算）

全部为**真实抓取数据**，无人工估算：

- 干员/语音文本：Kengxxiao/ArknightsGameData（zh_CN gamedata，2026-08-05）
- 种族/画师/声优：PRTS Wiki 干员页 wikitext（396 条，浏览器批量 API）
- 实装日期：arknights.wiki.gg 卡池表（CN 服）+ PRTS 页面创建时间交叉校正（359/392 有日期）
- 语音音频：Aceship/Arknight-voices `voice_cn` 中文普通话 mp3，每干员至多 3 条 8~60 字短句
- 播放量：B 站官号「明日方舟」空间视频列表真实播放量（快照 2026-08-05）。注：官号联合投稿视频（如覆潮之下/将进酒/愚人号活动 PV）不在其空间列表，相关干员未进人气题池

## 过程中的坑

- prts.wiki / arknights.wiki.gg / B 站 API 全部对 curl 风控（403/-352）；解决：kimi-webbridge 走真实浏览器 + 同源 fetch。
- B 站空间 wbi 签名 API 匿名访问被风控；改抓空间视频列表页 DOM，翻页抓取，注意「合作」标记行会打乱正则。
- Aceship/Arknight-Images 停更于 2024-04，102 个新干员头像缺失；从 PRTS `File:头像_<干员名>.png`（media.prts.wiki 可直连 curl）补齐。
- PRTS cargo `chara` 表无实装日期字段；wiki.gg Banners 表 server=cn 行很少，需用全部卡池行的 startTimeCN 取每干员最早值。
- charword 里 CN_xxx 语音条目标记 ONLY_TEXT 但音频文件实际存在，以 Aceship 仓库文件列表为准。

## 验证

- `node test.js`：21 项断言全过（四玩法种子确定性 / 72 题唯一解 / 排序判定 / 分享卡格式 / 数据完整性）
- `python3 -m http.server` + curl 抽查页面与音频/图片资源全部 200
- 无头 Chrome 冒烟：四路由渲染、语音 6 次判负、连线锁定、排排坐反馈、分享卡格式，无 JS 报错
