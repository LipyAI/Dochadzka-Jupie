import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, deleteDoc, addDoc,
  query, orderBy, limit, getDoc, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth, setPersistence, browserSessionPersistence, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

(function () {
  "use strict";

  var APP_VERSION = "1.14.0";
  var ADMIN_USERNAME = "lublip";
  // Tréneri a vedúci: smú upravovať existujúce udalosti (pridávať ich už
  // môže ktokoľvek prihlásený), ale nemajú plné admin práva (mazanie
  // hráčov/udalostí, premenovanie hráčov, záložka Aktivita, záloha dát).
  var TRAINER_USERNAMES = ["lukpsi", "martom"];
  var MANAGER_USERNAMES = ["matdrd"];
  var THEME_KEY = "dochadzka-theme";
  var BIO_CRED_KEY = "dochadzka-bio-credential";
  var BIO_CODE_KEY = "dochadzka-bio-code";

  function applyTheme(theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }

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
    "edit-event": "upravil(a) udalosť",
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
  function stripDiacritics(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  // Lowercase is the canonical form everywhere (Firestore doc IDs, the
  // ADMIN_USERNAME/TRAINER_USERNAMES/MANAGER_USERNAMES lists, the derived
  // Firebase Auth email) because Firebase Authentication itself always
  // lowercases the email address it stores - deriving the signed-in
  // username back from auth.currentUser.email would otherwise silently
  // stop matching a mixed-case constant. displayUsername() below restores
  // the nicer look for the UI only, never for comparisons/lookups.
  function computeUsername(fullName) {
    var parts = stripDiacritics(fullName).trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return "";
    function chunk(word) {
      return word.replace(/[^a-zA-Z]/g, "").slice(0, 3).toLowerCase();
    }
    var first = chunk(parts[0]);
    var last = chunk(parts[parts.length - 1]);
    return first && last ? first + last : "";
  }
  function displayUsername(username) {
    var s = String(username || "");
    var out = "";
    for (var i = 0; i < s.length; i += 3) {
      out += s.charAt(i).toUpperCase() + s.slice(i + 1, i + 3);
    }
    return out;
  }
  function isValidPassword(pw) {
    return typeof pw === "string" && pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
  }
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
  function formatEventWhen(t) {
    var base = formatDateRange(t.date, t.endDate);
    return t.time ? base + " \u00b7 " + t.time : base;
  }
  function presentWord(t) {
    return (t.type || "trening") === "trening" ? "prítomných" : "nominovaných";
  }
  function presentWordCap(t) {
    return (t.type || "trening") === "trening" ? "Prítomných" : "Nominovaných";
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
  var AVATAR_COLORS = ["#D85A30", "#378ADD", "#7F77DD", "#3C9D6B", "#C9972B", "#B8481F", "#5B8DD9", "#9C6ADE"];
  function avatarColor(id) {
    var hash = 0;
    var s = String(id || "");
    for (var i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    var chars = parts.slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); });
    return chars.join("");
  }
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var ICON_PATHS = {
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.7-3 3-4.6 5.5-4.6s4.8 1.6 5.5 4.6"/><circle cx="17.5" cy="9.5" r="2.6"/><path d="M15.6 14.8c2.1.4 3.7 1.8 4.3 4.2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/>',
    pencil: '<path d="M4 20l.9-3.6L16 5.3a1.5 1.5 0 0 1 2.1 0l.6.6a1.5 1.5 0 0 1 0 2.1L7.6 19.1 4 20z"/>',
    "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    repeat: '<path d="M17 2l4 4-4 4M21 6H8a4 4 0 0 0-4 4M7 22l-4-4 4-4M3 18h13a4 4 0 0 0 4-4"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    inbox: '<path d="M4 12h4l2 3h4l2-3h4"/><path d="M5.5 5h13l2.5 7v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7z"/>',
    faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/>' +
      '<circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="M9 15c1 1 5 1 6 0"/>'
  };
  function svgIcon(name, cls) {
    return '<svg class="' + (cls || "icon") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[name] || "") + "</svg>";
  }
  function emptyState(text) {
    return '<div class="empty">' + svgIcon("inbox", "icon empty-icon") + '<div>' + text + "</div></div>";
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
  var db, auth;
  var membersCol, trainingsCol, attendanceCol, logCol, accountsCol, metaDocRef, legacyDocRef;
  var unsubFns = [];
  var currentUid = null;

  function initFirebase() {
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || cfg.apiKey.indexOf("TVOJ_") === 0) {
      ui.error = "Appka ešte nie je pripojená k databáze. Doplň hodnoty vo firebase-config.js.";
      render();
      return;
    }
    var app = initializeApp(cfg);
    // Local IndexedDB cache: the app shows the last-synced state instantly on
    // reopen and can queue writes made while briefly offline (e.g. weak
    // signal at the training ground), syncing them once back online.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    auth = getAuth(app);
    membersCol = collection(db, "members");
    trainingsCol = collection(db, "trainings");
    attendanceCol = collection(db, "attendance");
    logCol = collection(db, "activityLog");
    accountsCol = collection(db, "accounts");
    metaDocRef = doc(db, "meta", "migration");
    legacyDocRef = doc(db, "dochadzka", "shared");

    // Session-only persistence matches the app's existing "closed the app ->
    // log in again" behaviour instead of Firebase Auth's default of staying
    // signed in indefinitely across browser restarts.
    setPersistence(auth, browserSessionPersistence).catch(function () { /* defaults still work */ });

    onAuthStateChanged(auth, function (user) {
      ui.authResolved = true;
      if (user) {
        if (currentUid !== user.uid) {
          currentUid = user.uid;
          ui.code = user.email && user.email.indexOf(AUTH_EMAIL_DOMAIN) !== -1
            ? user.email.slice(0, user.email.indexOf(AUTH_EMAIL_DOMAIN))
            : user.email;
          ui.authBusy = false;
          loadData();
        }
      } else {
        currentUid = null;
        stopListeners();
        data.members = []; data.trainings = []; data.attendance = {}; data.log = [];
        ui.code = null;
        ui.dataLoaded = false;
        ui.authMode = "login";
        ui.loginUsernameVal = ""; ui.loginPasswordVal = "";
      }
      render();
    });
  }

  function loadData() {
    ui.dataLoaded = false;
    setTimeout(function () {
      if (!ui.dataLoaded) {
        ui.error = "Pripojenie k databáze trvá nezvyčajne dlho. Skontroluj internetové pripojenie alebo skús appku otvoriť v inom prehliadači (napr. Chrome). Ak máš v Safari zapnutý blokovač obsahu / VPN / Private Relay, skús ho pre túto stránku vypnúť.";
        render();
      }
    }, 8000);

    ensureMigration()
      .then(startListeners)
      .catch(function (err) {
        ui.error = "Chyba pri inicializ\u00e1cii datab\u00e1zy: " + err.message;
        render();
      });
  }

  // One-time copy of data from the old single-document layout into the new
  // collections, so nothing gets lost when upgrading. The legacy document is
  // left untouched afterwards (kept only as a safety-net backup).
  function ensureMigration() {
    return getDoc(metaDocRef).then(function (metaSnap) {
      if (metaSnap.exists() && metaSnap.data().done) return;
      return getDoc(legacyDocRef).then(function (legacySnap) {
        if (!legacySnap.exists()) {
          return setDoc(metaDocRef, { done: true, migratedAt: Date.now(), note: "no legacy data" });
        }
        var legacy = legacySnap.data();
        var items = [];
        (legacy.members || []).forEach(function (m) {
          items.push({ ref: doc(membersCol, m.id), data: { name: m.name, createdBy: m.createdBy || null } });
        });
        (legacy.trainings || []).forEach(function (t) {
          items.push({
            ref: doc(trainingsCol, t.id),
            data: {
              date: t.date, endDate: t.endDate || null, time: t.time || null, note: t.note || "", type: t.type || "trening",
              createdBy: t.createdBy || null, lastEditedBy: t.lastEditedBy || null, lastEditedAt: t.lastEditedAt || null,
            },
          });
        });
        var att = legacy.attendance || {};
        Object.keys(att).forEach(function (trainingId) {
          Object.keys(att[trainingId]).forEach(function (memberId) {
            items.push({
              ref: doc(attendanceCol, trainingId + "_" + memberId),
              data: { trainingId: trainingId, memberId: memberId, present: att[trainingId][memberId] },
            });
          });
        });
        (legacy.log || []).forEach(function (entry) {
          items.push({
            ref: doc(logCol, entry.id || uid()),
            data: { ts: entry.ts, code: entry.code, action: entry.action, detail: entry.detail || "" },
          });
        });
        return batchedSet(items).then(function () {
          return setDoc(metaDocRef, { done: true, migratedAt: Date.now(), migratedCount: items.length });
        });
      });
    });
  }

  function batchedSet(items) {
    var chunks = [];
    for (var i = 0; i < items.length; i += 400) chunks.push(items.slice(i, i + 400));
    var p = Promise.resolve();
    chunks.forEach(function (chunk) {
      p = p.then(function () {
        var batch = writeBatch(db);
        chunk.forEach(function (it) { batch.set(it.ref, it.data); });
        return batch.commit();
      });
    });
    return p;
  }

  function startListeners() {
    // Only members+trainings gate the initial "loading" screen - those are
    // what the Tréningy/Členovia tabs need to render at all. attendance and
    // activityLog stream in just after and the UI re-renders as they arrive
    // (present-counts briefly read 0 until attendance lands, self-corrects).
    // activityLog is also admin-only under the Firestore rules, so only the
    // admin account subscribes to it at all.
    var loaded = { members: false, trainings: false };
    function checkAllLoaded() {
      if (loaded.members && loaded.trainings) ui.dataLoaded = true;
    }
    function onErr(err) {
      ui.error = "Chyba pripojenia k databáze: " + err.message;
      render();
    }

    unsubFns.push(onSnapshot(membersCol, function (snap) {
      data.members = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      loaded.members = true; checkAllLoaded(); ui.error = ""; render();
    }, onErr));

    unsubFns.push(onSnapshot(trainingsCol, function (snap) {
      data.trainings = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      loaded.trainings = true; checkAllLoaded(); ui.error = ""; render();
    }, onErr));

    unsubFns.push(onSnapshot(attendanceCol, function (snap) {
      var att = {};
      snap.docs.forEach(function (d) {
        var v = d.data();
        if (!att[v.trainingId]) att[v.trainingId] = {};
        att[v.trainingId][v.memberId] = v.present;
      });
      data.attendance = att;
      ui.error = ""; render();
    }, onErr));

    if (isAdmin()) {
      unsubFns.push(onSnapshot(query(logCol, orderBy("ts", "desc"), limit(200)), function (snap) {
        data.log = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        ui.error = ""; render();
      }, onErr));
    }
  }

  function stopListeners() {
    unsubFns.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
    unsubFns = [];
  }

  function withSaving(promise) {
    ui.saving = true;
    renderTopStatusOnly();
    return promise
      .then(function () { ui.error = ""; })
      .catch(function (err) { ui.error = "Uloženie zlyhalo: " + err.message; render(); })
      .finally(function () { ui.saving = false; renderTopStatusOnly(); });
  }

  function logAction(action, detail, dedupKey) {
    var now = Date.now();
    var key = action + "|" + (dedupKey || "") + "|" + ui.code;
    var last = data.log[0]; // newest first (ordered by ts desc)
    if (last && last._key === key && (now - last.ts) < 120000) {
      withSaving(setDoc(doc(logCol, last.id), { ts: now }, { merge: true }));
      return;
    }
    withSaving(addDoc(logCol, { ts: now, code: ui.code, action: action, detail: detail || "", _key: key }));
  }

  // ---------- biometric unlock (Face ID / odtlačok) ----------
  // No backend server exists, so this can't be "real" per-person identity
  // verification - it's a local convenience: the device's own biometric
  // sensor gates access to a login code already saved on that same device,
  // so the code doesn't have to be retyped every time the app is reopened.
  function biometricSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }
  function hasBiometricLogin() {
    try { return !!localStorage.getItem(BIO_CRED_KEY); } catch (e) { return false; }
  }
  function bufToB64(buf) {
    var bytes = new Uint8Array(buf), str = "";
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str);
  }
  function b64ToBuf(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  // ---------- accounts (username + password via Firebase Authentication) ----------
  // There is no real email involved - Firebase Auth is used purely as a
  // password-verification service, addressed by a deterministic fake email
  // derived from the username. Firestore rules then gate each collection on
  // request.auth, and /accounts/{username} on request.auth's email matching
  // that username, without needing any backend of our own.
  var AUTH_EMAIL_DOMAIN = "@jupie-app.local";
  function usernameToEmail(username) { return String(username || "").toLowerCase() + AUTH_EMAIL_DOMAIN; }
  function mapAuthError(err, username) {
    if (err && err.code === "auth/email-already-in-use") {
      return "Prihlasovacie meno " + displayUsername(username) + " je už obsadené. Ak si to ty, prihlás sa; inak kontaktuj admina.";
    }
    if (err && err.code === "auth/weak-password") return "Heslo nespĺňa požiadavky.";
    return "Registrácia zlyhala. Skús to znova.";
  }
  function registerAccount(fullName, password) {
    var username = computeUsername(fullName);
    if (!username) return Promise.reject(new Error("Zadaj meno aj priezvisko."));
    if (!isValidPassword(password)) return Promise.reject(new Error("Heslo nespĺňa požiadavky."));
    return createUserWithEmailAndPassword(auth, usernameToEmail(username), password)
      .then(function () {
        return setDoc(doc(accountsCol, username), { name: fullName.trim(), createdAt: Date.now() });
      })
      .then(function () { return username; })
      .catch(function (err) { throw new Error(mapAuthError(err, username)); });
  }

  // ---------- biometric unlock (Face ID / odtlačok) ----------
  // No backend server exists beyond Firestore, so this can't be "real"
  // per-person identity verification tied to a session token - it's a local
  // convenience: the device's own biometric sensor gates access to a
  // username+password already saved on that same device, which are then
  // re-checked against the account (so a changed/removed account still
  // fails, unlike a blind local unlock).
  function setupBiometricLogin(username, password) {
    return navigator.credentials.create({
      publicKey: {
        rp: { name: "Dochádzka na tréningu" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: username, displayName: username },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
        attestation: "none",
      },
    }).then(function (cred) {
      localStorage.setItem(BIO_CRED_KEY, bufToB64(cred.rawId));
      localStorage.setItem(BIO_CODE_KEY, JSON.stringify({ u: username, p: password }));
    });
  }
  function biometricLogin() {
    var credId;
    try { credId = localStorage.getItem(BIO_CRED_KEY); } catch (e) { credId = null; }
    if (!credId) return Promise.reject(new Error("Nie je na tomto telefóne nastavený."));
    return navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: b64ToBuf(credId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    }).then(function () {
      var raw = localStorage.getItem(BIO_CODE_KEY);
      var creds = raw ? JSON.parse(raw) : null;
      if (!creds || !creds.u || !creds.p) throw new Error("Uložené prihlásenie sa nenašlo.");
      return signInWithEmailAndPassword(auth, usernameToEmail(creds.u), creds.p).catch(function () {
        // The biometric prompt itself succeeded, so a sign-in failure here
        // means the stored username/password is stale (e.g. a changed
        // password, or - as happened once - credentials saved before the
        // Firebase Auth migration). Clear it so the Face ID button doesn't
        // keep reappearing and failing; the user just logs in normally and
        // can re-enable Face ID from the offer that follows.
        forgetBiometricLogin();
        throw new Error("Uložené prihlásenie už nie je platné, bolo odstránené. Prihlás sa menom a heslom.");
      });
    });
  }
  function forgetBiometricLogin() {
    try { localStorage.removeItem(BIO_CRED_KEY); localStorage.removeItem(BIO_CODE_KEY); } catch (e) { /* ignore */ }
  }

  // ---------- transient UI state ----------
  var ui = {
    code: null,
    authResolved: false,
    authMode: "login",
    loginUsernameVal: "",
    loginPasswordVal: "",
    regNameVal: "",
    regPasswordVal: "",
    regPasswordVal2: "",
    authError: "",
    authBusy: false,
    bioAvailable: false,
    bioBusy: false,
    showBioOffer: false,
    pendingBioPassword: null,
    tab: "trainings",
    selectedTrainingId: null,
    selectedMemberId: null,
    selectedDayIso: null,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    mainCalYear: new Date().getFullYear(),
    mainCalMonth: new Date().getMonth(),
    isEditingMember: false,
    isEditingTraining: false,
    editTrainingDraft: {},
    editingName: "",
    newMemberName: "",
    newTrainingDate: todayISO(),
    newTrainingEndDate: "",
    newTrainingTime: "",
    newTrainingNote: "",
    newTrainingType: "trening",
    saving: false,
    error: "",
    dataLoaded: false,
    theme: (function () {
      try {
        var saved = localStorage.getItem(THEME_KEY);
        if (saved) return saved;
      } catch (e) { /* ignore */ }
      return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    })(),
  };

  function isAdmin() { return ui.code === ADMIN_USERNAME; }
  function isTrainer() { return TRAINER_USERNAMES.indexOf(ui.code) !== -1; }
  function isManager() { return MANAGER_USERNAMES.indexOf(ui.code) !== -1; }
  function canEditEvents() { return isAdmin() || isTrainer() || isManager(); }

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
  function eventsOnDate(iso) {
    return data.trainings.filter(function (t) {
      var end = t.endDate || t.date;
      return iso >= t.date && iso <= end;
    });
  }

  // ---------- mutations ----------
  // ui.code, data loading etc. are set from the onAuthStateChanged handler in
  // initFirebase() once Firebase confirms the sign-in - these functions only
  // kick that off and surface errors.
  function completeLogin(password) {
    ui.authError = "";
    ui.authBusy = false;
    if (ui.bioAvailable && !hasBiometricLogin()) {
      ui.showBioOffer = true;
      ui.pendingBioPassword = password || null;
    }
    render();
  }
  function login() {
    var username = ui.loginUsernameVal.trim();
    var password = ui.loginPasswordVal;
    if (!username || !password) {
      ui.authError = "Zadaj prihlasovacie meno aj heslo.";
      render();
      return;
    }
    ui.authBusy = true; ui.authError = ""; render();
    signInWithEmailAndPassword(auth, usernameToEmail(username), password).then(function () {
      completeLogin(password);
    }).catch(function () {
      ui.authBusy = false;
      ui.authError = "Nesprávne prihlasovacie meno alebo heslo. Ak nemáš ešte účet, vytvor si ho nižšie.";
      render();
    });
  }
  function register() {
    var fullName = ui.regNameVal.trim();
    var password = ui.regPasswordVal;
    if (!computeUsername(fullName)) {
      ui.authError = "Zadaj meno aj priezvisko (napr. Ján Novák).";
      render();
      return;
    }
    if (!isValidPassword(password)) {
      ui.authError = "Heslo musí mať aspoň 8 znakov, veľké aj malé písmeno a číslicu.";
      render();
      return;
    }
    if (password !== ui.regPasswordVal2) {
      ui.authError = "Heslá sa nezhodujú.";
      render();
      return;
    }
    ui.authBusy = true; ui.authError = ""; render();
    registerAccount(fullName, password).then(function () {
      completeLogin(password);
    }).catch(function (err) {
      ui.authBusy = false;
      ui.authError = err.message;
      render();
    });
  }
  function logout() {
    signOut(auth);
  }

  function addMember() {
    var name = ui.newMemberName.trim();
    if (!name) return;
    var id = uid();
    data.members.push({ id: id, name: name, createdBy: ui.code });
    ui.newMemberName = "";
    render();
    withSaving(setDoc(doc(membersCol, id), { name: name, createdBy: ui.code }));
    logAction("add-member", name);
  }
  function removeMember(id) {
    if (!isAdmin()) return;
    var m = data.members.find(function (x) { return x.id === id; });
    if (!window.confirm("Naozaj vymaza\u0165 hr\u00e1\u010da " + (m ? m.name : "") + "? Zma\u017e\u00fa sa aj v\u0161etky jeho z\u00e1znamy doch\u00e1dzky.")) return;
    data.members = data.members.filter(function (x) { return x.id !== id; });
    var attIdsToDelete = [];
    Object.keys(data.attendance).forEach(function (trainingId) {
      if (data.attendance[trainingId] && Object.prototype.hasOwnProperty.call(data.attendance[trainingId], id)) {
        attIdsToDelete.push(trainingId + "_" + id);
        delete data.attendance[trainingId][id];
      }
    });
    if (ui.selectedMemberId === id) ui.selectedMemberId = null;
    render();
    var batch = writeBatch(db);
    batch.delete(doc(membersCol, id));
    attIdsToDelete.forEach(function (attId) { batch.delete(doc(attendanceCol, attId)); });
    withSaving(batch.commit());
    logAction("delete-member", m ? m.name : "");
  }
  function renameMember(id, newName) {
    if (!isAdmin()) return;
    var name = newName.trim();
    if (!name) return;
    var old = data.members.find(function (x) { return x.id === id; });
    data.members = data.members.map(function (m) { return m.id === id ? Object.assign({}, m, { name: name }) : m; });
    render();
    withSaving(setDoc(doc(membersCol, id), { name: name, createdBy: old ? old.createdBy || null : null }, { merge: true }));
    logAction("rename-member", (old ? old.name : "") + " \u2192 " + name);
  }
  function addTraining() {
    if (!ui.newTrainingDate) return;
    var endDate = ui.newTrainingEndDate && ui.newTrainingEndDate > ui.newTrainingDate ? ui.newTrainingEndDate : null;
    var id = uid();
    var t = {
      id: id, date: ui.newTrainingDate, endDate: endDate, time: ui.newTrainingTime || null, note: ui.newTrainingNote.trim(),
      type: ui.newTrainingType, createdBy: ui.code, lastEditedBy: null, lastEditedAt: null,
    };
    data.trainings.push(t);
    data.trainings.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    ui.newTrainingNote = ""; ui.newTrainingEndDate = "";
    render();
    withSaving(setDoc(doc(trainingsCol, id), {
      date: t.date, endDate: t.endDate, time: t.time, note: t.note, type: t.type,
      createdBy: t.createdBy, lastEditedBy: null, lastEditedAt: null,
    }));
    logAction("add-event", eventType(t).label + " " + formatEventWhen(t));
  }
  function duplicateTraining(id) {
    var orig = data.trainings.find(function (x) { return x.id === id; });
    if (!orig) return;
    var newDate = addDays(orig.date, 7);
    var newEndDate = orig.endDate ? addDays(orig.endDate, 7) : null;
    var newId = uid();
    var t = {
      id: newId, date: newDate, endDate: newEndDate, time: orig.time || null, note: orig.note || "",
      type: orig.type, createdBy: ui.code, lastEditedBy: null, lastEditedAt: null,
    };
    data.trainings.push(t);
    data.trainings.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    ui.selectedTrainingId = t.id;
    render();
    withSaving(setDoc(doc(trainingsCol, newId), {
      date: t.date, endDate: t.endDate, time: t.time, note: t.note, type: t.type,
      createdBy: t.createdBy, lastEditedBy: null, lastEditedAt: null,
    }));
    logAction("add-event", eventType(t).label + " " + formatEventWhen(t) + " (opakovanie)");
  }
  function removeTraining(id) {
    if (!isAdmin()) return;
    var t = data.trainings.find(function (x) { return x.id === id; });
    if (!window.confirm("Naozaj vymaza\u0165 udalos\u0165 " + (t ? formatEventWhen(t) : "") + "? Zma\u017e\u00ed sa aj z\u00e1znam doch\u00e1dzky k nej.")) return;
    data.trainings = data.trainings.filter(function (x) { return x.id !== id; });
    var attIdsToDelete = data.attendance[id] ? Object.keys(data.attendance[id]).map(function (memberId) { return id + "_" + memberId; }) : [];
    delete data.attendance[id];
    if (ui.selectedTrainingId === id) ui.selectedTrainingId = null;
    render();
    var batch = writeBatch(db);
    batch.delete(doc(trainingsCol, id));
    attIdsToDelete.forEach(function (attId) { batch.delete(doc(attendanceCol, attId)); });
    withSaving(batch.commit());
    logAction("delete-event", t ? (eventType(t).label + " " + formatEventWhen(t)) : "");
  }
  function touchTraining(trainingId) {
    var t = data.trainings.find(function (x) { return x.id === trainingId; });
    if (t) { t.lastEditedBy = ui.code; t.lastEditedAt = Date.now(); }
    return t;
  }
  function startEditTraining(id) {
    if (!canEditEvents()) return;
    var t = data.trainings.find(function (x) { return x.id === id; });
    if (!t) return;
    ui.editTrainingDraft = { date: t.date, endDate: t.endDate || "", time: t.time || "", note: t.note || "", type: t.type || "trening" };
    ui.isEditingTraining = true;
    render();
  }
  function cancelEditTraining() {
    ui.isEditingTraining = false;
    render();
  }
  function saveEditTraining(id) {
    if (!canEditEvents()) return;
    var d = ui.editTrainingDraft;
    if (!d.date) return;
    var t = data.trainings.find(function (x) { return x.id === id; });
    if (!t) return;
    var endDate = d.endDate && d.endDate > d.date ? d.endDate : null;
    t.date = d.date; t.endDate = endDate; t.time = d.time || null; t.note = d.note.trim(); t.type = d.type;
    t.lastEditedBy = ui.code; t.lastEditedAt = Date.now();
    data.trainings.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    ui.isEditingTraining = false;
    render();
    withSaving(setDoc(doc(trainingsCol, id), {
      date: t.date, endDate: t.endDate, time: t.time, note: t.note, type: t.type,
      lastEditedBy: t.lastEditedBy, lastEditedAt: t.lastEditedAt,
    }, { merge: true }));
    logAction("edit-event", eventType(t).label + " " + formatEventWhen(t));
  }
  function setMemberAttendance(trainingId, memberId, value) {
    if (!data.attendance[trainingId]) data.attendance[trainingId] = {};
    data.attendance[trainingId][memberId] = value;
    var t = touchTraining(trainingId);
    render();
    var writes = [setDoc(doc(attendanceCol, trainingId + "_" + memberId), { trainingId: trainingId, memberId: memberId, present: value, date: t ? t.date : null })];
    if (t) writes.push(setDoc(doc(trainingsCol, trainingId), { lastEditedBy: ui.code, lastEditedAt: Date.now() }, { merge: true }));
    withSaving(Promise.all(writes));
    logAction("attendance", t ? formatDateRange(t.date, t.endDate) : "", trainingId);
  }
  function markAll(trainingId, value) {
    var obj = {};
    data.members.forEach(function (m) { obj[m.id] = value; });
    data.attendance[trainingId] = obj;
    var t = touchTraining(trainingId);
    render();
    var batch = writeBatch(db);
    data.members.forEach(function (m) {
      batch.set(doc(attendanceCol, trainingId + "_" + m.id), { trainingId: trainingId, memberId: m.id, present: value, date: t ? t.date : null });
    });
    batch.set(doc(trainingsCol, trainingId), { lastEditedBy: ui.code, lastEditedAt: Date.now() }, { merge: true });
    withSaving(batch.commit());
    logAction("attendance", t ? formatDateRange(t.date, t.endDate) : "", trainingId);
  }

  // ---------- rendering ----------
  var appEl;
  function render() { appEl.innerHTML = renderApp(); bindEvents(); }
  function renderTopStatusOnly() {
    var s = appEl.querySelector("#saving-indicator");
    var e = appEl.querySelector("#error-indicator");
    if (s) s.style.display = ui.saving ? "inline-flex" : "none";
    if (e) { e.style.display = ui.error ? "block" : "none"; e.textContent = ui.error; }
  }

  function renderApp() {
    var html = "";
    html += '<div class="header"><h1>Dochádzka na tréningu</h1>';
    html += '<div class="header-actions">';
    html += '<span id="saving-indicator" class="saving" style="display:' + (ui.saving ? "inline-flex" : "none") + '">Ukladám\u2026</span>';
    html += '<button class="icon-btn" data-action="toggle-theme" aria-label="Prepn\u00fa\u0165 tmav\u00fd re\u017eim">' + svgIcon(ui.theme === "dark" ? "sun" : "moon") + "</button>";
    html += "</div></div>";
    html += '<div class="version-tag">verzia ' + APP_VERSION + "</div>";
    html += '<div id="error-indicator" class="error" style="display:' + (ui.error ? "block" : "none") + '">' + esc(ui.error) + "</div>";

    if (!ui.authResolved) {
      html += '<div class="loading-state"><div class="spinner"></div><div>Načítavam…</div></div>';
      return html;
    }

    if (!ui.code) return html + renderLogin();

    if (!ui.dataLoaded) {
      html += '<div class="loading-state"><div class="spinner"></div><div>Pripájam sa k databáze\u2026</div></div>';
      return html;
    }

    html += '<div class="row session-row">';
    var rolePill = isAdmin() ? ' <span class="admin-pill">Admin</span>'
      : isManager() ? ' <span class="admin-pill trainer-pill">Vedúci</span>'
      : isTrainer() ? ' <span class="admin-pill trainer-pill">Tréner</span>'
      : "";
    html += '<span class="small">Prihl\u00e1sen\u00fd: ' + esc(displayUsername(ui.code)) + rolePill + '</span>';
    html += '<a href="#" data-action="logout" class="small logout-link">Odhl\u00e1si\u0165</a>';
    html += "</div>";

    if (ui.showBioOffer) html += renderBioOffer();

    if (ui.selectedTrainingId) return html + renderTrainingDetail();
    if (ui.selectedMemberId) return html + renderMemberProfile();
    if (ui.selectedDayIso) return html + renderDayDetail();

    html += '<div class="tabs">';
    html += tabButton("trainings", "calendar", "Tréningy");
    html += tabButton("members", "users", "Členovia");
    html += tabButton("stats", "chart", "Štatistiky");
    if (isAdmin()) html += tabButton("activity", "clipboard", "Aktivita");
    html += "</div>";

    if (ui.tab === "trainings") html += renderTrainingsTab();
    else if (ui.tab === "members") html += renderMembersTab();
    else if (ui.tab === "activity" && isAdmin()) html += renderActivityTab();
    else html += renderStatsTab();

    return html;
  }

  function renderBioOffer() {
    var html = '<div class="card bio-offer">';
    html += '<div class="row align-start" style="gap:10px">';
    html += svgIcon("faceid", "icon bio-offer-icon");
    html += '<div style="flex:1"><div style="font-weight:600;margin-bottom:2px">Pou\u017ei\u0165 Face ID / odtla\u010dok?</div>' +
      '<div class="small">Nabudúce sa prihlásiš bez písania mena a hesla. Prihlasovacie údaje sa uložia iba v tomto telefóne.</div></div>';
    html += "</div>";
    html += '<div style="display:flex;gap:8px;margin-top:10px">';
    html += '<button class="btn-primary" data-action="setup-bio" style="flex:1;justify-content:center">Nastavi\u0165</button>';
    html += '<button class="btn" data-action="dismiss-bio-offer" style="flex:1;justify-content:center">Nie, v\u010faka</button>';
    html += "</div></div>";
    return html;
  }

  function passwordRuleRow(rule, pw, label) {
    var ok = {
      len: pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      lower: /[a-z]/.test(pw),
      digit: /[0-9]/.test(pw),
    }[rule];
    return '<li class="rule' + (ok ? " ok" : "") + '" data-rule="' + rule + '">' + svgIcon("check", "icon rule-icon") + esc(label) + "</li>";
  }

  function renderLogin() {
    var bioReady = ui.bioAvailable && hasBiometricLogin();
    var html = '<div class="login-screen"><div class="card login-card">';
    html += '<img class="login-logo" src="icon-192.png" alt="" />';

    if (ui.authMode === "register") {
      var pw = ui.regPasswordVal;
      var uname = displayUsername(computeUsername(ui.regNameVal));
      html += '<div class="login-title">Vytvor si \u00fa\u010det</div>';
      html += '<div class="small login-hint">Prihlasovacie meno vznikne automaticky z tvojho mena a priezviska.</div>';
      html += '<input type="text" id="input-reg-name" class="auth-input" placeholder="Meno a priezvisko" autocapitalize="words" value="' + esc(ui.regNameVal) + '" />';
      html += '<div class="username-preview">Prihlasovacie meno: <strong id="username-preview">' + esc(uname || "\u2014") + "</strong></div>";
      html += '<input type="password" id="input-reg-password" class="auth-input" placeholder="Heslo" value="' + esc(ui.regPasswordVal) + '" />';
      html += '<input type="password" id="input-reg-password2" class="auth-input" placeholder="Zopakuj heslo" value="' + esc(ui.regPasswordVal2) + '" />';
      html += '<ul class="password-rules">';
      html += passwordRuleRow("len", pw, "aspo\u0148 8 znakov");
      html += passwordRuleRow("upper", pw, "ve\u013ek\u00e9 p\u00edsmeno");
      html += passwordRuleRow("lower", pw, "mal\u00e9 p\u00edsmeno");
      html += passwordRuleRow("digit", pw, "\u010d\u00edslicu");
      html += "</ul>";
      if (ui.authError) html += '<div class="error" style="display:block;margin-bottom:10px">' + esc(ui.authError) + "</div>";
      html += '<button class="btn-primary login-btn" data-action="register"' + (ui.authBusy ? " disabled" : "") + '>' +
        (ui.authBusy ? "Vytv\u00e1ram \u00fa\u010det\u2026" : "Vytvori\u0165 \u00fa\u010det") + "</button>";
      html += '<a href="#" class="small auth-toggle-link" data-action="toggle-auth-mode">U\u017e m\u00e1\u0161 \u00fa\u010det? Prihl\u00e1s sa</a>';
    } else {
      html += '<div class="login-title">Prihl\u00e1s sa</div>';
      html += '<div class="small login-hint">Zadaj svoje prihlasovacie meno a heslo.</div>';
      if (bioReady) {
        html += '<button class="btn-primary login-btn bio-btn" data-action="bio-login"' + (ui.bioBusy ? " disabled" : "") + '>' +
          svgIcon("faceid") + (ui.bioBusy ? " Over\u0165 sa\u2026" : " Face ID / odtla\u010dok") + "</button>";
        html += '<div class="login-divider"><span>alebo menom a heslom</span></div>';
      }
      html += '<input type="text" id="input-login-username" class="auth-input" placeholder="Prihlasovacie meno" autocapitalize="none" value="' + esc(ui.loginUsernameVal) + '" />';
      html += '<input type="password" id="input-login-password" class="auth-input" placeholder="Heslo" value="' + esc(ui.loginPasswordVal) + '" />';
      if (ui.authError) html += '<div class="error" style="display:block;margin-bottom:10px">' + esc(ui.authError) + "</div>";
      html += '<button class="btn-primary login-btn" data-action="login"' + (ui.authBusy ? " disabled" : "") + '>' +
        (ui.authBusy ? "Prihlasujem\u2026" : "Prihl\u00e1si\u0165") + "</button>";
      html += '<a href="#" class="small auth-toggle-link" data-action="toggle-auth-mode">Nem\u00e1\u0161 e\u0161te \u00fa\u010det? Vytvor si ho</a>';
      if (bioReady) html += '<a href="#" class="small bio-forget-link" data-action="forget-bio">Zabudn\u00fa\u0165 Face ID / odtla\u010dok na tomto telef\u00f3ne</a>';
    }
    html += "</div></div>";
    return html;
  }

  function tabButton(key, iconName, label) {
    return '<button class="tab-btn' + (ui.tab === key ? " active" : "") + '" data-action="tab" data-tab="' + key + '">' +
      '<span class="tab-icon">' + svgIcon(iconName) + "</span>" + esc(label) + "</button>";
  }

  function renderOverviewCalendar() {
    var year = ui.mainCalYear, month = ui.mainCalMonth;
    var cells = buildCalendarDays(year, month);
    var typesByDate = eventTypesByDate();
    var today = todayISO();

    var html = '<div class="card">';
    html += '<div class="row" style="margin-bottom:10px">';
    html += '<button class="icon-btn" data-action="shift-main-month" data-delta="-1">' + svgIcon("arrow-left") + '</button>';
    html += '<div style="font-weight:600;font-size:14px">' + MONTHS_SK[month] + " " + year + "</div>";
    html += '<button class="icon-btn" data-action="shift-main-month" data-delta="1">' + svgIcon("arrow-right") + '</button>';
    html += "</div>";

    html += '<div class="calendar-grid" style="margin-bottom:4px">';
    WEEKDAYS_SK.forEach(function (w) { html += '<div class="weekday-label">' + w + "</div>"; });
    html += "</div>";

    html += '<div class="calendar-grid">';
    cells.forEach(function (cell) {
      if (!cell) { html += "<div></div>"; return; }
      var types = typesByDate[cell.iso];
      html += '<div class="mini-cal-cell clickable' + (cell.iso === today ? " today" : "") + '" data-action="open-day" data-iso="' + cell.iso + '">';
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

  function renderDayDetail() {
    var iso = ui.selectedDayIso;
    var events = eventsOnDate(iso);
    var html = '<button class="btn" style="margin-bottom:12px" data-action="back-day">' + svgIcon("arrow-left") + ' Späť</button>';
    html += '<div style="font-weight:600;font-size:16px;margin-bottom:12px">' + esc(formatDate(iso)) + "</div>";

    if (events.length === 0) {
      html += emptyState("V tento deň nie je žiadna udalosť.");
      html += '<div class="card row">';
      html += '<span class="small">Chce\u0161 sem prida\u0165 udalos\u0165?</span>';
      html += '<button class="btn-primary" data-action="add-on-day" data-iso="' + iso + '">' + svgIcon("plus") + ' Prida\u0165</button>';
      html += "</div>";
      return html;
    }

    events.forEach(function (t) {
      var att = data.attendance[t.id] || {};
      var presentCount = data.members.filter(function (m) { return att[m.id] === true; }).length;
      var def = eventType(t);
      html += '<div class="card event-card" style="border-left-color:' + def.color + ';cursor:pointer" data-action="open-training" data-id="' + t.id + '">';
      html += '<div class="row" style="justify-content:flex-start;gap:8px">';
      html += '<span style="font-weight:600">' + esc(formatEventWhen(t)) + "</span>";
      html += '<span class="badge" style="background:' + def.bg + ";color:" + def.text + '">' + esc(def.label) + "</span>";
      html += "</div>";
      if (t.note) html += '<div class="small">' + esc(t.note) + "</div>";
      html += '<div class="small">' + presentCount + " / " + data.members.length + " " + presentWord(t) + "</div>";
      html += "</div>";
    });
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

    html += '<div class="row" style="margin-bottom:8px">';
    html += '<input type="time" id="input-new-time" value="' + esc(ui.newTrainingTime) + '" placeholder="\u010cas (nepovinn\u00e9)" />';
    html += "</div>";

    html += '<div class="row">';
    html += '<input type="text" id="input-new-note" placeholder="Poznámka (nepovinné)" value="' + esc(ui.newTrainingNote) + '" />';
    html += '<button class="btn-primary" data-action="add-training">' + svgIcon("plus") + ' Pridať</button>';
    html += "</div></div>";

    if (data.trainings.length === 0) {
      html += emptyState("Zatiaľ žiadne udalosti. Pridaj prvú vyššie.");
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
        html += '<span style="font-weight:600">' + esc(formatEventWhen(t)) + "</span>";
        html += '<span class="badge" style="background:' + def.bg + ";color:" + def.text + '">' + esc(def.label) + "</span>";
        html += "</div>";
        if (t.note) html += '<div class="small">' + esc(t.note) + "</div>";
        html += '<div class="small">' + presentCount + " / " + data.members.length + " " + presentWord(t) + "</div>";
        html += "</div>";
        if (isAdmin()) html += '<button class="icon-btn" data-action="remove-training" data-id="' + t.id + '">' + svgIcon("trash") + '</button>';
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
    html += '<button class="btn" data-action="back-training">' + svgIcon("arrow-left") + ' Späť</button>';
    html += '<div style="display:flex;gap:8px">';
    html += '<button class="btn" data-action="duplicate-training" data-id="' + t.id + '">' + svgIcon("repeat") + ' O t\u00fd\u017ede\u0148</button>';
    if (canEditEvents() && !ui.isEditingTraining) html += '<button class="btn" data-action="edit-training" data-id="' + t.id + '">' + svgIcon("pencil") + ' Upravi\u0165</button>';
    html += "</div></div>";

    if (ui.isEditingTraining) {
      var d = ui.editTrainingDraft;
      html += '<div class="card" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">';
      html += '<div class="type-picker">';
      Object.keys(EVENT_TYPES).forEach(function (key) {
        var edef = EVENT_TYPES[key];
        var active = d.type === key;
        var style = active ? "border-color:" + edef.color + ";background:" + edef.bg + ";color:" + edef.text + ";font-weight:600;" : "";
        html += '<button class="type-btn' + (active ? " active" : "") + '" style="' + style + '" data-action="set-edit-type" data-type="' + key + '">' + esc(edef.label) + "</button>";
      });
      html += "</div>";
      html += '<div class="row">';
      html += '<input type="date" id="input-edit-td-date" value="' + esc(d.date) + '" />';
      if (d.type === "turnaj") {
        html += '<span class="small">do</span>';
        html += '<input type="date" id="input-edit-td-enddate" value="' + esc(d.endDate) + '" min="' + esc(d.date) + '" />';
      }
      html += "</div>";
      html += '<input type="time" id="input-edit-td-time" value="' + esc(d.time) + '" />';
      html += '<input type="text" id="input-edit-td-note" placeholder="Poznámka (nepovinné)" value="' + esc(d.note) + '" />';
      html += '<div style="display:flex;gap:8px">';
      html += '<button class="btn-primary" data-action="save-training-edit" data-id="' + t.id + '">Uložiť</button>';
      html += '<button class="btn" data-action="cancel-training-edit">Zrušiť</button>';
      html += "</div></div>";
    }

    html += '<div style="margin-bottom:12px">';
    html += '<div class="row" style="justify-content:flex-start;gap:8px">';
    html += '<span style="font-weight:600;font-size:16px">' + esc(formatEventWhen(t)) + "</span>";
    html += '<span class="badge" style="background:' + def.bg + ";color:" + def.text + '">' + esc(def.label) + "</span>";
    html += "</div>";
    if (t.note) html += '<div class="small">' + esc(t.note) + "</div>";
    html += '<div class="small">' + presentWordCap(t) + ": " + presentCount + " / " + data.members.length + "</div>";
    if (isAdmin()) {
      if (t.createdBy) html += '<div class="small">Vytvoril: ' + esc(displayUsername(t.createdBy)) + "</div>";
      if (t.lastEditedBy) html += '<div class="small">Naposledy upravil: ' + esc(displayUsername(t.lastEditedBy)) + " (" + formatDateTime(t.lastEditedAt) + ")</div>";
    }
    html += "</div>";

    if (data.members.length === 0) {
      html += emptyState('Najprv pridaj členov v záložke „Členovia".');
      return html;
    }

    html += '<div class="row" style="gap:8px;margin-bottom:10px">';
    html += '<button class="btn" data-action="mark-all" data-id="' + t.id + '" data-value="true">' + svgIcon("check") + ' Označiť všetkých</button>';
    html += '<button class="btn" data-action="mark-all" data-id="' + t.id + '" data-value="false">' + svgIcon("x") + ' Zrušiť všetkých</button>';
    html += "</div>";

    sortedMembers().forEach(function (m) {
      var present = att[m.id] === true;
      var absent = att[m.id] === false;
      html += '<div class="card row">';
      html += "<span>" + esc(m.name) + "</span>";
      html += '<div style="display:flex;gap:6px">';
      html += '<button class="att-btn present' + (present ? " active" : "") + '" data-action="set-att" data-training="' + t.id + '" data-member="' + m.id + '" data-value="true">' + svgIcon("check", "icon icon-att") + '</button>';
      html += '<button class="att-btn absent' + (absent ? " active" : "") + '" data-action="set-att" data-training="' + t.id + '" data-member="' + m.id + '" data-value="false">' + svgIcon("x", "icon icon-att") + '</button>';
      html += "</div></div>";
    });
    return html;
  }

  function renderMembersTab() {
    var html = '<div class="card row">';
    html += '<input type="text" id="input-new-member" placeholder="Meno člena" value="' + esc(ui.newMemberName) + '" />';
    html += '<button class="btn-primary" data-action="add-member">' + svgIcon("plus") + ' Pridať</button>';
    html += "</div>";

    var members = sortedMembers();
    if (members.length === 0) {
      html += emptyState("Zatiaľ žiadni členovia. Pridaj prvého vyššie.");
      return html;
    }
    members.forEach(function (m) {
      var s = memberStats(m.id);
      html += '<div class="card row" style="cursor:pointer" data-action="open-member" data-id="' + m.id + '">';
      html += '<div class="avatar-row">';
      html += '<span class="avatar" style="background:' + avatarColor(m.id) + '">' + esc(initials(m.name)) + '</span>';
      html += "<div><div>" + esc(m.name) + "</div>";
      if (s.total > 0) html += '<div class="small">' + s.pct + "% účasť</div>";
      html += "</div></div>";
      if (isAdmin()) html += '<button class="icon-btn" data-action="remove-member" data-id="' + m.id + '" data-stop="1">' + svgIcon("trash") + '</button>';
      html += "</div>";
    });
    return html;
  }

  function renderStatsTab() {
    if (data.members.length === 0 || statsEligibleEvents().length === 0) {
      return emptyState("Pridaj členov aj tréningy, aby sa mohli zobraziť štatistiky dochádzky. (Zápasy a turnaje sa do štatistiky nepočítajú.)");
    }
    var rows = sortedMembers().map(function (m) { return { m: m, s: memberStats(m.id) }; });
    rows.sort(function (a, b) { return b.s.pct - a.s.pct; });
    var html = "";
    rows.forEach(function (r) {
      html += '<div class="card">';
      html += '<div class="row" style="margin-bottom:8px">';
      html += '<div class="avatar-row">';
      html += '<span class="avatar" style="width:28px;height:28px;font-size:11px;background:' + avatarColor(r.m.id) + '">' + esc(initials(r.m.name)) + '</span>';
      html += '<span>' + esc(r.m.name) + '</span></div>';
      html += '<span style="font-weight:700">' + r.s.pct + "%</span></div>";
      html += '<div class="progress-bar"><div class="progress-fill" style="width:' + r.s.pct + '%"></div></div>';
      html += '<div class="small" style="margin-top:6px">' + r.s.present + " / " + r.s.total + " tréningov</div></div>";
    });
    return html;
  }

  function renderActivityTab() {
    var html = '<div class="card row">';
    html += '<div><div style="font-weight:600">Záloha dát</div><div class="small">Stiahne aktu\u00e1lny stav (\u010dlenovia, udalosti, doch\u00e1dzka, denn\u00edk) ako s\u00fabor.</div></div>';
    html += '<button class="btn-primary" data-action="export-backup">' + svgIcon("download") + ' St\u00edahnu\u0165</button>';
    html += "</div>";

    var log = (data.log || []).slice().sort(function (a, b) { return b.ts - a.ts; });
    if (log.length === 0) return html + emptyState("Zatiaľ žiadna aktivita.");
    log.forEach(function (entry) {
      var label = ACTION_LABELS[entry.action] || entry.action;
      html += '<div class="card">';
      html += '<div class="activity-item">';
      html += '<span class="activity-dot"></span>';
      html += '<div style="flex:1">';
      html += '<div class="row"><span><strong>' + esc(displayUsername(entry.code)) + "</strong> " + esc(label) + "</span>";
      html += '<span class="small">' + formatDateTime(entry.ts) + "</span></div>";
      if (entry.detail) html += '<div class="small">' + esc(entry.detail) + "</div>";
      html += "</div></div>";
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

    var html = '<button class="btn" style="margin-bottom:12px" data-action="back-member">' + svgIcon("arrow-left") + ' Späť</button>';

    if (!ui.isEditingMember) {
      html += '<div class="row align-start" style="margin-bottom:14px">';
      html += '<div class="avatar-row">';
      html += '<span class="avatar avatar-lg" style="background:' + avatarColor(m.id) + '">' + esc(initials(m.name)) + '</span>';
      html += "<div><div style=\"font-weight:700;font-size:17px\">" + esc(m.name) + "</div>";
      html += '<div class="small">' + s.present + " / " + s.total + " tréningov \u00b7 " + s.pct + "% účasť</div></div>";
      html += "</div>";
      if (isAdmin()) html += '<button class="icon-btn" data-action="edit-member">' + svgIcon("pencil") + '</button>';
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
    html += '<button class="icon-btn" data-action="shift-month" data-delta="-1">' + svgIcon("arrow-left") + '</button>';
    html += '<div style="font-weight:600;font-size:14px">' + MONTHS_SK[month] + " " + year + "</div>";
    html += '<button class="icon-btn" data-action="shift-month" data-delta="1">' + svgIcon("arrow-right") + '</button>';
    html += "</div>";

    html += '<div class="calendar-grid" style="margin-bottom:4px">';
    WEEKDAYS_SK.forEach(function (w) { html += '<div class="weekday-label">' + w + "</div>"; });
    html += "</div>";

    var todayIsoM = todayISO();
    html += '<div class="calendar-grid">';
    cells.forEach(function (cell) {
      if (!cell) { html += "<div></div>"; return; }
      var t = trainingByDate[cell.iso];
      var cls = "cal-cell";
      if (cell.iso === todayIsoM) cls += " today";
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
    var loginUserEl = document.getElementById("input-login-username");
    if (loginUserEl) {
      loginUserEl.addEventListener("input", function (e) { ui.loginUsernameVal = e.target.value; });
      loginUserEl.addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
      loginUserEl.focus();
    }
    var loginPwEl = document.getElementById("input-login-password");
    if (loginPwEl) {
      loginPwEl.addEventListener("input", function (e) { ui.loginPasswordVal = e.target.value; });
      loginPwEl.addEventListener("keydown", function (e) { if (e.key === "Enter") login(); });
    }
    var regNameEl = document.getElementById("input-reg-name");
    if (regNameEl) {
      regNameEl.addEventListener("input", function (e) {
        ui.regNameVal = e.target.value;
        var preview = document.getElementById("username-preview");
        if (preview) preview.textContent = displayUsername(computeUsername(ui.regNameVal)) || "—";
      });
      regNameEl.focus();
    }
    var regPwEl = document.getElementById("input-reg-password");
    if (regPwEl) {
      regPwEl.addEventListener("input", function (e) {
        ui.regPasswordVal = e.target.value;
        var pw = ui.regPasswordVal;
        var checks = { len: pw.length >= 8, upper: /[A-Z]/.test(pw), lower: /[a-z]/.test(pw), digit: /[0-9]/.test(pw) };
        Object.keys(checks).forEach(function (key) {
          var li = document.querySelector('.password-rules [data-rule="' + key + '"]');
          if (li) li.classList.toggle("ok", checks[key]);
        });
      });
    }
    var regPw2El = document.getElementById("input-reg-password2");
    if (regPw2El) regPw2El.addEventListener("input", function (e) { ui.regPasswordVal2 = e.target.value; });
    var dateEl = document.getElementById("input-new-date");
    if (dateEl) dateEl.addEventListener("change", function (e) { ui.newTrainingDate = e.target.value; render(); });
    var endDateEl = document.getElementById("input-new-enddate");
    if (endDateEl) endDateEl.addEventListener("change", function (e) { ui.newTrainingEndDate = e.target.value; });
    var timeEl = document.getElementById("input-new-time");
    if (timeEl) timeEl.addEventListener("change", function (e) { ui.newTrainingTime = e.target.value; });
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
    var editTdDateEl = document.getElementById("input-edit-td-date");
    if (editTdDateEl) editTdDateEl.addEventListener("change", function (e) { ui.editTrainingDraft.date = e.target.value; render(); });
    var editTdEndDateEl = document.getElementById("input-edit-td-enddate");
    if (editTdEndDateEl) editTdEndDateEl.addEventListener("change", function (e) { ui.editTrainingDraft.endDate = e.target.value; });
    var editTdTimeEl = document.getElementById("input-edit-td-time");
    if (editTdTimeEl) editTdTimeEl.addEventListener("change", function (e) { ui.editTrainingDraft.time = e.target.value; });
    var editTdNoteEl = document.getElementById("input-edit-td-note");
    if (editTdNoteEl) editTdNoteEl.addEventListener("input", function (e) { ui.editTrainingDraft.note = e.target.value; });
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
      case "bio-login":
        if (ui.bioBusy) break;
        ui.bioBusy = true; ui.authError = ""; render();
        biometricLogin().then(function () {
          ui.bioBusy = false;
          render();
        }).catch(function (err) {
          ui.bioBusy = false;
          ui.authError = "Face ID / odtlačok: " + err.message;
          render();
        });
        break;
      case "setup-bio":
        setupBiometricLogin(ui.code, ui.pendingBioPassword).then(function () {
          ui.showBioOffer = false; ui.pendingBioPassword = null; render();
        }).catch(function (err) {
          ui.showBioOffer = false; ui.pendingBioPassword = null;
          ui.error = "Nepodarilo sa nastaviť Face ID / odtlačok: " + err.message;
          render();
        });
        break;
      case "dismiss-bio-offer": ui.showBioOffer = false; ui.pendingBioPassword = null; render(); break;
      case "forget-bio": forgetBiometricLogin(); render(); break;
      case "toggle-auth-mode":
        ui.authMode = ui.authMode === "login" ? "register" : "login";
        ui.authError = "";
        render();
        break;
      case "register": register(); break;
      case "toggle-theme":
        ui.theme = ui.theme === "dark" ? "light" : "dark";
        try { localStorage.setItem(THEME_KEY, ui.theme); } catch (e) { /* ignore */ }
        applyTheme(ui.theme);
        render();
        break;
      case "tab": ui.tab = el.getAttribute("data-tab"); render(); break;
      case "set-type": ui.newTrainingType = el.getAttribute("data-type"); render(); break;
      case "quickday": ui.newTrainingDate = nextWeekday(parseInt(el.getAttribute("data-day"), 10)); render(); break;
      case "add-training": addTraining(); break;
      case "duplicate-training": ui.isEditingTraining = false; duplicateTraining(el.getAttribute("data-id")); break;
      case "open-training": ui.selectedTrainingId = el.getAttribute("data-id"); ui.isEditingTraining = false; render(); break;
      case "edit-training": startEditTraining(el.getAttribute("data-id")); break;
      case "cancel-training-edit": cancelEditTraining(); break;
      case "save-training-edit": saveEditTraining(el.getAttribute("data-id")); break;
      case "set-edit-type": ui.editTrainingDraft.type = el.getAttribute("data-type"); render(); break;
      case "open-day": ui.selectedDayIso = el.getAttribute("data-iso"); render(); break;
      case "back-day": ui.selectedDayIso = null; render(); break;
      case "add-on-day":
        ui.newTrainingDate = el.getAttribute("data-iso");
        ui.selectedDayIso = null;
        ui.tab = "trainings";
        render();
        break;
      case "back-training": ui.selectedTrainingId = null; ui.isEditingTraining = false; render(); break;
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
    console.log("Doch\u00e1dzka na tr\u00e9ningu \u2014 verzia " + APP_VERSION);
    applyTheme(ui.theme);
    appEl = document.getElementById("app");
    render();
    initFirebase();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    }
    if (biometricSupported() && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function (available) {
        ui.bioAvailable = available;
        if (available) render();
      }).catch(function () { /* ignore - treat as unavailable */ });
    }
  });
})();
