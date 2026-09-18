
/* ----- written-guide docs (loaded from pdx-docs.js) ----- */
var EMBED_DOCS = window.EMBED_DOCS || null;
function vDoc(which){
  var back = { guide: "#/learn", answers: "#/guide", references: "#/guide" };
  var title = { guide: "Written Guide", answers: "Answer Sheet", references: "References" };
  var b = (back[which] ? back[which] : "#/learn");
  var body = (EMBED_DOCS && EMBED_DOCS[which]) ? EMBED_DOCS[which] : "<p>Missing.</p>";
  document.getElementById("view").innerHTML = '<a class="btn secondary small" href="' + b + '">Back</a>' +
    '<h1 class="page-title">' + (title[which] || "Guide") + '</h1>' +
    '<div class="docview">' + body + "</div>";
}
function vLessonDoc(day){
  var body = (EMBED_DOCS && EMBED_DOCS.lessons && EMBED_DOCS.lessons[String(day)]) || "";
  if (!body) { location.hash = "#/guide"; return; }
  document.getElementById("view").innerHTML =
    '<a class="btn secondary small" href="#/guide">Written guide</a>' +
    '<a class="btn secondary small" href="#/learn/day/' + day + '">Take the Day ' + day + " quiz</a>" +
    '<div class="docview">' + body + "</div>";
}
/* Paragon PDX Hub — app logic (plain JS, no build step) */
(function () {
"use strict";

/* ---------------- data ---------------- */
var QD = window.QUESTIONS_DATA || { weeks: [] };
var WT = window.WEEKS_TEXT || {};

var DAYS = {};   // day number -> {day, week, weekday, title, questions, essay}
var WEEKS = {};  // week number -> {week, title, days:[daynums]}
QD.weeks.forEach(function (w) {
  WEEKS[w.week] = { week: w.week, title: w.title, days: [] };
  w.days.forEach(function (d) {
    var entry = {
      day: d.day, week: w.week,
      weekday: d.weekday, title: d.title,
      questions: d.questions, essay: d.essay || null
    };
    DAYS[d.day] = entry;
    WEEKS[w.week].days.push(d.day);
  });
});
var TOTAL_DAYS = Object.keys(DAYS).length; // 130
var TOTAL_WEEKS = Object.keys(WEEKS).length; // 26

function pad3(n){ return ("00" + n).slice(-3); }
function cleanWeekTitle(t){ return String(t || "").replace(/^Week \d+:\s*/, ""); }
function lessonLabel(d){
  var e = DAYS[d];
  return "Week " + e.week + " · Day " + e.day + " (" + e.weekday + ")";
}

/* ---------------- storage ---------------- */
function lsGet(k){ try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

/* Learning progress — always on the phone; Supabase keeps the shared copy. */

function getProgress(){
  var p = lsGet("ppdx_progress_v1");
  if (!p || typeof p !== "object" || !p.done) p = { done: {} };
  return p;
}
function saveProgress(p){ lsSet("ppdx_progress_v1", p); }
function isDone(day){ return !!getProgress().done[day]; }
function highestDone(){
  var done = getProgress().done, h = 0;
  Object.keys(done).forEach(function (k) { var n = parseInt(k, 10); if (n > h) h = n; });
  return h;
}
/* A lesson is open when it is the next one in line, or any earlier (missed) one.
   The next lesson also waits until 3:45 AM the morning after the previous one
   was finished, so the study moves one day at a time. */
function isOpen(day){
  var hd = highestDone();
  if (day <= hd) return true;
  if (day !== hd + 1) return false;
  var prev = getProgress().done[day - 1];
  if (!prev || !prev.at) return true; /* Day 1, or a record saved before timestamps existed. */
  var u = new Date(prev.at);
  u.setDate(u.getDate() + 1);
  u.setHours(3, 45, 0, 0);
  return new Date() >= u;
}

/* ---------------- tiny helpers ---------------- */
function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
var toastTimer = null;
function toast(msg){
  var t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 2600);
}
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "")); }
function firstName(n){ return String(n || "").trim().split(/\s+/)[0] || ""; }

/* ---------------- member session (site signup) ---------------- */
/* After the one-time site signup the phone keeps the member session.
   The Learning Center is a second step inside: it links this same
   member to a group with a group/organizer code. */
function getMember(){
  try { return window.ParagonDB ? window.ParagonDB.getMember() : null; }
  catch (e) { return null; }
}

/* ---------------- learning-center profile (Supabase-backed) ---------------- */
function getProfile(){
  try { return window.ParagonDB ? window.ParagonDB.getProfile() : null; }
  catch (e) { return null; }
}
var ROLE_LABEL = { member: "Member", organizer: "Organizer", originator: "Originator" };
function roleLabel(role){ return ROLE_LABEL[role] || "Member"; }

function updateBadge(){
  var p = getProfile();
  var b = document.getElementById("role-badge");
  if (p) { b.textContent = roleLabel(p.role); b.style.display = ""; }
  else { b.style.display = "none"; }
}

/* ---------------- community news (hand-picked bulletin) ---------------- */
var COMMUNITY_NEWS = [
  { name: "Blanchet House",
    line: "Free hot meals six days a week in Old Town, plus clothing and shelter programs for men working toward recovery.",
    url: "https://blanchethouse.org/" },
  { name: "Sisters of the Road",
    line: "A nonprofit café in Old Town serving nourishing meals with dignity since 1979.",
    url: "https://sistersoftheroad.org/" },
  { name: "Portland Rescue Mission",
    line: "Shelter, daily meals, and recovery programs for men, women, and children at Burnside.",
    url: "https://www.portlandrescuemission.org/" },
  { name: "CityTeam Portland",
    line: "Overnight shelter for men, hot meals, groceries, and recovery programs on SE Grand Ave.",
    url: "https://www.cityteam.org/portland/" },
  { name: "Union Gospel Mission",
    line: "Serving people on Portland's streets since 1927 with meals, shelter, and recovery help.",
    url: "https://www.ugmportland.org/" },
  { name: "JOIN",
    line: "Walks with people from the streets into permanent housing, with outreach teams across the city.",
    url: "https://www.joinpdx.org/" },
  { name: "Street Roots",
    line: "A weekly newspaper sold by people experiencing homelessness — a way to earn an income with dignity.",
    url: "https://www.streetroots.org/" },
  { name: "Outside In",
    line: "Health care, housing help, and wraparound services for homeless youth and other marginalized neighbors.",
    url: "https://outsidein.org/" },
  { name: "Rose Haven",
    line: "Portland's only day shelter built for women, children, and gender-diverse people — meals, rest, and resources.",
    url: "https://rosehaven.org/" },
  { name: "Dignity Village",
    line: "A self-governed tiny-home village near the airport, sheltering neighbors night after night.",
    url: "http://dignityvillage.org/" }
];

/* ---------------- router ---------------- */
/* Public (no signup): the landing page, Join, and Sign in.
   Approved members: everything else. The Learning Center adds its own
   entry step inside the members' area: a group code for instant entry,
   or a join request an organizer or Wayne (Originator) approves. */
var view = document.getElementById("view");
var PUBLIC_ROUTES = { "": true, join: true, signin: true, contact: true };

function route(){
  var h = location.hash || "#/";
  var parts = h.replace(/^#\//, "").split("/");
  var tab = parts[0];
  var member = getMember();
  renderNav();
  window.scrollTo(0, 0);
  if (!member && !PUBLIC_ROUTES[tab]) { location.hash = "#/"; return; }
  setActiveTab(tab);
  if (tab === "") return vLanding();
  if (tab === "join") return vSignup();
  if (tab === "signin") return vSignin();
  if (tab === "home") return vHome();
  if (tab === "learn") {
    if (!getProfile()) return vLearnGate("#/" + parts.join("/"));
    if (parts[1] === "week" && parts[2]) return vLearnWeek(parseInt(parts[2], 10));
    if (parts[1] === "day" && parts[2]) return vLesson(parseInt(parts[2], 10));
    if (parts[1] === "progress") return vProgress();
    return vLearn();
  }
  // The written guide lives inside the Learning Center (embedded docs).
  if (tab === "guide") return vDoc("guide");
  if (tab === "answers") return vDoc("answers");
  if (tab === "references") return vDoc("references");
  if (tab === "lesson-doc" && parts[1]) return vLessonDoc(parseInt(parts[1], 10));
  if (tab === "meet") return vMeet();
  if (tab === "resources") return vResources();
  if (tab === "events") return vEvents();
  if (tab === "news") return vNews();
  if (tab === "directory") return vDirectory();
  if (tab === "discuss") {
    if (parts[1]) return vTopic(parts[1]);
    return vDiscuss();
  }
  if (tab === "volunteer") return vVolunteer();
  if (tab === "gallery") return vGallery();
  if (tab === "contact") return vContact();
  if (tab === "about") return vAbout();
  if (tab === "install") return vInstall();
  if (tab === "more") return vMore();
  if (tab === "profile") return vProfile();
  return member ? vHome() : vLanding();
}

function renderNav(){
  var nav = document.getElementById("bottomnav");
  var member = getMember();
  var tabs = member ? [
    ["#/home", "home", "🏠", "Home"],
    ["#/learn", "learn", "📖", "Learn"],
    ["#/meet", "meet", "🎥", "Meet"],
    ["#/more", "more", "⋯", "More"]
  ] : [
    ["#/", "home", "🏠", "Home"],
    ["#/join", "join", "📝", "Join"],
    ["#/signin", "signin", "🔑", "Sign in"]
  ];
  nav.innerHTML = tabs.map(function (t) {
    return '<a href="' + t[0] + '" data-tab="' + t[1] + '"><span class="ico">' + t[2] + "</span>" + t[3] + "</a>";
  }).join("");
}

function setActiveTab(tab){
  var map = { "": "home", home: "home", join: "join", signin: "signin",
              learn: "learn", meet: "meet", more: "more", profile: "more",
              resources: "more", events: "more", news: "more", directory: "more",
              discuss: "more", volunteer: "more", gallery: "more",
              about: "more", install: "more", contact: "home", guide: "learn", answers: "learn", references: "learn", "lesson-doc": "learn" };
  var want = map[tab] || "home";
  document.querySelectorAll(".bottomnav a").forEach(function (a) {
    a.classList.toggle("active", a.getAttribute("data-tab") === want);
  });
}
window.addEventListener("hashchange", route);

/* ---------------- public landing ---------------- */
function vLanding(){
  var news = COMMUNITY_NEWS.map(function (n) {
    return '<div class="card res-card"><h3>' + esc(n.name) + "</h3><p>" + esc(n.line) +
      '</p><div class="res-meta"><a href="' + esc(n.url) + '" target="_blank" rel="noopener">Visit site</a></div></div>';
  }).join("");
  view.innerHTML =
    '<div class="card center">' +
      '<img class="hero-logo" src="logo.png" alt="paragonpdx logo — Steel Bridge at sunrise over the Portland skyline">' +
      '<p class="tagline">cause, care, &amp; concern in action...</p>' +
    "</div>" +
    '<div class="card">' +
      "<h2>Welcome to paragonpdx</h2>" +
      "<p class=\"muted\">We are a compassion outreach community in Portland, Oregon — neighbors looking out for neighbors on the margins. " +
      "This hub is our front door: see what our friends around the city are up to, then come join us inside. " +
      "Members study servant leadership together in our Learning Center.</p>" +
      (getMember()
        ? '<a class="btn" href="#/home">Back to my home</a>'
        : '<a class="btn" href="#/join">Join Paragon PDX</a>' +
          '<p class="center muted" style="font-size:14px">Already a member? <a href="#/signin">Sign in</a></p>') +
    "</div>" +
    "<h2 class=\"section-title\">Community news</h2>" +
    '<p class="muted">A hand-picked bulletin of Portland neighbors doing good work. Picked by hand — not live news, just good people to know.</p>' +
    news +
    "<h2 class=\"section-title\">Photos</h2>" +
    '<div class="empty"><p style="font-size:40px;margin:0">📷</p><h3>Paragon PDX photos coming soon</h3>' +
    "<p>Our own pictures will live here — from the streets, the villages, and the community.</p></div>" +
    "<h2 class=\"section-title\">Contact</h2>" +
    '<div class="card"><p class="muted">Questions about paragonpdx, volunteering, or the Hub? ' +
    "Send us a note — Wayne or one of the organizers will read it.</p>" +
    '<a class="btn secondary" href="#/contact">Send a message</a></div>';
}

/* ---------------- signup ---------------- */
function vSignup(){
  if (getMember()) { location.hash = "#/home"; return; }
  view.innerHTML =
    '<div class="gate-card">' +
      '<img src="logo.png" alt="paragonpdx logo — Steel Bridge at sunrise over the Portland skyline">' +
      '<p class="tagline">cause, care, &amp; concern in action...</p>' +
      '<h1 class="page-title" style="margin-top:6px">Join Paragon PDX</h1>' +
      '<p class="muted">You only do this once on this phone. An organizer or Wayne — the Originator of paragonpdx — will approve your request, and then the whole Hub opens for you.</p>' +
      '<div class="field">' +
        '<label for="su-name">Your name *</label>' +
        '<input id="su-name" type="text" autocomplete="name" placeholder="First and last name">' +
      "</div>" +
      '<div class="field">' +
        '<label for="su-email">Email</label>' +
        '<input id="su-email" type="email" autocomplete="email" placeholder="you@example.com">' +
      "</div>" +
      '<div class="field">' +
        '<label for="su-phone">Phone number</label>' +
        '<input id="su-phone" type="tel" autocomplete="tel" placeholder="(503) 555-0100">' +
      "</div>" +
      '<p class="muted" style="font-size:13px;text-align:left">Give either an email or a phone number (or both) so we can reach you.</p>' +
      '<div class="field">' +
        '<label for="su-bio">A few words about you <span class="muted">(optional)</span></label>' +
        '<textarea class="essay" id="su-bio" style="min-height:90px" placeholder="Anything you want the community to know..."></textarea>' +
      "</div>" +
      '<div class="field">' +
        '<label for="su-photo">Profile photo <span class="muted">(optional)</span></label>' +
        '<input id="su-photo" type="file" accept="image/*">' +
        '<div id="su-preview" style="margin-top:8px"></div>' +
      "</div>" +
      '<div class="error" id="su-error"></div>' +
      '<button class="btn" id="su-btn">Request to join</button>' +
      '<a class="btn secondary small" href="#/">‹ Back</a>' +
    "</div>";

  document.getElementById("su-photo").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    var pv = document.getElementById("su-preview");
    if (!f) { pv.innerHTML = ""; return; }
    var r = new FileReader();
    r.onload = function () {
      pv.innerHTML = '<img src="' + r.result + '" alt="photo preview" style="width:96px;height:96px;object-fit:cover;border-radius:50%;border:2px solid var(--border)">';
    };
    r.readAsDataURL(f);
  });
  document.getElementById("su-btn").addEventListener("click", submitSignup);
}

function signupErrMsg(e){
  var m = e && e.message;
  if (m === "bad-name") return "Please type your name.";
  if (m === "need-contact") return "Please add either an email address or a phone number so we can reach you.";
  if (m === "already-requested") return "You already sent a request — it's still waiting for approval. Try signing in to check.";
  if (m === "offline") return "No connection right now. Connect to the internet once to join.";
  return "Something went wrong. Check your connection and try again.";
}

/* What a new member sees after asking to join: their request is in. */
function vSignupPending(name){
  view.innerHTML =
    '<div class="gate-card">' +
      '<img src="logo.png" alt="paragonpdx logo — Steel Bridge at sunrise over the Portland skyline">' +
      '<p class="tagline">cause, care, &amp; concern in action...</p>' +
      '<h1 class="page-title" style="margin-top:6px">Request sent</h1>' +
      '<p class="muted">Thanks' + (name ? ", " + esc(firstName(name)) : "") + ". " +
      "Your request to join paragonpdx is in. An organizer or Wayne — the Originator — " +
      "will approve it, and then you can sign in and the whole Hub opens for you.</p>" +
      '<a class="btn secondary" href="#/signin">Check my request</a>' +
      '<a class="btn secondary small" href="#/">‹ Back to the welcome page</a>' +
    "</div>";
}

function submitSignup(){
  var errEl = document.getElementById("su-error");
  var btn = document.getElementById("su-btn");
  function fail(m){ btn.disabled = false; btn.textContent = "Request to join"; errEl.textContent = m; }
  var name = document.getElementById("su-name").value.trim();
  var email = document.getElementById("su-email").value.trim();
  var phone = document.getElementById("su-phone").value.trim();
  var bio = document.getElementById("su-bio").value.trim();
  var file = (document.getElementById("su-photo").files[0]) || null;

  if (!name) return fail("Please type your name.");
  if (!email && !phone) return fail("Please add either an email address or a phone number so we can reach you.");
  if (email && !validEmail(email)) return fail("That email doesn't look right — check it and try again.");
  if (file && file.size > 5 * 1024 * 1024) return fail("That photo is bigger than 5 MB — pick a smaller one.");

  errEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Sending request...";
  window.ParagonDB.init().then(function (ok) {
    if (!ok) return fail("No connection right now. Connect to the internet once to join.");
    var details = { name: name, email: email, phone: phone, bio: bio };
    // Signup is a request: no session until an organizer or Wayne approves.
    function done(){
      vSignupPending(name);
      window.scrollTo(0, 0);
    }
    function afterSignup(out){
      var profile = out && out.profile;
      if (!profile) return done();
      if (!file) return done();
      // Upload the photo against the pending profile, then save its link
      // on both the profile row and the membership request.
      return window.ParagonDB.uploadAvatar(file, profile.id).then(function (url) {
        return window.ParagonDB.updateMemberAvatar(profile.id, url).then(done, done);
      }, function () { done(); }); // photo failed: the request still counts
    }
    return window.ParagonDB.signUpMember(details).then(afterSignup, function (e) { fail(signupErrMsg(e)); });
  });
}

/* ---------------- member sign in (returning) ---------------- */
function vSignin(){
  if (getMember()) { location.hash = "#/home"; return; }
  view.innerHTML =
    '<div class="gate-card">' +
      '<img src="logo.png" alt="paragonpdx logo — Steel Bridge at sunrise over the Portland skyline">' +
      '<h1 class="page-title" style="margin-top:6px">Member sign in</h1>' +
      '<p class="muted">Type your name and the email or phone number you signed up with. This puts your membership back on this phone.</p>' +
      '<div class="field">' +
        '<label for="si-name">Your name</label>' +
        '<input id="si-name" type="text" autocomplete="name" placeholder="First and last name">' +
      "</div>" +
      '<div class="field">' +
        '<label for="si-contact">Email or phone number</label>' +
        '<input id="si-contact" type="text" autocomplete="off" placeholder="The one you signed up with">' +
      "</div>" +
      '<div class="error" id="si-error"></div>' +
      '<button class="btn" id="si-btn">Sign in</button>' +
      '<p class="muted" style="font-size:14px">New here? <a href="#/join">Join Paragon PDX</a></p>' +
      '<a class="btn secondary small" href="#/">‹ Back</a>' +
    "</div>";

  document.getElementById("si-btn").addEventListener("click", function () {
    var errEl = document.getElementById("si-error");
    var btn = document.getElementById("si-btn");
    function fail(m){ btn.disabled = false; btn.textContent = "Sign in"; errEl.textContent = m; }
    var name = document.getElementById("si-name").value.trim();
    var contact = document.getElementById("si-contact").value.trim();
    if (!name) return fail("Please type your name.");
    if (!contact) return fail("Please type your email or phone number.");
    errEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "Signing in...";
    window.ParagonDB.init().then(function (ok) {
      if (!ok) return fail("No connection right now. Try again when you're online.");
      return window.ParagonDB.findMember(name, contact).then(function (m) {
        if (!m) return fail("We couldn't find that name with those details. Check the spelling, or join as a new member.");
        updateBadge();
        location.hash = "#/home";
      }, function (err) {
        var em = err && err.message;
        if (em === "pending") {
          view.innerHTML =
            '<div class="gate-card">' +
              '<img src="logo.png" alt="paragonpdx logo — Steel Bridge at sunrise over the Portland skyline">' +
              '<h1 class="page-title" style="margin-top:6px">Still waiting</h1>' +
              '<p class="muted">Your request to join paragonpdx is still waiting for approval. ' +
              "An organizer or Wayne — the Originator — will look at it soon. Come back and sign in again after it's approved.</p>" +
              '<a class="btn secondary small" href="#/">‹ Back to the welcome page</a>' +
            "</div>";
          window.scrollTo(0, 0);
          return;
        }
        if (em === "declined") {
          view.innerHTML =
            '<div class="gate-card">' +
              '<img src="logo.png" alt="paragonpdx logo — Steel Bridge at sunrise over the Portland skyline">' +
              '<h1 class="page-title" style="margin-top:6px">Not approved</h1>' +
              '<p class="muted">Your request to join paragonpdx wasn\'t approved this time. ' +
              "You're welcome to talk with Wayne or one of the organizers about it.</p>" +
              '<a class="btn secondary small" href="#/">‹ Back to the welcome page</a>' +
            "</div>";
          window.scrollTo(0, 0);
          return;
        }
        fail("Something went wrong. Check your connection and try again.");
      });
    });
  });
}

/* ---------------- members' home ---------------- */
function avatarImg(url, size){
  if (!url) return "";
  return '<img src="' + esc(url) + '" alt="" style="width:' + size + "px;height:" + size +
    'px;object-fit:cover;border-radius:50%;border:2px solid var(--border)">';
}

function vHome(){
  var m = getMember();
  var hd = highestDone();
  var nextDay = Math.min(hd + 1, TOTAL_DAYS);
  var nextTitle = DAYS[nextDay] ? DAYS[nextDay].title : "";
  var doneCount = Object.keys(getProgress().done).length;
  var joined = !!getProfile();
  view.innerHTML =
    '<div class="card">' +
      '<div style="display:flex;align-items:center;gap:12px">' + avatarImg(m.avatar_url, 64) +
        "<div><h2 style=\"margin:0\">Welcome, " + esc(firstName(m.name)) + "</h2>" +
        '<p class="muted" style="margin:2px 0 0;font-size:14px">paragonpdx member</p></div>' +
      "</div>" +
    "</div>" +
    '<div class="card" id="home-news"><h3>📣 Latest news</h3><div id="home-news-list"><p class="muted">Loading...</p></div>' +
      '<a class="btn secondary small" href="#/news">All news</a></div>' +
    '<div class="card">' +
      "<h3>Your learning journey</h3>" +
      '<div class="progress-bar"><i style="width:' + Math.round(doneCount / TOTAL_DAYS * 100) + '%"></i></div>' +
      "<p class=\"muted\">" + doneCount + " of " + TOTAL_DAYS + " lessons finished.</p>" +
      (hd < TOTAL_DAYS
        ? '<a class="btn secondary" href="#/learn/day/' + nextDay + '">Continue: Day ' + nextDay + " — " + esc(nextTitle) + "</a>"
        : '<p class="pass">You finished all 130 lessons. Well done!</p>') +
      '<a class="btn secondary small" href="#/learn/progress">See full progress</a>' +
      (joined ? "" : '<p class="muted" style="font-size:13px">The Learning Center asks for your group code the first time you open it.</p>') +
    "</div>" +
    '<a class="list-item" href="#/learn"><div class="grow"><div class="title">📖 Learning Center</div><div class="sub">130 servant-leadership lessons, in order</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/meet"><div class="grow"><div class="title">🎥 Meeting Room</div><div class="sub">One-tap video room for the community</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/resources"><div class="grow"><div class="title">🤝 Resources</div><div class="sub">Shelters, outreach &amp; tiny-home villages</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/events"><div class="grow"><div class="title">📅 Events</div><div class="sub">What\u2019s coming up</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/news"><div class="grow"><div class="title">📣 News</div><div class="sub">Updates from Wayne &amp; organizers</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/discuss"><div class="grow"><div class="title">💬 Discussion</div><div class="sub">Talk with the community</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/volunteer"><div class="grow"><div class="title">🙌 Volunteer</div><div class="sub">Ways to pitch in</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/gallery"><div class="grow"><div class="title">📷 Photo gallery</div><div class="sub">Our own pictures</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/directory"><div class="grow"><div class="title">🙂 Member directory</div><div class="sub">Meet the community</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/about"><div class="grow"><div class="title">💛 About paragonpdx</div><div class="sub">Our story</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/profile"><div class="grow"><div class="title">🙂 My Profile</div><div class="sub">Your name, bio &amp; photo</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/"><div class="grow"><div class="title">🚪 Front door</div><div class="sub">The public welcome page</div></div><span class="chev">›</span></a>';
  loadHomeNews();
}

/* Latest announcements on the home page (newest 3). Silent when
   offline — the rest of home still works. */
function loadHomeNews(){
  var el = document.getElementById("home-news-list");
  if (!el || !window.ParagonDB) return;
  window.ParagonDB.init().then(function (ok) {
    if (!ok) { el.innerHTML = '<p class="muted">Connect to the internet to see the latest news.</p>'; return; }
    return window.ParagonDB.listAnnouncements(3);
  }).then(function (rows) {
    if (!rows) return;
    el.innerHTML = rows.length ? rows.map(newsCard).join("") :
      '<p class="muted">No news yet — check back soon.</p>';
  }).catch(function () {
    el.innerHTML = '<p class="muted">Could not load the news right now.</p>';
  });
}

/* One announcement card, shared by the home preview and the news page. */
function newsCard(n){
  return '<div class="card res-card" style="margin:0 0 10px"><h3>' + esc(n.title) + "</h3>" +
    '<p class="muted" style="font-size:13px;margin:2px 0 6px">' + esc(fmtDate(n.created_at)) +
    (n.author_name ? " · " + esc(n.author_name) : "") +
    (n.author_role ? " (" + esc(n.author_role) + ")" : "") + "</p>" +
    "<p>" + esc(n.body) + "</p></div>";
}

/* Phone-friendly date/time. */
function fmtDate(s){
  if (!s) return "";
  try {
    return new Date(s).toLocaleString([], { weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit" });
  } catch (e) { return String(s); }
}

/* ---------------- my profile (view + edit) ---------------- */
function vProfile(){
  var m = getMember();
  view.innerHTML =
    '<a class="btn secondary small" href="#/home">‹ Home</a>' +
    "<h1 class=\"page-title\">My Profile</h1>" +
    '<div class="card center">' + avatarImg(m.avatar_url, 96) +
      "<h2 style=\"margin:8px 0 2px\">" + esc(m.name) + "</h2>" +
      (m.bio ? '<p class="muted">' + esc(m.bio) + "</p>" : '<p class="muted">No bio yet.</p>') +
      ((m.email || m.phone) ? '<p class="muted" style="font-size:14px">' +
        [m.email ? esc(m.email) : null, m.phone ? esc(m.phone) : null].filter(Boolean).join(" · ") + "</p>" : "") +
    "</div>" +
    '<div class="card">' +
      "<h3>Edit</h3>" +
      '<div class="field"><label for="pf-name">Your name *</label><input id="pf-name" type="text" value="' + esc(m.name) + '"></div>' +
      '<div class="field"><label for="pf-email">Email</label><input id="pf-email" type="email" value="' + esc(m.email || "") + '"></div>' +
      '<div class="field"><label for="pf-phone">Phone number</label><input id="pf-phone" type="tel" value="' + esc(m.phone || "") + '"></div>' +
      '<p class="muted" style="font-size:13px">Keep at least an email or a phone number so we can reach you.</p>' +
      '<div class="field"><label for="pf-bio">A few words about you <span class="muted">(optional)</span></label>' +
      '<textarea class="essay" id="pf-bio" style="min-height:90px">' + esc(m.bio || "") + "</textarea></div>" +
      '<div class="field"><label for="pf-photo">New profile photo <span class="muted">(optional)</span></label>' +
      '<input id="pf-photo" type="file" accept="image/*"></div>' +
      '<div class="field"><label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">' +
      '<input type="checkbox" id="pf-dir" ' + (m.directory_opt_in ? "checked" : "") + ' style="width:auto;margin-top:4px">' +
      '<span>List me in the member directory<br><span class="muted" style="font-weight:400">Other members can see your name, photo &amp; bio. Off by default.</span></span></label></div>' +
      '<div class="error" id="pf-error"></div>' +
      '<button class="btn" id="pf-save">Save changes</button>' +
    "</div>";

  document.getElementById("pf-dir").addEventListener("change", function (e) {
    var on = e.target.checked;
    window.ParagonDB.init().then(function (ok) {
      if (!ok) { e.target.checked = !on; toast("No connection right now — try again when you're online."); return; }
      return window.ParagonDB.setDirectoryOptIn(m.id, on);
    }).then(function (r) {
      if (r === undefined) return; // already handled the offline case
      // Persist the local copy so the checkbox stays right on this phone.
      try { localStorage.setItem("ppdx_member_v1", JSON.stringify(Object.assign({}, m, { directory_opt_in: on }))); } catch (x) {}
      toast(on ? "You're listed in the directory." : "Removed from the directory.");
    }).catch(function () { e.target.checked = !on; toast("Could not save — check your connection."); });
  });

  document.getElementById("pf-save").addEventListener("click", function () {
    var errEl = document.getElementById("pf-error");
    var btn = document.getElementById("pf-save");
    function fail(msg){ btn.disabled = false; btn.textContent = "Save changes"; errEl.textContent = msg; }
    var name = document.getElementById("pf-name").value.trim();
    var email = document.getElementById("pf-email").value.trim();
    var phone = document.getElementById("pf-phone").value.trim();
    var bio = document.getElementById("pf-bio").value.trim();
    var file = (document.getElementById("pf-photo").files[0]) || null;
    if (!name) return fail("Please type your name.");
    if (!email && !phone) return fail("Keep at least an email address or a phone number so we can reach you.");
    if (email && !validEmail(email)) return fail("That email doesn't look right — check it and try again.");
    if (file && file.size > 5 * 1024 * 1024) return fail("That photo is bigger than 5 MB — pick a smaller one.");
    errEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "Saving...";
    window.ParagonDB.init().then(function (ok) {
      if (!ok) return fail("No connection right now. Try again when you're online.");
      var patch = { name: name, email: email, phone: phone, bio: bio };
      function finish(){ updateBadge(); toast("Saved."); route(); }
      function savePatch(p){
        return window.ParagonDB.updateMember(p).then(finish, function (e) { fail(signupErrMsg(e)); });
      }
      if (file) {
        return window.ParagonDB.uploadAvatar(file).then(function (url) {
          patch.avatarUrl = url;
          return savePatch(patch);
        }, function () { return savePatch(patch); }); // photo failed: still save the rest
      }
      return savePatch(patch);
    });
  });
}

/* ---------------- learning-center entry (group code or join request) ---------------- */
/* Two ways in:
   a) You have a group code from your organizer -> instant (the code IS the approval).
   b) You don't have a code -> ask to join; an organizer or Wayne (the Originator)
      approves it in the dashboard, and then you're in. */
function vLearnGate(returnTo){
  // First: has this member already been approved (e.g. on another phone)?
  view.innerHTML =
    '<div class="gate-card"><p class="muted">Checking your Learning Center status...</p></div>';
  window.ParagonDB.init().then(function (ok) {
    if (!ok) { vLearnGateForm(returnTo, null); return; }
    return window.ParagonDB.checkCourseApproval().then(function (st) {
      vLearnGateForm(returnTo, st && st.state);
    }, function () { vLearnGateForm(returnTo, null); });
  });
}

function vLearnGateForm(returnTo, courseState){
  var m = getMember();
  if (courseState === "approved") { route(); return; } // session restored; carry on
  var statusNote = "";
  if (courseState === "pending") {
    statusNote =
      '<div class="card"><p class="muted"><b>Your request is in.</b> An organizer or Wayne — the Originator — ' +
      "will approve it soon. Once it's approved, come back here and you're in.</p></div>";
  } else if (courseState === "declined") {
    statusNote =
      '<div class="card"><p class="muted"><b>Not approved this time.</b> ' +
      "You're welcome to talk with Wayne or one of the organizers about joining the course.</p></div>";
  }
  view.innerHTML =
    '<div class="gate-card">' +
      '<img src="logo.png" alt="paragonpdx logo — Steel Bridge at sunrise over the Portland skyline">' +
      '<p class="tagline">cause, care, &amp; concern in action...</p>' +
      '<h1 class="page-title" style="margin-top:6px">Join the Learning Center</h1>' +
      '<p class="muted">Joining as <b>' + esc(m.name) + "</b>. You only do this once on this phone.</p>" +
      statusNote +
      '<div class="field">' +
        '<label for="learn-code">Group code <span class="muted">(if your organizer gave you one)</span></label>' +
        '<input id="learn-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="PARAGON-GROUP-START">' +
      "</div>" +
      '<div class="error" id="learn-error"></div>' +
      '<button class="btn" id="learn-enter">Start learning</button>' +
      '<button class="btn secondary" id="learn-request">I don\u2019t have a code \u2014 ask to join</button>' +
      '<p class="muted" style="font-size:13px">With a code you start right away. Without one, your request goes to an organizer or Wayne — the Originator — for approval.</p>' +
      '<a class="btn secondary small" href="#/home">‹ Back to Home</a>' +
    "</div>";

  function showError(msg){
    document.getElementById("learn-error").textContent = msg;
  }
  function submit(){
    var code = document.getElementById("learn-code").value;
    var btn = document.getElementById("learn-enter");
    if (!code.trim()) { showError("Please type your group code, or use the ask-to-join button below."); return; }
    showError("");
    btn.disabled = true;
    btn.textContent = "Joining...";
    function fail(msg){
      btn.disabled = false;
      btn.textContent = "Start learning";
      showError(msg);
    }
    window.ParagonDB.init().then(function (ok) {
      if (!ok) { fail("No connection right now. Connect to the internet once to join."); return; }
      return window.ParagonDB.joinCourse(code).then(function () {
        updateBadge();
        if (location.hash === returnTo) route();
        else location.hash = returnTo;
      }, function (err) {
        var em = err && err.message;
        if (em === "bad-code") fail("That code didn't match any group. Check it and try again.");
        else if (em === "offline") fail("No connection right now. Connect to the internet once to join.");
        else fail("Something went wrong. Check your connection and try again.");
      });
    });
  }
  function requestJoin(){
    var btn = document.getElementById("learn-request");
    btn.disabled = true;
    btn.textContent = "Sending request...";
    window.ParagonDB.init().then(function (ok) {
      if (!ok) {
        showError("No connection right now. Connect to the internet once to ask.");
        btn.disabled = false;
        btn.textContent = "I don\u2019t have a code \u2014 ask to join";
        return;
      }
      return window.ParagonDB.requestCourseJoin().then(function () {
        vLearnGateForm(returnTo, "pending");
        window.scrollTo(0, 0);
      }, function (err) {
        btn.disabled = false;
        btn.textContent = "I don\u2019t have a code \u2014 ask to join";
        var em = err && err.message;
        showError(em === "request-failed"
          ? "Couldn't send your request. Check your connection and try again."
          : "Something went wrong. Check your connection and try again.");
      });
    });
  }
  document.getElementById("learn-enter").addEventListener("click", submit);
  document.getElementById("learn-code").addEventListener("keydown", function (e) {
    if (e.key === "Enter") submit();
  });
  document.getElementById("learn-request").addEventListener("click", requestJoin);
}

/* ---------------- learning center ---------------- */
function dayPill(day){
  if (isDone(day)) return '<span class="pill done">Done</span>';
  if (day === highestDone() + 1) return '<span class="pill next">Next</span>';
  if (isOpen(day)) return '<span class="pill">Open</span>';
  return '<span class="pill lock">Locked</span>';
}

function vLearn(){
  var p = getProfile();
  var html = "<h1 class=\"page-title\">Learning Center</h1>" +
    '<div class="card"><p class="muted">Work through the 130 servant-leadership lessons in order, week by week. ' +
    "You can't skip ahead, but you can always go back and finish a lesson you missed. " +
    "Your progress saves on this phone.</p>" +
    '<div class="btn-row"><a class="btn secondary small" href="#/learn/progress">My progress</a>' +
    (p && (p.role === "organizer" || p.role === "originator")
      ? '<a class="btn secondary small" href="paragonpdx-dashboard.html">Organizer dashboard</a>'
      : "") +
    "</div></div>" +
    '<div class="card"><h3>Read the written guide</h3>' +
    '<p class="muted">The full <b>paragonpdx Servant Leadership Guide</b> — the same 130 lessons as this course, in book form.</p>' +
    '<a class="btn secondary small" href="#/guide">Open the written guide</a></div>';
  for (var w = 1; w <= TOTAL_WEEKS; w++) {
    var wk = WEEKS[w];
    var firstDay = wk.days[0];
    var doneCount = wk.days.filter(isDone).length;
    var open = isOpen(firstDay);
    html += '<a class="list-item' + (open ? "" : " locked") + '" href="#/learn/week/' + w + '">' +
      '<div class="grow"><div class="title">Week ' + w + ": " + esc(cleanWeekTitle(wk.title)) + "</div>" +
      '<div class="sub">' + doneCount + "/5 days done</div></div>" +
      (open ? "" : '<span class="pill lock">Locked</span>') +
      '<span class="chev">›</span></a>';
  }
  view.innerHTML = html;
}

function vLearnWeek(w){
  var wk = WEEKS[w];
  if (!wk) return vLearn();
  var wt = WT[String(w)] || {};
  var html = '<a class="btn secondary small" href="#/learn">‹ All weeks</a>' +
    "<h1 class=\"page-title\">Week " + w + "</h1>" +
    '<p class="muted">' + esc(cleanWeekTitle(wk.title)) + "</p>" +
    '<a class="btn secondary small" href="#/guide">Read this week in the written guide</a>' +
    (wt.intro ? '<div class="card"><p>' + esc(wt.intro) + "</p></div>" : "");
  wk.days.forEach(function (d) {
    var e = DAYS[d];
    var open = isOpen(d);
    var res = getProgress().done[d];
    var sub = e.weekday + (res ? " · scored " + res.score + "/5" + (res.essay === false ? " · essay: fail" : res.essay === true ? " · essay: pass" : "") : "");
    if (!open && d === highestDone() + 1) sub = "Opens at 3:45 AM";
    html += (open ? '<a class="list-item" href="#/learn/day/' + d + '">' : '<div class="list-item locked">') +
      '<div class="grow"><div class="title">Day ' + d + " — " + esc(e.title) + "</div>" +
      '<div class="sub">' + esc(sub) + "</div></div>" +
      dayPill(d) +
      (open ? '<span class="chev">›</span>' : "") +
      (open ? "</a>" : "</div>");
  });
  if (wt.summary) {
    html += '<div class="card"><h3>Looking back</h3><p>' + esc(wt.summary) + "</p></div>";
  }
  view.innerHTML = html;
}

/* ----- lesson / quiz ----- */
var quizState = null;

function vLesson(day){
  var e = DAYS[day];
  if (!e || !isOpen(day)) { location.hash = "#/learn"; return; }
  var done = getProgress().done[day];
  quizState = { day: day, picked: [null, null, null, null, null], essay: done && done.essayText ? done.essayText : "", turnedIn: !!done, qi: 0, revealed: false };

  var html = '<a class="btn secondary small" href="#/learn/week/' + e.week + '">‹ Week ' + e.week + "</a>" +
    "<h1 class=\"page-title\">Day " + day + "</h1>" +
    '<p class="muted">' + esc(lessonLabel(day)) + "<br>" + esc(e.title) + "</p>" +
    '<div class="card"><p>Read the lesson first, then answer below.</p>' +
    '<a class="btn secondary small" href="#/lesson-doc/' + day + '">Read the lesson</a></div>' +
    '<div id="quiz"></div>';
  view.innerHTML = html;
  renderQuiz();
}

function renderQuiz(){
  var st = quizState, e = DAYS[st.day];
  if (st.turnedIn) { renderQuizReview(); return; }
  var qi = st.qi || 0, n = e.questions.length;
  var html = '<div class="card"><p class="q-text">How this works</p>' +
    '<p>Read the lesson first. Then tap the question to see its answers, ' +
    'tap the answer you want, then tap <b>Next question</b> — the answers drop away and the next question appears. ' +
    'Tap that question to see its answers. Answer all ' + n + ' questions to turn in.</p></div>';
  if (qi < n) {
    var q = e.questions[qi];
    var picked = st.picked[qi];
    var revealed = !!st.revealed;
    html += '<p class="muted center">Question ' + (qi + 1) + ' of ' + n + '</p>' +
      '<div class="card q-block"><p class="q-text q-tap" id="qtext">' + (qi + 1) + '. ' + esc(q.q) + '</p>';
    if (!revealed) {
      html += '<button class="btn secondary" id="qshow">Show answers</button>';
    } else {
      q.choices.forEach(function (c, ci) {
        var cls = "choice" + (picked === ci ? " selected" : "");
        html += '<button class="' + cls + '" data-c="' + ci + '"><span class="letter">' + 'ABCD'[ci] + '</span>' + esc(c) + '</button>';
      });
    }
    html += '</div>';
    html += '<div class="btn-row">';
    if (qi > 0) html += '<button class="btn secondary" id="qback">\u2039 Back</button>';
    if (picked !== null) {
      var nl = qi + 1 < n ? 'Next question \u203a' : (e.essay ? 'Write essay \u203a' : 'Review & turn in \u203a');
      html += '<button class="btn" id="qnext">' + nl + '</button>';
    }
    html += '</div>';
  } else if (e.essay) {
    html += '<div class="card"><p class="q-text">Essay &mdash; ' + esc(e.essay) + '</p>' +
      '<textarea class="essay" id="essay-box" placeholder="Write your essay here...">' + esc(st.essay) + '</textarea>' +
      '<p class="muted" style="font-size:13px">Friday grading is pass/fail: turn in your essay with writing in it to pass. Blank counts as fail.</p></div>';
  } else {
    html += '<div class="card"><p class="q-text">All ' + n + ' answered.</p><p>Turn in below when you are ready.</p></div>';
  }
  html += '<div id="quiz-action"></div><div id="quiz-result"></div>';
  document.getElementById("quiz").innerHTML = html;

  var box = document.getElementById("quiz");
  /* The question itself is the show/hide control: tap it to see the
     answers, tap it again to drop them back away. */
  var qtext = document.getElementById("qtext");
  if (qtext) qtext.addEventListener("click", function () { st.revealed = !st.revealed; renderQuiz(); });
  var showBtn = document.getElementById("qshow");
  if (showBtn) showBtn.addEventListener("click", function () { st.revealed = true; renderQuiz(); });
  box.querySelectorAll(".choice").forEach(function (btn) {
    btn.addEventListener("click", function () {
      st.picked[qi] = parseInt(btn.getAttribute("data-c"), 10);
      st.revealed = true;
      renderQuiz();
    });
  });
  var back = document.getElementById("qback");
  if (back) back.addEventListener("click", function () { st.qi = qi - 1; st.revealed = true; renderQuiz(); window.scrollTo(0, 0); });
  var nx = document.getElementById("qnext");
  if (nx) nx.addEventListener("click", function () { st.qi = qi + 1; st.revealed = false; renderQuiz(); window.scrollTo(0, 0); });
  var eb = document.getElementById("essay-box");
  if (eb) eb.addEventListener("input", function () { quizState.essay = eb.value; });

  if (qi >= n) renderQuizAction();
}

function renderQuizReview(){
  var st = quizState, e = DAYS[st.day];
  var html = "";
  e.questions.forEach(function (q, qi) {
    html += '<div class="card q-block"><p class="q-text">' + (qi + 1) + ". " + esc(q.q) + "</p>";
    q.choices.forEach(function (c, ci) {
      var cls = "choice";
      if (ci === q.answer) cls += " correct";
      else if (st.picked[qi] === ci) cls += " wrong";
      html += '<button class="' + cls + '" disabled>' +
        '<span class="letter">' + "ABCD"[ci] + "</span>" + esc(c) + "</button>";
    });
    html += "</div>";
  });
  if (e.essay) {
    html += '<div class="card"><p class="q-text">Essay &mdash; ' + esc(e.essay) + "</p>" +
      '<textarea class="essay" disabled>' + esc(st.essay) + "</textarea></div>";
  }
  html += '<div id="quiz-action"></div><div id="quiz-result"></div>';
  document.getElementById("quiz").innerHTML = html;
  renderQuizAction();
  var done = getProgress().done[st.day];
  if (done) renderResult(done, true);
}

function allAnswered(){
  return quizState.picked.every(function (p) { return p !== null; });
}

function renderQuizAction(){
  var el = document.getElementById("quiz-action");
  if (quizState.turnedIn) {
    var prev = quizState.day > 1 ? '<a class="btn secondary" href="#/learn/day/' + (quizState.day - 1) + '">‹ Previous lesson</a>' : "";
    var next = quizState.day < TOTAL_DAYS
      ? '<a class="btn" href="#/learn/day/' + (quizState.day + 1) + '">Next lesson ›</a>'
      : '<a class="btn secondary" href="#/learn/progress">See my progress</a>';
    el.innerHTML = '<div class="btn-row">' + prev + next + "</div>";
    return;
  }
  var ready = allAnswered();
  el.innerHTML = '<button class="btn" id="turnin"' + (ready ? "" : " disabled") + ">Turn In</button>" +
    (ready ? "" : '<p class="muted center">Answer all 5 questions to turn in.</p>');
  var btn = document.getElementById("turnin");
  if (btn) btn.addEventListener("click", turnIn);
}

function turnIn(){
  var st = quizState;
  var eb = document.getElementById("essay-box");
  if (eb) st.essay = eb.value;
  var g = gradeLesson(st.day, st.picked, st.essay);
  var rec = { score: g.score, essay: g.essay, essayText: DAYS[st.day].essay ? st.essay : "", at: new Date().toISOString() };
  var p = getProgress();
  p.done[st.day] = rec;
  saveProgress(p);
  /* Shared copy for organizers — never blocks the learner, never throws. */
  if (window.ParagonDB) {
    try { window.ParagonDB.saveProgress(st.day, g.score, g.essay === true); }
    catch (e) {}
  }
  st.turnedIn = true;
  renderQuiz();
  renderResult(rec, false);
  window.scrollTo(0, 0);
}

/* Pure grading logic (kept separate so it stays identical everywhere). */
function gradeLesson(day, picked, essayText){
  var e = DAYS[day], score = 0;
  e.questions.forEach(function (q, qi) { if (picked[qi] === q.answer) score++; });
  var essayPass = e.essay ? String(essayText || "").trim().length > 0 : null;
  return { score: score, essay: essayPass };
}

function resultText(rec, day){
  var a = getProfile();
  var e = DAYS[day];
  var lines = [
    "Paragon PDX Learning Center — lesson result",
    "Name: " + (a ? a.name : ""),
    "Lesson: " + lessonLabel(day),
    "Title: " + e.title,
    "Multiple choice: " + rec.score + "/5"
  ];
  if (rec.essay !== null && rec.essay !== undefined) lines.push("Essay: " + (rec.essay ? "PASS" : "FAIL"));
  lines.push("Turned in: " + new Date(rec.at).toLocaleString());
  return lines.join("\n");
}

function renderResult(rec, already){
  var st = quizState, day = st.day, e = DAYS[day];
  var el = document.getElementById("quiz-result");
  var pct = Math.round(rec.score / 5 * 100);
  var html = '<div class="result-card"><h3>' + (already ? "Your result" : "Graded!") + "</h3>" +
    '<div class="score">' + rec.score + "/5</div>" +
    '<p class="muted">' + pct + "% on multiple choice · " + esc(lessonLabel(day)) + "</p>";
  if (rec.essay !== null && rec.essay !== undefined) {
    html += '<p>Essay: <span class="' + (rec.essay ? "pass" : "fail") + '">' + (rec.essay ? "PASS" : "FAIL") + "</span></p>";
  }
  html += '<button class="btn small" id="share-btn">Share with your organizer</button>' +
    '<p class="muted" style="font-size:13px">Tap to send this result to your organizer — they collect everyone\u2019s grades from these shared cards.</p></div>';
  el.innerHTML = html;
  document.getElementById("share-btn").addEventListener("click", function () {
    var text = resultText(rec, day);
    if (navigator.share) {
      navigator.share({ title: "Paragon PDX lesson result", text: text }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("Result copied — paste it in a message to your organizer.");
      }, function () { toast("Copy didn't work on this phone — take a screenshot instead."); });
    } else {
      toast("Sharing isn't available here — take a screenshot of your result.");
    }
  });
  renderQuizAction();
}

/* ----- progress ----- */
function vProgress(){
  var p = getProgress();
  var doneDays = Object.keys(p.done).map(Number).sort(function (a, b) { return a - b; });
  var totalScore = 0, essaysPass = 0, essaysTotal = 0;
  doneDays.forEach(function (d) {
    var r = p.done[d];
    totalScore += r.score;
    if (r.essay !== null && r.essay !== undefined) { essaysTotal++; if (r.essay) essaysPass++; }
  });
  var next = Math.min(highestDone() + 1, TOTAL_DAYS);
  var html = '<a class="btn secondary small" href="#/learn">‹ Learning Center</a>' +
    "<h1 class=\"page-title\">My progress</h1>" +
    '<div class="card">' +
      '<div class="progress-bar"><i style="width:' + Math.round(doneDays.length / TOTAL_DAYS * 100) + '%"></i></div>' +
      '<div class="kv"><span>Lessons finished</span><b>' + doneDays.length + " / " + TOTAL_DAYS + "</b></div>" +
      '<div class="kv"><span>Total quiz points</span><b>' + totalScore + " / " + (doneDays.length * 5) + "</b></div>" +
      (doneDays.length ? '<div class="kv"><span>Average score</span><b>' + (totalScore / doneDays.length).toFixed(1) + "/5</b></div>" : "") +
      (essaysTotal ? '<div class="kv"><span>Friday essays passed</span><b>' + essaysPass + " / " + essaysTotal + "</b></div>" : "") +
    "</div>";
  if (next <= TOTAL_DAYS && DAYS[next]) {
    html += '<a class="btn" href="#/learn/day/' + next + '">Next up: Day ' + next + " — " + esc(DAYS[next].title) + "</a>";
  } else {
    html += '<div class="card center"><p class="pass">All 130 lessons finished. Well done!</p></div>';
  }
  if (doneDays.length) {
    html += "<h2 class=\"section-title\">Finished lessons</h2>";
    var groups = {};
    doneDays.forEach(function (d) {
      var w = DAYS[d].week;
      (groups[w] = groups[w] || []).push(d);
    });
    Object.keys(groups).sort(function (a, b) { return a - b; }).forEach(function (w) {
      html += '<div class="card"><h3>Week ' + w + " — " + esc(cleanWeekTitle(WEEKS[w].title)) + "</h3>";
      groups[w].forEach(function (d) {
        var r = p.done[d];
        html += '<a class="list-item" href="#/learn/day/' + d + '"><div class="grow"><div class="title">Day ' + d + " — " + esc(DAYS[d].title) +
          '</div><div class="sub">' + r.score + "/5" + (r.essay === false ? " · essay fail" : r.essay === true ? " · essay pass" : "") + "</div></div>" +
          '<span class="pill done">Done</span><span class="chev">›</span></a>';
      });
      html += "</div>";
    });
  }
  view.innerHTML = html;
}

/* ---------------- meet ---------------- */
var JITSI_ROOM = "https://meet.jit.si/ParagonPDX";
function vMeet(){
  view.innerHTML = "<h1 class=\"page-title\">Meeting Room</h1>" +
    '<div class="card center">' +
      '<p class="tagline">One tap and you\u2019re in the room.</p>' +
      '<a class="btn" href="' + JITSI_ROOM + '" target="_blank" rel="noopener">Join Video Meeting</a>' +
    "</div>" +
    '<div class="card"><h3>How it works</h3><ol class="steps">' +
      "<li>Tap <b>Join Video Meeting</b> at meeting time.</li>" +
      "<li>Allow your camera and microphone when your phone asks.</li>" +
      "<li>Everyone who taps the same button lands in the same room — no account, no download.</li>" +
      "<li>Type your name when you join so folks know it's you.</li>" +
    "</ol></div>";
}

/* ---------------- resources (verified) ---------------- */
var RESOURCES = [
  { name: "Blanchet House", desc: "Free hot meals Mon–Sat in Old Town, plus clothing and transitional housing for men in recovery.",
    url: "https://blanchethouse.org/", phone: "(503) 241-4340" },
  { name: "Portland Rescue Mission", desc: "Men's shelter at Burnside with daily meals, plus recovery and women/children's programs.",
    url: "https://www.portlandrescuemission.org/", phone: "(503) 906-7690" },
  { name: "Sisters of the Road", desc: "Nonprofit café in Old Town serving nourishing meals with dignity since 1979.",
    url: "https://sistersoftheroad.org/", phone: "(503) 222-5694" },
  { name: "CityTeam Portland", desc: "Men's overnight shelter, hot meals, groceries, and recovery programs. 526 SE Grand Ave.",
    url: "https://www.cityteam.org/portland/", phone: "(503) 231-9334" },
  { name: "Dignity Village", desc: "Self-governed tiny-home village sheltering about 60 people a night near PDX airport.",
    url: "http://dignityvillage.org/", phone: "(503) 281-1604" },
  { name: "Kenton Women's Village", desc: "Tiny-home village for women run by Catholic Charities of Oregon, with case management and housing support.",
    url: "https://www.catholiccharitiesoregon.org/services/homeless-services/kenton-womens-village/", phone: "" }
];
function vResources(){
  var html = "<h1 class=\"page-title\">Resources</h1>" +
    '<p class="muted">Portland shelters, outreach, and tiny-home villages. Tap a name to visit their site, or tap the phone number to call.</p>';
  RESOURCES.forEach(function (r) {
    html += '<div class="card res-card"><h3>' + esc(r.name) + "</h3><p>" + esc(r.desc) + '</p><div class="res-meta">' +
      '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">Visit site</a>' +
      (r.phone ? '<a href="tel:+1' + r.phone.replace(/\D/g, "") + '">' + esc(r.phone) + "</a>" : "") +
      "</div></div>";
  });
  html += '<div class="card"><p class="muted">More resources are being added. Know one we should list? Tell your organizer.</p></div>';
  view.innerHTML = html;
}

/* ---------------- more / events / about / install ---------------- */
function vMore(){
  var m = getMember();
  var a = getProfile();
  var html = "<h1 class=\"page-title\">More</h1>" +
    '<a class="list-item" href="#/profile"><div class="grow"><div class="title">My Profile</div><div class="sub">Your name, bio &amp; photo</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/resources"><div class="grow"><div class="title">Resources</div><div class="sub">Shelters, outreach &amp; tiny-home villages</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/events"><div class="grow"><div class="title">Events</div><div class="sub">What\u2019s coming up</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/news"><div class="grow"><div class="title">News</div><div class="sub">Updates from Wayne &amp; organizers</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/discuss"><div class="grow"><div class="title">Discussion</div><div class="sub">Talk with the community</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/volunteer"><div class="grow"><div class="title">Volunteer</div><div class="sub">Ways to pitch in</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/gallery"><div class="grow"><div class="title">Photo gallery</div><div class="sub">Our own pictures</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/directory"><div class="grow"><div class="title">Member directory</div><div class="sub">Meet the community</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/about"><div class="grow"><div class="title">About paragonpdx</div><div class="sub">Our story</div></div><span class="chev">›</span></a>' +
    '<a class="list-item" href="#/install"><div class="grow"><div class="title">Install the app</div><div class="sub">Add to your home screen</div></div><span class="chev">›</span></a>';
  html += '<div class="card"><div style="display:flex;align-items:center;gap:10px">' + avatarImg(m.avatar_url, 48) +
    "<div><p class=\"muted\" style=\"margin:0\">Signed in as <b>" + esc(m.name) + "</b></p>" +
    '<p class="muted" style="margin:2px 0 0;font-size:13px">Learning Center: ' +
    (a ? esc(roleLabel(a.role)) + (a.group_name ? " · " + esc(a.group_name) : "") : "not joined yet") + "</p></div></div>" +
    '<button class="btn secondary small" id="signout" style="margin-top:12px">Sign out of this phone</button></div>';
  view.innerHTML = html;
  document.getElementById("signout").addEventListener("click", function () {
    if (window.ParagonDB) { try { window.ParagonDB.signOutMember(); } catch (e) {} }
    updateBadge();
    location.hash = "#/";
  });
}

function vEvents(){
  view.innerHTML = "<h1 class=\"page-title\">Events</h1>" +
    '<div id="ev-list"><div class="card"><p class="muted">Loading events...</p></div></div>';
  window.ParagonDB.init().then(function (ok) {
    if (!ok) throw new Error("offline");
    return window.ParagonDB.listEvents();
  }).then(function (events) {
    var m = getMember();
    var el = document.getElementById("ev-list");
    if (!events.length) {
      el.innerHTML = '<div class="empty"><p style="font-size:40px;margin:0">📅</p><h3>No events scheduled yet</h3>' +
        "<p>When gatherings are planned, they'll show up here. Check back soon.</p></div>";
      return;
    }
    el.innerHTML = events.map(function (e) { return eventCard(e); }).join("");
    events.forEach(function (e) { loadEventRsvps(e.id, m && m.id); });
  }).catch(function () {
    document.getElementById("ev-list").innerHTML =
      '<div class="card"><p class="muted">Connect to the internet to see events.</p></div>';
  });
}

function eventCard(e){
  var past = e.starts_at && new Date(e.starts_at).getTime() < Date.now();
  return '<div class="card" id="ev-' + esc(e.id) + '">' +
    "<h3>" + esc(e.title) + "</h3>" +
    (e.starts_at ? '<p class="muted" style="font-size:14px;margin:2px 0">🕒 ' + esc(fmtDate(e.starts_at)) + (past ? " · happened" : "") + "</p>" : "") +
    (e.location ? '<p class="muted" style="font-size:14px;margin:2px 0">📍 ' + esc(e.location) + "</p>" : "") +
    (e.description ? "<p>" + esc(e.description) + "</p>" : "") +
    '<div id="ev-rsvp-' + esc(e.id) + '"><p class="muted">Loading...</p></div>' +
    "</div>";
}

function loadEventRsvps(eventId, myProfileId){
  var el = document.getElementById("ev-rsvp-" + eventId);
  if (!el) return;
  window.ParagonDB.getEventRsvps(eventId).then(function (rows) {
    var mine = rows.some(function (r) { return r.profile_id && r.profile_id === myProfileId; });
    var names = rows.map(function (r) { return esc(r.name || "A member"); }).join(", ");
    el.innerHTML =
      '<p class="muted" style="font-size:14px">👥 <b>' + rows.length + "</b> coming" +
      (names ? ": " + names : "") + "</p>" +
      (mine
        ? '<button class="btn secondary small" data-rsvp="off" data-id="' + esc(eventId) + '">Can\u2019t make it</button>'
        : '<button class="btn small" data-rsvp="on" data-id="' + esc(eventId) + '">I\u2019m coming</button>');
    el.querySelectorAll("[data-rsvp]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = getMember();
        b.disabled = true;
        var p = b.getAttribute("data-rsvp") === "on"
          ? window.ParagonDB.rsvpEvent(eventId, m.id, m.name)
          : window.ParagonDB.cancelRsvp(eventId, m.id);
        p.then(function () { loadEventRsvps(eventId, m.id); toast("Saved."); },
             function () { b.disabled = false; toast("Could not save — check your connection."); });
      });
    });
  }).catch(function () {
    el.innerHTML = '<p class="muted">Could not load RSVPs.</p>';
  });
}

/* ---------------- news (announcements) ---------------- */
function vNews(){
  view.innerHTML = "<h1 class=\"page-title\">News</h1>" +
    '<div id="news-list"><div class="card"><p class="muted">Loading news...</p></div></div>';
  window.ParagonDB.init().then(function (ok) {
    if (!ok) throw new Error("offline");
    return window.ParagonDB.listAnnouncements();
  }).then(function (rows) {
    document.getElementById("news-list").innerHTML = rows.length ? rows.map(newsCard).join("") :
      '<div class="empty"><p style="font-size:40px;margin:0">📣</p><h3>No news yet</h3>' +
      "<p>Updates from Wayne and the organizers will show up here.</p></div>";
  }).catch(function () {
    document.getElementById("news-list").innerHTML =
      '<div class="card"><p class="muted">Connect to the internet to see the news.</p></div>';
  });
}

/* ---------------- member directory (opt-in only) ---------------- */
function vDirectory(){
  view.innerHTML = "<h1 class=\"page-title\">Member directory</h1>" +
    '<p class="muted">Only members who chose to be listed show up here. You can join them from My Profile.</p>' +
    '<div id="dir-list"><div class="card"><p class="muted">Loading...</p></div></div>';
  window.ParagonDB.init().then(function (ok) {
    if (!ok) throw new Error("offline");
    return window.ParagonDB.getDirectoryMembers();
  }).then(function (rows) {
    document.getElementById("dir-list").innerHTML = rows.length ? rows.map(function (p) {
      return '<div class="card"><div style="display:flex;align-items:center;gap:12px">' + avatarImg(p.avatar_url, 56) +
        '<div><h3 style="margin:0">' + esc(p.name) + '</h3><p class="muted" style="font-size:13px;margin:2px 0">' +
        esc(roleLabel(p.role)) + "</p></div></div>" +
        (p.bio ? "<p>" + esc(p.bio) + "</p>" : "") + "</div>";
    }).join("") :
      '<div class="empty"><p style="font-size:40px;margin:0">🙂</p><h3>Nobody listed yet</h3>' +
      "<p>Be the first — turn on \"List me in the member directory\" in My Profile.</p></div>";
  }).catch(function () {
    document.getElementById("dir-list").innerHTML =
      '<div class="card"><p class="muted">Connect to the internet to see the directory.</p></div>';
  });
}

/* ---------------- discussion board ---------------- */
function vDiscuss(){
  var m = getMember();
  view.innerHTML = "<h1 class=\"page-title\">Discussion</h1>" +
    '<div class="card"><h3>Start a topic</h3>' +
      '<div class="field"><label for="dt-title">Title *</label><input id="dt-title" type="text" placeholder="What\u2019s on your mind?"></div>' +
      '<div class="field"><label for="dt-body">Details <span class="muted">(optional)</span></label>' +
      '<textarea class="essay" id="dt-body" style="min-height:80px" placeholder="Say more..."></textarea></div>' +
      '<div class="error" id="dt-error"></div>' +
      '<button class="btn" id="dt-btn">Post topic</button></div>' +
    '<div id="dt-list"><div class="card"><p class="muted">Loading topics...</p></div></div>';
  document.getElementById("dt-btn").addEventListener("click", function () {
    var title = document.getElementById("dt-title").value.trim();
    var body = document.getElementById("dt-body").value.trim();
    var errEl = document.getElementById("dt-error");
    if (!title) { errEl.textContent = "Give your topic a title."; return; }
    errEl.textContent = "";
    window.ParagonDB.init().then(function (ok) {
      if (!ok) throw new Error("offline");
      return window.ParagonDB.createDiscussionTopic(title, body, m.id, m.name);
    }).then(function () { toast("Posted."); route(); },
      function () { errEl.textContent = "Could not post — check your connection."; });
  });
  window.ParagonDB.init().then(function (ok) {
    if (!ok) throw new Error("offline");
    return window.ParagonDB.listDiscussionTopics();
  }).then(function (rows) {
    document.getElementById("dt-list").innerHTML = rows.length ? rows.map(function (t) {
      return '<a class="list-item" href="#/discuss/' + esc(t.id) + '"><div class="grow">' +
        '<div class="title">' + esc(t.title) + '</div><div class="sub">' + esc(t.author_name || "A member") +
        " · " + esc(fmtDate(t.created_at)) + '</div></div><span class="chev">›</span></a>';
    }).join("") :
      '<div class="empty"><p style="font-size:40px;margin:0">💬</p><h3>No topics yet</h3>' +
      "<p>Start the first conversation above.</p></div>";
  }).catch(function () {
    document.getElementById("dt-list").innerHTML =
      '<div class="card"><p class="muted">Connect to the internet to see the discussion.</p></div>';
  });
}

function vTopic(id){
  var m = getMember();
  view.innerHTML = '<a class="btn secondary small" href="#/discuss">‹ Discussion</a>' +
    '<div id="tp-wrap"><div class="card"><p class="muted">Loading...</p></div></div>';
  window.ParagonDB.init().then(function (ok) {
    if (!ok) throw new Error("offline");
    return window.ParagonDB.getDiscussionTopic(id).then(function (t) {
      if (!t) throw new Error("no-topic");
      return window.ParagonDB.listDiscussionReplies(id).then(function (replies) {
        return { topic: t, replies: replies };
      });
    });
  }).then(function (d) {
    var html = '<div class="card"><h2 class="page-title" style="margin:0 0 4px">' + esc(d.topic.title) + "</h2>" +
      '<p class="muted" style="font-size:13px">' + esc(d.topic.author_name || "A member") +
      " · " + esc(fmtDate(d.topic.created_at)) + "</p>" +
      (d.topic.body ? "<p>" + esc(d.topic.body) + "</p>" : "") + "</div>";
    html += d.replies.length ? d.replies.map(function (r) {
      return '<div class="card res-card"><p><b>' + esc(r.author_name || "A member") + "</b> " +
        '<span class="muted" style="font-size:13px">' + esc(fmtDate(r.created_at)) + "</span></p>" +
        "<p>" + esc(r.body) + "</p></div>";
    }).join("") : '<div class="card"><p class="muted">No replies yet — say something kind below.</p></div>';
    html += '<div class="card"><h3>Reply</h3>' +
      '<div class="field"><textarea class="essay" id="rp-body" style="min-height:80px" placeholder="Write a reply..."></textarea></div>' +
      '<div class="error" id="rp-error"></div>' +
      '<button class="btn" id="rp-btn">Post reply</button></div>';
    document.getElementById("tp-wrap").innerHTML = html;
    document.getElementById("rp-btn").addEventListener("click", function () {
      var body = document.getElementById("rp-body").value.trim();
      var errEl = document.getElementById("rp-error");
      if (!body) { errEl.textContent = "Write something first."; return; }
      errEl.textContent = "";
      window.ParagonDB.postDiscussionReply(id, body, m.id, m.name).then(
        function () { toast("Posted."); route(); },
        function () { errEl.textContent = "Could not post — check your connection."; });
    });
  }).catch(function () {
    document.getElementById("tp-wrap").innerHTML =
      '<div class="card"><p class="muted">Could not load this topic. Check your connection.</p></div>';
  });
}

/* ---------------- volunteer opportunities ---------------- */
function vVolunteer(){
  view.innerHTML = "<h1 class=\"page-title\">Volunteer</h1>" +
    '<p class="muted">Ways to pitch in around paragonpdx. Tap "I\u2019ll help" and the organizers will see your name.</p>' +
    '<div id="vo-list"><div class="card"><p class="muted">Loading...</p></div></div>';
  window.ParagonDB.init().then(function (ok) {
    if (!ok) throw new Error("offline");
    return window.ParagonDB.listVolunteerNeeds();
  }).then(function (needs) {
    var m = getMember();
    var el = document.getElementById("vo-list");
    if (!needs.length) {
      el.innerHTML = '<div class="empty"><p style="font-size:40px;margin:0">🙌</p><h3>No openings right now</h3>' +
        "<p>New ways to help will show up here. Check back soon.</p></div>";
      return;
    }
    el.innerHTML = needs.map(function (n) { return volCard(n); }).join("");
    needs.forEach(function (n) { loadVolunteerSignups(n.id, n.spots, m && m.id); });
  }).catch(function () {
    document.getElementById("vo-list").innerHTML =
      '<div class="card"><p class="muted">Connect to the internet to see volunteer openings.</p></div>';
  });
}

function volCard(n){
  return '<div class="card" id="vo-' + esc(n.id) + '">' +
    "<h3>" + esc(n.title) + "</h3>" +
    (n.when_text ? '<p class="muted" style="font-size:14px;margin:2px 0">🕒 ' + esc(n.when_text) + "</p>" : "") +
    (n.description ? "<p>" + esc(n.description) + "</p>" : "") +
    '<div id="vo-sign-' + esc(n.id) + '"><p class="muted">Loading...</p></div>' +
    "</div>";
}

function loadVolunteerSignups(needId, spots, myProfileId){
  var el = document.getElementById("vo-sign-" + needId);
  if (!el) return;
  window.ParagonDB.getVolunteerSignups(needId).then(function (rows) {
    var mine = rows.some(function (r) { return r.profile_id && r.profile_id === myProfileId; });
    var full = spots > 0 && rows.length >= spots;
    var spotsLine = spots > 0
      ? rows.length + " of " + spots + " spots filled"
      : rows.length + " signed up";
    el.innerHTML = '<p class="muted" style="font-size:14px">🙌 <b>' + esc(spotsLine) + "</b></p>" +
      (mine
        ? '<button class="btn secondary small" data-vol="off" data-id="' + esc(needId) + '">Take my name off</button>'
        : (full
          ? '<p class="muted" style="font-size:14px">All spots are filled — thank you!</p>'
          : '<button class="btn small" data-vol="on" data-id="' + esc(needId) + '">I\u2019ll help</button>'));
    el.querySelectorAll("[data-vol]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = getMember();
        b.disabled = true;
        var p = b.getAttribute("data-vol") === "on"
          ? window.ParagonDB.signupVolunteer(needId, m.id, m.name)
          : window.ParagonDB.cancelVolunteerSignup(needId, m.id);
        p.then(function () { loadVolunteerSignups(needId, spots, m.id); toast("Saved."); },
             function () { b.disabled = false; toast("Could not save — check your connection."); });
      });
    });
  }).catch(function () {
    el.innerHTML = '<p class="muted">Could not load signups.</p>';
  });
}

/* ---------------- photo gallery ---------------- */
function vGallery(){
  view.innerHTML = "<h1 class=\"page-title\">Photo gallery</h1>" +
    '<div id="ga-list"><div class="card"><p class="muted">Loading photos...</p></div></div>';
  window.ParagonDB.init().then(function (ok) {
    if (!ok) throw new Error("offline");
    return window.ParagonDB.listGalleryPhotos();
  }).then(function (rows) {
    document.getElementById("ga-list").innerHTML = rows.length ? rows.map(function (p) {
      return '<div class="card center"><img src="' + esc(p.image_url) + '" alt="' + esc(p.caption || "paragonpdx photo") + '"' +
        ' style="width:100%;border-radius:12px">' +
        (p.caption ? '<p class="muted" style="font-size:14px;margin:8px 0 0">' + esc(p.caption) + "</p>" : "") + "</div>";
    }).join("") :
      '<div class="empty"><p style="font-size:40px;margin:0">📷</p><h3>Paragon PDX photos coming soon</h3>' +
      "<p>Our own pictures will live here — from the streets, the villages, and the community.</p></div>";
  }).catch(function () {
    document.getElementById("ga-list").innerHTML =
      '<div class="card"><p class="muted">Connect to the internet to see photos.</p></div>';
  });
}

/* ---------------- public contact form ---------------- */
function vContact(){
  var member = getMember();
  view.innerHTML =
    (member ? '<a class="btn secondary small" href="#/home">‹ Home</a>' : '<a class="btn secondary small" href="#/">‹ Back</a>') +
    "<h1 class=\"page-title\">Contact paragonpdx</h1>" +
    '<div class="card"><p class="muted">Questions about the community, volunteering, or the Hub? ' +
    "Write to us — Wayne or one of the organizers will read it.</p>" +
    '<div class="field"><label for="ct-name">Your name *</label><input id="ct-name" type="text" autocomplete="name" placeholder="First and last name"></div>' +
    '<div class="field"><label for="ct-email">Email</label><input id="ct-email" type="email" autocomplete="email" placeholder="you@example.com"></div>' +
    '<div class="field"><label for="ct-phone">Phone number</label><input id="ct-phone" type="tel" autocomplete="tel" placeholder="(503) 555-0100"></div>' +
    '<div class="field"><label for="ct-msg">Your message *</label>' +
    '<textarea class="essay" id="ct-msg" style="min-height:120px" placeholder="What\u2019s on your mind?"></textarea></div>' +
    '<div class="error" id="ct-error"></div>' +
    '<button class="btn" id="ct-btn">Send message</button></div>';
  document.getElementById("ct-btn").addEventListener("click", function () {
    var name = document.getElementById("ct-name").value.trim();
    var email = document.getElementById("ct-email").value.trim();
    var phone = document.getElementById("ct-phone").value.trim();
    var msg = document.getElementById("ct-msg").value.trim();
    var errEl = document.getElementById("ct-error");
    if (!name) { errEl.textContent = "Please type your name."; return; }
    if (!msg) { errEl.textContent = "Please write your message."; return; }
    if (email && !validEmail(email)) { errEl.textContent = "That email doesn't look right — check it and try again."; return; }
    errEl.textContent = "";
    var btn = document.getElementById("ct-btn");
    btn.disabled = true; btn.textContent = "Sending...";
    window.ParagonDB.init().then(function (ok) {
      if (!ok) throw new Error("offline");
      return window.ParagonDB.submitContactMessage(name, email, phone, msg);
    }).then(function () {
      view.innerHTML = '<div class="card center"><p style="font-size:40px;margin:0">💛</p>' +
        "<h2>Message sent</h2><p class=\"muted\">Thanks, " + esc(firstName(name)) +
        " — Wayne or one of the organizers will read it soon.</p>" +
        '<a class="btn secondary" href="#/">Back to the front page</a></div>';
    }).catch(function () {
      btn.disabled = false; btn.textContent = "Send message";
      errEl.textContent = "Could not send — check your connection and try again.";
    });
  });
}

function vAbout(){
  view.innerHTML = "<h1 class=\"page-title\">About paragonpdx</h1>" +
    '<div class="card center"><img class="hero-logo" src="logo.png" alt="paragonpdx logo">' +
    '<p class="tagline">cause, care, &amp; concern in action...</p></div>' +
    '<div class="card"><h3>Our story</h3>' +
    "<p>A <i>paragon</i> is a perfect example of a good quality. paragonpdx exists to be exactly that in Portland — " +
    "a living example of compassion for our neighbors on the margins: people experiencing homelessness, " +
    "folks working their way through recovery, and everyone the city too often walks past.</p>" +
    "<p>We show up with meals, shelter connections, tiny-home village support, and simple human kindness. " +
    "This hub is our virtual meeting place: a spot to gather face-to-face on video, study servant leadership together, " +
    "and find real resources fast.</p></div>" +
    '<div class="card"><h3>What the Hub is for</h3><ul class="steps">' +
    "<li><b>Learn</b> — 130 servant-leadership lessons with quizzes, in order. Members join with a group code, or ask to join and get approved.</li>" +
    "<li><b>Meet</b> — one-tap video room for the whole community.</li>" +
    "<li><b>Resources</b> — Portland shelters, outreach, and tiny-home villages.</li>" +
    "</ul></div>";
}

function vInstall(){
  view.innerHTML = "<h1 class=\"page-title\">Install the app</h1>" +
    '<div class="card"><h3>Android (Chrome)</h3><ol class="steps">' +
    "<li>Open this page in Chrome.</li>" +
    "<li>Tap the <b>⋮</b> menu in the top-right corner.</li>" +
    "<li>Tap <b>Add to Home screen</b>, then <b>Add</b>.</li>" +
    "<li>The paragonpdx logo appears on your home screen like a regular app.</li></ol></div>" +
    '<div class="card"><h3>iPhone (Safari)</h3><ol class="steps">' +
    "<li>Open this page in Safari.</li>" +
    "<li>Tap the <b>Share</b> button (square with an arrow).</li>" +
    "<li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>" +
    "<li>The paragonpdx logo appears on your home screen like a regular app.</li></ol></div>";
}

/* ---------------- init ---------------- */
updateBadge();
if (!location.hash || location.hash === "#/") {
  location.hash = getMember() ? "#/home" : "#/";
}
route();

/* Debug/test hook (harmless in production). */
window.__ppdx = {
  getMember: getMember, getProfile: getProfile, roleLabel: roleLabel,
  isOpen: isOpen, isDone: isDone, highestDone: highestDone,
  gradeLesson: gradeLesson, validEmail: validEmail,
  DAYS: DAYS, WEEKS: WEEKS, WT: WT,
  lessonLabel: lessonLabel, route: route, viewEl: function(){ return view; },
  setProgress: saveProgress, getProgress: getProgress
};

})();
