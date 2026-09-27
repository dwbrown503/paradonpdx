/* ============================================================
 * Paragon PDX Hub — Learning Center: Vocation PDX + Mindset.
 *
 * Load AFTER pdx-app.js and AFTER pdx-db-vocation-mindset.js.
 *
 * Adds two new studies to the Learning Center:
 *   Vocation PDX          30 days, street-art styling
 *   Mindset & Well-being  65 pages, as-is (women's flipbook)
 *
 * Routes (all inside the members' Learning Center gate):
 *   #/learn                   three-study Learning Center page
 *                             (26 Servant Leadership weeks + 2 new cards)
 *   #/learn/vocation          30-day list with progress pills
 *   #/learn/vocation/day/N    day N content + Mark Complete
 *   #/learn/mindset           flipbook viewer (resumes at next unread page)
 *   #/learn/mindset/page/N    flipbook at page N
 *
 * How it hooks in (rewritten 2026-09-26):
 *   pdx-app.js wraps everything in an IIFE and only exposes
 *   window.__ppdx. This file bridges through that object:
 *     var PP = window.__ppdx || {};
 *   It detaches the original hashchange listener (PP.route is the
 *   same function object the app registered) and installs its own.
 *   New routes are handled here; EVERY other route is delegated to
 *   the original router untouched.
 *
 * Rules (Wayne's):
 *   - No locks BETWEEN studies: every approved member sees all three.
 *   - WITHIN a study: days/pages open in order, no skipping ahead.
 *   - No time gate (no 3:45 AM wait) — "no wait on any study".
 *   - Unapproved members never reach the new routes: they fall
 *     through to the original router, which shows the Learn gate.
 *
 * Data:
 *   Vocation day content comes from studies/vocation-days.json
 *   (30 days: day, title, reference, verse, body, questions).
 *   Mindset page images: studies/assets/pg-001.jpg … pg-065.jpg.
 * Progress:
 *   window.ParagonDB.saveVocationDay(n) / getVocationDone()
 *   window.ParagonDB.saveMindsetPage(n) / getMindsetDone()
 *   (from pdx-db-vocation-mindset.js; phone-first, syncs to Supabase)
 * ============================================================ */
(function () {
  "use strict";

  /* ---- bridge to the live app (the ONLY way in) ---- */
  var PP = window.__ppdx || {};
  var origRoute = (typeof PP.route === "function") ? PP.route : null;

  /* If the bridge is missing, install nothing. Better silent and
     harmless than broken. */
  var isDoneFn = (typeof PP.isDone === "function") ? PP.isDone : function () { return false; };
  var isOpenFn = (typeof PP.isOpen === "function") ? PP.isOpen : function () { return false; };

  function getProfile() {
    return (typeof PP.getProfile === "function") ? PP.getProfile() : null;
  }
  function viewEl() {
    if (typeof PP.viewEl === "function") {
      var v = PP.viewEl();
      if (v) return v;
    }
    return document.getElementById("view");
  }

  /* ---- local copies of pdx-app.js IIFE-scoped helpers ---- */
  /* (esc, cleanWeekTitle and toast live inside its IIFE; these are
     verbatim copies so this file never touches its scope.) */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cleanWeekTitle(t) {
    return String(t || "").replace(/^Week \d+:\s*/, "");
  }
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* Highlight the Learn tab in the bottom nav (setActiveTab is
     IIFE-scoped; this does the same DOM toggle for "learn"). */
  function setLearnTab() {
    var links = document.querySelectorAll(".bottomnav a");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.classList) a.classList.toggle("active", a.getAttribute("data-tab") === "learn");
    }
  }

  /* ---------------- constants ---------------- */
  var VOCATION_TOTAL = 30;
  var MINDSET_TOTAL = 65;
  var VOCATION_JSON = "studies/vocation-days.json";
  var MINDSET_IMG = function (n) {
    var s = String(n);
    while (s.length < 3) s = "0" + s;
    return "studies/assets/pg-" + s + ".jpg";
  };

  var vocationDays = null;   /* loaded from vocation-days.json */
  var vocationLoading = false;
  var vocationWaiters = [];  /* callbacks waiting on the in-flight fetch */

  function loadVocationDays(cb) {
    if (vocationDays) { cb(vocationDays); return; }
    if (typeof VOCATION_DAYS !== "undefined" && VOCATION_DAYS) {
      vocationDays = VOCATION_DAYS; cb(vocationDays); return;
    }
    vocationWaiters.push(cb);
    if (vocationLoading) return;
    vocationLoading = true;
    fetch(VOCATION_JSON).then(function (r) {
      if (!r.ok) throw new Error("vocation-json-missing");
      return r.json();
    }).then(function (d) {
      vocationDays = d; vocationLoading = false;
      var ws = vocationWaiters; vocationWaiters = [];
      ws.forEach(function (w) { w(d); });
    }).catch(function () {
      vocationLoading = false;
      var ws = vocationWaiters; vocationWaiters = [];
      ws.forEach(function (w) { w(null); });
    });
  }
  function vocationDay(n) {
    if (!vocationDays) return null;
    for (var i = 0; i < vocationDays.length; i++) {
      if (vocationDays[i].day === n) return vocationDays[i];
    }
    return null;
  }

  /* ---------------- local progress helpers ---------------- */
  /* Phone copy is the source of truth for unlocking (same model
     as the 130-lesson progress). */

  function vocDone() {
    return (window.ParagonDB && window.ParagonDB.getVocationDone)
      ? window.ParagonDB.getVocationDone() : [];
  }
  function minDone() {
    return (window.ParagonDB && window.ParagonDB.getMindsetDone)
      ? window.ParagonDB.getMindsetDone() : [];
  }
  function vocHighest() {
    var d = vocDone(), h = 0;
    d.forEach(function (n) { if (n > h) h = n; });
    return h;
  }
  function minHighest() {
    var d = minDone(), h = 0;
    d.forEach(function (n) { if (n > h) h = n; });
    return h;
  }
  function vocIsDone(n) { return vocDone().indexOf(n) !== -1; }
  function minIsDone(n) { return minDone().indexOf(n) !== -1; }
  /* Open in order: day/page 1 always open; N open when N-1 done. */
  function vocIsOpen(n) {
    if (n < 1 || n > VOCATION_TOTAL) return false;
    if (n === 1) return true;
    return vocIsDone(n - 1);
  }
  function minIsOpen(n) {
    if (n < 1 || n > MINDSET_TOTAL) return false;
    if (n === 1) return true;
    return minIsDone(n - 1);
  }

  function vocPill(n) {
    if (vocIsDone(n)) return '<span class="pill done">Done</span>';
    if (n === vocHighest() + 1) return '<span class="pill next">Next</span>';
    if (vocIsOpen(n)) return '<span class="pill">Open</span>';
    return '<span class="pill lock">Locked</span>';
  }
  function minPill(n) {
    if (minIsDone(n)) return '<span class="pill done">Done</span>';
    if (n === minHighest() + 1) return '<span class="pill next">Next</span>';
    if (minIsOpen(n)) return '<span class="pill">Open</span>';
    return '<span class="pill lock">Locked</span>';
  }

  /* ---------------- Learning Center: three studies ---------------- */
  /* The original 26-week Servant Leadership list is restored here
     verbatim (same loop as pdx-app.js vLearn, via the PP bridge),
     then the two new study cards are APPENDED below. Add, not replace. */

  function vLearnThree() {
    var p = getProfile();
    var WEEKS = PP.WEEKS || {};
    var TOTAL_WEEKS = Object.keys(WEEKS).length;

    var html = "<h1 class=\"page-title\">Learning Center</h1>" +
      '<div class="card"><p class="muted">Work through each study at your own pace. ' +
      "Your progress saves on this phone and syncs for your organizers to see.</p>" +
      '<div class="btn-row"><a class="btn secondary small" href="#/learn/progress">My progress</a>' +
      (p && (p.role === "organizer" || p.role === "originator")
        ? '<a class="btn secondary small" href="paragonpdx-dashboard">Organizer dashboard</a>'
        : "") +
      "</div></div>" +

      /* Servant Leadership: the written guide card (from original vLearn) */
      '<div class="card"><h3>Read the written guide</h3>' +
      '<p class="muted">The full <b>paragonpdx Servant Leadership Guide</b> — the same 130 lessons as this course, in book form.</p>' +
      '<a class="btn secondary small" href="#/guide">Open the written guide</a></div>' +

      /* Servant Leadership: all 26 week cards (restored from original vLearn) */
      '<h3 style="margin:18px 0 8px">📖 Servant Leadership — 130 Lessons</h3>';
    for (var w = 1; w <= TOTAL_WEEKS; w++) {
      var wk = WEEKS[w];
      if (!wk || !wk.days) continue;
      var firstDay = wk.days[0];
      var doneCount = wk.days.filter(isDoneFn).length;
      var open = isOpenFn(firstDay);
      html += '<a class="list-item' + (open ? "" : " locked") + '" href="#/learn/week/' + w + '">' +
        '<div class="grow"><div class="title">Week ' + w + ": " + esc(cleanWeekTitle(wk.title)) + "</div>" +
        '<div class="sub">' + doneCount + "/5 days done</div></div>" +
        (open ? "" : '<span class="pill lock">Locked</span>') +
        '<span class="chev">›</span></a>';
    }

    /* Two new studies, appended below the 26 weeks */
    var vDone = vocDone().length, mDone = minDone().length;
    html += '<h3 style="margin:18px 0 8px">More studies</h3>' +

      '<a class="list-item" href="#/learn/vocation">' +
      '<div class="grow"><div class="title">🔥 Vocation PDX — 30-Day Study</div>' +
      '<div class="sub">' + vDone + " / " + VOCATION_TOTAL + " days done — raw Portland street art</div></div>" +
      (vDone >= VOCATION_TOTAL ? '<span class="pill done">Done</span>' : "") +
      '<span class="chev">›</span></a>' +

      '<a class="list-item" href="#/learn/mindset">' +
      '<div class="grow"><div class="title">🌸 Mindset &amp; Well-being</div>' +
      '<div class="sub">' + mDone + " / " + MINDSET_TOTAL + " pages done — a 4-week study for women</div></div>" +
      (mDone >= MINDSET_TOTAL ? '<span class="pill done">Done</span>' : "") +
      '<span class="chev">›</span></a>';

    viewEl().innerHTML = html;
  }

  /* ---------------- Vocation PDX: day list ---------------- */

  function vVocation() {
    viewEl().innerHTML = '<a class="btn secondary small" href="#/learn">‹ Learning Center</a>' +
      "<h1 class=\"page-title\">Vocation PDX</h1>" +
      '<div class="card"><p class="muted">Loading the 30-day study…</p></div>';
    loadVocationDays(function (days) {
      var html = '<a class="btn secondary small" href="#/learn">‹ Learning Center</a>' +
        "<h1 class=\"page-title\">Vocation PDX</h1>" +
        '<div class="card"><p class="muted">A 30-day street-art study on calling and work. ' +
        "Days open in order — finish one to unlock the next.</p>" +
        '<div class="progress-bar"><i style="width:' +
        Math.round(vocDone().length / VOCATION_TOTAL * 100) + '%"></i></div>' +
        '<div class="kv"><span>Days finished</span><b>' + vocDone().length +
        " / " + VOCATION_TOTAL + "</b></div></div>";
      if (!days) {
        html += '<div class="card"><p class="muted">The study content could not be loaded. ' +
          "Check your connection and try again.</p></div>";
      } else {
        for (var n = 1; n <= VOCATION_TOTAL; n++) {
          var d = vocationDay(n);
          var title = d ? d.title : ("Day " + n);
          var open = vocIsOpen(n);
          html += (open ? '<a class="list-item" href="#/learn/vocation/day/' + n + '">' : '<div class="list-item locked">') +
            '<div class="grow"><div class="title">Day ' + n + " — " + esc(title) + "</div>" +
            (d && d.reference ? '<div class="sub">' + esc(d.reference) + "</div>" : "") +
            "</div>" + vocPill(n) +
            (open ? '<span class="chev">›</span></a>' : "</div>");
        }
      }
      viewEl().innerHTML = html;
      window.scrollTo(0, 0);
    });
  }

  /* ---------------- Vocation PDX: one day ---------------- */

  function vVocationDay(n) {
    n = parseInt(n, 10);
    if (!n || n < 1 || n > VOCATION_TOTAL || !vocIsOpen(n)) {
      location.hash = "#/learn/vocation"; return;
    }
    loadVocationDays(function (days) {
      var d = days ? vocationDay(n) : null;
      var done = vocIsDone(n);
      var html = '<a class="btn secondary small" href="#/learn/vocation">‹ All 30 days</a>' +
        "<h1 class=\"page-title\">Day " + n + "</h1>";
      if (!d) {
        html += '<div class="card"><p class="muted">This day could not be loaded.</p></div>';
      } else {
        html += '<div class="card"><h3>' + esc(d.title) + "</h3>" +
          (d.reference ? '<p class="muted"><b>' + esc(d.reference) + "</b></p>" : "") +
          (d.verse ? "<blockquote>" + esc(d.verse) + "</blockquote>" : "") +
          "<p>" + esc(d.body).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>") + "</p>";
        if (d.questions && d.questions.length) {
          html += "<h3>Reflect</h3><ol>";
          d.questions.forEach(function (q) {
            html += "<li>" + esc(q) + "</li>";
          });
          html += "</ol>";
        }
        html += "</div>";
      }
      html += '<div id="voc-action"></div>';
      viewEl().innerHTML = html;
      window.scrollTo(0, 0);
      renderVocationAction(n, done);
    });
  }

  function renderVocationAction(n, done) {
    var el = document.getElementById("voc-action");
    if (!el) return;
    if (done) {
      var prev = n > 1 ? '<a class="btn secondary" href="#/learn/vocation/day/' + (n - 1) + '">‹ Previous day</a>' : "";
      var next = n < VOCATION_TOTAL
        ? '<a class="btn" href="#/learn/vocation/day/' + (n + 1) + '">Next day ›</a>'
        : '<a class="btn secondary" href="#/learn">‹ Learning Center</a>';
      el.innerHTML = '<div class="card center"><p class="pass">Day ' + n +
        ' complete.</p></div><div class="btn-row">' + prev + next + "</div>";
      return;
    }
    el.innerHTML = '<button class="btn" id="voc-done">Mark Day ' + n + " Complete</button>";
    document.getElementById("voc-done").addEventListener("click", function () {
      this.disabled = true;
      this.textContent = "Saving…";
      function finish() {
        toast("Day " + n + " complete.");
        vVocationDay(n); /* re-render with Done state */
      }
      if (window.ParagonDB && window.ParagonDB.saveVocationDay) {
        try {
          window.ParagonDB.saveVocationDay(n).then(finish, finish);
        } catch (e) { finish(); }
      } else { finish(); }
    });
  }

  /* ---------------- Mindset & Well-being: flipbook ---------------- */

  function vMindsetPage(n) {
    n = parseInt(n, 10);
    if (!n || n < 1) n = 1;
    if (n > MINDSET_TOTAL) n = MINDSET_TOTAL;
    /* Pages open in order; jump requests beyond reach go to the furthest open page. */
    if (!minIsOpen(n)) n = Math.min(minHighest() + 1, MINDSET_TOTAL);

    var done = minIsDone(n);
    var html = '<a class="btn secondary small" href="#/learn">‹ Learning Center</a>' +
      "<h1 class=\"page-title\">Mindset &amp; Well-being</h1>" +
      '<div class="card center">' +
      '<p class="muted">Page ' + n + " of " + MINDSET_TOTAL + "</p>" +
      '<div class="progress-bar"><i style="width:' +
      Math.round(minDone().length / MINDSET_TOTAL * 100) + '%"></i></div>' +
      '<div class="flipbook"><img id="mindset-img" src="' + MINDSET_IMG(n) + '" alt="Mindset page ' + n + '"' +
      ' style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.18);"></div>' +
      '<div class="btn-row" style="margin-top:12px">' +
      (n > 1 ? '<a class="btn secondary" href="#/learn/mindset/page/' + (n - 1) + '">‹ Prev</a>' : "") +
      (n < MINDSET_TOTAL && minIsOpen(n + 1)
        ? '<a class="btn secondary" href="#/learn/mindset/page/' + (n + 1) + '">Next ›</a>'
        : "") +
      "</div>" +
      '<div id="mindset-action" style="margin-top:12px"></div>' +
      "</div>";
    viewEl().innerHTML = html;
    window.scrollTo(0, 0);
    renderMindsetAction(n, done);
  }

  function renderMindsetAction(n, done) {
    var el = document.getElementById("mindset-action");
    if (!el) return;
    if (done) {
      el.innerHTML = '<p class="pass">Page ' + n + " complete.</p>" +
        (n < MINDSET_TOTAL
          ? '<a class="btn" href="#/learn/mindset/page/' + (n + 1) + '">Next page ›</a>'
          : '<p class="pass">All 65 pages finished. Well done!</p>');
      return;
    }
    el.innerHTML = '<button class="btn" id="mindset-done">Mark Page ' + n + " Complete</button>";
    document.getElementById("mindset-done").addEventListener("click", function () {
      this.disabled = true;
      this.textContent = "Saving…";
      function finish() {
        toast("Page " + n + " complete.");
        vMindsetPage(n); /* re-render with Done state */
      }
      if (window.ParagonDB && window.ParagonDB.saveMindsetPage) {
        try {
          window.ParagonDB.saveMindsetPage(n).then(finish, finish);
        } catch (e) { finish(); }
      } else { finish(); }
    });
  }

  /* #/learn/mindset resumes at the next unread page. */
  function vMindset() {
    var next = Math.min(minHighest() + 1, MINDSET_TOTAL);
    vMindsetPage(next);
  }

  /* ---------------- router ---------------- */
  /* Handles ONLY the new/changed learn routes. Everything else —
     week/day/progress views, the Learn gate, and all non-learn
     routes — is delegated to the original router untouched. */

  function studyRoute() {
    var h = location.hash || "#/";
    var parts = h.replace(/^#\//, "").split("/");
    if (parts[0] === "learn") {
      var sub = parts[1] || "";
      var isNewRoute = (sub === "" || sub === "vocation" || sub === "mindset");
      if (isNewRoute) {
        /* Approval gate: no profile → original router shows the gate. */
        if (!getProfile()) {
          if (origRoute) return origRoute();
          return;
        }
        setLearnTab();
        window.scrollTo(0, 0);
        if (sub === "vocation" && parts[2] === "day" && parts[3]) {
          return vVocationDay(parseInt(parts[3], 10));
        }
        if (sub === "vocation") return vVocation();
        if (sub === "mindset" && parts[2] === "page" && parts[3]) {
          return vMindsetPage(parseInt(parts[3], 10));
        }
        if (sub === "mindset") return vMindset();
        return vLearnThree(); /* bare #/learn */
      }
    }
    if (origRoute) return origRoute();
  }

  /* ---- install: swap the hashchange listener ---- */
  /* PP.route is the same function object pdx-app.js registered, so
     removeEventListener with it detaches the original router. */
  if (origRoute) {
    try { window.removeEventListener("hashchange", PP.route); } catch (e) {}
    window.addEventListener("hashchange", studyRoute);
    /* Page loaded directly on a new study hash before this file ran. */
    var hh = location.hash || "";
    if (hh.indexOf("#/learn/vocation") === 0 || hh.indexOf("#/learn/mindset") === 0) {
      studyRoute();
    }
    /* Bare #/learn on direct load: original route() already rendered
       the old page at init; re-render the three-study version. */
    else if (hh === "#/learn" || hh === "#/learn/") {
      if (getProfile()) { setLearnTab(); vLearnThree(); }
    }
  }
})();
