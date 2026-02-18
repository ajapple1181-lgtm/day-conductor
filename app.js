"use strict";

window.addEventListener("DOMContentLoaded", () => {
  const LS_KEY = "daily_planner_v14"; // データ保持のためキーは維持
  const DAY_MIN = 1440;
  const PX_PER_MIN = 1.25;

  const SLEEP_NEXT_DAY_THRESHOLD_MIN = 6 * 60; // 00:00-05:59は翌日に就寝を置く
  const MAX_SLEEP_HOURS = 9;

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

  const LIFE_TYPES = ["-", "就寝", "食事", "移動", "授業", "部活", "準備", "風呂"];
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

  /* ===== State ===== */
  const blankRoutine = () => ({
    schoolOn: "off",
    clubOn: "off",
    commuteAMStart: "07:30",
    commuteAMMin: 60,
    schoolStart: "08:30",
    schoolEnd: "15:00",
    clubStart: "16:10",
    clubEnd: "18:30",
    returnMode: "60",
    return2Start: "19:00",

    bathOn: "off",
    bathMin: 60,
    prepOn: "off",
    prepMin: 15,

    sleepOn: "off",
    sleepStart: "23:30",
    wakeTime: "06:30"
  });

  const freshState = () => {
    const today = fmtDate(new Date());
    return {
      routineByDate: {},
      lifeByDate: {},
      studyByDate: {},
      planCache: {},     // { [date]: { blocks, overflow, excludedTaskIds } }
      progressByTask: {},
      runner: {
        activeTaskId: null,
        isRunning: false,
        lastTick: 0,
        pausedByUser: false,      // UI上は一時停止を削除したので基本falseのまま
        lastAutoTaskId: null,
        arrivalShownTaskId: null, // ★到着ループ防止
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

  const remainPill = $("#studyRemain");
  const remainSubj = $("#remainSubj");
  const remainTime = $("#remainTime");

  const tabs = $$(".tab");
  const panelLife = $("#tabLife");
  const panelStudy = $("#tabStudy");
  const panelTimeline = $("#tabTimeline");

  // routine
  const lifeDate = $("#lifeDate");

  const routineSchoolOn = $("#routineSchoolOn");
  const routineClubOn = $("#routineClubOn");

  const routineCommuteWrap = $("#routineCommuteWrap");
  const routineCommuteAMStart = $("#routineCommuteAMStart");
  const routineCommuteAMMin = $("#routineCommuteAMMin");

  const routineSchoolWrap = $("#routineSchoolWrap");
  const routineSchoolStart = $("#routineSchoolStart");
  const routineSchoolEnd = $("#routineSchoolEnd");

  const routineClubEndWrap = $("#routineClubEndWrap");
  const routineClubStart = $("#routineClubStart");
  const routineClubEnd = $("#routineClubEnd");

  const routineReturnWrap = $("#routineReturnWrap");
  const routineReturnMode = $("#routineReturnMode");
  const return60Wrap = $("#return60Wrap");
  const return30Wrap = $("#return30Wrap");
  const routineReturn2Start = $("#routineReturn2Start");

  const routineBathOn = $("#routineBathOn");
  const routineBathMinWrap = $("#routineBathMinWrap");
  const routineBathMin = $("#routineBathMin");

  const routinePrepOn = $("#routinePrepOn");
  const routinePrepMinWrap = $("#routinePrepMinWrap");
  const routinePrepMin = $("#routinePrepMin");

  const routineSleepOn = $("#routineSleepOn");
  const routineSleepWrap = $("#routineSleepWrap");
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

  /* ===== Tabs ===== */
  const setTab = (name) => {
    state.ui.activeTab = name;
    saveState();
    tabs.forEach(b => b.classList.toggle("is-active", b.dataset.tab === name));
    panelLife.classList.toggle("is-active", name === "life");
    panelStudy.classList.toggle("is-active", name === "study");
    panelTimeline.classList.toggle("is-active", name === "timeline");

    if (name === "timeline") {
      setTimeout(() => jumpToDay(fmtDate(new Date()), true), 60);
    }
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

    fillReturn2Options();
    if (rangesList.children.length === 0) addRangeRow();
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

  function computeRangeSteps(ranges) {
    const out = [];
    for (const r of ranges) {
      const a = (r.start || "").trim();
      const b = (r.end || "").trim();
      if (!a && !b) continue;

      const pa = parseLeadingInt(a);
      const pb = parseLeadingInt(b);

      if (pa && pb) {
        if (pa.num === pb.num) { out.push(a || b); continue; }
        const step = pa.num < pb.num ? 1 : -1;
        out.push(a);
        for (let v = pa.num + step; step === 1 ? v < pb.num : v > pb.num; v += step) out.push(String(v));
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

  /* ===== Editor ===== */
  let runnerUiTimer = null;

  function mkBtn(text, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn ${cls || ""}`.trim();
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function openEditor(title, bodyNode, footButtons) {
    editorTitle.textContent = title;
    editorBody.innerHTML = "";
    editorFoot.innerHTML = "";
    editorBody.appendChild(bodyNode);
    footButtons.forEach(b => editorFoot.appendChild(b));
    setHidden(editor, false);
  }

  function closeEditor() {
    if (runnerUiTimer) { clearInterval(runnerUiTimer); runnerUiTimer = null; }
    setHidden(editor, true);
  }
  editorCancel.addEventListener("click", closeEditor);

  /* ===== Routine logic ===== */
  const peekRoutine = (date) => state.routineByDate[date] || null;

  function getRoutine(date) {
    return peekRoutine(date) || blankRoutine();
  }

  function setRoutine(date, patch) {
    const base = peekRoutine(date) || blankRoutine();
    state.routineByDate[date] = { ...base, ...patch };
    delete state.planCache[date];
    delete state.planCache[addDays(date, 1)];
    saveState();
  }

  function updateRoutineVisibility() {
    const schoolOn = routineSchoolOn.value === "on";
    const clubOn = routineClubOn.value === "on";

    setHidden(routineCommuteWrap, !(schoolOn || clubOn));
    setHidden(routineReturnWrap, !(schoolOn || clubOn));

    setHidden(routineSchoolWrap, !schoolOn);
    setHidden(routineClubEndWrap, !clubOn);

    setHidden(return60Wrap, routineReturnMode.value !== "60");
    setHidden(return30Wrap, routineReturnMode.value !== "30x2");

    const bathOn = routineBathOn.value === "on";
    setHidden(routineBathMinWrap, !bathOn);

    const prepOn = routinePrepOn.value === "on";
    setHidden(routinePrepMinWrap, !prepOn);

    const sleepOn = routineSleepOn.value === "on";
    setHidden(routineSleepWrap, !sleepOn);
  }

  function applyRoutineToUI(date) {
    const r = getRoutine(date);

    routineSchoolOn.value = r.schoolOn || "off";
    routineClubOn.value = r.clubOn || "off";

    routineCommuteAMStart.value = r.commuteAMStart || "07:30";
    routineCommuteAMMin.value = String(r.commuteAMMin ?? 60);

    routineSchoolStart.value = r.schoolStart || "08:30";
    routineSchoolEnd.value = r.schoolEnd || "15:00";

    routineClubStart.value = r.clubStart || "16:10";
    routineClubEnd.value = r.clubEnd || "18:30";

    routineReturnMode.value = r.returnMode || "60";
    routineReturn2Start.value = r.return2Start || "19:00";

    routineBathOn.value = r.bathOn || "off";
    routineBathMin.value = String(r.bathMin ?? 60);

    routinePrepOn.value = r.prepOn || "off";
    routinePrepMin.value = String(r.prepMin ?? 15);

    routineSleepOn.value = r.sleepOn || "off";
    routineSleepStart.value = r.sleepStart || "23:30";
    routineWake.value = r.wakeTime || "06:30";

    updateRoutineVisibility();
    validateRoutine(date);
  }

  function splitCrossMidnight(baseDate, startMin, endMin) {
    let s0 = startMin;
    let e0 = endMin;
    if (e0 <= s0) e0 += 1440;

    const d0 = baseDate;
    const d1 = addDays(baseDate, 1);
    const parts = [];

    if (s0 < 1440 && e0 <= 1440) {
      parts.push({ date: d0, startMin: s0, endMin: e0, dispStart: s0, dispEnd: e0, contOut: false, contIn: false });
      return parts;
    }
    if (s0 < 1440 && e0 > 1440) {
      parts.push({ date: d0, startMin: s0, endMin: 1440, dispStart: s0, dispEnd: e0, contOut: true, contIn: false });
      parts.push({ date: d1, startMin: 0, endMin: e0 - 1440, dispStart: s0, dispEnd: e0, contOut: false, contIn: true });
      return parts;
    }
    parts.push({ date: d1, startMin: s0 - 1440, endMin: e0 - 1440, dispStart: s0, dispEnd: e0, contOut: false, contIn: true });
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

  function validateRoutine(date) {
    const blocks = routineBlocksForDate(date);
    const segs = blocks.map(b => ({ startMin: b.startMin, endMin: b.endMin }));
    const ok = !hasOverlap(segs);
    setHidden(routineHint, ok);
    return ok;
  }

  function sleepBaseDateForRoutineDate(date, sleepStartMin) {
    if (sleepStartMin == null) return date;
    if (sleepStartMin < SLEEP_NEXT_DAY_THRESHOLD_MIN) return addDays(date, 1);
    return date;
  }
  function computeWakeDiffMin(sleepStartMin, wakeMin) {
    let diff = ((wakeMin - sleepStartMin) + 1440) % 1440;
    if (diff <= 0) diff += 1440;
    const max = MAX_SLEEP_HOURS * 60;
    if (diff > max) diff = max;
    return diff;
  }

  function routineBlocksForRoutineDate(date) {
    const rSaved = peekRoutine(date);
    if (!rSaved) return [];

    const r = rSaved;
    const out = [];

    const schoolOn = r.schoolOn === "on";
    const clubOn = r.clubOn === "on";

    if (schoolOn || clubOn) {
      const a = minutesOf(r.commuteAMStart);
      const mins = clamp(parseInt(r.commuteAMMin || "60", 10), 1, 1000);
      if (a != null) {
        for (const p of splitCrossMidnight(date, a, a + mins)) {
          out.push({ kind: "life", routineDate: date, routineKey: "commuteAM", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "移動", color: cssVar("--gray") });
        }
      }
    }

    if (schoolOn) {
      const s = minutesOf(r.schoolStart);
      const e = minutesOf(r.schoolEnd);
      if (s != null && e != null) {
        for (const p of splitCrossMidnight(date, s, e)) {
          out.push({ kind: "life", routineDate: date, routineKey: "school", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "授業", color: cssVar("--gray") });
        }
      }
    }

    if (clubOn) {
      const s = minutesOf(r.clubStart);
      const e = minutesOf(r.clubEnd);
      if (s != null && e != null) {
        for (const p of splitCrossMidnight(date, s, e)) {
          out.push({ kind: "life", routineDate: date, routineKey: "club", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "部活", color: cssVar("--gray") });
        }
      }
    }

    if (schoolOn || clubOn) {
      const schoolEnd = schoolOn ? minutesOf(r.schoolEnd) : 0;
      const clubEnd = clubOn ? (minutesOf(r.clubEnd) ?? 0) : 0;
      const endBase = Math.max(schoolEnd || 0, clubEnd || 0);

      if (r.returnMode === "60") {
        for (const p of splitCrossMidnight(date, endBase, endBase + 60)) {
          out.push({ kind: "life", routineDate: date, routineKey: "return60", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "移動", color: cssVar("--gray") });
        }
      } else {
        for (const p of splitCrossMidnight(date, endBase, endBase + 30)) {
          out.push({ kind: "life", routineDate: date, routineKey: "return30_1", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "移動", color: cssVar("--gray") });
        }

        const t2 = minutesOf(r.return2Start);
        if (t2 != null) {
          for (const p of splitCrossMidnight(date, t2, t2 + 30)) {
            out.push({ kind: "life", routineDate: date, routineKey: "return30_2", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "移動", color: cssVar("--gray") });
          }
          for (const p of splitCrossMidnight(date, t2 + 30, t2 + 60)) {
            out.push({ kind: "life", routineDate: date, routineKey: "dinner", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "食事", color: cssVar("--gray") });
          }
        }
      }
    }

    if (r.sleepOn === "on") {
      const slStartMin = minutesOf(r.sleepStart);
      const wakeMin = minutesOf(r.wakeTime);
      if (slStartMin != null && wakeMin != null) {
        const baseForSleep = sleepBaseDateForRoutineDate(date, slStartMin);

        const prepOn = r.prepOn === "on";
        const bathOn = r.bathOn === "on";
        const prepMin = clamp(parseInt(r.prepMin || "15", 10), 1, 600);
        const bathMin = clamp(parseInt(r.bathMin || "60", 10), 1, 600);

        let cursor = slStartMin;
        if (prepOn) {
          const prepStart = slStartMin - prepMin;
          for (const p of splitCrossMidnight(baseForSleep, prepStart, slStartMin)) {
            out.push({ kind: "life", routineDate: date, routineKey: "prep", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "準備", color: cssVar("--gray") });
          }
          cursor = prepStart;
        }

        if (bathOn) {
          const bathStart = cursor - bathMin;
          for (const p of splitCrossMidnight(baseForSleep, bathStart, cursor)) {
            out.push({ kind: "life", routineDate: date, routineKey: "bath", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "風呂", color: cssVar("--gray") });
          }
        }

        const diff = computeWakeDiffMin(slStartMin, wakeMin);
        const sleepEnd = slStartMin + diff;

        for (const p of splitCrossMidnight(baseForSleep, slStartMin, sleepEnd)) {
          out.push({ kind: "life", routineDate: date, routineKey: "sleep", date: p.date, startMin: p.startMin, endMin: p.endMin, dispStart: p.dispStart, dispEnd: p.dispEnd, contOut: p.contOut, contIn: p.contIn, label: "就寝", color: cssVar("--gray") });
        }
      }
    }

    return out;
  }

  function routineBlocksForDate(date) {
    const prev = addDays(date, -1);
    const a = routineBlocksForRoutineDate(date).filter(b => b.date === date);
    const b = routineBlocksForRoutineDate(prev).filter(b => b.date === date);
    return [...a, ...b].sort((x, y) => x.startMin - y.startMin);
  }

  /* ===== Custom life blocks ===== */
  function customLifeBlocksForDate(date) {
    const arrToday = state.lifeByDate[date] || [];
    const prev = addDays(date, -1);
    const arrPrev = state.lifeByDate[prev] || [];
    const out = [];

    for (const b of arrToday) {
      for (const p of splitCrossMidnight(date, b.startMin, b.endMin)) {
        out.push({
          kind: "life",
          isCustom: true,
          sourceId: b.id,
          sourceDate: date,
          date: p.date,
          startMin: p.startMin,
          endMin: p.endMin,
          dispStart: p.dispStart,
          dispEnd: p.dispEnd,
          contOut: p.contOut,
          contIn: p.contIn,
          label: b.type,
          color: cssVar("--gray"),
        });
      }
    }

    for (const b of arrPrev) {
      for (const p of splitCrossMidnight(prev, b.startMin, b.endMin)) {
        if (p.date !== date) continue;
        out.push({
          kind: "life",
          isCustom: true,
          sourceId: b.id,
          sourceDate: prev,
          date: p.date,
          startMin: p.startMin,
          endMin: p.endMin,
          dispStart: p.dispStart,
          dispEnd: p.dispEnd,
          contOut: p.contOut,
          contIn: true,
          label: b.type,
          color: cssVar("--gray"),
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

  /* ===== Life UI ===== */
  const lifeMode = () => (document.querySelector('input[name="lifeMode"]:checked')?.value || "duration");

  function syncLifeCustomUI() {
    const isCustom = (lifeType.value === "-");
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

  function formatRange(b) {
    const ds = (b.dispStart ?? b.startMin);
    const de = (b.dispEnd ?? b.endMin);
    return `${hhmmOf(ds)}–${hhmmOf(de)}`;
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
    t.style.color = "rgba(240,244,255,.70)";
    head.appendChild(t);
    li.appendChild(head);
    return li;
  }

  function deleteCustomLife(sourceDate, sourceId) {
    const arr = state.lifeByDate[sourceDate] || [];
    state.lifeByDate[sourceDate] = arr.filter(x => x.id !== sourceId);

    delete state.planCache[sourceDate];
    delete state.planCache[addDays(sourceDate, 1)];
    delete state.planCache[addDays(sourceDate, -1)];
    saveState();

    renderLifeList();
    renderTimeline(true);
  }

  function openLifeInfo(date, block) {
    const body = document.createElement("div");
    body.className = "grid1";

    const t1 = document.createElement("div");
    t1.style.cssText = "font-weight:1000;font-size:16px;";
    t1.textContent = block.label;

    const t2 = document.createElement("div");
    t2.style.cssText = "color:rgba(240,244,255,.72);font-weight:900;";
    t2.textContent = `${date} / ${formatRange(block)} / ${(block.endMin - block.startMin)}分`;

    body.appendChild(t1);
    body.appendChild(t2);

    openEditor("生活（確認）", body, [mkBtn("OK", "btnPrimary", closeEditor)]);
  }

  function openLifeEdit(block) {
    openLifeInfo(block.date, block);
  }

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
      meta.textContent = `${formatRange(b)} / ${(b.endMin - b.startMin)}分`;

      head.appendChild(title);
      head.appendChild(meta);
      li.appendChild(head);

      const btns = document.createElement("div");
      btns.className = "liBtns";

      const btnEdit = mkBtn("編集", "btnGhost", () => openLifeEdit(b));
      btns.appendChild(btnEdit);

      if (b.isCustom) {
        const btnDel = mkBtn("✕", "btnGhost", () => deleteCustomLife(b.sourceDate, b.sourceId));
        btns.appendChild(btnDel);
      }

      li.appendChild(btns);
      lifeList.appendChild(li);
    }
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
    if (!opts) opts = uniq(["教科書", ...Object.values(TASK_OPTIONS_BY_SUBJECT).flat(), "自由入力"]);
    else opts = uniq([...opts, "自由入力"]);

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
    row.querySelector(".rangeDel").addEventListener("click", () => {
      row.remove();
      if (rangesList.children.length === 0) addRangeRow();
      autoUpdateStudyMin();
    });
    if (prefill) {
      row.querySelector(".rangeStart").value = prefill.start || "";
      row.querySelector(".rangeEnd").value = prefill.end || "";
    }
    row.querySelector(".rangeStart").addEventListener("input", autoUpdateStudyMin);
    row.querySelector(".rangeEnd").addEventListener("input", autoUpdateStudyMin);
    rangesList.appendChild(row);
  }

  function readRanges(container = document) {
    return Array.from(container.querySelectorAll(".rangeRow")).map(r => ({
      start: (r.querySelector(".rangeStart").value || "").trim(),
      end: (r.querySelector(".rangeEnd").value || "").trim(),
    })).filter(x => x.start || x.end);
  }

  function autoUpdateStudyMin() {
    const per = parseInt(studyPerRangeMin.value, 10);
    if (!Number.isFinite(per) || per <= 0) return;
    const ranges = readRanges(rangesList);
    const auto = computeDurationFromPerRange(per, ranges);
    if (auto != null) studyMin.value = String(auto);
  }

  function findTaskById(taskId) {
    for (const [d, arr] of Object.entries(state.studyByDate)) {
      const t = (arr || []).find(x => x.id === taskId);
      if (t) return { date: d, task: t };
    }
    return null;
  }

  function deleteStudyTask(date, taskId) {
    const arr = state.studyByDate[date] || [];
    state.studyByDate[date] = arr.filter(t => t.id !== taskId);

    delete state.progressByTask[taskId];
    if (state.runner.activeTaskId === taskId) {
      state.runner.activeTaskId = null;
      state.runner.isRunning = false;
      state.runner.lastTick = 0;
      state.runner.pausedByUser = false;
      state.runner.arrivalShownTaskId = null;
    }

    delete state.planCache[date];
    saveState();

    renderStudyList();
    renderTimeline(true);
  }

  function moveStudyTask(date, index, dir) {
    const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return;

    const hadPlan = !!state.planCache[date];

    [arr[index], arr[j]] = [arr[j], arr[index]];
    state.studyByDate[date] = arr;

    delete state.planCache[date];
    saveState();

    renderStudyList();
    if (hadPlan) buildPlanForDay(date);
    renderTimeline(true);
  }

  function openStudyEdit(date, taskId) {
    const found = findTaskById(taskId);
    if (!found) return;
    openEditor("勉強 編集", document.createElement("div"), [mkBtn("キャンセル", "btnGhost", closeEditor)]);
  }

  /* ===== Runner / Progress ===== */
function getTaskSteps(task) {
  const steps = computeRangeSteps(task.ranges || []);
  if (steps.length === 0) return ["（範囲なし）"];
  return steps;
}

function ensureProgress(taskId, stepsLen) {
  const p = state.progressByTask[taskId] || { doneSteps: [], spentSec: 0 };
  if (!Array.isArray(p.doneSteps)) p.doneSteps = [];
  if (!Number.isFinite(p.spentSec)) p.spentSec = 0;

  if (p.doneSteps.length < stepsLen) p.doneSteps = p.doneSteps.concat(Array(stepsLen - p.doneSteps.length).fill(false));
  if (p.doneSteps.length > stepsLen) p.doneSteps = p.doneSteps.slice(0, stepsLen);

  state.progressByTask[taskId] = p;
  return p;
}

function computeTotalSec(task) {
  const steps = getTaskSteps(task);
  if (task.perRangeMin && Number.isFinite(task.perRangeMin) && task.perRangeMin > 0 && steps[0] !== "（範囲なし）") {
    return steps.length * task.perRangeMin * 60;
  }
  return clamp(parseInt(task.durationMin || "30", 10), 1, 2000) * 60;
}

function countDone(doneSteps) {
  return (doneSteps || []).reduce((a, b) => a + (b ? 1 : 0), 0);
}

function isTaskComplete(taskId) {
  const found = findTaskById(taskId);
  if (!found) return false;
  const task = found.task;
  const steps = getTaskSteps(task);
  const p = ensureProgress(taskId, steps.length);
  const totalSec = computeTotalSec(task);
  const doneAll = (countDone(p.doneSteps) === steps.length);
  const spentAll = ((p.spentSec || 0) >= totalSec);
  return doneAll || spentAll;
}

function setRemainPill(task, remainSec) {
  if (!task) { remainPill.hidden = true; return; }
  remainSubj.textContent = task.subject;
  remainTime.textContent = fmtMS(remainSec);
  remainPill.hidden = false;
}

function runnerStart(taskId, auto = false) {
  if (!taskId) return;
  // 同じタスクを再実行する可能性に備えて、到着抑止フラグは開始時に解除
  state.runner.arrivalShownTaskId = null;

  state.runner.activeTaskId = taskId;
  state.runner.isRunning = true;
  state.runner.lastTick = Date.now();
  if (!auto) state.runner.pausedByUser = false;
  saveState();
}

function runnerStop(user = false) {
  state.runner.isRunning = false;
  state.runner.lastTick = 0;
  if (user) state.runner.pausedByUser = true;
  saveState();
}

// 到着を出す瞬間に active を解除してループ防止
function openArrivalDialog(taskId) {
  state.runner.arrivalShownTaskId = taskId;

  state.runner.activeTaskId = null;
  state.runner.isRunning = false;
  state.runner.lastTick = 0;
  state.runner.pausedByUser = false;
  saveState();

  const found = findTaskById(taskId);
  const name = found ? `${found.task.subject}｜${found.task.taskType}` : "完了";

  const body = document.createElement("div");
  body.className = "grid1";
  const big = document.createElement("div");
  big.style.cssText = "font-size:36px;font-weight:1000;text-align:center;";
  big.textContent = "到着";
  const sub = document.createElement("div");
  sub.style.cssText = "text-align:center;color:rgba(240,244,255,.72);font-weight:900;";
  sub.textContent = name;
  body.appendChild(big);
  body.appendChild(sub);

  openEditor("到着", body, [mkBtn("OK", "btnPrimary", closeEditor)]);
}

function openRunner(taskId) {
  const found = findTaskById(taskId);
  if (!found) return;

  const t = found.task;
  const steps = getTaskSteps(t);
  const p = ensureProgress(taskId, steps.length);
  const totalSec = computeTotalSec(t);

  const body = document.createElement("div");
  body.className = "runner";

  const title = document.createElement("div");
  title.style.cssText = "font-weight:1000;font-size:16px;";
  title.textContent = `${t.subject}｜${t.taskType}`;

  const timeBox = document.createElement("div");
  timeBox.className = "runnerTime";

  const timeBig = document.createElement("div");
  timeBig.className = "runnerTimeBig";
  const timeSmall = document.createElement("div");
  timeSmall.className = "runnerTimeSmall";

  timeBox.appendChild(timeBig);
  timeBox.appendChild(timeSmall);

  const prog = document.createElement("div");
  prog.style.cssText = "text-align:right;color:rgba(240,244,255,.72);font-weight:1000;";

  const btnAll = mkBtn("全部完了", "btnPrimary", () => {
    for (let i = 0; i < p.doneSteps.length; i++) p.doneSteps[i] = true;
    p.spentSec = Math.max(p.spentSec, totalSec);
    state.progressByTask[taskId] = p;
    saveState();
    runnerStop(false);
    renderRunner();
    openArrivalDialog(taskId);
  });

  const stepsBox = document.createElement("div");
  stepsBox.style.display = "grid";
  stepsBox.style.gap = "8px";

  const stepBtns = steps.map((label, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "stepBtn";
    const left = document.createElement("span");
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

      if (countDone(p.doneSteps) === steps.length) {
        runnerStop(false);
        openArrivalDialog(taskId);
      }
    });
    return b;
  });
  stepBtns.forEach(b => stepsBox.appendChild(b));

  const btnClose = mkBtn("閉じる", "btnGhost", closeEditor);
  const foot = document.createElement("div");
  foot.className = "row";
  foot.appendChild(btnClose);

  body.appendChild(title);
  body.appendChild(timeBox);
  body.appendChild(prog);
  body.appendChild(btnAll);
  body.appendChild(stepsBox);

  // openEditor はボタン配列だが、nodeもappendできる作りなので foot を渡す
  openEditor("実行", body, [foot]);

  function renderRunner() {
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
  }

  if (runnerUiTimer) { clearInterval(runnerUiTimer); runnerUiTimer = null; }
  runnerUiTimer = setInterval(renderRunner, 250);
  renderRunner();
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

  function mergeAdjacentStudyBlocks(blocks) {
    const out = [];
    for (const b of blocks) {
      const last = out[out.length - 1];
      if (
        last &&
        last.kind === "study" &&
        b.kind === "study" &&
        last.taskId === b.taskId &&
        last.endMin === b.startMin &&
        last.date === b.date
      ) {
        last.endMin = b.endMin;
        last.dispEnd = Math.max(last.dispEnd ?? last.endMin, b.dispEnd ?? b.endMin);
        continue;
      }
      out.push({ ...b });
    }
    return out;
  }

  function computeStudyWindowStart(date) {
    const r = peekRoutine(date);
    if (!r) return 0;

    const schoolOn = r.schoolOn === "on";
    const clubOn = r.clubOn === "on";
    if (!schoolOn && !clubOn) return 0;

    const se = schoolOn ? minutesOf(r.schoolEnd) : null;
    const ce = clubOn ? minutesOf(r.clubEnd) : null;
    const base = Math.max(se ?? 0, ce ?? 0);
    return Number.isFinite(base) ? clamp(base, 0, 1440) : 0;
  }

  function buildPlanForDay(date) {
    const lifeBlocks = allLifeBlocksForDate(date);
    const occupied = lifeBlocks.map(b => ({ startMin: b.startMin, endMin: b.endMin }));
    const windowStart = computeStudyWindowStart(date);

    const allTasks = (state.studyByDate[date] || []).map(t => ({ ...t })); // リスト順優先

    const attempt = (tasks) => {
      let free = subtractSegments([{ start: windowStart, end: 1440 }], occupied);
      const blocks = [...lifeBlocks];
      let overflow = [];

      for (const t of tasks) {
        const deadlineMin = t.deadlineHHMM ? minutesOf(t.deadlineHHMM) : null;
        const steps = computeRangeSteps(t.ranges || []);
        const per = Number.isFinite(t.perRangeMin) ? t.perRangeMin : null;

        const units = (per && per > 0 && steps.length > 0)
          ? steps.map((label, i) => ({ stepIndex: i, stepLabel: label, dur: per }))
          : [{ stepIndex: null, stepLabel: null, dur: clamp(parseInt(t.durationMin || "30", 10), 1, 2000) }];

        let trial = free;
        const placed = [];
        let ok = true;

        for (const u of units) {
          const dur = clamp(parseInt(u.dur || "30", 10), 1, 2000);

          let place = placeTask(trial, dur, deadlineMin);
          if (!place) place = placeTask(trial, dur, null);
          if (!place) { ok = false; break; }

          trial = reserve(trial, place.start, place.end);
          placed.push({
            kind: "study",
            sourceId: t.id,
            taskId: t.id,
            date,
            startMin: place.start,
            endMin: place.end,
            dispStart: place.start,
            dispEnd: place.end,
            label: t.subject,
            color: CATEGORY_COLORS[t.category] || cssVar("--gray"),
            meta: t.taskType
          });
        }

        if (!ok) {
          overflow = [t.id];
          break;
        }

        free = trial;
        blocks.push(...placed);
      }

      const dayBlocks = blocks
        .filter(b => b.date === date)
        .sort((a, b) => a.startMin - b.startMin);

      const merged = mergeAdjacentStudyBlocks(dayBlocks);
      return { blocks: merged, overflow };
    };

    // 下から落とす
    let m = allTasks.length;
    let result = attempt(allTasks.slice(0, m));
    while (m > 0 && result.overflow.length > 0) {
      m -= 1;
      result = attempt(allTasks.slice(0, m));
    }

    const excludedTaskIds = allTasks.slice(m).map(t => t.id);

    state.planCache[date] = {
      blocks: result.blocks,
      overflow: result.overflow,
      excludedTaskIds
    };
    saveState();

    if (excludedTaskIds.length > 0) {
      overflowHint.textContent = "入りきらないため、下のタスクを予定に入れませんでした。";
      setHidden(overflowHint, false);
    } else {
      setHidden(overflowHint, true);
    }
  }

  /* ===== Auto-start timer when NOW enters study block ===== */
  function autoStartFromNow() {
    const today = fmtDate(new Date());
    const plan = state.planCache[today];
    if (!plan || !Array.isArray(plan.blocks)) return;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const hit = plan.blocks.find(b => b.kind === "study" && b.startMin <= nowMin && nowMin < b.endMin);
    if (!hit) {
      state.runner.lastAutoTaskId = null;
      saveState();
      return;
    }

    const taskId = hit.taskId;

    // ★完了済みタスクは自動で開始しない（到着ループ防止）
    if (isTaskComplete(taskId)) return;

    if (state.runner.pausedByUser && state.runner.activeTaskId === taskId) return;
    if (state.runner.activeTaskId !== taskId) state.runner.pausedByUser = false;
    if (state.runner.activeTaskId === taskId && state.runner.isRunning) return;

    runnerStart(taskId, true);
    state.runner.lastAutoTaskId = taskId;
    saveState();
  }

  /* ===== Runner tick + top pill ===== */
  function tickRunner() {
    const taskId = state.runner.activeTaskId;
    if (!taskId) { setRemainPill(null, 0); return; }

    const found = findTaskById(taskId);
    if (!found) { setRemainPill(null, 0); return; }

    const t = found.task;
    const steps = getTaskSteps(t);
    const p = ensureProgress(taskId, steps.length);
    const totalSec = computeTotalSec(t);

    if (state.runner.isRunning) {
      const now = Date.now();
      const last = state.runner.lastTick || now;
      const deltaSec = Math.floor((now - last) / 1000);
      if (deltaSec > 0) {
        p.spentSec = clamp((p.spentSec || 0) + deltaSec, 0, totalSec);
        state.progressByTask[taskId] = p;
        state.runner.lastTick = last + deltaSec * 1000;
        saveState();

        if (totalSec - p.spentSec <= 0) {
          // ★到着は同一タスクで1回だけ
          if (state.runner.arrivalShownTaskId !== taskId) {
            runnerStop(false);
            openArrivalDialog(taskId);
          } else {
            runnerStop(false);
          }
        }
      }
    }

    const remainSec = Math.max(0, totalSec - (p.spentSec || 0));
    setRemainPill(t, remainSec);
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

    const dateLine = document.createElement("div");
    dateLine.className = "dayDate";
    dateLine.textContent = `${dObj.getMonth() + 1}/${dObj.getDate()}`;
    const dowLine = document.createElement("div");
    dowLine.className = "dayDow";
    dowLine.textContent = `（${dowName(dObj)}）`;

    header.appendChild(dateLine);
    header.appendChild(dowLine);

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
    const blocks = (plan && Array.isArray(plan.blocks)) ? plan.blocks : allLifeBlocksForDate(date);

    for (const b of blocks) {
      const el = document.createElement("div");
      el.className = "block";

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
      meta.appendChild(badge(formatRange(b)));
      meta.appendChild(badge(b.kind === "study" ? "勉強" : "生活"));
      if (b.meta) meta.appendChild(badge(b.meta));

      el.appendChild(title);
      el.appendChild(meta);

      el.addEventListener("click", () => {
        if (b.kind === "study") { openRunner(b.taskId); return; }
        openLifeInfo(date, b);
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

    let cur = state.ui.loadedStart;
    while (cur <= state.ui.loadedEnd) {
      timeline.appendChild(renderDay(cur));
      cur = addDays(cur, 1);
    }
    updateNowLine();

    setTimeout(() => jumpToDay(fmtDate(new Date()), true), 80);
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
    let y = dayEl.offsetTop - 60;

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

  /* ===== Events ===== */
  lifeDate.addEventListener("change", () => {
    state.ui.lifeDate = lifeDate.value || fmtDate(new Date());
    saveState();
    applyRoutineToUI(state.ui.lifeDate);
    renderLifeList();
    renderTimeline(true);
  });

  const routineInputs = [
    routineSchoolOn, routineClubOn,
    routineCommuteAMStart, routineCommuteAMMin,
    routineSchoolStart, routineSchoolEnd,
    routineClubStart, routineClubEnd,
    routineReturnMode, routineReturn2Start,
    routineBathOn, routineBathMin,
    routinePrepOn, routinePrepMin,
    routineSleepOn, routineSleepStart, routineWake
  ];
  routineInputs.forEach(el => el.addEventListener("input", () => {
    const date = lifeDate.value || fmtDate(new Date());

    updateRoutineVisibility();

    setRoutine(date, {
      schoolOn: routineSchoolOn.value,
      clubOn: routineClubOn.value,
      commuteAMStart: routineCommuteAMStart.value || "07:30",
      commuteAMMin: clamp(parseInt(routineCommuteAMMin.value || "60", 10), 1, 1000),
      schoolStart: routineSchoolStart.value || "08:30",
      schoolEnd: routineSchoolEnd.value || "15:00",
      clubStart: routineClubStart.value || "16:10",
      clubEnd: routineClubEnd.value || "18:30",
      returnMode: routineReturnMode.value,
      return2Start: routineReturn2Start.value || "19:00",
      bathOn: routineBathOn.value,
      bathMin: clamp(parseInt(routineBathMin.value || "60", 10), 1, 600),
      prepOn: routinePrepOn.value,
      prepMin: clamp(parseInt(routinePrepMin.value || "15", 10), 1, 600),
      sleepOn: routineSleepOn.value,
      sleepStart: routineSleepStart.value || "23:30",
      wakeTime: routineWake.value || "06:30",
    });

    validateRoutine(date);
    renderLifeList();
    renderTimeline(true);
  }));

  lifeType.addEventListener("change", syncLifeCustomUI);
  $$('input[name="lifeMode"]').forEach(r => r.addEventListener("change", syncLifeModeUI));

  btnAddLife.addEventListener("click", () => {
    setHidden(lifeAddHint, true);
    const date = lifeDate.value || fmtDate(new Date());
    const rawType = (lifeType.value || "").trim();

    const type = (rawType === "-") ? (lifeCustom.value || "").trim() : rawType;
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
  btnAddRange.addEventListener("click", () => addRangeRow());

  btnAddStudy.addEventListener("click", () => {
    setHidden(studyAddHint, true);
    const date = studyDate.value || fmtDate(new Date());
    const cat = (studyCategory.value || "").trim();
    const subject = resolveStudySubject();
    const taskType = resolveTaskType();
    if (!cat || !subject || !taskType) { setHidden(studyAddHint, false); return; }

    const ranges = readRanges(rangesList);
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
    buildPlanForDay(date);
    renderTimeline(true);
    setTab("timeline");
    jumpToDay(date, true);
  });

  btnJumpNow.addEventListener("click", () => {
    setTab("timeline");
    jumpToDay(fmtDate(new Date()), true);
  });

  function renderStudyList() {
    const date = studyDate.value || fmtDate(new Date());
    const arr = state.studyByDate[date] || [];
    studyList.innerHTML = "";

    const plan = state.planCache[date];
    const excluded = (plan && Array.isArray(plan.excludedTaskIds)) ? plan.excludedTaskIds : [];

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
      const perTxt = t.perRangeMin ? ` / 1範囲 ${t.perRangeMin}分` : "";
      const meta = document.createElement("div");
      meta.className = "liMeta";

      const isExcluded = excluded.includes(t.id);
      meta.textContent =
        `見積 ${t.durationMin}分` +
        perTxt +
        (t.deadlineHHMM ? ` / 希望 ${t.deadlineHHMM}` : "") +
        (steps.length ? ` / 範囲 ${steps.length}個` : "") +
        (isExcluded ? " / （予定に入らない）" : "");

      head.appendChild(title);
      head.appendChild(meta);
      li.appendChild(head);

      const btns = document.createElement("div");
      btns.className = "liBtns";

      const up = mkBtn("↑", "btnMini btnGhost", () => moveStudyTask(date, idx, -1));
      const dn = mkBtn("↓", "btnMini btnGhost", () => moveStudyTask(date, idx, +1));
      up.disabled = (idx === 0);
      dn.disabled = (idx === arr.length - 1);

      btns.appendChild(up);
      btns.appendChild(dn);

      btns.appendChild(mkBtn("編集", "btnGhost", () => openStudyEdit(date, t.id)));
      btns.appendChild(mkBtn("✕", "btnGhost", () => deleteStudyTask(date, t.id)));

      li.appendChild(btns);
      studyList.appendChild(li);
    });
  }

  /* ===== Boot ===== */
  function hydrate() {
    const today = fmtDate(new Date());

    setTab(state.ui.activeTab || "life");

    lifeDate.value = state.ui.lifeDate || today;
    studyDate.value = state.ui.studyDate || today;

    applyRoutineToUI(lifeDate.value);

    lifeType.value = "-";
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

    tickRunner();
  }

  initSelects();
  hydrate();
  startClock();
  updateNowLine();
  setInterval(updateNowLine, 30 * 1000);

  setInterval(() => {
    try {
      autoStartFromNow();
      tickRunner();
    } catch {}
  }, 1000);
});
