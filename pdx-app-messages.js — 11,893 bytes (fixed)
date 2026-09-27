/* ============================================================
 * Paragon PDX Hub — Group Chat (Messages tab)
 * ============================================================
 * Adds a "Messages" tab to the Hub: per-group chat for approved members.
 *
 * Design (researched, solid):
 * - POLLING, not realtime. Every 5 seconds while the Messages screen is
 *   open, the app asks "any new messages since the last one I saw?"
 *   Phone sleeps, switches networks, tab goes background — the next
 *   poll grabs everything missed, in order. No connection to break.
 * - Messages are ordered by id (monotonic), never by timestamp.
 * - Each send carries a client_uuid so a retry never creates a duplicate.
 * - Polling pauses when the tab is hidden; resumes instantly on visible.
 * - Only approved members (with a profile) can open Messages.
 * - Group isolation is client-side: the app only queries its own group_id.
 *
 * Needs (all already in the app):
 *   window.__ppdx.getProfile()  -> { id, name, group_id, ... } or null
 *   window.__ppdx.viewEl()      -> the main view element
 *   window.ParagonDB            -> Supabase client (pdx-db.js)
 *   Supabase table "messages"   -> see messages-table.sql
 * ============================================================ */
(function () {
  "use strict";

  /* ---- bridge to the live app (the ONLY way in) ---- */
  var PP = window.__ppdx || {};
  var origRoute = (typeof PP.route === "function") ? PP.route : null;

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
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtTime(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  /* ---- Supabase access: own client, same project as the main module ---- */
  var xclient = null, xready = false;
  function db() { return window.ParagonDB || null; }
  function dbReady() {
    if (xready && xclient) return Promise.resolve(true);
    var d = db();
    if (!d || typeof d.getConfig !== "function") return Promise.resolve(false);
    var cfg = d.getConfig();
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
  function sbClient() { return xclient; }

  /* ---- polling state ---- */
  var pollTimer = null;
  var lastSeenId = 0;
  var currentGroupId = null;
  var POLL_MS = 5000;

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    document.removeEventListener("visibilitychange", onVisibility);
  }
  function onVisibility() {
    if (document.hidden) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    } else {
      pollNow();
      if (!pollTimer) pollTimer = setInterval(pollNow, POLL_MS);
    }
  }

  /* ---- render one message ---- */
  function msgHtml(m, myId) {
    var mine = myId && m.sender_profile_id === myId;
    return '<div class="msg' + (mine ? " mine" : "") + '">' +
      '<div class="msg-head"><b>' + esc(m.sender_name || "A member") + "</b>" +
      '<span class="msg-time">' + esc(fmtTime(m.created_at)) + "</span></div>" +
      '<div class="msg-body">' + esc(m.body) + "</div></div>";
  }

  /* ---- load + append new messages ---- */
  function pollNow() {
    if (!currentGroupId) return;
    var client = sbClient();
    if (!client) return;
    var q = client.from("messages")
      .select("id,group_id,sender_profile_id,sender_name,body,created_at")
      .eq("group_id", currentGroupId)
      .order("id", { ascending: true })
      .limit(200);
    if (lastSeenId > 0) q = q.gt("id", lastSeenId);
    q.then(function (res) {
      if (res.error) return;
      var rows = res.data || [];
      var list = document.getElementById("msg-list");
      if (!list) return;
      if (!rows.length) {
        /* First load with no messages: show empty state instead of stuck "Loading..." */
        if (lastSeenId === 0) {
          list.innerHTML = '<div class="card"><p class="muted">No messages yet. Say hello to your group!</p></div>';
        }
        return;
      }
      var p = getProfile();
      var myId = p ? p.id : null;
      /* First load: replace. Later polls: append. */
      if (lastSeenId === 0) {
        list.innerHTML = rows.map(function (m) { return msgHtml(m, myId); }).join("");
      } else {
        var html = rows.map(function (m) { return msgHtml(m, myId); }).join("");
        list.insertAdjacentHTML("beforeend", html);
      }
      lastSeenId = rows[rows.length - 1].id;
      /* Scroll to bottom on new messages */
      var wrap = document.getElementById("msg-scroll");
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
      /* Remove the "no messages" placeholder if present */
      var empty = document.getElementById("msg-empty");
      if (empty) empty.style.display = "none";
    }).catch(function () { /* silent: next poll retries */ });
  }

  /* ---- send a message ---- */
  function sendMessage() {
    var input = document.getElementById("msg-input");
    var errEl = document.getElementById("msg-error");
    var btn = document.getElementById("msg-send");
    if (!input || !btn) return;
    var body = input.value.trim();
    if (!body) return;
    var p = getProfile();
    if (!p || !currentGroupId) {
      if (errEl) errEl.textContent = "You need to be signed in to send messages.";
      return;
    }
    if (body.length > 2000) body = body.slice(0, 2000);
    errEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "Sending...";

    /* client_uuid: if the phone retries, no duplicate appears */
    var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });

    var client = sbClient();
    if (!client) {
      errEl.textContent = "No connection. Try again.";
      btn.disabled = false; btn.textContent = "Send";
      return;
    }

    var attempts = 0;
    function attempt() {
      attempts++;
      client.from("messages").insert({
        group_id: currentGroupId,
        sender_profile_id: p.id || null,
        sender_name: p.name || "A member",
        body: body,
        client_uuid: uuid
      }).then(function (res) {
        if (res.error) throw res.error;
        input.value = "";
        btn.disabled = false; btn.textContent = "Send";
        pollNow(); /* show it immediately */
      }).catch(function () {
        if (attempts < 3) {
          setTimeout(attempt, 1500 * attempts);
        } else {
          errEl.textContent = "Could not send — tap Send to retry.";
          btn.disabled = false; btn.textContent = "Send";
        }
      });
    }
    attempt();
  }

  /* ---- the Messages view ---- */
  function vMessages() {
    stopPolling();
    var p = getProfile();
    var v = viewEl();
    if (!p) {
      /* Not signed in: hand back to the original router (shows the gate). */
      if (origRoute) return origRoute();
      v.innerHTML = '<div class="card"><p class="muted">Sign in to see messages.</p></div>';
      return;
    }
    currentGroupId = p.group_id || null;
    lastSeenId = 0;

    v.innerHTML = '<h1 class="page-title">Messages</h1>' +
      '<div class="card"><p class="muted" style="margin:0">Chat with your group. ' +
      "Messages appear for everyone in the group.</p></div>" +
      '<div id="msg-scroll" style="max-height:50vh;overflow-y:auto;margin:12px 0">' +
      '<div id="msg-list"><div class="card" id="msg-empty"><p class="muted">Loading messages...</p></div></div>' +
      "</div>" +
      '<div class="card"><div class="field" style="margin:0">' +
      '<label for="msg-input">Message</label>' +
      '<textarea id="msg-input" class="essay" style="min-height:60px" ' +
      'placeholder="Write to your group..." maxlength="2000"></textarea></div>' +
      '<div class="error" id="msg-error"></div>' +
      '<button class="btn" id="msg-send">Send</button></div>';

    document.getElementById("msg-send").addEventListener("click", sendMessage);
    document.getElementById("msg-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    dbReady().then(function (ok) {
      if (!ok || !currentGroupId) {
        var empty = document.getElementById("msg-empty");
        if (empty) empty.innerHTML = '<p class="muted">Connect to the internet to see messages.</p>';
        return;
      }
      pollNow();
      pollTimer = setInterval(pollNow, POLL_MS);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("online", pollNow);
    });
  }

  /* ---- add the Messages tab to the bottom nav ---- */
  function addMessagesTab() {
    var nav = document.getElementById("bottomnav");
    if (!nav || document.querySelector('[data-tab="messages"]')) return;
    var moreLink = nav.querySelector('[data-tab="more"]');
    var a = document.createElement("a");
    a.href = "#/messages";
    a.setAttribute("data-tab", "messages");
    a.innerHTML = '<span class="ico">💬</span>Messages';
    if (moreLink) nav.insertBefore(a, moreLink);
    else nav.appendChild(a);
  }

  /* ---- route hook ---- */
  function msgRoute() {
    var h = location.hash || "";
    var parts = h.replace(/^#\//, "").split("/");
    if (parts[0] === "messages") {
      if (typeof PP.setActiveTab === "function") { try { PP.setActiveTab("messages"); } catch (e) {} }
      /* Highlight our tab manually (the app's map doesn't know "messages"). */
      document.querySelectorAll(".bottomnav a").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-tab") === "messages");
      });
      window.scrollTo(0, 0);
      vMessages();
      return true;
    }
    return false;
  }

  /* ---- install ---- */
  (function injectMsgStyles() {
    if (document.getElementById("pdx-msg-styles")) return;
    var s = document.createElement("style");
    s.id = "pdx-msg-styles";
    s.textContent =
      ".msg{margin:0 0 10px;padding:10px 12px;border-radius:12px;background:#1c1c22;max-width:85%}" +
      ".msg.mine{margin-left:auto;background:#2a3a5c}" +
      ".msg-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}" +
      ".msg-head b{font-size:13px}" +
      ".msg-time{font-size:11px;color:#888;margin-left:8px;white-space:nowrap}" +
      ".msg-body{font-size:15px;line-height:1.4;word-wrap:break-word;white-space:pre-wrap}";
    document.head.appendChild(s);
  })();

  if (origRoute) {
    try { window.removeEventListener("hashchange", PP.route); } catch (e) {}
    var prevRoute = origRoute;
    window.addEventListener("hashchange", function () {
      stopPolling();
      if (msgRoute()) return;
      prevRoute();
    });
    /* Direct load on #/messages */
    if ((location.hash || "").indexOf("#/messages") === 0) msgRoute();
    /* Leaving Messages via any other route stops polling (handled above). */
    addMessagesTab();
    /* Re-add the tab if the app re-renders its nav */
    new MutationObserver(function () { addMessagesTab(); })
      .observe(document.getElementById("bottomnav") || document.body,
               { childList: true, subtree: true });
  }
})();
