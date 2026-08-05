/*
 * 明日方舟游乐场 —— 纯逻辑层（UMD：浏览器挂 window.AKG，node 可 require）
 * 不依赖 DOM；数据由调用方传入（浏览器里是 window.ARK_OPS 等全局变量）
 */
(function (root, factory) {
  const AKG = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = AKG;
  else root.AKG = AKG;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SITE_NAME = "明日方舟游乐场";
  const SITE_URL = "https://evaan25.github.io/arknights-playground/";

  // ---------- 随机与每日种子 ----------

  // FNV-1a 32bit
  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 本地日期 YYYY-MM-DD（不用 UTC，保证“今天”符合玩家直觉）
  function dateStr(d) {
    d = d || new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${dd}`;
  }

  // 带 salt 的每日索引：各玩法 salt 不同，同一天各玩法的题互不干扰
  function dailyIndex(date, count, salt) {
    const rng = mulberry32(hash32((salt || "ak") + ":" + date));
    return Math.floor(rng() * count);
  }

  // 用 rng 原地洗牌（Fisher-Yates）
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- 通用：模糊搜索（语音猜人的自动补全） ----------

  function normalize(s) {
    return String(s).replace(/[·•.\s・]/g, "").toLowerCase();
  }

  // 在候选干员列表里按名字模糊匹配，前缀命中排前
  function search(candidates, query, excludeIds, limit) {
    const q = normalize(query);
    if (!q) return [];
    const ex = new Set(excludeIds || []);
    const out = [];
    for (const c of candidates) {
      if (ex.has(c.id)) continue;
      if (normalize(c.name).includes(q)) {
        out.push({ c, score: normalize(c.name).startsWith(q) ? 0 : 1 });
      }
    }
    out.sort((a, b) => a.score - b.score || a.c.id.localeCompare(b.c.id));
    return out.slice(0, limit || 8).map((x) => x.c);
  }

  // ---------- 玩法 0：猜干员（wordle 式七维比对） ----------

  // 题池开关：true 时把 4★ 也放进题池（默认只 5★+6★）
  const GUESS_INCLUDE_R4 = false;
  const GUESS_MAX_TRIES = 6;
  const GUESS_CELL_ORDER = ["rarity", "prof", "sub", "faction", "race", "sex", "release"];
  const GUESS_CELL_LABEL = {
    rarity: "星级", prof: "职业", sub: "分支", faction: "势力",
    race: "种族", sex: "性别", release: "实装日期",
  };
  const GUESS_CELL_EMOJI = { green: "🟩", red: "🟥", up: "⬆️", down: "⬇️" };

  // 题池：release 非空、sex 非空（排除谜语人），星级按开关
  function guessPool(ops, includeR4) {
    const minR = (includeR4 == null ? GUESS_INCLUDE_R4 : includeR4) ? 4 : 5;
    return ops.filter((o) => o.rarity >= minR && o.release && o.sex);
  }

  function guessDaily(date, pool) {
    return pool[dailyIndex(date, pool.length, "ak-guess")].id;
  }

  function guessRandom(pool, rand) {
    rand = rand || Math.random;
    return pool[Math.floor(rand() * pool.length)].id;
  }

  // 数值维度：0 相等；1 目标更高/更晚（提示 ⬆️）；-1 目标更低/更早（提示 ⬇️）
  function cmpNumeric(g, t) {
    if (g === t) return 0;
    return t > g ? 1 : -1;
  }

  function numCell(g, t) {
    const dir = cmpNumeric(g, t);
    if (dir === 0) return { status: "green" };
    return { status: dir > 0 ? "up" : "down", dir };
  }

  // 分支（子职业）：空字符串按「—」处理，空==空算相同
  function subNorm(s) { return s == null || s === "" ? "—" : s; }

  /*
   * 比对一次猜测。win=精确命中；cells 七维：
   * 文本维度 green/red；数值维度（星级/实装日期）green 或 up/down（⬆️=答案更高/更晚）
   */
  function guessCompare(g, t) {
    return {
      win: g.id === t.id,
      cells: {
        rarity: numCell(g.rarity, t.rarity),
        prof: { status: g.prof === t.prof ? "green" : "red" },
        sub: { status: subNorm(g.sub) === subNorm(t.sub) ? "green" : "red" },
        faction: { status: g.faction === t.faction ? "green" : "red" },
        race: { status: g.race === t.race ? "green" : "red" },
        sex: { status: g.sex === t.sex ? "green" : "red" },
        release: numCell(Date.parse(g.release), Date.parse(t.release)),
      },
    };
  }

  function guessGrade(tries, won) {
    if (!won) return "海猫听了都摇头";
    if (tries === 1) return "读心神探";
    if (tries <= 3) return "人事部资深HR";
    if (tries <= 5) return "档案室常客";
    return "压线过关";
  }

  // results: guessCompare 的结果数组；只含 emoji 与成绩，不含答案名
  function buildGuessShare(opts) {
    const { date, results, won, practice } = opts;
    const label = practice ? "猜干员·练习" : `猜干员 #${date}`;
    const rows = results.map((r) =>
      GUESS_CELL_ORDER.map((k) => GUESS_CELL_EMOJI[r.cells[k].status]).join(""));
    const lines = [
      `${SITE_NAME} · ${label}`,
      won ? `🎯 ${results.length}/${GUESS_MAX_TRIES}` : `🎯 X/${GUESS_MAX_TRIES}`,
      ...rows,
      `评级：${guessGrade(results.length, won)}`,
      SITE_URL,
    ];
    return lines.join("\n");
  }

  // ---------- 玩法 1：语音猜人 ----------

  const VOICE_SEGMENTS = [2, 5, 10, Infinity]; // 分段解锁秒数，Infinity = 完整
  const VOICE_MAX_TRIES = 6;

  // 题池：有中文语音且稀有度 ≥5 的干员，元素 {op, clips}
  function voicePool(ops, voice) {
    const byId = {};
    ops.forEach((o) => { byId[o.id] = o; });
    const pool = [];
    for (const id of Object.keys(voice)) {
      const op = byId[id];
      if (op && op.rarity >= 5 && voice[id].length) pool.push({ op, clips: voice[id] });
    }
    pool.sort((a, b) => a.op.id.localeCompare(b.op.id));
    return pool;
  }

  // 每日题：确定性选干员 + 选语音条
  function voiceDaily(date, pool) {
    const rng = mulberry32(hash32("ak-voice:" + date));
    const entry = pool[Math.floor(rng() * pool.length)];
    const clipIdx = Math.floor(rng() * entry.clips.length);
    return { opId: entry.op.id, clipIdx };
  }

  // 练习题：随机
  function voiceRandom(pool, rand) {
    rand = rand || Math.random;
    const entry = pool[Math.floor(rand() * pool.length)];
    const clipIdx = Math.floor(rand() * entry.clips.length);
    return { opId: entry.op.id, clipIdx };
  }

  function voiceGrade(tries, won) {
    if (!won) return "再多听听";
    if (tries === 1) return "天籁之耳";
    if (tries <= 3) return "资深博士";
    return "勉强及格";
  }

  // rounds: [{type:"guess",ok:bool} | {type:"skip"}]，只含已用的轮次，不含答案名
  function buildVoiceShare(opts) {
    const { date, rounds, won, practice } = opts;
    const label = practice ? "语音猜人·练习" : `语音猜人 #${date}`;
    const marks = rounds.map((r) => (r.type === "skip" ? "⬜" : r.ok ? "🟩" : "🟥")).join("");
    const head = won
      ? `${SITE_NAME} · ${label}\n🎧 ${rounds.length}/${VOICE_MAX_TRIES}`
      : `${SITE_NAME} · ${label}\n🎧 X/${VOICE_MAX_TRIES}`;
    const lines = [head, marks, `评级：${voiceGrade(rounds.length, won)}`, SITE_URL];
    return lines.join("\n");
  }

  // ---------- 玩法 2：人气对决 ----------

  const POP_DAILY_ROUNDS = 10;

  function formatPlay(n) {
    if (n >= 10000) {
      const w = n / 10000;
      // 保留一位小数，整数时不带 .0
      return (Math.round(w * 10) / 10) + "万";
    }
    return String(n);
  }

  // 两个条目能否配对：播放量不同（排除平局）且视频标题不同（排除同活动 PV 互为平局风险对）
  function popPairable(a, b) {
    return a.play !== b.play && a.title !== b.title;
  }

  // 每日固定 10 轮 → 需要 11 个条目串成链，种子决定序列
  function popDailyChain(date, entries) {
    const rng = mulberry32(hash32("ak-pop:" + date));
    const shuffled = shuffle(entries.slice(), rng);
    const chain = [shuffled[0]];
    for (let i = 1; i < shuffled.length && chain.length < POP_DAILY_ROUNDS + 1; i++) {
      if (popPairable(chain[chain.length - 1], shuffled[i])) chain.push(shuffled[i]);
    }
    return chain.map((e) => e.id);
  }

  // 无限模式：随机选一个能与 current 配对的下家
  function popNext(entries, current, rand) {
    rand = rand || Math.random;
    const cands = entries.filter((e) => e.id !== current.id && popPairable(e, current));
    return cands[Math.floor(rand() * cands.length)];
  }

  // 判定：guess ∈ {"higher","lower"}，right 相对 left
  function popJudge(guess, left, right) {
    return (guess === "higher") === (right.play > left.play);
  }

  function popGrade(score, total) {
    if (total && score >= total) return "人气风向标";
    if (score >= 7) return "资深吃谷人";
    if (score >= 4) return "路人博士";
    return "回去补番";
  }

  // trail: [{dir:"higher"|"lower", ok:bool}]
  function buildPopShare(opts) {
    const { date, score, trail, practice } = opts;
    const label = practice ? "人气对决·练习" : `人气对决 #${date}`;
    const scoreText = practice ? `🔥×${score}` : `🔥×${score}/${POP_DAILY_ROUNDS}`;
    const marks = trail.map((t) => (t.dir === "higher" ? "⬆️" : "⬇️") + (t.ok ? "✔️" : "❌")).join("");
    const lines = [
      `${SITE_NAME} · ${label}`,
      scoreText,
      marks,
      `评级：${popGrade(score, practice ? 0 : POP_DAILY_ROUNDS)}`,
      SITE_URL,
    ];
    return lines.join("\n");
  }

  // ---------- 玩法 3：阵营连线 ----------

  const CONN_DIMS = ["faction", "prof", "race", "artist", "cvJp", "cvCn"];
  const CONN_COLORS = ["🟨", "🟩", "🟦", "🟪"]; // 按 groups 顺序的难度色（索引 0 最易）
  const CONN_MAX_MISTAKES = 4;

  function connPuzzleDaily(date, puzzles) {
    return puzzles[dailyIndex(date, puzzles.length, "ak-conn")];
  }

  function connPuzzleRandom(puzzles, rand) {
    rand = rand || Math.random;
    return puzzles[Math.floor(rand() * puzzles.length)];
  }

  // 16 张卡乱序（种子可复现，供每日模式存档）
  function connShuffleMembers(puzzle, rng) {
    const all = puzzle.groups.flatMap((g) => g.members);
    return shuffle(all, rng);
  }

  // 选中的 4 张是否命中某组 → 组索引，未命中 -1
  function connCheck(puzzle, fourIds) {
    if (fourIds.length !== 4) return -1;
    const sel = new Set(fourIds);
    for (let i = 0; i < puzzle.groups.length; i++) {
      if (puzzle.groups[i].members.every((m) => sel.has(m))) return i;
    }
    return -1;
  }

  /*
   * 唯一解校验：枚举 C(16,4) 四人组，合法组 = 4 人共享某 dim 同值（非空）；
   * 统计把 16 人划分成 4 个合法组的 exact-cover 方案数，唯一解时返回 1。
   */
  function connectionsValidate(puzzle, opsById) {
    const members = puzzle.groups.flatMap((g) => g.members);
    if (members.length !== 16 || new Set(members).size !== 16) return -1;
    const valid = [];
    for (let a = 0; a < 13; a++)
      for (let b = a + 1; b < 14; b++)
        for (let c = b + 1; c < 15; c++)
          for (let d = c + 1; d < 16; d++) {
            const four = [members[a], members[b], members[c], members[d]];
            for (const dim of CONN_DIMS) {
              const v = opsById[four[0]] && opsById[four[0]][dim];
              if (v == null || v === "") continue;
              if (four.every((id) => opsById[id] && opsById[id][dim] === v)) {
                valid.push(four);
                break;
              }
            }
          }
    // 回溯统计 exact cover（尽早退出：超过 1 即非唯一解）
    let count = 0;
    const used = new Array(16).fill(false);
    const idxOf = {};
    members.forEach((m, i) => { idxOf[m] = i; });
    (function dfs(start) {
      if (count > 1) return;
      let first = -1;
      for (let i = 0; i < 16; i++) if (!used[i]) { first = i; break; }
      if (first === -1) { count++; return; }
      for (const g of valid) {
        const idxs = g.map((m) => idxOf[m]);
        if (!idxs.includes(first)) continue; // 固定包含第一个空位，避免重复计数
        if (idxs.some((i) => used[i])) continue;
        idxs.forEach((i) => { used[i] = true; });
        dfs(start + 1);
        idxs.forEach((i) => { used[i] = false; });
        if (count > 1) return;
      }
    })(0);
    return count;
  }

  function connGrade(mistakes, won) {
    if (!won) return "简历被退回";
    if (mistakes === 0) return "人事部之星";
    if (mistakes <= 2) return "档案管理员";
    return "见习人事";
  }

  // solveOrder: 按破解顺序的组索引数组；mistakes: 错误次数
  function buildConnShare(opts) {
    const { date, solveOrder, mistakes, won, practice } = opts;
    const label = practice ? "阵营连线·练习" : `阵营连线 #${date}`;
    const rows = solveOrder.map((gi) => CONN_COLORS[gi].repeat(4));
    const lines = [
      `${SITE_NAME} · ${label}`,
      won ? "全部找出！" : `${solveOrder.length}/4 组`,
      ...rows,
      `❌×${mistakes}`,
      `评级：${connGrade(mistakes, won)}`,
      SITE_URL,
    ];
    return lines.join("\n");
  }

  // ---------- 玩法 4：版本排排坐 ----------

  const TL_PICK = 5;
  const TL_MAX_TRIES = 3;
  const TL_MIN_GAP_DAYS = 30;

  // 题池：release 非空的 5★+6★
  function timelinePool(ops) {
    return ops.filter((o) => o.release && o.rarity >= 5);
  }

  function dayDiff(a, b) {
    return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  }

  /*
   * 选 5 个干员：两两实装间隔 ≥30 天（自然带来年份分散）；
   * 极端情况凑不齐时放宽为「日期两两不同」，保证一定能出题。
   */
  function timelinePick(rng, pool) {
    const shuffled = shuffle(pool.slice(), rng);
    const picked = [];
    for (const op of shuffled) {
      if (picked.every((p) => dayDiff(p.release, op.release) >= TL_MIN_GAP_DAYS)) picked.push(op);
      if (picked.length === TL_PICK) return picked;
    }
    for (const op of shuffled) {
      if (picked.includes(op)) continue;
      if (picked.every((p) => p.release !== op.release)) picked.push(op);
      if (picked.length === TL_PICK) return picked;
    }
    return picked; // 理论上不会到这里
  }

  function timelineDaily(date, pool) {
    const rng = mulberry32(hash32("ak-timeline:" + date));
    return timelinePick(rng, pool).map((o) => o.id);
  }

  function timelineRandom(pool, rand) {
    rand = rand || Math.random;
    const rng = mulberry32(Math.floor(rand() * 0xffffffff));
    return timelinePick(rng, pool).map((o) => o.id);
  }

  // 正确顺序（早 → 晚）
  function timelineCorrect(ids, opsById) {
    return ids.slice().sort((a, b) => Date.parse(opsById[a].release) - Date.parse(opsById[b].release));
  }

  // 逐位判定：orderIds 为玩家当前排列，correctIds 为正确顺序
  function timelineMarks(orderIds, correctIds) {
    return orderIds.map((id, i) => id === correctIds[i]);
  }

  function timelineGrade(tries, won) {
    if (!won) return "时间线崩坏";
    if (tries === 1) return "活体年表";
    if (tries === 2) return "剧情考据党";
    return "翻wiki型";
  }

  // attempts: 每次提交的 marks 数组（bool×5）
  function buildTimelineShare(opts) {
    const { date, attempts, won, practice } = opts;
    const label = practice ? "版本排排坐·练习" : `版本排排坐 #${date}`;
    const rows = attempts.map((m) => m.map((b) => (b ? "🟩" : "🟥")).join(""));
    const lines = [
      `${SITE_NAME} · ${label}`,
      won ? `⏳ ${attempts.length}/${TL_MAX_TRIES}` : `⏳ X/${TL_MAX_TRIES}`,
      ...rows,
      `评级：${timelineGrade(attempts.length, won)}`,
      SITE_URL,
    ];
    return lines.join("\n");
  }

  return {
    SITE_NAME, SITE_URL,
    hash32, mulberry32, dateStr, dailyIndex, shuffle, normalize, search,
    // 猜干员
    GUESS_INCLUDE_R4, GUESS_MAX_TRIES, GUESS_CELL_ORDER, GUESS_CELL_LABEL, GUESS_CELL_EMOJI,
    guessPool, guessDaily, guessRandom, cmpNumeric, numCell, subNorm, guessCompare, guessGrade, buildGuessShare,
    // 语音猜人
    VOICE_SEGMENTS, VOICE_MAX_TRIES, voicePool, voiceDaily, voiceRandom, voiceGrade, buildVoiceShare,
    // 人气对决
    POP_DAILY_ROUNDS, formatPlay, popPairable, popDailyChain, popNext, popJudge, popGrade, buildPopShare,
    // 阵营连线
    CONN_DIMS, CONN_COLORS, CONN_MAX_MISTAKES,
    connPuzzleDaily, connPuzzleRandom, connShuffleMembers, connCheck, connectionsValidate,
    connGrade, buildConnShare,
    // 版本排排坐
    TL_PICK, TL_MAX_TRIES, TL_MIN_GAP_DAYS, timelinePool, timelineDaily, timelineRandom,
    timelineCorrect, timelineMarks, timelineGrade, buildTimelineShare, dayDiff,
  };
});
