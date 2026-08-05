/* node 自测：数据完整性 / 四玩法每日确定性 / 连线唯一解 / 排排坐判定 / 分享卡格式 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

// 数据 js 注入假 window（浏览器全局变量的 node 等价物）
const win = {};
for (const f of ["operators", "voice", "popularity", "connections"]) {
  const code = fs.readFileSync(path.join(__dirname, "data", f + ".js"), "utf8");
  new Function("window", code)(win);
}
const { ARK_OPS, ARK_VOICE, ARK_POP, ARK_CONN } = win;
assert(ARK_OPS && ARK_VOICE && ARK_POP && ARK_CONN, "数据全局变量未正确挂载");

const AKG = require("./game.js");

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log("✓", name); }

const byId = {};
ARK_OPS.forEach((o) => { byId[o.id] = o; });

// ---------- 数据完整性 ----------
ok("数据：operators 392 条、id 唯一、字段齐全", () => {
  assert.strictEqual(ARK_OPS.length, 392);
  const ids = new Set();
  for (const o of ARK_OPS) {
    assert(o.id && o.name && [4, 5, 6].includes(o.rarity), "基本字段 " + o.id);
    assert(o.release === null || /^\d{4}-\d{2}-\d{2}$/.test(o.release), "release " + o.id);
    assert(!ids.has(o.id)); ids.add(o.id);
  }
});

ok("数据：popularity 175 条、id 唯一、play 为正整数", () => {
  assert.strictEqual(ARK_POP.entries.length, 175);
  const ids = new Set();
  for (const e of ARK_POP.entries) {
    assert(Number.isInteger(e.play) && e.play > 0, "play " + e.id);
    assert(e.title && e.type && byId[e.id], "字段 " + e.id);
    assert(!ids.has(e.id)); ids.add(e.id);
  }
});

ok("数据：voice.js 每条 f 路径在文件系统存在", () => {
  let total = 0;
  for (const id of Object.keys(ARK_VOICE)) {
    assert(byId[id], "voice 干员不在 operators: " + id);
    for (const v of ARK_VOICE[id]) {
      total++;
      assert(v.f && v.t != null && v.x != null, "voice 字段 " + id);
      assert(fs.existsSync(path.join(__dirname, v.f)), "语音文件缺失 " + v.f);
    }
  }
  assert(total > 600, "语音条数异常: " + total);
});

ok("数据：connections 72 题、每题 4 组 ×4 人、成员都在 operators", () => {
  assert.strictEqual(ARK_CONN.length, 72);
  for (const p of ARK_CONN) {
    assert.strictEqual(p.groups.length, 4);
    for (const g of p.groups) {
      assert.strictEqual(g.members.length, 4);
      assert(AKG.CONN_DIMS.includes(g.dim), "未知 dim " + g.dim);
      g.members.forEach((m) => assert(byId[m], "成员缺失 " + m));
    }
  }
});

// ---------- 每日确定性 ----------
const VPOOL = AKG.voicePool(ARK_OPS, ARK_VOICE);
const TPOOL = AKG.timelinePool(ARK_OPS);

function next30Days() {
  const out = [];
  const d = new Date(2026, 0, 1);
  for (let i = 0; i < 30; i++) { out.push(AKG.dateStr(d)); d.setDate(d.getDate() + 1); }
  return out;
}

ok("确定性：四玩法同一日期两次结果相同", () => {
  const date = "2026-08-05";
  assert.deepStrictEqual(AKG.voiceDaily(date, VPOOL), AKG.voiceDaily(date, VPOOL));
  assert.deepStrictEqual(AKG.popDailyChain(date, ARK_POP.entries), AKG.popDailyChain(date, ARK_POP.entries));
  assert.strictEqual(AKG.connPuzzleDaily(date, ARK_CONN).id, AKG.connPuzzleDaily(date, ARK_CONN).id);
  assert.deepStrictEqual(AKG.timelineDaily(date, TPOOL), AKG.timelineDaily(date, TPOOL));
});

ok("确定性：连续 30 天结果不全部相同", () => {
  const days = next30Days();
  const sets = [
    new Set(days.map((d) => AKG.voiceDaily(d, VPOOL).opId)),
    new Set(days.map((d) => AKG.popDailyChain(d, ARK_POP.entries).join(","))),
    new Set(days.map((d) => AKG.connPuzzleDaily(d, ARK_CONN).id)),
    new Set(days.map((d) => AKG.timelineDaily(d, TPOOL).join(","))),
  ];
  sets.forEach((s, i) => assert(s.size > 1, `玩法 ${i} 30 天结果无变化`));
});

ok("确定性：不同游戏种子互不干扰（salt 独立）", () => {
  const days = next30Days();
  const salts = ["ak-voice", "ak-pop", "ak-conn", "ak-timeline"];
  for (let i = 0; i < salts.length; i++) {
    for (let j = i + 1; j < salts.length; j++) {
      let diff = 0;
      for (const d of days) {
        if (AKG.dailyIndex(d, 100, salts[i]) !== AKG.dailyIndex(d, 100, salts[j])) diff++;
      }
      assert(diff > 20, `${salts[i]} 与 ${salts[j]} 疑似同源: 仅 ${diff}/30 天不同`);
    }
  }
});

ok("确定性：dateStr 本地日期格式", () => {
  assert.strictEqual(AKG.dateStr(new Date(2026, 7, 5)), "2026-08-05");
  assert.strictEqual(AKG.dateStr(new Date(2026, 0, 3)), "2026-01-03");
});

// ---------- 玩法 1：语音猜人 ----------
ok("语音：题池全部稀有度≥5 且有语音，每日题索引合法", () => {
  assert(VPOOL.length >= 200, "题池过小: " + VPOOL.length);
  for (const e of VPOOL) assert(e.op.rarity >= 5 && e.clips.length > 0);
  const pick = AKG.voiceDaily("2026-08-05", VPOOL);
  const entry = VPOOL.find((e) => e.op.id === pick.opId);
  assert(entry && pick.clipIdx >= 0 && pick.clipIdx < entry.clips.length);
});

ok("语音：评级档位", () => {
  assert.strictEqual(AKG.voiceGrade(1, true), "天籁之耳");
  assert.strictEqual(AKG.voiceGrade(3, true), "资深博士");
  assert.strictEqual(AKG.voiceGrade(6, true), "勉强及格");
  assert.strictEqual(AKG.voiceGrade(6, false), "再多听听");
});

ok("语音：分享卡含 SITE_URL 与 🎧，未完成时不泄露答案名", () => {
  const pick = AKG.voiceDaily("2026-08-05", VPOOL);
  const answerName = byId[pick.opId].name;
  // 进行中（未猜中）：只允许分享不含答案的进度
  const mid = AKG.buildVoiceShare({
    date: "2026-08-05", won: false,
    rounds: [{ type: "skip" }, { type: "guess", ok: false }],
  });
  assert(mid.includes(AKG.SITE_URL) && mid.includes("🎧"));
  assert(!mid.includes(answerName), "分享卡泄露答案名");
  assert(mid.split("\n").includes("⬜🟥"));
  const wonCard = AKG.buildVoiceShare({
    date: "2026-08-05", won: true,
    rounds: [{ type: "guess", ok: false }, { type: "guess", ok: true }],
  });
  assert(wonCard.includes("🟥🟩") && wonCard.includes("2/6") && wonCard.includes(AKG.SITE_URL));
});

// ---------- 玩法 2：人气对决 ----------
ok("人气：每日链 11 条、相邻条目播放量与标题均不同", () => {
  for (const d of next30Days()) {
    const chain = AKG.popDailyChain(d, ARK_POP.entries).map((id) => ARK_POP.entries.find((e) => e.id === id));
    assert.strictEqual(chain.length, AKG.POP_DAILY_ROUNDS + 1, "链长度不足 " + d);
    for (let i = 0; i + 1 < chain.length; i++) {
      assert(AKG.popPairable(chain[i], chain[i + 1]), `相邻不可配对 ${d}#${i}`);
    }
  }
});

ok("人气：判定与格式化", () => {
  const a = { id: "a", play: 1000, title: "A" };
  const b = { id: "b", play: 2000, title: "B" };
  assert(AKG.popJudge("higher", a, b) === true);
  assert(AKG.popJudge("lower", a, b) === false);
  assert(AKG.popJudge("lower", b, a) === true);
  assert.strictEqual(AKG.formatPlay(2365000), "236.5万");
  assert.strictEqual(AKG.formatPlay(1980000), "198万");
  const nxt = AKG.popNext(ARK_POP.entries, ARK_POP.entries[0]);
  assert(AKG.popPairable(nxt, ARK_POP.entries[0]));
});

ok("人气：评级与分享卡", () => {
  assert.strictEqual(AKG.popGrade(10, 10), "人气风向标");
  assert.strictEqual(AKG.popGrade(7, 10), "资深吃谷人");
  assert.strictEqual(AKG.popGrade(4, 10), "路人博士");
  assert.strictEqual(AKG.popGrade(1, 10), "回去补番");
  const t = AKG.buildPopShare({
    date: "2026-08-05", score: 2,
    trail: [{ dir: "higher", ok: true }, { dir: "lower", ok: true }, { dir: "higher", ok: false }],
  });
  assert(t.includes(AKG.SITE_URL) && t.includes("🔥×2/10"));
  assert(t.includes("⬆️✔️⬇️✔️⬆️❌"));
});

// ---------- 玩法 3：阵营连线 ----------
ok("连线：全部 72 题唯一解（exact-cover 计数 == 1）", () => {
  for (const p of ARK_CONN) {
    const n = AKG.connectionsValidate(p, byId);
    assert.strictEqual(n, 1, `题 ${p.id} 解数 = ${n}`);
  }
});

ok("连线：命中判定、乱序可复现、评级", () => {
  const p = ARK_CONN[0];
  assert.strictEqual(AKG.connCheck(p, p.groups[0].members), 0);
  assert.strictEqual(AKG.connCheck(p, p.groups[2].members.slice().reverse()), 2);
  const mixed = [p.groups[0].members[0], p.groups[1].members[0], p.groups[2].members[0], p.groups[3].members[0]];
  assert.strictEqual(AKG.connCheck(p, mixed), -1);
  const rng1 = AKG.mulberry32(AKG.hash32("t"));
  const rng2 = AKG.mulberry32(AKG.hash32("t"));
  assert.deepStrictEqual(AKG.connShuffleMembers(p, rng1), AKG.connShuffleMembers(p, rng2));
  assert.strictEqual(AKG.connShuffleMembers(p, rng1).length, 16);
  assert.strictEqual(AKG.connGrade(0, true), "人事部之星");
  assert.strictEqual(AKG.connGrade(2, true), "档案管理员");
  assert.strictEqual(AKG.connGrade(3, true), "见习人事");
  assert.strictEqual(AKG.connGrade(4, false), "简历被退回");
});

ok("连线：分享卡按破解顺序给彩色行，不含答案分组名", () => {
  const p = AKG.connPuzzleDaily("2026-08-05", ARK_CONN);
  const t = AKG.buildConnShare({ date: "2026-08-05", solveOrder: [0, 2], mistakes: 1, won: false });
  const lines = t.split("\n");
  assert(t.includes(AKG.SITE_URL) && t.includes("❌×1"));
  assert(lines.includes("🟨🟨🟨🟨") && lines.includes("🟦🟦🟦🟦"));
  for (const g of p.groups) assert(!t.includes(g.label), "泄露分组名 " + g.label);
});

// ---------- 玩法 4：版本排排坐 ----------
ok("排排坐：每日 5 人、两两间隔 ≥30 天、日期互不相同", () => {
  for (const d of next30Days()) {
    const ids = AKG.timelineDaily(d, TPOOL);
    assert.strictEqual(ids.length, 5);
    assert.strictEqual(new Set(ids).size, 5);
    const dates = ids.map((id) => byId[id].release);
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++)
        assert(AKG.dayDiff(dates[i], dates[j]) >= AKG.TL_MIN_GAP_DAYS, `间隔不足 ${d}: ${dates[i]} vs ${dates[j]}`);
  }
});

ok("排排坐：marks 全对/部分对/全错", () => {
  const ids = AKG.timelineDaily("2026-08-05", TPOOL);
  const correct = AKG.timelineCorrect(ids, byId);
  assert.deepStrictEqual(AKG.timelineMarks(correct, correct), [true, true, true, true, true]);
  const partial = correct.slice();
  [partial[0], partial[1]] = [partial[1], partial[0]]; // 交换前两位
  assert.deepStrictEqual(AKG.timelineMarks(partial, correct), [false, false, true, true, true]);
  const reversed = correct.slice().reverse();
  const marks = AKG.timelineMarks(reversed, correct);
  // 5 个不同日期逆序后只有中位可能不动
  assert(marks.filter(Boolean).length <= 1, "逆序 marks 异常: " + marks);
  assert.deepStrictEqual(AKG.timelineMarks([correct[1], correct[0], correct[3], correct[2], correct[4]], correct),
    [false, false, false, false, true]);
});

ok("排排坐：评级与分享卡不含答案名", () => {
  assert.strictEqual(AKG.timelineGrade(1, true), "活体年表");
  assert.strictEqual(AKG.timelineGrade(2, true), "剧情考据党");
  assert.strictEqual(AKG.timelineGrade(3, true), "翻wiki型");
  assert.strictEqual(AKG.timelineGrade(3, false), "时间线崩坏");
  const ids = AKG.timelineDaily("2026-08-05", TPOOL);
  const t = AKG.buildTimelineShare({
    date: "2026-08-05", won: false,
    attempts: [[true, false, false, true, false], [false, true, false, true, false]],
  });
  assert(t.includes(AKG.SITE_URL));
  assert(t.split("\n").includes("🟩🟥🟥🟩🟥"));
  for (const id of ids) assert(!t.includes(byId[id].name), "泄露干员名 " + byId[id].name);
});

// ---------- 通用搜索 ----------
ok("搜索：前缀优先、排除已猜、空串为空", () => {
  const cands = VPOOL.map((e) => e.op);
  const r = AKG.search(cands, "能", []);
  assert(r.length && r[0].name === "能天使");
  assert.strictEqual(AKG.search(cands, "", []).length, 0);
  const ex = AKG.search(cands, "能天使", [r[0].id]);
  assert(!ex.some((c) => c.id === r[0].id));
});

console.log(`\n全部通过：${passed} 项`);
