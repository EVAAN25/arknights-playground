# 明日方舟游乐场

非官方粉丝同人小游戏站 · 纯静态无后端 · 中文 UI
在线地址：https://evaan25.github.io/arknights-playground/

> 本站为粉丝同人作品，与鹰角网络（Hypergryph）无关，游戏素材版权归原厂商所有。

## 四个玩法

| 玩法 | 路由 | 简介 |
|---|---|---|
| 语音猜人 | `#/voice` | Heardle 式：听干员中文语音猜人。前 2 秒 → 5 秒 → 10 秒 → 完整，逐段解锁，6 次机会，最后一次给文字台词兜底 |
| 人气对决 | `#/higher-lower` | Higher-Lower：两位干员比 B 站官号视频播放量（个人前瞻/技能展示 PV，或实装活动宣传 PV），二选一连击 |
| 阵营连线 | `#/connections` | NYT Connections 式：16 位干员分 4 组（势力/职业/种族/画师/声优），错 4 次判负；题库 72 题，全部离线校验唯一解 |
| 版本排排坐 | `#/timeline` | 5 位干员按实装日期排序，3 次提交机会，逐张给对错反馈 |

每个玩法都有：**每日一题**（按本地日期出种子，全站同题，进度存 localStorage）+ **无限/练习模式** + **emoji 分享卡** + **结算评级**。

## 运行

纯静态、无构建步骤。

```bash
# 本地任意一种：
open index.html                 # file:// 直接打开（数据已内嵌 js）
python3 -m http.server 8000     # 或起本地服务访问 http://localhost:8000
```

## 测试

```bash
node test.js   # 21 项断言：种子确定性 / 连线唯一解 / 排序判定 / 分享卡格式 / 数据完整性
```

## 部署

GitHub Pages：`Settings → Pages → Deploy from branch → main / (root)`。
数据与素材全部随仓库分发，无需任何后端。

## 数据来源与日期

| 数据 | 来源 | 说明 |
|---|---|---|
| 干员基础信息（稀有度/职业/势力） | [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) `zh_CN` gamedata | 抓取于 2026-08-05 |
| 种族/画师/声优 | [PRTS Wiki](https://prts.wiki) 干员页 wikitext | 抓取于 2026-08-05 |
| 实装日期 | [arknights.wiki.gg](https://arknights.wiki.gg) 卡池表 + PRTS 页面创建时间交叉校正 | 抓取于 2026-08-05 |
| 头像 | [Aceship/Arknight-Images](https://github.com/Aceship/Arknight-Images) + PRTS 补充新干员 | 抓取于 2026-08-05 |
| 中文语音 | [Aceship/Arknight-voices](https://github.com/Aceship/Arknight-voices) `voice_cn` | 抓取于 2026-08-05 |
| 播放量快照 | B 站官号「明日方舟」(mid=161775300) 空间视频列表 | 快照日期 **2026-08-05**，见 `data/popularity.json` |

数据管线与重跑方法见 `tools/README.md`。
