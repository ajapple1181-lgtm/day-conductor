"use strict";

/* =========================
   Day Conductor (stable)
   - No confirm/modal
   - Mobile-first
   - Tabs + clock always work
   ========================= */

window.addEventListener("DOMContentLoaded", () => {
  const LS_KEY = "day_conductor_v3";
  const DAY_MIN = 1440;
  const PX_PER_MIN = 1.25;

  /* ===== Utilities ===== */
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));

  function pad2(n) { return String(n).padStart(2, "0"); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function uid() { return Math.random().toString(16).slice(2) + Date.now().toString(16); }

  function fmtDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function parseDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function addDays(iso, delta) {
    const d = parseDate(iso) || new Date();
    d.setDate(d.getDate() + delta);
    return fmtDate(d);
  }
  function dowName(d) {
    return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  }

  function minutesOf(hhmm) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }
  function hhmmOf(min) {
    min = ((min % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  }

  function setHidden(el, v) { if (el) el.hidden = !!v; }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ===== Colors / options ===== */
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
    "部活": 120,
  };

  const DEFAULT_SETTINGS = {
    commuteStart: "07:30",
    commuteMin: 60,
    schoolStart: "08:30",
    schoolEndMWF: "15:00",
    schoolEndTT: "16:00",
    weekendSchool: "off",
    clubEnabled: "off",
    clubStart: "16:10",
    clubEnd: "18:30",
    sleepStart: "23:30",
    sleepMin: 420,
  };

  /* ===== State ===== */
  function freshState() {
    const today = fmtDate(new Date());
    return {
      settings: { ...DEFAULT_SETTINGS },
      lifeByDate: {},   // { [date]: [{id,type,startMin,endMin}] }
      studyByDate: {},  // { [date]: [{id,category,subject,taskType,ranges,durationMin,deadlineHHMM,link,createdAt}] }
      planCache: {},    // { [date]: { blocks:[...], overflow:[taskId...] } }
      ui: {
        activeTab: "life",
        lifeDate: today,
        studyDate: today,
        loadedStart: addDays(today, -2),
        loadedEnd: addDays(today, 10),
      }
    };
  }
  function sanitizeState(s) {
    const base = freshState();
    s = s && typeof s === "object" ? s : {};
    return {
      ...base,
      ...s,
      settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
      lifeByDate: s.lifeByDate || {},
      studyByDate: s.studyByDate || {},
      planCache: s.planCache || {},
      ui: { ...base.ui, ...(s.ui || {}) },
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return freshState();
      return sanitizeState(JSON.parse(raw));
    } catch {
      return freshState();
    }
  }
  function saveState() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  let state = loadState();

  /* ===== DOM (必須要素チェック) ===== */
  const clockText = $("#clockText");
  const btnJumpNow = $("#btnJumpNow");

  const tabs = $$(".tab");
  const tabLife = $("#tabLife");
  const tabStudy = $("#tabStudy");
  const tabTimeline = $("#tabTimeline");

  const btnResetSettings = $("#btnResetSettings");
  const setCommuteStart = $("#setCommuteStart");
  const setCommuteMin = $("#setCommuteMin");
  const setSchoolStart = $("#setSchoolStart");
  const setSchoolEndMWF = $("#setSchoolEndMWF");
  const setSchoolEndTT = $("#setSchoolEndTT");
  const setWeekendSchool = $("#setWeekendSchool");
  const setClubEnabled = $("#setClubEnabled");
  const setClubStart = $("#setClubStart");
  const setClubEnd = $("#setClubEnd");
  const setSleepStart = $("#setSleepStart");
  const setSleepMin = $("#setSleepMin");
  const clubEndWrap = $("#clubEndWrap");
  const routineOverlapHint = $("#routineOverlapHint");

  const lifeDate = $("#lifeDate");
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
  const studyMin = $("#studyMin");
  const studyDeadline = $("#studyDeadline");
  const studyLink = $("#studyLink");
  const btnAddStudy = $("#btnAddStudy");
  const btnClearStudyDay = $("#btnClearStudyDay");
  const btnAutoBuild = $("#btnAutoBuild");
  const btnRecalc = $("#btnRecalc");
  const studyList = $("#studyList");
  const studyAddHint = $("#studyAddHint");
  const overflowHint = $("#overflowHint");

  const timeline = $("#timeline");
  const btnJumpToday = $("#btnJumpToday");
  const btnTop = $("#btnTop");

  const required = [
    clockText, btnJumpNow,
    tabLife, tabStudy, tabTimeline,
    btnResetSettings,
    setCommuteStart, setCommuteMin, setSchoolStart, setSchoolEndMWF, setSchoolEndTT,
    setWeekendSchool, setClubEnabled, setClubStart, setClubEnd, setSleepStart, setSleepMin,
    lifeDate, lifeType, lifeStart, lifeMin, btnAddLife,
    studyDate, studyCategory, studySubject, studyTaskType, rangesList, studyMin, btnAddStudy,
    timeline
  ];
  if (required.some(x => !x)) {
    // HTMLとJSがズレてるとここで止める（真っ白バグを防ぐ）
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:10px;right:10px;bottom:10px;z-index:9999;background:#300;color:#fff;padding:10px;border-radius:12px;font:12px/1.4 system-ui;";
    box.textContent = "読み込みエラー：index.html と app.js の部品名が一致していません（更新が反映されていない可能性もあります）";
    document.body.appendChild(box);
    return;
  }

  /* ===== Helpers ===== */
  function addOpt(sel, val, label) {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = label;
    sel.appendChild(o);
  }
  function uniq(arr) {
    const s = new Set();
    const out = [];
    for (const x of arr) {
      const k = String(x);
      if (!s.has(k)) { s.add(k); out.push(x); }
    }
    return out;
  }

  /* ===== Range parsing ===== */
  function parseLeadingInt(token) {
    const t = String(token || "").trim();
    const m = /^(-?\d+)(.*)$/.exec(t);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (String(n) !== m[1]) return null;
    return { num: n, rest: m[2] || "" };
  }

  // start:11(2-3) end:15(3) => 11(2-3),12,13,14,15(3)
  // startとendの先頭整数が同じ => 1個だけ（71-71 => 71）
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

  function perRangeMinutes(subject, taskType) {
    if ((subject === "化学" || subject === "生物") && taskType === "セミナー") return 20;
    if ((subject === "数学Ⅲ" || subject === "数学C") && taskType === "4STEP") return 10;
    return null;
  }
  function computeAutoMin(subject, taskType, ranges) {
    const per = perRangeMinutes(subject, taskType);
    if (!per) return null;
    const steps = computeRangeSteps(ranges);
    return per * Math.max(1, steps.length || 1);
  }

  /* ===== Cross-midnight split (pure) ===== */
  function splitItemCrossMidnight(baseDateIso, item) {
    let s = item.startMin;
    let e = item.endMin;

    // duration mode may produce e > 1440, range mode may have e <= s
    if (e <= s) e += 1440;

    const parts = [];
    const date0 = baseDateIso;
    const date1 = addDays(baseDateIso, 1);

    if (s < 1440 && e <= 1440) {
      parts.push({ ...item, date: date0, startMin: s, endMin: e });
      return parts;
    }
    if (s < 1440 && e > 1440) {
      parts.push({ ...item, date: date0, startMin: s, endMin: 1440 });
      parts.push({ ...item, date: date1, startMin: 0, endMin: e - 1440 });
      return parts;
    }
    // (rare) if s already >= 1440
    parts.push({ ...item, date: date1, startMin: s - 1440, endMin: e - 1440 });
    return parts;
  }

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

  /* ===== Routine blocks for date (includes carry-in sleep) ===== */
  function routinePartsForDate(date) {
    const s = state.settings;
    const dObj = parseDate(date);
    const isWeekend = [0, 6].includes(dObj.getDay());
    const isTT = (dObj.getDay() === 2 || dObj.getDay() === 4);
    const showSchool = !(isWeekend && s.weekendSchool === "off");

    const out = [];

    if (showSchool) {
      // commute
      const cStart = minutesOf(s.commuteStart);
      const cEnd = cStart == null ? null : cStart + clamp(parseInt(s.commuteMin || "60", 10), 1, 1000);
      if (cStart != null && cEnd != null) {
        out.push({ kind: "life", date, label: "移動", color: cssVar("--gray"), startMin: cStart, endMin: cEnd, meta: "生活", link: "" });
      }

      // school
      const scStart = minutesOf(s.schoolStart);
      const scEnd = minutesOf(isTT ? s.schoolEndTT : s.schoolEndMWF);
      if (scStart != null && scEnd != null) {
        out.push({ kind: "life", date, label: "授業", color: cssVar("--gray"), startMin: scStart, endMin: scEnd, meta: "生活", link: "" });
      }
    }

    // club (same day only)
    if (s.clubEnabled === "on") {
      const a = minutesOf(s.clubStart);
      const b = minutesOf(s.clubEnd);
      if (a != null && b != null) {
        const parts = splitItemCrossMidnight(date, { kind: "life", label: "部活", color: cssVar("--gray"), startMin: a, endMin: b, meta: "生活", link: "" });
        for (const p of parts) if (p.date === date) out.push({ ...p, date });
      }
    }

    // sleep: include (1) today's start part + (2) yesterday carry-in part
    const slStart = minutesOf(s.sleepStart);
    const slMin = clamp(parseInt(s.sleepMin || "420", 10), 1, 1440);

    if (slStart != null) {
      // today's sleep
      {
        const parts = splitItemCrossMidnight(date, { kind: "life", label: "就寝", color: cssVar("--gray"), startMin: slStart, endMin: slStart + slMin, meta: "生活", link: "" });
        for (const p of parts) if (p.date === date) out.push({ ...p, date });
      }
      // yesterday carry-in
      {
        const prev = addDays(date, -1);
        const parts = splitItemCrossMidnight(prev, { kind: "life", label: "就寝", color: cssVar("--gray"), startMin: slStart, endMin: slStart + slMin, meta: "生活", link: "" });
        for (const p of parts) if (p.date === date) out.push({ ...p, date });
      }
    }

    return out;
  }

  /* ===== User life blocks for date (includes carry-in from prev day) ===== */
  function userLifePartsForDate(date) {
    const out = [];
    const todayArr = state.lifeByDate[date] || [];
    const prevArr = state.lifeByDate[addDays(date, -1)] || [];

    for (const b of todayArr) {
      const parts = splitItemCrossMidnight(date, { kind: "life", label: b.type, color: cssVar("--gray"), startMin: b.startMin, endMin: b.endMin, meta: "生活", link: "" });
      for (const p of parts) if (p.date === date) out.push({ ...p, date });
    }
    for (const b of prevArr) {
      const parts = splitItemCrossMidnight(addDays(date, -1), { kind: "life", label: b.type, color: cssVar("--gray"), startMin: b.startMin, endMin: b.endMin, meta: "生活", link: "" });
      for (const p of parts) if (p.date === date) out.push({ ...p, date });
    }
    return out;
  }

  function allLifeSegmentsForDate(date) {
    const segs = [];
    for (const b of [...routinePartsForDate(date), ...userLifePartsForDate(date)]) {
      segs.push({ startMin: b.startMin, endMin: b.endMin });
    }
    return segs;
  }

  /* ===== Planning study into free slots ===== */
  function subtractSegments(baseSegs, busySegs) {
    const busy = busySegs
      .map(x => ({ start: clamp(x.startMin, 0, 1440), end: clamp(x.endMin, 0, 1440) }))
      .filter(x => x.end > x.start)
      .sort((a, b) => a.start - b.start);

    // merge busy
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
    const blocks = [];

    // Fixed life blocks for date (routine + user life)
    const routine = routinePartsForDate(date);
    const userLife = userLifePartsForDate(date);
    blocks.push(...routine, ...userLife);

    // occupied segments in this day
    const occupied = blocks.map(b => ({ startMin: b.startMin, endMin: b.endMin })).filter(x => x.endMin > x.startMin);

    // study window
    const s = state.settings;
    const dObj = parseDate(date);
    const isWeekend = [0, 6].includes(dObj.getDay());
    const isTT = (dObj.getDay() === 2 || dObj.getDay() === 4);

    const schoolEndMin = minutesOf(isTT ? s.schoolEndTT : s.schoolEndMWF) ?? 0;
    const clubEndMin = (s.clubEnabled === "on") ? (minutesOf(s.clubEnd) ?? 0) : 0;
    let baseStart = Math.max(schoolEndMin, clubEndMin);

    if (isWeekend && s.weekendSchool === "off") baseStart = 0;

    const sleepStartMin = minutesOf(s.sleepStart) ?? 1410;
    const windowEnd = (sleepStartMin > baseStart) ? sleepStartMin : 1440;

    let free = subtractSegments([{ start: baseStart, end: windowEnd }], occupied);

    const tasks = (state.studyByDate[date] || []).map(t => ({ ...t }));
    tasks.sort((a, b) => {
      const da = a.deadlineHHMM ? minutesOf(a.deadlineHHMM) : null;
      const db = b.deadlineHHMM ? minutesOf(b.deadlineHHMM) : null;
      if (da == null && db == null) return (a.createdAt || 0) - (b.createdAt || 0);
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });

    const overflow = [];
    for (const t of tasks) {
      const dur = clamp(parseInt(t.durationMin || "30", 10), 1, 2000);
      const deadlineMin = t.deadlineHHMM ? minutesOf(t.deadlineHHMM) : null;

      let place = placeTask(free, dur, deadlineMin);
      if (!place) place = placeTask(free, dur, null);

      if (!place) {
        overflow.push(t.id);
        continue;
      }

      free = reserve(free, place.start, place.end);

      blocks.push({
        kind: "study",
        date,
        startMin: place.start,
        endMin: place.end,
        label: `${t.subject}｜${t.taskType}`,
        color: CATEGORY_COLORS[t.category] || cssVar("--gray"),
        meta: `${dur}分` + (t.deadlineHHMM ? ` / 希望 ${t.deadlineHHMM}` : ""),
        link: t.link || "",
      });
    }

    state.planCache[date] = {
      blocks: blocks.filter(b => b.date === date).sort((a, b) => a.startMin - b.startMin),
      overflow
    };
    saveState();

    setHidden(overflowHint, overflow.length === 0);

    // carry overflow to next day (optional)
    if (allowCarry && overflow.length) {
      const next = addDays(date, 1);
      const todayArr = state.studyByDate[date] || [];
      const map = new Map(todayArr.map(x => [x.id, x]));
      const carry = overflow.map(id => map.get(id)).filter(Boolean);

      state.studyByDate[date] = todayArr.filter(x => !overflow.includes(x.id));
      state.studyByDate[next] = [...carry, ...(state.studyByDate[next] || [])];

      delete state.planCache[next];
      saveState();
    }
  }

  /* ===== UI: selects init ===== */
  function initSelects() {
    // life types
    lifeType.innerHTML = "";
    for (const x of LIFE_TYPES) addOpt(lifeType, x, x);

    // study category
    studyCategory.innerHTML = "";
    addOpt(studyCategory, "", "—");
    for (const cat of Object.keys(SUBJECTS_BY_CATEGORY)) addOpt(studyCategory, cat, cat);

    // at least one range row
    if (rangesList.children.length === 0) addRangeRow();
  }

  /* ===== UI: hydrate ===== */
  function hydrate() {
    // settings
    setCommuteStart.value = state.settings.commuteStart;
    setCommuteMin.value = String(state.settings.commuteMin);
    setSchoolStart.value = state.settings.schoolStart;
    setSchoolEndMWF.value = state.settings.schoolEndMWF;
    setSchoolEndTT.value = state.settings.schoolEndTT;
    setWeekendSchool.value = state.settings.weekendSchool;
    setClubEnabled.value = state.settings.clubEnabled;
    setClubStart.value = state.settings.clubStart;
    setClubEnd.value = state.settings.clubEnd;
    setSleepStart.value = state.settings.sleepStart;
    setSleepMin.value = String(state.settings.sleepMin);

    clubEndWrap.style.display = (setClubEnabled.value === "on") ? "" : "none";

    // dates
    lifeDate.value = state.ui.lifeDate || fmtDate(new Date());
    studyDate.value = state.ui.studyDate || fmtDate(new Date());

    // tab
    setTab(state.ui.activeTab || "life");

    // study chain reset
    studyCategory.value = "";
    syncStudySubjectSelect();
    syncStudyTaskTypeSelect();
    studyMin.value = "30";
    studyDeadline.value = "";
    studyLink.value = "";
    studyTaskFree.value = "";
    studyOtherSubject.value = "";
    setHidden(studyOtherSubjectWrap, true);
    setHidden(studyTaskFreeWrap, true);

    // life mode
    setHidden(lifeCustomWrap, true);
    setHidden(lifeRangeBox, true);
    setHidden(lifeDurationBox, false);

    // defaults
    const def = LIFE_DEFAULT_MIN[lifeType.value];
    if (def != null) lifeMin.value = String(def);

    validateRoutineOverlap();
  }

  /* ===== Tabs ===== */
  function setTab(name) {
    state.ui.activeTab = name;
    saveState();

    tabs.forEach(b => b.classList.toggle("is-active", b.dataset.tab === name));
    tabLife.classList.toggle("is-active", name === "life");
    tabStudy.classList.toggle("is-active", name === "study");
    tabTimeline.classList.toggle("is-active", name === "timeline");
  }

  tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  /* ===== Settings change ===== */
  function onSettingsChange() {
    state.settings.commuteStart = setCommuteStart.value || DEFAULT_SETTINGS.commuteStart;
    state.settings.commuteMin = clamp(parseInt(setCommuteMin.value || "60", 10), 1, 1000);

    state.settings.schoolStart = setSchoolStart.value || DEFAULT_SETTINGS.schoolStart;
    state.settings.schoolEndMWF = setSchoolEndMWF.value || DEFAULT_SETTINGS.schoolEndMWF;
    state.settings.schoolEndTT = setSchoolEndTT.value || DEFAULT_SETTINGS.schoolEndTT;
    state.settings.weekendSchool = setWeekendSchool.value || "off";

    state.settings.clubEnabled = setClubEnabled.value || "off";
    state.settings.clubStart = setClubStart.value || DEFAULT_SETTINGS.clubStart;
    state.settings.clubEnd = setClubEnd.value || DEFAULT_SETTINGS.clubEnd;

    state.settings.sleepStart = setSleepStart.value || DEFAULT_SETTINGS.sleepStart;
    state.settings.sleepMin = clamp(parseInt(setSleepMin.value || "420", 10), 1, 1440);

    clubEndWrap.style.display = (state.settings.clubEnabled === "on") ? "" : "none";

    state.planCache = {};
    saveState();

    validateRoutineOverlap();
    renderTimeline(true);
  }

  [
    setCommuteStart, setCommuteMin,
    setSchoolStart, setSchoolEndMWF, setSchoolEndTT,
    setWeekendSchool,
    setClubEnabled, setClubStart, setClubEnd,
    setSleepStart, setSleepMin
  ].forEach(el => el.addEventListener("input", onSettingsChange));
  [setWeekendSchool, setClubEnabled].forEach(el => el.addEventListener("change", onSettingsChange));

  btnResetSettings.addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    state.planCache = {};
    saveState();
    hydrate();
    renderTimeline(true);
  });

  function validateRoutineOverlap() {
    const d = fmtDate(new Date());
    const segs = routinePartsForDate(d).map(b => ({ startMin: b.startMin, endMin: b.endMin }));
    setHidden(routineOverlapHint, !hasOverlap(segs));
  }

  /* ===== Life add ===== */
  lifeDate.addEventListener("change", () => {
    state.ui.lifeDate = lifeDate.value || fmtDate(new Date());
    saveState();
  });

  lifeType.addEventListener("change", () => {
    const isCustom = (lifeType.value === "自由入力");
    setHidden(lifeCustomWrap, !isCustom);
    if (!isCustom) lifeCustom.value = "";
    const def = LIFE_DEFAULT_MIN[lifeType.value];
    if (def != null) lifeMin.value = String(def);
  });

  $$('input[name="lifeMode"]').forEach(r => r.addEventListener("change", () => {
    const mode = lifeMode();
    setHidden(lifeDurationBox, mode !== "duration");
    setHidden(lifeRangeBox, mode !== "range");
  }));

  function lifeMode() {
    const el = document.querySelector('input[name="lifeMode"]:checked');
    return el ? el.value : "duration";
  }

  btnAddLife.addEventListener("click", addLifeBlock);

  btnClearLifeDay.addEventListener("click", () => {
    const d = lifeDate.value;
    state.lifeByDate[d] = [];
    delete state.planCache[d];
    saveState();
    renderTimeline(true);
  });

  function addLifeBlock() {
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
      startMin = a;
      endMin = b;
      if (endMin <= startMin) endMin += 1440;
    }

    const block = { id: uid(), type, startMin, endMin };

    // overlap check: date part + (if cross-midnight) next day part
    const todayParts = splitItemCrossMidnight(date, { startMin, endMin }).filter(p => p.date === date);
    const nextDate = addDays(date, 1);
    const nextParts = splitItemCrossMidnight(date, { startMin, endMin }).filter(p => p.date === nextDate);

    // segments already in day (routine + user life)
    const daySegs = allLifeSegmentsForDate(date);
    for (const p of todayParts) daySegs.push({ startMin: p.startMin, endMin: p.endMin });
    if (hasOverlap(daySegs)) { setHidden(lifeAddHint, false); return; }

    // check next day if needed
    if (nextParts.length) {
      const segs2 = allLifeSegmentsForDate(nextDate);
      for (const p of nextParts) segs2.push({ startMin: p.startMin, endMin: p.endMin });
      if (hasOverlap(segs2)) { setHidden(lifeAddHint, false); return; }
    }

    const arr = state.lifeByDate[date] ? [...state.lifeByDate[date]] : [];
    arr.push(block);
    state.lifeByDate[date] = arr;
    delete state.planCache[date];
    delete state.planCache[nextDate];
    saveState();
    renderTimeline(true);
  }

  /* ===== Study chain ===== */
  studyDate.addEventListener("change", () => {
    state.ui.studyDate = studyDate.value || fmtDate(new Date());
    saveState();
    renderStudyList();
  });

  studyCategory.addEventListener("change", () => {
    syncStudySubjectSelect();
    syncStudyTaskTypeSelect();
    autoUpdateStudyMin();
  });
  studySubject.addEventListener("change", () => {
    syncStudyTaskTypeSelect();
    autoUpdateStudyMin();
  });
  studyOtherSubject.addEventListener("input", () => {
    syncStudyTaskTypeSelect();
    autoUpdateStudyMin();
  });
  studyTaskType.addEventListener("change", () => {
    setHidden(studyTaskFreeWrap, studyTaskType.value !== "自由入力");
    autoUpdateStudyMin();
  });
  rangesList.addEventListener("input", autoUpdateStudyMin);
  btnAddRange.addEventListener("click", addRangeRow);

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

  function autoUpdateStudyMin() {
    const cat = studyCategory.value;
    if (!cat) return;
    const subject = resolveStudySubject();
    const taskType = resolveTaskType();
    const ranges = readRanges();

    const auto = computeAutoMin(subject, taskType, ranges);
    if (auto != null) studyMin.value = String(auto);
  }

  btnAddStudy.addEventListener("click", addStudyTask);
  btnClearStudyDay.addEventListener("click", () => {
    const d = studyDate.value;
    state.studyByDate[d] = [];
    delete state.planCache[d];
    saveState();
    renderStudyList();
    renderTimeline(true);
  });

  btnAutoBuild.addEventListener("click", () => {
    const d = studyDate.value;
    buildPlanForDay(d, true);
    renderTimeline(true);
    setTab("timeline");
    jumpToDay(d, true);
  });

  btnRecalc.addEventListener("click", () => {
    recalcAllEstimatesForDay(studyDate.value);
    delete state.planCache[studyDate.value];
    saveState();
    renderStudyList();
  });

  function addStudyTask() {
    setHidden(studyAddHint, true);

    const date = studyDate.value || fmtDate(new Date());
    const cat = (studyCategory.value || "").trim();
    if (!cat) { setHidden(studyAddHint, false); return; }

    const subject = resolveStudySubject();
    const taskType = resolveTaskType();
    if (!subject || !taskType) { setHidden(studyAddHint, false); return; }

    const ranges = readRanges();
    const durationMin = clamp(parseInt(studyMin.value || "30", 10), 1, 2000);
    const deadline = (studyDeadline.value || "").trim();
    const link = (studyLink.value || "").trim();

    const task = {
      id: uid(),
      category: cat,
      subject,
      taskType,
      ranges,
      durationMin,
      deadlineHHMM: deadline,
      link,
      createdAt: Date.now(),
    };

    const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
    arr.push(task);
    state.studyByDate[date] = arr;
    delete state.planCache[date];
    saveState();

    renderStudyList();
    renderTimeline(true);
  }

  function recalcAllEstimatesForDay(date) {
    const arr = state.studyByDate[date] || [];
    for (const t of arr) {
      const auto = computeAutoMin(t.subject, t.taskType, t.ranges || []);
      if (auto != null) t.durationMin = auto;
    }
  }

  function renderStudyList() {
    const date = studyDate.value || fmtDate(new Date());
    const arr = state.studyByDate[date] || [];
    studyList.innerHTML = "";
    setHidden(overflowHint, true);

    if (arr.length === 0) {
      studyList.appendChild(emptyLI("（この日はまだありません）"));
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
      const meta = document.createElement("div");
      meta.className = "liMeta";
      meta.textContent =
        `見積 ${t.durationMin}分` +
        (t.deadlineHHMM ? ` / 終了希望 ${t.deadlineHHMM}` : "") +
        (steps.length ? ` / 範囲 ${steps.length}個` : "");

      head.appendChild(title);
      head.appendChild(meta);

      const btns = document.createElement("div");
      btns.className = "liBtns";
      btns.appendChild(miniBtn("↑", () => moveStudy(date, idx, -1)));
      btns.appendChild(miniBtn("↓", () => moveStudy(date, idx, +1)));
      btns.appendChild(miniBtn("削除", () => removeStudy(date, idx)));
      if (t.link) {
        const a = document.createElement("a");
        a.className = "btn btnGhost btnMini";
        a.href = t.link;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "リンク";
        btns.appendChild(a);
      }

      li.appendChild(head);
      li.appendChild(btns);
      studyList.appendChild(li);
    });
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
    arr.splice(idx, 1);
    state.studyByDate[date] = arr;
    delete state.planCache[date];
    saveState();
    renderStudyList();
    renderTimeline(true);
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

  /* ===== Timeline ===== */
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

    const axis = document.createElement("div");
    axis.className = "axis";
    const tag = document.createElement("div");
    tag.className = "dayTag";
    const dObj = parseDate(date);
    tag.textContent = `${date}（${dowName(dObj)}）`;
    axis.appendChild(tag);

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
      blocks = [...routinePartsForDate(date), ...userLifePartsForDate(date)].sort((a, b) => a.startMin - b.startMin);
    }

    for (const b of blocks) {
      const el = document.createElement("div");
      el.className = "block";
      el.style.top = `${b.startMin * PX_PER_MIN}px`;
      el.style.height = `${Math.max(18, (b.endMin - b.startMin) * PX_PER_MIN)}px`;
      el.style.borderLeftColor = b.color || cssVar("--gray");

      const title = document.createElement("div");
      title.className = "blockTitle";
      title.textContent = b.label;

      const meta = document.createElement("div");
      meta.className = "blockMeta";

      const dur = b.endMin - b.startMin;
      meta.appendChild(badge(`${hhmmOf(b.startMin)}–${hhmmOf(b.endMin)} / ${dur}m`));
      meta.appendChild(badge(b.kind === "study" ? "勉強" : "生活"));
      if (b.meta) meta.appendChild(badge(b.meta));
      if (b.link) {
        const a = document.createElement("a");
        a.className = "badge badgeLink";
        a.href = b.link;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "↗";
        meta.appendChild(a);
      }

      el.appendChild(title);
      el.appendChild(meta);
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

    dayEl.appendChild(axis);
    dayEl.appendChild(canvas);
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
    const canvas = dayEl.querySelector(".canvas");
    if (!line || !tag || !canvas) return;

    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    const y = min * PX_PER_MIN;

    line.style.top = `${y}px`;
    tag.style.top = `${y}px`;
  }

  function jumpToDay(date, toNow) {
    const dayEl = timeline.querySelector(`.day[data-date="${date}"]`);
    if (!dayEl) return;
    let y = dayEl.offsetTop - 80;

    if (toNow) {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      y += min * PX_PER_MIN - 120;
    }
    timeline.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  // infinite scroll (down only)
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

  btnJumpToday.addEventListener("click", () => jumpToDay(fmtDate(new Date()), false));
  btnTop.addEventListener("click", () => timeline.scrollTo({ top: 0, behavior: "smooth" }));
  btnJumpNow.addEventListener("click", () => {
    setTab("timeline");
    jumpToDay(fmtDate(new Date()), true);
  });

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
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });
  }

  /* ===== Boot ===== */
  initSelects();
  hydrate();
  renderStudyList();
  renderTimeline(true);
  startClock();
  updateNowLine();
  setInterval(updateNowLine, 30 * 1000);
});
