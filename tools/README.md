# 数据管线说明

所有脚本均为一次性/可重跑的数据采集与生成工具，最终产物是 `data/*.js|.json` 与 `assets/`。
中间产物在 `raw/`（已 gitignore，不进仓库）。

## 依赖

- `gh` CLI 已登录（拉 GitHub 仓库文件）
- 网络环境注意：PRTS Wiki（prts.wiki）与 B 站 API 对匿名 curl 有风控，
  本管线中 PRTS 页面数据与 B 站视频列表是通过真实浏览器（kimi-webbridge）抓取的。

## 脚本执行顺序

```bash
# 1. 原始数据（raw/）：
#    - character_table.json / charword_table.json：Kengxxiao/ArknightsGameData zh_CN excel
#    - tl-akhr.json：Aceship/AN-EN-Tags（EN↔CN 名称映射）
#    - banners_cn.json：arknights.wiki.gg cargo Banners 表（含 startTimeCN）
#    - prts_lore.json / prts_created.json：PRTS 干员页 wikitext（种族/画师/声优）与页面创建时间
#    - bili_pvs.json：B 站官号视频列表（标题/日期/播放量），浏览器 DOM 抓取后整理

# 2. 干员主数据
python3 tools/build_operators.py      # → data/operators.json / operators.js（392 干员，359 有实装日期）

# 3. 头像与语音（gh api，约 10 分钟）
python3 tools/fetch_assets.py         # → assets/avatars/*.png、assets/voice/*.mp3
python3 tools/refine_voice.py         # 语音选句优化（8~60 字）→ data/voice.js

# 4. 新干员头像补充（Aceship 图库停更于 2024-04，新干员从 PRTS media.prts.wiki 取）
#    文件名规律：File:头像_<干员名>.png，经 PRTS api imageinfo 取真实 URL 后 curl 下载

# 5. 玩法题库
python3 tools/build_popularity.py     # → data/popularity.*（175 条播放量）
python3 tools/build_connections.py    # → data/connections.*（72 题，exact-cover 校验唯一解）
python3 tools/build_clues.py          # → data/clues.*（猜干员档案线索：台词/天赋/技能/活动名，需 raw/skill_table.json）

# 6. 校验
node test.js
```

## 关键口径

- **题池**：可获取的 5★+6★ 干员（392 含 61 个 4★，玩法内按稀有度过滤；4★ 开关预留在数据层）。
- **实装日期**：优先 wiki.gg 卡池 startTimeCN（+8h 修正时区）；与 PRTS 页面创建时间相差 >30 天取较早者；无卡池记录的赠送/商店干员用 PRTS 创建时间。
- **播放量**：优先干员个人「前瞻PV/技能展示PV」；无个人 PV 的取「实装活动宣传PV」（实装日前 24 天窗口内最近的活动 PV）。官号联合投稿视频不在其空间列表中，相关干员不进入人气对决题池。
- **连线唯一解**：枚举 16 人中所有共享某维度同值的四人组，exact-cover 计数必须为 1；组内 4 人必须是该值在 16 人中的全部命中。
