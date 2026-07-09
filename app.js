const ACCESS_CODE = "PEBCOSCE9000";
const READING_SECONDS = 2 * 60;
const TASK_SECONDS = 7 * 60;

const COMPETENCY_LABELS = {
  clinical_care: "Clinical Care",
  distribution: "Distribution",
  knowledge_expertise: "Knowledge and Expertise",
  communication: "Communication and Collaboration",
  leadership: "Leadership and Stewardship",
  professionalism: "Professionalism",
};

const TYPE_LABELS = {
  interactive_sp: "Interactive (Simulated Patient)",
  interactive_hp: "Interactive (Health Professional)",
  non_interactive_screening: "Non-Interactive (Screening)",
  non_interactive_checking: "Non-Interactive (Checking)",
  non_interactive_written: "Non-Interactive (Written)",
};

let STATIONS = [];
let currentStation = null;
let timerInterval = null;
let timerRemaining = READING_SECONDS;
let timerPhase = "reading"; // "reading" | "task" | "done"
let timerEverStarted = false;

function $(id) { return document.getElementById(id); }

function showScreen(id) {
  ["gate-screen", "list-screen", "station-screen"].forEach(s => {
    $(s).style.display = s === id ? "" : "none";
  });
}

// ---------- Access gate ----------
function checkAccessCode() {
  const val = $("access-code-input").value.trim().toUpperCase();
  if (val === ACCESS_CODE) {
    sessionStorage.setItem("pebcosce_access", "1");
    loadStations();
  } else {
    $("gate-error").textContent = "Incorrect access code. Please check your book or listing for the code.";
  }
}

$("gate-submit").addEventListener("click", checkAccessCode);
$("access-code-input").addEventListener("keydown", e => {
  if (e.key === "Enter") checkAccessCode();
});

// ---------- Load + list ----------
async function loadStations() {
  try {
    const res = await fetch("stations.json");
    STATIONS = await res.json();
    buildCompetencyFilter();
    renderList();
    showScreen("list-screen");
  } catch (e) {
    $("gate-error").textContent = "Could not load stations. Please refresh and try again.";
  }
}

function buildCompetencyFilter() {
  const sel = $("filter-competency");
  const keys = [...new Set(STATIONS.map(s => s.competency))];
  keys.forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = COMPETENCY_LABELS[k] || k;
    sel.appendChild(opt);
  });
}

function getCompletedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem("pebcosce_completed") || "[]"));
  } catch (e) {
    return new Set();
  }
}

function markCompleted(id) {
  const set = getCompletedSet();
  set.add(id);
  localStorage.setItem("pebcosce_completed", JSON.stringify([...set]));
}

function renderList() {
  const compFilter = $("filter-competency").value;
  const typeFilter = $("filter-type").value;
  const completed = getCompletedSet();

  const filtered = STATIONS.filter(s =>
    (!compFilter || s.competency === compFilter) &&
    (!typeFilter || s.station_type === typeFilter)
  );

  $("station-count").textContent = `${filtered.length} station${filtered.length === 1 ? "" : "s"}`;

  const container = $("station-list");
  container.innerHTML = "";
  filtered.forEach(s => {
    const card = document.createElement("div");
    card.className = "station-card" + (completed.has(s.id) ? " done" : "");
    card.innerHTML = `
      <div class="num">Station ${s.id}${completed.has(s.id) ? ' <span class="done-check">&#10003; Practiced</span>' : ""}</div>
      <div class="title">${escapeHtml(s.title)}</div>
      <div class="tags">
        <span class="tag">${COMPETENCY_LABELS[s.competency] || s.competency}</span>
        <span class="tag">${TYPE_LABELS[s.station_type] || s.station_type}</span>
      </div>`;
    card.addEventListener("click", () => openStation(s));
    container.appendChild(card);
  });
}

$("filter-competency").addEventListener("change", renderList);
$("filter-type").addEventListener("change", renderList);
$("back-to-list").addEventListener("click", () => {
  stopTimer();
  renderList();
  showScreen("list-screen");
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---------- Station detail ----------
function openStation(s) {
  currentStation = s;
  $("station-title-header").textContent = `Station ${s.id}: ${s.title}`;
  $("station-competency-badge").textContent = COMPETENCY_LABELS[s.competency] || s.competency;
  $("station-type-badge").textContent = TYPE_LABELS[s.station_type] || s.station_type;
  $("station-setting").textContent = s.setting;
  $("station-instructions").textContent = s.candidate_instructions;
  $("station-materials").textContent = s.materials_provided;
  $("station-references").textContent = s.references_provided;

  $("answer-section").style.display = "none";
  $("reveal-panel").style.display = "";
  $("reveal-btn").disabled = false;

  resetTimer();
  showScreen("station-screen");
  window.scrollTo(0, 0);
}

$("reveal-btn").addEventListener("click", () => {
  const s = currentStation;
  if (!s) return;

  if (!timerEverStarted || timerPhase !== "done") {
    const proceed = confirm(
      "You have not finished a full 2-minute reading period plus 7-minute task timer yet. " +
      "On the real exam you get no feedback until the station ends. Reveal the answer now anyway?"
    );
    if (!proceed) return;
  }

  if (s.sp_role_script) {
    $("sp-script-block").style.display = "";
    $("sp-script-text").textContent = s.sp_role_script;
  } else {
    $("sp-script-block").style.display = "none";
  }

  if (s.task_details) {
    $("task-details-block").style.display = "";
    $("task-details-text").textContent = s.task_details;
  } else {
    $("task-details-block").style.display = "none";
  }

  const byCategory = {};
  s.checklist.forEach((item, idx) => {
    byCategory[item.category] = byCategory[item.category] || [];
    byCategory[item.category].push({ ...item, idx });
  });

  const container = $("checklist-container");
  container.innerHTML = "";
  Object.keys(byCategory).forEach(cat => {
    const block = document.createElement("div");
    block.className = "checklist-category";
    const h3 = document.createElement("h3");
    h3.textContent = cat;
    block.appendChild(h3);
    byCategory[cat].forEach(item => {
      const row = document.createElement("div");
      row.className = "checklist-item";
      row.innerHTML = `<input type="checkbox" data-idx="${item.idx}"><label>${escapeHtml(item.item)}</label>`;
      block.appendChild(row);
    });
    container.appendChild(block);
  });

  container.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", updateTally);
  });
  updateTally();

  $("model-answer-text").textContent = s.model_answer;
  $("answer-section").style.display = "";
  $("reveal-panel").style.display = "none";

  markCompleted(s.id);
});

function updateTally() {
  const boxes = document.querySelectorAll("#checklist-container input[type=checkbox]");
  const checked = [...boxes].filter(b => b.checked).length;
  $("score-tally").textContent = `Self-score: ${checked} of ${boxes.length} checklist items met`;
}

// ---------- Timer ----------
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resetTimer() {
  stopTimer();
  timerPhase = "reading";
  timerEverStarted = false;
  timerRemaining = READING_SECONDS;
  $("timer-display").textContent = formatTime(timerRemaining);
  $("timer-display").className = "";
  $("timer-label").textContent = "Reading Period";
  $("timer-start").textContent = "Start Reading Timer";
  $("timer-start").disabled = false;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function tick() {
  timerRemaining--;
  if (timerRemaining <= 0) {
    if (timerPhase === "reading") {
      startTaskPhase();
    } else {
      timerPhase = "done";
      stopTimer();
      $("timer-display").textContent = "0:00";
      $("timer-display").className = "done";
      $("timer-label").textContent = "Station Time Complete";
      $("timer-start").textContent = "Start Reading Timer";
      $("timer-start").disabled = false;
      return;
    }
  }
  $("timer-display").textContent = formatTime(timerRemaining);
  if (timerPhase === "task" && timerRemaining <= 60) {
    $("timer-display").className = "warning";
  }
}

function startTaskPhase() {
  timerPhase = "task";
  timerRemaining = TASK_SECONDS;
  $("timer-label").textContent = "Task Period";
  $("timer-display").className = "";
  $("timer-start").textContent = "Start Task Timer";
}

$("timer-start").addEventListener("click", () => {
  if (timerInterval) return;
  timerEverStarted = true;
  $("timer-start").disabled = true;
  timerInterval = setInterval(tick, 1000);
});

$("timer-reset").addEventListener("click", resetTimer);

$("timer-skip").addEventListener("click", () => {
  timerEverStarted = true;
  stopTimer();
  startTaskPhase();
  $("timer-display").textContent = formatTime(timerRemaining);
  $("timer-start").disabled = false;
});

// ---------- Print partner script ----------
$("print-partner-btn").addEventListener("click", () => {
  const s = currentStation;
  if (!s) return;
  const checklistHtml = s.checklist
    .map(item => `<div>&#9633; [${escapeHtml(item.category)}] ${escapeHtml(item.item)}</div>`)
    .join("");
  $("print-area").innerHTML = `
    <h1>Station ${s.id}: ${escapeHtml(s.title)}</h1>
    <p><strong>Setting:</strong> ${escapeHtml(s.setting)}</p>
    <p><strong>Station Type:</strong> ${TYPE_LABELS[s.station_type] || s.station_type}</p>
    <hr>
    ${s.sp_role_script ? `<h2>Simulated Participant Script (for your study partner)</h2><p>${escapeHtml(s.sp_role_script)}</p>` : ""}
    ${s.task_details ? `<h2>Written Task Details</h2><p>${escapeHtml(s.task_details)}</p>` : ""}
    <h2>Scoring Checklist</h2>
    ${checklistHtml}
    <h2>Model Answer</h2>
    <p>${escapeHtml(s.model_answer)}</p>
  `;
  window.print();
});

// ---------- Init ----------
if (sessionStorage.getItem("pebcosce_access") === "1") {
  loadStations();
}
