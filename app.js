/* =========================================================
   Day Conductor — Daily schedule planner (vanilla JS)
   - GitHub Pages 用 app.js（index.html は #app を置くだけ）
   - 生活設定 + 勉強リスト + タイムライン + 勉強実行（Runner）
   ========================================================= */

/* ===== Boot ===== */
(() => {
  "use strict";

  /* ===== Constants ===== */
  const LS_KEY = "day_conductor_v6";
  const PX_PER_MIN = 1.25; // タイムラインの縦スケール
  const MIN_BLOCK_PX = 44; // 短時間でも読める最小高さ

  const COLORS = {
    kokugo: "#ff5aa7",
    math: "#41cfff",
    english: "#a45bff",
    science: "#7dff69",
    social: "#ffd84a",
    other: "#9aa3ad",
    bg: "#0b0f17",
    panel: "#0f1521",
    card: "#111a2a",
    line: "rgba(255,255,255,.08)",
    text: "#f0f4ff",
    sub: "rgba(240,244,255,.72)",
  };

  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  const RETURN_MOVE_OPTIONS = [
    { value: "60", label: "60分" },
    { value: "30", label: "30分" },
    { value: "30x2", label: "30分×2（途中で帰宅）" },
  ];

  const LIFE_TYPE_OPTIONS = [
    { value: "-", label: "-" },
    { value: "移動", label: "移動" },
    { value: "食事", label: "食事" },
    { value: "風呂", label: "風呂" },
    { value: "準備", label: "準備" },
    { value: "就寝", label: "就寝" },
    { value: "ラジオ", label: "ラジオ" },
    { value: "テレビ", label: "テレビ" },
    { value: "爪切り", label: "爪切り" },
    { value: "散髪", label: "散髪" },
  ];

  const LIFE_DEFAULT_MIN_BY_TYPE = {
    "移動": 30,
    "食事": 30,
    "風呂": 60,
    "準備": 15,
    "ラジオ": 60,
    "テレビ": 60,
    "爪切り": 15,
    "散髪": 60,
  };

  const STUDY_SYSTEMS = [
    { key: "kokugo", label: "国語系", color: COLORS.kokugo },
    { key: "math", label: "数学系", color: COLORS.math },
    { key: "english", label: "英語系", color: COLORS.english },
    { key: "science", label: "理科系", color: COLORS.science },
    { key: "social", label: "社会系", color: COLORS.social },
    { key: "other", label: "その他", color: COLORS.other },
  ];

  const SUBJECTS_BY_SYSTEM = {
    kokugo: ["論国", "古典"],
    math: ["数学Ⅲ", "数学C"],
    english: ["英C", "論表"],
    science: ["化学", "生物"],
    social: ["地理", "公共"],
    other: ["その他"],
  };

  const TASK_TYPES_BY_SUBJECT = {
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

  // 生活テンプレ（画像1〜4をテンプレ化）
  const LIFE_TEMPLATES = {
    mwf: { // 1枚目：月水金（授業＋部活）
      templateKey: "mwf",
      school: "あり",
      club: "あり",
      morningMoveStart: "7:30",
      morningMoveMin: 60,
      classStart: "8:30",
      classEnd: "15:00",
      clubStart: "15:00",
      clubEnd: "18:30",
      returnMoveMode: "60",
      second30Start: "20:00",
      bath: "あり",
      bathMin: 60,
      prep: "あり",
      prepMin: 15,
      sleepUse: "あり",
      sleepTime: "1:00",
      wakeTime: "7:05",
    },
    thf: { // 2枚目：木金（授業あり・部活なし）
      templateKey: "thf",
      school: "あり",
      club: "なし",
      morningMoveStart: "7:30",
      morningMoveMin: 60,
      classStart: "8:30",
      classEnd: "16:00",
      clubStart: "",
      clubEnd: "",
      returnMoveMode: "30x2",
      second30Start: "20:00",
      bath: "あり",
      bathMin: 60,
      prep: "あり",
      prepMin: 15,
      sleepUse: "あり",
      sleepTime: "1:00",
      wakeTime: "7:05",
    },
    sat: { // 3枚目：土曜（部活あり・授業なし）
      templateKey: "sat",
      school: "なし",
      club: "あり",
      morningMoveStart: "7:00",
      morningMoveMin: 60,
      classStart: "",
      classEnd: "",
      clubStart: "8:00",
      clubEnd: "12:30",
      returnMoveMode: "30x2",
      second30Start: "18:15",
      bath: "あり",
      bathMin: 60,
      prep: "なし",
      prepMin: 15,
      sleepUse: "あり",
      sleepTime: "1:00",
      wakeTime: "8:00",
    },
    sun: { // 4枚目：日曜（授業なし・部活なし）※帰りの移動は 30分
      templateKey: "sun",
      school: "なし",
      club: "なし",
      morningMoveStart: "9:00",
      morningMoveMin: 30,
      classStart: "",
      classEnd: "",
      clubStart: "",
      clubEnd: "",
      returnMoveMode: "30",
      second30Start: "18:15",
      bath: "あり",
      bathMin: 60,
      prep: "あり",
      prepMin: 15,
      sleepUse: "あり",
      sleepTime: "1:00",
      wakeTime: "7:05",
    },
  };

  /* ===== State ===== */
  const state = loadState() || {
    view: "timeline", // 初期はタイムライン
    selectedDate: dateKeyFromDate(new Date()),
    lifeByDate: {},
    lifeBlocksByDate: {},
    studyTasksByDate: {},
    progressByTask: {},
    runner: {
      activeTaskId: null,
      isRunning: false,
      lastTick: 0,
      pausedByUser: false,     // UI削除してるが内部で保持
      arrivalShownTaskId: null // 到着ループ防止
    },
    ui: {
      modalOpen: false,
      modalTitle: "",
    }
  };

  /* ===== Root ===== */
  injectCSS();
  const root = document.getElementById("app");
  if (!root) {
    console.error('index.html に <div id="app"></div> が必要です');
    return;
  }

  /* ===== Render Loop ===== */
  let runnerUiTimer = null;
  let tickTimer = null;

  function render() {
    root.innerHTML = "";

    const app = el("div", { class: "app" });

    app.appendChild(renderTopBar());
    app.appendChild(renderTabs());

    const content = el("div", { class: "content" });

    if (state.view === "life") content.appendChild(renderLifeView());
    if (state.view === "study") content.appendChild(renderStudyView());
    if (state.view === "timeline") content.appendChild(renderTimelineView());

    app.appendChild(content);
    app.appendChild(renderModalLayer());

    root.appendChild(app);

    // RunnerのUIタイマー（モーダルが開いていなくても残りが動くように）
    if (runnerUiTimer) { clearInterval(runnerUiTimer); runnerUiTimer = null; }
    runnerUiTimer = setInterval(() => {
      // TOPの残り時間を更新するために軽く再描画（重くしないため部分更新）
      updateTopBarDynamic();
      // モーダルが開いている場合は runner の残りも更新
      const runnerPane = document.querySelector("[data-runner-pane='1']");
      if (runnerPane) {
        const taskId = runnerPane.getAttribute("data-taskid");
        if (taskId) updateRunnerPane(taskId);
      }
    }, 250);
  }

  /* ===== Top Bar ===== */
  function renderTopBar() {
    const bar = el("div", { class: "topbar" });

    // 左：タイトル
    const left = el("div", { class: "topbarLeft" }, [
      el("div", { class: "brandTitle" }, ["Daily schedule planner"]),
    ]);

    // 中：勉強の残り（今いるブロックの終了まで）
    const mid = el("div", { class: "topbarMid", id: "topRemainWrap" });

    // 右：現在時刻 / NOW
    const right = el("div", { class: "topbarRight" }, [
      el("div", { class: "clock", id: "topClock" }, [fmtHM(new Date())]),
      mkBtn("NOW", "btnGhost", () => scrollToNow()),
    ]);

    bar.appendChild(left);
    bar.appendChild(mid);
    bar.appendChild(right);

    // 初回描画
    setTimeout(updateTopBarDynamic, 0);

    return bar;
  }

  function updateTopBarDynamic() {
    const clock = document.getElementById("topClock");
    if (clock) clock.textContent = fmtHM(new Date());

    const wrap = document.getElementById("topRemainWrap");
    if (!wrap) return;

    // NOWから今のブロック終了まで（勉強以外でも表示はするが、勉強なら科目も出す）
    const nowBlock = getNowBlockFromTimelineCache();
    const remainSec = getRemainSecToCurrentBlockEnd();

    wrap.innerHTML = "";
    if (!nowBlock || remainSec == null) {
      wrap.appendChild(el("div", { class: "remainPill", style: "opacity:.55" }, [
        el("div", { class: "remainSub" }, ["—"]),
        el("div", { class: "remainBig" }, ["—:—"]),
      ]));
      return;
    }

    const isStudy = nowBlock.kind === "study";
    const label = isStudy ? (nowBlock.subject || "勉強") : (nowBlock.title || "生活");
    wrap.appendChild(el("div", { class: "remainPill" }, [
      el("div", { class: "remainSub" }, [label]),
      el("div", { class: "remainBig" }, [fmtMS(remainSec)]),
    ]));
  }

  /* ===== Tabs ===== */
  function renderTabs() {
    const tabs = el("div", { class: "tabs" });

    const mkTab = (key, label) => {
      const b = el("button", { class: "tab" + (state.view === key ? " isActive" : ""), type: "button" }, [label]);
      b.addEventListener("click", () => {
        state.view = key;
        saveState();
        render();
        // タイムラインに移動したらNOWへ
        if (key === "timeline") setTimeout(scrollToNow, 30);
      });
      return b;
    };

    tabs.appendChild(mkTab("life", "生活"));
    tabs.appendChild(mkTab("study", "勉強"));
    tabs.appendChild(mkTab("timeline", "タイムライン"));

    return tabs;
  }

  /* =========================================================
     LIFE VIEW
     ========================================================= */
  function renderLifeView() {
    const wrap = el("div", { class: "panel" });

    const dateRow = renderDateRow();
    wrap.appendChild(dateRow);

    const L = getLifeSettings(state.selectedDate);

    // 生活設定パネル
    const box = el("div", { class: "card" });
    box.appendChild(el("div", { class: "cardTitle" }, ["この日の生活設定"]));

    // テンプレ
    const tplRow = el("div", { class: "grid2" });
    const tplSel = mkSelect([
      { value: "", label: "テンプレを選択" },
      { value: "mwf", label: "月水金（授業＋部活）" },
      { value: "thf", label: "木金（授業のみ）" },
      { value: "sat", label: "土曜（部活のみ）" },
      { value: "sun", label: "日曜（なし）" },
    ], L.templateKey || "");
    tplSel.addEventListener("change", () => {
      const k = tplSel.value;
      if (!k) return;
      applyLifeTemplate(state.selectedDate, k);
      render();
    });
    tplRow.appendChild(labeled("テンプレ", tplSel));
    tplRow.appendChild(el("div", { class: "mutedSmall" }, ["テンプレはこの日の設定に反映されます。"]));
    box.appendChild(tplRow);

    // 授業・部活の有無
    const onOffRow = el("div", { class: "grid2" });
    const schoolSel = mkSelect([{ value: "あり", label: "あり" }, { value: "なし", label: "なし" }], L.school);
    const clubSel = mkSelect([{ value: "あり", label: "あり" }, { value: "なし", label: "なし" }], L.club);

    schoolSel.addEventListener("change", () => { L.school = schoolSel.value; saveState(); render(); });
    clubSel.addEventListener("change", () => { L.club = clubSel.value; saveState(); render(); });

    onOffRow.appendChild(labeled("授業", schoolSel));
    onOffRow.appendChild(labeled("部活", clubSel));
    box.appendChild(onOffRow);

    // 授業/部活が「あり」のときだけ細目表示
    const showMorning = (L.school === "あり" || L.club === "あり");
    if (showMorning) {
      const g = el("div", { class: "grid2" });

      const morningStartSel = mkTimeSelect(L.morningMoveStart || "7:30");
      const morningMin = mkNumber(L.morningMoveMin ?? 60, 0, 240, 5);
      morningStartSel.addEventListener("change", () => { L.morningMoveStart = morningStartSel.value; saveState(); });
      morningMin.addEventListener("change", () => { L.morningMoveMin = clampInt(morningMin.value, 0, 240); saveState(); });

      g.appendChild(labeled("朝の移動 開始", morningStartSel));
      g.appendChild(labeled("朝の移動（分）", morningMin));

      // 授業あり
      if (L.school === "あり") {
        const cs = mkTimeSelect(L.classStart || "8:30");
        const ce = mkTimeSelect(L.classEnd || "15:00");
        cs.addEventListener("change", () => { L.classStart = cs.value; saveState(); });
        ce.addEventListener("change", () => { L.classEnd = ce.value; saveState(); });
        g.appendChild(labeled("授業 開始", cs));
        g.appendChild(labeled("授業 終了", ce));
      } else {
        g.appendChild(labeled("授業 開始", mkTimeSelect("")));
        g.appendChild(labeled("授業 終了", mkTimeSelect("")));
      }

      // 部活あり
      if (L.club === "あり") {
        const ss = mkTimeSelect(L.clubStart || "15:00");
        const se = mkTimeSelect(L.clubEnd || "18:30");
        ss.addEventListener("change", () => { L.clubStart = ss.value; saveState(); });
        se.addEventListener("change", () => { L.clubEnd = se.value; saveState(); });
        g.appendChild(labeled("部活 開始", ss));
        g.appendChild(labeled("部活 終了", se));
      } else {
        g.appendChild(labeled("部活 開始", mkTimeSelect("")));
        g.appendChild(labeled("部活 終了", mkTimeSelect("")));
      }

      // 帰りの移動
      const retSel = mkSelect(RETURN_MOVE_OPTIONS, L.returnMoveMode || "60");
      retSel.addEventListener("change", () => { L.returnMoveMode = retSel.value; saveState(); render(); });

      g.appendChild(labeled("帰りの移動", retSel));

      // 2回目の30分移動開始（30x2のみ）
      if ((L.returnMoveMode || "60") === "30x2") {
        const secondSel = mkSelect(buildSecondMoveStarts(), L.second30Start || "20:00");
        secondSel.addEventListener("change", () => { L.second30Start = secondSel.value; saveState(); });
        g.appendChild(labeled("2回目の30分移動 開始", secondSel));
      } else {
        g.appendChild(labeled("2回目の30分移動 開始", mkSelect(buildSecondMoveStarts(), "")));
      }

      box.appendChild(g);
    }

    // 風呂/準備の有無
    const bathRow = el("div", { class: "grid2 sepTop" });
    const bathSel = mkSelect([{ value: "あり", label: "あり" }, { value: "なし", label: "なし" }], L.bath);
    const bathMin = mkNumber(L.bathMin ?? 60, 0, 180, 5);
    bathSel.addEventListener("change", () => { L.bath = bathSel.value; saveState(); });
    bathMin.addEventListener("change", () => { L.bathMin = clampInt(bathMin.value, 0, 180); saveState(); });
    bathRow.appendChild(labeled("風呂", bathSel));
    bathRow.appendChild(labeled("風呂（分）", bathMin));
    box.appendChild(bathRow);

    const prepRow = el("div", { class: "grid2" });
    const prepSel = mkSelect([{ value: "あり", label: "あり" }, { value: "なし", label: "なし" }], L.prep);
    const prepMin = mkNumber(L.prepMin ?? 15, 0, 60, 5);
    prepSel.addEventListener("change", () => { L.prep = prepSel.value; saveState(); });
    prepMin.addEventListener("change", () => { L.prepMin = clampInt(prepMin.value, 0, 60); saveState(); });
    prepRow.appendChild(labeled("準備", prepSel));
    prepRow.appendChild(labeled("準備（分）", prepMin));
    box.appendChild(prepRow);

    // 就寝（時間）
    const sleepRow = el("div", { class: "grid2 sepTop" });
    const sleepUse = mkSelect([{ value: "あり", label: "あり" }, { value: "なし", label: "なし" }], L.sleepUse);
    sleepUse.addEventListener("change", () => { L.sleepUse = sleepUse.value; saveState(); render(); });
    sleepRow.appendChild(labeled("就寝（この設定を使う）", sleepUse));
    sleepRow.appendChild(el("div", {}, [""]));
    box.appendChild(sleepRow);

    if (L.sleepUse === "あり") {
      const stRow = el("div", { class: "grid2" });
      const st = mkTimeSelect(L.sleepTime || "1:00");
      const wt = mkTimeSelect(L.wakeTime || "7:00");
      st.addEventListener("change", () => { L.sleepTime = st.value; enforceSleepWindow(L); saveState(); render(); });
      wt.addEventListener("change", () => { L.wakeTime = wt.value; enforceSleepWindow(L); saveState(); render(); });
      stRow.appendChild(labeled("就寝時刻", st));
      stRow.appendChild(labeled("起床時刻", wt));
      box.appendChild(stRow);

      const warn = computeSleepWarnText(L);
      if (warn) box.appendChild(el("div", { class: "warn" }, [warn]));
    }

    wrap.appendChild(box);

    // 生活ブロックを追加
    const addBox = el("div", { class: "card" });
    addBox.appendChild(el("div", { class: "cardTitle" }, ["生活ブロックを追加"]));

    const form = el("div", { class: "grid2" });

    const typeSel = mkSelect(LIFE_TYPE_OPTIONS, "-");
    const titleIn = mkInput("内容", "");
    titleIn.placeholder = "例：病院";

    // モード選択：何分間 / 時刻（開始→終了）
    const modeRow = el("div", { class: "modeRow" });
    const modeA = mkRadio("lifeMode", "duration", "何分間", true);
    const modeB = mkRadio("lifeMode", "time", "時刻（開始→終了）", false);
    modeRow.appendChild(modeA.wrap);
    modeRow.appendChild(modeB.wrap);

    // duration inputs
    const startSelA = mkTimeSelect("");
    const minIn = mkNumber("", 1, 600, 5);
    minIn.placeholder = "分";

    // time inputs
    const startSelB = mkTimeSelect("");
    const endSelB = mkTimeSelect("");

    // 自動時間（編集可能）
    typeSel.addEventListener("change", () => {
      const t = typeSel.value;
      if (LIFE_DEFAULT_MIN_BY_TYPE[t] != null) {
        minIn.value = String(LIFE_DEFAULT_MIN_BY_TYPE[t]);
      }
    });

    form.appendChild(labeled("種類", typeSel));
    form.appendChild(labeled("内容", titleIn));

    addBox.appendChild(form);
    addBox.appendChild(modeRow);

    const durGrid = el("div", { class: "grid2" });
    durGrid.appendChild(labeled("開始", startSelA));
    durGrid.appendChild(labeled("分", minIn));
    addBox.appendChild(durGrid);

    const timeGrid = el("div", { class: "grid2" });
    timeGrid.appendChild(labeled("開始", startSelB));
    timeGrid.appendChild(labeled("終了", endSelB));
    addBox.appendChild(timeGrid);

    function syncModeVis() {
      durGrid.style.display = modeA.input.checked ? "grid" : "none";
      timeGrid.style.display = modeB.input.checked ? "grid" : "none";
    }
    modeA.input.addEventListener("change", syncModeVis);
    modeB.input.addEventListener("change", syncModeVis);
    syncModeVis();

    const addBtnRow = el("div", { class: "row" });
    const addBtn = mkBtn("追加", "btnPrimary", () => {
      const type = typeSel.value;
      const title = (titleIn.value || "").trim();
      const display = type === "-" ? (title || "（生活）") : (title ? `${type}：${title}` : type);

      const mode = modeA.input.checked ? "duration" : "time";
      const id = uid();

      if (mode === "duration") {
        if (!startSelA.value) return toast("開始を選んでください");
        const mins = clampInt(minIn.value, 1, 600);
        const start = startSelA.value;
        addLifeBlock(state.selectedDate, { id, type, title: display, mode, start, durationMin: mins });
      } else {
        if (!startSelB.value || !endSelB.value) return toast("開始と終了を選んでください");
        addLifeBlock(state.selectedDate, { id, type, title: display, mode, start: startSelB.value, end: endSelB.value });
      }

      // 入力リセット（種類は - に戻す）
      typeSel.value = "-";
      titleIn.value = "";
      startSelA.value = "";
      minIn.value = "";
      startSelB.value = "";
      endSelB.value = "";
      saveState();
      render();
    });

    const clearBtn = mkBtn("この日の生活を全消去", "btnGhost", () => {
      clearDayLife(state.selectedDate);
      saveState();
      render();
    });

    addBtnRow.appendChild(addBtn);
    addBtnRow.appendChild(clearBtn);
    addBox.appendChild(addBtnRow);

    // この日の生活一覧（削除のみ）
    const list = renderLifeBlocksList();
    addBox.appendChild(list);

    wrap.appendChild(addBox);

    return wrap;
  }

  function renderLifeBlocksList() {
    const blocks = getLifeBlocks(state.selectedDate);

    const box = el("div", { class: "listBox" });
    if (!blocks.length) {
      box.appendChild(el("div", { class: "muted" }, ["（追加した生活ブロックはありません）"]));
      return box;
    }
    blocks.forEach(b => {
      const row = el("div", { class: "listRow" });
      row.appendChild(el("div", { class: "listMain" }, [
        el("div", { class: "listTitle" }, [b.title]),
        el("div", { class: "listSub" }, [formatLifeBlockTime(b)]),
      ]));

      const del = mkBtn("✕", "btnX", () => {
        removeLifeBlock(state.selectedDate, b.id);
        saveState();
        render();
      });
      row.appendChild(del);

      // 生活は「タッチで編集しない」仕様：タップしても何もしない
      box.appendChild(row);
    });
    return box;
  }

  function formatLifeBlockTime(b) {
    if (b.mode === "time") return `${b.start} - ${b.end}`;
    if (b.mode === "duration") return `${b.start} - ${addMinHM(b.start, b.durationMin)}`;
    return "";
  }

  /* =========================================================
     STUDY VIEW
     ========================================================= */
  function renderStudyView() {
    const wrap = el("div", { class: "panel" });

    wrap.appendChild(renderDateRow());

    // この日の勉強リスト（編集・削除・並び替え）
    const listCard = el("div", { class: "card" });
    listCard.appendChild(el("div", { class: "cardTitle" }, ["この日の勉強リスト"]));

    const tasks = getStudyTasks(state.selectedDate);

    if (!tasks.length) {
      listCard.appendChild(el("div", { class: "muted" }, ["（勉強タスクはまだありません）"]));
    } else {
      const list = el("div", { class: "listBox" });

      tasks.forEach((t, idx) => {
        const sys = systemByKey(t.system);
        const row = el("div", { class: "listRow studyRow" });

        const pill = el("div", { class: "sysPill", style: `background:${sys.color}` }, [t.subject || "勉強"]);
        const title = `${t.taskType || "—"}${t.note ? `｜${t.note}` : ""}`;
        const ranges = (t.ranges || []).length ? `範囲 ${renderRangeSummary(t.ranges)}` : "範囲 —";
        const dur = estimateStudyMin(t);

        row.appendChild(el("div", { class: "listMain" }, [
          el("div", { class: "rowTight" }, [
            pill,
            el("div", { class: "listTitle" }, [title]),
            el("div", { class: "rightTag" }, [`${dur}分`]),
          ]),
          el("div", { class: "listSub" }, [ranges]),
        ]));

        // 並び替え
        const up = mkBtn("▲", "btnTiny", () => moveStudyTask(state.selectedDate, idx, -1));
        const dn = mkBtn("▼", "btnTiny", () => moveStudyTask(state.selectedDate, idx, +1));
        const del = mkBtn("✕", "btnX", () => {
          removeStudyTask(state.selectedDate, t.id);
          saveState();
          render();
        });

        const right = el("div", { class: "listRight" }, [up, dn, del]);
        row.appendChild(right);

        // 勉強はタップで編集
        row.addEventListener("click", (e) => {
          // ボタン押下は除外
          if (e.target && e.target.closest("button")) return;
          openStudyTaskEditor(t.id);
        });

        list.appendChild(row);
      });

      listCard.appendChild(list);
    }

    wrap.appendChild(listCard);

    // 自動で組み立て（リストの下）
    const autoCard = el("div", { class: "card" });
    autoCard.appendChild(el("div", { class: "cardTitle" }, ["自動で組み立て"]));
    autoCard.appendChild(el("div", { class: "mutedSmall" }, ["生活設定の空き時間に、上から順に勉強を入れます（入り切らない場合は最後を入れません）。"]));
    autoCard.appendChild(el("div", { class: "row" }, [
      mkBtn("この日の予定を更新", "btnPrimary", () => {
        // 予定を更新＝タイムライン再計算（実体は動的生成だが、NOWキャッシュ更新のためレンダー）
        // ※ここで確認などは出さない
        toast("更新しました");
        saveState();
        render();
      }),
    ]));
    wrap.appendChild(autoCard);

    // 勉強タスク追加フォーム
    const addCard = el("div", { class: "card" });
    addCard.appendChild(el("div", { class: "cardTitle" }, ["勉強タスクを追加"]));

    const form = el("div", { class: "grid2" });

    // 系 → 科目 → 内容
    const sysSel = mkSelect(STUDY_SYSTEMS.map(s => ({ value: s.key, label: s.label })), "kokugo");
    const subjSel = mkSelect(subjectOptionsForSystem("kokugo"), "論国");
    const typeSel = mkSelect(taskTypeOptionsForSubject("論国"), "");

    const otherSubjInput = mkInput("その他の科目名", "");
    otherSubjInput.placeholder = "例：情報、保健、探究…";
    otherSubjInput.style.display = "none";

    const noteIn = mkInput("メモ（任意）", "");
    noteIn.placeholder = "例：チャート / ノートまとめ";

    const durIn = mkNumber("30", 1, 600, 5);
    const perRangeIn = mkNumber("", 1, 120, 1);
    perRangeIn.placeholder = "未指定なら「分数」を使う";

    sysSel.addEventListener("change", () => {
      const sys = sysSel.value;
      // 科目更新
      subjSel.innerHTML = "";
      subjectOptionsForSystem(sys).forEach(o => subjSel.appendChild(mkOption(o.value, o.label)));
      subjSel.value = subjectOptionsForSystem(sys)[0]?.value || "";
      // その他欄
      otherSubjInput.style.display = (sys === "other") ? "block" : "none";
      if (sys === "other") otherSubjInput.value = "";

      // 内容更新
      refreshTaskTypes();
    });

    subjSel.addEventListener("change", refreshTaskTypes);

    function refreshTaskTypes() {
      const sys = sysSel.value;
      const subj = subjSel.value;
      const actualSubj = (sys === "other") ? "その他" : subj;

      typeSel.innerHTML = "";
      taskTypeOptionsForSubject(actualSubj).forEach(o => typeSel.appendChild(mkOption(o.value, o.label)));
      typeSel.value = taskTypeOptionsForSubject(actualSubj)[0]?.value || "";
    }

    form.appendChild(labeled("系", sysSel));
    form.appendChild(labeled("科目", subjSel));

    // その他の科目名は「その他系」のときだけ表示
    const otherWrap = labeled("その他の科目名", otherSubjInput);
    otherWrap.style.gridColumn = "1 / -1";
    addCard.appendChild(form);
    addCard.appendChild(otherWrap);

    const form2 = el("div", { class: "grid2" });
    form2.appendChild(labeled("内容", typeSel));
    form2.appendChild(labeled("分数", durIn));
    addCard.appendChild(form2);

    const form3 = el("div", { class: "grid2" });
    form3.appendChild(labeled("1範囲あたり（分）", perRangeIn));
    form3.appendChild(labeled("メモ（任意）", noteIn));
    addCard.appendChild(form3);

    // 範囲（開始/終了を上下）
    const rangesBox = el("div", { class: "rangesBox" });
    rangesBox.appendChild(el("div", { class: "rangesTitle" }, ["範囲"]));

    const rangesList = el("div", { class: "rangesList", id: "rangesList" });
    rangesBox.appendChild(rangesList);

    function addRangeRow(startVal = "", endVal = "") {
      const row = el("div", { class: "rangeRow" });

      const start = mkInput("開始", startVal);
      const end = mkInput("終了", endVal);

      start.placeholder = "開始";
      end.placeholder = "終了";

      const del = mkBtn("✕", "btnX", () => {
        row.remove();
      });

      const stack = el("div", { class: "rangeStack" }, [
        labeledInline("開始", start),
        labeledInline("終了", end),
      ]);

      row.appendChild(stack);
      row.appendChild(del);
      rangesList.appendChild(row);
    }

    addRangeRow();

    rangesBox.appendChild(el("div", { class: "row" }, [
      mkBtn("範囲を追加", "btnGhost", () => addRangeRow()),
    ]));

    addCard.appendChild(rangesBox);

    // 追加ボタン
    addCard.appendChild(el("div", { class: "row" }, [
      mkBtn("追加", "btnPrimary", () => {
        const system = sysSel.value;
        const subject = (system === "other") ? "その他" : subjSel.value;
        const otherName = (system === "other") ? (otherSubjInput.value || "").trim() : "";
        const taskType = typeSel.value;

        const durationMin = clampInt(durIn.value, 1, 600);
        const perRangeMin = perRangeIn.value ? clampInt(perRangeIn.value, 1, 120) : null;

        const ranges = [];
        Array.from(rangesList.querySelectorAll(".rangeRow")).forEach(r => {
          const ins = r.querySelectorAll("input");
          if (!ins || ins.length < 2) return;
          const s = (ins[0].value || "").trim();
          const e = (ins[1].value || "").trim();
          if (!s && !e) return;
          ranges.push({ start: s, end: e });
        });

        const id = uid();
        const t = {
          id,
          system,
          subject: (system === "other" && otherName) ? otherName : subject,
          taskType,
          note: (noteIn.value || "").trim(),
          durationMin,
          perRangeMin,
          ranges,
          createdAt: Date.now(),
        };

        addStudyTask(state.selectedDate, t);
        saveState();
        render();
      }),
    ]));

    wrap.appendChild(addCard);

    return wrap;
  }

  function openStudyTaskEditor(taskId) {
    const t = findStudyTaskById(state.selectedDate, taskId);
    if (!t) return;

    const body = el("div", { class: "modalBodyScroll" });

    body.appendChild(el("div", { class: "mutedSmall" }, ["勉強タスクは編集できます。生活タスクは編集しません。"]));

    const sysSel = mkSelect(STUDY_SYSTEMS.map(s => ({ value: s.key, label: s.label })), t.system);
    const subjSel = mkSelect(subjectOptionsForSystem(t.system), pickDefaultSubject(t.system, t.subject));
    const typeSel = mkSelect(taskTypeOptionsForSubject(subjSel.value), t.taskType || "");

    const otherSubjInput = mkInput("その他の科目名", (t.system === "other") ? (t.subject || "") : "");
    otherSubjInput.style.display = (t.system === "other") ? "block" : "none";

    const durIn = mkNumber(String(t.durationMin || 30), 1, 600, 5);
    const perRangeIn = mkNumber(t.perRangeMin ? String(t.perRangeMin) : "", 1, 120, 1);
    perRangeIn.placeholder = "未指定なら「分数」を使う";

    const noteIn = mkInput("メモ（任意）", t.note || "");

    sysSel.addEventListener("change", () => {
      subjSel.innerHTML = "";
      subjectOptionsForSystem(sysSel.value).forEach(o => subjSel.appendChild(mkOption(o.value, o.label)));
      subjSel.value = subjectOptionsForSystem(sysSel.value)[0]?.value || "";
      otherSubjInput.style.display = (sysSel.value === "other") ? "block" : "none";
      refreshTypes();
    });
    subjSel.addEventListener("change", refreshTypes);

    function refreshTypes() {
      const subj = subjSel.value;
      typeSel.innerHTML = "";
      taskTypeOptionsForSubject(subj).forEach(o => typeSel.appendChild(mkOption(o.value, o.label)));
      if (taskTypeOptionsForSubject(subj).some(o => o.value === t.taskType)) typeSel.value = t.taskType;
      else typeSel.value = taskTypeOptionsForSubject(subj)[0]?.value || "";
    }

    body.appendChild(el("div", { class: "grid2" }, [
      labeled("系", sysSel),
      labeled("科目", subjSel),
    ]));
    body.appendChild(labeled("その他の科目名", otherSubjInput));
    body.appendChild(el("div", { class: "grid2" }, [
      labeled("内容", typeSel),
      labeled("分数", durIn),
    ]));
    body.appendChild(el("div", { class: "grid2" }, [
      labeled("1範囲あたり（分）", perRangeIn),
      labeled("メモ（任意）", noteIn),
    ]));

    // 範囲編集
    const rangesBox = el("div", { class: "rangesBox" });
    rangesBox.appendChild(el("div", { class: "rangesTitle" }, ["範囲"]));
    const rangesList = el("div", { class: "rangesList" });

    function addRangeRow(startVal = "", endVal = "") {
      const row = el("div", { class: "rangeRow" });
      const start = mkInput("開始", startVal);
      const end = mkInput("終了", endVal);
      const del = mkBtn("✕", "btnX", () => row.remove());
      const stack = el("div", { class: "rangeStack" }, [
        labeledInline("開始", start),
        labeledInline("終了", end),
      ]);
      row.appendChild(stack);
      row.appendChild(del);
      rangesList.appendChild(row);
    }

    (t.ranges || []).forEach(r => addRangeRow(r.start || "", r.end || ""));
    if (!(t.ranges || []).length) addRangeRow();

    rangesBox.appendChild(rangesList);
    rangesBox.appendChild(el("div", { class: "row" }, [
      mkBtn("範囲を追加", "btnGhost", () => addRangeRow()),
    ]));
    body.appendChild(rangesBox);

    openModal("編集", body, [
      mkBtn("キャンセル", "btnGhost", closeModal),
      mkBtn("保存", "btnPrimary", () => {
        t.system = sysSel.value;
        const subj = subjSel.value;
        t.subject = (t.system === "other")
          ? ((otherSubjInput.value || "").trim() || "その他")
          : subj;

        t.taskType = typeSel.value;
        t.durationMin = clampInt(durIn.value, 1, 600);
        t.perRangeMin = perRangeIn.value ? clampInt(perRangeIn.value, 1, 120) : null;
        t.note = (noteIn.value || "").trim();

        // ranges
        const ranges = [];
        Array.from(rangesList.querySelectorAll(".rangeRow")).forEach(r => {
          const ins = r.querySelectorAll("input");
          if (!ins || ins.length < 2) return;
          const s = (ins[0].value || "").trim();
          const e = (ins[1].value || "").trim();
          if (!s && !e) return;
          ranges.push({ start: s, end: e });
        });
        t.ranges = ranges;

        saveState();
        closeModal();
        render();
      }),
    ]);
  }

  /* =========================================================
     TIMELINE VIEW
     ========================================================= */
  function renderTimelineView() {
    const wrap = el("div", { class: "panel" });

    // 日付行（タイムラインは表示日を変えられる）
    wrap.appendChild(renderDateRow());

    // タイムライン本体：前日・当日・翌日を表示（連続）
    const days = [
      addDaysToKey(state.selectedDate, -1),
      state.selectedDate,
      addDaysToKey(state.selectedDate, +1),
    ];

    const timeline = el("div", { class: "timeline", id: "timelineRoot" });

    // キャッシュ生成（NOW検出・残り時間計算に使う）
    const blocks = buildTimelineBlocksForDays(days);
    // グローバルキャッシュ（TOP・NOWスクロールで参照）
    state.__timelineCache = { days, blocks, builtAt: Date.now() };

    days.forEach((k) => {
      const dayStart = dateKeyToDate(k);

      const day = el("div", { class: "daySection", "data-day": k });

      const label = el("div", { class: "dayLabel" }, [
        el("div", { class: "dayDate" }, [fmtMD(dayStart)]),
        el("div", { class: "dayWday" }, [WEEKDAYS[dayStart.getDay()]]),
      ]);

      const lane = el("div", { class: "dayLane" });
      lane.style.height = `${24 * 60 * PX_PER_MIN}px`;

      // 時刻目盛（見えなくならないように）
      const ticks = el("div", { class: "ticks" });
      for (let h = 0; h <= 24; h++) {
        const top = h * 60 * PX_PER_MIN;
        const t = el("div", { class: "tick", style: `top:${top}px` }, [
          el("div", { class: "tickLabel" }, [h === 24 ? "24:00" : String(h).padStart(2, "0") + ":00"]),
          el("div", { class: "tickLine" }, [""]),
        ]);
        ticks.appendChild(t);
      }
      lane.appendChild(ticks);

      // この日のブロック（開始がこの日のものを描画。日またぎは高さで伸ばす）
      blocks.filter(b => sameDay(new Date(b.startTs), dayStart)).forEach(b => {
        const card = renderTimelineBlockCard(b);
        // 絶対分 → day内分
        const startMin = minutesSinceDayStart(dayStart, new Date(b.startTs));
        const durMin = Math.max(1, Math.round((b.endTs - b.startTs) / 60000));
        const top = startMin * PX_PER_MIN;

        let height = durMin * PX_PER_MIN;
        if (height < MIN_BLOCK_PX) height = MIN_BLOCK_PX;

        card.style.top = `${top}px`;
        card.style.height = `${height}px`;
        lane.appendChild(card);
      });

      // NOWライン（当日）
      if (k === dateKeyFromDate(new Date())) {
        const now = new Date();
        const nowMin = minutesSinceDayStart(dayStart, now);
        if (nowMin >= 0 && nowMin < 24 * 60) {
          const nowLine = el("div", { class: "nowLine", id: "nowLine" });
          nowLine.style.top = `${nowMin * PX_PER_MIN}px`;
          lane.appendChild(nowLine);
        }
      }

      day.appendChild(label);
      day.appendChild(lane);
      timeline.appendChild(day);
    });

    wrap.appendChild(timeline);

    // 初期はNOWにいる
    setTimeout(scrollToNow, 50);

    return wrap;
  }

  function renderTimelineBlockCard(b) {
    const sys = b.kind === "study" ? systemByKey(b.system) : null;
    const color = b.kind === "study" ? sys.color : "rgba(255,255,255,.14)";

    const title = (b.kind === "study")
      ? `${b.subject || "勉強"}｜${b.taskType || "—"}`
      : (b.title || "生活");

    const time = `${fmtHM(new Date(b.startTs))} - ${fmtHM(new Date(b.endTs))}`;

    const card = el("div", { class: "blockCard", style: `border-left:6px solid ${color}` });
    card.appendChild(el("div", { class: "blockTime" }, [time]));
    card.appendChild(el("div", { class: "blockTitle" }, [title]));

    // 短時間は本文が潰れるので補助
    if (b.kind === "study" && b.ranges && b.ranges.length) {
      card.appendChild(el("div", { class: "blockSub" }, [`範囲 ${renderRangeSummary(b.ranges)}`]));
    } else {
      card.appendChild(el("div", { class: "blockSub" }, [b.kind === "study" ? "（タップで実行）" : "（タップで確認）"]));
    }

    // タップ動作
    card.addEventListener("click", () => {
      if (b.kind === "study") {
        openRunner(b.taskId);
      } else {
        openLifeInfoModal();
      }
    });

    return card;
  }

  function openLifeInfoModal() {
    // 生活は編集しない。確認だけ。
    const L = getLifeSettings(state.selectedDate);
    const body = el("div", { class: "modalBodyScroll" });

    body.appendChild(el("div", { class: "mutedSmall" }, ["この日の生活設定（確認）"]));
    body.appendChild(el("div", { class: "infoGrid" }, [
      infoRow("授業", L.school),
      infoRow("部活", L.club),
      infoRow("朝の移動", (L.school === "あり" || L.club === "あり") ? `${L.morningMoveStart} / ${L.morningMoveMin}分` : "—"),
      infoRow("授業", L.school === "あり" ? `${L.classStart} - ${L.classEnd}` : "—"),
      infoRow("部活", L.club === "あり" ? `${L.clubStart} - ${L.clubEnd}` : "—"),
      infoRow("帰りの移動", (L.school === "あり" || L.club === "あり") ? formatReturnMoveLabel(L.returnMoveMode) : "—"),
      infoRow("風呂", L.bath === "あり" ? `${L.bathMin}分` : "なし"),
      infoRow("準備", L.prep === "あり" ? `${L.prepMin}分` : "なし"),
      infoRow("就寝", L.sleepUse === "あり" ? `${L.sleepTime} → ${L.wakeTime}` : "なし"),
    ]));

    openModal("確認", body, [mkBtn("OK", "btnPrimary", closeModal)]);
  }

  function infoRow(k, v) {
    return el("div", { class: "infoRow" }, [
      el("div", { class: "infoKey" }, [k]),
      el("div", { class: "infoVal" }, [String(v ?? "—")]),
    ]);
  }

  /* =========================================================
     Runner / Progress  （開始ボタンなし）
     ========================================================= */
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
    return clampInt(task.durationMin ?? 30, 1, 2000) * 60;
  }

  function countDone(doneSteps) {
    return (doneSteps || []).reduce((a, b) => a + (b ? 1 : 0), 0);
  }

  function isTaskComplete(taskId) {
    const t = findStudyTaskById(state.selectedDate, taskId) || findStudyTaskAnyDate(taskId);
    if (!t) return false;
    const steps = getTaskSteps(t);
    const p = ensureProgress(taskId, steps.length);
    const totalSec = computeTotalSec(t);
    const doneAll = (countDone(p.doneSteps) === steps.length);
    const spentAll = ((p.spentSec || 0) >= totalSec);
    return doneAll || spentAll;
  }

  function runnerStart(taskId, auto = false) {
    if (!taskId) return;
    // 到着抑止フラグは開始時に解除
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

  function openArrivalDialog(taskId) {
    // ループ防止
    state.runner.arrivalShownTaskId = taskId;
    state.runner.activeTaskId = null;
    state.runner.isRunning = false;
    state.runner.lastTick = 0;
    state.runner.pausedByUser = false;
    saveState();

    const t = findStudyTaskAnyDate(taskId);
    const name = t ? `${t.subject}｜${t.taskType}` : "完了";

    const body = el("div", { class: "modalBodyScroll" });
    body.appendChild(el("div", { class: "arrivalBig" }, ["到着"]));
    body.appendChild(el("div", { class: "arrivalSub" }, [name]));

    openModal("到着", body, [mkBtn("OK", "btnPrimary", closeModal)]);
  }

  function openRunner(taskId) {
    const t = findStudyTaskAnyDate(taskId);
    if (!t) return;

    const steps = getTaskSteps(t);
    const p = ensureProgress(taskId, steps.length);
    const totalSec = computeTotalSec(t);

    const body = el("div", { class: "modalBodyScroll", "data-runner-pane": "1", "data-taskid": taskId });
    body.appendChild(el("div", { class: "runnerTitle" }, [`${t.subject}｜${t.taskType}`]));

    const timeBox = el("div", { class: "runnerTimeBox" }, [
      el("div", { class: "runnerTimeBig", id: "runnerRemainBig" }, ["—:—"]),
      el("div", { class: "runnerTimeSmall", id: "runnerRemainSmall" }, ["—"]),
    ]);

    const prog = el("div", { class: "runnerProg", id: "runnerProg" }, ["—"]);

    const btnAll = mkBtn("全部完了", "btnPrimary", () => {
      for (let i = 0; i < p.doneSteps.length; i++) p.doneSteps[i] = true;
      p.spentSec = Math.max(p.spentSec, totalSec);
      state.progressByTask[taskId] = p;
      saveState();
      runnerStop(false);
      updateRunnerPane(taskId);
      openArrivalDialog(taskId);
    });

    const stepsBox = el("div", { class: "stepsBox", id: "runnerStepsBox" });

    steps.forEach((label, i) => {
      const b = el("button", { class: "stepBtn", type: "button" }, [
        el("span", { class: "stepLeft" }, [label]),
        el("span", { class: "stepRight" }, [""]),
      ]);

      b.addEventListener("click", () => {
        p.doneSteps[i] = !p.doneSteps[i];
        state.progressByTask[taskId] = p;
        saveState();
        updateRunnerPane(taskId);

        if (countDone(p.doneSteps) === steps.length) {
          runnerStop(false);
          openArrivalDialog(taskId);
        }
      });

      stepsBox.appendChild(b);
    });

    body.appendChild(timeBox);
    body.appendChild(prog);
    body.appendChild(btnAll);
    body.appendChild(stepsBox);

    openModal("実行", body, [
      mkBtn("閉じる", "btnGhost", closeModal),
    ]);

    // 初回表示更新
    updateRunnerPane(taskId);
  }

  function updateRunnerPane(taskId) {
    const t = findStudyTaskAnyDate(taskId);
    if (!t) return;

    const steps = getTaskSteps(t);
    const p = ensureProgress(taskId, steps.length);
    const totalSec = computeTotalSec(t);

    const done = countDone(p.doneSteps);
    const remainSec = Math.max(0, totalSec - (p.spentSec || 0));

    const big = document.getElementById("runnerRemainBig");
    const small = document.getElementById("runnerRemainSmall");
    const prog = document.getElementById("runnerProg");
    const stepsBox = document.getElementById("runnerStepsBox");

    if (big) big.textContent = fmtMS(remainSec);
    if (small) small.textContent = `残り ${Math.ceil(remainSec / 60)}分`;
    if (prog) prog.textContent = `${done}/${steps.length}`;

    if (stepsBox) {
      const btns = stepsBox.querySelectorAll(".stepBtn");
      btns.forEach((b, i) => {
        const doneOne = !!p.doneSteps[i];
        b.classList.toggle("isDone", doneOne);
        const right = b.querySelector(".stepRight");
        if (right) right.textContent = doneOne ? "完了" : "";
      });
    }
  }

  /* =========================================================
     Timeline blocks builder
     - 生活設定 + 生活ブロック + 勉強タスク（空き時間へ）
     ========================================================= */
  function buildTimelineBlocksForDays(dayKeys) {
    let blocks = [];

    // 生活：固定（授業/部活/移動/風呂/準備/就寝）＋追加ブロック
    dayKeys.forEach(k => {
      blocks = blocks.concat(buildLifeBlocksForDay(k));
      blocks = blocks.concat(buildCustomLifeBlocksForDay(k));
    });

    // 勉強：その日ごとに、生活の空きへ埋める（授業前には入れない）
    dayKeys.forEach(k => {
      blocks = blocks.concat(buildStudyBlocksForDay(k, blocks));
    });

    // 同一タスクが連続している場合は結合（途中に生活が挟まれない限り）
    blocks = mergeAdjacentSameBlocks(blocks);

    // ソート
    blocks.sort((a, b) => a.startTs - b.startTs);

    // 重複チェック（軽く）
    // 表示上は重複を避けたいので、重複分を落とす
    blocks = dropOverlaps(blocks);

    return blocks;
  }

  function buildLifeBlocksForDay(dateKey) {
    const L = getLifeSettings(dateKey);
    const day0 = dateKeyToDate(dateKey).getTime();

    const blocks = [];
    const add = (title, startMinAbs, endMinAbs) => {
      if (!Number.isFinite(startMinAbs) || !Number.isFinite(endMinAbs)) return;
      if (endMinAbs <= startMinAbs) return;
      blocks.push({
        kind: "life",
        title,
        startTs: day0 + startMinAbs * 60000,
        endTs: day0 + endMinAbs * 60000,
      });
    };

    // 就寝（時間）— 起床は表示しない（ブロックの end で表現）
    // 「就寝時刻が1:00」のように日付変更後の場合は翌日の1:00扱い
    // 起床は就寝から9h以内に補正
    const sleep = computeSleepAbsWindow(L);
    // sleep.startAbsMin/sleep.endAbsMin は day0 を基準とした「絶対分」（0〜2880）
    // 例：就寝 23:00 => start=1380, end=1380+??（翌日分）
    // 例：就寝 1:00 => start=1440+60
    // 起床は end にするが、表示は「就寝」のみ
    // ※タイムラインで "23:00-1:00" 表示したいので end を持つ
    if (L.sleepUse === "あり" && sleep) {
      add("就寝", sleep.startAbsMin, sleep.endAbsMin);
    }

    const hasSchool = (L.school === "あり");
    const hasClub = (L.club === "あり");
    const hasDay = (hasSchool || hasClub);

    // 朝の移動
    if (hasDay && L.morningMoveStart) {
      const s = timeStrToMin(L.morningMoveStart);
      const e = s + clampInt(L.morningMoveMin ?? 0, 0, 240);
      add("移動", s, e);
    }

    // 授業
    if (hasSchool && L.classStart && L.classEnd) {
      const s = timeStrToMin(L.classStart);
      const e = timeStrToMin(L.classEnd);
      add("授業", s, e);
    }

    // 部活
    if (hasClub && L.clubStart && L.clubEnd) {
      const s = timeStrToMin(L.clubStart);
      const e = timeStrToMin(L.clubEnd);
      add("部活", s, e);
    }

    // 帰りの移動
    if (hasDay) {
      // 帰り開始＝授業 or 部活の終了のうち後
      const endCandidates = [];
      if (hasSchool && L.classEnd) endCandidates.push(timeStrToMin(L.classEnd));
      if (hasClub && L.clubEnd) endCandidates.push(timeStrToMin(L.clubEnd));
      const backStart = endCandidates.length ? Math.max(...endCandidates) : null;

      if (backStart != null) {
        const mode = L.returnMoveMode || "60";
        if (mode === "60") {
          add("移動", backStart, backStart + 60);
        } else if (mode === "30") {
          add("移動", backStart, backStart + 30);
        } else if (mode === "30x2") {
          // 1回目の30分移動
          add("移動", backStart, backStart + 30);
          // 2回目は、指定時刻から30分
          const t2 = L.second30Start ? timeStrToMin(L.second30Start) : null;
          if (t2 != null) add("移動", t2, t2 + 30);
          // 2回目の後に食事30分（固定）
          if (t2 != null) add("食事", t2 + 30, t2 + 60);
        }
      }
    }

    // 風呂 → 準備 → 就寝 の順番を固定（就寝の直前に置く）
    // ※就寝が設定されていない場合は「置かない」
    if (L.sleepUse === "あり" && sleep) {
      const bathMin = (L.bath === "あり") ? clampInt(L.bathMin ?? 60, 0, 180) : 0;
      const prepMin = (L.prep === "あり") ? clampInt(L.prepMin ?? 15, 0, 60) : 0;

      // 就寝開始の直前に配置
      const prepEnd = sleep.startAbsMin;
      const prepStart = prepEnd - prepMin;
      const bathEnd = prepStart;
      const bathStart = bathEnd - bathMin;

      // 0未満は切る（ただし意味が崩れるので、その場合は表示しない）
      if (bathMin > 0 && bathStart >= 0) add("風呂", bathStart, bathEnd);
      if (prepMin > 0 && prepStart >= 0) add("準備", prepStart, prepEnd);
    }

    return blocks;
  }

  function buildCustomLifeBlocksForDay(dateKey) {
    const blocks = [];
    const list = getLifeBlocks(dateKey);
    const day0 = dateKeyToDate(dateKey).getTime();

    list.forEach(b => {
      const title = b.title || "生活";
      if (b.mode === "time" && b.start && b.end) {
        const s = timeStrToMin(b.start);
        const e = timeStrToMin(b.end);
        if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
          blocks.push({ kind: "life", title, startTs: day0 + s * 60000, endTs: day0 + e * 60000 });
        }
      }
      if (b.mode === "duration" && b.start && Number.isFinite(b.durationMin)) {
        const s = timeStrToMin(b.start);
        const e = s + clampInt(b.durationMin, 1, 600);
        if (Number.isFinite(s) && e > s) {
          blocks.push({ kind: "life", title, startTs: day0 + s * 60000, endTs: day0 + e * 60000 });
        }
      }
    });

    return blocks;
  }

  function buildStudyBlocksForDay(dateKey, allBlocksSoFar) {
    const tasks = getStudyTasks(dateKey);
    if (!tasks.length) return [];

    const dayDate = dateKeyToDate(dateKey);
    const day0 = dayDate.getTime();

    // 勉強を入れていい開始時刻（授業前に入れない）
    const L = getLifeSettings(dateKey);
    const anchorAbsMin = computeStudyAnchorAbsMin(L);

    // 就寝があるなら、就寝開始の直前まで（風呂/準備の予約分があるため、生活ブロックにより空きが消える）
    const sleep = computeSleepAbsWindow(L);
    const dayEndAbsMin = (L.sleepUse === "あり" && sleep) ? sleep.startAbsMin : 24 * 60; // 就寝未設定は24:00まで

    // 生活ブロック（当日）を集めて、空き時間を作る
    const lifeBlocksThisDay = allBlocksSoFar
      .filter(b => b.kind === "life")
      .filter(b => sameDay(new Date(b.startTs), dayDate)); // start日基準

    // 空きレンジ（絶対分）を作る
    // - anchorAbsMin 〜 dayEndAbsMin の間で、lifeBlocks を避ける
    const busy = lifeBlocksThisDay
      .map(b => ({
        s: minutesSinceDayStart(dayDate, new Date(b.startTs)),
        e: minutesSinceDayStart(dayDate, new Date(b.endTs)),
      }))
      .filter(r => Number.isFinite(r.s) && Number.isFinite(r.e))
      .map(r => ({ s: clampInt(r.s, 0, 2880), e: clampInt(r.e, 0, 2880) }))
      .filter(r => r.e > r.s)
      .sort((a, b) => a.s - b.s);

    const free = subtractRanges([{ s: anchorAbsMin, e: dayEndAbsMin }], busy);

    // 勉強ブロックを上から順に詰める
    const blocks = [];
    let freeIdx = 0;
    let curMin = free.length ? free[0].s : null;

    for (let i = 0; i < tasks.length; i++) {
      if (curMin == null) break;

      const t = tasks[i];
      const need = estimateStudyMin(t);

      // 次の入れ先を探す
      while (freeIdx < free.length) {
        const slot = free[freeIdx];
        if (curMin < slot.s) curMin = slot.s;

        // 入る？
        if (curMin + need <= slot.e) break;

        // 入らない → 次の空きへ
        freeIdx++;
        curMin = freeIdx < free.length ? free[freeIdx].s : null;
        if (curMin == null) break;
      }

      if (curMin == null) break;

      // 「入り切らない勉強がある場合は、この日の勉強リストの一番下のタスクを予定に入れない」
      // → つまり、途中で入らない場合は最後の1つをスキップするのではなく、入らない時点で打ち切り
      const slot = free[freeIdx];
      if (!slot || curMin + need > slot.e) break;

      blocks.push({
        kind: "study",
        taskId: t.id,
        system: t.system,
        subject: t.subject,
        taskType: t.taskType,
        ranges: t.ranges || [],
        startTs: day0 + curMin * 60000,
        endTs: day0 + (curMin + need) * 60000,
      });

      curMin += need;
    }

    return blocks;
  }

  function estimateStudyMin(task) {
    const steps = computeRangeSteps(task.ranges || []);
    if (task.perRangeMin && Number.isFinite(task.perRangeMin) && task.perRangeMin > 0 && steps.length) {
      // 範囲なし（steps 0）のときは durationMin
      return steps.length * task.perRangeMin;
    }
    return clampInt(task.durationMin ?? 30, 1, 600);
  }

  function computeStudyAnchorAbsMin(L) {
    // 授業があるなら授業終了後から
    // 授業なしで部活ありなら部活終了後から
    // 両方ありなら部活終了後（＝その日の固定最後）
    const ends = [];
    if (L.school === "あり" && L.classEnd) ends.push(timeStrToMin(L.classEnd));
    if (L.club === "あり" && L.clubEnd) ends.push(timeStrToMin(L.clubEnd));
    if (ends.length) return Math.max(...ends);
    // どちらもないなら 0:00 から（ただし朝の移動など生活ブロックがあれば空きから外れる）
    return 0;
  }

  /* =========================================================
     NOW / Timer tick
     ========================================================= */
  function startTick() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      // タイムラインキャッシュを更新（古すぎるなら）
      const cache = state.__timelineCache;
      if (!cache || Date.now() - (cache.builtAt || 0) > 8000) {
        // 現在表示日ベースで再計算
        const days = [
          addDaysToKey(state.selectedDate, -1),
          state.selectedDate,
          addDaysToKey(state.selectedDate, +1),
        ];
        const blocks = buildTimelineBlocksForDays(days);
        state.__timelineCache = { days, blocks, builtAt: Date.now() };
      }

      autoRunnerFromNow();
      tickRunner();
    }, 1000);
  }

  function autoRunnerFromNow() {
    const nowBlock = getNowBlockFromTimelineCache();
    if (!nowBlock) {
      // 勉強中でなくなったら停止
      if (state.runner.isRunning) runnerStop(false);
      return;
    }

    if (nowBlock.kind !== "study") {
      if (state.runner.isRunning) runnerStop(false);
      return;
    }

    const taskId = nowBlock.taskId;
    if (!taskId) return;

    // 完了なら自動開始しない
    if (isTaskComplete(taskId)) {
      if (state.runner.isRunning && state.runner.activeTaskId === taskId) runnerStop(false);
      return;
    }

    // NOWに入ったら自動で開始
    if (!state.runner.isRunning || state.runner.activeTaskId !== taskId) {
      runnerStart(taskId, true);
    }
  }

  function tickRunner() {
    if (!state.runner.isRunning || !state.runner.activeTaskId) return;

    const taskId = state.runner.activeTaskId;
    const t = findStudyTaskAnyDate(taskId);
    if (!t) return;

    const nowBlock = getNowBlockFromTimelineCache();
    // いま勉強ブロック上にいないなら止める（移動/食事で中断してOK）
    if (!nowBlock || nowBlock.kind !== "study" || nowBlock.taskId !== taskId) {
      runnerStop(false);
      return;
    }

    const now = Date.now();
    const dt = Math.max(0, now - (state.runner.lastTick || now));
    state.runner.lastTick = now;

    const steps = getTaskSteps(t);
    const p = ensureProgress(taskId, steps.length);
    const totalSec = computeTotalSec(t);

    p.spentSec = Math.min(totalSec, (p.spentSec || 0) + Math.floor(dt / 1000));
    state.progressByTask[taskId] = p;
    saveState();

    // 完了で到着（ループ防止）
    if (p.spentSec >= totalSec) {
      if (state.runner.arrivalShownTaskId !== taskId) {
        runnerStop(false);
        openArrivalDialog(taskId);
      } else {
        runnerStop(false);
      }
    }
  }

  function getNowBlockFromTimelineCache() {
    const cache = state.__timelineCache;
    if (!cache || !cache.blocks) return null;
    const now = Date.now();
    return cache.blocks.find(b => b.startTs <= now && now < b.endTs) || null;
  }

  function getRemainSecToCurrentBlockEnd() {
    const b = getNowBlockFromTimelineCache();
    if (!b) return null;
    const now = Date.now();
    return Math.max(0, Math.floor((b.endTs - now) / 1000));
  }

  function scrollToNow() {
    // タイムライン以外はタイムラインへ移動
    if (state.view !== "timeline") {
      state.view = "timeline";
      saveState();
      render();
      setTimeout(scrollToNow, 60);
      return;
    }
    const line = document.getElementById("nowLine");
    if (line) {
      line.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    // nowLineが無い（当日が画面外など）なら当日セクションへ
    const sec = document.querySelector(`[data-day="${dateKeyFromDate(new Date())}"]`);
    if (sec) sec.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /* =========================================================
     Date row
     ========================================================= */
  function renderDateRow() {
    const row = el("div", { class: "dateRow" });

    const left = mkBtn("◀", "btnTiny", () => {
      state.selectedDate = addDaysToKey(state.selectedDate, -1);
      saveState();
      render();
      if (state.view === "timeline") setTimeout(scrollToNow, 60);
    });
    const right = mkBtn("▶", "btnTiny", () => {
      state.selectedDate = addDaysToKey(state.selectedDate, +1);
      saveState();
      render();
      if (state.view === "timeline") setTimeout(scrollToNow, 60);
    });

    const d = dateKeyToDate(state.selectedDate);
    const center = el("div", { class: "dateCenter" }, [
      el("div", { class: "dateBig" }, [`${fmtMD(d)} ${WEEKDAYS[d.getDay()]}`]),
      el("div", { class: "dateSmall" }, [state.selectedDate]),
    ]);

    row.appendChild(left);
    row.appendChild(center);
    row.appendChild(right);

    return row;
  }

  /* =========================================================
     Modal (custom) — confirm などは使わない
     ========================================================= */
  function renderModalLayer() {
    const layer = el("div", { class: "modalLayer" + (state.ui.modalOpen ? " isOpen" : ""), id: "modalLayer" });

    if (!state.ui.modalOpen) return layer;

    const overlay = el("div", { class: "modalOverlay" });
    overlay.addEventListener("click", closeModal);

    const modal = el("div", { class: "modal" });

    const header = el("div", { class: "modalHeader" }, [
      el("div", { class: "modalTitle" }, [state.ui.modalTitle || ""]),
      mkBtn("✕", "btnX", closeModal),
    ]);

    const body = state.ui.modalBody || el("div", {}, [""]);
    body.classList.add("modalBody");

    const footer = el("div", { class: "modalFooter" });
    const btns = state.ui.modalButtons || [];
    btns.forEach(b => footer.appendChild(b));

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    layer.appendChild(overlay);
    layer.appendChild(modal);
    return layer;
  }

  function openModal(title, bodyNode, buttons) {
    state.ui.modalOpen = true;
    state.ui.modalTitle = title;
    state.ui.modalBody = bodyNode;
    state.ui.modalButtons = buttons || [];
    saveState();
    render();
  }

  function closeModal() {
    state.ui.modalOpen = false;
    state.ui.modalTitle = "";
    state.ui.modalBody = null;
    state.ui.modalButtons = null;
    saveState();
    render();
  }

  /* =========================================================
     Helpers: data access
     ========================================================= */
  function getLifeSettings(dateKey) {
    if (!state.lifeByDate[dateKey]) {
      state.lifeByDate[dateKey] = {
        templateKey: "",
        school: "なし",
        club: "なし",
        morningMoveStart: "7:30",
        morningMoveMin: 60,
        classStart: "8:30",
        classEnd: "15:00",
        clubStart: "15:00",
        clubEnd: "18:30",
        returnMoveMode: "60",
        second30Start: "20:00",
        bath: "あり",
        bathMin: 60,
        prep: "あり",
        prepMin: 15,
        sleepUse: "なし",
        sleepTime: "23:00",
        wakeTime: "7:00",
      };
      saveState();
    }
    return state.lifeByDate[dateKey];
  }

  function applyLifeTemplate(dateKey, templateKey) {
    const t = LIFE_TEMPLATES[templateKey];
    if (!t) return;
    state.lifeByDate[dateKey] = { ...getLifeSettings(dateKey), ...t };
    enforceSleepWindow(state.lifeByDate[dateKey]);
    saveState();
  }

  function clearDayLife(dateKey) {
    delete state.lifeByDate[dateKey];
    delete state.lifeBlocksByDate[dateKey];
  }

  function getLifeBlocks(dateKey) {
    if (!state.lifeBlocksByDate[dateKey]) state.lifeBlocksByDate[dateKey] = [];
    return state.lifeBlocksByDate[dateKey];
  }

  function addLifeBlock(dateKey, block) {
    const list = getLifeBlocks(dateKey);
    list.push(block);
  }

  function removeLifeBlock(dateKey, id) {
    const list = getLifeBlocks(dateKey);
    state.lifeBlocksByDate[dateKey] = list.filter(b => b.id !== id);
  }

  function getStudyTasks(dateKey) {
    if (!state.studyTasksByDate[dateKey]) state.studyTasksByDate[dateKey] = [];
    return state.studyTasksByDate[dateKey];
  }

  function addStudyTask(dateKey, task) {
    const list = getStudyTasks(dateKey);
    list.push(task);
  }

  function removeStudyTask(dateKey, id) {
    const list = getStudyTasks(dateKey);
    state.studyTasksByDate[dateKey] = list.filter(t => t.id !== id);
    // progressは残してOK（復活可能）
  }

  function moveStudyTask(dateKey, idx, dir) {
    const list = getStudyTasks(dateKey);
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const tmp = list[idx];
    list[idx] = list[j];
    list[j] = tmp;
    saveState();
    render();
  }

  function findStudyTaskById(dateKey, id) {
    return getStudyTasks(dateKey).find(t => t.id === id) || null;
  }

  function findStudyTaskAnyDate(id) {
    const keys = Object.keys(state.studyTasksByDate || {});
    for (const k of keys) {
      const t = (state.studyTasksByDate[k] || []).find(x => x.id === id);
      if (t) return t;
    }
    // selectedDateも確認
    return findStudyTaskById(state.selectedDate, id);
  }

  function systemByKey(key) {
    return STUDY_SYSTEMS.find(s => s.key === key) || STUDY_SYSTEMS[5];
  }

  function subjectOptionsForSystem(sysKey) {
    const arr = SUBJECTS_BY_SYSTEM[sysKey] || ["その他"];
    return arr.map(v => ({ value: v, label: v }));
  }

  function taskTypeOptionsForSubject(subject) {
    // その他は「教科書以上からも選択」→ 全部 + カスタム
    if (subject === "その他") {
      const set = new Set(["教科書"]);
      Object.values(TASK_TYPES_BY_SUBJECT).forEach(list => list.forEach(x => set.add(x)));
      const all = Array.from(set);
      return [
        ...all.map(v => ({ value: v, label: v })),
        { value: "（自由入力）", label: "（自由入力）" },
      ];
    }
    const list = TASK_TYPES_BY_SUBJECT[subject] || ["教科書"];
    return list.map(v => ({ value: v, label: v }));
  }

  function pickDefaultSubject(sysKey, subjectText) {
    const opts = SUBJECTS_BY_SYSTEM[sysKey] || ["その他"];
    if (opts.includes(subjectText)) return subjectText;
    // "その他系"で具体名が入ってる場合は科目は "その他"
    if (sysKey === "other") return "その他";
    return opts[0];
  }

  /* =========================================================
     Range parsing / steps
     ========================================================= */
  function computeRangeSteps(ranges) {
    const out = [];
    (ranges || []).forEach(r => {
      const a = (r.start || "").trim();
      const b = (r.end || "").trim();
      if (!a && !b) return;

      // どちらか空ならそのまま1つ
      if (!a || !b) {
        out.push(a || b);
        return;
      }

      const pa = parsePrefixInt(a);
      const pb = parsePrefixInt(b);

      // 両方整数prefixが取れたら、inclusiveで展開
      if (pa != null && pb != null) {
        const s = pa, e = pb;
        if (s === e) {
          // 71-71 → 71 を 1個（多重にはしない）
          out.push(a); // 文字列として開始側を優先
          return;
        }
        const step = s < e ? 1 : -1;
        for (let x = s; x !== e; x += step) {
          if (x === s) out.push(a);       // 開始の原文
          else out.push(String(x));       // 中間は整数だけ
        }
        out.push(b); // 終了の原文
        return;
      }

      // 整数扱いできない場合は "a - b"
      out.push(`${a} - ${b}`);
    });
    return out;
  }

  function parsePrefixInt(s) {
    // "11(2-3)" -> 11, "15(3)" -> 15, "12" -> 12
    const m = String(s).match(/^(\d+)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  function renderRangeSummary(ranges) {
    // ざっくり表示（先頭2つくらい）
    const steps = computeRangeSteps(ranges);
    if (!steps.length) return "—";
    if (steps.length <= 2) return steps.join(", ");
    return `${steps[0]}, ${steps[1]} …（${steps.length}件）`;
  }

  /* =========================================================
     Sleep window (abs minutes)
     ========================================================= */
  function computeSleepAbsWindow(L) {
    if (!L || L.sleepUse !== "あり") return null;
    if (!L.sleepTime || !L.wakeTime) return null;

    const s = timeStrToMin(L.sleepTime);
    const w = timeStrToMin(L.wakeTime);
    if (!Number.isFinite(s) || !Number.isFinite(w)) return null;

    // 就寝が「日付変更後」の場合は翌日扱い（例 1:00 => 1500）
    const sleepStartAbs = (s < 12 * 60) ? (24 * 60 + s) : s;

    // 起床は「就寝からの経過」で決める（同日/翌日を自動判定）
    // 例：就寝 23:00(1380) 起床 7:00(420) → + (24h - 1380 + 420) = 480
    // 例：就寝 1:00(1500) 起床 7:00(420) → + (420 - 60)=360
    // 基準は「就寝の時刻（0-1439）」でも良いが、ここでは absStart から差分
    const sleepStartClock = s; // 0-1439
    let diff;
    if (w >= sleepStartClock) diff = w - sleepStartClock;
    else diff = (24 * 60 - sleepStartClock) + w;

    // 9時間以内に補正
    const max = 9 * 60;
    if (diff > max) diff = max;

    const sleepEndAbs = sleepStartAbs + diff;

    return { startAbsMin: sleepStartAbs, endAbsMin: sleepEndAbs };
  }

  function enforceSleepWindow(L) {
    // 起床が就寝から9h超なら起床を自動調整
    const win = computeSleepAbsWindow(L);
    if (!win) return;
    const diff = win.endAbsMin - win.startAbsMin;
    if (diff > 9 * 60) {
      // ここには来ない（compute で丸める）が保険
      const capped = win.startAbsMin + 9 * 60;
      L.wakeTime = fmtMinToHM(capped % (24 * 60));
    }
  }

  function computeSleepWarnText(L) {
    const win = computeSleepAbsWindow(L);
    if (!win) return "";
    const diff = win.endAbsMin - win.startAbsMin;
    if (diff >= 9 * 60) return "起床時刻が就寝から9時間以内になるように補正されます。";
    return "";
  }

  /* =========================================================
     Utilities: time / date
     ========================================================= */
  function timeStrToMin(hm) {
    const s = String(hm || "").trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return h * 60 + mi;
  }

  function fmtMinToHM(min) {
    const m = ((min % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(m / 60);
    const mi = m % 60;
    return `${h}:${String(mi).padStart(2, "0")}`;
  }

  function fmtHM(d) {
    const h = d.getHours();
    const m = d.getMinutes();
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  function fmtMS(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function fmtMD(d) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function dateKeyFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function dateKeyToDate(key) {
    const [y, m, d] = key.split("-").map(n => parseInt(n, 10));
    return new Date(y, (m - 1), d, 0, 0, 0, 0);
  }

  function addDaysToKey(key, n) {
    const d = dateKeyToDate(key);
    d.setDate(d.getDate() + n);
    return dateKeyFromDate(d);
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  function minutesSinceDayStart(dayStartDate, dt) {
    const day0 = new Date(dayStartDate.getFullYear(), dayStartDate.getMonth(), dayStartDate.getDate(), 0, 0, 0, 0).getTime();
    return Math.floor((dt.getTime() - day0) / 60000);
  }

  function addMinHM(hm, mins) {
    const m = timeStrToMin(hm);
    if (m == null) return "";
    return fmtMinToHM(m + mins);
  }

  function buildSecondMoveStarts() {
    // 17:00〜21:30、00/15/30 分のみ
    const opts = [];
    for (let h = 17; h <= 21; h++) {
      [0, 15, 30].forEach(mi => {
        if (h === 21 && mi > 30) return;
        const v = `${h}:${String(mi).padStart(2, "0")}`;
        opts.push({ value: v, label: v });
      });
    }
    // 21:30 を追加済み。18:15 等も必要なら手動で入れてOK（テンプレ sat で使う）
    // 18:15が必要なので上の生成に含まれる（18:15）
    return opts;
  }

  function formatReturnMoveLabel(mode) {
    const opt = RETURN_MOVE_OPTIONS.find(o => o.value === mode);
    return opt ? opt.label : "—";
  }

  /* =========================================================
     Range helpers for free/busy subtraction
     ========================================================= */
  function subtractRanges(baseRanges, busyRanges) {
    // baseRanges: [{s,e}] から busyRanges を引いて free を返す
    let free = baseRanges.slice();

    busyRanges.forEach(b => {
      free = free.flatMap(r => {
        if (b.e <= r.s || r.e <= b.s) return [r]; // no overlap
        const out = [];
        if (r.s < b.s) out.push({ s: r.s, e: b.s });
        if (b.e < r.e) out.push({ s: b.e, e: r.e });
        return out;
      });
    });

    // 正規化
    free = free.filter(r => r.e > r.s).sort((a, b) => a.s - b.s);
    return free;
  }

  function mergeAdjacentSameBlocks(blocks) {
    if (!blocks.length) return blocks;
    const sorted = blocks.slice().sort((a, b) => a.startTs - b.startTs);

    const out = [];
    for (const b of sorted) {
      const last = out[out.length - 1];
      if (!last) { out.push(b); continue; }

      const same =
        last.kind === b.kind &&
        last.kind === "study" &&
        last.taskId === b.taskId &&
        last.endTs === b.startTs; // 連続

      // 生活は結合しない（見た目が崩れやすい）
      if (same) {
        last.endTs = b.endTs;
      } else {
        out.push(b);
      }
    }
    return out;
  }

  function dropOverlaps(blocks) {
    if (!blocks.length) return blocks;
    const sorted = blocks.slice().sort((a, b) => a.startTs - b.startTs);
    const out = [];
    let lastEnd = -Infinity;

    for (const b of sorted) {
      if (b.startTs >= lastEnd) {
        out.push(b);
        lastEnd = b.endTs;
      } else {
        // 重複：短い方を落とすか、開始を詰める。ここでは「落とす」。
        // ただし、生活優先（生活は残す）
        const last = out[out.length - 1];
        if (last && last.kind === "life" && b.kind === "study") {
          continue;
        }
        if (last && last.kind === "study" && b.kind === "life") {
          // 生活を優先：最後を除いて生活を入れる
          out.pop();
          out.push(b);
          lastEnd = b.endTs;
          continue;
        }
        // 同種はそのまま落とす
      }
    }
    return out;
  }

  /* =========================================================
     UI helpers
     ========================================================= */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k.startsWith("data-")) node.setAttribute(k, v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach(c => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  function labeled(label, inputEl) {
    const w = el("div", { class: "field" });
    w.appendChild(el("div", { class: "label" }, [label]));
    w.appendChild(inputEl);
    return w;
  }

  function labeledInline(label, inputEl) {
    const w = el("div", { class: "fieldInline" });
    w.appendChild(el("div", { class: "labelInline" }, [label]));
    w.appendChild(inputEl);
    return w;
  }

  function mkBtn(text, cls, onClick) {
    const b = el("button", { type: "button", class: `btn ${cls || ""}` }, [text]);
    b.addEventListener("click", onClick);
    return b;
  }

  function mkInput(_label, value) {
    const i = el("input", { class: "input", value: value ?? "" });
    i.type = "text";
    return i;
  }

  function mkNumber(value, min, max, step) {
    const i = el("input", { class: "input" });
    i.type = "number";
    if (value !== "" && value != null) i.value = String(value);
    if (min != null) i.min = String(min);
    if (max != null) i.max = String(max);
    if (step != null) i.step = String(step);
    return i;
  }

  function mkSelect(options, value) {
    const s = el("select", { class: "select" });
    options.forEach(o => s.appendChild(mkOption(o.value, o.label)));
    s.value = value ?? "";
    return s;
  }

  function mkOption(value, label) {
    const o = el("option", { value: String(value) }, [String(label)]);
    return o;
  }

  function mkTimeSelect(value) {
    const options = [{ value: "", label: "" }];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        options.push({ value: `${h}:${String(m).padStart(2, "0")}`, label: `${h}:${String(m).padStart(2, "0")}` });
      }
    }
    return mkSelect(options, value ?? "");
  }

  function mkRadio(name, value, label, checked) {
    const input = el("input", { type: "radio" });
    input.name = name;
    input.value = value;
    input.checked = !!checked;

    const span = el("span", { class: "radioLabel" }, [label]);
    const wrap = el("label", { class: "radioWrap" }, [input, span]);
    return { input, wrap };
  }

  function toast(msg) {
    const t = el("div", { class: "toast" }, [msg]);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 220);
    }, 1200);
  }

  function clampInt(v, min, max) {
    const n = parseInt(String(v), 10);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
  }

  /* =========================================================
     Persistence
     ========================================================= */
  function saveState() {
    // UIのDOM参照は保存しない
    const copy = JSON.parse(JSON.stringify(state));
    delete copy.__timelineCache;
    if (copy.ui) {
      copy.ui.modalOpen = false;
      copy.ui.modalTitle = "";
      delete copy.ui.modalBody;
      delete copy.ui.modalButtons;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(copy));
  }

  function loadState() {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (!s) return null;
      const obj = JSON.parse(s);
      // 互換のため最低限補完
      if (!obj.view) obj.view = "timeline";
      if (!obj.selectedDate) obj.selectedDate = dateKeyFromDate(new Date());
      if (!obj.lifeByDate) obj.lifeByDate = {};
      if (!obj.lifeBlocksByDate) obj.lifeBlocksByDate = {};
      if (!obj.studyTasksByDate) obj.studyTasksByDate = {};
      if (!obj.progressByTask) obj.progressByTask = {};
      if (!obj.runner) obj.runner = { activeTaskId: null, isRunning: false, lastTick: 0, pausedByUser: false, arrivalShownTaskId: null };
      if (!obj.ui) obj.ui = { modalOpen: false, modalTitle: "" };
      obj.ui.modalOpen = false;
      return obj;
    } catch {
      return null;
    }
  }

  /* =========================================================
     CSS injection (single-file style)
     ========================================================= */
  function injectCSS() {
    const css = `
      :root{
        --bg:${COLORS.bg};
        --panel:${COLORS.panel};
        --card:${COLORS.card};
        --line:${COLORS.line};
        --text:${COLORS.text};
        --sub:${COLORS.sub};
      }
      *{box-sizing:border-box;}
      body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,"Noto Sans JP",sans-serif;}
      .app{min-height:100vh;display:flex;flex-direction:column;}
      .topbar{
        position:sticky; top:0; z-index:20;
        display:grid; grid-template-columns: 1fr auto auto;
        gap:10px; align-items:center;
        padding:10px 12px;
        background:linear-gradient(180deg, rgba(15,21,33,.98), rgba(11,15,23,.96));
        border-bottom:1px solid var(--line);
      }
      .brandTitle{font-weight:1000; letter-spacing:.2px;}
      .topbarMid{display:flex; justify-content:flex-start;}
      .topbarRight{display:flex; align-items:center; gap:10px; justify-content:flex-end;}
      .clock{font-weight:1000; opacity:.92;}
      .remainPill{
        display:flex; flex-direction:column; align-items:flex-start;
        padding:8px 10px; border:1px solid var(--line); border-radius:14px;
        background:rgba(255,255,255,.03);
        min-width:160px;
      }
      .remainSub{font-size:12px; color:var(--sub); font-weight:1000;}
      .remainBig{font-size:18px; font-weight:1000; letter-spacing:.2px;}

      .tabs{
        position:sticky; top:54px; z-index:19;
        display:flex; gap:10px;
        padding:10px 12px;
        background:rgba(11,15,23,.96);
        border-bottom:1px solid var(--line);
      }
      .tab{
        flex:1;
        padding:12px 10px;
        border-radius:16px;
        border:1px solid var(--line);
        background:rgba(255,255,255,.03);
        color:var(--sub);
        font-weight:1000;
        font-size:16px;
      }
      .tab.isActive{
        color:var(--text);
        border-color:rgba(255,255,255,.20);
        background:rgba(255,255,255,.06);
      }

      .content{padding:12px; display:flex; flex-direction:column; gap:12px;}
      .panel{display:flex; flex-direction:column; gap:12px;}
      .card{
        background:linear-gradient(180deg, rgba(17,26,42,.98), rgba(15,21,33,.96));
        border:1px solid var(--line);
        border-radius:20px;
        padding:12px;
        box-shadow: 0 10px 28px rgba(0,0,0,.25);
      }
      .cardTitle{font-weight:1000; font-size:16px; margin-bottom:10px;}
      .muted{color:var(--sub); font-weight:900; padding:6px 2px;}
      .mutedSmall{color:var(--sub); font-weight:900; font-size:12px;}
      .warn{margin-top:8px; color:#ffcc66; font-weight:1000; font-size:12px;}

      .dateRow{
        display:grid; grid-template-columns: 44px 1fr 44px;
        gap:10px; align-items:center;
        padding:10px 12px;
        border:1px solid var(--line);
        border-radius:18px;
        background:rgba(255,255,255,.03);
      }
      .dateCenter{display:flex; flex-direction:column; align-items:center;}
      .dateBig{font-weight:1000;}
      .dateSmall{font-size:12px; color:var(--sub); font-weight:900;}

      .grid2{display:grid; grid-template-columns: 1fr 1fr; gap:10px;}
      @media (max-width: 420px){ .grid2{grid-template-columns: 1fr;} }

      .field{display:flex; flex-direction:column; gap:6px;}
      .label{font-size:12px; color:var(--sub); font-weight:1000;}
      .input,.select{
        width:100%;
        padding:12px 12px;
        border-radius:14px;
        border:1px solid var(--line);
        background:rgba(255,255,255,.03);
        color:var(--text);
        font-weight:1000;
        font-size:16px;
        outline:none;
      }
      .select{appearance:none;}
      .sepTop{margin-top:12px; padding-top:12px; border-top:1px solid var(--line);}

      .row{display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:10px; flex-wrap:wrap;}
      .rowTight{display:flex; gap:10px; align-items:center;}
      .btn{
        border-radius:14px;
        border:1px solid var(--line);
        background:rgba(255,255,255,.04);
        color:var(--text);
        font-weight:1000;
        font-size:16px;
        padding:10px 12px;
      }
      .btn:active{transform: translateY(1px);}
      .btnPrimary{
        border-color:rgba(255,255,255,.22);
        background:rgba(255,255,255,.09);
      }
      .btnGhost{
        color:var(--sub);
        background:rgba(255,255,255,.02);
      }
      .btnX{
        width:44px; min-width:44px;
        padding:10px 0;
        text-align:center;
        background:rgba(255,255,255,.03);
        color:rgba(240,244,255,.78);
      }
      .btnTiny{
        width:44px; min-width:44px;
        padding:10px 0;
        text-align:center;
        background:rgba(255,255,255,.03);
        color:rgba(240,244,255,.78);
      }

      .listBox{display:flex; flex-direction:column; gap:10px;}
      .listRow{
        display:flex; gap:10px; align-items:flex-start; justify-content:space-between;
        padding:10px;
        border:1px solid var(--line);
        border-radius:16px;
        background:rgba(255,255,255,.03);
      }
      .listMain{flex:1; min-width:0;}
      .listTitle{font-weight:1000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .listSub{font-size:12px; color:var(--sub); font-weight:900; margin-top:4px;}
      .listRight{display:flex; gap:8px; align-items:center;}
      .studyRow{cursor:pointer;}
      .sysPill{
        padding:6px 10px;
        border-radius:999px;
        color:#0b0f17;
        font-weight:1000;
        font-size:12px;
        white-space:nowrap;
      }
      .rightTag{
        margin-left:auto;
        font-size:12px;
        color:var(--sub);
        font-weight:1000;
      }

      .modeRow{
        display:flex; gap:12px;
        padding:8px 2px;
      }
      .radioWrap{display:flex; align-items:center; gap:8px; color:var(--sub); font-weight:1000;}
      .radioWrap input{transform: scale(1.1);}

      .rangesBox{
        margin-top:10px;
        padding-top:10px;
        border-top:1px solid var(--line);
      }
      .rangesTitle{font-weight:1000; margin-bottom:8px;}
      .rangesList{display:flex; flex-direction:column; gap:10px;}
      .rangeRow{
        display:flex; gap:10px; align-items:flex-start;
      }
      .rangeStack{
        flex:1;
        display:flex; flex-direction:column; gap:10px;
      }
      .fieldInline{display:flex; flex-direction:column; gap:6px;}
      .labelInline{font-size:12px; color:var(--sub); font-weight:1000;}

      /* Timeline */
      .timeline{display:flex; flex-direction:column; gap:0;}
      .daySection{
        display:grid; grid-template-columns: 56px 1fr;
        gap:0;
        border-top:1px solid var(--line);
      }
      .dayLabel{
        padding:10px 6px;
        border-right:1px solid var(--line);
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:flex-start;
        gap:6px;
        background:rgba(255,255,255,.02);
      }
      .dayDate{font-weight:1000; font-size:14px;}
      .dayWday{font-weight:1000; font-size:12px; color:var(--sub);}
      .dayLane{
        position:relative;
        background:rgba(255,255,255,.01);
        overflow:visible;
      }
      .ticks{position:absolute; left:0; right:0; top:0; bottom:0; pointer-events:none;}
      .tick{position:absolute; left:0; right:0; height:0;}
      .tickLabel{
        position:absolute; left:10px; top:-10px;
        font-size:11px; color:rgba(240,244,255,.50); font-weight:900;
        background:rgba(11,15,23,.65);
        padding:2px 6px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.08);
      }
      .tickLine{
        position:absolute; left:0; right:0; top:0;
        height:1px; background:rgba(255,255,255,.06);
      }
      .nowLine{
        position:absolute; left:0; right:0;
        height:0;
        border-top:2px dashed rgba(255,255,255,.55);
        z-index:5;
        pointer-events:none;
      }

      .blockCard{
        position:absolute; left:10px; right:10px;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(17,26,42,.92);
        padding:10px 10px 10px 12px;
        box-shadow:0 10px 24px rgba(0,0,0,.20);
        z-index:6;
        overflow:hidden;
      }
      .blockTime{font-size:12px; color:rgba(240,244,255,.70); font-weight:1000;}
      .blockTitle{font-size:14px; font-weight:1000; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      .blockSub{font-size:12px; color:rgba(240,244,255,.60); font-weight:900; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}

      /* Modal */
      .modalLayer{position:fixed; inset:0; display:none; z-index:50;}
      .modalLayer.isOpen{display:block;}
      .modalOverlay{position:absolute; inset:0; background:rgba(0,0,0,.55);}
      .modal{
        position:absolute; left:12px; right:12px; top:12px; bottom:12px;
        background:linear-gradient(180deg, rgba(17,26,42,.98), rgba(15,21,33,.98));
        border:1px solid rgba(255,255,255,.12);
        border-radius:20px;
        display:flex; flex-direction:column;
        overflow:hidden;
      }
      .modalHeader{
        display:flex; align-items:center; justify-content:space-between;
        padding:12px;
        border-bottom:1px solid rgba(255,255,255,.10);
      }
      .modalTitle{font-weight:1000; font-size:16px;}
      .modalBody{
        flex:1;
        overflow:auto;
        padding:12px;
      }
      .modalBodyScroll{display:flex; flex-direction:column; gap:10px;}
      .modalFooter{
        padding:12px;
        border-top:1px solid rgba(255,255,255,.10);
        display:flex; gap:10px; justify-content:flex-end;
      }

      .runnerTitle{font-weight:1000; font-size:16px;}
      .runnerTimeBox{
        border:1px solid rgba(255,255,255,.12);
        border-radius:18px;
        background:rgba(255,255,255,.03);
        padding:12px;
      }
      .runnerTimeBig{font-size:34px; font-weight:1000; text-align:center;}
      .runnerTimeSmall{font-size:12px; color:var(--sub); font-weight:1000; text-align:center; margin-top:6px;}
      .runnerProg{text-align:right; color:var(--sub); font-weight:1000;}
      .stepsBox{display:flex; flex-direction:column; gap:10px;}
      .stepBtn{
        width:100%;
        text-align:left;
        padding:12px 12px;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.03);
        color:var(--text);
        font-weight:1000;
        display:flex;
        justify-content:space-between;
        gap:10px;
      }
      .stepBtn.isDone{
        background:rgba(255,255,255,.08);
        border-color:rgba(255,255,255,.18);
      }
      .stepRight{color:rgba(240,244,255,.70); font-weight:1000;}

      .arrivalBig{font-size:42px; font-weight:1000; text-align:center; margin-top:10px;}
      .arrivalSub{font-size:14px; font-weight:1000; color:var(--sub); text-align:center; margin-top:6px;}

      .infoGrid{display:flex; flex-direction:column; gap:8px;}
      .infoRow{display:flex; justify-content:space-between; gap:10px; padding:10px; border:1px solid rgba(255,255,255,.10); border-radius:16px; background:rgba(255,255,255,.03);}
      .infoKey{color:var(--sub); font-weight:1000;}
      .infoVal{font-weight:1000;}

      .toast{
        position:fixed; left:50%; bottom:16px;
        transform:translateX(-50%) translateY(12px);
        opacity:0;
        background:rgba(17,26,42,.95);
        border:1px solid rgba(255,255,255,.12);
        color:var(--text);
        font-weight:1000;
        padding:10px 14px;
        border-radius:999px;
        transition: all .2s ease;
        z-index:80;
      }
      .toast.show{opacity:1; transform:translateX(-50%) translateY(0);}
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ===== Init ===== */
  // 確認ダイアログなどは一切出さない（ユーザー操作でのみモーダル）
  render();
  startTick();

})();
