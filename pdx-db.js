/* ============================================================
 * ParagonDB — small wrapper around the Supabase JS client.
 * Plain <script> (no build step). Works from https:// and file://
 * as long as the phone is online the first time (CDN load).
 *
 * Identity model:
 *   1. Site signup (name*, email and/or phone, optional bio + photo)
 *      is a REQUEST: it creates a profiles row with status 'pending'
 *      (role 'member', no group yet) plus a membership_requests row.
 *      An organizer or Wayne (the Originator) approves it in the
 *      dashboard; only then does the phone get a member session
 *      (ppdx_member_v1). Declined or still-waiting people are told so
 *      when they try to sign in. If the approver also picks a group,
 *      the member is linked to it and emailed their group code
 *      automatically (EmailJS; skipped gracefully until configured).
 *   2. Joining the Learning Center has two paths:
 *      a) WITH a group/organizer code -> instant (the organizer already
 *         approved by sharing the code). Links the member's row to the
 *         group and records the join request as approved-by-code.
 *      b) WITHOUT a code -> a join_requests row that waits for an
 *         organizer or Wayne to approve, then links the row to a group.
 *
 * Code scheme:
 *   member     -> joins with a GROUP invite code, e.g. PARAGON-GROUP-START
 *   organizer  -> PARAGON-O- + invite code minus the "PARAGON-" prefix
 *                 e.g. group invite PARAGON-G-AB12-CD34
 *                      organizer code PARAGON-O-G-AB12-CD34
 *   originator -> (no code) Wayne is the Originator; the role is never
 *                 granted by a code.
 *
 * Local copies kept in localStorage (never blocked by network):
 *   ppdx_member_v1       {id,name,role,group_id,email,phone,bio,avatar_url}
 *   ppdx_profile_v1      {id,name,role,group_id,group_name}  (learner profile)
 *   ppdx_pending_sync_v1 [ {day,score,fridayPass,at}, ... ]
 * The phone's lesson progress (ppdx_progress_v1) stays the source of
 * truth for unlocking; Supabase is the shared copy organizers read.
 * ============================================================ */
(function () {
  "use strict";

  var SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  // Built-in defaults: the publishable key is public by design (it ships in
  // the app's code, like any website). A phone can still override these with
  // setConfig() if the project ever moves.
  var DEFAULT_URL = "https://vwcdnqrsjadatbesmrwq.supabase.co";
  var DEFAULT_KEY = "sb_publishable_CZXrS0KIidR9l5nT8ZevIQ_jBttH5RY";
  var LS_URL = "ppdx_sb_url";
  var LS_KEY = "ppdx_sb_key";
  var LS_MEMBER = "ppdx_member_v1";
  var LS_PROFILE = "ppdx_profile_v1";
  var LS_QUEUE = "ppdx_pending_sync_v1";
  var SEED_GROUP_INVITE = "PARAGON-GROUP-START";
  var AVATAR_BUCKET = "avatars";
  var GALLERY_BUCKET = "gallery";

  var client = null;
  var ready = false;
  var flushTimer = null;

  /* ============================================================
   * APPROVAL EMAILS (EmailJS) — Wayne fills these in once.
   * When a signup is approved into a group, the new member is
   * emailed their group code automatically. Until all three values
   * below are filled in, sending is skipped gracefully: approval
   * still works, and the dashboard shows the code to share by hand.
   * Setup steps (plain words):
   *   1. Make a free account at https://www.emailjs.com
   *   2. Add an Email Service (connect Wayne's Gmail) -> SERVICE ID
   *   3. Create an Email Template, paste in
   *      backend-staging/email-template.txt -> TEMPLATE ID
   *      (in the template's "To Email" field put {{to_email}})
   *   4. Copy the Public Key from Account -> General, and paste all
   *      three values here between the quotes.
   * ============================================================ */
  var EMAILJS_PUBLIC_KEY = "0nibeAM4SKMyypo63";
  var EMAILJS_SERVICE_ID = "service_74wizvg";
  var EMAILJS_TEMPLATE_ID = "template_9eb63yo";

  /* ---------- tiny helpers ---------- */

  function lsGet(k) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("cdn-load-failed")); };
      document.head.appendChild(s);
    });
  }
  function cleanCode(raw) {
    return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  }
  // Display word for a role, e.g. "Originator" (Wayne's title on the
  // site and everywhere else for paragonpdx).
  function roleWord(role) {
    if (role === "originator") return "Originator";
    if (role === "organizer") return "Organizer";
    return "Member";
  }
  function randChunk(n) {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", out = "";
    for (var i = 0; i < n; i++) out += abc[Math.floor(Math.random() * abc.length)];
    return out;
  }

  /* ---------- code parsing ---------- */
  // Returns {kind:'member'|'organizer', invite:'PARAGON-...'} or null.
  // There is no code that grants the Originator role: Wayne is the
  // Originator, and the role is never assigned by a code.
  function parseCode(raw) {
    var code = cleanCode(raw);
    if (!code) return null;
    // The old PARAGON-ORIGIN- code path is retired. Reject it outright.
    if (code.indexOf("PARAGON-ORIGIN-") === 0) return null;
    if (code.indexOf("PARAGON-O-") === 0 && code.length > "PARAGON-O-".length) {
      // Organizer code = "PARAGON-O-" + invite code without its "PARAGON-" prefix.
      return { kind: "organizer", invite: "PARAGON-" + code.slice("PARAGON-O-".length) };
    }
    // Anything else is treated as a group invite code (member join).
    return { kind: "member", invite: code };
  }

  /* ---------- public API ---------- */
  var DB = {

    isReady: function () { return ready; },

    // Save the Supabase project URL + anon key on this phone (once per device).
    setConfig: function (url, key) {
      lsSet(LS_URL, String(url || "").trim());
      lsSet(LS_KEY, String(key || "").trim());
    },
    getConfig: function () {
      return {
        url: lsGet(LS_URL) || DEFAULT_URL,
        key: lsGet(LS_KEY) || DEFAULT_KEY
      };
    },

    // Connect. Resolves true when the client works, false when offline
    // or not configured yet — the app keeps working on the phone copy.
    init: function (url, key) {
      if (url && key) DB.setConfig(url, key);
      var cfg = DB.getConfig();
      if (!cfg.url || !cfg.key) return Promise.resolve(false);
      // The launch build embeds the Supabase client library inline, so it
      // is already present and no CDN download is needed. The CDN remains
      // as a fallback for installs that load db.js without the bundle.
      var haveLib = (typeof window.supabase !== "undefined");
      return (haveLib ? Promise.resolve() : loadScript(SUPABASE_CDN)).then(function () {
        if (!window.supabase) throw new Error("cdn-load-failed");
        client = window.supabase.createClient(cfg.url, cfg.key);
        ready = true;
        DB.flushQueue(); // try to send anything saved while offline
        return true;
      }).catch(function () {
        ready = false;
        return false;
      });
    },

    /* ----- member session (site signup) ----- */

    getMember: function () { return lsGet(LS_MEMBER); },
    signOutMember: function () {
      try {
        localStorage.removeItem(LS_MEMBER);
        localStorage.removeItem(LS_PROFILE);
      } catch (e) {}
    },

    // Site signup. Name required; email and/or phone required (at least
    // one); bio + photo optional. Creates the profiles row with status
    // 'pending' (role member, no group yet) plus a membership_requests
    // row. NO local session yet: the phone gets one only after an
    // organizer or Wayne (Originator) approves. Resolves with
    // {profile, request}. details: {name, email, phone, bio, avatarUrl}
    signUpMember: function (details) {
      var d = details || {};
      var name = String(d.name || "").trim();
      var email = String(d.email || "").trim();
      var phone = String(d.phone || "").trim();
      var bio = String(d.bio || "").trim();
      if (!name) return Promise.reject(new Error("bad-name"));
      if (!email && !phone) return Promise.reject(new Error("need-contact"));
      if (!ready || !client) return Promise.reject(new Error("offline"));
      // Don't stack up duplicate open requests for the same person.
      return DB.findOpenRequest(name, email, phone).then(function (existing) {
        if (existing) throw new Error("already-requested");
        var row = {
          name: name, role: "member", group_id: null, status: "pending",
          email: email || null, phone: phone || null,
          bio: bio || null, avatar_url: d.avatarUrl || null
        };
        return client.from("profiles").insert(row)
          .select("id,name,role,group_id,status,email,phone,bio,avatar_url").single()
          .then(function (res) {
            if (res.error) throw res.error;
            var profile = res.data;
            return DB.submitMembershipRequest(profile).then(function (req) {
              return { profile: profile, request: req };
            });
          });
      });
    },

    // Save the site-signup request row. Never throws: signup already
    // validated; a notice failure must not lose the request.
    submitMembershipRequest: function (profile) {
      if (!ready || !client || !profile || !profile.id) return Promise.resolve(null);
      var row = {
        profile_id: profile.id,
        name: profile.name || "",
        email: profile.email || null,
        phone: profile.phone || null,
        bio: profile.bio || null,
        avatar_url: profile.avatar_url || null,
        status: "pending"
      };
      return client.from("membership_requests").insert(row).select("id").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; })
        .catch(function () { return null; });
    },

    // Is there already an open site-signup request for this name+contact?
    findOpenRequest: function (name, email, phone) {
      if (!ready || !client) return Promise.resolve(null);
      var em = String(email || "").toLowerCase();
      var ph = String(phone || "").toLowerCase();
      return client.from("membership_requests")
        .select("id,profile_id,name,email,phone,status")
        .eq("status", "pending").ilike("name", String(name || "").trim())
        .order("created_at", { ascending: false }).limit(20)
        .then(function (res) {
          if (res.error) return null;
          var rows = res.data || [];
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var rem = String(r.email || "").toLowerCase();
            var rph = String(r.phone || "").toLowerCase();
            if ((em && rem === em) || (ph && rph === ph)) return r;
          }
          return null;
        })
        .catch(function () { return null; });
    },

    // Membership requests for the dashboard. Site signups are not
    // group-scoped: Wayne (Originator) and every organizer see them all.
    getMembershipRequests: function () {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("membership_requests")
        .select("id,profile_id,name,email,phone,bio,avatar_url,status,reviewed_by,created_at")
        .order("created_at", { ascending: false })
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },

    // Approve or decline a site-signup request. reviewerName/reviewerRole
    // come from the dashboard (e.g. "Wayne", "originator").
    // Approving flips the linked profiles row to active; the requester
    // gets in on their next sign-in attempt.
    reviewMembershipRequest: function (requestId, approve, reviewerName, reviewerRole) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      var who = String(reviewerName || "").trim() + " · " + roleWord(reviewerRole);
      return client.from("membership_requests").select("id,profile_id")
        .eq("id", requestId).single()
        .then(function (rr) {
          if (rr.error || !rr.data) throw new Error("no-request");
          var pid = rr.data.profile_id;
          var newStatus = approve ? "approved" : "declined";
          var profStatus = approve ? "active" : "declined";
          return client.from("membership_requests")
            .update({ status: newStatus, reviewed_by: who }).eq("id", requestId)
            .then(function (r2) {
              if (r2.error) throw r2.error;
              return client.from("profiles").update({ status: profStatus }).eq("id", pid)
                .then(function (r3) {
                  if (r3.error) throw r3.error;
                  return { approved: approve };
                });
            });
        });
    },

    // Link an approved member's profiles row to a group. Used when a
    // signup is approved into a group from the dashboard — mirrors what
    // joinCourse does after a group code is entered.
    linkMemberToGroup: function (profileId, groupId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!profileId || !groupId) return Promise.reject(new Error("bad-args"));
      return client.from("profiles").update({ group_id: groupId }).eq("id", profileId)
        .select("id,name,role,group_id,email,phone,bio,avatar_url").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },

    // Email a new member their group code after approval (EmailJS).
    // Never throws and never blocks approval: resolves
    //   {sent:true}                              on success, or
    //   {sent:false, reason:'no-email'|'not-configured'|'send-failed'}
    // when the email can't go out. The dashboard shows the right
    // message for each case (including the code to share by hand).
    sendCodeEmail: function (toEmail, memberName, groupName, code) {
      var email = String(toEmail || "").trim();
      if (!email) return Promise.resolve({ sent: false, reason: "no-email" });
      if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID)
        return Promise.resolve({ sent: false, reason: "not-configured" });
      if (typeof emailjs === "undefined" || !emailjs || !emailjs.send)
        return Promise.resolve({ sent: false, reason: "not-configured" });
      try { emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); } catch (e) {}
      var params = {
        to_email: email,
        name: String(memberName || ""),
        group_name: String(groupName || ""),
        code: String(code || "")
      };
      return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params).then(
        function () { return { sent: true }; },
        function () { return { sent: false, reason: "send-failed" }; }
      );
    },

    // Edit the signed-in member's details (name/email/phone/bio/photo).
    updateMember: function (details) {
      var member = DB.getMember();
      if (!member) return Promise.reject(new Error("no-member"));
      var d = details || {};
      var patch = {};
      if (d.name !== undefined) {
        var name = String(d.name).trim();
        if (!name) return Promise.reject(new Error("bad-name"));
        patch.name = name;
      }
      if (d.email !== undefined) patch.email = String(d.email).trim() || null;
      if (d.phone !== undefined) patch.phone = String(d.phone).trim() || null;
      if (d.bio !== undefined) patch.bio = String(d.bio).trim() || null;
      if (d.avatarUrl !== undefined) patch.avatar_url = d.avatarUrl || null;
      var email = patch.email !== undefined ? patch.email : member.email;
      var phone = patch.phone !== undefined ? patch.phone : member.phone;
      if (!email && !phone) return Promise.reject(new Error("need-contact"));
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("profiles").update(patch).eq("id", member.id)
        .select("id,name,role,group_id,email,phone,bio,avatar_url").single()
        .then(function (res) {
          if (res.error) throw res.error;
          lsSet(LS_MEMBER, res.data);
          // Keep the learner profile's name in step too.
          var lp = lsGet(LS_PROFILE);
          if (lp && lp.id === member.id && res.data.name !== lp.name) {
            lp.name = res.data.name;
            lsSet(LS_PROFILE, lp);
          }
          return res.data;
        });
    },

    // Find a member by name + email-or-phone (for "sign in" on a new phone).
    // Restores the local session when exactly one ACTIVE match is found.
    // Pending -> rejects "pending" (still waiting for approval).
    // Declined -> rejects "declined". Newest row wins on duplicates.
    findMember: function (name, contact) {
      var niceName = String(name || "").trim();
      var niceContact = String(contact || "").trim().toLowerCase();
      if (!niceName || !niceContact) return Promise.reject(new Error("bad-search"));
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("profiles")
        .select("id,name,role,group_id,status,email,phone,bio,avatar_url")
        .ilike("name", niceName)
        .order("created_at", { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          var rows = res.data || [];
          var hit = null;
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var em = String(r.email || "").toLowerCase();
            var ph = String(r.phone || "").toLowerCase();
            if ((em && em === niceContact) || (ph && ph === niceContact)) { hit = r; break; }
          }
          if (!hit) return null;
          if (hit.status === "pending") throw new Error("pending");
          if (hit.status === "declined") throw new Error("declined");
          lsSet(LS_MEMBER, hit);
          if (hit.group_id) {
            lsSet(LS_PROFILE, {
              id: hit.id, name: hit.name, role: hit.role,
              group_id: hit.group_id, group_name: ""
            });
          }
          return hit;
        });
    },

    // Save a profile photo link for a pending signup: updates both the
    // profiles row and its open membership request.
    updateMemberAvatar: function (profileId, url) {
      if (!ready || !client || !profileId) return Promise.reject(new Error("no-member"));
      return client.from("profiles").update({ avatar_url: url || null }).eq("id", profileId)
        .then(function (r1) {
          if (r1.error) throw r1.error;
          return client.from("membership_requests").update({ avatar_url: url || null })
            .eq("profile_id", profileId).eq("status", "pending")
            .then(function (r2) {
              if (r2.error) throw r2.error;
              return url;
            });
        });
    },
    // Resolves with the public URL. Rejects when offline or it fails.
    // profileId: the profiles row the photo belongs to (the member may
    // not have a session yet while their signup is pending approval).
    uploadAvatar: function (file, profileId) {
      var member = DB.getMember();
      var pid = profileId || (member && member.id);
      if (!pid) return Promise.reject(new Error("no-member"));
      if (!ready || !client) return Promise.reject(new Error("offline"));
      var ext = "jpg";
      if (file && file.name && file.name.indexOf(".") > -1) {
        ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "jpg";
      }
      var path = pid + "/" + Date.now() + "." + ext;
      return client.storage.from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: (file && file.type) || "image/jpeg" })
        .then(function (res) {
          if (res.error) throw res.error;
          var pub = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
          return pub.data.publicUrl;
        });
    },

    /* ----- learning-center profile (links the member row to a group) ----- */

    getProfile: function () { return lsGet(LS_PROFILE); },
    signOut: function () {
      try { localStorage.removeItem(LS_PROFILE); } catch (e) {}
    },

    // Join the Learning Center / course WITH a group code. Instant: the
    // organizer already approved by sharing the code. Links the member's
    // existing profiles row to the group (no new row) and records the
    // join request as approved-by-code so the dashboard stays truthful.
    joinCourse: function (code) {
      var member = DB.getMember();
      if (!member) return Promise.reject(new Error("no-member"));
      var parsed = parseCode(code);
      if (!parsed) return Promise.reject(new Error("bad-code"));
      if (!ready || !client) return Promise.reject(new Error("offline"));

      // Find the group for this code (create the seed group if missing).
      return client.from("groups").select("id,name,invite_code")
        .eq("invite_code", parsed.invite).limit(1).maybeSingle()
        .then(function (res) {
          if (res.error) throw res.error;
          if (res.data) return res.data;
          throw new Error("bad-code");
        })
        .then(function (group) {
          // Link this member's row to the group (same row from site signup).
          return client.from("profiles")
            .update({ role: parsed.kind, group_id: group.id })
            .eq("id", member.id)
            .select("id,name,role,group_id,email,phone,bio,avatar_url").single()
            .then(function (r3) {
              if (r3.error) throw r3.error;
              var m = r3.data;
              lsSet(LS_MEMBER, m);
              var profile = {
                id: m.id, name: m.name, role: m.role,
                group_id: m.group_id, group_name: group.name
              };
              lsSet(LS_PROFILE, profile);
              // The code itself is the approval: record the request as
              // approved-by-code so the dashboard audit trail is true.
              return DB.submitJoinRequest(m.id, group.id, m, "approved", "Group code").then(function () {
                return profile;
              });
            });
        });
    },

    // Save a course join request row capturing the member's signup info.
    // Never throws: a failed notice must not block the learner.
    // status: 'pending' for a no-code request (waits for approval),
    // 'approved' when the member joined with a group code.
    submitJoinRequest: function (profileId, groupId, member, status, reviewedBy) {
      if (!ready || !client || !profileId) return Promise.resolve(null);
      var m = member || DB.getMember() || {};
      var st = status || "pending";
      var q = client.from("join_requests").select("id")
        .eq("profile_id", profileId).eq("status", st);
      if (groupId) q = q.eq("group_id", groupId);
      return q.limit(1).maybeSingle()
        .then(function (res) {
          if (res.error) throw res.error;
          if (res.data) return res.data; // already asked — don't double up
          var row = {
            profile_id: profileId,
            name: m.name || "",
            email: m.email || null,
            phone: m.phone || null,
            bio: m.bio || null,
            avatar_url: m.avatar_url || null,
            group_id: groupId || null,
            status: st,
            reviewed_by: reviewedBy || null
          };
          return client.from("join_requests").insert(row).select("id").single()
            .then(function (r2) { if (r2.error) throw r2.error; return r2.data; });
        })
        .catch(function () { return null; });
    },

    // Ask to join the Learning Center WITHOUT a group code. Creates a
    // pending join_requests row (group_id null). An organizer or Wayne
    // (Originator) approves it in the dashboard, picking the group.
    // The member gets no learner session until approved.
    requestCourseJoin: function () {
      var member = DB.getMember();
      if (!member) return Promise.reject(new Error("no-member"));
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return DB.submitJoinRequest(member.id, null, member, "pending", null)
        .then(function (req) {
          if (!req) throw new Error("request-failed");
          return req;
        });
    },

    // Approve a no-code course request: links the member's profiles row
    // to the chosen group and marks the request approved.
    approveCourseRequest: function (requestId, groupId, reviewerName, reviewerRole) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!groupId) return Promise.reject(new Error("no-group"));
      var who = String(reviewerName || "").trim() + " · " + roleWord(reviewerRole);
      return client.from("join_requests").select("id,profile_id,status")
        .eq("id", requestId).single()
        .then(function (rr) {
          if (rr.error || !rr.data) throw new Error("no-request");
          if (rr.data.status !== "pending") throw new Error("already-decided");
          var pid = rr.data.profile_id;
          return client.from("profiles")
            .update({ role: "member", group_id: groupId })
            .eq("id", pid).eq("group_id", null)
            .then(function (r2) {
              if (r2.error) throw r2.error;
              return client.from("join_requests")
                .update({ status: "approved", group_id: groupId, reviewed_by: who })
                .eq("id", requestId)
                .then(function (r3) {
                  if (r3.error) throw r3.error;
                  return { approved: true };
                });
            });
        });
    },

    // Decline a no-code course request.
    declineCourseRequest: function (requestId, reviewerName, reviewerRole) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      var who = String(reviewerName || "").trim() + " · " + roleWord(reviewerRole);
      return client.from("join_requests")
        .update({ status: "declined", reviewed_by: who })
        .eq("id", requestId).eq("status", "pending")
        .then(function (res) {
          if (res.error) throw res.error;
          return { approved: false };
        });
    },

    // What is this member's course-join state? Used by the Learning
    // Center gate. Returns {state:'approved'|'pending'|'declined'|'none'}.
    // 'approved' also restores the learner session on this phone.
    checkCourseApproval: function () {
      var member = DB.getMember();
      if (!member) return Promise.resolve({ state: "none" });
      var lp = DB.getProfile();
      // A learner session left by a different member on this phone
      // must not leak into this member's state.
      if (lp && lp.id !== member.id) {
        try { localStorage.removeItem(LS_PROFILE); } catch (e) {}
        lp = null;
      }
      if (lp) return Promise.resolve({ state: "approved" });
      if (!ready || !client) return Promise.resolve({ state: "unknown" });
      var self = this;
      return client.from("profiles").select("id,group_id")
        .eq("id", member.id).single()
        .then(function (rp) {
          if (!rp.error && rp.data && rp.data.group_id) {
            // Approved (probably with a code on another phone): link up.
            return self.linkLearnerSession(member.id).then(function () {
              return { state: "approved" };
            });
          }
          return client.from("join_requests").select("id,status")
            .eq("profile_id", member.id).eq("status", "pending")
            .order("created_at", { ascending: false }).limit(1).maybeSingle()
            .then(function (r2) {
              if (!r2.error && r2.data) return { state: "pending" };
              return client.from("join_requests").select("id")
                .eq("profile_id", member.id).eq("status", "declined")
                .order("created_at", { ascending: false }).limit(1).maybeSingle()
                .then(function (r3) {
                  return { state: (!r3.error && r3.data) ? "declined" : "none" };
                });
            });
        })
        .catch(function () { return { state: "unknown" }; });
    },

    // Build the learner session (LS_PROFILE) from the member's linked row.
    linkLearnerSession: function (profileId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("profiles")
        .select("id,name,role,group_id").eq("id", profileId).single()
        .then(function (rp) {
          if (rp.error || !rp.data || !rp.data.group_id) throw new Error("not-linked");
          var m = rp.data;
          return client.from("groups").select("id,name").eq("id", m.group_id)
            .limit(1).maybeSingle()
            .then(function (rg) {
              var gname = (!rg.error && rg.data) ? rg.data.name : "";
              var profile = {
                id: m.id, name: m.name, role: m.role,
                group_id: m.group_id, group_name: gname
              };
              lsSet(LS_PROFILE, profile);
              var mem = DB.getMember();
              if (mem && mem.id === m.id) {
                mem.role = m.role; mem.group_id = m.group_id;
                lsSet(LS_MEMBER, mem);
              }
              return profile;
            });
        });
    },

    // Join requests for the dashboard. groupIds null/empty = all
    // (Wayne the Originator); otherwise only those groups.
    getJoinRequests: function (groupIds) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      var q = client.from("join_requests")
        .select("id,profile_id,name,email,phone,bio,avatar_url,group_id,status,reviewed_by,created_at")
        .order("created_at", { ascending: false });
      if (groupIds && groupIds.length) q = q.in_("group_id", groupIds);
      return q.then(function (res) { if (res.error) throw res.error; return res.data; });
    },

    // Save one finished day. Never throws: on network trouble the op is
    // queued on the phone and retried on the next save (or next init).
    saveProgress: function (day, score, fridayPass) {
      var profile = DB.getProfile();
      var op = { day: day, score: score, fridayPass: !!fridayPass, at: Date.now() };
      if (!profile || !ready || !client) { queueOp(op); return Promise.resolve(false); }
      return client.from("progress")
        .upsert(
          { profile_id: profile.id, day: day, score: score, friday_pass: !!fridayPass },
          { onConflict: "profile_id,day" }
        )
        .then(function (res) {
          if (res.error) { queueOp(op); return false; }
          DB.flushQueue();
          return true;
        })
        .catch(function () { queueOp(op); return false; });
    },

    // Try to send everything that was saved while offline.
    flushQueue: function () {
      if (!ready || !client) return Promise.resolve(0);
      var profile = DB.getProfile();
      if (!profile) return Promise.resolve(0);
      var q = lsGet(LS_QUEUE) || [];
      if (!q.length) return Promise.resolve(0);
      var rows = q.map(function (op) {
        return { profile_id: profile.id, day: op.day, score: op.score, friday_pass: !!op.fridayPass };
      });
      return client.from("progress").upsert(rows, { onConflict: "profile_id,day" })
        .then(function (res) {
          if (!res.error) lsSet(LS_QUEUE, []);
          return res.error ? 0 : rows.length;
        })
        .catch(function () { return 0; });
    },

    getAllGroups: function () {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("groups").select("id,name,invite_code").order("created_at")
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },

    // Members of one group with days done, average score, finished flag.
    getGroupMembers: function (groupId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("profiles").select("id,name,role,created_at")
        .eq("group_id", groupId).order("created_at")
        .then(function (rp) {
          if (rp.error) throw rp.error;
          var members = rp.data || [];
          if (!members.length) return [];
          var ids = members.map(function (m) { return m.id; });
          return client.from("progress").select("profile_id,day,score").in_("profile_id", ids)
            .then(function (rg) {
              if (rg.error) throw rg.error;
              var byId = {};
              (rg.data || []).forEach(function (row) {
                (byId[row.profile_id] = byId[row.profile_id] || []).push(row);
              });
              return members.map(function (m) {
                var rows = byId[m.id] || [];
                var days = {};
                rows.forEach(function (r) { days[r.day] = true; });
                var daysDone = Object.keys(days).length;
                var total = rows.reduce(function (s, r) { return s + (r.score || 0); }, 0);
                return {
                  id: m.id, name: m.name, role: m.role,
                  daysDone: daysDone,
                  avgScore: rows.length ? Math.round(total / rows.length * 10) / 10 : null,
                  complete: daysDone >= 130
                };
              });
            });
        });
    },

    // Make a finished member an organizer with their own new group.
    // App-level rule (also in README): only members with all 130 days.
    promoteToOrganizer: function (profileId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("profiles").select("id,name,role,group_id")
        .eq("id", profileId).single()
        .then(function (rp) {
          if (rp.error || !rp.data) throw new Error("no-profile");
          var member = rp.data;
          if (member.role !== "member") throw new Error("not-a-member");
          return client.from("progress").select("day").eq("profile_id", profileId)
            .then(function (rg) {
              if (rg.error) throw rg.error;
              var days = {};
              (rg.data || []).forEach(function (r) { days[r.day] = true; });
              if (Object.keys(days).length < 130) throw new Error("not-complete");
              var invite = "PARAGON-G-" + randChunk(4) + "-" + randChunk(4);
              var groupName = member.name + "'s Group";
              return client.from("groups")
                .insert({ name: groupName, invite_code: invite })
                .select("id,name,invite_code").single()
                .then(function (rgr) {
                  if (rgr.error) throw rgr.error;
                  return client.from("profiles")
                    .update({ role: "organizer", group_id: rgr.data.id })
                    .eq("id", profileId).select("id,name,role,group_id").single()
                    .then(function (rup) {
                      if (rup.error) throw rup.error;
                      return {
                        profile: rup.data,
                        group: rgr.data,
                        // Organizer code for the new group (share with the new organizer):
                        organizerCode: "PARAGON-O-" + invite.slice("PARAGON-".length)
                      };
                    });
                });
            });
        });
    },

    /* ----- community features (migration 005) -----
       Announcements, events + RSVP, volunteer needs + signups,
       discussion board, contact inbox, photo gallery, member directory.
       Posting/creating/deleting is for organizers and Wayne
       (Originator) from the dashboard; members read and join in from
       the app. Reads and writes reject with "offline" when the phone
       can't reach the database — nothing here uses the offline queue. */

    // ---- announcements ----
    listAnnouncements: function (limit) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      var q = client.from("announcements")
        .select("id,title,body,author_name,author_role,created_at")
        .order("created_at", { ascending: false });
      if (limit) q = q.limit(limit);
      return q.then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },
    postAnnouncement: function (title, body, authorName, authorRole) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      title = String(title || "").trim();
      body = String(body || "").trim();
      if (!title || !body) return Promise.reject(new Error("bad-args"));
      return client.from("announcements").insert({
        title: title,
        body: body,
        author_name: String(authorName || "").trim(),
        author_role: roleWord(authorRole)
      }).select("id").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    deleteAnnouncement: function (id) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("announcements").delete().eq("id", id)
        .then(function (res) { if (res.error) throw res.error; return true; });
    },

    // ---- events + RSVP ----
    listEvents: function () {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("events")
        .select("id,title,description,location,starts_at,created_by,created_at")
        .order("starts_at", { ascending: true })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },
    createEvent: function (title, description, location, startsAt, createdBy) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      title = String(title || "").trim();
      if (!title) return Promise.reject(new Error("bad-args"));
      return client.from("events").insert({
        title: title,
        description: String(description || "").trim() || null,
        location: String(location || "").trim() || null,
        starts_at: startsAt || null,
        created_by: String(createdBy || "").trim()
      }).select("id").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    deleteEvent: function (id) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("events").delete().eq("id", id)
        .then(function (res) { if (res.error) throw res.error; return true; });
    },
    // One RSVP per member: any existing RSVP by this profile is removed
    // first, so tapping twice can't double-count.
    rsvpEvent: function (eventId, profileId, name) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!eventId) return Promise.reject(new Error("bad-args"));
      var row = { event_id: eventId, profile_id: profileId || null, name: String(name || "") };
      var rm = profileId
        ? client.from("event_rsvps").delete().eq("event_id", eventId).eq("profile_id", profileId)
        : Promise.resolve({ error: null });
      return rm.then(function () {
        return client.from("event_rsvps").insert(row).select("id").single();
      }).then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    cancelRsvp: function (eventId, profileId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!eventId || !profileId) return Promise.reject(new Error("bad-args"));
      return client.from("event_rsvps").delete()
        .eq("event_id", eventId).eq("profile_id", profileId)
        .then(function (res) { if (res.error) throw res.error; return true; });
    },
    getEventRsvps: function (eventId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("event_rsvps")
        .select("id,profile_id,name,created_at").eq("event_id", eventId)
        .order("created_at", { ascending: true })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },

    // ---- volunteer opportunities + signups ----
    listVolunteerNeeds: function () {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("volunteer_needs")
        .select("id,title,description,when_text,spots,created_by,created_at")
        .order("created_at", { ascending: false })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },
    postVolunteerNeed: function (title, description, whenText, spots, createdBy) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      title = String(title || "").trim();
      if (!title) return Promise.reject(new Error("bad-args"));
      var n = parseInt(spots, 10);
      if (isNaN(n) || n < 0) n = 0; // 0 = as many as show up
      return client.from("volunteer_needs").insert({
        title: title,
        description: String(description || "").trim() || null,
        when_text: String(whenText || "").trim() || null,
        spots: n,
        created_by: String(createdBy || "").trim()
      }).select("id").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    deleteVolunteerNeed: function (id) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("volunteer_needs").delete().eq("id", id)
        .then(function (res) { if (res.error) throw res.error; return true; });
    },
    signupVolunteer: function (needId, profileId, name) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!needId) return Promise.reject(new Error("bad-args"));
      var row = { need_id: needId, profile_id: profileId || null, name: String(name || "") };
      var rm = profileId
        ? client.from("volunteer_signups").delete().eq("need_id", needId).eq("profile_id", profileId)
        : Promise.resolve({ error: null });
      return rm.then(function () {
        return client.from("volunteer_signups").insert(row).select("id").single();
      }).then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    cancelVolunteerSignup: function (needId, profileId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!needId || !profileId) return Promise.reject(new Error("bad-args"));
      return client.from("volunteer_signups").delete()
        .eq("need_id", needId).eq("profile_id", profileId)
        .then(function (res) { if (res.error) throw res.error; return true; });
    },
    getVolunteerSignups: function (needId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("volunteer_signups")
        .select("id,profile_id,name,created_at").eq("need_id", needId)
        .order("created_at", { ascending: true })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },

    // ---- discussion board ----
    listDiscussionTopics: function () {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("discussion_topics")
        .select("id,title,body,author_profile_id,author_name,created_at")
        .order("created_at", { ascending: false })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },
    createDiscussionTopic: function (title, body, authorProfileId, authorName) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      title = String(title || "").trim();
      if (!title) return Promise.reject(new Error("bad-args"));
      return client.from("discussion_topics").insert({
        title: title,
        body: String(body || "").trim() || null,
        author_profile_id: authorProfileId || null,
        author_name: String(authorName || "").trim()
      }).select("id").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    getDiscussionTopic: function (id) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("discussion_topics")
        .select("id,title,body,author_profile_id,author_name,created_at")
        .eq("id", id).single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    listDiscussionReplies: function (topicId) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("discussion_replies")
        .select("id,body,author_profile_id,author_name,created_at")
        .eq("topic_id", topicId).order("created_at", { ascending: true })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },
    postDiscussionReply: function (topicId, body, authorProfileId, authorName) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      body = String(body || "").trim();
      if (!topicId || !body) return Promise.reject(new Error("bad-args"));
      return client.from("discussion_replies").insert({
        topic_id: topicId,
        body: body,
        author_profile_id: authorProfileId || null,
        author_name: String(authorName || "").trim()
      }).select("id").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    // Replies are removed by the database (ON DELETE CASCADE).
    deleteDiscussionTopic: function (id) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("discussion_topics").delete().eq("id", id)
        .then(function (res) { if (res.error) throw res.error; return true; });
    },

    // ---- public contact form inbox ----
    submitContactMessage: function (name, email, phone, message) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      message = String(message || "").trim();
      if (!message) return Promise.reject(new Error("bad-args"));
      return client.from("contact_messages").insert({
        name: String(name || "").trim() || null,
        email: String(email || "").trim() || null,
        phone: String(phone || "").trim() || null,
        message: message
      }).select("id").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    listContactMessages: function () {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("contact_messages")
        .select("id,name,email,phone,message,is_read,created_at")
        .order("created_at", { ascending: false })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },
    markContactMessageRead: function (id) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("contact_messages").update({ is_read: true }).eq("id", id)
        .then(function (res) { if (res.error) throw res.error; return true; });
    },

    // ---- photo gallery ----
    listGalleryPhotos: function () {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("gallery_photos")
        .select("id,image_url,caption,uploaded_by,created_at")
        .order("created_at", { ascending: false })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },
    addGalleryPhoto: function (imageUrl, caption, uploadedBy) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!imageUrl) return Promise.reject(new Error("bad-args"));
      return client.from("gallery_photos").insert({
        image_url: imageUrl,
        caption: String(caption || "").trim() || null,
        uploaded_by: String(uploadedBy || "").trim()
      }).select("id").single()
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    },
    deleteGalleryPhoto: function (id) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("gallery_photos").delete().eq("id", id)
        .then(function (res) { if (res.error) throw res.error; return true; });
    },
    uploadGalleryPhoto: function (file) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!file) return Promise.reject(new Error("bad-args"));
      var ext = "jpg";
      if (file.name && file.name.indexOf(".") > -1) {
        ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "jpg";
      }
      var path = "photo-" + Date.now() + "." + ext;
      return client.storage.from(GALLERY_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" })
        .then(function (res) {
          if (res.error) throw res.error;
          var pub = client.storage.from(GALLERY_BUCKET).getPublicUrl(path);
          return pub.data.publicUrl;
        });
    },

    // ---- member directory (opt-in) ----
    getDirectoryMembers: function () {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      return client.from("profiles")
        .select("id,name,bio,avatar_url,role")
        .eq("directory_opt_in", true).eq("status", "active")
        .order("name", { ascending: true })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    },
    setDirectoryOptIn: function (profileId, optIn) {
      if (!ready || !client) return Promise.reject(new Error("offline"));
      if (!profileId) return Promise.reject(new Error("bad-args"));
      return client.from("profiles").update({ directory_opt_in: !!optIn }).eq("id", profileId)
        .then(function (res) { if (res.error) throw res.error; return true; });
    }
  };

  function queueOp(op) {
    var q = lsGet(LS_QUEUE) || [];
    // One pending op per day: newest wins.
    q = q.filter(function (o) { return o.day !== op.day; });
    q.push(op);
    lsSet(LS_QUEUE, q);
    // Also retry quietly a little later in case the network blips back.
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(function () { DB.flushQueue(); }, 30000);
  }

  window.ParagonDB = DB;
})();
