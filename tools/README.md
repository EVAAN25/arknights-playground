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
python3 tools/build_operators.py      # → data/operators.json / operators.js（409 干员，376 有实装日期）

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

- **题池**：可获取的 3★~6★ 干员（409 = 17×3★ + 61×4★ + 195×5★ + 136×6★；玩法内按稀有度 ≥3 过滤）。
- **职业/分支**：以 PRTS 干员页 CharinfoV2 模板为准（全量快照 raw/prts_charinfo.json，409 人）；gamedata subProfessionId 的 SUBPROF 中文映射由该快照共识生成，仅作新干员兜底（2026-08-07 全量校对：职业/星级 0 差异，分支修正 111 处——旧映射表把 stalker=伏击客错成行商、ringhealer=群愈师错成疗养师等）。
- **实装日期**：一律以 PRTS 干员页「上线时间」为准（raw/prts_online.json 全量 409 人，2026-08-07 起替代卡池推算/页面创建时间；修正了开服干员误用首个 UP 卡池日期的 45 处偏差）。
- **3★ 档案**：种族/画师/声优来自 PRTS wikitext（raw/prts_lore.json），性别来自 tl-akhr，头像从 PRTS `File:头像_<干员名>.png`（media.prts.wiki 按 md5 路径直链 curl）。
- **播放量**：优先干员个人「前瞻PV/技能展示PV」；无个人 PV 的取「实装活动宣传PV」（实装日前 24 天窗口内最近的活动 PV）。官号联合投稿视频不在其空间列表中，相关干员不进入人气对决题池。
- **连线唯一解**：枚举 16 人中所有共享某维度同值的四人组，exact-cover 计数必须为 1；组内 4 人必须是该值在 16 人中的全部命中。
