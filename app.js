/* Day Conductor v1 (GitHub Pages / Vanilla JS) */
const LS_KEY = "day_conductor_v1";

/* ====== Utilities ====== */
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

function pad2(n){ return String(n).padStart(2,"0"); }
function fmtDate(d){
  const y = d.getFullYear();
  const m = pad2(d.getMonth()+1);
  const da = pad2(d.getDate());
  return `${y}-${m}-${da}`;
}
function parseDate(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
function addDays(iso, delta){
  const d = parseDate(iso) || new Date();
  d.setDate(d.getDate() + delta);
  return fmtDate(d);
}
function dowName(d){
  const names = ["日","月","火","水","木","金","土"];
  return names[d.getDay()];
}
function minutesOf(hhmm){
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh<0 || hh>23 || mm<0 || mm>59) return null;
  return hh*60 + mm;
}
function hhmmOf(min){
  min = ((min % 1440) + 1440) % 1440;
  const hh = Math.floor(min/60);
  const mm = min%60;
  return `${pad2(hh)}:${pad2(mm)}`;
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function uniq(arr){
  const s = new Set(); const out = [];
  for (const x of arr){ const k = String(x); if (!s.has(k)){ s.add(k); out.push(x); } }
  return out;
}
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function setHidden(el, v){ el.hidden = !!v; }

/* ====== Constants ====== */
const PX_PER_MIN = 1.2; // timeline scale
const DAY_MIN = 1440;

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

const LIFE_TYPES = ["就寝","食事","移動","授業","部活","準備","風呂","自由入力"];

const LIFE_DEFAULT_MIN = {
  "移動": 30,
  "食事": 30,
  "風呂": 60,
  "準備": 15,
  "部活": 120,
  "授業": 360,
  "就寝": 420,
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

/* ====== State ====== */
let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return freshState();
    const obj = JSON.parse(raw);
    return sanitizeState({ ...freshState(), ...obj });
  }catch{
    return freshState();
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function freshState(){
  const today = fmtDate(new Date());
  return {
    settings: { ...DEFAULT_SETTINGS },
    lifeByDate: { /* [date]: [{id,type,label, startMin,endMin}] */ },
    studyByDate: { /* [date]: [{id,category,subject,taskType,ranges,durationMin,deadlineHHMM,link}] */ },
    plansByDate: { /* [date]: { blocks:[...], overflow:[studyTaskIds...] } */ },
    ui: {
      activeTab: "life",
      lifeDate: today,
      studyDate: today,
      timelineAnchor: today,
      loadedStart: addDays(today, -1),
      loadedEnd: addDays(today, 7),
    }
  };
}
function sanitizeState(s){
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings||{}) };
  s.lifeByDate = s.lifeByDate || {};
  s.studyByDate = s.studyByDate || {};
  s.plansByDate = s.plansByDate || {};
  s.ui = { ...freshState().ui, ...(s.ui||{}) };
  return s;
}

/* ====== DOM ====== */
const clockText = $("#clockText");
const btnNow = $("#btnNow");
const btnToday = $("#btnToday");

const tabs = $$(".tab");
const tabLife = $("#tabLife");
const tabStudy = $("#tabStudy");
const tabTimeline = $("#tabTimeline");

const modal = $("#modal");
const modalTitle = $("#modalTitle");
const modalText = $("#modalText");
const modalCancel = $("#modalCancel");
const modalOk = $("#modalOk");

/* settings */
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
const btnResetSettings = $("#btnResetSettings");
const lifeOverlapHint = $("#lifeOverlapHint");

/* life day blocks */
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

/* study input */
const studyDate = $("#studyDate");
const studyCategory = $("#studyCategory");
const studySubject = $("#studySubject");
const studyOtherSubjectWrap = $("#studyOtherSubjectWrap");
const studyOtherSubject = $("#studyOtherSubject");
const studyTaskType = $("#studyTaskType");
const studyTaskFreeWrap = $("#studyTaskFreeWrap");
const studyTaskFree = $("#studyTaskFree");

const rangesList = $("#rangesList");
const btnAddRange = $("#btnAddRange");

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

/* timeline */
const btnJumpNow = $("#btnJumpNow");
const btnJumpTop = $("#btnJumpTop");
const timelineWrap = $("#timelineWrap");
const timeline = $("#timeline");

// ✅ 起動直後に勝手に出る「確認」を止める（ユーザー操作があってからだけ出す）
let userInteracted = false;

window.addEventListener("pointerdown", () => { userInteracted = true; }, { once: true });
window.addEventListener("keydown", () => { userInteracted = true; }, { once: true });

// 起動時に万一開いていても強制で閉じる
window.addEventListener("DOMContentLoaded", () => {
  try { closeModal(); } catch(e) {}
  const m = document.getElementById("modal");
  if (m) m.hidden = true;
});

/* ====== Init ====== */
initSelects();
hydrateUIFromState();
renderStudyList();
renderTimeline(true);
startClock();
startNowLineUpdater();

/* ====== Events ====== */
tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

btnNow.addEventListener("click", () => { setTab("timeline"); jumpToNow(); });
btnToday.addEventListener("click", () => { setTab("timeline"); jumpToDay(fmtDate(new Date())); });

btnResetSettings.addEventListener("click", () => confirmModal(
  "確認",
  "平日ルーチン設定を初期値に戻しますか？",
  "戻す",
  () => { state.settings = { ...DEFAULT_SETTINGS }; saveState(); hydrateUIFromState(); renderTimeline(true); }
));

[
  setCommuteStart, setCommuteMin,
  setSchoolStart, setSchoolEndMWF, setSchoolEndTT, setWeekendSchool,
  setClubEnabled, setClubStart, setClubEnd,
  setSleepStart, setSleepMin
].forEach(el => el.addEventListener("input", onSettingsChange));
[
  setWeekendSchool, setClubEnabled
].forEach(el => el.addEventListener("change", onSettingsChange));

lifeDate.addEventListener("change", () => {
  state.ui.lifeDate = lifeDate.value || fmtDate(new Date());
  saveState();
});
lifeType.addEventListener("change", () => {
  const isCustom = (lifeType.value === "自由入力");
  setHidden(lifeCustomWrap, !isCustom);
  if (!isCustom){
    lifeCustom.value = "";
  }
  // default minutes
  const def = LIFE_DEFAULT_MIN[lifeType.value];
  if (def != null) lifeMin.value = String(def);
});
$$('input[name="lifeMode"]').forEach(r => r.addEventListener("change", () => {
  const mode = lifeMode();
  setHidden(lifeDurationBox, mode !== "duration");
  setHidden(lifeRangeBox, mode !== "range");
}));

btnAddLife.addEventListener("click", addLifeBlock);
btnClearLifeDay.addEventListener("click", () => confirmModal(
  "確認",
  "この日の生活ブロックを全部消しますか？（ルーチンは消えません）",
  "消す",
  () => {
    const d = lifeDate.value;
    state.lifeByDate[d] = [];
    delete state.plansByDate[d];
    saveState();
    renderTimeline(true);
  }
));

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
  const isFree = (studyTaskType.value === "自由入力");
  setHidden(studyTaskFreeWrap, !isFree);
  autoUpdateStudyMin();
});
studyTaskFree.addEventListener("input", autoUpdateStudyMin);
rangesList.addEventListener("input", autoUpdateStudyMin);

btnAddRange.addEventListener("click", () => addRangeRow(rangesList));
btnAddStudy.addEventListener("click", addStudyTask);
btnClearStudyDay.addEventListener("click", () => confirmModal(
  "確認",
  "この日の勉強を全部消しますか？",
  "消す",
  () => {
    const d = studyDate.value;
    state.studyByDate[d] = [];
    delete state.plansByDate[d];
    saveState();
    renderStudyList();
    renderTimeline(true);
  }
));

btnAutoBuild.addEventListener("click", () => {
  const d = studyDate.value;
  buildPlanForDay(d, true);
  renderTimeline(true);
  setTab("timeline");
  jumpToDay(d);
});
btnRecalc.addEventListener("click", () => {
  recalcAllEstimatesForDay(studyDate.value);
  saveState();
  renderStudyList();
});

btnJumpNow.addEventListener("click", jumpToNow);
btnJumpTop.addEventListener("click", () => { timeline.scrollTo({ top: 0, behavior: "smooth" }); });

timeline.addEventListener("scroll", onTimelineScroll);

modalCancel.addEventListener("click", closeModal);
modalOk.addEventListener("click", () => {
  if (modalOk._onOk) modalOk._onOk();
  closeModal();
});

/* ====== Tab ====== */
function setTab(name){
  state.ui.activeTab = name;
  saveState();
  tabs.forEach(b => b.classList.toggle("is-active", b.dataset.tab === name));
  tabLife.classList.toggle("is-active", name === "life");
  tabStudy.classList.toggle("is-active", name === "study");
  tabTimeline.classList.toggle("is-active", name === "timeline");
}

/* ====== Selects ====== */
function initSelects(){
  // life type
  lifeType.innerHTML = "";
  LIFE_TYPES.forEach(x => {
    const o = document.createElement("option");
    o.value = x; o.textContent = x;
    lifeType.appendChild(o);
  });

  // study category
  studyCategory.innerHTML = "";
  addOpt(studyCategory, "", "—");
  Object.keys(SUBJECTS_BY_CATEGORY).forEach(cat => addOpt(studyCategory, cat, cat));

  // default range row
  if (rangesList.children.length === 0) addRangeRow(rangesList);
}
function addOpt(sel, val, label){
  const o = document.createElement("option");
  o.value = val;
  o.textContent = label;
  sel.appendChild(o);
}

/* ====== Hydrate ====== */
function hydrateUIFromState(){
  const today = fmtDate(new Date());

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

  // life date
  lifeDate.value = state.ui.lifeDate || today;

  // study date
  studyDate.value = state.ui.studyDate || today;

  // set tab
  setTab(state.ui.activeTab || "life");

  // init study chain
  studyCategory.value = "";
  syncStudySubjectSelect();
  syncStudyTaskTypeSelect();
  setHidden(studyTaskFreeWrap, true);

  // life mode ui
  setHidden(lifeCustomWrap, true);
  setHidden(lifeRangeBox, true);
  setHidden(lifeDurationBox, false);

  validateRoutineOverlap();
}

/* ====== Settings change ====== */
function onSettingsChange(){
  state.settings.commuteStart = setCommuteStart.value || "07:30";
  state.settings.commuteMin = clamp(parseInt(setCommuteMin.value || "60", 10), 1, 1000);

  state.settings.schoolStart = setSchoolStart.value || "08:30";
  state.settings.schoolEndMWF = setSchoolEndMWF.value || "15:00";
  state.settings.schoolEndTT = setSchoolEndTT.value || "16:00";
  state.settings.weekendSchool = setWeekendSchool.value || "off";

  state.settings.clubEnabled = setClubEnabled.value || "off";
  state.settings.clubStart = setClubStart.value || "16:10";
  state.settings.clubEnd = setClubEnd.value || "18:30";

  state.settings.sleepStart = setSleepStart.value || "23:30";
  state.settings.sleepMin = clamp(parseInt(setSleepMin.value || "420", 10), 1, 1440);

  saveState();

  // plan caches invalid
  state.plansByDate = {};
  saveState();

  validateRoutineOverlap();
  renderTimeline(true);
}

function validateRoutineOverlap(){
  const d = fmtDate(new Date());
  const blocks = buildRoutineBlocksForDate(d);
  const ok = !hasOverlap(blocks.filter(b => b.dayPart === "sameDay"));
  setHidden(lifeOverlapHint, ok);
}

/* ====== Life blocks ====== */
function lifeMode(){
  const el = document.querySelector('input[name="lifeMode"]:checked');
  return el ? el.value : "duration";
}

function addLifeBlock(){
  setHidden(lifeAddHint, true);

  const date = lifeDate.value || fmtDate(new Date());
  const typeRaw = lifeType.value || "";
  const type = (typeRaw === "自由入力") ? (lifeCustom.value || "").trim() : typeRaw;
  if (!type){ setHidden(lifeAddHint, false); return; }

  const mode = lifeMode();

  let startMin = null;
  let endMin = null;

  if (mode === "duration"){
    startMin = minutesOf(lifeStart.value);
    const mins = clamp(parseInt(lifeMin.value || "1", 10), 1, 2000);
    if (startMin == null){ setHidden(lifeAddHint, false); return; }
    endMin = startMin + mins;
  } else {
    const a = minutesOf(lifeFrom.value);
    const b = minutesOf(lifeTo.value);
    if (a == null || b == null){ setHidden(lifeAddHint, false); return; }
    startMin = a;
    endMin = b;
    if (endMin <= startMin) endMin += 1440; // cross midnight allowed
  }

  const id = uid();
  const block = { id, type, startMin, endMin };

  const arr = state.lifeByDate[date] ? [...state.lifeByDate[date]] : [];
  // overlap check with same-day representation (split cross-midnight for checking)
  const routine = buildRoutineBlocksForDate(date).filter(b => b.dayPart === "sameDay");
  const existing = splitCrossMidnight(arr).filter(b => b.dayPart === "sameDay");

  const candidate = splitCrossMidnight([block]).filter(b => b.dayPart === "sameDay");

  if (hasOverlap([...routine, ...existing, ...candidate])){
    setHidden(lifeAddHint, false);
    return;
  }

  arr.push(block);
  state.lifeByDate[date] = arr;
  delete state.plansByDate[date];
  saveState();
  renderTimeline(true);
}

/* ====== Study chain ====== */
function syncStudySubjectSelect(){
  const cat = studyCategory.value;
  studySubject.innerHTML = "";
  addOpt(studySubject, "", "—");

  if (!cat){
    studySubject.disabled = true;
    setHidden(studyOtherSubjectWrap, true);
    return;
  }

  const subs = SUBJECTS_BY_CATEGORY[cat] || [];
  subs.forEach(s => addOpt(studySubject, s, s));

  if (cat === "その他"){
    studySubject.value = "その他";
    studySubject.disabled = true;
    setHidden(studyOtherSubjectWrap, false);
  } else {
    studySubject.disabled = false;
    setHidden(studyOtherSubjectWrap, true);
    studyOtherSubject.value = "";
  }
}
function resolveStudySubject(){
  const cat = studyCategory.value;
  if (!cat) return "";
  if (cat !== "その他") return (studySubject.value || "").trim();
  const typed = (studyOtherSubject.value || "").trim();
  return typed ? typed : "その他";
}

function syncStudyTaskTypeSelect(){
  const cat = studyCategory.value;
  studyTaskType.innerHTML = "";
  addOpt(studyTaskType, "", "—");

  if (!cat){
    studyTaskType.disabled = true;
    setHidden(studyTaskFreeWrap, true);
    return;
  }

  const subj = resolveStudySubject();
  let opts = TASK_OPTIONS_BY_SUBJECT[subj];

  if (!opts){
    // その他の科目：教科書 + 既存のタスク内容も候補として出す
    opts = uniq(["教科書", ...Object.values(TASK_OPTIONS_BY_SUBJECT).flat(), "自由入力"]);
  } else {
    opts = uniq([...opts, "自由入力"]);
  }

  opts.forEach(x => addOpt(studyTaskType, x, x));
  studyTaskType.disabled = false;

  setHidden(studyTaskFreeWrap, (studyTaskType.value !== "自由入力"));
}

function resolveTaskType(){
  const raw = (studyTaskType.value || "").trim();
  if (!raw) return "";
  if (raw !== "自由入力") return raw;
  return (studyTaskFree.value || "").trim();
}

/* ====== Ranges ====== */
function addRangeRow(container, prefill){
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
    if (container.children.length === 0) addRangeRow(container);
    autoUpdateStudyMin();
  });

  if (prefill){
    row.querySelector(".rangeStart").value = prefill.start || "";
    row.querySelector(".rangeEnd").value = prefill.end || "";
  }

  container.appendChild(row);
}

function readRanges(container){
  return $$(".rangeRow").map(r => ({
    start: (r.querySelector(".rangeStart").value || "").trim(),
    end: (r.querySelector(".rangeEnd").value || "").trim(),
  })).filter(x => x.start || x.end);
}

function parseLeadingInt(token){
  const t = (token || "").trim();
  const m = /^(-?\d+)(.*)$/.exec(t);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (String(n) !== m[1]) return null;
  return { num: n, rest: m[2] || "" };
}

/**
 * 仕様:
 * - start/end が先頭整数を持つ場合:
 *   start: 11(2-3), end: 15(3) -> 11(2-3), 12, 13, 14, 15(3)
 * - start/end が同じ先頭整数の場合:
 *   71-71 -> 71（1個だけ）
 */
function computeRangeSteps(ranges){
  const out = [];
  for (const r of ranges){
    const a = (r.start || "").trim();
    const b = (r.end || "").trim();
    if (!a && !b) continue;

    const pa = parseLeadingInt(a);
    const pb = parseLeadingInt(b);

    if (pa && pb){
      if (pa.num === pb.num){
        // 同じ番号 → 1個（start優先、空ならend）
        out.push(a || b);
        continue;
      }
      const step = pa.num < pb.num ? 1 : -1;
      out.push(a);
      for (let v = pa.num + step; step === 1 ? v < pb.num : v > pb.num; v += step){
        out.push(String(v));
      }
      out.push(b);
      continue;
    }

    // 数字展開できないときは、そのまま1個
    out.push(a || b);
  }
  return out.length ? out : [];
}

/* ====== Auto estimate ====== */
function perRangeMinutes(subject, taskType){
  // 依頼仕様：セミナー(化/生)=20、4STEP(数Ⅲ/C)=10
  if ((subject === "化学" || subject === "生物") && taskType === "セミナー") return 20;
  if ((subject === "数学Ⅲ" || subject === "数学C") && taskType === "4STEP") return 10;
  return null;
}
function computeAutoMin(subject, taskType, ranges){
  const per = perRangeMinutes(subject, taskType);
  if (!per) return null;
  const steps = computeRangeSteps(ranges);
  const n = Math.max(1, steps.length || 1);
  return per * n;
}

function autoUpdateStudyMin(){
  // 手入力を尊重したいなら「触ったら固定」などもできるが、今回は簡潔に「推奨に寄せる」
  const cat = studyCategory.value;
  if (!cat) return;

  const subject = resolveStudySubject();
  const taskType = resolveTaskType();
  const ranges = readRanges(rangesList);

  const auto = computeAutoMin(subject, taskType, ranges);
  if (auto != null){
    studyMin.value = String(auto);
  }
}

/* ====== Study tasks ====== */
function addStudyTask(){
  setHidden(studyAddHint, true);

  const date = studyDate.value || fmtDate(new Date());
  const cat = (studyCategory.value || "").trim();
  if (!cat){ setHidden(studyAddHint, false); return; }

  const subject = resolveStudySubject();
  if (cat !== "その他" && !subject){ setHidden(studyAddHint, false); return; }

  const taskType = resolveTaskType();
  if (!taskType){ setHidden(studyAddHint, false); return; }

  const ranges = readRanges(rangesList);
  const durationMin = clamp(parseInt(studyMin.value || "30", 10), 1, 2000);
  const deadlineHHMM = (studyDeadline.value || "").trim();
  const link = (studyLink.value || "").trim();

  const id = uid();
  const task = {
    id,
    category: cat,
    subject,
    taskType,
    ranges,
    durationMin,
    deadlineHHMM: deadlineHHMM || "",
    link: link || "",
    createdAt: Date.now(),
  };

  const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
  arr.push(task);
  state.studyByDate[date] = arr;
  delete state.plansByDate[date];
  saveState();

  renderStudyList();
  renderTimeline(true);
}

function recalcAllEstimatesForDay(date){
  const arr = state.studyByDate[date] || [];
  for (const t of arr){
    const auto = computeAutoMin(t.subject, t.taskType, t.ranges || []);
    if (auto != null){
      t.durationMin = auto;
    }
  }
}

function renderStudyList(){
  const date = studyDate.value || fmtDate(new Date());
  const arr = state.studyByDate[date] || [];

  studyList.innerHTML = "";
  setHidden(overflowHint, true);

  if (arr.length === 0){
    studyList.appendChild(emptyLI("（この日はまだありません）"));
    return;
  }

  arr.forEach((t, idx) => {
    const li = document.createElement("li");
    li.className = "li";

    const head = document.createElement("div");
    head.className = "liHead";
    head.style.borderLeftColor = CATEGORY_COLORS[t.category] || cssVar("--gray");

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "liTitle";
    title.textContent = `${t.subject}｜${t.taskType}`;
    const meta = document.createElement("div");
    meta.className = "liMeta";
    const steps = computeRangeSteps(t.ranges || []);
    meta.textContent = `見積 ${t.durationMin}分` + (t.deadlineHHMM ? ` / 終了希望 ${t.deadlineHHMM}` : "") + (steps.length ? ` / 範囲 ${steps.length}個` : "");
    left.appendChild(title);
    left.appendChild(meta);

    head.appendChild(left);

    const btns = document.createElement("div");
    btns.className = "liBtns";
    btns.appendChild(miniBtn("↑", () => moveStudy(date, idx, -1)));
    btns.appendChild(miniBtn("↓", () => moveStudy(date, idx, +1)));
    btns.appendChild(miniBtn("削除", () => removeStudy(date, idx)));
    if (t.link){
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

function moveStudy(date, idx, dir){
  const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return;
  const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
  state.studyByDate[date] = arr;
  delete state.plansByDate[date];
  saveState();
  renderStudyList();
  renderTimeline(true);
}
function removeStudy(date, idx){
  confirmModal("確認", "この勉強を削除しますか？", "削除", () => {
    const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
    arr.splice(idx, 1);
    state.studyByDate[date] = arr;
    delete state.plansByDate[date];
    saveState();
    renderStudyList();
    renderTimeline(true);
  });
}

/* ====== Planning ====== */
function buildPlanForDay(date, allowCarry){
  const blocks = [];

  // fixed: routine
  const routine = buildRoutineBlocksForDate(date);
  blocks.push(...routine);

  // fixed: user life blocks
  const userLife = splitCrossMidnight(state.lifeByDate[date] || []);
  blocks.push(...userLife.map(b => ({
    kind:"life",
    label: b.type,
    color: cssVar("--gray"),
    startMin: b.startMin,
    endMin: b.endMin,
    date: dateOfPart(date, b.dayPart),
    link: "",
    meta: "生活",
    dayPart: b.dayPart,
  })));

  // build occupied map for this date (same-day only)
  const sameDayBlocks = blocks
    .filter(b => (b.date === date))
    .map(b => ({ startMin:b.startMin, endMin:b.endMin, label:b.label, kind:b.kind }));

  // compute study window: after school/club to sleepStart (same-day)
  const s = state.settings;
  const dObj = parseDate(date);
  const isWeekend = [0,6].includes(dObj.getDay());

  const schoolEnd = (dObj.getDay() === 2 || dObj.getDay() === 4) ? s.schoolEndTT : s.schoolEndMWF;
  const schoolEndMin = minutesOf(schoolEnd);
  const clubEndMin = (s.clubEnabled === "on") ? minutesOf(s.clubEnd) : null;
  const studyStartMin = Math.max(schoolEndMin ?? 0, clubEndMin ?? 0);

  const sleepStartMin = minutesOf(s.sleepStart) ?? 1410; // fallback 23:30

  // if weekend and weekendSchool off: studyStart = 0 (but still respect user blocks)
  let baseStart = studyStartMin;
  if (isWeekend && s.weekendSchool === "off"){
    baseStart = 0;
  }

  // if sleepStart earlier than baseStart, assume sleep is after midnight (rare). clamp.
  const studyEndMin = (sleepStartMin > baseStart) ? sleepStartMin : 1440;

  const freeSegments = subtractSegments(
    [{ start: baseStart, end: studyEndMin }],
    sameDayBlocks.map(b => ({ start:b.startMin, end:b.endMin }))
  );

  // tasks
  const tasks = (state.studyByDate[date] || []).map(t => ({ ...t }));
  // sort: deadline first (earlier), then created order
  tasks.sort((a,b) => {
    const da = a.deadlineHHMM ? minutesOf(a.deadlineHHMM) : null;
    const db = b.deadlineHHMM ? minutesOf(b.deadlineHHMM) : null;
    if (da == null && db == null) return (a.createdAt||0) - (b.createdAt||0);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  const scheduled = [];
  const overflow = [];

  let segments = freeSegments.slice();

  for (const t of tasks){
    const dur = clamp(parseInt(t.durationMin || "30", 10), 1, 2000);
    const deadlineMin = t.deadlineHHMM ? minutesOf(t.deadlineHHMM) : null;

    const place = placeTaskIntoSegments(segments, dur, deadlineMin);
    if (!place){
      overflow.push(t.id);
      continue;
    }
    // reserve
    segments = reserveSegment(segments, place.start, place.end);

    scheduled.push({
      kind:"study",
      label:`${t.subject}｜${t.taskType}`,
      color: CATEGORY_COLORS[t.category] || cssVar("--gray"),
      startMin: place.start,
      endMin: place.end,
      date,
      link: t.link || "",
      meta: `${t.category} / ${dur}分` + (t.deadlineHHMM ? ` / 希望 ${t.deadlineHHMM}` : ""),
      taskId: t.id,
    });
  }

  blocks.push(...scheduled);

  // store plan
  state.plansByDate[date] = { blocks: blocksForDate(blocks, date), overflow };
  saveState();

  // overflow hint in study tab
  setHidden(overflowHint, overflow.length === 0);

  // carry over: put overflow tasks to next day head (optional)
  if (allowCarry && overflow.length){
    const next = addDays(date, 1);
    const nextArr = state.studyByDate[next] ? [...state.studyByDate[next]] : [];
    const map = new Map((state.studyByDate[date] || []).map(x => [x.id, x]));
    const carryTasks = overflow.map(id => map.get(id)).filter(Boolean);

    // remove from today, add to next
    state.studyByDate[date] = (state.studyByDate[date] || []).filter(x => !overflow.includes(x.id));
    state.studyByDate[next] = [...carryTasks, ...nextArr];

    // invalidate next plan
    delete state.plansByDate[next];
    saveState();
  }
}

function blocksForDate(allBlocks, date){
  // return blocks that are on this date (sleep cross-midnight already split)
  return allBlocks.filter(b => b.date === date).sort((a,b)=>a.startMin-b.startMin);
}

function buildRoutineBlocksForDate(date){
  const s = state.settings;
  const dObj = parseDate(date);
  const isWeekend = [0,6].includes(dObj.getDay());
  const isTT = (dObj.getDay() === 2 || dObj.getDay() === 4); // Tue/Thu
  const blocks = [];

  const commuteStart = minutesOf(s.commuteStart);
  const commuteEnd = commuteStart + clamp(parseInt(s.commuteMin||"60",10),1,1000);

  if (commuteStart != null){
    blocks.push(makeLifeBlock(date, "移動", commuteStart, commuteEnd));
  }

  // school
  if (!(isWeekend && s.weekendSchool === "off")){
    const schoolStart = minutesOf(s.schoolStart);
    const schoolEnd = minutesOf(isTT ? s.schoolEndTT : s.schoolEndMWF);
    if (schoolStart != null && schoolEnd != null){
      blocks.push(makeLifeBlock(date, "授業", schoolStart, schoolEnd));
    }
  }

  // club (same day only)
  if (s.clubEnabled === "on"){
    const a = minutesOf(s.clubStart);
    const b = minutesOf(s.clubEnd);
    if (a != null && b != null){
      blocks.push(makeLifeBlock(date, "部活", a, b));
    }
  }

  // sleep (cross midnight split)
  const sleepStart = minutesOf(s.sleepStart);
  const sleepMin = clamp(parseInt(s.sleepMin||"420",10),1,1440);
  if (sleepStart != null){
    const sleepEnd = sleepStart + sleepMin;
    const parts = splitCrossMidnight([{ id:"sleep", type:"就寝", startMin:sleepStart, endMin:sleepEnd }]);
    for (const p of parts){
      blocks.push({
        kind:"life",
        label:"就寝",
        color: cssVar("--gray"),
        startMin:p.startMin,
        endMin:p.endMin,
        date: dateOfPart(date, p.dayPart),
        link:"",
        meta:"生活",
        dayPart:p.dayPart,
      });
    }
  }

  // mark routine as life blocks
  return blocks.map(b => ({
    ...b,
    kind:"life",
    color: cssVar("--gray"),
    meta:"生活",
  }));
}

function makeLifeBlock(date, label, startMin, endMin){
  // allow endMin <= startMin as cross midnight (split later)
  let s = startMin, e = endMin;
  if (e <= s) e += 1440;
  const parts = splitCrossMidnight([{ id: uid(), type: label, startMin: s, endMin: e }]);
  return parts.map(p => ({
    kind:"life",
    label,
    color: cssVar("--gray"),
    startMin:p.startMin,
    endMin:p.endMin,
    date: dateOfPart(date, p.dayPart),
    link:"",
    meta:"生活",
    dayPart:p.dayPart,
  }))[0]; // routine blocks are expected to be same-day usually
}

function dateOfPart(date, dayPart){
  if (dayPart === "sameDay") return date;
  if (dayPart === "nextDay") return addDays(date, 1);
  return date;
                                          }

/* ====== Overlap + segment ops ====== */
function hasOverlap(blocks){
  const list = blocks
    .map(b => ({ start: b.startMin, end: b.endMin }))
    .filter(x => x.start != null && x.end != null)
    .sort((a,b)=>a.start-b.start);

  for (let i=1;i<list.length;i++){
    if (list[i].start < list[i-1].end) return true;
  }
  return false;
}

function splitCrossMidnight(items){
  // items: {startMin,endMin,type,id}
  const out = [];
  for (const it of items){
    let s = it.startMin;
    let e = it.endMin;
    if (e <= s) e += 1440;

    if (s < 1440 && e <= 1440){
      out.push({ ...it, startMin:s, endMin:e, dayPart:"sameDay" });
    } else if (s < 1440 && e > 1440){
      out.push({ ...it, startMin:s, endMin:1440, dayPart:"sameDay" });
      out.push({ ...it, startMin:0, endMin:e-1440, dayPart:"nextDay" });
    } else {
      // starts after midnight in "next day" part
      out.push({ ...it, startMin:s-1440, endMin:e-1440, dayPart:"nextDay" });
    }
  }
  return out;
}

function subtractSegments(baseSegs, busySegs){
  // all in [0,1440] range; busy may overlap and be unsorted
  const busy = busySegs
    .map(x => ({ start: clamp(x.start,0,1440), end: clamp(x.end,0,1440) }))
    .filter(x => x.end > x.start)
    .sort((a,b)=>a.start-b.start);

  // merge busy
  const merged = [];
  for (const b of busy){
    const last = merged[merged.length-1];
    if (!last || b.start > last.end) merged.push({ ...b });
    else last.end = Math.max(last.end, b.end);
  }

  let free = baseSegs.map(x => ({ ...x }));
  for (const b of merged){
    const next = [];
    for (const f of free){
      if (b.end <= f.start || b.start >= f.end){
        next.push(f);
        continue;
      }
      if (b.start > f.start) next.push({ start:f.start, end:b.start });
      if (b.end < f.end) next.push({ start:b.end, end:f.end });
    }
    free = next;
  }
  return free.filter(x => x.end > x.start);
}

function placeTaskIntoSegments(segments, dur, deadlineMin){
  for (const seg of segments){
    const start = seg.start;
    const end = start + dur;
    if (end > seg.end) continue;
    if (deadlineMin != null && end > deadlineMin) continue;
    return { start, end };
  }
  return null;
}

function reserveSegment(segments, s, e){
  return subtractSegments(segments, [{ start:s, end:e }]);
}

/* ====== Timeline rendering ====== */
function renderTimeline(force){
  // preload window based on ui
  const today = fmtDate(new Date());
  const start = state.ui.loadedStart;
  const end = state.ui.loadedEnd;

  if (force){
    timeline.innerHTML = "";
    renderDayHeader();
    let cur = start;
    while (cur <= end){
      timeline.appendChild(renderDay(cur));
      cur = addDays(cur, 1);
    }
    // try build today's plan if not exists (optional)
    if (!state.plansByDate[today]){
      // do not auto-carry silently; just build structure (no carry)
      buildPlanForDay(today, false);
    }
    updateNowLine();
    return;
  }
}

function renderDayHeader(){
  const head = document.createElement("div");
  head.className = "dayHead";
  head.id = "timelineHead";
  head.textContent = "日付 / 時間";
  timeline.appendChild(head);
}

function renderDay(date){
  const dObj = parseDate(date);
  const day = document.createElement("div");
  day.className = "day";
  day.dataset.date = date;

  const axis = document.createElement("div");
  axis.className = "axis";

  const canvas = document.createElement("div");
  canvas.className = "canvas";
  canvas.style.height = `${DAY_MIN * PX_PER_MIN}px`;

  // hour labels
  for (let h=0; h<=24; h++){
    const y = h*60*PX_PER_MIN;
    if (h<24){
      const lab = document.createElement("div");
      lab.className = "hourLabel";
      lab.style.top = `${y}px`;
      lab.textContent = `${pad2(h)}:00`;
      axis.appendChild(lab);
    }
  }

  // title inside axis top
  const topTag = document.createElement("div");
  topTag.style.position = "sticky";
  topTag.style.top = "0";
  topTag.style.padding = "6px 0 10px 0";
  topTag.style.fontWeight = "900";
  topTag.style.color = "rgba(232,238,247,.90)";
  topTag.textContent = `${date} (${dowName(dObj)})`;
  axis.prepend(topTag);

  // blocks: plan if exists else only fixed routine+life blocks (no study)
  const plan = state.plansByDate[date];
  let blocks = [];

  if (plan && Array.isArray(plan.blocks)){
    blocks = plan.blocks;
  } else {
    // build minimal
    const routine = buildRoutineBlocksForDate(date);
    const userLife = splitCrossMidnight(state.lifeByDate[date] || []).filter(x => x.dayPart === "sameDay")
      .map(b => ({
        kind:"life",
        label: b.type,
        color: cssVar("--gray"),
        startMin: b.startMin,
        endMin: b.endMin,
        date,
        meta:"生活",
        link:"",
      }));

    // do not auto schedule unless user pressed build
    blocks = [
      ...blocksForDate(routine, date),
      ...userLife
    ].sort((a,b)=>a.startMin-b.startMin);
  }

  // paint blocks
  for (const b of blocks){
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
    const badge1 = document.createElement("span");
    badge1.className = "badge";
    badge1.textContent = `${hhmmOf(b.startMin)}–${hhmmOf(b.endMin)} / ${dur}m`;

    const badge2 = document.createElement("span");
    badge2.className = "badge";
    badge2.textContent = b.kind === "study" ? "勉強" : "生活";

    meta.appendChild(badge1);
    meta.appendChild(badge2);

    if (b.meta){
      const badge3 = document.createElement("span");
      badge3.className = "badge";
      badge3.textContent = b.meta;
      meta.appendChild(badge3);
    }

    if (b.link){
      const a = document.createElement("a");
      a.className = "badge linkIcon";
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

  // now line placeholder for today
  if (date === fmtDate(new Date())){
    const line = document.createElement("div");
    line.className = "nowLine";
    line.id = "nowLine";
    canvas.appendChild(line);

    const tag = document.createElement("div");
    tag.className = "nowTag";
    tag.id = "nowTag";
    tag.textContent = "NOW";
    canvas.appendChild(tag);
  }

  day.appendChild(axis);
  day.appendChild(canvas);
  return day;
}

function onTimelineScroll(){
  // load more days when near bottom
  const nearBottom = timeline.scrollTop + timeline.clientHeight > timeline.scrollHeight - 700;
  if (nearBottom){
    const oldEnd = state.ui.loadedEnd;
    const newEnd = addDays(oldEnd, 7);
    state.ui.loadedEnd = newEnd;
    saveState();

    // append days
    let cur = addDays(oldEnd, 1);
    while (cur <= newEnd){
      timeline.appendChild(renderDay(cur));
      cur = addDays(cur, 1);
    }
    updateNowLine();
  }

  // load earlier when near top (optional)
  const nearTop = timeline.scrollTop < 250;
  if (nearTop){
    const head = $("#timelineHead");
    if (!head) return;

    const oldStart = state.ui.loadedStart;
    const newStart = addDays(oldStart, -7);
    state.ui.loadedStart = newStart;
    saveState();

    let cur = addDays(oldStart, -1);
    const frags = [];
    while (cur >= newStart){
      frags.push(renderDay(cur));
      cur = addDays(cur, -1);
    }
    // insert in correct order after header
    const after = head.nextSibling;
    frags.reverse().forEach(node => timeline.insertBefore(node, after));

    // keep scroll position stable roughly
    timeline.scrollTop += 7 * DAY_MIN * PX_PER_MIN * 0.15; // small adjustment
    updateNowLine();
  }
}

/* ====== Now line ====== */
function startNowLineUpdater(){
  updateNowLine();
  setInterval(updateNowLine, 1000 * 30);
}
function updateNowLine(){
  const today = fmtDate(new Date());
  const dayEl = timeline.querySelector(`.day[data-date="${today}"]`);
  if (!dayEl) return;

  const canvas = dayEl.querySelector(".canvas");
  const line = dayEl.querySelector("#nowLine");
  const tag = dayEl.querySelector("#nowTag");
  if (!canvas || !line || !tag) return;

  const now = new Date();
  const min = now.getHours()*60 + now.getMinutes();
  const y = min * PX_PER_MIN;

  line.style.top = `${y}px`;
  tag.style.top = `${y}px`;
}
function jumpToNow(){
  const today = fmtDate(new Date());
  jumpToDay(today, true);
}
function jumpToDay(date, toNow){
  const dayEl = timeline.querySelector(`.day[data-date="${date}"]`);
  if (!dayEl) return;
  const canvas = dayEl.querySelector(".canvas");
  if (!canvas) return;

  let y = dayEl.offsetTop;
  if (toNow){
    const now = new Date();
    const min = now.getHours()*60 + now.getMinutes();
    y += min * PX_PER_MIN - 120;
  } else {
    y -= 80;
  }
  timeline.scrollTo({ top: Math.max(0, y), behavior:"smooth" });
}

/* ====== Clock ====== */
function startClock(){
  const tick = () => {
    const d = new Date();
    clockText.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ====== Modal ====== */
function confirmModal(title, text, okText, onOk){
  // ✅ ユーザーが一度も触ってないのに出ようとした確認はブロック
  if (!userInteracted) {
    try { closeModal(); } catch(e) {}
    const m = document.getElementById("modal");
    if (m) m.hidden = true;
    return;
  }

  modalTitle.textContent = title;
  modalText.textContent = text;
  modalOk.textContent = okText || "OK";
  modalOk._onOk = onOk;
  modal.hidden = false;
}

function confirmModal(title, text, okText, onOk){
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalOk.textContent = okText || "OK";
  modalOk._onOk = onOk;
  modal.hidden = false;
}
function closeModal(){
  modal.hidden = true;
  modalOk._onOk = null;
}

/* ====== UI bits ====== */
function emptyLI(text){
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
function miniBtn(label, onClick){
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btnGhost btnMini";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}
function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* ====== Today button ====== */
function jumpToDayTop(date){
  jumpToDay(date, false);
}

/* ====== Bootstrap default dates ====== */
(function initDates(){
  const today = fmtDate(new Date());
  if (!lifeDate.value) lifeDate.value = state.ui.lifeDate || today;
  if (!studyDate.value) studyDate.value = state.ui.studyDate || today;
})();
