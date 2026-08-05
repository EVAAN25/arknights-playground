/* 明日方舟游乐场 —— UI 层（依赖 game.js 的纯逻辑 AKG 与 data/*.js 的全局数据） */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const AKG = window.AKG;

  const OPS = window.ARK_OPS;
  const byId = {};
  OPS.forEach((o) => { byId[o.id] = o; });
  const POP_BY_ID = {};
  window.ARK_POP.entries.forEach((e) => { POP_BY_ID[e.id] = e; });
  const CONN_BY_ID = {};
  window.ARK_CONN.forEach((p) => { CONN_BY_ID[p.id] = p; });
  const VPOOL = AKG.voicePool(OPS, window.ARK_VOICE);
  const TPOOL = AKG.timelinePool(OPS);
  const GPOOL = AKG.guessPool(OPS);

  // ---------- 本地存储（file:// 下也尽量可用，失败降级为内存） ----------
  const store = (() => {
    try { localStorage.setItem("ak.__t", "1"); localStorage.removeItem("ak.__t"); }
    catch (e) { const m = {}; return { get: (k) => m[k], set: (k, v) => { m[k] = v; } }; }
    return {
      get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    };
  })();
  function loadJSON(k, fallback) {
    try { const v = JSON.parse(store.get(k)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  const TODAY = AKG.dateStr();
  const dkey = (game) => `ak_${game}_${TODAY}`;

  // ---------- 头像（缺失时换成首字圆形色块） ----------
  const AV_COLORS = ["#1f2a44", "#a37f27", "#4c8a52", "#7d5ba6", "#4a6a9e", "#8f5135"];
  window.__akAv = function (img) {
    const name = img.dataset.name || "?";
    const h = AKG.hash32(img.dataset.id || name);
    const div = document.createElement("div");
    div.className = img.className.replace(/\bavatar\b/, "avatar-fallback");
    div.style.background = AV_COLORS[h % AV_COLORS.length];
    div.textContent = name[0];
    img.replaceWith(div);
  };
  function avatarHTML(op, extraCls) {
    return `<img class="avatar ${extraCls || ""}" loading="lazy" src="assets/avatars/${op.id}.png"
      alt="${op.name}" data-id="${op.id}" data-name="${op.name}" onerror="window.__akAv(this)">`;
  }

  // ---------- 复制与提示 ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("复制失败，请手动复制"); }
    document.body.removeChild(ta);
  }
  function copyText(text) {
    const done = () => toast("分享卡已复制，去粘贴吧");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }

  function stars(r) { return "★".repeat(r); }

  // 输入框错误抖动（≤300ms）
  function shakeInput(input) {
    input.classList.add("shake");
    setTimeout(() => input.classList.remove("shake"), 320);
  }

  /* ================================================================
   * 玩法 0：猜干员（wordle 七维比对）
   * state = {targetId, guesses:[id...], results:[...], status}
   * ================================================================ */
  const Guess = { mode: "daily", daily: null, practice: null, sugItems: [], sugIndex: -1 };

  function gState() { return Guess.mode === "daily" ? Guess.daily : Guess.practice; }
  function gTarget() { return byId[gState().targetId]; }
  function gPersist() { if (Guess.mode === "daily") store.set(dkey("guess"), JSON.stringify(Guess.daily)); }

  function guessNewState(targetId) { return { targetId, guesses: [], results: [], status: "playing" }; }

  function guessInit() {
    const targetId = AKG.guessDaily(TODAY, GPOOL);
    const saved = loadJSON(dkey("guess"), null);
    Guess.daily = (saved && saved.targetId === targetId) ? saved : guessNewState(targetId);
  }

  function guessNewPractice() { Guess.practice = guessNewState(AKG.guessRandom(GPOOL)); }

  // 单元格内容：数值维度带箭头
  function gCellHTML(cell, text) {
    let arrow = "";
    if (cell.status === "up") arrow = '<span class="arrow">⬆</span>';
    if (cell.status === "down") arrow = '<span class="arrow">⬇</span>';
    return `<div class="cell ${cell.status}"><span>${text}</span>${arrow}</div>`;
  }

  function gRowHTML(c, res) {
    const cells = res.cells;
    return `<div class="row guess-grid">
      <div class="cell name">${avatarHTML(c)}<span>${c.name}</span></div>
      ${gCellHTML(cells.rarity, c.rarity + "★")}
      ${gCellHTML(cells.prof, c.prof)}
      ${gCellHTML(cells.sub, AKG.subNorm(c.sub))}
      ${gCellHTML(cells.faction, c.faction)}
      ${gCellHTML(cells.race, c.race)}
      ${gCellHTML(cells.sex, c.sex)}
      ${gCellHTML(cells.release, c.release)}
    </div>`;
  }

  function guessRender() {
    const s = gState();
    $("#guessBanner").innerHTML = Guess.mode === "daily"
      ? `今日题目 <b>#${TODAY}</b> · 全站同题 · 进度自动保存`
      : `练习模式 · 随机出题 · 不计入每日成绩`;
    const left = AKG.GUESS_MAX_TRIES - s.guesses.length;
    $("#guessTries").innerHTML = `剩 <b>${left}</b> / ${AKG.GUESS_MAX_TRIES} 次`;
    $("#guessRows").innerHTML = s.guesses.map((id, i) => gRowHTML(byId[id], s.results[i])).join("");
    const playing = s.status === "playing";
    $("#guessInput").disabled = !playing;
    $("#guessInput").placeholder = playing ? "输入干员名，如：能天使" : "本局已结束";
    if (playing) $("#guessResult").classList.add("hidden");
    else guessRenderResult();
    gCloseSuggest();
  }

  function guessRenderResult() {
    const s = gState();
    const t = gTarget();
    const won = s.status === "won";
    const tries = s.guesses.length;
    $("#guessResult").innerHTML = `
      ${avatarHTML(t, "r-portrait")}
      <h2>${won ? "猜中了！" : "揭晓答案"}：${t.name}</h2>
      <p class="r-meta">${stars(t.rarity)} · ${t.faction} · ${t.prof} · ${AKG.subNorm(t.sub)} · ${t.race} · ${t.sex} · ${t.release} 实装</p>
      <p class="r-grade">${won ? tries : "X"}/${AKG.GUESS_MAX_TRIES} 次 · 评级 <b>${AKG.guessGrade(tries, won)}</b></p>
      <div class="btn-row">
        <button class="btn" id="guessShareBtn">复制分享卡</button>
        <button class="btn ghost" id="guessAgainBtn">${Guess.mode === "daily" ? "练习模式再来一题" : "再来一题"}</button>
      </div>`;
    $("#guessResult").classList.remove("hidden");
    $("#guessShareBtn").onclick = () => copyText(AKG.buildGuessShare({
      date: TODAY, results: s.results, won, practice: Guess.mode === "practice",
    }));
    $("#guessAgainBtn").onclick = () => {
      if (Guess.mode === "daily") guessSetMode("practice");
      else { guessNewPractice(); guessRender(); }
    };
  }

  function guessSubmit(id) {
    const s = gState();
    if (!s || s.status !== "playing") return;
    if (s.guesses.includes(id)) { toast("这位干员已经猜过了"); return; }
    const res = AKG.guessCompare(byId[id], gTarget());
    s.guesses.push(id);
    s.results.push(res);
    if (res.win) s.status = "won";
    else {
      if (s.guesses.length >= AKG.GUESS_MAX_TRIES) s.status = "lost";
      shakeInput($("#guessInput"));
    }
    gPersist();
    guessRender();
  }

  // 自动补全（题池内干员，带头像）
  function gCloseSuggest() { $("#guessSuggest").classList.add("hidden"); Guess.sugItems = []; Guess.sugIndex = -1; }
  function gOpenSuggest(list) {
    Guess.sugItems = list;
    Guess.sugIndex = list.length ? 0 : -1;
    const ul = $("#guessSuggest");
    ul.innerHTML = list.map((c, i) => `
      <li data-id="${c.id}" class="${i === Guess.sugIndex ? "active" : ""}">
        ${avatarHTML(c)}
        <span class="s-name">${c.name}</span>
        <span class="s-meta">${c.rarity}★ ${c.prof}</span>
      </li>`).join("");
    ul.classList.toggle("hidden", !list.length);
    ul.querySelectorAll("li").forEach((li) => {
      li.addEventListener("pointerdown", (e) => { e.preventDefault(); gPick(li.dataset.id); });
    });
  }
  function gMoveSuggest(delta) {
    if (!Guess.sugItems.length) return;
    Guess.sugIndex = (Guess.sugIndex + delta + Guess.sugItems.length) % Guess.sugItems.length;
    $("#guessSuggest").querySelectorAll("li").forEach((li, i) =>
      li.classList.toggle("active", i === Guess.sugIndex));
  }
  function gPick(id) {
    $("#guessInput").value = "";
    gCloseSuggest();
    guessSubmit(id);
  }
  function guessBindInput() {
    const input = $("#guessInput");
    const guessed = () => gState().guesses;
    input.addEventListener("input", () => gOpenSuggest(AKG.search(GPOOL, input.value, guessed())));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); gMoveSuggest(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); gMoveSuggest(-1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (Guess.sugItems.length) gPick(Guess.sugItems[Math.max(Guess.sugIndex, 0)].id);
        else {
          const m = AKG.search(GPOOL, input.value, guessed(), 1);
          if (m.length) gPick(m[0].id);
        }
      } else if (e.key === "Escape") gCloseSuggest();
    });
    input.addEventListener("blur", () => setTimeout(gCloseSuggest, 120));
    input.addEventListener("focus", () => {
      if (input.value) gOpenSuggest(AKG.search(GPOOL, input.value, guessed()));
    });
  }

  function guessSetMode(mode) {
    Guess.mode = mode;
    if (mode === "practice" && !Guess.practice) guessNewPractice();
    syncModeTabs("guess");
    guessRender();
  }

  /* ================================================================
   * 玩法 1：语音猜人
   * state = {opId, clipIdx, rounds:[{id?,type:"guess"|"skip",ok?}], status}
   * ================================================================ */
  const Voice = {
    mode: "daily", daily: null, practice: null, audio: null,
    sugItems: [], sugIndex: -1,
  };

  function vState() { return Voice.mode === "daily" ? Voice.daily : Voice.practice; }
  function vClip() {
    const s = vState();
    return window.ARK_VOICE[s.opId][s.clipIdx];
  }
  function vSeg() { return Math.min(vState().rounds.length, AKG.VOICE_SEGMENTS.length - 1); }
  function vPersist() { if (Voice.mode === "daily") store.set(dkey("voice"), JSON.stringify(Voice.daily)); }

  function voiceInit() {
    const pick = AKG.voiceDaily(TODAY, VPOOL);
    const saved = loadJSON(dkey("voice"), null);
    Voice.daily = (saved && saved.opId === pick.opId && saved.clipIdx === pick.clipIdx)
      ? saved
      : { opId: pick.opId, clipIdx: pick.clipIdx, rounds: [], status: "playing" };
  }

  function voiceNewPractice() {
    const pick = AKG.voiceRandom(VPOOL);
    Voice.practice = { opId: pick.opId, clipIdx: pick.clipIdx, rounds: [], status: "playing" };
  }

  function voiceStopAudio() {
    if (Voice.audio) { Voice.audio.pause(); Voice.audio = null; }
    $("#voicePlayBtn").textContent = "▶ 播放片段";
  }

  function voicePlay() {
    const s = vState();
    if (!s) return;
    voiceStopAudio();
    const clip = vClip();
    const limit = AKG.VOICE_SEGMENTS[vSeg()];
    const audio = new Audio(clip.f);
    Voice.audio = audio;
    if (isFinite(limit)) {
      audio.addEventListener("timeupdate", () => {
        if (audio.currentTime >= limit) { audio.pause(); voiceStopAudio(); }
      });
    }
    audio.addEventListener("ended", () => voiceStopAudio());
    audio.play().then(() => { $("#voicePlayBtn").textContent = "⏸ 停止"; }, () => toast("音频加载失败，试试本地服务器访问"));
  }

  function voiceRender() {
    voiceStopAudio();
    const s = vState();
    $("#voiceBanner").innerHTML = Voice.mode === "daily"
      ? `今日题目 <b>#${TODAY}</b> · 全站同题 · 进度自动保存`
      : `练习模式 · 随机出题 · 不计入每日成绩`;
    // 分段进度条
    const labels = ["2 秒", "5 秒", "10 秒", "完整"];
    const seg = vSeg();
    $("#voiceSegBar").innerHTML = labels.map((t, i) =>
      `<div class="seg ${i <= seg ? "on" : ""}">${t}</div>`).join("");
    // 机会与已猜记录
    const left = AKG.VOICE_MAX_TRIES - s.rounds.length;
    $("#voiceTries").innerHTML = `剩 <b>${left}</b> / ${AKG.VOICE_MAX_TRIES} 次`;
    $("#voiceRounds").innerHTML = s.rounds.map((r) => {
      if (r.type === "skip") return `<span class="chip skip">⏭ 跳过</span>`;
      const name = byId[r.id].name;
      return `<span class="chip ${r.ok ? "hit" : "wrong"}">${r.ok ? "🟩" : "❌"} ${name}</span>`;
    }).join("");
    // 最后一次机会前：文字台词兜底提示
    const hint = $("#voiceHint");
    if (s.status === "playing" && s.rounds.length === AKG.VOICE_MAX_TRIES - 1) {
      const clip = vClip();
      hint.innerHTML = `<b>文字提示</b>（${clip.t}）：「${clip.x}」`;
      hint.classList.remove("hidden");
    } else hint.classList.add("hidden");
    // 输入区
    const playing = s.status === "playing";
    $("#voiceInput").disabled = !playing;
    $("#voiceSkipBtn").disabled = !playing;
    if (playing) $("#voiceResult").classList.add("hidden");
    else voiceRenderResult();
    vCloseSuggest();
  }

  function voiceRenderResult() {
    const s = vState();
    const op = byId[s.opId];
    const clip = vClip();
    const won = s.status === "won";
    const tries = s.rounds.length;
    $("#voiceResult").innerHTML = `
      ${avatarHTML(op, "r-portrait")}
      <h2>${won ? "猜中了！" : "揭晓答案"}：${op.name}</h2>
      <p class="r-meta">${stars(op.rarity)} · ${op.faction} · ${op.prof} · ${op.sub}</p>
      <p class="r-quote">「${clip.x}」<br><small>—— 语音：${clip.t}</small></p>
      <p class="r-grade">${won ? tries : "X"}/${AKG.VOICE_MAX_TRIES} 次 · 评级 <b>${AKG.voiceGrade(tries, won)}</b></p>
      <div class="btn-row">
        <button class="btn" id="voiceShareBtn">复制分享卡</button>
        <button class="btn ghost" id="voiceAgainBtn">${Voice.mode === "daily" ? "练习模式再来一题" : "再来一题"}</button>
      </div>`;
    $("#voiceResult").classList.remove("hidden");
    $("#voiceShareBtn").onclick = () => copyText(AKG.buildVoiceShare({
      date: TODAY, rounds: s.rounds, won, practice: Voice.mode === "practice",
    }));
    $("#voiceAgainBtn").onclick = () => {
      if (Voice.mode === "daily") voiceSetMode("practice");
      else { voiceNewPractice(); voiceRender(); }
    };
  }

  function voiceSubmit(id) {
    const s = vState();
    if (!s || s.status !== "playing") return;
    if (s.rounds.some((r) => r.id === id)) { toast("这位干员已经猜过了"); return; }
    const ok = id === s.opId;
    s.rounds.push({ id, type: "guess", ok });
    if (ok) s.status = "won";
    else if (s.rounds.length >= AKG.VOICE_MAX_TRIES) s.status = "lost";
    else if (s.rounds.length <= 3) toast(`不对，已解锁 ${["5 秒", "10 秒", "完整"][s.rounds.length - 1]} 片段`);
    else toast("不对");
    vPersist();
    voiceRender();
  }

  function voiceSkip() {
    const s = vState();
    if (!s || s.status !== "playing") return;
    s.rounds.push({ type: "skip" });
    if (s.rounds.length >= AKG.VOICE_MAX_TRIES) s.status = "lost";
    vPersist();
    voiceRender();
  }

  // 自动补全（仅题池内干员）
  const V_CANDS = VPOOL.map((e) => e.op);
  function vCloseSuggest() { $("#voiceSuggest").classList.add("hidden"); Voice.sugItems = []; Voice.sugIndex = -1; }
  function vOpenSuggest(list) {
    Voice.sugItems = list;
    Voice.sugIndex = list.length ? 0 : -1;
    const ul = $("#voiceSuggest");
    ul.innerHTML = list.map((c, i) => `
      <li data-id="${c.id}" class="${i === Voice.sugIndex ? "active" : ""}">
        ${avatarHTML(c)}
        <span class="s-name">${c.name}</span>
        <span class="s-meta">${c.rarity}★ ${c.prof}</span>
      </li>`).join("");
    ul.classList.toggle("hidden", !list.length);
    ul.querySelectorAll("li").forEach((li) => {
      li.addEventListener("pointerdown", (e) => { e.preventDefault(); vPick(li.dataset.id); });
    });
  }
  function vPick(id) {
    $("#voiceInput").value = "";
    vCloseSuggest();
    voiceSubmit(id);
  }
  function voiceBindInput() {
    const input = $("#voiceInput");
    const guessed = () => vState().rounds.map((r) => r.id).filter(Boolean);
    input.addEventListener("input", () => vOpenSuggest(AKG.search(V_CANDS, input.value, guessed())));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); vMoveSuggest(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); vMoveSuggest(-1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (Voice.sugItems.length) vPick(Voice.sugItems[Math.max(Voice.sugIndex, 0)].id);
        else {
          const m = AKG.search(V_CANDS, input.value, guessed(), 1);
          if (m.length) vPick(m[0].id);
        }
      } else if (e.key === "Escape") vCloseSuggest();
    });
    input.addEventListener("blur", () => setTimeout(vCloseSuggest, 120));
  }
  function vMoveSuggest(delta) {
    if (!Voice.sugItems.length) return;
    Voice.sugIndex = (Voice.sugIndex + delta + Voice.sugItems.length) % Voice.sugItems.length;
    $("#voiceSuggest").querySelectorAll("li").forEach((li, i) =>
      li.classList.toggle("active", i === Voice.sugIndex));
  }

  function voiceSetMode(mode) {
    Voice.mode = mode;
    if (mode === "practice" && !Voice.practice) voiceNewPractice();
    syncModeTabs("voice");
    voiceRender();
  }

  /* ================================================================
   * 玩法 2：人气对决
   * daily    = {chain:[11 ids], pos, score, trail:[{dir,ok}], status}
   * practice = {leftId, rightId, streak, trail, status}
   * ================================================================ */
  const Pop = { mode: "daily", daily: null, practice: null };

  function pState() { return Pop.mode === "daily" ? Pop.daily : Pop.practice; }
  function pPair() {
    const s = pState();
    if (Pop.mode === "daily") {
      // 全胜时 pos 已指到最后一轮之后，钳制回最后一对用于结算展示
      const i = Math.min(s.pos, s.chain.length - 2);
      return [POP_BY_ID[s.chain[i]], POP_BY_ID[s.chain[i + 1]]];
    }
    return [POP_BY_ID[s.leftId], POP_BY_ID[s.rightId]];
  }
  function pPersist() { if (Pop.mode === "daily") store.set(dkey("pop"), JSON.stringify(Pop.daily)); }

  function popInit() {
    const chain = AKG.popDailyChain(TODAY, window.ARK_POP.entries);
    const saved = loadJSON(dkey("pop"), null);
    Pop.daily = (saved && JSON.stringify(saved.chain) === JSON.stringify(chain))
      ? saved
      : { chain, pos: 0, score: 0, trail: [], status: "playing" };
  }

  function popNewPractice() {
    const entries = window.ARK_POP.entries;
    const left = entries[Math.floor(Math.random() * entries.length)];
    const right = AKG.popNext(entries, left);
    Pop.practice = { leftId: left.id, rightId: right.id, streak: 0, trail: [], status: "playing" };
  }

  function popCardHTML(e, side, reveal) {
    const playPart = (side === "left" || reveal)
      ? `<div class="pop-play">${AKG.formatPlay(e.play)}<small>次播放</small></div>`
      : `<div class="pop-play unknown">？</div>`;
    const titlePart = reveal
      ? `<p class="pop-title">[${e.type}] ${e.title}</p>` : "";
    return `${avatarHTML(byId[e.id])}<div class="pop-name">${e.name}</div>${playPart}${titlePart}`;
  }

  function popRender(reveal) {
    const s = pState();
    const [left, right] = pPair();
    const done = s.status !== "playing";
    $("#popBanner").innerHTML = Pop.mode === "daily"
      ? `今日题目 <b>#${TODAY}</b> · 固定 ${AKG.POP_DAILY_ROUNDS} 轮 · 答错即结算`
      : `练习模式 · 直到答错 · 最高连击 <b>${loadJSON("ak_pop_best", 0)}</b>`;
    $("#popLeft").innerHTML = popCardHTML(left, "left", done);
    $("#popRight").innerHTML = popCardHTML(right, "right", done || reveal);
    $("#popActions").classList.toggle("hidden", done);
    $("#popStreak").innerHTML = Pop.mode === "daily"
      ? `第 <b>${Math.min(s.pos + 1, AKG.POP_DAILY_ROUNDS)}</b> / ${AKG.POP_DAILY_ROUNDS} 轮 · 已连对 ${s.score}`
      : `当前连击 <b>${s.streak}</b>`;
    if (done) popRenderResult();
    else $("#popResult").classList.add("hidden");
  }

  function popRenderResult() {
    const s = pState();
    const [left, right] = pPair();
    const score = Pop.mode === "daily" ? s.score : s.streak;
    const won = Pop.mode === "daily" && s.status === "won";
    const bestLine = Pop.mode === "practice"
      ? `<p class="r-meta">历史最高连击：${loadJSON("ak_pop_best", 0)}</p>` : "";
    $("#popResult").innerHTML = `
      <h2>${won ? "十轮全对，太强了！" : `答错了，连击定格在 ${score}`}</h2>
      <p class="r-meta">${left.name} ${AKG.formatPlay(left.play)} ｜ ${right.name} ${AKG.formatPlay(right.play)}</p>
      <p class="r-quote">
        [${left.type}] ${left.title}<br>
        [${right.type}] ${right.title}
      </p>
      <p class="r-grade">评级 <b>${AKG.popGrade(score, Pop.mode === "daily" ? AKG.POP_DAILY_ROUNDS : 0)}</b></p>
      ${bestLine}
      <div class="btn-row">
        <button class="btn" id="popShareBtn">复制分享卡</button>
        <button class="btn ghost" id="popAgainBtn">${Pop.mode === "daily" ? "去练习模式冲连击" : "再来一局"}</button>
      </div>`;
    $("#popResult").classList.remove("hidden");
    $("#popShareBtn").onclick = () => copyText(AKG.buildPopShare({
      date: TODAY, score, trail: s.trail, practice: Pop.mode === "practice",
    }));
    $("#popAgainBtn").onclick = () => {
      if (Pop.mode === "daily") popSetMode("practice");
      else { popNewPractice(); popRender(); }
    };
  }

  function popAnswer(dir) {
    const s = pState();
    if (!s || s.status !== "playing") return;
    const [left, right] = pPair();
    const ok = AKG.popJudge(dir, left, right);
    s.trail.push({ dir, ok });
    if (Pop.mode === "daily") {
      if (ok) {
        s.score++;
        s.pos++;
        if (s.pos >= AKG.POP_DAILY_ROUNDS) s.status = "won";
      } else s.status = "lost";
      pPersist();
      popRender(!ok); // 答错瞬间先揭示右边播放量，随后结算
    } else {
      if (ok) {
        s.streak++;
        s.leftId = s.rightId;
        s.rightId = AKG.popNext(window.ARK_POP.entries, right).id;
        popRender();
      } else {
        s.status = "lost";
        const best = loadJSON("ak_pop_best", 0);
        if (s.streak > best) store.set("ak_pop_best", JSON.stringify(s.streak));
        popRender(true);
      }
    }
  }

  function popSetMode(mode) {
    Pop.mode = mode;
    if (mode === "practice" && !Pop.practice) popNewPractice();
    syncModeTabs("pop");
    popRender();
  }

  /* ================================================================
   * 玩法 3：阵营连线
   * state = {puzzleId, order:[16 ids], solved:[组索引...], mistakes, status}
   * ================================================================ */
  const Conn = { mode: "daily", daily: null, practice: null, sel: new Set() };

  function cState() { return Conn.mode === "daily" ? Conn.daily : Conn.practice; }
  function cPuzzle() { return CONN_BY_ID[cState().puzzleId]; }
  function cPersist() { if (Conn.mode === "daily") store.set(dkey("conn"), JSON.stringify(Conn.daily)); }

  function connNewState(puzzle, rng) {
    return {
      puzzleId: puzzle.id,
      order: AKG.connShuffleMembers(puzzle, rng),
      solved: [], solveLog: [], mistakes: 0, status: "playing",
    };
  }

  function connInit() {
    const puzzle = AKG.connPuzzleDaily(TODAY, window.ARK_CONN);
    const saved = loadJSON(dkey("conn"), null);
    Conn.daily = (saved && saved.puzzleId === puzzle.id)
      ? saved
      : connNewState(puzzle, AKG.mulberry32(AKG.hash32("ak-conn-order:" + TODAY)));
  }

  function connNewPractice() {
    const puzzle = AKG.connPuzzleRandom(window.ARK_CONN);
    Conn.practice = connNewState(puzzle, AKG.mulberry32((Math.random() * 0xffffffff) >>> 0));
  }

  function connRender() {
    const s = cState();
    const puzzle = cPuzzle();
    Conn.sel = new Set([...Conn.sel].filter((id) => cRemaining().includes(id)));
    $("#connBanner").innerHTML = Conn.mode === "daily"
      ? `今日题目 <b>#${TODAY}</b> · 找出 4 组四人羁绊 · 错满 ${AKG.CONN_MAX_MISTAKES} 次判负`
      : `练习模式 · 随机题目 · 不计入每日成绩`;
    // 已解出的组
    $("#connSolved").innerHTML = s.solved.map((gi) => {
      const g = puzzle.groups[gi];
      return `<div class="conn-row c${gi}"><b>${g.dimLabel} · ${g.label}</b>
        <span>${g.members.map((m) => byId[m].name).join("、")}</span></div>`;
    }).join("");
    // 剩余卡片
    const remaining = cRemaining();
    $("#connGrid").innerHTML = remaining.map((id) =>
      `<div class="conn-card ${Conn.sel.has(id) ? "sel" : ""}" data-id="${id}">${byId[id].name}</div>`).join("");
    $("#connGrid").querySelectorAll(".conn-card").forEach((el) => {
      el.addEventListener("click", () => connToggle(el.dataset.id));
    });
    $("#connMistakes").textContent = "❌".repeat(s.mistakes) + "○".repeat(Math.max(0, AKG.CONN_MAX_MISTAKES - s.mistakes));
    const playing = s.status === "playing";
    $("#connSubmit").disabled = !playing || Conn.sel.size !== 4;
    $("#connDeselect").disabled = !playing;
    $("#connShuffle").disabled = !playing;
    if (!playing) connRenderResult();
    else $("#connResult").classList.add("hidden");
  }

  function cRemaining() {
    const s = cState();
    const solvedMembers = new Set(s.solved.flatMap((gi) => cPuzzle().groups[gi].members));
    return s.order.filter((id) => !solvedMembers.has(id));
  }

  function connToggle(id) {
    const s = cState();
    if (s.status !== "playing") return;
    if (Conn.sel.has(id)) Conn.sel.delete(id);
    else if (Conn.sel.size < 4) Conn.sel.add(id);
    else { toast("最多选 4 张"); return; }
    connRender();
  }

  function connSubmit() {
    const s = cState();
    if (s.status !== "playing" || Conn.sel.size !== 4) return;
    const gi = AKG.connCheck(cPuzzle(), [...Conn.sel]);
    if (gi >= 0 && !s.solved.includes(gi)) {
      s.solved.push(gi);
      s.solveLog.push(gi);
      Conn.sel.clear();
      if (s.solved.length === 4) s.status = "won";
      toast("找出一组！");
    } else {
      s.mistakes++;
      Conn.sel.clear();
      if (s.mistakes >= AKG.CONN_MAX_MISTAKES) {
        s.status = "lost";
        // 判负：揭示全部未解出的组
        const puzzle = cPuzzle();
        for (let i = 0; i < 4; i++) if (!s.solved.includes(i)) s.solved.push(i);
      } else {
        toast("不是一组，再想想");
        $("#connGrid").classList.add("shake");
        setTimeout(() => $("#connGrid").classList.remove("shake"), 450);
      }
    }
    cPersist();
    connRender();
  }

  function connRenderResult() {
    const s = cState();
    const won = s.status === "won";
    $("#connResult").innerHTML = `
      <h2>${won ? "全部找出！" : "揭晓全部答案"}</h2>
      <p class="r-grade">错误 ${s.mistakes} 次 · 评级 <b>${AKG.connGrade(s.mistakes, won)}</b></p>
      <div class="btn-row">
        <button class="btn" id="connShareBtn">复制分享卡</button>
        <button class="btn ghost" id="connAgainBtn">${Conn.mode === "daily" ? "练习模式再来一题" : "再来一题"}</button>
      </div>`;
    $("#connResult").classList.remove("hidden");
    $("#connShareBtn").onclick = () => {
      // 分享卡按破解顺序；判负时只含已破解的组
      copyText(AKG.buildConnShare({
        date: TODAY, solveOrder: s.solveLog || [], mistakes: s.mistakes, won, practice: Conn.mode === "practice",
      }));
    };
    $("#connAgainBtn").onclick = () => {
      if (Conn.mode === "daily") connSetMode("practice");
      else { connNewPractice(); connRender(); }
    };
  }

  function connSetMode(mode) {
    Conn.mode = mode;
    if (mode === "practice" && !Conn.practice) connNewPractice();
    Conn.sel.clear();
    syncModeTabs("conn");
    connRender();
  }

  /* ================================================================
   * 玩法 4：版本排排坐
   * state = {ids:[5]（当前排列）, attempts:[marks...], status}
   * ================================================================ */
  const Tl = { mode: "daily", daily: null, practice: null, sel: -1 };

  function tState() { return Tl.mode === "daily" ? Tl.daily : Tl.practice; }
  function tCorrect() { return AKG.timelineCorrect(tState().ids, byId); }
  function tPersist() { if (Tl.mode === "daily") store.set(dkey("tl"), JSON.stringify(Tl.daily)); }

  function tlInit() {
    const pick = AKG.timelineDaily(TODAY, TPOOL);
    const key = pick.slice().sort().join(",");
    const saved = loadJSON(dkey("tl"), null);
    if (saved && saved.ids.slice().sort().join(",") === key) Tl.daily = saved;
    else {
      // 初始乱序：若恰好已排对则交换前两张
      const ids = pick.slice();
      const rng = AKG.mulberry32(AKG.hash32("ak-tl-order:" + TODAY));
      AKG.shuffle(ids, rng);
      if (AKG.timelineMarks(ids, AKG.timelineCorrect(ids, byId)).every(Boolean)) [ids[0], ids[1]] = [ids[1], ids[0]];
      Tl.daily = { ids, attempts: [], status: "playing" };
    }
  }

  function tlNewPractice() {
    const ids = AKG.timelineRandom(TPOOL);
    const correct = AKG.timelineCorrect(ids, byId);
    if (AKG.timelineMarks(ids, correct).every(Boolean)) [ids[0], ids[1]] = [ids[1], ids[0]];
    Tl.practice = { ids, attempts: [], status: "playing" };
  }

  function tlRender() {
    const s = tState();
    Tl.sel = -1;
    $("#tlBanner").innerHTML = Tl.mode === "daily"
      ? `今日题目 <b>#${TODAY}</b> · 点两张卡片交换位置 · 按实装日期上早下晚`
      : `练习模式 · 随机出题 · 点两张卡片交换位置 · 上早下晚`;
    const done = s.status !== "playing";
    $("#tlList").innerHTML = s.ids.map((id, i) => {
      const op = byId[id];
      return `<div class="tl-card ${done ? "done" : ""}" data-i="${i}">
        <span class="pos">${i + 1}</span>
        ${avatarHTML(op)}
        <span class="tname">${op.name}</span>
        ${done ? `<span class="tdate">${op.release}</span>` : ""}
      </div>`;
    }).join("");
    if (!done) {
      $("#tlList").querySelectorAll(".tl-card").forEach((el) => {
        el.addEventListener("click", () => tlTap(Number(el.dataset.i)));
      });
    }
    const left = AKG.TL_MAX_TRIES - s.attempts.length;
    $("#tlTries").innerHTML = `剩 <b>${left}</b> / ${AKG.TL_MAX_TRIES} 次提交`;
    $("#tlSubmit").disabled = done;
    $("#tlAttempts").innerHTML = s.attempts.map((m) =>
      `<div class="tl-marks">${m.map((b) => (b ? "🟩" : "🟥")).join("")}</div>`).join("");
    if (done) tlRenderResult();
    else $("#tlResult").classList.add("hidden");
  }

  function tlTap(i) {
    if (Tl.sel === -1) {
      Tl.sel = i;
      $("#tlList").querySelectorAll(".tl-card")[i].classList.add("sel");
    } else if (Tl.sel === i) {
      Tl.sel = -1;
      $("#tlList").querySelectorAll(".tl-card")[i].classList.remove("sel");
    } else {
      const s = tState();
      [s.ids[Tl.sel], s.ids[i]] = [s.ids[i], s.ids[Tl.sel]];
      tPersist();
      tlRender();
    }
  }

  function tlSubmit() {
    const s = tState();
    if (s.status !== "playing") return;
    const marks = AKG.timelineMarks(s.ids, tCorrect());
    s.attempts.push(marks);
    if (marks.every(Boolean)) s.status = "won";
    else if (s.attempts.length >= AKG.TL_MAX_TRIES) {
      s.status = "lost";
      s.ids = tCorrect(); // 揭示正确顺序
    }
    tPersist();
    tlRender();
  }

  function tlRenderResult() {
    const s = tState();
    const won = s.status === "won";
    $("#tlResult").innerHTML = `
      <h2>${won ? "排序正确！" : "时间线崩坏，正确顺序已揭示"}</h2>
      <p class="r-meta">${s.ids.map((id) => `${byId[id].name}（${byId[id].release}）`).join(" → ")}</p>
      <p class="r-grade">${won ? s.attempts.length : "X"}/${AKG.TL_MAX_TRIES} 次 · 评级 <b>${AKG.timelineGrade(s.attempts.length, won)}</b></p>
      <div class="btn-row">
        <button class="btn" id="tlShareBtn">复制分享卡</button>
        <button class="btn ghost" id="tlAgainBtn">${Tl.mode === "daily" ? "练习模式再来一题" : "再来一题"}</button>
      </div>`;
    $("#tlResult").classList.remove("hidden");
    $("#tlShareBtn").onclick = () => copyText(AKG.buildTimelineShare({
      date: TODAY, attempts: s.attempts, won, practice: Tl.mode === "practice",
    }));
    $("#tlAgainBtn").onclick = () => {
      if (Tl.mode === "daily") tlSetMode("practice");
      else { tlNewPractice(); tlRender(); }
    };
  }

  function tlSetMode(mode) {
    Tl.mode = mode;
    if (mode === "practice" && !Tl.practice) tlNewPractice();
    syncModeTabs("tl");
    tlRender();
  }

  /* ================================================================
   * 路由 / 模式切换 / 首页
   * ================================================================ */
  const VIEWS = {
    "": "home", "#/": "home",
    "#/guess": "guess", "#/voice": "voice", "#/higher-lower": "pop",
    "#/connections": "conn", "#/timeline": "tl",
  };
  const RENDER = { guess: guessRender, voice: voiceRender, pop: popRender, conn: connRender, tl: tlRender };

  function route() {
    const view = VIEWS[location.hash] || "home";
    if (view !== "voice" && Voice.audio) voiceStopAudio(); // 离开语音页时停止播放
    ["home", "guess", "voice", "pop", "conn", "tl"].forEach((v) =>
      $(`#view-${v}`).classList.toggle("hidden", v !== view));
    if (view === "home") renderHomeDots();
    else RENDER[view]();
    window.scrollTo(0, 0);
  }

  function syncModeTabs(game) {
    const mode = { guess: Guess.mode, voice: Voice.mode, pop: Pop.mode, conn: Conn.mode, tl: Tl.mode }[game];
    $$(`.mode-tabs[data-game="${game}"] .mode-tab`).forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === mode));
  }

  function renderHomeDots() {
    const checks = {
      guess: loadJSON(dkey("guess"), null),
      voice: loadJSON(dkey("voice"), null),
      pop: loadJSON(dkey("pop"), null),
      conn: loadJSON(dkey("conn"), null),
      tl: loadJSON(dkey("tl"), null),
    };
    for (const [game, st] of Object.entries(checks)) {
      const done = st && (st.status === "won" || st.status === "lost");
      $(`#dot-${game}`).classList.toggle("done", !!done);
    }
  }

  // ---------- 启动 ----------
  function init() {
    guessInit();
    voiceInit();
    popInit();
    connInit();
    tlInit();
    guessBindInput();
    voiceBindInput();
    $("#voicePlayBtn").addEventListener("click", voicePlay);
    $("#voiceSkipBtn").addEventListener("click", voiceSkip);
    $("#popHigher").addEventListener("click", () => popAnswer("higher"));
    $("#popLower").addEventListener("click", () => popAnswer("lower"));
    $("#connSubmit").addEventListener("click", connSubmit);
    $("#connDeselect").addEventListener("click", () => { Conn.sel.clear(); connRender(); });
    $("#connShuffle").addEventListener("click", () => {
      const s = cState();
      const rest = cRemaining();
      AKG.shuffle(rest, Math.random);
      const solvedMembers = s.order.filter((id) => !rest.includes(id));
      s.order = solvedMembers.concat(rest);
      cPersist();
      connRender();
    });
    $("#tlSubmit").addEventListener("click", tlSubmit);
    $$(".mode-tabs").forEach((tabs) => {
      const game = tabs.dataset.game;
      const setter = { guess: guessSetMode, voice: voiceSetMode, pop: popSetMode, conn: connSetMode, tl: tlSetMode }[game];
      tabs.querySelectorAll(".mode-tab").forEach((b) =>
        b.addEventListener("click", () => setter(b.dataset.mode)));
    });
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
