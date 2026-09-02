(function () {
  "use strict";

  var STORAGE_KEY = "dochadzka-data-v1";

  var EVENT_TYPES = {
    trening: { label: "Tréning", color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
    zapas: { label: "Zápas", color: "#D85A30", bg: "#FAECE7", text: "#993C1D" },
    turnaj: { label: "Turnaj", color: "#7F77DD", bg: "#EEEDFE", text: "#3C3489" },
  };

  var WEEKDAYS_SK = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
  var MONTHS_SK = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];

  // ---------- utils ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function formatDate(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("sk-SK", { day: "numeric", month: "short", year: "numeric" });
  }
  function formatDateRange(start, end) {
    if (!end || end === start) return formatDate(start);
    var s = new Date(start + "T00:00:00");
    var e = new Date(end + "T00:00:00");
    var sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
    var startStr = s.toLocaleDateString("sk-SK", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
    var endStr = e.toLocaleDateString("sk-SK", { day: "numeric", month: "short", year: "numeric" });
    return startStr + ". \u2013 " + endStr;
  }
  function nextWeekday(targetDay) {
    var d = new Date();
    var diff = (targetDay - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
    return d.toISOString().slice(0, 10);
  }
  function eventType(t) { return EVENT_TYPES[t.type] || EVENT_TYPES.trening; }
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function buildCalendarDays(year, month) {
    var firstOfMonth = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var jsWeekday = firstOfMonth.getDay();
    var offset = (jsWeekday + 6) % 7;
    var cells = [];
    for (var i = 0; i < offset; i++) cells.push(null);
    for (var day = 1; day <= daysInMonth; day++) {
      var iso = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      cells.push({ day: day, iso: iso });
    }
    return cells;
  }

  // ---------- persisted state ----------
  var data = { members: [], trainings: [], attendance: {} };
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        data.members = parsed.members || [];
        data.trainings = parsed.trainings || [];
        data.attendance = parsed.attendance || {};
      }
    } catch (e) { /* ignore corrupt data */ }
  }
  var saveTimer = null;
  function saveData() {
    ui.saving = true;
    renderTopStatusOnly();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        ui.error = "";
      } catch (e) {
        ui.error = "Uloženie zlyhalo. Skús to znova.";
      }
      ui.saving = false;
      renderTopStatusOnly();
    }, 150);
  }

  // ---------- transient UI state ----------
  var ui = {
    tab: "trainings",
    selectedTrainingId: null,
    selectedMemberId: null,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    isEditingMember: false,
    editingName: "",
    newMemberName: "",
    newTrainingDate: todayISO(),
    newTrainingEndDate: "",
    newTrainingNote: "",
    newTrainingType: "trening",
    saving: false,
    error: "",
  };

  function sortedMembers() {
    return data.members.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "sk"); });
  }
  function memberStats(memberId) {
    var present = 0;
    data.trainings.forEach(function (t) {
      if (data.attendance[t.id] && data.attendance[t.id][memberId] === true) present++;
    });
    var total = data.trainings.length;
    var pct = total === 0 ? 0 : Math.round((present / total) * 100);
    return { present: present, total: total, pct: pct };
  }

  // ---------- mutations ----------
  function addMember() {
    var name = ui.newMemberName.trim();
    if (!name) return;
    data.members.push({ id: uid(), name: name });
    ui.newMemberName = "";
    saveData(); render();
  }
  function removeMember(id) {
    data.members = data.members.filter(function (m) { return m.id !== id; });
    saveData(); render();
  }
  function renameMember(id, newName) {
    var name = newName.trim();
    if (!name) return;
    data.members = data.members.map(function (m) { return m.id === id ? Object.assign({}, m, { name: name }) : m; });
    saveData(); render();
  }
  function addTraining() {
    if (!ui.newTrainingDate) return;
    var endDate = ui.newTrainingEndDate && ui.newTrainingEndDate > ui.newTrainingDate ? ui.newTrainingEndDate : null;
    var t = { id: uid(), date: ui.newTrainingDate, endDate: endDate, note: ui.newTrainingNote.trim(), type: ui.newTrainingType };
    data.trainings.push(t);
    data.trainings.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    ui.newTrainingNote = ""; ui.newTrainingEndDate = "";
    saveData(); render();
  }
  function removeTraining(id) {
    data.trainings = data.trainings.filter(function (t) { return t.id !== id; });
    delete data.attendance[id];
    if (ui.selectedTrainingId === id) ui.selectedTrainingId = null;
    saveData(); render();
  }
  function setMemberAttendance(trainingId, memberId, value) {
    if (!data.attendance[trainingId]) data.attendance[trainingId] = {};
    data.attendance[trainingId][memberId] = value;
    saveData(); render();
  }
  function markAll(trainingId, value) {
    var obj = {};
    data.members.forEach(function (m) { obj[m.id] = value; });
    data.attendance[trainingId] = obj;
    saveData(); render();
  }

  // ---------- rendering ----------
  var appEl;
  function render() { appEl.innerHTML = renderApp(); bindEvents(); }
  function renderTopStatusOnly() {
    var s = appEl.querySelector("#saving-indicator");
    var e = appEl.querySelector("#error-indicator");
    if (s) s.style.display = ui.saving ? "inline" : "none";
    if (e) { e.style.display = ui.error ? "block" : "none"; e.textContent = ui.error; }
  }

  function renderApp() {
    var html = "";
    html += '<div class="header"><h1>Dochádzka na tréningu</h1><span id="saving-indicator" class="saving" style="display:' + (ui.saving ? "inline" : "none") + '">Ukladám\u2026</span></div>';
    html += '<div id="error-indicator" class="error" style="display:' + (ui.error ? "block" : "none") + '">' + esc(ui.error) + "</div>";

    if (ui.selectedTrainingId) return html + renderTrainingDetail();
    if (ui.selectedMemberId) return html + renderMemberProfile();

    html += '<div class="tabs">';
    html += tabButton("trainings", "\uD83D\uDCC5", "Tréningy");
    html += tabButton("members", "\uD83D\uDC65", "Členovia");
    html += tabButton("stats", "\uD83D\uDCCA", "Štatistiky");
    html += "</div>";

    if (ui.tab === "trainings") html += renderTrainingsTab();
    else if (ui.tab === "members") html += renderMembersTab();
    else html += renderStatsTab();

    return html;
  }

  function tabButton(key, icon, label) {
    return '<button class="tab-btn' + (ui.tab === key ? " active" : "") + '" data-action="tab" data-tab="' + key + '">' +
      '<span class="tab-icon">' + icon + "</span>" + esc(label) + "</button>";
  }

  function renderTrainingsTab() {
    var html = '<div class="card">';
    html += '<div class="type-picker">';
    Object.keys(EVENT_TYPES).forEach(function (key) {
      var def = EVENT_TYPES[key];
      var active = ui.newTrainingType === key;
      var style = active ? "border-color:" + def.color + ";background:" + def.bg + ";color:" + def.text + ";font-weight:600;" : "";
      html += '<button class="type-btn' + (active ? " active" : "") + '" style="' + style + '" data-action="set-type" data-type="' + key + '">' + esc(def.label) + "</button>";
    });
    html += "</div>";

    if (ui.newTrainingType === "trening") {
      html += '<div class="quickday-row">' +
        '<button class="btn" data-action="quickday" data-day="2">Najbl. utorok</button>' +
        '<button class="btn" data-action="quickday" data-day="4">Najbl. štvrtok</button>' +
        '<button class="btn" data-action="quickday" data-day="5">Najbl. piatok</button>' +
        "</div>";
    }

    html += '<div class="row" style="margin-bottom:8px">';
    html += '<input type="date" id="input-new-date" value="' + ui.newTrainingDate + '" />';
    if (ui.newTrainingType === "turnaj") {
      html += '<span class="small">do</span>';
      html += '<input type="date" id="input-new-enddate" value="' + ui.newTrainingEndDate + '" min="' + ui.newTrainingDate + '" />';
    }
    html += "</div>";

    html += '<div class="row">';
    html += '<input type="text" id="input-new-note" placeholder="Poznámka (nepovinné)" value="' + esc(ui.newTrainingNote) + '" />';
    html += '<button class="btn-primary" data-action="add-training">\u2795 Pridať</button>';
    html += "</div></div>";

    if (data.trainings.length === 0) {
      html += '<div class="empty">Zatiaľ žiadne udalosti. Pridaj prvú vyššie.</div>';
      return html;
    }

    var today = todayISO();
    var groups = []; var currentKey = null;
    data.trainings.forEach(function (t) {
      var d = new Date(t.date + "T00:00:00");
      var key = d.getFullYear() + "-" + d.getMonth();
      if (key !== currentKey) { groups.push({ key: key, label: MONTHS_SK[d.getMonth()] + " " + d.getFullYear(), items: [] }); currentKey = key; }
      groups[groups.length - 1].items.push(t);
    });

    groups.forEach(function (g) {
      html += '<div class="month-label">' + esc(g.label) + "</div>";
      g.items.forEach(function (t) {
        var att = data.attendance[t.id] || {};
        var presentCount = data.members.filter(function (m) { return att[m.id] === true; }).length;
        var def = eventType(t);
        var isPast = t.date < today;
        html += '<div class="card event-card' + (isPast ? " past" : "") + '" style="border-left-color:' + def.color + '">';
        html += '<div class="row">';
        html += '<div style="cursor:pointer;flex:1" data-action="open-training" data-id="' + t.id + '">';
        html += '<div class="row" style="justify-content:flex-start;gap:8px">';
        html += '<span style="font-weight:600">' + esc(formatDateRange(t.date, t.endDate)) + "</span>";
        html += '<span class="badge" style="background:' + def.bg + ";color:" + def.text + '">' + esc(def.label) + "</span>";
        html += "</div>";
        if (t.note) html += '<div class="small">' + esc(t.note) + "</div>";
        html += '<div class="small">' + presentCount + " / " + data.members.length + " prítomných</div>";
        html += "</div>";
        html += '<button class="icon-btn" data-action="remove-training" data-id="' + t.id + '">\uD83D\uDDD1\uFE0F</button>';
        html += "</div></div>";
      });
    });
    return html;
  }

  function renderTrainingDetail() {
    var t = data.trainings.find(function (x) { return x.id === ui.selectedTrainingId; });
    if (!t) { ui.selectedTrainingId = null; return renderApp(); }
    var att = data.attendance[t.id] || {};
    var presentCount = data.members.filter(function (m) { return att[m.id] === true; }).length;
    var def = eventType(t);

    var html = '<button class="btn" style="margin-bottom:12px" data-action="back-training">\u2b05\ufe0f Späť</button>';
    html += '<div style="margin-bottom:12px">';
    html += '<div class="row" style="justify-content:flex-start;gap:8px">';
    html += '<span style="font-weight:600;font-size:16px">' + esc(formatDateRange(t.date, t.endDate)) + "</span>";
    html += '<span class="badge" style="background:' + def.bg + ";color:" + def.text + '">' + esc(def.label) + "</span>";
    html += "</div>";
    if (t.note) html += '<div class="small">' + esc(t.note) + "</div>";
    html += '<div class="small">Prítomných: ' + presentCount + " / " + data.members.length + "</div></div>";

    if (data.members.length === 0) {
      html += '<div class="empty">Najprv pridaj členov v záložke „Členovia".</div>';
      return html;
    }

    html += '<div class="row" style="gap:8px;margin-bottom:10px">';
    html += '<button class="btn" data-action="mark-all" data-id="' + t.id + '" data-value="true">\u2705 Označiť všetkých</button>';
    html += '<button class="btn" data-action="mark-all" data-id="' + t.id + '" data-value="false">\u274c Zrušiť všetkých</button>';
    html += "</div>";

    sortedMembers().forEach(function (m) {
      var present = att[m.id] === true;
      var absent = att[m.id] === false;
      html += '<div class="card row">';
      html += "<span>" + esc(m.name) + "</span>";
      html += '<div style="display:flex;gap:6px">';
      html += '<button class="att-btn present' + (present ? " active" : "") + '" data-action="set-att" data-training="' + t.id + '" data-member="' + m.id + '" data-value="true">\u2713</button>';
      html += '<button class="att-btn absent' + (absent ? " active" : "") + '" data-action="set-att" data-training="' + t.id + '" data-member="' + m.id + '" data-value="false">\u2715</button>';
      html += "</div></div>";
    });
    return html;
  }

  function renderMembersTab() {
    var html = '<div class="card row">';
    html += '<input type="text" id="input-new-member" placeholder="Meno člena" value="' + esc(ui.newMemberName) + '" />';
    html += '<button class="btn-primary" data-action="add-member">\u2795 Pridať</button>';
    html += "</div>";

    var members = sortedMembers();
    if (members.length === 0) {
      html += '<div class="empty">Zatiaľ žiadni členovia. Pridaj prvého vyššie.</div>';
      return html;
    }
    members.forEach(function (m) {
      var s = memberStats(m.id);
      html += '<div class="card row" style="cursor:pointer" data-action="open-member" data-id="' + m.id + '">';
      html += "<div><div>" + esc(m.name) + "</div>";
      if (s.total > 0) html += '<div class="small">' + s.pct + "% účasť</div>";
      html += "</div>";
      html += '<button class="icon-btn" data-action="remove-member" data-id="' + m.id + '" data-stop="1">\uD83D\uDDD1\uFE0F</button>';
      html += "</div>";
    });
    return html;
  }

  function renderStatsTab() {
    if (data.members.length === 0 || data.trainings.length === 0) {
      return '<div class="empty">Pridaj členov aj tréningy, aby sa mohli zobraziť štatistiky dochádzky.</div>';
    }
    var rows = sortedMembers().map(function (m) { return { m: m, s: memberStats(m.id) }; });
    rows.sort(function (a, b) { return b.s.pct - a.s.pct; });
    var html = "";
    rows.forEach(function (r) {
      html += '<div class="card">';
      html += '<div class="row" style="margin-bottom:6px"><span>' + esc(r.m.name) + '</span><span style="font-weight:600">' + r.s.pct + "%</span></div>";
      html += '<div class="progress-bar"><div class="progress-fill" style="width:' + r.s.pct + '%"></div></div>';
      html += '<div class="small">' + r.s.present + " / " + r.s.total + " tréningov</div></div>";
    });
    return html;
  }

  function renderMemberProfile() {
    var m = data.members.find(function (x) { return x.id === ui.selectedMemberId; });
    if (!m) { ui.selectedMemberId = null; return renderApp(); }
    var s = memberStats(m.id);
    var year = ui.calendarYear, month = ui.calendarMonth;
    var cells = buildCalendarDays(year, month);

    var trainingByDate = {};
    data.trainings.forEach(function (t) {
      var end = t.endDate || t.date;
      var cur = t.date;
      while (cur <= end) {
        trainingByDate[cur] = t;
        var d = new Date(cur + "T00:00:00");
        d.setDate(d.getDate() + 1);
        cur = d.toISOString().slice(0, 10);
      }
    });

    var html = '<button class="btn" style="margin-bottom:12px" data-action="back-member">\u2b05\ufe0f Späť</button>';

    if (!ui.isEditingMember) {
      html += '<div class="row align-start" style="margin-bottom:14px">';
      html += "<div><div style=\"font-weight:600;font-size:16px\">" + esc(m.name) + "</div>";
      html += '<div class="small">' + s.present + " / " + s.total + " tréningov \u00b7 " + s.pct + "% účasť</div></div>";
      html += '<button class="icon-btn" data-action="edit-member">\u270f\ufe0f</button>';
      html += "</div>";
    } else {
      html += '<div class="card" style="margin-bottom:14px;display:flex;flex-direction:column;gap:8px">';
      html += '<label class="small">Meno hráča</label>';
      html += '<input type="text" id="input-edit-name" value="' + esc(ui.editingName) + '" />';
      html += '<div style="display:flex;gap:8px">';
      html += '<button class="btn-primary" data-action="save-member-name" data-id="' + m.id + '">Uložiť</button>';
      html += '<button class="btn" data-action="cancel-edit-member">Zrušiť</button>';
      html += "</div></div>";
    }

    html += '<div class="card">';
    html += '<div class="row" style="margin-bottom:10px">';
    html += '<button class="icon-btn" data-action="shift-month" data-delta="-1">\u2b05\ufe0f</button>';
    html += '<div style="font-weight:600;font-size:14px">' + MONTHS_SK[month] + " " + year + "</div>";
    html += '<button class="icon-btn" data-action="shift-month" data-delta="1">\u27a1\ufe0f</button>';
    html += "</div>";

    html += '<div class="calendar-grid" style="margin-bottom:4px">';
    WEEKDAYS_SK.forEach(function (w) { html += '<div class="weekday-label">' + w + "</div>"; });
    html += "</div>";

    html += '<div class="calendar-grid">';
    cells.forEach(function (cell) {
      if (!cell) { html += "<div></div>"; return; }
      var t = trainingByDate[cell.iso];
      var cls = "cal-cell";
      if (t) {
        var mark = data.attendance[t.id] ? data.attendance[t.id][m.id] : undefined;
        if (mark === true) cls += " present";
        else if (mark === false) cls += " absent";
        else cls += " has-event";
      }
      html += '<div class="' + cls + '" title="' + esc(t ? (t.note || formatDate(cell.iso)) : "") + '">' + cell.day + "</div>";
    });
    html += "</div>";

    html += '<div class="legend">';
    html += '<span><span class="legend-dot" style="background:#639922"></span>Prítomný</span>';
    html += '<span><span class="legend-dot" style="background:#e24b4a"></span>Neprítomný</span>';
    html += "</div></div>";

    return html;
  }

  // ---------- events ----------
  function bindEvents() {
    var dateEl = document.getElementById("input-new-date");
    if (dateEl) dateEl.addEventListener("change", function (e) { ui.newTrainingDate = e.target.value; render(); });
    var endDateEl = document.getElementById("input-new-enddate");
    if (endDateEl) endDateEl.addEventListener("change", function (e) { ui.newTrainingEndDate = e.target.value; });
    var noteEl = document.getElementById("input-new-note");
    if (noteEl) noteEl.addEventListener("input", function (e) { ui.newTrainingNote = e.target.value; });
    var memberInputEl = document.getElementById("input-new-member");
    if (memberInputEl) {
      memberInputEl.addEventListener("input", function (e) { ui.newMemberName = e.target.value; });
      memberInputEl.addEventListener("keydown", function (e) { if (e.key === "Enter") addMember(); });
    }
    var editNameEl = document.getElementById("input-edit-name");
    if (editNameEl) {
      editNameEl.addEventListener("input", function (e) { ui.editingName = e.target.value; });
      editNameEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && ui.editingName.trim()) {
          renameMember(ui.selectedMemberId, ui.editingName);
          ui.isEditingMember = false;
        }
      });
    }
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    switch (action) {
      case "tab": ui.tab = el.getAttribute("data-tab"); render(); break;
      case "set-type": ui.newTrainingType = el.getAttribute("data-type"); render(); break;
      case "quickday": ui.newTrainingDate = nextWeekday(parseInt(el.getAttribute("data-day"), 10)); render(); break;
      case "add-training": addTraining(); break;
      case "open-training": ui.selectedTrainingId = el.getAttribute("data-id"); render(); break;
      case "back-training": ui.selectedTrainingId = null; render(); break;
      case "remove-training": removeTraining(el.getAttribute("data-id")); break;
      case "mark-all": markAll(el.getAttribute("data-id"), el.getAttribute("data-value") === "true"); break;
      case "set-att": setMemberAttendance(el.getAttribute("data-training"), el.getAttribute("data-member"), el.getAttribute("data-value") === "true"); break;
      case "add-member": addMember(); break;
      case "open-member":
        ui.selectedMemberId = el.getAttribute("data-id");
        ui.isEditingMember = false;
        render();
        break;
      case "remove-member": e.stopPropagation(); removeMember(el.getAttribute("data-id")); break;
      case "back-member": ui.selectedMemberId = null; render(); break;
      case "edit-member":
        var mm = data.members.find(function (x) { return x.id === ui.selectedMemberId; });
        ui.editingName = mm ? mm.name : "";
        ui.isEditingMember = true;
        render();
        break;
      case "cancel-edit-member": ui.isEditingMember = false; render(); break;
      case "save-member-name":
        if (ui.editingName.trim()) { renameMember(el.getAttribute("data-id"), ui.editingName); ui.isEditingMember = false; }
        break;
      case "shift-month":
        var delta = parseInt(el.getAttribute("data-delta"), 10);
        var mo = ui.calendarMonth + delta, yr = ui.calendarYear;
        if (mo < 0) { mo = 11; yr--; } if (mo > 11) { mo = 0; yr++; }
        ui.calendarMonth = mo; ui.calendarYear = yr;
        render();
        break;
    }
  });

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", function () {
    appEl = document.getElementById("app");
    loadData();
    render();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    }
  });
})();
