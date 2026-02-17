/* Day Conductor (no modal / mobile-first) */
const LS_KEY = "day_conductor_v2";

/* ===== Utilities ===== */
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

function pad2(n){ return String(n).padStart(2,"0"); }
function fmtDate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function parseDate(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
function addDays(iso, delta){
  const d = parseDate(iso) || new Date();
  d.setDate(d.getDate()+delta);
  return fmtDate(d);
}
function dowName(d){
  return ["日","月","火","水","木","金","土"][d.getDay()];
}
function minutesOf(hhmm){
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh<0||hh>23||mm<0||mm>59) return null;
  return hh*60+mm;
}
function hhmmOf(min){
  min = ((min%1440)+1440)%1440;
  return `${pad2(Math.floor(min/60))}:${pad2(min%60)}`;
}
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

const PX_PER_MIN = 1.25;
const DAY_MIN = 1440;

/* ===== Colors / options ===== */
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

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
  "授業": 360,
  "部活": 120,
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

/* ===== State ===== */
function freshState(){
  const today = fmtDate(new Date());
  return {
    settings: { ...DEFAULT_SETTINGS },
    lifeByDate: {},
    studyByDate: {},
    planCache: {},
    ui: {
      activeTab: "life",
      lifeDate: today,
      studyDate: today,
      loadedStart: addDays(today, -2),
      loadedEnd: addDays(today, 10),
    }
  };
}
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
function sanitizeState(s){
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings||{}) };
  s.lifeByDate = s.lifeByDate || {};
  s.studyByDate = s.studyByDate || {};
  s.planCache = s.planCache || {};
  s.ui = { ...freshState().ui, ...(s.ui||{}) };
  return s;
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
let state = loadState();

/* ===== DOM ===== */
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

/* ===== Init UI ===== */
initSelects();
hydrate();
renderStudyList();
renderTimeline(true);
startClock();
startNowLineUpdater();

/* ===== Tabs ===== */
tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
function setTab(name){
  state.ui.activeTab = name;
  saveState();
  tabs.forEach(b => b.classList.toggle("is-active", b.dataset.tab === name));
  tabLife.classList.toggle("is-active", name === "life");
  tabStudy.classList.toggle("is-active", name === "study");
  tabTimeline.classList.toggle("is-active", name === "timeline");
}

/* ===== Select init ===== */
function initSelects(){
  // life types
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

/* ===== Hydrate ===== */
function hydrate(){
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

  validateRoutineOverlap();
}

/* ===== No-confirm reset (直接実行) ===== */
btnResetSettings.addEventListener("click", () => {
  state.settings = { ...DEFAULT_SETTINGS };
  state.planCache = {};
  saveState();
  hydrate();
  renderTimeline(true);
});

/* ===== Settings events ===== */
[
  setCommuteStart, setCommuteMin,
  setSchoolStart, setSchoolEndMWF, setSchoolEndTT, setWeekendSchool,
  setClubEnabled, setClubStart, setClubEnd,
  setSleepStart, setSleepMin
].forEach(el => el.addEventListener("input", onSettingsChange));
[
  setWeekendSchool, setClubEnabled
].forEach(el => el.addEventListener("change", onSettingsChange));

function onSettingsChange(){
  state.settings.commuteStart = setCommuteStart.value || DEFAULT_SETTINGS.commuteStart;
  state.settings.commuteMin = clamp(parseInt(setCommuteMin.value||"60",10),1,1000);

  state.settings.schoolStart = setSchoolStart.value || DEFAULT_SETTINGS.schoolStart;
  state.settings.schoolEndMWF = setSchoolEndMWF.value || DEFAULT_SETTINGS.schoolEndMWF;
  state.settings.schoolEndTT = setSchoolEndTT.value || DEFAULT_SETTINGS.schoolEndTT;
  state.settings.weekendSchool = setWeekendSchool.value || "off";

  state.settings.clubEnabled = setClubEnabled.value || "off";
  state.settings.clubStart = setClubStart.value || DEFAULT_SETTINGS.clubStart;
  state.settings.clubEnd = setClubEnd.value || DEFAULT_SETTINGS.clubEnd;

  state.settings.sleepStart = setSleepStart.value || DEFAULT_SETTINGS.sleepStart;
  state.settings.sleepMin = clamp(parseInt(setSleepMin.value||"420",10),1,1440);

  clubEndWrap.style.display = (state.settings.clubEnabled === "on") ? "" : "none";

  // cache invalid
  state.planCache = {};
  saveState();

  validateRoutineOverlap();
  renderTimeline(true);
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

btnAddLife.addEventListener("click", addLifeBlock);
btnClearLifeDay.addEventListener("click", () => {
  const d = lifeDate.value;
  state.lifeByDate[d] = [];
  delete state.planCache[d];
  saveState();
  renderTimeline(true);
});

function lifeMode(){
  const el = document.querySelector('input[name="lifeMode"]:checked');
  return el ? el.value : "duration";
}

function addLifeBlock(){
  setHidden(lifeAddHint, true);

  const date = lifeDate.value || fmtDate(new Date());
  const rawType = lifeType.value || "";
  const type = (rawType === "自由入力") ? (lifeCustom.value||"").trim() : rawType;
  if (!type){ setHidden(lifeAddHint,false); return; }

  let startMin=null, endMin=null;

  if (lifeMode()==="duration"){
    startMin = minutesOf(lifeStart.value);
    const mins = clamp(parseInt(lifeMin.value||"1",10),1,2000);
    if (startMin==null){ setHidden(lifeAddHint,false); return; }
    endMin = startMin + mins;
  }else{
    const a = minutesOf(lifeFrom.value);
    const b = minutesOf(lifeTo.value);
    if (a==null||b==null){ setHidden(lifeAddHint,false); return; }
    startMin=a; endMin=b;
    if (endMin<=startMin) endMin += 1440;
  }

  const block = { id: uid(), type, startMin, endMin };

  const arr = state.lifeByDate[date] ? [...state.lifeByDate[date]] : [];
  // overlap check with routine + existing (same-day part)
  const routine = buildRoutineBlocksForDate(date).filter(b=>b.date===date);
  const existing = splitCrossMidnight(arr).filter(p=>p.date===date);
  const cand = splitCrossMidnight([block]).filter(p=>p.date===date);

  if (hasOverlap([...routine, ...existing, ...cand])){
    setHidden(lifeAddHint,false);
    return;
  }

  arr.push(block);
  state.lifeByDate[date]=arr;
  delete state.planCache[date];
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
btnAddRange.addEventListener("click", () => addRangeRow(rangesList));

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

function syncStudySubjectSelect(){
  const cat = studyCategory.value;
  studySubject.innerHTML = "";
  addOpt(studySubject,"","—");

  if (!cat){
    studySubject.disabled = true;
    setHidden(studyOtherSubjectWrap,true);
    return;
  }

  const subs = SUBJECTS_BY_CATEGORY[cat] || [];
  subs.forEach(s => addOpt(studySubject, s, s));

  if (cat==="その他"){
    studySubject.value = "その他";
    studySubject.disabled = true;
    setHidden(studyOtherSubjectWrap,false);
  }else{
    studySubject.disabled = false;
    setHidden(studyOtherSubjectWrap,true);
    studyOtherSubject.value="";
  }
}
function resolveStudySubject(){
  const cat = studyCategory.value;
  if (!cat) return "";
  if (cat!=="その他") return (studySubject.value||"").trim();
  const typed = (studyOtherSubject.value||"").trim();
  return typed ? typed : "その他";
}
function syncStudyTaskTypeSelect(){
  const cat = studyCategory.value;
  studyTaskType.innerHTML="";
  addOpt(studyTaskType,"","—");

  if (!cat){
    studyTaskType.disabled=true;
    setHidden(studyTaskFreeWrap,true);
    return;
  }

  const subj = resolveStudySubject();
  let opts = TASK_OPTIONS_BY_SUBJECT[subj];

  if (!opts){
    // その他：教科書 + 既存の候補 + 自由入力
    opts = uniq(["教科書", ...Object.values(TASK_OPTIONS_BY_SUBJECT).flat(), "自由入力"]);
  }else{
    opts = uniq([...opts, "自由入力"]);
  }

  opts.forEach(x => addOpt(studyTaskType,x,x));
  studyTaskType.disabled=false;
  setHidden(studyTaskFreeWrap, studyTaskType.value !== "自由入力");
}
function resolveTaskType(){
  const raw = (studyTaskType.value||"").trim();
  if (!raw) return "";
  if (raw!=="自由入力") return raw;
  return (studyTaskFree.value||"").trim();
}
function uniq(arr){
  const s = new Set();
  const out = [];
  for (const x of arr){
    const k = String(x);
    if (!s.has(k)){ s.add(k); out.push(x); }
  }
  return out;
}

/* ===== Ranges ===== */
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
    if (container.children.length===0) addRangeRow(container);
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
    start: (r.querySelector(".rangeStart").value||"").trim(),
    end: (r.querySelector(".rangeEnd").value||"").trim(),
  })).filter(x => x.start || x.end);
}
function parseLeadingInt(token){
  const t = String(token||"").trim();
  const m = /^(-?\d+)(.*)$/.exec(t);
  if (!m) return null;
  const n = parseInt(m[1],10);
  if (String(n)!==m[1]) return null;
  return { num:n, rest:m[2]||"" };
}

/* 展開仕様：
   start:11(2-3) end:15(3) => 11(2-3),12,13,14,15(3)
   startとendの先頭整数が同じ => 1個だけ（71-71 => 71） */
function computeRangeSteps(ranges){
  const out = [];
  for (const r of ranges){
    const a = (r.start||"").trim();
    const b = (r.end||"").trim();
    if (!a && !b) continue;

    const pa = parseLeadingInt(a);
    const pb = parseLeadingInt(b);

    if (pa && pb){
      if (pa.num === pb.num){
        out.push(a || b);
        continue;
      }
      const step = pa.num < pb.num ? 1 : -1;
      out.push(a);
      for (let v = pa.num + step; step===1 ? v < pb.num : v > pb.num; v += step){
        out.push(String(v));
      }
      out.push(b);
      continue;
    }
    out.push(a || b);
  }
  return out;
}

/* ===== Auto minutes ===== */
function perRangeMinutes(subject, taskType){
  if ((subject==="化学" || subject==="生物") && taskType==="セミナー") return 20;
  if ((subject==="数学Ⅲ" || subject==="数学C") && taskType==="4STEP") return 10;
  return null;
}
function computeAutoMin(subject, taskType, ranges){
  const per = perRangeMinutes(subject, taskType);
  if (!per) return null;
  const steps = computeRangeSteps(ranges);
  return per * Math.max(1, steps.length || 1);
}
function autoUpdateStudyMin(){
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

/* ===== Study add/list ===== */
function addStudyTask(){
  setHidden(studyAddHint,true);

  const date = studyDate.value || fmtDate(new Date());
  const cat = (studyCategory.value||"").trim();
  if (!cat){ setHidden(studyAddHint,false); return; }

  const subject = resolveStudySubject();
  if (cat!=="その他" && !subject){ setHidden(studyAddHint,false); return; }

  const taskType = resolveTaskType();
  if (!taskType){ setHidden(studyAddHint,false); return; }

  const ranges = readRanges(rangesList);
  const durationMin = clamp(parseInt(studyMin.value||"30",10),1,2000);
  const deadline = (studyDeadline.value||"").trim();
  const link = (studyLink.value||"").trim();

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
  state.studyByDate[date]=arr;
  delete state.planCache[date];
  saveState();

  renderStudyList();
  renderTimeline(true);
}
function recalcAllEstimatesForDay(date){
  const arr = state.studyByDate[date] || [];
  for (const t of arr){
    const auto = computeAutoMin(t.subject, t.taskType, t.ranges||[]);
    if (auto != null) t.durationMin = auto;
  }
}
function renderStudyList(){
  const date = studyDate.value || fmtDate(new Date());
  const arr = state.studyByDate[date] || [];
  studyList.innerHTML = "";
  setHidden(overflowHint,true);

  if (arr.length===0){
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

    const steps = computeRangeSteps(t.ranges||[]);
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
  if (j<0||j>=arr.length) return;
  const tmp = arr[idx]; arr[idx]=arr[j]; arr[j]=tmp;
  state.studyByDate[date]=arr;
  delete state.planCache[date];
  saveState();
  renderStudyList();
  renderTimeline(true);
}
function removeStudy(date, idx){
  // 確認なしで即削除
  const arr = state.studyByDate[date] ? [...state.studyByDate[date]] : [];
  arr.splice(idx,1);
  state.studyByDate[date]=arr;
  delete state.planCache[date];
  saveState();
  renderStudyList();
  renderTimeline(true);
}
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
  b.type="button";
  b.className="btn btnGhost btnMini";
  b.textContent=label;
  b.addEventListener("click", onClick);
  return b;
}
function setHidden(el, v){ el.hidden = !!v; }

/* ===== Planning ===== */
function buildPlanForDay(date, allowCarry){
  const blocks = [];

  // fixed routine + user life
  blocks.push(...buildRoutineBlocksForDate(date));
  blocks.push(...buildUserLifeBlocksForDate(date));

  // same-day occupied
  const occupied = blocks
    .filter(b => b.date === date)
    .map(b => ({ start:b.startMin, end:b.endMin }))
    .filter(x => x.end > x.start);

  const s = state.settings;
  const dObj = parseDate(date);
  const isWeekend = [0,6].includes(dObj.getDay());
  const isTT = (dObj.getDay()===2 || dObj.getDay()===4);

  // study window: after school/club to sleepStart (or whole day on weekend with weekendSchool off)
  const schoolEndMin = minutesOf(isTT ? s.schoolEndTT : s.schoolEndMWF) ?? 0;
  const clubEndMin = (s.clubEnabled==="on") ? (minutesOf(s.clubEnd) ?? 0) : 0;

  let baseStart = Math.max(schoolEndMin, clubEndMin);
  if (isWeekend && s.weekendSchool==="off") baseStart = 0;

  const sleepStartMin = minutesOf(s.sleepStart) ?? 1410;
  const windowEnd = (sleepStartMin > baseStart) ? sleepStartMin : 1440;

  let segments = subtractSegments([{start:baseStart, end:windowEnd}], occupied);

  const tasks = (state.studyByDate[date] || []).map(t => ({...t}));
  tasks.sort((a,b) => {
    const da = a.deadlineHHMM ? minutesOf(a.deadlineHHMM) : null;
    const db = b.deadlineHHMM ? minutesOf(b.deadlineHHMM) : null;
    if (da==null && db==null) return (a.createdAt||0)-(b.createdAt||0);
    if (da==null) return 1;
    if (db==null) return -1;
    return da - db;
  });

  const overflow = [];
  for (const t of tasks){
    const dur = clamp(parseInt(t.durationMin||"30",10),1,2000);
    const deadlineMin = t.deadlineHHMM ? minutesOf(t.deadlineHHMM) : null;

    // まず「締切までに入る場所」を探す
    let place = placeTask(segments, dur, deadlineMin);
    // 入らないなら「締切無視でも入る場所」を探す
    if (!place) place = placeTask(segments, dur, null);

    if (!place){
      overflow.push(t.id);
      continue;
    }

    segments = reserve(segments, place.start, place.end);

    blocks.push({
      kind:"study",
      date,
      startMin: place.start,
      endMin: place.end,
      label: `${t.subject}｜${t.taskType}`,
      color: CATEGORY_COLORS[t.category] || cssVar("--gray"),
      meta: `${dur}分` + (t.deadlineHHMM ? ` / 希望 ${t.deadlineHHMM}` : ""),
      link: t.link || "",
    });
  }

  state.planCache[date] = { blocks: blocks.filter(b=>b.date===date).sort((a,b)=>a.startMin-b.startMin), overflow };
  saveState();

  setHidden(overflowHint, overflow.length===0);

  // 繰り越し： overflow タスクを翌日に移す
  if (allowCarry && overflow.length){
    const next = addDays(date,1);
    const todayArr = state.studyByDate[date] || [];
    const map = new Map(todayArr.map(x=>[x.id,x]));
    const carry = overflow.map(id=>map.get(id)).filter(Boolean);

    state.studyByDate[date] = todayArr.filter(x=>!overflow.includes(x.id));
    state.studyByDate[next] = [...carry, ...(state.studyByDate[next]||[])];

    delete state.planCache[next];
    saveState();
  }
}

function buildRoutineBlocksForDate(date){
  const s = state.settings;
  const dObj = parseDate(date);
  const isWeekend = [0,6].includes(dObj.getDay());
  const isTT = (dObj.getDay()===2 || dObj.getDay()===4);

  const out = [];

  const showSchool = !(isWeekend && s.weekendSchool==="off");

  if (showSchool){
    // commute
    const cStart = minutesOf(s.commuteStart);
    const cEnd = (cStart==null) ? null : cStart + clamp(parseInt(s.commuteMin||"60",10),1,1000);
    if (cStart!=null && cEnd!=null){
      out.push({
        kind:"life", date, label:"移動", color:cssVar("--gray"),
        startMin:cStart, endMin:cEnd, meta:"生活", link:""
      });
    }

    // school
    const scStart = minutesOf(s.schoolStart);
    const scEnd = minutesOf(isTT ? s.schoolEndTT : s.schoolEndMWF);
    if (scStart!=null && scEnd!=null){
      out.push({
        kind:"life", date, label:"授業", color:cssVar("--gray"),
        startMin:scStart, endMin:scEnd, meta:"生活", link:""
      });
    }
  }

  // club
  if (s.clubEnabled==="on"){
    const a = minutesOf(s.clubStart);
    const b = minutesOf(s.clubEnd);
    if (a!=null && b!=null){
      let end = b;
      if (end<=a) end += 1440;
      const parts = splitCrossMidnight([{type:"部活", startMin:a, endMin:end}]).filter(p=>p.date===date);
      for (const p of parts){
        out.push({
          kind:"life", date, label:"部活", color:cssVar("--gray"),
          startMin:p.startMin, endMin:p.endMin, meta:"生活", link:""
        });
      }
    }
  }

  // sleep (cross midnight)
  const slStart = minutesOf(s.sleepStart);
  const slEnd = (slStart==null) ? null : slStart + clamp(parseInt(s.sleepMin||"420",10),1,1440);
  if (slStart!=null && slEnd!=null){
    const parts = splitCrossMidnight([{type:"就寝", startMin:slStart, endMin:slEnd}]);
    for (const p of parts){
      out.push({
        kind:"life", date: p.date, label:"就寝", color:cssVar("--gray"),
        startMin:p.startMin, endMin:p.endMin, meta:"生活", link:""
      });
    }
  }

  return out;
}

function buildUserLifeBlocksForDate(date){
  const arr = state.lifeByDate[date] || [];
  const parts = splitCrossMidnight(arr.map(x => ({
    type:x.type, startMin:x.startMin, endMin:x.endMin
  })));
  return parts.map(p => ({
    kind:"life",
    date: p.date,
    label: p.type,
    color: cssVar("--gray"),
    startMin: p.startMin,
    endMin: p.endMin,
    meta: "生活",
    link: ""
  }));
}

function splitCrossMidnight(items){
  // items: {type,startMin,endMin} with endMin may exceed 1440
  const out = [];
  for (const it of items){
    let s = it.startMin;
    let e = it.endMin;
    if (e <= s) e += 1440;

    if (s < 1440 && e <= 1440){
      out.push({ ...it, startMin:s, endMin:e, date: currentDateTag() });
    } else if (s < 1440 && e > 1440){
      out.push({ ...it, startMin:s, endMin:1440, date: currentDateTag() });
      out.push({ ...it, startMin:0, endMin:e-1440, date: nextDateTag() });
    } else {
      out.push({ ...it, startMin:s-1440, endMin:e-1440, date: nextDateTag() });
    }
  }
  return out;

  // この関数は「呼び出し側の基準日」が必要なので、呼び出し前に一時的にセットする
}
let _splitBaseDate = fmtDate(new Date());
function withSplitBaseDate(date, fn){
  _splitBaseDate = date;
  const r = fn();
  _splitBaseDate = fmtDate(new Date());
  return r;
}
function currentDateTag(){ return _splitBaseDate; }
function nextDateTag(){ return addDays(_splitBaseDate,1); }

/* segment ops */
function hasOverlap(blocks){
  const list = blocks.map(b=>({start:b.startMin,end:b.endMin})).sort((a,b)=>a.start-b.start);
  for (let i=1;i<list.length;i++){
    if (list[i].start < list[i-1].end) return true;
  }
  return false;
}
function subtractSegments(baseSegs, busySegs){
  const busy = busySegs
    .map(x => ({ start: clamp(x.start,0,1440), end: clamp(x.end,0,1440) }))
    .filter(x => x.end > x.start)
    .sort((a,b)=>a.start-b.start);

  // merge
  const merged=[];
  for (const b of busy){
    const last=merged[merged.length-1];
    if (!last || b.start > last.end) merged.push({...b});
    else last.end = Math.max(last.end, b.end);
  }

  let free = baseSegs.map(x=>({...x}));
  for (const b of merged){
    const next=[];
    for (const f of free){
      if (b.end<=f.start || b.start>=f.end){ next.push(f); continue; }
      if (b.start>f.start) next.push({start:f.start,end:b.start});
      if (b.end<f.end) next.push({start:b.end,end:f.end});
    }
    free=next;
  }
  return free.filter(x=>x.end>x.start);
}
function placeTask(segments, dur, deadlineMin){
  for (const seg of segments){
    const start = seg.start;
    const end = start + dur;
    if (end > seg.end) continue;
    if (deadlineMin!=null && end > deadlineMin) continue;
    return { start, end };
  }
  return null;
}
function reserve(segments, s, e){
  return subtractSegments(segments, [{start:s,end:e}]);
}

/* ===== Validate routine overlap ===== */
function validateRoutineOverlap(){
  const today = fmtDate(new Date());
  const blocks = withSplitBaseDate(today, () => buildRoutineBlocksForDate(today));
  const same = blocks.filter(b=>b.date===today);
  setHidden(routineOverlapHint, !hasOverlap(same));
}

/* ===== Timeline ===== */
function renderTimeline(force){
  if (!force) return;

  timeline.innerHTML = "";
  const start = state.ui.loadedStart;
  const end = state.ui.loadedEnd;

  let cur = start;
  while (cur <= end){
    timeline.appendChild(renderDay(cur));
    cur = addDays(cur, 1);
  }

  updateNowLine();
}

function renderDay(date){
  // build cached plan if exists, else show routine + user life only
  const dayEl = document.createElement("div");
  dayEl.className="day";
  dayEl.dataset.date = date;

  const axis = document.createElement("div");
  axis.className="axis";
  const tag = document.createElement("div");
  tag.className="dayTag";
  const dObj = parseDate(date);
  tag.textContent = `${date}（${dowName(dObj)}）`;
  axis.appendChild(tag);

  for (let h=0; h<24; h++){
    const y = h*60*PX_PER_MIN;
    const lab = document.createElement("div");
    lab.className="hourLabel";
    lab.style.top = `${y}px`;
    lab.textContent = `${pad2(h)}:00`;
    axis.appendChild(lab);
  }

  const canvas = document.createElement("div");
  canvas.className="canvas";
  canvas.style.height = `${DAY_MIN*PX_PER_MIN}px`;

  const plan = state.planCache[date];
  let blocks = [];

  if (plan && Array.isArray(plan.blocks)){
    blocks = plan.blocks;
  }else{
    // no auto plan yet: routine + user life only
    const routine = withSplitBaseDate(date, () => buildRoutineBlocksForDate(date)).filter(b=>b.date===date);
    const life = withSplitBaseDate(date, () => buildUserLifeBlocksForDate(date)).filter(b=>b.date===date);
    blocks = [...routine, ...life].sort((a,b)=>a.startMin-b.startMin);
  }

  for (const b of blocks){
    const el = document.createElement("div");
    el.className="block";
    el.style.top = `${b.startMin*PX_PER_MIN}px`;
    el.style.height = `${Math.max(18, (b.endMin-b.startMin)*PX_PER_MIN)}px`;
    el.style.borderLeftColor = b.color || cssVar("--gray");

    const title = document.createElement("div");
    title.className="blockTitle";
    title.textContent = b.label;

    const meta = document.createElement("div");
    meta.className="blockMeta";

    const dur = b.endMin - b.startMin;
    meta.appendChild(badge(`${hhmmOf(b.startMin)}–${hhmmOf(b.endMin)} / ${dur}m`));
    meta.appendChild(badge(b.kind==="study" ? "勉強" : "生活"));
    if (b.meta) meta.appendChild(badge(b.meta));
    if (b.link){
      const a = document.createElement("a");
      a.className="badge badgeLink";
      a.href=b.link;
      a.target="_blank";
      a.rel="noopener";
      a.textContent="↗";
      meta.appendChild(a);
    }

    el.appendChild(title);
    el.appendChild(meta);
    canvas.appendChild(el);
  }

  if (date === fmtDate(new Date())){
    const line = document.createElement("div");
    line.className="nowLine";
    line.id="nowLine";
    canvas.appendChild(line);

    const nowTag = document.createElement("div");
    nowTag.className="nowTag";
    nowTag.id="nowTag";
    nowTag.textContent="NOW";
    canvas.appendChild(nowTag);
  }

  dayEl.appendChild(axis);
  dayEl.appendChild(canvas);
  return dayEl;
}

function badge(text){
  const s = document.createElement("span");
  s.className="badge";
  s.textContent=text;
  return s;
}

/* infinite scroll */
timeline.addEventListener("scroll", () => {
  const nearBottom = timeline.scrollTop + timeline.clientHeight > timeline.scrollHeight - 800;
  if (nearBottom){
    const oldEnd = state.ui.loadedEnd;
    const newEnd = addDays(oldEnd, 7);
    state.ui.loadedEnd = newEnd;
    saveState();

    let cur = addDays(oldEnd, 1);
    while (cur <= newEnd){
      timeline.appendChild(renderDay(cur));
      cur = addDays(cur, 1);
    }
    updateNowLine();
  }

  const nearTop = timeline.scrollTop < 250;
  if (nearTop){
    const oldStart = state.ui.loadedStart;
    const newStart = addDays(oldStart, -7);
    state.ui.loadedStart = newStart;
    saveState();

    // insert days at top
    const frags = [];
    let cur = addDays(oldStart, -1);
    while (cur >= newStart){
      frags.push(renderDay(cur));
      cur = addDays(cur, -1);
    }
    frags.reverse().forEach(node => timeline.insertBefore(node, timeline.firstChild));
    // 少しだけ位置補正
    timeline.scrollTop += 7 * 60 * PX_PER_MIN;
    updateNowLine();
  }
});

/* jump buttons */
btnJumpToday.addEventListener("click", () => jumpToDay(fmtDate(new Date()), false));
btnTop.addEventListener("click", () => timeline.scrollTo({top:0,behavior:"smooth"}));
btnJumpNow.addEventListener("click", () => {
  setTab("timeline");
  jumpToDay(fmtDate(new Date()), true);
});

/* now line */
function startNowLineUpdater(){
  updateNowLine();
  setInterval(updateNowLine, 1000*30);
}
function updateNowLine(){
  const today = fmtDate(new Date());
  const dayEl = timeline.querySelector(`.day[data-date="${today}"]`);
  if (!dayEl) return;

  const line = dayEl.querySelector("#nowLine");
  const tag = dayEl.querySelector("#nowTag");
  const canvas = dayEl.querySelector(".canvas");
  if (!line || !tag || !canvas) return;

  const now = new Date();
  const min = now.getHours()*60 + now.getMinutes();
  const y = min * PX_PER_MIN;

  line.style.top = `${y}px`;
  tag.style.top = `${y}px`;
}
function jumpToDay(date, toNow){
  const dayEl = timeline.querySelector(`.day[data-date="${date}"]`);
  if (!dayEl) return;
  let y = dayEl.offsetTop - 80;

  if (toNow){
    const now = new Date();
    const min = now.getHours()*60 + now.getMinutes();
    y += min*PX_PER_MIN - 120;
  }
  timeline.scrollTo({ top: Math.max(0,y), behavior:"smooth" });
}

/* clock */
function startClock(){
  const tick = () => {
    const d = new Date();
    clockText.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ===== Fix: splitCrossMidnight needs baseDate =====
   buildRoutine/buildUserLife/buildPlan call splitCrossMidnight via withSplitBaseDate(date, ...) */
const _origBuildRoutine = buildRoutineBlocksForDate;
buildRoutineBlocksForDate = function(date){
  return withSplitBaseDate(date, () => _origBuildRoutine(date));
};
const _origBuildUser = buildUserLifeBlocksForDate;
buildUserLifeBlocksForDate = function(date){
  return withSplitBaseDate(date, () => _origBuildUser(date));
};

/* ===== Startup ===== */
(function boot(){
  // set initial dates
  const today = fmtDate(new Date());
  if (!lifeDate.value) lifeDate.value = state.ui.lifeDate || today;
  if (!studyDate.value) studyDate.value = state.ui.studyDate || today;

  // life defaults
  const def = LIFE_DEFAULT_MIN[lifeType.value];
  if (def != null) lifeMin.value = String(def);

  // life mode UI
  setHidden(lifeCustomWrap,true);
  setHidden(lifeRangeBox,true);
  setHidden(lifeDurationBox,false);

  // timeline initial plan cache for today (作らない：ユーザーが押すまで)
})();
