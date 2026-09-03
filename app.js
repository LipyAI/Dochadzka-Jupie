import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, doc, onSnapshot, setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

(function () {
  "use strict";

  var ADMIN_CODE = "293919";
  var LOGIN_KEY = "dochadzka-login-code";

  var EVENT_TYPES = {
    trening: { label: "Tréning", color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
    zapas: { label: "Zápas", color: "#D85A30", bg: "#FAECE7", text: "#993C1D" },
    turnaj: { label: "Turnaj", color: "#7F77DD", bg: "#EEEDFE", text: "#3C3489" },
  };
  var ACTION_LABELS = {
    "add-event": "pridal(a) udalosť",
    "add-member": "pridal(a) hráča",
    "attendance": "upravil(a) dochádzku",
    "delete-event": "vymazal(a) udalosť",
    "delete-member": "vymazal(a) hráča",
    "rename-member": "premenoval(a) hráča",
  };

  var WEEKDAYS_SK = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
  var MONTHS_SK = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];

  // ---------- utils ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function isoDate(d) {
    // Local-timezone-safe date formatting (toISOString() converts to UTC and can
    // shift the date by one day for timezones ahead of UTC, like Slovakia).
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function todayISO() { return isoDate(new Date()); }
  function isValidCode(s) { return /^\d{6}$/.test(String(s || "").trim()); }
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
  function formatDateTime(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString("sk-SK", { day: "numeric", month: "short" }) + " " +
      d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
  }
  function nextWeekday(targetDay) {
    var d = new Date();
    var diff = (targetDay - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
    return isoDate(d);
  }
  function addDays(iso, days) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return isoDate(d);
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

  // ---------- shared (Firebase) state ----------
  var data = { members: [], trainings: [], attendance: {}, log: [] };
  var db, docRef;

  function initFirebase() {
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || cfg.apiKey.indexOf("TVOJ_") === 0) {
      ui.error = "Appka ešte nie je pripojená k databáze. Doplň hodnoty vo firebase-config.js.";
      render();
      return;
    }
    var app = initializeApp(cfg);
    db = getFirestore(app);
    docRef = doc(db, "dochadzka", "shared");

    var connected = false;
    setTimeout(function () {
      if (!connected) {
        ui.error = "Pripojenie k databáze trvá nezvyčajne dlho. Skontroluj internetové pripojenie alebo skús appku otvoriť v inom prehliadači (napr. Chrome). Ak máš v Safari zapnutý blokovač obsahu / VPN / Private Relay, skús ho pre túto stránku vypnúť.";
        render();
      }
    }, 8000);

    onSnapshot(
      docRef,
      function (snap) {
        connected = true;
        ui.dataLoaded = true;
        if (snap.exists()) {
          var d = snap.data();
          data.members = d.members || [];
          data.trainings = d.trainings || [];
          data.attendance = d.attendance || {};
          data.log = d.log || [];
        }
        ui.error = "";
        render();
      },
      function (err) {
        connected = true;
        ui.error = "Chyba pripojenia k databáze: " + err.message;
        render();
      }
    );
  }

  var saveTimer = null;
  function saveData() {
    if (!docRef) return;
    ui.saving = true;
    renderTopStatusOnly();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      setDoc(docRef, data)
        .then(function () { ui.error = ""; })
        .catch(function (err) { ui.error = "Uloženie zlyhalo: " + err.message; })
        .finally(function () { ui.saving = false; renderTopStatusOnly(); });
    }, 150);
  }

  function pushLog(action, detail, dedupKey) {
    if (!data.log) data.log = [];
    var now = Date.now();
    var key = action + "|" + (dedupKey || "") + "|" + ui.code;
    var last = data.log[data.log.length - 1];
    if (last && last._key === key && (now - last.ts) < 120000) {
      last.ts = now;
    } else {
      data.log.push({ id: uid(), ts: now, code: ui.code, action: action, detail: detail || "", _key: key });
    }
    if (data.log.length > 150) data.log = data.log.slice(data.log.length - 150);
  }

  // ---------- transient UI state ----------
  var ui = {
    code: (function () { try { return sessionStorage.getItem(LOGIN_KEY) || null; } catch (e) { return null; } })(),
    loginInputVal: "",
    loginError: "",
    tab: "trainings",
    selectedTrainingId: null,
    selectedMemberId: null,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    mainCalYear: new Date().getFullYear(),
    mainCalMonth: new Date().getMonth(),
    isEditingMember: false,
    editingName: "",
    newMemberName: "",
    newTrainingDate: todayISO(),
    newTrainingEndDate: "",
    newTrainingNote: "",
    newTrainingType: "trening",
    saving: false,
    error: "",
    dataLoaded: false,
  };

  function isAdmin() { return ui.code === ADMIN_CODE; }

  function sortedMembers() {
    return data.members.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "sk"); });
  }
  function statsEligibleEvents() {
    // Only real trainings count toward attendance %% — matches/tournaments are squad
    // selections, not attendance tracking, so they're excluded here.
    return data.trainings.filter(function (t) { return (t.type || "trening") === "trening"; });
  }
  function memberStats(memberId) {
    var present = 0;
    var events = statsEligibleEvents();
    events.forEach(function (t) {
      if (data.attendance[t.id] && data.attendance[t.id][memberId] === true) present++;
    });
    var total = events.length;
    var pct = total === 0 ? 0 : Math.round((present / total) * 100);
    return { present: present, total: total, pct: pct };
  }
  function eventTypesByDate() {
    var map = {};
    data.trainings.forEach(function (t) {
      var end = t.endDate || t.date;
      var cur = t.date;
      var guard = 0;
      while (cur <= end && guard < 370) {
        guard++;
        if (!map[cur]) map[cur] = [];
        var type = t.type || "trening";
        if (map[cur].indexOf(type) === -1) map[cur].push(type);
        var d = new Date(cur + "T00:00:00");
        if (isNaN(d.getTime())) break;
        d.setDate(d.getDate() + 1);
        cur = isoDate(d);
      }
    });
    return map;
  }
  function firstTrainingOnDate(iso) {
    return data.trainings.find(function (t) {
      var end = t.endDate || t.date;
      return iso >= t.date && iso <= end;
    });
  }

  // ---------- mutations ----------
  function login() {
    if (!isValidCode(ui.loginInputVal)) {
      ui.loginError = "Zadaj platný 6-miestny kód (len číslice).";
      render();
      return;
    }
    ui.code = ui.loginInputVal.trim();
    ui.loginError = "";
    try { sessionStorage.setItem(LOGIN_KEY, ui.code); } catch (e) { /* ignore */ }
    render();
  }
  function logout() {
    ui.code = null;
    ui.loginInputVal = "";
    try { sessionStorage.removeItem(LOGIN_KEY); } catch (e) { /* ignore */ }
    render();
  }

  function addMember() {
    var name = ui.newMemberName.trim();
    if (!name) return;
    data.members.push({ id: uid(), name: name, createdBy: ui.code });
    pushLog("add-member", name);
    ui.newMemberName = "";
    saveData(); render();
  }
  function removeMember(id) {
    if (!isAdmin()) return;
    var m = data.members.find(function (x) { return x.id === id; });
    data.members = data.members.filter(function (x) { return x.id !== id; });
    pushLog("delete-member", m ? m.name : "");
    saveData(); render();
  }
  function renameMember(id, newName) {
    if (!isAdmin()) return;
    var name = newName.trim();
    if (!name) return;
    var old = data.members.find(function (x) { return x.id === id; });
    data.members = data.members.map(function (m) { return m.id === id ? Object.assign({}, m, { name: name }) : m; });
    pushLog("rename-member", (old ? old.name : "") + " \u2192 " + name);
    saveData(); render();
  }
  function addTraining() {
    if (!ui.newTrainingDate) return;
    var endDate = ui.newTrainingEndDate && ui.newTrainingEndDate > ui.newTrainingDate ? ui.newTrainingEndDate : null;
    var t = {
      id: uid(), date: ui.newTrainingDate, endDate: endDate, note: ui.newTrainingNote.trim(),
      type: ui.newTrainingType, createdBy: ui.code, lastEditedBy: null, lastEditedAt: null,
    };
    data.trainings.push(t);
    data.trainings.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    pushLog("add-event", eventType(t).label + " " + formatDateRange(t.date, t.endDate));
    ui.newTrainingNote = ""; ui.newTrainingEndDate = "";
    saveData(); render();
  }
  function duplicateTraining(id) {
    var orig = data.trainings.find(function (x) { return x.id === id; });
    if (!orig) return;
    var newDate = addDays(orig.date, 7);
    var newEndDate = orig.endDate ? addDays(orig.endDate, 7) : null;
    var t = {
      id: uid(), date: newDate, endDate: newEndDate, note: orig.note || "",
      type: orig.type, createdBy: ui.code, lastEditedBy: null, lastEditedAt: null,
    };
    data.trainings.push(t);
    data.trainings.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    pushLog("add-event", eventType(t).label + " " + formatDateRange(t.date, t.endDate) + " (opakovanie)");
    ui.selectedTrainingId = t.id;
    saveData(); render();
  }
  function removeTraining(id) {
    if (!isAdmin()) return;
    var t = data.trainings.find(function (x) { return x.id === id; });
    data.trainings = data.trainings.filter(function (x) { return x.id !== id; });
    delete data.attendance[id];
    if (ui.selectedTrainingId === id) ui.selectedTrainingId = null;
    pushLog("delete-event", t ? (eventType(t).label + " " + formatDateRange(t.date, t.endDate)) : "");
    saveData(); render();
  }
  function touchTraining(trainingId) {
    var t = data.trainings.find(function (x) { return x.id === trainingId; });
    if (t) { t.lastEditedBy = ui.code; t.lastEditedAt = Date.now(); }
    return t;
  }
  function setMemberAttendance(trainingId, memberId, value) {
    if (!data.attendance[trainingId]) data.attendance[trainingId] = {};
    data.attendance[trainingId][memberId] = value;
    var t = touchTraining(trainingId);
    pushLog("attendance", t ? formatDateRange(t.date, t.endDate) : "", trainingId);
    saveData(); render();
  }
  function markAll(trainingId, value) {
    var obj = {};
    data.members.forEach(function (m) { obj[m.id] = value; });
    data.attendance[trainingId] = obj;
    var t = touchTraining(trainingId);
    pushLog("attendance", t ? formatDateRange(t.date, t.endDate) : "", trainingId);
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

    if (!ui.code) return html + renderLogin();

    if (!ui.dataLoaded) {
      html += '<div style="padding:24px;text-align:center;color:#888">Pripájam sa k databáze\u2026</div>';
      return html;
    }

    html += '<div class="row" style="margin-bottom:10px">';
    html += '<span class="small">Prihl\u00e1sen\u00fd k\u00f3d: ' + esc(ui.code) + (isAdmin() ? " (admin)" : "") + '</span>';
    html += '<a href="#" data-action="logout" class="small" style="color:#d85a30">Odhl\u00e1si\u0165</a>';
    html += "</div>";

    if (ui.selectedTrainingId) return html + renderTrainingDetail();
    if (ui.selectedMemberId) return html + renderMemberProfile();

    html += '<div class="tabs">';
    html += tabButton("trainings", "\uD83D\uDCC5", "Tréningy");
    html += tabButton("members", "\uD83D\uDC65", "Členovia");
    html += tabButton("stats", "\uD83D\uDCCA", "Štatistiky");
    if (isAdmin()) html += tabButton("activity", "\uD83D\uDCCB", "Aktivita");
    html += "</div>";

    if (ui.tab === "trainings") html += renderTrainingsTab();
    else if (ui.tab === "members") html += renderMembersTab();
    else if (ui.tab === "activity" && isAdmin()) html += renderActivityTab();
    else html += renderStatsTab();

    return html;
  }

  function renderLogin() {
    var html = '<div class="card" style="text-align:center;padding:26px 16px">';
    html += '<div style="font-weight:600;font-size:16px;margin-bottom:6px">Zadaj sv\u00f4j 6-miestny k\u00f3d</div>';
    html += '<div class="small" style="margin-bottom:16px">K\u00f3d si zvol\u00ed\u0161 s\u00e1m. Po zatvoren\u00ed appky bude\u0161 musie\u0165 k\u00f3d zada\u0165 znova.</div>';
    html += '<input type="tel" inputmode="numeric" maxlength="6" id="input-login-code" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022" ' +
      'style="text-align:center;font-size:22px;letter-spacing:7px;width:190px;margin:0 auto 12px;display:block;border:1px solid #ddd;border-radius:8px;padding:9px 0" value="' + esc(ui.loginInputVal) + '" />';
    if (ui.loginError) html += '<div class="error" style="display:block;margin-bottom:10px">' + esc(ui.loginError) + "</div>";
    html += '<button class="btn-primary" data-action="login">Vst\u00fapi\u0165</button>';
    html += "</div>";
    return html;
  }

  function tabButton(key, icon, label) {
    return '<button class="tab-btn' + (ui.tab === key ? " active" : "") + '" data-action="tab" data-tab="' + key + '">' +
      '<span class="tab-icon">' + icon + "</span>" + esc(label) + "</button>";
  }

  function renderOverviewCalendar() {
    var year = ui.mainCalYear, month = ui.mainCalMonth;
    var cells = buildCalendarDays(year, month);
    var typesByDate = eventTypesByDate();

    var html = '<div class="card">';
    html += '<div class="row" style="margin-bottom:10px">';
    html += '<button class="icon-btn" data-action="shift-main-month" data-delta="-1">\u2b05\ufe0f</button>';
    html += '<div style="font-weight:600;font-size:14px">' + MONTHS_SK[month] + " " + year + "</div>";
    html += '<button class="icon-btn" data-action="shift-main-month" data-delta="1">\u27a1\ufe0f</button>';
    html += "</div>";

    html += '<div class="calendar-grid" style="margin-bottom:4px">';
    WEEKDAYS_SK.forEach(function (w) { html += '<div class="weekday-label">' + w + "</div>"; });
    html += "</div>";

    html += '<div class="calendar-grid">';
    cells.forEach(function (cell) {
      if (!cell) { html += "<div></div>"; return; }
      var types = typesByDate[cell.iso];
      var clickable = types && types.length > 0;
      html += '<div class="mini-cal-cell' + (clickable ? " clickable" : "") + '"' +
        (clickable ? ' data-action="open-day" data-iso="' + cell.iso + '"' : "") + ">";
      html += '<span class="mini-cal-day">' + cell.day + "</span>";
      if (types) {
        html += '<span class="mini-cal-dots">';
        types.slice(0, 3).forEach(function (ty) {
          html += '<span class="mini-dot" style="background:' + eventType({ type: ty }).color + '"></span>';
        });
        html += "</span>";
      }
      html += "</div>";
    });
    html += "</div></div>";
    return html;
  }

  function renderTrainingsTab() {
    var html = renderOverviewCalendar();

    html += '<div class="card">';
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
        if (isAdmin()) html += '<button class="icon-btn" data-action="remove-training" data-id="' + t.id + '">\uD83D\uDDD1\uFE0F</button>';
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

    var html = '<div class="row" style="margin-bottom:12px">';
    html += '<button class="btn" data-action="back-training">\u2b05\ufe0f Späť</button>';
    html += '<button class="btn" data-action="duplicate-training" data-id="' + t.id + '">\ud83d\udd01 Zopakova\u0165 o t\u00fd\u017ede\u0148</button>';
    html += "</div>";
    html += '<div style="margin-bottom:12px">';
    html += '<div class="row" style="justify-content:flex-start;gap:8px">';
    html += '<span style="font-weight:600;font-size:16px">' + esc(formatDateRange(t.date, t.endDate)) + "</span>";
    html += '<span class="badge" style="background:' + def.bg + ";color:" + def.text + '">' + esc(def.label) + "</span>";
    html += "</div>";
    if (t.note) html += '<div class="small">' + esc(t.note) + "</div>";
    html += '<div class="small">Prítomných: ' + presentCount + " / " + data.members.length + "</div>";
    if (isAdmin()) {
      if (t.createdBy) html += '<div class="small">Vytvoril k\u00f3d: ' + esc(t.createdBy) + "</div>";
      if (t.lastEditedBy) html += '<div class="small">Naposledy upravil k\u00f3d: ' + esc(t.lastEditedBy) + " (" + formatDateTime(t.lastEditedAt) + ")</div>";
    }
    html += "</div>";

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
      if (isAdmin()) html += '<button class="icon-btn" data-action="remove-member" data-id="' + m.id + '" data-stop="1">\uD83D\uDDD1\uFE0F</button>';
      html += "</div>";
    });
    return html;
  }

  function renderStatsTab() {
    if (data.members.length === 0 || statsEligibleEvents().length === 0) {
      return '<div class="empty">Pridaj členov aj tréningy, aby sa mohli zobraziť štatistiky dochádzky. (Zápasy a turnaje sa do štatistiky nepočítajú.)</div>';
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

  function renderActivityTab() {
    var html = '<div class="card row">';
    html += '<div><div style="font-weight:600">Záloha dát</div><div class="small">Stiahne aktu\u00e1lny stav (\u010dlenovia, udalosti, doch\u00e1dzka, denn\u00edk) ako s\u00fabor.</div></div>';
    html += '<button class="btn-primary" data-action="export-backup">\u2b07\ufe0f St\u00edahnu\u0165</button>';
    html += "</div>";

    var log = (data.log || []).slice().sort(function (a, b) { return b.ts - a.ts; });
    if (log.length === 0) return html + '<div class="empty">Zatiaľ žiadna aktivita.</div>';
    log.forEach(function (entry) {
      var label = ACTION_LABELS[entry.action] || entry.action;
      html += '<div class="card">';
      html += '<div class="row"><span><strong>' + esc(entry.code) + "</strong> " + esc(label) + "</span>";
      html += '<span class="small">' + formatDateTime(entry.ts) + "</span></div>";
      if (entry.detail) html += '<div class="small">' + esc(entry.detail) + "</div>";
      html += "</div>";
    });
    return html;
  }

  function exportBackup() {
    try {
      var clean = {
        exportedAt: new Date().toISOString(),
        members: data.members,
        trainings: data.trainings,
        attendance: data.attendance,
        log: data.log,
      };
      var blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var stamp = todayISO();
      a.href = url;
      a.download = "dochadzka-zaloha-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      ui.error = "Zálohu sa nepodarilo stiahnuť: " + e.message;
      render();
    }
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
      var guard = 0;
      while (cur <= end && guard < 370) {
        guard++;
        trainingByDate[cur] = t;
        var d = new Date(cur + "T00:00:00");
        if (isNaN(d.getTime())) break;
        d.setDate(d.getDate() + 1);
        cur = isoDate(d);
      }
    });

    var html = '<button class="btn" style="margin-bottom:12px" data-action="back-member">\u2b05\ufe0f Späť</button>';

    if (!ui.isEditingMember) {
      html += '<div class="row align-start" style="margin-bottom:14px">';
      html += "<div><div style=\"font-weight:600;font-size:16px\">" + esc(m.name) + "</div>";
      html += '<div class="small">' + s.present + " / " + s.total + " tréningov \u00b7 " + s.pct + "% účasť</div></div>";
      if (isAdmin()) html += '<button class="icon-btn" data-action="edit-member">\u270f\ufe0f</button>';
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
    var loginEl = document.getElementById("input-login-code");
    if (loginEl) {
      loginEl.addEventListener("input", function (e) { ui.loginInputVal = e.target.value.replace(/\D/g, "").slice(0, 6); e.target.value = ui.loginInputVal; });
      loginEl.addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
      loginEl.focus();
    }
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
    e.preventDefault();
    var action = el.getAttribute("data-action");
    switch (action) {
      case "login": login(); break;
      case "export-backup": exportBackup(); break;
      case "logout": logout(); break;
      case "tab": ui.tab = el.getAttribute("data-tab"); render(); break;
      case "set-type": ui.newTrainingType = el.getAttribute("data-type"); render(); break;
      case "quickday": ui.newTrainingDate = nextWeekday(parseInt(el.getAttribute("data-day"), 10)); render(); break;
      case "add-training": addTraining(); break;
      case "duplicate-training": duplicateTraining(el.getAttribute("data-id")); break;
      case "open-training": ui.selectedTrainingId = el.getAttribute("data-id"); render(); break;
      case "open-day":
        var t = firstTrainingOnDate(el.getAttribute("data-iso"));
        if (t) { ui.selectedTrainingId = t.id; render(); }
        break;
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
      case "shift-main-month":
        var d2 = parseInt(el.getAttribute("data-delta"), 10);
        var mo2 = ui.mainCalMonth + d2, yr2 = ui.mainCalYear;
        if (mo2 < 0) { mo2 = 11; yr2--; } if (mo2 > 11) { mo2 = 0; yr2++; }
        ui.mainCalMonth = mo2; ui.mainCalYear = yr2;
        render();
        break;
    }
  });

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", function () {
    appEl = document.getElementById("app");
    render();
    initFirebase();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    }
  });
})();
