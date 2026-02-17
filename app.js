"use strict";

/*
Day Conductor v12

変更点（要約）
- 就寝/起床の扱い
  - 就寝が 00:00〜05:59 の場合、その日の「次の日」に就寝を配置
  - 起床は「就寝から最大9時間以内」に自動調整（予定上）
  - 起床を小さな「起床」ブロック（5分）として追加
  - ルーティンの跨ぎ（前日から当日へのはみ出し）を一般化して表示

- 生活：一覧/タイムラインのタップ編集を無効化（生活のみ）
- 勉強：タイムラインの勉強ブロックタップで「実行（運転）モード」
  - 残り時間カウントダウン（一時停止で停止）
  - 範囲一覧をタップで完了/復活
  - 進捗 x/y
  - 全部完了 → 自動で「到着」ダイアログ
  - 左上HUDに科目名＋残り時間（タスク中）

- 自動組み立て：perRangeMin（1範囲あたり分）があるタスクは「範囲ごとに分割して配置」
  → 移動/食事/風呂などの生活ブロックで途切れても、次の空きに続きが入る
*/

window.addEventListener("DOMContentLoaded", () => {
  const LS_KEY = "day_conductor_v12";
  const LEGACY_KEYS = ["day_conductor_v11", "day_conductor_v10"];
  const DAY_MIN = 1440;
  const PX_PER_MIN = 1.25;

  // 就寝がこの時刻より早い場合は「次の日」に就寝を置く（= 日付変更後として扱う）
  const SLEEP_NEXT_DAY_THRESHOLD_MIN = 6 * 60; // 00:00〜05:59
  const MAX_SLEEP_HOURS = 9;
  const WAKE_MARK_MIN = 5; // 起床ブロックの長さ（分）

  /* ===== Utils ===== */
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));
  const pad2 = (n) => String(n).padStart(2, "0");
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parseDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const addDays = (iso, delta) => {
    const d = parseDate(iso) || new Date();
    d.setDate(d.getDate() + delta);
    return fmtDate(d);
  };
  const dowName = (d) => ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];

  const minutesOf = (hhmm) => {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  };
  const hhmmOf = (min) => {
    min = ((min % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  };

  const setHidden = (el, v) => { if (el) el.hidden = !!v; };
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const fmtMS = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    if (hh > 0) return `${hh}:${pad2(mm)}:${pad2(s)}`;
    return `${mm}:${pad2(s)}`;
  };

  /* ===== Options ===== */
  const CATEGORY_COLORS = {
    "国語系": cssVar("--pink"),
    "数学系": cssVar("--blue"),
    "英語系": cssVar("--purple"),
    "理科系": cssVar("--green"),
    "社会系": cssVar("--yellow"),
    "その他": cssVar("--gray"),
  };

  const SUBJECTS_BY_CATEGORY = {
    "国語系": ["論国", "古典"],
    "数学系": ["数学Ⅲ", "数学C"],
    "英語系": ["英C", "論表"],
    "理科系": ["化学", "生物"],
    "社会系": ["地理", "公共"],
    "その他": ["その他"],
  };

  const TASK_OPTIONS_BY_SUBJECT = {
    "論国": ["教科書", "漢字", "現代文課題"],
    "古典": ["教科書", "古文単語", "古文課題", "漢文課題"],
    "数学Ⅲ": ["予習", "復習", "4STEP", "課題"],
    "数学C": ["予習", "復習", "4STEP", "課題"],
    "英C": ["予習", "復習", "CROWN", "Cutting Edge", "LEAP", "課題"],
    "論表": ["予習", "復習", "Write to the point", "Scramble"],
    "化学": ["予習", "復習", "セミナー", "実験"],
    "生物": ["予習", "復習", "セミナー", "実験"],
    "地理": ["教科書"],
    "公共": ["教科書"],
  };

  const LIFE_TYPES = ["就寝", "食事", "移動", "授業", "部活", "準備", "風呂", "自由入力"];
  const LIFE_DEFAULT_MIN = {
    "移動": 30,
    "食事": 30,
    "風呂": 60,
    "準備": 15,
    "就寝": 420,
    "授業": 360,
    "部活": 120
  };

  const uniq = (arr) => {
    const s = new Set();
    const out = [];
    for (const x of arr) {
      const k = String(x);
      if (!s.has(k)) { s.add(k); out.push(x); }
    }
    return out;
  };

  /* ===== Routine defaults (per date) ===== */
  const routineDefaultForDate = (date) => {
    const d = parseDate(date) || new Date();
    const day = d.getDay();
    const isTT = (day === 2 || day === 4); // 火木
    return {
      schoolOn: "on",
      commuteAMStart: "07:30",
      commuteAMMin: 60,
      schoolStart: "08:30",
      schoolEnd: isTT ? "16:00" : "15:00",
      clubOn: "off",
      clubStart: "16:10",
      clubEnd: "18:30",
      returnMode: "60",        // "60" or "30x2"
      return2Start: "19:00",   // only for "30x2"
      bathOn: "on",
      bathMin: 60,
      prepMin: 15,
      sleepStart: "23:30",
      wakeTime: "06:30"
    };
  };

  /* ===== State ===== */
  const freshState = () => {
    const today = fmtDate(new Date());
    return {
      routineByDate: {},
      lifeByDate: {},
      studyByDate: {},
      planCache: {},

      // 勉強の進捗/タイマー（タスクID単位）
      progressByTask: {
        // [taskId]: { doneSteps: boolean[], spentSec: number }
      },

      // 実行中タスク（1つだけ）
      runner: {
        activeTaskId: null,
        isRunning: false,
        lastTick: 0
      },

      ui: {
        activeTab: "life",
        lifeDate: today,
        studyDate: today,
        loadedStart: addDays(today, -2),
        loadedEnd: addDays(today, 10),
      }
    };
  };

  const sanitizeState = (s) => {
    const base = freshState();
    s = s && typeof s === "object" ? s : {};
    return {
      ...base,
      ...s,
      routineByDate: s.routineByDate || {},
      lifeByDate: s.lifeByDate || {},
      studyByDate: s.studyByDate || {},
      planCache: s.planCache || {},
      progressByTask: s.progressByTask || {},
      runner: { ...base.runner, ...(s.runner || {}) },
      ui: { ...base.ui, ...(s.ui || {}) }
    };
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return sanitizeState(JSON.parse(raw));
      for (const k of LEGACY_KEYS) {
        const old = localStorage.getItem(k);
        if (old) return sanitizeState(JSON.parse(old));
      }
      return freshState();
    } catch {
      return freshState();
    }
  };

  let state = loadState();
  const saveState = () => localStorage.setItem(LS_KEY, JSON.stringify(state));

  /* ===== DOM ===== */
  const clockText = $("#clockText");
  const btnJumpNow = $("#btnJumpNow");

  const tabs = $$(".tab");
  const tabLife = $("#tabLife");
  const tabStudy = $("#tabStudy");
  const tabTimeline = $("#tabTimeline");

  // routine
  const lifeDate = $("#lifeDate");
  const routineSchoolOn = $("#routineSchoolOn");
  const routineCommuteAMStart = $("#routineCommuteAMStart");
  const routineCommuteAMMin = $("#routineCommuteAMMin");
  const routineSchoolStart = $("#routineSchoolStart");
  const routineSchoolEnd = $("#routineSchoolEnd");
  const routineClubOn = $("#routineClubOn");
  const routineClubStart = $("#routineClubStart");
  const routineClubEndWrap = $("#routineClubEndWrap");
  const routineClubEnd = $("#routineClubEnd");
  const routineReturnMode = $("#routineReturnMode");
  const return60Wrap = $("#return60Wrap");
  const return30Wrap = $("#return30Wrap");
  const routineReturn2Start = $("#routineReturn2Start");

  const routineBathOn = $("#routineBathOn");
  const routineBathMin = $("#routineBathMin");
  const routinePrepMin = $("#routinePrepMin");

  const routineSleepStart = $("#routineSleepStart");
  const routineWake = $("#routineWake");
  const routineHint = $("#routineHint");

  // life add
  const lifeType = $("#lifeType");
  const lifeCustomWrap = $("#lifeCustomWrap");
  const lifeCustom = $("#lifeCustom");
  const lifeDurationBox = $("#lifeDurationBox");
  const lifeRangeBox = $("#lifeRangeBox");
  const lifeStart = $("#lifeStart");
  const lifeMin = $("#lifeMin");
  const lifeFrom = $("#lifeFrom");
  const lifeTo = $("#lifeTo");
  const btnAddLife = $("#btnAddLife");
  const btnClearLifeDay = $("#btnClearLifeDay");
  const lifeAddHint = $("#lifeAddHint");
  const lifeList = $("#lifeList");

  // study
  const studyDate = $("#studyDate");
  const studyCategory = $("#studyCategory");
  const studySubject = $("#studySubject");
  const studyOtherSubjectWrap = $("#studyOtherSubjectWrap");
  const studyOtherSubject = $("#studyOtherSubject");
  const studyTaskType = $("#studyTaskType");
  const studyTaskFreeWrap = $("#studyTaskFreeWrap");
  const studyTaskFree = $("#studyTaskFree");
  const btnAddRange = $("#btnAddRange");
  const rangesList = $("#rangesList");
  const studyPerRangeMin = $("#studyPerRangeMin");
  const studyMin = $("#studyMin");
  const studyDeadline = $("#studyDeadline");
  const btnAddStudy = $("#btnAddStudy");
  const btnClearStudyDay = $("#btnClearStudyDay");
  const btnAutoBuild = $("#btnAutoBuild");
  const studyList = $("#studyList");
  const studyAddHint = $("#studyAddHint");
  const overflowHint = $("#overflowHint");

  // timeline
  const timeline = $("#timeline");

  // editor
  const editor = $("#editor");
  const editorTitle = $("#editorTitle");
  const editorBody = $("#editorBody");
  const editorFoot = $("#editorFoot");
  const editorCancel = $("#editorCancel");

  // minimal required check
  const required = [
    clockText, btnJumpNow, tabLife, tabStudy, tabTimeline,
    lifeDate, routineSchoolOn, routineBathOn, routineSleepStart, routineWake,
    lifeType, btnAddLife,
    studyDate, studyCategory, rangesList, btnAddStudy, btnAutoBuild,
    studyPerRangeMin,
    timeline, editor, editorCancel
  ];
  if (required.some(x => !x)) {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:10px;right:10px;bottom:10px;z-index:9999;background:#300;color:#fff;padding:10px;border-radius:12px;font:12px/1.4 system-ui;";
    box.textContent = "読み込みエラー：index.html が v12 の要素と一致していません。";
    document.body.appendChild(box);
    return;
  }

  /* ===== HUD (左上：科目名＋残り) ===== */
  const hud = document.createElement("button");
  hud.type = "button";
  hud.id = "hud";
  hud.innerHTML = `<span class="hudSubj"></span><span class="hudTime"></span>`;
  document.body.appendChild(hud);

  const hudSubj = hud.querySelector(".hudSubj");
  const hudTime = hud.querySelector(".hudTime");

  const setHUDVisible = (v) => {
    hud.style.display = v ? "inline-flex" : "none";
  };

  hud.addEventListener("click", () => {
    const id = state.runner.activeTaskId;
    if (!id) return;
    openRunner(id);
  });

  /* ===== Tabs ===== */
  const setTab = (name) => {
    state.ui.activeTab = name;
    saveState();
    tabs.forEach(b => b.classList.toggle("is-active", b.dataset.tab === name));
    tabLife.classList.toggle("is-active", name === "life");
    tabStudy.classList.toggle("is-active", name === "study");
    tabTimeline.classList.toggle("is-active", name === "timeline");
  };
  tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  /* ===== Select init ===== */
  const addOpt = (sel, val, label) => {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = label;
    sel.appendChild(o);
  };

  function fillReturn2Options() {
    routineReturn2Start.innerHTML = "";
    for (let h = 17; h <= 21; h++) {
      for (const m of [0, 15, 30]) {
        if (h === 21 && m > 30) continue;
        const t = `${pad2(h)}:${pad2(m)}`;
        addOpt(routineReturn2Start, t, t);
      }
    }
  }

  function initSelects() {
    lifeType.innerHTML = "";
    LIFE_TYPES.forEach(x => addOpt(lifeType, x, x));

    studyCategory.innerHTML = "";
    addOpt(studyCategory, "", "—");
    Object.keys(SUBJECTS_BY_CATEGORY).forEach(cat => addOpt(studyCategory, cat, cat));

    if (rangesList.children.length === 0) addRangeRow();

    fillReturn2Options();
  }

  /* ===== Range expansion ===== */
  function parseLeadingInt(token) {
    const t = String(token || "").trim();
    const m = /^(-?\d+)(.*)$/.exec(t);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (String(n) !== m[1]) return null;
    return { num: n, rest: m[2] || "" };
  }

  // start:11(2-3) end:15(3) => 11(2-3),12,13,14,15(3)
  function computeRangeSteps(ranges) {
    const out = [];
    for (const r of ranges) {
      const a = (r.start || "").trim();
      const b = (r.end || "").trim();
      if (!a && !b) continue;

      const pa = parseLeadingInt(a);
      const pb = parseLeadingInt(b);

      if (pa && pb) {
        if (pa.num === pb.num) {
          out.push(a || b);
          continue;
        }
        const step = pa.num < pb.num ? 1 : -1;
        out.push(a);
        for (let v = pa.num + step; step === 1 ? v < pb.num : v > pb.num; v += step) {
          out.push(String(v));
        }
        out.push(b);
        continue;
      }
      out.push(a || b);
    }
    return out;
  }

  function computeDurationFromPerRange(perRangeMin, ranges) {
    const per = Number.isFinite(perRangeMin) ? perRangeMin : null;
    if (!per || per <= 0) return null;
    const steps = computeRangeSteps(ranges);
    const count = Math.max(1, steps.length || 0);
    return per * count;
  }

  function normalizeDayEstimates(date) {
    const arr = state.studyByDate[date] || [];
    let changed = false;

    for (const t of arr) {
      const per = t.perRangeMin;
      if (!per) continue;
      const auto = computeDurationFromPerRange(per, t.ranges || []);
      if (auto != null && t.durationMin !== auto) {
        t.durationMin = auto;
        changed = true;
      }
    }

    if (changed) {
      state.studyByDate[date] = arr;
      delete state.planCache[date];
      saveState();
    }
    return changed;
  }

  /* ===== Routine read/write ===== */
  function getRoutine(date) {
    if (!state.routineByDate[date]) {
      state.routineByDate[date] = routineDefaultForDate(date);
      saveState();
    }
    return state.routineByDate[date];
  }
  function setRoutine(date, patch) {
    const r = { ...getRoutine(date), ...patch };
    state.routineByDate[date] = r;
    delete state.planCache[date];
    delete state.planCache[addDays(date, 1)];
    saveState();
  }

  function applyRoutineToUI(date) {
    const r = getRoutine(date);
    routineSchoolOn.value = r.schoolOn || "on";
    routineCommuteAMStart.value = r.commuteAMStart || "07:30";
    routineCommuteAMMin.value = String(r.commuteAMMin ?? 60);
    routineSchoolStart.value = r.schoolStart || "08:30";
    routineSchoolEnd.value = r.schoolEnd || "15:00";

    routineClubOn.value = r.clubOn || "off";
    routineClubStart.value = r.clubStart || "16:10";
    routineClubEnd.value = r.clubEnd || "18:30";
    routineClubEndWrap.style.display = (routineClubOn.value === "on") ? "" : "none";

    routineReturnMode.value = r.returnMode || "60";
    setHidden(return60Wrap, routineReturnMode.value !== "60");
    setHidden(return30Wrap, routineReturnMode.value !== "30x2");
    routineReturn2Start.value = r.return2Start || "19:00";

    routineBathOn.value = r.bathOn || "on";
    routineBathMin.value = String(r.bathMin ?? 60);
    routinePrepMin.value = String(r.prepMin ?? 15);

    routineSleepStart.value = r.sleepStart || "23:30";
    routineWake.value = r.wakeTime || "06:30";

    validateRoutine(date);
  }

  /* ===== Life mode ===== */
  const lifeMode = () => (document.querySelector('input[name="lifeMode"]:checked')?.value || "duration");

  /* ===== Split cross midnight ===== */
  function splitCrossMidnight(baseDate, startMin, endMin) {
    let s = startMin;
    let e = endMin;
    if (e <= s) e += 1440;

    const d0 = baseDate;
    const d1 = addDays(baseDate, 1);
    const parts = [];

    if (s < 1440 && e <= 1440) {
      parts.push({ date: d0, startMin: s, endMin: e, contOut: false, contIn: false });
      return parts;
    }
    if (s < 1440 && e > 1440) {
      parts.push({ date: d0, startMin: s, endMin: 1440, contOut: true, contIn: false });
      parts.push({ date: d1, startMin: 0, endMin: e - 1440, contOut: false, contIn: true });
      return parts;
    }
    parts.push({ date: d1, startMin: s - 1440, endMin: e - 1440, contOut: false, contIn: true });
    return parts;
  }

  // startMin が負でも扱えるように baseDate をずらす
  function splitWithShift(baseDate, startMin, endMin) {
    let d = baseDate;
    let s = startMin;
    let e = endMin;
    while (s < 0) {
      s += 1440; e += 1440;
      d = addDays(d, -1);
    }
    while (s >= 1440) {
      s -= 1440; e -= 1440;
      d = addDays(d, 1);
    }
    return splitCrossMidnight(d, s, e);
  }

  /* ===== Overlap ===== */
  function hasOverlap(segments) {
    const list = segments
      .map(x => ({ start: x.startMin, end: x.endMin }))
      .filter(x => x.end > x.start)
      .sort((a, b) => a.start - b.start);

    for (let i = 1; i < list.length; i++) {
      if (list[i].start < list[i - 1].end) return true;
    }
    return false;
  }

  /* ===== Sleep math (v12) ===== */
  function sleepBaseDateForRoutineDate(date, sleepStartMin) {
    if (sleepStartMin == null) return date;
    // 00:00〜05:59 → 次の日の就寝
    if (sleepStartMin < SLEEP_NEXT_DAY_THRESHOLD_MIN) return addDays(date, 1);
    return date;
  }

  function computeWakeDiffMin(sleepStartMin, wakeMin) {
    // wakeMin は入力時刻（0..1439）
    let diff = ((wakeMin - sleepStartMin) + 1440) % 1440;
    if (diff <= 0) diff += 1440;
    const max = MAX_SLEEP_HOURS * 60;
    if (diff > max) diff = max; // 予定上は最大9hに抑える
    return diff;
  }

  /* ===== Build routine blocks ===== */
  function routineBlocksForRoutineDate(date) {
    const r = getRoutine(date);
    const out = [];

    const schoolOn = r.schoolOn === "on";

    // morning commute (same routine date)
    if (schoolOn) {
      const a = minutesOf(r.commuteAMStart);
      const mins = clamp(parseInt(r.commuteAMMin || "60", 10), 1, 1000);
      if (a != null) {
        out.push({
          kind: "routine",
          sourceId: `routine.${date}.commuteAM`,
          date,
          label: "移動",
          color: cssVar("--gray"),
          ...firstPart(date, a, a + mins),
        });
      }
    }

    // school
    if (schoolOn) {
      const s = minutesOf(r.schoolStart);
      const e = minutesOf(r.schoolEnd);
      if (s != null && e != null) {
        out.push({
          kind: "routine",
          sourceId: `routine.${date}.school`,
          date,
          label: "授業",
          color: cssVar("--gray"),
          ...firstPart(date, s, e),
        });
      }
    }

    // club
    if (r.clubOn === "on") {
      const s = minutesOf(r.clubStart);
      const e = minutesOf(r.clubEnd);
      if (s != null && e != null) {
        const parts = splitCrossMidnight(date, s, e);
        for (const p of parts) {
          out.push({
            kind: "routine",
            sourceId: `routine.${date}.club`,
            date: p.date,
            startMin: p.startMin,
            endMin: p.endMin,
            contOut: p.contOut,
            contIn: p.contIn,
            label: "部活",
            color: cssVar("--gray")
          });
        }
      }
    }

    // return commute after school/club end
    const schoolEnd = schoolOn ? minutesOf(r.schoolEnd) : null;
    const clubEnd = (r.clubOn === "on") ? minutesOf(r.clubEnd) : null;
    let endBase = 0;
    if (schoolEnd != null) endBase = Math.max(endBase, schoolEnd);
    if (clubEnd != null) endBase = Math.max(endBase, clubEnd);

    if (r.returnMode === "60") {
      out.push({
        kind: "routine",
        sourceId: `routine.${date}.return60`,
        date,
        label: "移動",
        color: cssVar("--gray"),
        ...firstPart(date, endBase, endBase + 60),
      });
    } else {
      out.push({
        kind: "routine",
        sourceId: `routine.${date}.return30_1`,
        date,
        label: "移動",
        color: cssVar("--gray"),
        ...firstPart(date, endBase, endBase + 30),
      });

      const t2 = minutesOf(r.return2Start);
      if (t2 != null) {
        out.push({
          kind: "routine",
          sourceId: `routine.${date}.return30_2`,
          date,
          label: "移動",
          color: cssVar("--gray"),
          ...firstPart(date, t2, t2 + 30),
        });
        out.push({
          kind: "routine",
          sourceId: `routine.${date}.dinner`,
          date,
          label: "食事",
          color: cssVar("--gray"),
          ...firstPart(date, t2 + 30, t2 + 60),
        });
      }
    }

    // bath -> prep -> sleep (relative to sleepStart base date)
    const slStartMin = minutesOf(r.sleepStart);
    const wakeMin = minutesOf(r.wakeTime);
    const prepMin = clamp(parseInt(r.prepMin || "15", 10), 1, 600);
    const bathMin = clamp(parseInt(r.bathMin || "60", 10), 1, 600);
    const bathOn = r.bathOn === "on";

    if (slStartMin != null) {
      const baseForSleep = sleepBaseDateForRoutineDate(date, slStartMin);

      // prep ends at sleepStart
      const prepEnd = slStartMin;
      const prepStart = slStartMin - prepMin;
      for (const p of splitWithShift(baseForSleep, prepStart, prepEnd)) {
        out.push({
          kind: "routine",
          sourceId: `routine.${date}.prep`,
          date: p.date,
          startMin: p.startMin,
          endMin: p.endMin,
          contOut: p.contOut,
          contIn: p.contIn,
          label: "準備",
          color: cssVar("--gray")
        });
      }

      // bath before prep
      if (bathOn) {
        const bathEnd = prepStart;
        const bathStart = bathEnd - bathMin;
        for (const p of splitWithShift(baseForSleep, bathStart, bathEnd)) {
          out.push({
            kind: "routine",
            sourceId: `routine.${date}.bath`,
            date: p.date,
            startMin: p.startMin,
            endMin: p.endMin,
            contOut: p.contOut,
            contIn: p.contIn,
            label: "風呂",
            color: cssVar("--gray")
          });
        }
      }

      // sleep + wake marker
      if (wakeMin != null) {
        const diff = computeWakeDiffMin(slStartMin, wakeMin);
        const sleepEnd = slStartMin + diff;

        const parts = splitCrossMidnight(baseForSleep, slStartMin, sleepEnd);
        for (const p of parts) {
          out.push({
            kind: "routine",
            sourceId: `routine.${date}.sleep`,
            date: p.date,
            startMin: p.startMin,
            endMin: p.endMin,
            contOut: p.contOut,
            contIn: p.contIn,
            label: "就寝",
            color: cssVar("--gray")
          });
        }

        // wake marker at sleep end (5 min)
        const wakeAbsDate = baseForSleep;
        const wakeEndMin = sleepEnd;
        for (const p of splitWithShift(wakeAbsDate, wakeEndMin, wakeEndMin + WAKE_MARK_MIN)) {
          out.push({
            kind: "routine",
            sourceId: `routine.${date}.wake`,
            date: p.date,
            startMin: p.startMin,
            endMin: p.endMin,
            contOut: p.contOut,
            contIn: p.contIn,
            label: "起床",
            color: cssVar("--gray")
          });
        }
      }
    }

    function firstPart(baseDate, s, e) {
      const parts = splitCrossMidnight(baseDate, s, e);
      const p = parts[0];
      return { date: p.date, startMin: p.startMin, endMin: p.endMin, contOut: p.contOut, contIn: p.contIn };
    }

    return out;
  }

  // 表示用：その日のルーティン（当日）＋前日ルーティンからはみ出した分も含める
  function routineBlocksForDate(date) {
    const prev = addDays(date, -1);
    const a = routineBlocksForRoutineDate(date).filter(b => b.date === date);
    const b = routineBlocksForRoutineDate(prev).filter(b => b.date === date);
    // contIn 表示を少し強めたい時はここで付加できるが、今回はそのまま
    return [...a, ...b].sort((x, y) => x.startMin - y.startMin);
  }

  /* ===== Custom life blocks ===== */
  function customLifeBlocksForDate(date) {
    const arrToday = state.lifeByDate[date] || [];
    const arrPrev = state.lifeByDate[addDays(date, -1)] || [];
    const out = [];

    for (const b of arrToday) {
      const parts = splitCrossMidnight(date, b.startMin, b.endMin);
      for (const p of parts) {
        out.push({
          kind: "life",
          sourceId: b.id,
          date: p.date,
          startMin: p.startMin,
          endMin: p.endMin,
          contOut: p.contOut,
          contIn: p.contIn,
          label: b.type,
          color: cssVar("--gray")
        });
      }
    }
    for (const b of arrPrev) {
      const parts = splitCrossMidnight(addDays(date, -1), b.startMin, b.endMin);
      for (const p of parts) {
        if (p.date !== date) continue;
        out.push({
          kind: "life",
          sourceId: b.id,
          date: p.date,
          startMin: p.startMin,
          endMin: p.endMin,
          contOut: p.contOut,
          contIn: true,
          label: b.type,
          color: cssVar("--gray")
        });
      }
    }
    return out;
  }

  function allLifeBlocksForDate(date) {
    return [
      ...routineBlocksForDate(date),
      ...customLifeBlocksForDate(date).filter(x => x.date === date),
    ].sort((a, b) => a.startMin - b.startMin);
  }

  function validateRoutine(date) {
    // その日表示のルーティン群を重なりチェック（前日分のはみ出しも含める）
    const segs = routineBlocksForDate(date).map(b => ({ startMin: b.startMin, endMin: b.endMin }));
    const ok = !hasOverlap(segs);
    setHidden(routineHint, ok);
    return ok;
  }

  /* ===== Life UI sync ===== */
  function syncLifeCustomUI() {
    const isCustom = (lifeType.value === "自由入力");
    setHidden(lifeCustomWrap, !isCustom);
    if (!isCustom) lifeCustom.value = "";

    const def = LIFE_DEFAULT_MIN[lifeType.value];
    if (def != null) lifeMin.value = String(def);
  }
  function syncLifeModeUI() {
    const mode = lifeMode();
    setHidden(lifeDurationBox, mode !== "duration");
    setHidden(lifeRangeBox, mode !== "range");
  }

  /* ===== Study chain ===== */
  function syncStudySubjectSelect() {
    const cat = studyCategory.value;
    studySubject.innerHTML = "";
    addOpt(studySubject, "", "—");

    if (!cat) {
      studySubject.disabled = true;
      setHidden(studyOtherSubjectWrap, true);
      return;
    }

    const subs = SUBJECTS_BY_CATEGORY[cat] || [];
    subs.forEach(s => addOpt(studySubject, s, s));

    if (cat === "その他") {
      studySubject.value = "その他";
      studySubject.disabled = true;
      setHidden(studyOtherSubjectWrap, false);
    } else {
      studySubject.disabled = false;
      setHidden(studyOtherSubjectWrap, true);
      studyOtherSubject.value = "";
    }
  }

  function resolveStudySubject() {
    const cat = studyCategory.value;
    if (!cat) return "";
    if (cat !== "その他") return (studySubject.value || "").trim();
    const typed = (studyOtherSubject.value || "").trim();
    return typed ? typed : "その他";
  }

  function syncStudyTaskTypeSelect() {
    const cat = studyCategory.value;
    studyTaskType.innerHTML = "";
    addOpt(studyTaskType, "", "—");

    if (!cat) {
      studyTaskType.disabled = true;
      setHidden(studyTaskFreeWrap, true);
      return;
    }

    const subj = resolveStudySubject();
    let opts = TASK_OPTIONS_BY_SUBJECT[subj];

    if (!opts) {
      opts = uniq(["教科書", ...Object.values(TASK_OPTIONS_BY_SUBJECT).flat(), "自由入力"]);
    } else {
      opts = uniq([...opts, "自由入力"]);
    }

    opts.forEach(x => addOpt(studyTaskType, x, x));
    studyTaskType.disabled = false;
    setHidden(studyTaskFreeWrap, studyTaskType.value !== "自由入力");
  }

  function resolveTaskType() {
    const raw = (studyTaskType.value || "").trim();
    if (!raw) return "";
    if (raw !== "自由入力") return raw;
    return (studyTaskFree.value || "").trim();
  }

  function addRangeRow(prefill) {
    const row = document.createElement("div");
    row.className = "rangeRow";
    row.innerHTML = `
      <input class="rangeStart" type="text" placeholder="開始" />
      <input class="rangeEnd" type="text" placeholder="終了" />
      <button type="button" class="rangeDel">✕</button>
    `;
    const del = row.querySelector(".rangeDel");
    del.addEventListener("click", () => {
      row.remove();
      if (rangesList.children.length === 0) addRangeRow();
      autoUpdateStudyMin();
    });
    if (prefill) {
      row.querySelector(".rangeStart").value = prefill.start || "";
      row.querySelector(".rangeEnd").value = prefill.end || "";
    }
    rangesList.appendChild(row);
  }

  function readRanges() {
    return $$(".rangeRow").map(r => ({
      start: (r.querySelector(".rangeStart").value || "").trim(),
      end: (r.querySelector(".rangeEnd").value || "").trim(),
    })).filter(x => x.start || x.end);
  }

  // perRangeMin が入っているときだけ見積を自動更新
  function autoUpdateStudyMin() {
    const per = parseInt(studyPerRangeMin.value, 10);
    if (!Number.isFinite(per) || per <= 0) return;
    const ranges = readRanges();
    const auto = computeDurationFromPerRange(per, ranges);
    if (auto != null) studyMin.value = String(auto);
  }

  /* ===== Planning ===== */
  function subtractSegments(baseSegs, busySegs) {
    const busy = busySegs
      .map(x => ({ start: clamp(x.startMin, 0, 1440), end: clamp(x.endMin, 0, 1440) }))
      .filter(x => x.end > x.start)
      .sort((a, b) => a.start - b.start);

    const merged = [];
    for (const b of busy) {
      const last = merged[merged.length - 1];
      if (!last || b.start > last.end) merged.push({ ...b });
      else last.end = Math.max(last.end, b.end);
    }

    let free = baseSegs.map(x => ({ ...x }));
    for (const b of merged) {
      const next = [];
      for (const f of free) {
        if (b.end <= f.start || b.start >= f.end) { next.push(f); continue; }
        if (b.start > f.start) next.push({ start: f.start, end: b.start });
        if (b.end < f.end) next.push({ start: b.end, end: f.end });
      }
      free = next;
    }
    return free.filter(x => x.end > x.start);
  }

  function placeTask(segments, dur, deadlineMin) {
    for (const seg of segments) {
      const start = seg.start;
      const end = start + dur;
      if (end > seg.end) continue;
      if (deadlineMin != null && end > deadlineMin) continue;
      return { start, end };
    }
    return null;
  }

  function reserve(segments, s, e) {
    return subtractSegments(segments, [{ startMin: s, endMin: e }]);
  }

  function buildPlanForDay(date, allowCarry) {
    normalizeDayEstimates(date);

    const blocks = [];

    // occupied: routine+custom life (for that date)
    const lifeBlocks = allLifeBlocksForDate(date);
    blocks.push(...lifeBlocks.map(b => ({ ...b, kind: "lifePlan" })));

    const occupied = lifeBlocks.map(b => ({ startMin: b.startMin, endMin: b.endMin }));

    // study tasks
    const tasks = (state.studyByDate[date] || []).map(t => ({ ...t }));
    tasks.sort((a, b) => {
      const da = a.deadlineHHMM ? minutesOf(a.deadlineHHMM) : null;
      const db = b.deadlineHHMM ? minutesOf(b.deadlineHHMM) : null;
      if (da == null && db == null) return (a.createdAt || 0) - (b.createdAt || 0);
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });

    // study windows: after school/club+return commute1 to (sleepStart - prep/bath etc は生活ブロックで埋まる)
    const r = getRoutine(date);
    const slStartMin = minutesOf(r.sleepStart) ?? 1410;
    const baseForSleep = sleepBaseDateForRoutineDate(date, slStartMin);
    // 勉強できる締めは「その日の表示上の就寝開始の前」だが、就寝が次日に回るなら当日夜の上限は24:00扱いにするのが自然
    // → ただし、実際の生活ブロック（準備/風呂/就寝）はすでに occupied に入ってるので、ここは大雑把でもOK
    const sleepStartForThisDate = (baseForSleep === date) ? slStartMin : 1440; // 就寝が次日なら当日は24:00まで

    const schoolEnd = (r.schoolOn === "on") ? minutesOf(r.schoolEnd) : 0;
    const clubEnd = (r.clubOn === "on") ? (minutesOf(r.clubEnd) ?? 0) : 0;
    const endBase = Math.max(schoolEnd || 0, clubEnd || 0);

    let baseStart = endBase + (r.returnMode === "60" ? 60 : 30);

    const overflow = [];
    let freeSegments = [];

    if (r.returnMode === "60") {
      freeSegments = subtractSegments([{ start: baseStart, end: sleepStartForThisDate }], occupied);
    } else {
      const t2 = minutesOf(r.return2Start);
      const t2Start = (t2 == null) ? 9999 : t2;
      const afterDinner = (t2 == null) ? 9999 : (t2 + 60);

      const seg1 = { start: baseStart, end: Math.min(t2Start, sleepStartForThisDate) };
      const seg2 = { start: Math.min(afterDinner, sleepStartForThisDate), end: sleepStartForThisDate };
      const bases = [];
      if (seg1.end > seg1.start) bases.push(seg1);
      if (seg2.end > seg2.start) bases.push(seg2);

      freeSegments = subtractSegments(bases, occupied);
    }

    // v12: perRangeMin があるタスクは「範囲単位」で分割して配置
    for (const t of tasks) {
      const deadlineMin = t.deadlineHHMM ? minutesOf(t.deadlineHHMM) : null;

      const steps = computeRangeSteps(t.ranges || []);
      const per = Number.isFinite(t.perRangeMin) ? t.perRangeMin : null;

      // ユニット化
      let units = [];
      if (per && per > 0 && steps.length > 0) {
        units = steps.map((label, i) => ({
          stepIndex: i,
          stepLabel: label,
          dur: per
        }));
      } else {
        const dur = clamp(parseInt(t.durationMin || "30", 10), 1, 2000);
        units = [{ stepIndex: null, stepLabel: null, dur }];
      }

      let placedAll = true;

      for (let ui = 0; ui < units.length; ui++) {
        const u = units[ui];
        const dur = clamp(parseInt(u.dur || "30", 10), 1, 2000);

        let place = placeTask(freeSegments, dur, deadlineMin);
        if (!place) place = placeTask(freeSegments, dur, null);

        if (!place) {
          placedAll = false;
          break;
        }

        freeSegments = reserve(freeSegments, place.start, place.end);

        const isPerRange = (u.stepIndex != null);

        blocks.push({
          kind: "study",
          // perRange ならブロックのsourceIdを分岐（タップでタスクIDを取れるように）
          sourceId: isPerRange ? `${t.id}:${u.stepIndex}` : t.id,
          taskId: t.id,
          stepIndex: u.stepIndex,
          stepLabel: u.stepLabel,
          totalSteps: steps.length || 0,
          date,
          startMin: place.start,
          endMin: place.end,
          contOut: false,
          contIn: false,
          label: `${t.subject}`,
          color: CATEGORY_COLORS[t.category] || cssVar("--gray"),
          meta: `${t.taskType}` + (u.stepLabel ? ` / ${u.stepLabel}` : ""),
        });
      }

      if (!placedAll) {
        overflow.push(t.id);
        // allowCarry があるなら「タスクごと」次の日へ（分割の途中持ち越しは今回はやらない）
        if (allowCarry) {
          const next = addDays(date, 1);
          const todayArr = state.studyByDate[date] || [];
          const move = todayArr.find(x => x.id === t.id);
          if (move) {
            state.studyByDate[date] = todayArr.filter(x => x.id !== t.id);
            state.studyByDate[next] = [move, ...(state.studyByDate[next] || [])];
            delete state.planCache[next];
            saveState();
          }
        }
      }
    }

    state.planCache[date] = {
      blocks: blocks
        .filter(b => b.date === date)
        .sort((a, b) => a.startMin - b.startMin),
      overflow
    };
    saveState();
    setHidden(overflowHint, overflow.length === 0);
  }

  /* ===== Runner / Progress ===== */
  function findTaskById(taskId) {
    for (const [d, arr] of Object.entries(state.studyByDate)) {
      const t = (arr || []).find(x => x.id === taskId);
      if (t) return { date: d, task: t };
    }
    return null;
  }

  function getTaskSteps(task) {
    const steps = computeRangeSteps(task.ranges || []);
    if (steps.length === 0) return ["（範囲なし）"];
    return steps;
  }

  function ensureProgress(taskId, stepsLen) {
    const p = state.progressByTask[taskId] || { doneSteps: [], spentSec: 0 };
    if (!Array.isArray(p.doneSteps)) p.doneSteps = [];
    if (!Number.isFinite(p.spentSec)) p.spentSec = 0;

    if (p.doneSteps.length < stepsLen) {
      p.doneSteps = p.doneSteps.concat(Array(stepsLen - p.doneSteps.length).fill(false));
    } else if (p.doneSteps.length > stepsLen) {
      p.doneSteps = p.doneSteps.slice(0, stepsLen);
    }

    state.progressByTask[taskId] = p;
    return p;
  }

  function computeTotalSec(task) {
    const steps = getTaskSteps(task);
    // perRangeMin があるなら「範囲×perRange」
    if (task.perRangeMin && Number.isFinite(task.perRangeMin) && task.perRangeMin > 0 && steps[0] !== "（範囲なし）") {
      return steps.length * task.perRangeMin * 60;
    }
    // ないなら durationMin
    return clamp(parseInt(task.durationMin || "30", 10), 1, 2000) * 60;
  }

  function countDone(doneSteps) {
    return (doneSteps || []).reduce((a, b) => a + (b ? 1 : 0), 0);
  }

  function setRunnerActive(taskId) {
    state.runner.activeTaskId = taskId;
    saveState();
  }

  function runnerStop() {
    state.runner.isRunning = false;
    state.runner.lastTick = 0;
    saveState();
  }

  function runnerStart() {
    if (!state.runner.activeTaskId) return;
    state.runner.isRunning = true;
    state.runner.lastTick = Date.now();
    saveState();
  }

  function runnerClearActive() {
    runnerStop();
    state.runner.activeTaskId = null;
    saveState();
  }

  function openArrivalDialog(taskId) {
    const found = findTaskById(taskId);
    const name = found ? `${found.task.subject}｜${found.task.taskType}` : "完了";

    const body = document.createElement("div");
    body.className = "grid1";
    const big = document.createElement("div");
    big.className = "arriveBig";
    big.textContent = "到着";
    const sub = document.createElement("div");
    sub.className = "arriveSub";
    sub.textContent = name;
    body.appendChild(big);
    body.appendChild(sub);

    const ok = mkBtn("OK", "btnPrimary", () => {
      closeEditor();
    });

    openEditor("到着", body, [ok]);
  }

  function openRunner(taskId) {
    const found = findTaskById(taskId);
    if (!found) return;

    const t = found.task;
    const steps = getTaskSteps(t);
    const p = ensureProgress(taskId, steps.length);
    const totalSec = computeTotalSec(t);

    setRunnerActive(taskId);

    const body = document.createElement("div");
    body.className = "runner";

    const top = document.createElement("div");
    top.className = "runnerTop";

    const title = document.createElement("div");
    title.className = "runnerTitle";
    title.textContent = `${t.subject}｜${t.taskType}`;

    const timeBox = document.createElement("div");
    timeBox.className = "runnerTime";

    const timeBig = document.createElement("div");
    timeBig.className = "runnerTimeBig";

    const timeSmall = document.createElement("div");
    timeSmall.className = "runnerTimeSmall";

    timeBox.appendChild(timeBig);
    timeBox.appendChild(timeSmall);

    top.appendChild(title);
    top.appendChild(timeBox);

    const prog = document.createElement("div");
    prog.className = "runnerProg";

    const stepsBox = document.createElement("div");
    stepsBox.className = "runnerSteps";

    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "btn btnPrimary";
    btnAll.textContent = "全部完了";

    const makeStepBtn = (label, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "stepBtn";
      b.dataset.i = String(i);

      const left = document.createElement("span");
      left.className = "stepLeft";
      left.textContent = label;

      const right = document.createElement("span");
      right.className = "stepRight";

      b.appendChild(left);
      b.appendChild(right);

      b.addEventListener("click", () => {
        p.doneSteps[i] = !p.doneSteps[i];
        state.progressByTask[taskId] = p;
        saveState();
        renderRunner();
      });

      return b;
    };

    const stepBtns = steps.map((s, i) => makeStepBtn(s, i));
    stepBtns.forEach(b => stepsBox.appendChild(b));

    btnAll.addEventListener("click", () => {
      for (let i = 0; i < p.doneSteps.length; i++) p.doneSteps[i] = true;
      p.spentSec = Math.max(p.spentSec, totalSec);
      state.progressByTask[taskId] = p;
      saveState();
      runnerStop();
      renderRunner();
      openArrivalDialog(taskId);
    });

    const footerRow = document.createElement("div");
    footerRow.className = "runnerBtnsRow";

    const btnToggle = document.createElement("button");
    btnToggle.type = "button";
    btnToggle.className = "btn btnPrimary";

    const btnPause = document.createElement("button");
    btnPause.type = "button";
    btnPause.className = "btn btnGhost";
    btnPause.textContent = "中断";

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "btn btnGhost";
    btnReset.textContent = "リセット";

    footerRow.appendChild(btnToggle);
    footerRow.appendChild(btnReset);
    footerRow.appendChild(btnPause);

    btnToggle.addEventListener("click", () => {
      if (state.runner.activeTaskId !== taskId) setRunnerActive(taskId);
      if (state.runner.isRunning) runnerStop();
      else runnerStart();
      renderRunner();
    });

    btnPause.addEventListener("click", () => {
      // タスクは残すが、実行中だけ解除
      runnerStop();
      // HUDに残したいなら activeTaskId は残してOK。今回は「中断」で active も解除。
      runnerClearActive();
      renderRunner();
      closeEditor();
      setHUDVisible(false);
    });

    btnReset.addEventListener("click", () => {
      runnerStop();
      p.spentSec = 0;
      state.progressByTask[taskId] = p;
      saveState();
      renderRunner();
    });

    body.appendChild(top);
    body.appendChild(prog);
    body.appendChild(btnAll);
    body.appendChild(stepsBox);

    const saveBtn = mkBtn("閉じる", "btnGhost", () => {
      // 閉じる＝実行は継続しても良い。今回は「継続」にしてHUDで戻れるようにする
      closeEditor();
    });

    openEditor("実行", body, [saveBtn]);

    function renderRunner() {
      // tickで p.spentSec は増えるので最新を取り直す
      const p2 = ensureProgress(taskId, steps.length);
      const done = countDone(p2.doneSteps);
      const remainSec = Math.max(0, totalSec - (p2.spentSec || 0));

      timeBig.textContent = fmtMS(remainSec);
      timeSmall.textContent = `残り ${Math.ceil(remainSec / 60)}分`;

      prog.textContent = `${done}/${steps.length}`;

      stepBtns.forEach((b, i) => {
        const doneOne = !!p2.doneSteps[i];
        b.classList.toggle("isDone", doneOne);
        b.querySelector(".stepRight").textContent = doneOne ? "完了" : "";
      });

      btnToggle.textContent = state.runner.isRunning ? "一時停止" : "開始";

      // 全部完了で自動到着
      if (done === steps.length) {
        runnerStop();
        // すでに到着を出した直後の二重表示を避けたいので、spentSec をtotalに寄せるだけ
        p2.spentSec = Math.max(p2.spentSec, totalSec);
        state.progressByTask[taskId] = p2;
        saveState();
      }

      // HUD更新
      if (state.runner.activeTaskId === taskId) {
        hudSubj.textContent = t.subject;
        hudTime.textContent = fmtMS(remainSec);
        setHUDVisible(true);
      }
    }

    renderRunner();
  }

  function tickRunner() {
    const taskId = state.runner.activeTaskId;
    if (!taskId) { setHUDVisible(false); return; }

    const found = findTaskById(taskId);
    if (!found) {
      runnerClearActive();
      setHUDVisible(false);
      return;
    }

    const t = found.task;
    const steps = getTaskSteps(t);
    const p = ensureProgress(taskId, steps.length);
    const totalSec = computeTotalSec(t);

    // HUDを常に更新
    const remainBefore = Math.max(0, totalSec - (p.spentSec || 0));
    hudSubj.textContent = t.subject;
    hudTime.textContent = fmtMS(remainBefore);
    setHUDVisible(true);

    if (!state.runner.isRunning) return;

    const now = Date.now();
    const last = state.runner.lastTick || now;
    const deltaSec = Math.floor((now - last) / 1000);
    if (deltaSec <= 0) return;

    p.spentSec = clamp((p.spentSec || 0) + deltaSec, 0, totalSec);
    state.progressByTask[taskId] = p;
    state.runner.lastTick = last + deltaSec * 1000;
    saveState();

    const remain = Math.max(0, totalSec - p.spentSec);
    hudTime.textContent = fmtMS(remain);

    if (remain <= 0) {
      runnerStop();
      openArrivalDialog(taskId);
    }
  }

  /* ===== Render lists ===== */
  function renderLifeList() {
    const date = lifeDate.value || fmtDate(new Date());
    const blocks = allLifeBlocksForDate(date);

    lifeList.innerHTML = "";
    if (blocks.length === 0) {
      lifeList.appendChild(emptyLI("（この日はまだありません）"));
      return;
    }

    for (const b of blocks) {
      const li = document.createElement("li");
      li.className = "li";

      const head = document.createElement("div");
      head.className = "liHead";
      head.style.borderLeftColor = cssVar("--gray");

      const title = document.createElement("div");
      title.className = "liTitle";
      title.textContent = b.label;

      const meta = document.createElement("div");
      meta.className = "liMeta";
      meta.textContent = `${hhmmOf(b.startMin)}–${hhmmOf(b.endMin)} / ${(b.endMin - b.startMin)}分`;

      head.appendChild(title);
      head.appendChild(meta);
      li.appendChild(head);

      // v12: 生活の編集は無効（タップしても何もしない）

      lifeList.appendChild(li);
    }
  }

  function renderStudyList() {
    const date = studyDate.value || fmtDate(new Date());
    const changed = normalizeDayEstimates(date);

    const arr = state.studyByDate[date] || [];
    studyList.innerHTML = "";
    setHidden(overflowHint, true);

    if (arr.length === 0) {
      studyList.appendChild(emptyLI("（この日はまだありません）"));
      if (changed) renderTimeline(true);
      return;
    }

    arr.forEach((t, idx) => {
      const li = document.createElement("li");
      li.className = "li";

      const head = document.createElement("div");
      head.className = "liHead";
      head.style.borderLeftColor = CATEGORY_COLORS[t.category] || cssVar("--gray");

      const title = document.createElement("div");
      title.className = "liTitle";
      title.textContent = `${t.subject}｜${t.taskType}`;

      const steps = computeRangeSteps(t.ranges || []);
      const perTxt = t.perRangeMin ? ` / 1範囲 ${t.perRangeMin}分` : "";
      const meta = document.createElement("div");
      meta.className = "liMeta";
      meta.textContent =
        `見積 ${t.durationMin}分` +
        perTxt +
        (t.deadlineHHMM ? ` / 希望 ${t.deadlineHHMM}` : "") +
        (steps.length ? ` / 範囲 ${steps.length}個` : "");

      head.appendChild(title);
      head.appendChild(meta);

      const btns = document.createElement("div");
      btns.className = "liBtns";

      const up = miniBtn("↑", () => moveStudy(date, idx, -1));
      const down = miniBtn("↓", () => moveStudy(date, idx, +1));
      const del = miniBtn("削除", () => removeStudy(date, idx));

      [up, down, del].forEach(b => b.addEventListener("click", (e) => e.stopPropagation()));

      btns.appendChild(up);
      btns.appendChild(down);
      btns.appendChild(del);

      li.appendChild(head);
      li.appendChild(btns);

      // 勉強リストは編集OK（今まで通り）
      head.addEventListener("click", () => openStudyEditor(date, t.id));

      studyList.appendChild(li);
    });

    if (changed) renderTimeline(true);
  }

  function emptyLI(text) {
    const li = document.createElement("li");
    li.className = "li";
    const head = document.createElement("div");
    head.className = "liHead";
    head.style.borderLeftColor = cssVar("--gray");
    const t = document.createElement("div");
    t.className = "liTitle";
    t.textContent = text;
    t.style.color = "rgba(232,238,247,.70)";
    head.appendChild(t);
    li.appendChild(head);
    return li;
  }

  function miniBtn(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btnGhost btnMini";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function moveStudy(date, idx, dir) {
    const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
    state.studyByDate[date] = arr;
    delete state.planCache[date];
    saveState();
    renderStudyList();
    renderTimeline(true);
  }

  function removeStudy(date, idx) {
    const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
    const removed = arr[idx];
    arr.splice(idx, 1);
    state.studyByDate[date] = arr;
    delete state.planCache[date];
    saveState();

    // 進捗も掃除（任意）
    if (removed?.id && state.progressByTask[removed.id]) {
      delete state.progressByTask[removed.id];
      // runnerがそのタスクなら止める
      if (state.runner.activeTaskId === removed.id) runnerClearActive();
      saveState();
    }

    renderStudyList();
    renderTimeline(true);
  }

  /* ===== Timeline render ===== */
  function badge(text) {
    const s = document.createElement("span");
    s.className = "badge";
    s.textContent = text;
    return s;
  }

  function renderDay(date) {
    const dayEl = document.createElement("div");
    dayEl.className = "day";
    dayEl.dataset.date = date;

    const header = document.createElement("div");
    header.className = "dayHeader";
    const dObj = parseDate(date);
    header.textContent = `${date}（${dowName(dObj)}）`;

    const grid = document.createElement("div");
    grid.className = "dayGrid";

    const axis = document.createElement("div");
    axis.className = "axis";
    for (let h = 0; h < 24; h++) {
      const y = h * 60 * PX_PER_MIN;
      const lab = document.createElement("div");
      lab.className = "hourLabel";
      lab.style.top = `${y}px`;
      lab.textContent = `${pad2(h)}:00`;
      axis.appendChild(lab);
    }

    const canvas = document.createElement("div");
    canvas.className = "canvas";
    canvas.style.height = `${DAY_MIN * PX_PER_MIN}px`;

    const plan = state.planCache[date];
    let blocks = [];
    if (plan && Array.isArray(plan.blocks)) {
      blocks = plan.blocks;
    } else {
      blocks = [
        ...routineBlocksForDate(date),
        ...customLifeBlocksForDate(date).filter(b => b.date === date),
      ].sort((a, b) => a.startMin - b.startMin);
    }

    for (const b of blocks) {
      const el = document.createElement("div");
      el.className = "block" + (b.contOut ? " contOut" : "") + (b.contIn ? " contIn" : "");
      const durMin = (b.endMin - b.startMin);

      if (durMin <= 20) el.classList.add("isTiny");
      else if (durMin <= 35) el.classList.add("isSmall");

      el.style.top = `${b.startMin * PX_PER_MIN}px`;
      el.style.height = `${Math.max(18, durMin * PX_PER_MIN)}px`;
      el.style.borderLeftColor = b.color || cssVar("--gray");

      const title = document.createElement("div");
      title.className = "blockTitle";
      title.textContent = b.label;

      const meta = document.createElement("div");
      meta.className = "blockMeta";

      meta.appendChild(badge(`${hhmmOf(b.startMin)}–${hhmmOf(b.endMin)}`));
      if (b.kind === "study") meta.appendChild(badge("勉強"));
      else meta.appendChild(badge("生活"));
      if (b.meta) meta.appendChild(badge(b.meta));

      el.appendChild(title);
      el.appendChild(meta);

      // v12: タップ挙動
      // - 生活：編集しない（無効）
      // - 勉強：実行モードを開く
      el.addEventListener("click", () => {
        if (b.kind !== "study") return;

        // perRange の場合 sourceId が "taskId:stepIndex" になる
        const taskId = (b.taskId || String(b.sourceId).split(":")[0]);
        openRunner(taskId);
      });

      canvas.appendChild(el);
    }

    if (date === fmtDate(new Date())) {
      const line = document.createElement("div");
      line.className = "nowLine";
      line.id = "nowLine";
      canvas.appendChild(line);

      const nowTag = document.createElement("div");
      nowTag.className = "nowTag";
      nowTag.id = "nowTag";
      nowTag.textContent = "NOW";
      canvas.appendChild(nowTag);
    }

    grid.appendChild(axis);
    grid.appendChild(canvas);
    dayEl.appendChild(header);
    dayEl.appendChild(grid);

    return dayEl;
  }

  function renderTimeline(force) {
    if (!force) return;
    timeline.innerHTML = "";

    const start = state.ui.loadedStart;
    const end = state.ui.loadedEnd;

    let cur = start;
    while (cur <= end) {
      timeline.appendChild(renderDay(cur));
      cur = addDays(cur, 1);
    }
    updateNowLine();
  }

  function updateNowLine() {
    const today = fmtDate(new Date());
    const dayEl = timeline.querySelector(`.day[data-date="${today}"]`);
    if (!dayEl) return;

    const line = dayEl.querySelector("#nowLine");
    const tag = dayEl.querySelector("#nowTag");
    if (!line || !tag) return;

    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    const y = min * PX_PER_MIN;

    line.style.top = `${y}px`;
    tag.style.top = `${y}px`;
  }

  function jumpToDay(date, toNow) {
    const dayEl = timeline.querySelector(`.day[data-date="${date}"]`);
    if (!dayEl) return;
    let y = dayEl.offsetTop - 70;

    if (toNow) {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      y += min * PX_PER_MIN - 120;
    }
    timeline.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  timeline.addEventListener("scroll", () => {
    const nearBottom = timeline.scrollTop + timeline.clientHeight > timeline.scrollHeight - 800;
    if (!nearBottom) return;

    const oldEnd = state.ui.loadedEnd;
    const newEnd = addDays(oldEnd, 7);
    state.ui.loadedEnd = newEnd;
    saveState();

    let cur = addDays(oldEnd, 1);
    while (cur <= newEnd) {
      timeline.appendChild(renderDay(cur));
      cur = addDays(cur, 1);
    }
    updateNowLine();
  });

  /* ===== Editor (sheet) ===== */
  function openEditor(title, bodyNode, footButtons) {
    editorTitle.textContent = title;
    editorBody.innerHTML = "";
    editorFoot.innerHTML = "";
    editorBody.appendChild(bodyNode);
    footButtons.forEach(b => editorFoot.appendChild(b));
    setHidden(editor, false);
  }
  function closeEditor() {
    setHidden(editor, true);
  }
  editorCancel.addEventListener("click", closeEditor);
  editor.addEventListener("click", (e) => {
    if (e.target === editor) closeEditor();
  });

  function mkField(label, inputEl) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const l = document.createElement("span");
    l.className = "label";
    l.textContent = label;
    wrap.appendChild(l);
    wrap.appendChild(inputEl);
    return wrap;
  }
  function mkSelect(options, value) {
    const s = document.createElement("select");
    for (const [val, text] of options) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = text;
      s.appendChild(o);
    }
    s.value = value;
    return s;
  }
  function mkInput(type, value) {
    const i = document.createElement("input");
    i.type = type;
    if (value != null) i.value = String(value);
    return i;
  }
  function mkBtn(text, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn ${cls || ""}`.trim();
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  /* ===== Study editor（既存のまま） ===== */
  function openStudyEditor(date, taskId) {
    normalizeDayEstimates(date);

    const arr = state.studyByDate[date] || [];
    const idx = arr.findIndex(x => x.id === taskId);
    if (idx < 0) return;
    const t = { ...arr[idx] };

    const body = document.createElement("div");
    body.className = "grid1";

    const catSel = mkSelect([["", "—"], ...Object.keys(SUBJECTS_BY_CATEGORY).map(c => [c, c])], t.category || "");
    const subjSel = document.createElement("select");
    const otherWrap = document.createElement("div");
    otherWrap.className = "grid1";
    const otherSubj = mkInput("text", (t.subject === "その他") ? "" : t.subject);

    const taskSel = document.createElement("select");
    const taskFree = mkInput("text", "");
    const taskFreeWrap = document.createElement("div");
    taskFreeWrap.className = "grid1";

    const perRange = mkInput("number", t.perRangeMin ?? "");
    perRange.min = "1";
    perRange.step = "1";

    const min = mkInput("number", t.durationMin);
    min.min = "1"; min.step = "1";
    const dl = mkInput("time", t.deadlineHHMM || "");

    const rangesBox = document.createElement("div");
    rangesBox.className = "ranges";

    const readRangesLocal = () => {
      return Array.from(rangesBox.querySelectorAll(".rangeRow")).map(row => ({
        start: (row.querySelector(".rs").value || "").trim(),
        end: (row.querySelector(".re").value || "").trim(),
      })).filter(x => x.start || x.end);
    };

    const resolveSubjectLocal = () => {
      if (catSel.value !== "その他") return (subjSel.value || "").trim();
      const typed = (otherSubj.value || "").trim();
      return typed ? typed : "その他";
    };

    const autoMinUpdate = () => {
      const per = parseInt(perRange.value, 10);
      if (!Number.isFinite(per) || per <= 0) return;
      const ranges = readRangesLocal();
      const auto = computeDurationFromPerRange(per, ranges);
      if (auto != null) min.value = String(auto);
    };

    const addOne = (prefill) => {
      const row = document.createElement("div");
      row.className = "rangeRow";
      row.innerHTML = `
        <input class="rs" type="text" placeholder="開始" />
        <input class="re" type="text" placeholder="終了" />
        <button type="button" class="rd">✕</button>
      `;
      if (prefill) {
        row.querySelector(".rs").value = prefill.start || "";
        row.querySelector(".re").value = prefill.end || "";
      }
      row.querySelector(".rd").addEventListener("click", () => {
        row.remove();
        if (rangesBox.children.length === 0) addOne();
        autoMinUpdate();
      });
      row.querySelector(".rs").addEventListener("input", autoMinUpdate);
      row.querySelector(".re").addEventListener("input", autoMinUpdate);
      rangesBox.appendChild(row);
    };

    const renderRanges = (ranges) => {
      rangesBox.innerHTML = "";
      if (!ranges.length) ranges = [{ start: "", end: "" }];
      for (const r of ranges) addOne(r);
    };

    const fillSubjects = () => {
      subjSel.innerHTML = "";
      addOpt(subjSel, "", "—");
      const cat = catSel.value;
      if (!cat) {
        subjSel.disabled = true;
        otherWrap.hidden = true;
        return;
      }
      const subs = SUBJECTS_BY_CATEGORY[cat] || [];
      subs.forEach(s => addOpt(subjSel, s, s));
      if (cat === "その他") {
        subjSel.value = "その他";
        subjSel.disabled = true;
        otherWrap.hidden = false;
      } else {
        subjSel.disabled = false;
        otherWrap.hidden = true;
      }
    };

    const fillTaskTypes = () => {
      taskSel.innerHTML = "";
      addOpt(taskSel, "", "—");
      const subj = resolveSubjectLocal();
      let opts = TASK_OPTIONS_BY_SUBJECT[subj];
      if (!opts) {
        opts = uniq(["教科書", ...Object.values(TASK_OPTIONS_BY_SUBJECT).flat(), "自由入力"]);
      } else {
        opts = uniq([...opts, "自由入力"]);
      }
      opts.forEach(x => addOpt(taskSel, x, x));
      if (opts.includes(t.taskType)) taskSel.value = t.taskType;
      else taskSel.value = "";
      taskFreeWrap.hidden = (taskSel.value !== "自由入力");
    };

    catSel.addEventListener("change", () => { fillSubjects(); fillTaskTypes(); autoMinUpdate(); });
    subjSel.addEventListener("change", () => { fillTaskTypes(); autoMinUpdate(); });
    otherSubj.addEventListener("input", () => { fillTaskTypes(); autoMinUpdate(); });
    taskSel.addEventListener("change", () => { taskFreeWrap.hidden = (taskSel.value !== "自由入力"); autoMinUpdate(); });
    taskFree.addEventListener("input", autoMinUpdate);
    perRange.addEventListener("input", autoMinUpdate);

    fillSubjects();
    if (catSel.value) subjSel.value = (catSel.value === "その他") ? "その他" : (t.subject || "");
    fillTaskTypes();

    taskFree.value = "";
    if (t.taskType && !Object.values(TASK_OPTIONS_BY_SUBJECT).flat().includes(t.taskType)) {
      taskSel.value = "自由入力";
      taskFreeWrap.hidden = false;
      taskFree.value = t.taskType;
    }

    renderRanges(t.ranges || []);

    const addRangeBtn = mkBtn("範囲＋", "btnGhost", () => { addOne(); autoMinUpdate(); });

    body.appendChild(mkField("系", catSel));
    body.appendChild(mkField("科目", subjSel));

    otherWrap.appendChild(mkField("科目名（その他）", otherSubj));
    body.appendChild(otherWrap);

    body.appendChild(mkField("タスク内容", taskSel));
    taskFreeWrap.appendChild(mkField("タスク内容（自由入力）", taskFree));
    body.appendChild(taskFreeWrap);

    const rangesCard = document.createElement("div");
    rangesCard.className = "cardMini";
    const head = document.createElement("div");
    head.className = "miniHead";
    const title = document.createElement("div");
    title.className = "miniTitle";
    title.textContent = "範囲（開始 / 終了）";
    head.appendChild(title);
    head.appendChild(addRangeBtn);
    rangesCard.appendChild(head);
    rangesCard.appendChild(rangesBox);
    body.appendChild(rangesCard);

    body.appendChild(mkField("1範囲あたり（分）", perRange));
    body.appendChild(mkField("見積（分）", min));
    body.appendChild(mkField("終了希望", dl));

    const save = mkBtn("保存", "btnPrimary", () => {
      const cat = catSel.value.trim();
      const subj = resolveSubjectLocal();
      const taskType = (taskSel.value === "自由入力") ? (taskFree.value || "").trim() : (taskSel.value || "").trim();
      const ranges = readRangesLocal();

      const per = parseInt(perRange.value, 10);
      const perRangeMin = (Number.isFinite(per) && per > 0) ? per : null;

      let dur = clamp(parseInt(min.value || "30", 10), 1, 2000);
      if (perRangeMin) {
        const auto = computeDurationFromPerRange(perRangeMin, ranges);
        if (auto != null) dur = auto;
      }

      const deadline = (dl.value || "").trim();

      if (!cat || !subj || !taskType) return;

      const next = [...arr];
      next[idx] = {
        ...t,
        category: cat,
        subject: subj,
        taskType,
        ranges,
        perRangeMin,
        durationMin: dur,
        deadlineHHMM: deadline
      };

      state.studyByDate[date] = next;
      delete state.planCache[date];
      saveState();
      renderStudyList();
      renderTimeline(true);
      closeEditor();
    });

    const del = mkBtn("削除", "btnGhost", () => {
      const next = arr.filter(x => x.id !== taskId);
      state.studyByDate[date] = next;
      delete state.planCache[date];
      saveState();
      renderStudyList();
      renderTimeline(true);
      closeEditor();
    });

    openEditor(`${date} 勉強編集`, body, [save, del]);
  }

  /* ===== Events ===== */
  lifeDate.addEventListener("change", () => {
    state.ui.lifeDate = lifeDate.value || fmtDate(new Date());
    saveState();
    applyRoutineToUI(state.ui.lifeDate);
    renderLifeList();
    renderTimeline(true);
  });

  const routineInputs = [
    routineSchoolOn, routineCommuteAMStart, routineCommuteAMMin,
    routineSchoolStart, routineSchoolEnd,
    routineClubOn, routineClubStart, routineClubEnd,
    routineReturnMode, routineReturn2Start,
    routineBathOn, routineBathMin, routinePrepMin,
    routineSleepStart, routineWake
  ];
  routineInputs.forEach(el => el.addEventListener("input", () => {
    const date = lifeDate.value || fmtDate(new Date());
    setRoutine(date, {
      schoolOn: routineSchoolOn.value,
      commuteAMStart: routineCommuteAMStart.value || "07:30",
      commuteAMMin: clamp(parseInt(routineCommuteAMMin.value || "60", 10), 1, 1000),
      schoolStart: routineSchoolStart.value || "08:30",
      schoolEnd: routineSchoolEnd.value || "15:00",
      clubOn: routineClubOn.value,
      clubStart: routineClubStart.value || "16:10",
      clubEnd: routineClubEnd.value || "18:30",
      returnMode: routineReturnMode.value,
      return2Start: routineReturn2Start.value || "19:00",
      bathOn: routineBathOn.value,
      bathMin: clamp(parseInt(routineBathMin.value || "60", 10), 1, 600),
      prepMin: clamp(parseInt(routinePrepMin.value || "15", 10), 1, 600),
      sleepStart: routineSleepStart.value || "23:30",
      wakeTime: routineWake.value || "06:30",
    });

    routineClubEndWrap.style.display = (routineClubOn.value === "on") ? "" : "none";
    setHidden(return60Wrap, routineReturnMode.value !== "60");
    setHidden(return30Wrap, routineReturnMode.value !== "30x2");

    validateRoutine(date);
    renderLifeList();
    renderTimeline(true);
  }));

  lifeType.addEventListener("change", syncLifeCustomUI);
  $$('input[name="lifeMode"]').forEach(r => r.addEventListener("change", syncLifeModeUI));

  btnAddLife.addEventListener("click", () => {
    setHidden(lifeAddHint, true);
    const date = lifeDate.value || fmtDate(new Date());
    const rawType = lifeType.value || "";
    const type = (rawType === "自由入力") ? (lifeCustom.value || "").trim() : rawType;
    if (!type) { setHidden(lifeAddHint, false); return; }

    let startMin = null, endMin = null;
    if (lifeMode() === "duration") {
      startMin = minutesOf(lifeStart.value);
      const mins = clamp(parseInt(lifeMin.value || "1", 10), 1, 2000);
      if (startMin == null) { setHidden(lifeAddHint, false); return; }
      endMin = startMin + mins;
    } else {
      const a = minutesOf(lifeFrom.value);
      const b = minutesOf(lifeTo.value);
      if (a == null || b == null) { setHidden(lifeAddHint, false); return; }
      startMin = a; endMin = b;
      if (endMin <= startMin) endMin += 1440;
    }

    const block = { id: uid(), type, startMin, endMin };
    // 重なり防止（ルーティン＋生活追加）
    if (!canPlaceCustom(date, block, null)) {
      setHidden(lifeAddHint, false);
      return;
    }

    const arr = state.lifeByDate[date] ? [...state.lifeByDate[date]] : [];
    arr.push(block);
    state.lifeByDate[date] = arr;
    delete state.planCache[date];
    delete state.planCache[addDays(date, 1)];
    saveState();

    renderLifeList();
    renderTimeline(true);
  });

  btnClearLifeDay.addEventListener("click", () => {
    const date = lifeDate.value || fmtDate(new Date());
    state.lifeByDate[date] = [];
    delete state.planCache[date];
    delete state.planCache[addDays(date, 1)];
    saveState();
    renderLifeList();
    renderTimeline(true);
  });

  studyDate.addEventListener("change", () => {
    state.ui.studyDate = studyDate.value || fmtDate(new Date());
    saveState();
    renderStudyList();
  });

  studyCategory.addEventListener("change", () => { syncStudySubjectSelect(); syncStudyTaskTypeSelect(); autoUpdateStudyMin(); });
  studySubject.addEventListener("change", () => { syncStudyTaskTypeSelect(); autoUpdateStudyMin(); });
  studyOtherSubject.addEventListener("input", () => { syncStudyTaskTypeSelect(); autoUpdateStudyMin(); });
  studyTaskType.addEventListener("change", () => { setHidden(studyTaskFreeWrap, studyTaskType.value !== "自由入力"); autoUpdateStudyMin(); });
  studyTaskFree.addEventListener("input", autoUpdateStudyMin);
  studyPerRangeMin.addEventListener("input", autoUpdateStudyMin);
  rangesList.addEventListener("input", autoUpdateStudyMin);
  btnAddRange.addEventListener("click", () => addRangeRow());

  btnAddStudy.addEventListener("click", () => {
    setHidden(studyAddHint, true);
    const date = studyDate.value || fmtDate(new Date());
    const cat = (studyCategory.value || "").trim();
    const subject = resolveStudySubject();
    const taskType = resolveTaskType();
    if (!cat || !subject || !taskType) {
      setHidden(studyAddHint, false);
      return;
    }

    const ranges = readRanges();

    const per = parseInt(studyPerRangeMin.value, 10);
    const perRangeMin = (Number.isFinite(per) && per > 0) ? per : null;

    let durationMin = clamp(parseInt(studyMin.value || "30", 10), 1, 2000);
    if (perRangeMin) {
      const auto = computeDurationFromPerRange(perRangeMin, ranges);
      if (auto != null) durationMin = auto;
    }

    const deadline = (studyDeadline.value || "").trim();

    const task = {
      id: uid(),
      category: cat,
      subject,
      taskType,
      ranges,
      perRangeMin,
      durationMin,
      deadlineHHMM: deadline,
      createdAt: Date.now()
    };

    const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
    arr.push(task);
    state.studyByDate[date] = arr;

    delete state.planCache[date];
    saveState();

    renderStudyList();
    renderTimeline(true);
  });

  btnClearStudyDay.addEventListener("click", () => {
    const date = studyDate.value || fmtDate(new Date());
    state.studyByDate[date] = [];
    delete state.planCache[date];
    saveState();
    renderStudyList();
    renderTimeline(true);
  });

  btnAutoBuild.addEventListener("click", () => {
    const date = studyDate.value || fmtDate(new Date());
    buildPlanForDay(date, true);
    renderTimeline(true);
    setTab("timeline");
    jumpToDay(date, true);
  });

  btnJumpNow.addEventListener("click", () => {
    setTab("timeline");
    jumpToDay(fmtDate(new Date()), true);
  });

  /* ===== overlap check for custom life ===== */
  function canPlaceCustom(date, block, ignoreId) {
    const d0 = date;
    const d1 = addDays(date, 1);

    const parts = splitCrossMidnight(d0, block.startMin, block.endMin);

    const segs0 = [
      ...routineBlocksForDate(d0).map(b => ({ startMin: b.startMin, endMin: b.endMin })),
      ...customLifeBlocksForDate(d0)
        .filter(b => b.date === d0 && b.sourceId !== ignoreId)
        .map(b => ({ startMin: b.startMin, endMin: b.endMin })),
      ...parts.filter(p => p.date === d0).map(p => ({ startMin: p.startMin, endMin: p.endMin })),
    ];
    if (hasOverlap(segs0)) return false;

    const partNext = parts.filter(p => p.date === d1);
    if (partNext.length) {
      const segs1 = [
        ...routineBlocksForDate(d1).map(b => ({ startMin: b.startMin, endMin: b.endMin })),
        ...customLifeBlocksForDate(d1)
          .filter(b => b.date === d1 && b.sourceId !== ignoreId)
          .map(b => ({ startMin: b.startMin, endMin: b.endMin })),
        ...partNext.map(p => ({ startMin: p.startMin, endMin: p.endMin })),
      ];
      if (hasOverlap(segs1)) return false;
    }
    return true;
  }

  /* ===== Clock ===== */
  function startClock() {
    const tick = () => {
      const d = new Date();
      clockText.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    };
    tick();
    if (window.__clockInterval) clearInterval(window.__clockInterval);
    window.__clockInterval = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  }

  /* ===== Boot ===== */
  function hydrate() {
    const today = fmtDate(new Date());

    setTab(state.ui.activeTab || "life");

    lifeDate.value = state.ui.lifeDate || today;
    studyDate.value = state.ui.studyDate || today;

    applyRoutineToUI(lifeDate.value);

    syncLifeCustomUI();
    syncLifeModeUI();

    studyCategory.value = "";
    syncStudySubjectSelect();
    syncStudyTaskTypeSelect();
    setHidden(studyOtherSubjectWrap, true);
    setHidden(studyTaskFreeWrap, true);

    renderLifeList();
    renderStudyList();
    renderTimeline(true);

    // runner HUD
    setHUDVisible(!!state.runner.activeTaskId);
    tickRunner();
  }

  initSelects();
  hydrate();
  startClock();
  updateNowLine();
  setInterval(updateNowLine, 30 * 1000);

  // runner tick
  setInterval(() => {
    try { tickRunner(); } catch {}
  }, 1000);
});
