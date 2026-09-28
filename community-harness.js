/* Community-features harness for the Paragon PDX Hub (migration 005).
   Loads db.js in a vm sandbox with an in-memory Supabase fake and
   exercises every new data function. Run: node /tmp/community-harness.js */
"use strict";
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const SITE = path.join(process.env.HOME, "workspace/paragon-pdx-hub-site");

/* ---------- in-memory Supabase fake ---------- */
let idSeq = 0;
function newId() { idSeq += 1; return "fake-id-" + idSeq; }

function makeTable(name) {
  const rows = [];
  return {
    name, rows,
    seed(r) { rows.push(Object.assign({ id: newId(), created_at: new Date().toISOString() }, r)); },
  };
}

/* Mirror the column defaults the real migration applies in Postgres. */
const tableDefaults = {
  contact_messages: { is_read: false },
  volunteer_needs: { spots: 0 },
  profiles: { directory_opt_in: false },
};

function builder(table) {
  const b = {
    _t: table, _op: "select", _filters: [], _orders: [], _limit: null, _single: false, _payload: null,
    select() { return b; },
    insert(row) { b._op = "insert"; b._payload = row; return b; },
    update(patch) { b._op = "update"; b._payload = patch; return b; },
    delete() { b._op = "delete"; return b; },
    eq(col, val) { b._filters.push(r => r[col] === val); return b; },
    ilike() { return b; },
    order(col, opts) { b._orders.push({ col, asc: !opts || opts.ascending !== false }); return b; },
    limit(n) { b._limit = n; return b; },
    single() { b._single = true; return b; },
    then(resolve, reject) {
      const p = new Promise(res => {
        try {
          let out = table.rows.filter(r => b._filters.every(f => f(r)));
          if (b._op === "select") {
            b._orders.forEach(o => {
              out = out.slice().sort((x, y) => {
                const a = x[o.col], c = y[o.col];
                if (a == null && c == null) return 0;
                if (a == null) return 1;   // nulls last, like Postgres ASC
                if (c == null) return -1;
                return (a < c ? -1 : a > c ? 1 : 0) * (o.asc ? 1 : -1);
              });
            });
            if (b._limit != null) out = out.slice(0, b._limit);
            if (b._single) out = out.length ? out[0] : null;
          } else if (b._op === "insert") {
            const row = Object.assign({ id: newId(), created_at: new Date().toISOString() },
              tableDefaults[table.name] || {}, b._payload);
            table.rows.push(row);
            out = b._single ? row : [row];
          } else if (b._op === "update") {
            out.forEach(r => Object.assign(r, b._payload));
            if (b._single) out = out.length ? out[0] : null;
          } else if (b._op === "delete") {
            // cascade: child rows follow their parents
            const doomed = new Set(out.map(r => r.id));
            if (table.name === "discussion_topics") {
              tables.discussion_replies.rows = tables.discussion_replies.rows.filter(r => !doomed.has(r.topic_id));
            }
            if (table.name === "events") {
              tables.event_rsvps.rows = tables.event_rsvps.rows.filter(r => !doomed.has(r.event_id));
            }
            if (table.name === "volunteer_needs") {
              tables.volunteer_signups.rows = tables.volunteer_signups.rows.filter(r => !doomed.has(r.need_id));
            }
            table.rows = table.rows.filter(r => !doomed.has(r.id));
            out = [];
          }
          res({ data: out, error: null });
        } catch (e) { res({ data: null, error: e }); }
      });
      return p.then(resolve, reject);
    },
  };
  return b;
}

const tables = {};
["announcements", "events", "event_rsvps", "volunteer_needs", "volunteer_signups",
 "discussion_topics", "discussion_replies", "contact_messages", "gallery_photos",
 "profiles", "membership_requests", "join_requests", "groups", "progress"].forEach(t => {
  tables[t] = makeTable(t);
});

const fakeStorage = {};
const fakeClient = {
  from: t => builder(tables[t] || (tables[t] = makeTable(t))),
  storage: {
    from: bucket => ({
      upload: (p, file) => { fakeStorage[bucket + "/" + p] = file; return Promise.resolve({ error: null }); },
      getPublicUrl: p => ({ data: { publicUrl: "https://fake.storage/" + bucket + "/" + p } }),
    }),
  },
};

/* ---------- load db.js in a sandbox ---------- */
function loadDB() {
  const store = {};
  const sandbox = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: { querySelector: () => ({}) }, // truthy -> loadScript resolves, no DOM needed
    navigator: {},
    setTimeout, clearTimeout, console,
  };
  sandbox.window = sandbox;
  sandbox.window.supabase = { createClient: () => fakeClient };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SITE, "db.js"), "utf8"), sandbox, { filename: "db.js" });
  return sandbox.window.ParagonDB;
}

const DB = loadDB();

/* ---------- test runner ---------- */
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; }
  else { fail += 1; console.log("FAIL:", name); }
}
async function rejectsWith(p, msg) {
  try { await p; return false; }
  catch (e) { return e && e.message === msg; }
}

(async () => {
  check("init resolves true with fake client", (await DB.init()) === true);

  // ---- announcements ----
  const a1 = await DB.postAnnouncement("First", "Hello world", "Wayne", "originator");
  check("postAnnouncement returns id", !!(a1 && a1.id));
  await new Promise(r => setTimeout(r, 5));
  await DB.postAnnouncement("Second", "More news", "Wayne", "originator");
  const anns = await DB.listAnnouncements();
  check("listAnnouncements newest first", anns.length === 2 && anns[0].title === "Second");
  check("announcement carries Originator role", anns[0].author_role === "Originator");
  const anns1 = await DB.listAnnouncements(1);
  check("listAnnouncements honors limit", anns1.length === 1);
  check("postAnnouncement rejects empty title", await rejectsWith(DB.postAnnouncement("", "x", "W", "originator"), "bad-args"));
  await DB.deleteAnnouncement(a1.id);
  check("deleteAnnouncement removes it", (await DB.listAnnouncements()).length === 1);

  // ---- events + RSVP ----
  const e1 = await DB.createEvent("Park cleanup", "Bring gloves", "Laurelhurst", "2026-10-01T10:00:00Z", "Wayne");
  const e2 = await DB.createEvent("Early breakfast", null, null, "2026-09-20T08:00:00Z", "Wayne");
  const evs = await DB.listEvents();
  check("listEvents ordered by starts_at ascending", evs.length === 2 && evs[0].id === e2.id);
  await DB.rsvpEvent(e1.id, "p1", "Dir Member");
  await DB.rsvpEvent(e1.id, "p1", "Dir Member");
  check("rsvpEvent does not double-count", (await DB.getEventRsvps(e1.id)).length === 1);
  await DB.cancelRsvp(e1.id, "p1");
  check("cancelRsvp removes RSVP", (await DB.getEventRsvps(e1.id)).length === 0);
  await DB.deleteEvent(e2.id);
  check("deleteEvent removes it", (await DB.listEvents()).length === 1);

  // ---- volunteer ----
  const v1 = await DB.postVolunteerNeed("Serve breakfast", "Cook + serve", "Saturdays 8-10", 4, "Wayne");
  check("postVolunteerNeed keeps spots", (await DB.listVolunteerNeeds())[0].spots === 4);
  await DB.signupVolunteer(v1.id, "p1", "Dir Member");
  await DB.signupVolunteer(v1.id, "p1", "Dir Member");
  check("signupVolunteer does not double-count", (await DB.getVolunteerSignups(v1.id)).length === 1);
  await DB.cancelVolunteerSignup(v1.id, "p1");
  check("cancelVolunteerSignup removes signup", (await DB.getVolunteerSignups(v1.id)).length === 0);
  await DB.deleteVolunteerNeed(v1.id);
  check("deleteVolunteerNeed removes it", (await DB.listVolunteerNeeds()).length === 0);

  // ---- discussion ----
  const t1 = await DB.createDiscussionTopic("Welcome", "Say hi", "p1", "Dir Member");
  await DB.postDiscussionReply(t1.id, "Hi!", "p2", "Hidden");
  await new Promise(r => setTimeout(r, 5));
  await DB.postDiscussionReply(t1.id, "Hello!", "p1", "Dir Member");
  const reps = await DB.listDiscussionReplies(t1.id);
  check("replies come back oldest first", reps.length === 2 && reps[0].body === "Hi!");
  check("createDiscussionTopic rejects empty title", await rejectsWith(DB.createDiscussionTopic("", "b", "p1", "n"), "bad-args"));
  await DB.deleteDiscussionTopic(t1.id);
  check("deleteDiscussionTopic removes topic", (await DB.listDiscussionTopics()).length === 0);
  check("deleteDiscussionTopic cascades replies", (await DB.listDiscussionReplies(t1.id)).length === 0);

  // ---- contact inbox ----
  const cm = await DB.submitContactMessage("Visitor", "v@example.com", "", "How do I join?");
  check("submitContactMessage stores unread", (await DB.listContactMessages())[0].is_read === false);
  await DB.markContactMessageRead(cm.id);
  check("markContactMessageRead flips flag", (await DB.listContactMessages())[0].is_read === true);
  check("submitContactMessage rejects empty message", await rejectsWith(DB.submitContactMessage("V", "", "", ""), "bad-args"));

  // ---- gallery ----
  const g1 = await DB.addGalleryPhoto("https://x/y.jpg", "Village day", "Wayne");
  check("addGalleryPhoto + listGalleryPhotos", (await DB.listGalleryPhotos()).length === 1);
  const gurl = await DB.uploadGalleryPhoto({ name: "pic.png", type: "image/png", size: 100 });
  check("uploadGalleryPhoto returns gallery URL", typeof gurl === "string" && gurl.indexOf("gallery") > -1);
  await DB.deleteGalleryPhoto(g1.id);
  check("deleteGalleryPhoto removes it", (await DB.listGalleryPhotos()).length === 0);

  // ---- member directory (opt-in) ----
  tables.profiles.seed({ id: "p1", name: "Dir Member", status: "active", directory_opt_in: false, bio: "hi", avatar_url: null, role: "member" });
  tables.profiles.seed({ id: "p2", name: "Hidden One", status: "active", directory_opt_in: false, bio: "", avatar_url: null, role: "member" });
  check("opted-out members not listed", (await DB.getDirectoryMembers()).length === 0);
  await DB.setDirectoryOptIn("p1", true);
  const dir = await DB.getDirectoryMembers();
  check("opted-in member listed, others not", dir.length === 1 && dir[0].name === "Dir Member");
  await DB.setDirectoryOptIn("p1", false);
  check("opt-out removes from directory", (await DB.getDirectoryMembers()).length === 0);

  // ---- offline behavior ----
  const DB2 = loadDB(); // never init'd
  check("reads reject offline when not connected", await rejectsWith(DB2.listAnnouncements(), "offline"));
  check("writes reject offline when not connected", await rejectsWith(DB2.postAnnouncement("t", "b", "w", "organizer"), "offline"));

  console.log("\n" + pass + " passed, " + fail + " failed out of " + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });
