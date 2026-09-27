/* ============================================================
 * ParagonDB — Vocation PDX + Mindset & Well-being progress.
 *
 * Extension to pdx-db.js. Load AFTER pdx-db.js. Attaches new
 * methods to the existing window.ParagonDB object and keeps its
 * own Supabase client built from DB.getConfig() (same URL/key
 * the main module uses).
 *
 * Tables (see vocation-mindset-tables.sql):
 *   vocation_progress  (profile_id, day 1-30, completed_at)
 *   mindset_progress   (profile_id, page 1-65, completed_at)
 *
 * Same offline-first model as the 130-lesson `progress` table:
 * the phone's localStorage is the source of truth for unlocking;
 * Supabase keeps the shared copy Wayne and organizers read.
 *
 * Local keys:
 *   ppdx_vocation_v1         {done: {day: {at}}}
 *   ppdx_mindset_v1          {done: {page: {at}}}
 *   ppdx_vocation_queue_v1   [ {day, at}, ... ]  (waiting for network)
 *   ppdx_mindset_queue_v1    [ {page, at}, ... ] (waiting for network)
 *
 * Never touches the existing `progress` table or its data.
 * ============================================================ */
(function () {
  "use strict";

  var DB = window.ParagonDB;
  if (!DB) { return; } /* pdx-db.js must load first. */

  var LS_VOCATION = "ppdx_vocation_v1";
  var LS_MINDSET = "ppdx_mindset_v1";
  var LS_VOC_QUEUE = "ppdx_vocation_queue_v1";
  var LS_MIN_QUEUE = "ppdx_mindset_queue_v1";

  var xclient = null;
  var xready = false;

  function vlsGet(k) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function vlsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function getVocationLocal() {
    var p = vlsGet(LS_VOCATION);
    if (!p || typeof p !== "object" || !p.done) p = { done: {} };
    return p;
  }
  function getMindsetLocal() {
    var p = vlsGet(LS_MINDSET);
    if (!p || typeof p !== "object" || !p.done) p = { done: {} };
    return p;
  }

  /* Own Supabase client, same project as the main module. */
  function xinit() {
    if (xready && xclient) return Promise.resolve(true);
    var cfg = DB.getConfig();
    if (!cfg.url || !cfg.key) return Promise.resolve(false);
    if (typeof window.supabase === "undefined") return Promise.resolve(false);
    try {
      xclient = window.supabase.createClient(cfg.url, cfg.key);
      xready = true;
      return Promise.resolve(true);
    } catch (e) {
      xready = false;
      return Promise.resolve(false);
    }
  }

  /* Queue one unsynced op. One pending op per day/page: newest wins. */
  function queueVocationOp(op) {
    var q = vlsGet(LS_VOC_QUEUE) || [];
    q = q.filter(function (o) { return o.day !== op.day; });
    q.push(op);
    vlsSet(LS_VOC_QUEUE, q);
  }
  function queueMindsetOp(op) {
    var q = vlsGet(LS_MIN_QUEUE) || [];
    q = q.filter(function (o) { return o.page !== op.page; });
    q.push(op);
    vlsSet(LS_MIN_QUEUE, q);
  }

  function vocationUpsert(profileId, ops) {
    return xinit().then(function (ok) {
      if (!ok) return false;
      var rows = ops.map(function (op) {
        return { profile_id: profileId, day: op.day, completed_at: op.at };
      });
      return xclient.from("vocation_progress")
        .upsert(rows, { onConflict: "profile_id,day" })
        .then(function (res) { return !res.error; })
        .catch(function () { return false; });
    });
  }
  function mindsetUpsert(profileId, ops) {
    return xinit().then(function (ok) {
      if (!ok) return false;
      var rows = ops.map(function (op) {
        return { profile_id: profileId, page: op.page, completed_at: op.at };
      });
      return xclient.from("mindset_progress")
        .upsert(rows, { onConflict: "profile_id,page" })
        .then(function (res) { return !res.error; })
        .catch(function () { return false; });
    });
  }

  /* ---------------- Vocation PDX (30 days) ---------------- */

  /* Mark a Vocation day complete. Saves on the phone first, then
     syncs to Supabase. Never throws; resolves true/false for
     "synced now". */
  DB.saveVocationDay = function (day) {
    day = parseInt(day, 10);
    if (!day || day < 1 || day > 30) return Promise.resolve(false);
    var profile = DB.getProfile();
    var at = new Date().toISOString();
    var p = getVocationLocal();
    p.done[day] = { at: at };
    vlsSet(LS_VOCATION, p);
    var op = { day: day, at: at };
    if (!profile || !profile.id) { queueVocationOp(op); return Promise.resolve(false); }
    return vocationUpsert(profile.id, [op]).then(function (ok) {
      if (!ok) queueVocationOp(op);
      else DB.flushVocationQueue();
      return ok;
    });
  };

  /* Days (1-30) the current profile finished, from the phone. */
  DB.getVocationDone = function () {
    var done = getVocationLocal().done, out = [];
    Object.keys(done).forEach(function (k) {
      var n = parseInt(k, 10);
      if (n >= 1 && n <= 30) out.push(n);
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  };

  /* Shared copy: finished Vocation days for the current profile. */
  DB.getVocationProgress = function () {
    var profile = DB.getProfile();
    if (!profile || !profile.id) return Promise.resolve([]);
    return xinit().then(function (ok) {
      if (!ok) return [];
      return xclient.from("vocation_progress")
        .select("day,completed_at").eq("profile_id", profile.id).order("day")
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    });
  };

  /* Send everything saved while offline. */
  DB.flushVocationQueue = function () {
    var profile = DB.getProfile();
    if (!profile || !profile.id) return Promise.resolve(0);
    var q = vlsGet(LS_VOC_QUEUE) || [];
    if (!q.length) return Promise.resolve(0);
    return vocationUpsert(profile.id, q).then(function (ok) {
      if (ok) vlsSet(LS_VOC_QUEUE, []);
      return ok ? q.length : 0;
    });
  };

  /* ---------------- Mindset & Well-being (65 pages) ---------------- */

  /* Mark a Mindset page complete. Same offline-first contract. */
  DB.saveMindsetPage = function (page) {
    page = parseInt(page, 10);
    if (!page || page < 1 || page > 65) return Promise.resolve(false);
    var profile = DB.getProfile();
    var at = new Date().toISOString();
    var p = getMindsetLocal();
    p.done[page] = { at: at };
    vlsSet(LS_MINDSET, p);
    var op = { page: page, at: at };
    if (!profile || !profile.id) { queueMindsetOp(op); return Promise.resolve(false); }
    return mindsetUpsert(profile.id, [op]).then(function (ok) {
      if (!ok) queueMindsetOp(op);
      else DB.flushMindsetQueue();
      return ok;
    });
  };

  /* Pages (1-65) the current profile finished, from the phone. */
  DB.getMindsetDone = function () {
    var done = getMindsetLocal().done, out = [];
    Object.keys(done).forEach(function (k) {
      var n = parseInt(k, 10);
      if (n >= 1 && n <= 65) out.push(n);
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  };

  /* Shared copy: finished Mindset pages for the current profile. */
  DB.getMindsetProgress = function () {
    var profile = DB.getProfile();
    if (!profile || !profile.id) return Promise.resolve([]);
    return xinit().then(function (ok) {
      if (!ok) return [];
      return xclient.from("mindset_progress")
        .select("page,completed_at").eq("profile_id", profile.id).order("page")
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    });
  };

  /* Send everything saved while offline. */
  DB.flushMindsetQueue = function () {
    var profile = DB.getProfile();
    if (!profile || !profile.id) return Promise.resolve(0);
    var q = vlsGet(LS_MIN_QUEUE) || [];
    if (!q.length) return Promise.resolve(0);
    return mindsetUpsert(profile.id, q).then(function (ok) {
      if (ok) vlsSet(LS_MIN_QUEUE, []);
      return ok ? q.length : 0;
    });
  };

  /* ---------------- Dashboard: every member's study progress ---------------- */

  /* For Wayne (Originator) and organizers: every active member with
     their Vocation days done (x/30) and Mindset pages done (x/65).
     Pass groupIds to scope to specific groups; null/empty = all. */
  DB.getAllMembersStudyProgress = function (groupIds) {
    return xinit().then(function (ok) {
      if (!ok) return Promise.reject(new Error("offline"));
      var q = xclient.from("profiles")
        .select("id,name,role,group_id,created_at")
        .eq("status", "active").order("created_at");
      if (groupIds && groupIds.length) q = q.in_("group_id", groupIds);
      return q.then(function (rp) {
        if (rp.error) throw rp.error;
        var members = rp.data || [];
        if (!members.length) return [];
        var ids = members.map(function (m) { return m.id; });
        return xclient.from("vocation_progress")
          .select("profile_id,day").in_("profile_id", ids)
          .then(function (rv) {
            if (rv.error) throw rv.error;
            return xclient.from("mindset_progress")
              .select("profile_id,page").in_("profile_id", ids)
              .then(function (rm) {
                if (rm.error) throw rm.error;
                var vocById = {}, minById = {};
                (rv.data || []).forEach(function (r) {
                  (vocById[r.profile_id] = vocById[r.profile_id] || {})[r.day] = true;
                });
                (rm.data || []).forEach(function (r) {
                  (minById[r.profile_id] = minById[r.profile_id] || {})[r.page] = true;
                });
                return members.map(function (m) {
                  var vDays = Object.keys(vocById[m.id] || {}).length;
                  var mPages = Object.keys(minById[m.id] || {}).length;
                  return {
                    id: m.id, name: m.name, role: m.role, group_id: m.group_id,
                    vocationDone: vDays,
                    vocationComplete: vDays >= 30,
                    mindsetDone: mPages,
                    mindsetComplete: mPages >= 65
                  };
                });
              });
          });
      });
    });
  };

  /* Flush both queues (call on app start / when back online). */
  DB.flushStudyQueues = function () {
    return DB.flushVocationQueue().then(function () {
      return DB.flushMindsetQueue();
    });
  };
})();
