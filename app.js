/* paragonpdx hub — new layout app */
(function () {
'use strict';

/* ============ config ============ */
var SB_URL = 'https://vwcdnqrsjadatbesmrwq.supabase.co';
var SB_KEY = 'sb_publishable_CZXrS0KIidR9l5nT8ZevIQ_jBttH5RY';
var MEET_URL = 'https://meet.jit.si/ParagonPDX';
var TERMS_V = '2026-09-30-hub';

var STUDIES = [
  { id: 'stronger', title: 'stronger', sub: '8 men who redefined strength', days: 60,
    desc: 'A 60-day walk with eight men across 2,300 years — what real strength looks like.',
    cover: 'art/stronger-cover.webp', ebook: 'ebooks/stronger.pdf' },
  { id: 'unbroken', title: 'unbroken', sub: '8 women who defied every culture', days: 60,
    desc: 'A 60-day study of the barriers women faced across 3,500 years — and broke through anyway.',
    cover: 'art/unbroken-cover.webp', ebook: 'ebooks/unbroken.pdf' },
  { id: 'vocation', title: 'vocation pdx', sub: 'faith, work, and the city', days: 30,
    desc: 'A 30-day study on calling — seeing your work in Portland as assigned, not accidental.',
    cover: 'art/vocation-cover.jpg', ebook: null },
  { id: 'mindset', title: 'mindset and well-being', sub: 'finding peace and renewing your mind', days: 24,
    desc: 'A 24-lesson study for renewing your mind day by day — peace over worry, truth over lies.',
    cover: 'art/mindset-cover.jpg', ebook: 'ebooks/mindset.pdf' }
];

/* ============ state ============ */
var sb = null;
var studyData = {};   // id -> parsed json
var session = null;   // {id,name,role,...}
var currentRoute = '';

/* ============ helpers ============ */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2600);
}
function timeAgo(ts) {
  if (!ts) return '';
  var s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function lsGet(k, dflt) {
  try { var v = localStorage.getItem(k); return v == null ? dflt : JSON.parse(v); }
  catch (e) { return dflt; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}

/* ============ disclaimer (EXACT wording, never reworded) ============ */
var TERMS_DATE = 'September 30, 2026';
var TERMS_HTML = [
'<h1>PARAGONPDX HUB TERMS OF USE &amp; LIABILITY DISCLAIMER</h1>',
'<p><strong>Last Updated:</strong> September 30, 2026</p>',
'<p>Please read this document carefully before using the paragonpdx hub. By tapping "I Accept," by requesting membership, or by accessing or using this application, you agree to be bound by these legally binding terms. If you do not agree, do not use the hub.</p>',
'<hr>',
'<h3>1. What this app is / Scope of Service</h3>',
'<p><strong>Plain Words:</strong> paragonpdx hub is a community space for study, sharing, and staying connected. It is not counseling, therapy, or a crisis service, and it is not medical, legal, housing, or benefits advice. If you are in danger, call 911. If you are in crisis, call or text 988.</p>',
'<p><strong>Legal Terms:</strong> The Hub is provided solely as a community fellowship, study, and communication platform. Studies, posts, and messages are offered for spiritual, educational, and encouragement purposes only and do not constitute medical, legal, mental health, housing, or government benefits advice, nor any professional or emergency service.</p>',
'<h3>2. Where information lives / Data Storage &amp; Security</h3>',
'<p><strong>Plain Words:</strong> Your name, email or phone, study progress, posts, and messages are stored on paragonpdx\'s online server so the hub can work across devices. Posts can be seen by anyone who opens the hub, including people who are not members. Messages are not encrypted end to end, and hub organizers can see them. Your written reflections and reading settings stay only on your own phone. Do not put anything in the hub that you need kept secret.</p>',
'<p><strong>Legal Terms:</strong> Membership details, study progress, posts, and messages are transmitted to and stored on third-party cloud infrastructure operated on behalf of paragonpdx. This data is not end-to-end encrypted and may be accessible to hub administrators and organizers. Content posted to the community feed is publicly visible. Reflection notes and display preferences are stored only within your local device\'s web browser storage. The Hub does not constitute a database or repository for Protected Health Information (PHI) under healthcare privacy laws.</p>',
'<h3>3. What can go wrong / Account &amp; Data Risk</h3>',
'<p><strong>Plain Words:</strong> Signing in uses your name and your email or phone, not a password. Anyone who knows those details could sign in as you. Information in the hub may be lost, seen by others, or stop working at any time.</p>',
'<p><strong>Legal Terms:</strong> The Hub uses identity-based sign-in without password protection. paragonpdx does not guarantee that accounts, posts, or messages are protected from unauthorized access, and stored information may be permanently lost, altered, or exposed due to device loss, service interruption, compromise, or administrative action.</p>',
'<h3>4. Membership &amp; Community Conduct</h3>',
'<p><strong>Plain Words:</strong> New members are approved by a hub organizer. Be kind and respectful. No harassment, threats, hate, sexual content, scams, or sharing someone else\'s private information. Organizers may remove posts or pause or end any membership at any time.</p>',
'<p><strong>Legal Terms:</strong> Membership is granted at the sole discretion of paragonpdx and may be suspended or revoked at any time, for any reason, without notice. You are solely responsible for all content you post or send. paragonpdx reserves the right, but assumes no obligation, to review, remove, or retain any content and to restrict access to the Hub.</p>',
'<h3>5. DISCLAIMER OF WARRANTIES</h3>',
'<p><strong>Legal Terms:</strong> THE HUB IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, PARAGONPDX DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE HUB WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR THAT DATA WILL NOT BE LOST.</p>',
'<h3>6. No blame / Limitation of Liability &amp; Indemnification</h3>',
'<p><strong>Plain Words:</strong> paragonpdx, its volunteers, organizers, and workers, and Wayne Brown are not responsible or liable for information that is lost, seen by others, or misused, for what other members post or send, or for any decision made using this hub.</p>',
'<p><strong>Legal Terms:</strong> TO THE MAXIMUM EXTENT PERMITTED BY LAW, PARAGONPDX, ITS VOLUNTEERS, ORGANIZERS, BOARD MEMBERS, ASSOCIATED WORKERS, AND WAYNE BROWN SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. THIS INCLUDES, WITHOUT LIMITATION, DAMAGES FOR LOSS OF DATA, UNAUTHORIZED DATA EXPOSURE, SYSTEM FAILURES, CONTENT POSTED OR SENT BY OTHER USERS, OR ANY DECISIONS MADE RELYING UPON THE HUB.</p>',
'<p><strong>Indemnification:</strong> You agree to defend, indemnify, and hold harmless paragonpdx and Wayne Brown from and against any claims, liabilities, damages, judgments, or expenses (including reasonable attorneys\' fees) arising out of your use or misuse of the Hub, the content you post or send, or your violation of these Terms.</p>',
'<h3>7. Governing Law and Jurisdiction</h3>',
'<p><strong>Legal Terms:</strong> These Terms and any disputes arising out of or relating to the Hub shall be governed by and construed in accordance with the laws of the State of Oregon, without regard to conflict of law principles. Any legal action or proceeding relating to these Terms shall be brought exclusively in the state or federal courts located in Multnomah County, Oregon.</p>',
'<h3>8. Electronic Acceptance</h3>',
'<p><strong>Plain Words:</strong> This is a plain-words summary, not legal advice. Tapping "I Accept" records your agreement on this device. Agreeing when you request membership, or when these terms change, records your agreement with your membership: your name, the date, and which version you agreed to.</p>',
'<p><strong>Legal Terms:</strong> By tapping "I Accept" or by checking the agreement box during membership, you acknowledge that you have read, understood, and expressly agree to be legally bound by these Terms. This digital action constitutes your binding electronic signature under the Oregon Uniform Electronic Transactions Act (ORS Chapter 84). paragonpdx may update these Terms; continued membership requires acceptance of the current version.</p>'
].join('\n');

/* ============ icons (inline line icons) ============ */
var ICON = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  msg: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
function icon(name, size) {
  size = size || 22;
  return '<svg class="ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
}
function initials(name) {
  var p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toLowerCase();
}

/* ============ disclaimer gate ============ */
function termsAccepted() {
  try { return localStorage.getItem('ppdx_terms_v') === TERMS_V; } catch (e) { return false; }
}
function showGate() {
  $('gate').style.display = 'block';
  $('app').style.display = 'none';
  $('gate-terms').innerHTML = TERMS_HTML;
  var box = $('gate-terms'), btn = $('gate-accept');
  btn.disabled = true;
  box.onscroll = function () {
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 40) btn.disabled = false;
  };
  setTimeout(function () {
    if (box.scrollHeight <= box.clientHeight + 40) btn.disabled = false;
  }, 300);
  btn.onclick = function () {
    try { localStorage.setItem('ppdx_terms_v', TERMS_V); } catch (e) {}
    $('gate').style.display = 'none';
    $('app').style.display = 'block';
    startApp();
  };
}

/* ============ supabase ============ */
function initSB() {
  try {
    if (window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(SB_URL, SB_KEY);
      return true;
    }
  } catch (e) {}
  return false;
}

/* ============ session ============ */
function loadSession() { session = lsGet('ppdx_hub_session_v1', null); }
function saveSession(s) { session = s; lsSet('ppdx_hub_session_v1', s); startLive(); }
function clearSession() {
  session = null; stopLive();
  try { localStorage.removeItem('ppdx_hub_session_v1'); } catch (e) {}
}

/* ============ chrome ============ */
function setMode(mode) {
  // mode: '' (normal), 'reader', 'chat'
  document.body.classList.toggle('mode-reader', mode === 'reader');
  document.body.classList.toggle('mode-chat', mode === 'chat');
  if (mode !== 'reader') document.body.classList.remove('reader-light');
}
function updateChrome() {
  var logged = !!session;
  $('bottomnav').style.display = logged ? '' : 'none';
  $('bell-btn').style.display = logged ? '' : 'none';
  var h = location.hash || '#/';
  var onHome = (h === '#/' || h === '#' || h === '#/member');
  $('ticker').style.display = onHome ? '' : 'none';
  refreshBell();
}
function setNav(active) {
  var btns = $('bottomnav').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    var on = btns[i].getAttribute('data-route') === active;
    btns[i].classList.toggle('active', on);
    if (on) btns[i].setAttribute('aria-current', 'page'); else btns[i].removeAttribute('aria-current');
  }
}

/* ============ router ============ */
var routes = {};
function route() {
  loadSession();
  var h = location.hash || '#/';
  currentRoute = h;
  setMode('');
  updateChrome();
  var parts = h.replace(/^#\/?/, '').split('/');
  var name = parts[0];
  window.scrollTo(0, 0);
  if (name === '') { if (session) { location.hash = '#/member'; return; } return renderHome(); }
  if (PUBLIC[name]) return PUBLIC[name](parts.slice(1));
  if (!session) { location.hash = '#/'; return; }
  if (routes[name]) return routes[name](parts.slice(1));
  location.hash = '#/member';
}
window.addEventListener('hashchange', route);

/* ============ ticker ============ */
var TICKER_ITEMS = [
  'welcome to the new paragonpdx hub — same heart, brand new home',
  'four studies are live: stronger, unbroken, vocation pdx, and mindset and well-being',
  'join us in the meeting room — tap the meeting room button on home',
  'cause, care, & concern in action — the work continues in Portland every day'
];
function startTicker() {
  var t = TICKER_ITEMS.join('     •     ') + '     •     ';
  $('ticker-text').textContent = t + t;
}

/* ============ public home ============ */
function renderHome() {
  setNav('');
  $('view').innerHTML =
    '<section class="welcome">' +
      '<img class="welcome-logo" src="logo.png" alt="paragonpdx — cause, care, & concern in action">' +
      '<h1>a home for the work we do together.</h1>' +
      '<p>paragonpdx hub is where our Portland community gathers — to study, to share, and to show up for each other.</p>' +
    '</section>' +
    '<section class="panel">' +
      '<h2 class="h2">sign in</h2>' +
      '<div class="field"><label for="li-name">your name</label><input id="li-name" type="text" autocomplete="name" placeholder="full name"></div>' +
      '<div class="field"><label for="li-id">email or phone</label><input id="li-id" type="text" autocomplete="username" placeholder="email or phone"></div>' +
      '<button class="btn" id="li-go">sign in</button>' +
      '<p class="hint" id="li-msg" role="status"></p>' +
    '</section>' +
    '<a class="join-cta" href="#/join"><div><h2>new here?</h2><p>request to join the hub. an organizer will approve you.</p></div>' + icon('arrow') + '</a>' +
    '<div class="sec-head"><h2 class="h2">community feed</h2></div>' +
    '<div id="home-feed" class="feed"><div class="empty">loading…</div></div>';
  $('li-go').onclick = doLogin;
  $('li-id').onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
  loadFeed($('home-feed'), 10);
}

function doLogin() {
  var name = $('li-name').value.trim();
  var ident = $('li-id').value.trim().toLowerCase();
  var msg = $('li-msg');
  if (!name || !ident) { msg.textContent = 'type your name and email or phone.'; return; }
  msg.textContent = 'signing in…';
  if (!sb) { msg.textContent = 'still connecting — try again in a moment.'; return; }
  sb.from('profiles').select('*')
    .ilike('name', name).limit(10)
    .then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      var hit = null;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var em = String(r.email || '').toLowerCase(), ph = String(r.phone || '').toLowerCase();
        if (em === ident || ph === ident) { hit = r; break; }
      }
      if (!hit) { msg.innerHTML = 'no match found — check your name and email or phone, or <a href="#/join">request to join</a>.'; return; }
      if (hit.status === 'pending') { msg.textContent = 'your request is waiting for an organizer to approve it. you’ll be able to sign in once it’s approved.'; return; }
      if (hit.status && hit.status !== 'active') { msg.textContent = 'this account is ' + hit.status + ' — talk to Wayne.'; return; }
      var s = { id: String(hit.id), name: hit.name, role: hit.role || 'member', group_id: hit.group_id || null };
      if (('terms_version' in hit) && hit.terms_version !== TERMS_V) {
        pendingSession = s; location.hash = '#/agree'; return;   // must agree to the current terms first
      }
      welcomeIn(s);
    })
    .catch(function () { msg.textContent = 'could not reach the server — check your connection.'; });
}

/* ============ feed (announcements table) ============ */
function postHTML(p) {
  return '<article class="post">' +
    '<div class="post-head"><div class="avatar">' + esc(initials(p.author_name)) + '</div>' +
    '<div><div class="post-name">' + esc(p.author_name || 'member') + '</div>' +
    '<div class="post-meta">' + esc((p.author_role || 'member').toLowerCase()) + ', ' + timeAgo(p.created_at) + '</div></div></div>' +
    (p.title ? '<h3 class="post-title">' + esc(p.title) + '</h3>' : '') +
    '<p class="post-body">' + esc(p.body) + '</p></article>';
}
function loadFeed(el, limit) {
  if (!sb) { el.innerHTML = '<div class="empty">connecting…</div>'; setTimeout(function () { if (document.body.contains(el)) loadFeed(el, limit); }, 1500); return; }
  var q = sb.from('announcements').select('id,title,body,author_name,author_role,created_at')
    .order('created_at', { ascending: false });
  if (limit) q = q.limit(limit);
  q.then(function (res) {
    if (res.error) throw res.error;
    var rows = res.data || [];
    if (!rows.length) { el.innerHTML = '<div class="empty">nothing shared yet — be the first.</div>'; return; }
    el.innerHTML = rows.map(postHTML).join('');
  }).catch(function () {
    el.innerHTML = '<div class="empty">could not load the feed — check your connection.</div>';
  });
}
function publishPost(title, body, done) {
  if (!sb || !session) return done(new Error('offline'));
  sb.from('announcements').insert({
    title: String(title || '').trim() || null,
    body: String(body || '').trim(),
    author_name: session.name,
    author_role: session.role || 'member'
  }).then(function (res) { done(res.error || null); }).catch(done);
}

/* ============ membership: join, agree, approve ============ */
var PUBLIC = {}, pendingSession = null;
function welcomeIn(s) {
  saveSession(s);
  toast('welcome, ' + s.name.split(' ')[0].toLowerCase());
  location.hash = '#/member';
}
function termsBox(id) {
  return '<div class="terms-box" id="' + id + '" tabindex="0" aria-label="hub terms of use">' + TERMS_HTML + '</div>';
}
function recordAgreement(profileId, name, contact, note) {
  return sb.from('agreements').insert({
    profile_id: profileId ? String(profileId) : null, name: name, contact: contact || null,
    terms_version: TERMS_V, note: note || null, device: String(navigator.userAgent || '').slice(0, 250)
  });
}
PUBLIC.join = function () {
  setNav('');
  $('view').innerHTML =
    '<section class="greet"><div class="kicker">request to join</div><h1>join the hub.</h1>' +
    '<p class="hint">tell us who you are, read the terms, and send your request. an organizer approves every new member.</p></section>' +
    '<section class="panel">' +
      '<div class="field"><label for="j-name">full name</label><input id="j-name" type="text" autocomplete="name"></div>' +
      '<div class="field"><label for="j-email">email</label><input id="j-email" type="email" autocomplete="email" inputmode="email"></div>' +
      '<div class="field"><label for="j-phone">phone</label><input id="j-phone" type="tel" autocomplete="tel" inputmode="tel"></div>' +
      '<p class="hint" style="margin:-4px 0 14px">you’ll sign in with your name plus the email or phone you give here. one is enough.</p>' +
      '<div class="field"><label for="j-note">how do you know paragonpdx? (optional)</label><input id="j-note" type="text"></div>' +
    '</section>' +
    '<section class="panel">' +
      '<h2 class="h2">hub terms of use</h2>' + termsBox('j-terms') +
      '<label class="agree"><input type="checkbox" id="j-agree"><span>i have read and agree to the paragonpdx hub terms of use (updated ' + esc(TERMS_DATE.toLowerCase()) + ').</span></label>' +
      '<button class="btn" id="j-go" disabled>send my request</button>' +
      '<p class="hint" id="j-msg" role="status"></p>' +
    '</section>' +
    '<a class="btn-ghost block" href="#/">back to sign in</a>';
  $('j-agree').onchange = function () { $('j-go').disabled = !this.checked; };
  $('j-go').onclick = function () {
    var name = $('j-name').value.trim().replace(/\s+/g, ' ');
    var email = $('j-email').value.trim().toLowerCase(), phone = $('j-phone').value.trim();
    var note = $('j-note').value.trim(), msg = $('j-msg'), btn = $('j-go');
    if (name.split(' ').length < 2) { msg.textContent = 'type your first and last name.'; return; }
    if (!email && !phone) { msg.textContent = 'add an email or a phone number so you can sign in.'; return; }
    if (!$('j-agree').checked) { msg.textContent = 'check the box to agree to the terms.'; return; }
    if (!sb) { msg.textContent = 'still connecting — try again in a moment.'; return; }
    btn.disabled = true; msg.textContent = 'sending…';
    sb.from('profiles').select('*').ilike('name', name).limit(10).then(function (res) {
      if (res.error) throw res.error;
      var dup = (res.data || []).filter(function (r) {
        return (email && String(r.email || '').toLowerCase() === email) || (phone && String(r.phone || '') === phone);
      })[0];
      if (dup && dup.status === 'active') { msg.innerHTML = 'you’re already a member — <a href="#/">sign in</a>.'; btn.disabled = false; return; }
      if (dup && dup.status === 'pending') { msg.textContent = 'we already have your request. an organizer will approve it soon.'; btn.disabled = false; return; }
      var now = new Date().toISOString();
      return sb.from('profiles').insert({
        name: name, email: email || null, phone: phone || null, role: 'member', status: 'pending',
        terms_version: TERMS_V, terms_accepted_at: now, requested_at: now
      }).select('id').then(function (ins) {
        if (ins.error) throw ins.error;
        var id = ins.data && ins.data[0] ? ins.data[0].id : null;
        return recordAgreement(id, name, email || phone, note).then(function () {
          lsSet('ppdx_join_name_v1', name.split(' ')[0].toLowerCase());
          location.hash = '#/joined';
        });
      });
    }).catch(function () {
      btn.disabled = false;
      msg.textContent = 'your request didn’t go through — check your connection and try again.';
    });
  };
};
PUBLIC.joined = function () {
  setNav('');
  var first = lsGet('ppdx_join_name_v1', '');
  $('view').innerHTML =
    '<section class="complete"><div class="sunrise" aria-hidden="true"></div>' +
    '<div class="kicker">request sent</div><h1>thank you' + (first ? ', ' + esc(first) : '') + '.</h1>' +
    '<p>an organizer will review your request. once you’re approved, come back and sign in with your name and the email or phone you gave us.</p>' +
    '<a class="btn" href="#/">back to sign in</a></section>';
};
PUBLIC.agree = function () {
  setNav('');
  if (!pendingSession) { location.hash = '#/'; return; }
  var s = pendingSession;
  $('view').innerHTML =
    '<section class="greet"><div class="kicker">updated terms</div><h1>one step before you enter.</h1>' +
    '<p class="hint">the hub terms were updated ' + esc(TERMS_DATE.toLowerCase()) + '. please read and agree to keep your membership.</p></section>' +
    '<section class="panel">' + termsBox('a-terms') +
      '<label class="agree"><input type="checkbox" id="a-agree"><span>i have read and agree to the paragonpdx hub terms of use (updated ' + esc(TERMS_DATE.toLowerCase()) + ').</span></label>' +
      '<button class="btn" id="a-go" disabled>agree and continue</button>' +
      '<p class="hint" id="a-msg" role="status"></p>' +
    '</section>' +
    '<a class="btn-ghost block" href="#/" id="a-cancel">not now</a>';
  $('a-agree').onchange = function () { $('a-go').disabled = !this.checked; };
  $('a-cancel').onclick = function () { pendingSession = null; };
  $('a-go').onclick = function () {
    $('a-go').disabled = true; $('a-msg').textContent = 'saving…';
    sb.from('profiles').update({ terms_version: TERMS_V, terms_accepted_at: new Date().toISOString() }).eq('id', s.id)
      .then(function (res) {
        if (res.error) throw res.error;
        return recordAgreement(s.id, s.name, null, 'accepted updated terms');
      }).then(function () { pendingSession = null; welcomeIn(s); })
      .catch(function () { $('a-go').disabled = false; $('a-msg').textContent = 'couldn’t save your agreement — check your connection and try again.'; });
  };
};
function isLeader() {
  return !!session && /originator|organizer|admin|leader/i.test(session.role || '');
}
var pendingJoins = 0;
routes.requests = function () {
  setNav('#/menu');
  if (!isLeader()) { location.hash = '#/menu'; return; }
  $('view').innerHTML = '<section class="greet"><div class="kicker">member requests</div><h1>who’s asking to join.</h1></section><div id="reqs" class="threads"><div class="empty">loading…</div></div>';
  sb.from('profiles').select('*').eq('status', 'pending').limit(200).then(function (res) {
    if (res.error) throw res.error;
    var rows = res.data || [];
    if (!rows.length) { $('reqs').innerHTML = '<div class="empty">no requests right now. new ones show up here and in updates.</div>'; return; }
    $('reqs').innerHTML = rows.map(function (r) {
      var when = r.requested_at || r.terms_accepted_at || r.created_at;
      return '<div class="req" data-id="' + esc(r.id) + '"><div class="avatar dim">' + esc(initials(r.name)) + '</div>' +
        '<div class="thread-main"><div class="thread-name">' + esc(r.name) + '</div>' +
        '<div class="thread-prev">' + esc(r.email || r.phone || '') + (when ? ', ' + timeAgo(when) : '') + '</div>' +
        '<div class="thread-prev">' + (r.terms_version === TERMS_V ? 'agreed to current terms' : 'terms not on record') + '</div>' +
        '<div class="req-actions"><button class="btn small" data-act="active">approve</button><button class="btn-ghost small" data-act="declined">decline</button></div></div></div>';
    }).join('');
    var btns = $('reqs').querySelectorAll('button[data-act]');
    for (var i = 0; i < btns.length; i++) btns[i].onclick = function () {
      var card = this.closest('.req'), id = card.getAttribute('data-id'), act = this.getAttribute('data-act');
      this.disabled = true;
      sb.from('profiles').update({ status: act }).eq('id', id).then(function (u) {
        if (u.error) throw u.error;
        card.outerHTML = '<div class="empty">' + (act === 'active' ? 'approved — they can sign in now.' : 'declined.') + '</div>';
        memberCache = null; refreshCounts();
      }).catch(function () { toast('couldn’t save — check your connection'); });
    };
  }).catch(function () { $('reqs').innerHTML = '<div class="empty">requests aren’t set up yet — run the setup step in Supabase.</div>'; });
};

/* ============ member home ============ */
function continueTarget() {
  var last = lsGet('ppdx_last_study_v1', null);
  var order = last ? [getStudy(last)].concat(STUDIES) : STUDIES.slice();
  for (var i = 0; i < order.length; i++) {
    var s = order[i]; if (!s) continue;
    var p = getProgress(s.id);
    if (p.done >= s.days) continue;
    var next = p.days.length ? Math.max.apply(null, p.days) + 1 : 1;
    if (next > s.days) continue;
    return { s: s, day: next, started: p.done > 0, done: p.done };
  }
  return null;
}
routes.member = function () {
  setNav('#/member');
  var first = session.name.split(' ')[0].toLowerCase();
  var c = continueTarget();
  var cont = '';
  if (c) {
    var pct = Math.max(2, Math.round((c.done / c.s.days) * 100));
    cont = '<a class="continue" href="#/read/' + c.s.id + '/' + c.day + '">' +
      '<img src="' + c.s.cover + '" alt="">' +
      '<div class="continue-body">' +
        '<div class="kicker">' + (c.started ? 'continue ' : 'start ') + esc(c.s.title) + ', day ' + c.day + ' of ' + c.s.days + '</div>' +
        '<div class="continue-title" id="cont-title">' + esc(c.s.sub) + '</div>' +
        '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
      '</div></a>';
  }
  $('view').innerHTML =
    '<section class="greet"><div class="kicker">member home</div><h1>welcome back, ' + esc(first) + '.</h1></section>' +
    cont +
    '<div class="quick">' +
      '<a class="q" href="' + MEET_URL + '" target="_blank" rel="noopener">' + icon('video') + '<span>meeting room</span></a>' +
      '<button class="q" id="q-post">' + icon('pen') + '<span>share a post</span></button>' +
      '<a class="q" href="#/messages">' + icon('msg') + '<span>messages</span><b class="q-count" id="q-msg-count" hidden></b></a>' +
    '</div>' +
    '<section class="panel compose" id="compose" hidden>' +
      '<h2 class="h2">share with the community</h2>' +
      '<div class="field"><label for="pc-title">title (optional)</label><input id="pc-title" type="text" placeholder="give it a headline"></div>' +
      '<div class="field"><label for="pc-body">what’s on your heart</label><textarea id="pc-body" placeholder="write to the community…"></textarea></div>' +
      '<div class="row"><button class="btn" id="pc-go">post to the feed</button><button class="btn-ghost" id="pc-cancel">cancel</button></div>' +
      '<p class="hint">posts show on the public home feed and here.</p>' +
    '</section>' +
    '<div class="sec-head"><h2 class="h2">community feed</h2></div>' +
    '<div id="member-feed" class="feed"><div class="empty">loading…</div></div>';
  if (c) ensureStudyData(c.s.id, function () {
    var l = findLesson(c.s.id, c.day), el = $('cont-title');
    if (l && el) el.textContent = l.title;
  });
  $('q-post').onclick = function () { $('compose').hidden = false; $('pc-body').focus(); };
  $('pc-cancel').onclick = function () { $('compose').hidden = true; };
  $('pc-go').onclick = function () {
    var t = $('pc-title').value, b = $('pc-body').value.trim();
    if (!b) { toast('write something first'); return; }
    $('pc-go').disabled = true; $('pc-go').textContent = 'posting…';
    publishPost(t, b, function (err) {
      $('pc-go').disabled = false; $('pc-go').textContent = 'post to the feed';
      if (err) { toast('could not post — check your connection'); return; }
      $('pc-title').value = ''; $('pc-body').value = ''; $('compose').hidden = true;
      toast('posted'); loadFeed($('member-feed'), 20);
    });
  };
  lsSet('ppdx_feed_seen_v1', new Date().toISOString());
  loadFeed($('member-feed'), 20);
  paintMsgCount();
};

/* ============ studies ============ */
routes.studies = function () {
  setNav('#/studies');
  var cards = STUDIES.map(function (s) {
    var prog = getProgress(s.id);
    var state = prog.done >= s.days ? 'finished' : (prog.done ? prog.done + ' of ' + s.days + ' done' : 'not started');
    return '<a class="study" href="#/study/' + s.id + '">' +
      '<img src="' + s.cover + '" alt="">' +
      '<div class="study-body"><h3>' + esc(s.title) + '</h3><p>' + esc(s.sub) + '</p>' +
      '<div class="study-meta"><span>' + s.days + (s.id === 'mindset' ? ' lessons' : ' days') + '</span>' +
      '<span class="' + (prog.done ? 'on' : '') + '">' + state + '</span></div></div></a>';
  }).join('');
  $('view').innerHTML =
    '<section class="greet"><div class="kicker">studies</div><h1>walk it daily.</h1></section>' +
    '<div class="study-grid">' + cards + '</div>' +
    '<a class="meet" href="' + MEET_URL + '" target="_blank" rel="noopener">' + icon('video', 26) +
    '<div><h3>the meeting room</h3><p>gather face to face, right from your phone.</p></div></a>';
};

/* ============ study overview ============ */
routes.study = function (parts) {
  setNav('#/studies');
  var id = parts[0], s = getStudy(id);
  if (!s) { location.hash = '#/studies'; return; }
  ensureStudyData(id, function () {
    var d = studyData[id];
    var prog = getProgress(id);
    var list = d.lessons.map(function (l) {
      var done = prog.days.indexOf(l.day) !== -1;
      return '<a class="day' + (done ? ' done' : '') + '" href="#/read/' + id + '/' + l.day + '">' +
        '<span class="n">' + (done ? icon('check', 16) : l.day) + '</span>' +
        '<span class="t">' + esc(l.title) + '</span>' + icon('arrow', 16) + '</a>';
    }).join('');
    $('view').innerHTML =
      '<div class="cover"><img src="' + s.cover + '" alt=""><div class="cover-fade"></div>' +
      '<div class="cover-text"><h1>' + esc(s.title) + '</h1><p>' + esc(s.sub) + '</p></div></div>' +
      '<section class="panel"><p class="lede">' + esc(s.desc) + '</p>' +
      '<div class="bar"><span style="width:' + Math.round(prog.done / s.days * 100) + '%"></span></div>' +
      '<p class="hint">' + prog.done + ' of ' + s.days + ' finished</p>' +
      (s.ebook ? '<a class="btn-ghost block" href="' + s.ebook + '" target="_blank" rel="noopener">' + icon('file', 18) + ' open the ebook</a>' : '') +
      '</section>' +
      '<div class="sec-head"><h2 class="h2">days</h2></div><div class="days">' + list + '</div>';
  });
};

function getStudy(id) {
  for (var i = 0; i < STUDIES.length; i++) if (STUDIES[i].id === id) return STUDIES[i];
  return null;
}
function ensureStudyData(id, cb) {
  if (studyData[id]) return cb();
  fetch('data/' + id + '.json').then(function (r) { return r.json(); }).then(function (d) {
    studyData[id] = d; cb();
  }).catch(function () { toast('could not load study — check your connection'); });
}
function findLesson(id, day) {
  var d = studyData[id]; if (!d) return null;
  for (var i = 0; i < d.lessons.length; i++) if (d.lessons[i].day === day) return d.lessons[i];
  return null;
}

/* ============ progress ============ */
function getProgress(studyId) {
  var all = lsGet('ppdx_progress_v1', {});
  var p = all[studyId] || { days: [] };
  return { days: p.days, done: p.days.length };
}
function markDayDone(studyId, day) {
  var all = lsGet('ppdx_progress_v1', {});
  if (!all[studyId]) all[studyId] = { days: [] };
  if (all[studyId].days.indexOf(day) === -1) all[studyId].days.push(day);
  lsSet('ppdx_progress_v1', all);
  var q = lsGet('ppdx_sync_v1', []);
  q.push({ study: studyId, day: day, at: new Date().toISOString() });
  lsSet('ppdx_sync_v1', q);
  var lr = lsGet('ppdx_lastread_v1', {}); lr[studyId] = new Date().toDateString(); lsSet('ppdx_lastread_v1', lr);
  syncProgress();
}
function syncProgress() {
  if (!sb || !session) return;
  var q = lsGet('ppdx_sync_v1', []);
  if (!q.length) return;
  var latest = {};
  q.forEach(function (e) { latest[e.study] = e; });
  var done = 0, total = Object.keys(latest).length;
  Object.keys(latest).forEach(function (study) {
    var e = latest[study];
    sb.from('progress').upsert({
      profile_id: session.id, study_id: study, day: e.day, updated_at: e.at
    }, { onConflict: 'profile_id,study_id' }).then(function (res) {
      if (!res.error && ++done === total) lsSet('ppdx_sync_v1', []);
    }).catch(function () {});
  });
}

/* ============ lesson reader (light / dark) ============ */
function readerTheme() { return lsGet('ppdx_reader_theme_v1', 'dark'); }
routes.read = function (parts) {
  var id = parts[0], day = parseInt(parts[1], 10), s = getStudy(id);
  if (!s) { location.hash = '#/studies'; return; }
  setMode('reader');
  document.body.classList.toggle('reader-light', readerTheme() === 'light');
  lsSet('ppdx_last_study_v1', id);
  ensureStudyData(id, function () {
    var l = findLesson(id, day);
    if (!l) { location.hash = '#/study/' + id; return; }
    var total = studyData[id].lessons.length;
    var html =
      '<header class="rhead">' +
        '<a class="icon-btn" href="#/study/' + id + '" aria-label="back to ' + esc(s.title) + '">' + icon('back') + '</a>' +
        '<div class="rhead-title">' + esc(s.title) + ', day ' + l.day + '</div>' +
        '<div class="seg" role="group" aria-label="reading theme">' +
          '<button id="th-light" aria-pressed="' + (readerTheme() === 'light') + '">' + icon('sun', 15) + 'light</button>' +
          '<button id="th-dark" aria-pressed="' + (readerTheme() === 'dark') + '">' + icon('moon', 15) + 'dark</button>' +
        '</div>' +
      '</header>' +
      '<div class="rprogress"><span style="width:' + Math.max(2, Math.round(l.day / total * 100)) + '%"></span></div>' +
      '<article class="reading">' +
        '<div class="kicker">day ' + l.day + ' of ' + total + '</div>' +
        '<h1>' + esc(l.title) + '</h1>';
    if (l.quote) html += '<blockquote class="quote"><p>“' + esc(l.quote) + '”</p>' + (l.quoteBy ? '<footer>— ' + esc(l.quoteBy) + '</footer>' : '') + '</blockquote>';
    if (l.verse) html += '<blockquote class="verse"><p>' + esc(l.verse) + '</p>' + (l.reference ? '<footer>' + esc(l.reference) + '</footer>' : '') + '</blockquote>';
    (l.reading || []).forEach(function (p) { html += '<p>' + esc(p) + '</p>'; });
    if (l.prayer) html += '<aside class="aside"><h2>a prayer</h2><p>' + esc(l.prayer) + '</p></aside>';
    if (l.reflection) html += '<aside class="aside"><h2>reflect</h2><p>' + esc(l.reflection) + '</p></aside>';
    html += '</article>';
    var hasQ = (l.questions && l.questions.length) || (l.reflections && l.reflections.length);
    html += '<div class="rfoot">' + (hasQ
      ? '<a class="btn" href="#/quiz/' + id + '/' + day + '/0">continue to questions ' + icon('arrow', 18) + '</a>'
      : '<button class="btn" id="to-done">finish day ' + l.day + '</button>') + '</div>';
    $('view').innerHTML = html;
    if (!hasQ) $('to-done').onclick = function () { markDayDone(id, day); location.hash = '#/done/' + id + '/' + day; };
    function setTheme(t) {
      lsSet('ppdx_reader_theme_v1', t);
      document.body.classList.toggle('reader-light', t === 'light');
      $('th-light').setAttribute('aria-pressed', t === 'light');
      $('th-dark').setAttribute('aria-pressed', t === 'dark');
    }
    $('th-light').onclick = function () { setTheme('light'); };
    $('th-dark').onclick = function () { setTheme('dark'); };
  });
};

/* ============ questions ============ */
routes.quiz = function (parts) {
  setNav('#/studies');
  var id = parts[0], day = parseInt(parts[1], 10), qi = parseInt(parts[2], 10);
  ensureStudyData(id, function () {
    var l = findLesson(id, day);
    if (!l) { location.hash = '#/study/' + id; return; }
    var items = [];
    (l.questions || []).forEach(function (q) { items.push({ kind: 'mc', q: q }); });
    (l.reflections || []).forEach(function (r) { items.push({ kind: 'reflect', text: r }); });
    if (!items.length || qi >= items.length) { markDayDone(id, day); location.hash = '#/done/' + id + '/' + day; return; }
    var item = items[qi];
    if (item.kind === 'mc') renderMC(id, day, qi, items.length, item.q);
    else renderReflect(id, day, qi, items.length, item.text);
  });
};
function qHead(id, day, label) {
  return '<a class="back-link" href="#/read/' + id + '/' + day + '">' + icon('back', 18) + 'back to the reading</a>' +
    '<div class="kicker">' + label + '</div>';
}
function renderMC(id, day, qi, total, q) {
  var opts = q.options.map(function (o, i) {
    return '<button class="opt" data-i="' + i + '">' + esc(o) + '</button>';
  }).join('');
  $('view').innerHTML = '<section class="qscreen">' + qHead(id, day, 'question ' + (qi + 1) + ' of ' + total) +
    '<h1>' + esc(q.q) + '</h1><div class="opts">' + opts + '</div><div id="fb" aria-live="polite"></div></section>';
  var btns = document.querySelectorAll('.opt'), answered = false;
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = (function (idx) { return function () {
      if (answered) return; answered = true;
      var right = idx === q.answer;
      for (var j = 0; j < btns.length; j++) {
        btns[j].disabled = true;
        if (j === q.answer) btns[j].classList.add('correct');
        else if (j === idx) btns[j].classList.add('wrong');
      }
      var next = qi + 1;
      $('fb').innerHTML =
        '<div class="feedback ' + (right ? 'good' : 'bad') + '">' + icon(right ? 'check' : 'x', 22) +
        '<div><h2>' + (right ? 'that’s right' : 'not quite') + '</h2>' +
        (right ? '' : '<p>the answer is: <b>' + esc(q.options[q.answer]) + '</b></p>') + '</div></div>' +
        '<button class="btn" id="q-next">' + (next >= total ? 'finish day ' + day : 'next question') + '</button>';
      $('q-next').onclick = function () {
        if (next >= total) { markDayDone(id, day); location.hash = '#/done/' + id + '/' + day; }
        else location.hash = '#/quiz/' + id + '/' + day + '/' + next;
      };
      $('q-next').scrollIntoView({ behavior: 'smooth', block: 'end' });
    }; })(i);
  }
}
function renderReflect(id, day, qi, total, text) {
  var next = qi + 1;
  $('view').innerHTML = '<section class="qscreen">' + qHead(id, day, 'reflection ' + (qi + 1) + ' of ' + total) +
    '<h1>' + esc(text) + '</h1>' +
    '<div class="field"><label for="ref-note">your thoughts (optional, saved on this phone only)</label>' +
    '<textarea id="ref-note" placeholder="write if you want…"></textarea></div>' +
    '<button class="btn" id="ref-next">' + (next >= total ? 'finish day ' + day : 'next') + '</button></section>';
  $('ref-next').onclick = function () {
    var note = $('ref-note').value.trim();
    if (note) {
      var notes = lsGet('ppdx_notes_v1', {}), key = id + ':' + day;
      if (!notes[key]) notes[key] = [];
      notes[key].push({ q: text, note: note, at: new Date().toISOString() });
      lsSet('ppdx_notes_v1', notes);
    }
    if (next >= total) { markDayDone(id, day); location.hash = '#/done/' + id + '/' + day; }
    else location.hash = '#/quiz/' + id + '/' + day + '/' + next;
  };
}

/* ============ day complete ============ */
routes.done = function (parts) {
  setNav('#/studies');
  var id = parts[0], day = parseInt(parts[1], 10), s = getStudy(id);
  var hasNext = day < s.days;
  $('view').innerHTML =
    '<section class="complete"><div class="sunrise" aria-hidden="true"></div>' +
    '<div class="kicker">' + esc(s.title) + '</div>' +
    '<h1>day ' + day + ' complete.</h1>' +
    '<p>you showed up today. that matters.</p>' +
    (hasNext ? '<a class="btn" href="#/read/' + id + '/' + (day + 1) + '">start day ' + (day + 1) + '</a>' : '<p><b>you finished the whole study.</b></p>') +
    '<a class="btn-ghost block" href="#/study/' + id + '">back to ' + esc(s.title) + '</a></section>';
};

/* ============ messages (supabase, live) ============ */
var liveChannel = null, pollTimer = null, unreadMsgs = 0, newPosts = 0, openChatWith = null, memberCache = null;

function msgReady() { return !!(sb && session); }
function loadMembers(cb) {
  if (memberCache) return cb(memberCache);
  sb.from('profiles').select('id,name,role,status').order('name').then(function (res) {
    if (res.error) throw res.error;
    memberCache = (res.data || []).filter(function (p) { return (!p.status || p.status === 'active') && String(p.id) !== session.id; })
      .map(function (p) { return { id: String(p.id), name: p.name, role: (p.role || 'member').toLowerCase() }; });
    cb(memberCache);
  }).catch(function () { cb([]); });
}
function memberById(id) {
  if (!memberCache) return null;
  for (var i = 0; i < memberCache.length; i++) if (memberCache[i].id === id) return memberCache[i];
  return null;
}

routes.messages = function () {
  setNav('#/messages');
  $('view').innerHTML =
    '<section class="greet"><div class="kicker">messages</div><h1>stay connected.</h1></section>' +
    '<div id="threads" class="threads"><div class="empty">loading…</div></div>' +
    '<div class="sec-head"><h2 class="h2">start a conversation</h2></div>' +
    '<div class="field search"><label for="m-find" class="sr">find a member</label><input id="m-find" type="search" placeholder="find a member"></div>' +
    '<div id="people" class="threads"></div>';
  if (!msgReady()) { $('threads').innerHTML = '<div class="empty">connecting…</div>'; return; }
  loadMembers(function (members) {
    sb.from('hub_messages').select('id,sender_id,recipient_id,sender_name,body,created_at,read_at')
      .or('sender_id.eq.' + session.id + ',recipient_id.eq.' + session.id)
      .order('created_at', { ascending: false }).limit(300)
      .then(function (res) {
        if (res.error) throw res.error;
        var seen = {}, threads = [];
        (res.data || []).forEach(function (m) {
          var other = m.sender_id === session.id ? m.recipient_id : m.sender_id;
          if (!seen[other]) {
            var who = memberById(other);
            seen[other] = { id: other, name: who ? who.name : (m.sender_id === other ? m.sender_name : 'member'), role: who ? who.role : 'member', last: m, unread: 0 };
            threads.push(seen[other]);
          }
          if (m.recipient_id === session.id && !m.read_at) seen[other].unread++;
        });
        $('threads').innerHTML = threads.length ? threads.map(function (t) {
          return '<a class="thread' + (t.unread ? ' unread' : '') + '" href="#/chat/' + encodeURIComponent(t.id) + '">' +
            '<div class="avatar">' + esc(initials(t.name)) + '</div>' +
            '<div class="thread-main"><div class="thread-top"><span class="thread-name">' + esc(t.name) + '</span><span class="thread-time">' + timeAgo(t.last.created_at) + '</span></div>' +
            '<div class="thread-prev">' + (t.last.sender_id === session.id ? 'you: ' : '') + esc(t.last.body) + '</div></div>' +
            (t.unread ? '<b class="badge">' + t.unread + '</b>' : '') + '</a>';
        }).join('') : '<div class="empty">no conversations yet — pick someone below to say hello.</div>';
      }).catch(function () {
        $('threads').innerHTML = '<div class="empty">messages aren’t set up yet — run the setup step in Supabase.</div>';
      });
    function paintPeople(filter) {
      var f = String(filter || '').toLowerCase();
      var list = members.filter(function (p) { return !f || p.name.toLowerCase().indexOf(f) !== -1; });
      $('people').innerHTML = list.length ? list.map(function (p) {
        return '<a class="thread" href="#/chat/' + encodeURIComponent(p.id) + '"><div class="avatar dim">' + esc(initials(p.name)) + '</div>' +
          '<div class="thread-main"><div class="thread-name">' + esc(p.name) + '</div><div class="thread-prev">' + esc(p.role) + '</div></div>' + icon('plus', 18) + '</a>';
      }).join('') : '<div class="empty">no members match that name.</div>';
    }
    paintPeople('');
    $('m-find').oninput = function () { paintPeople(this.value); };
  });
};

function bubbleHTML(m) {
  var mine = m.sender_id === session.id;
  var t = new Date(m.created_at);
  var time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return '<div class="bubble-row ' + (mine ? 'me' : 'them') + '"><div class="bubble">' + esc(m.body) + '</div><div class="bubble-time">' + time + '</div></div>';
}
routes.chat = function (parts) {
  var otherId = decodeURIComponent(parts[0] || '');
  if (!otherId || !msgReady()) { location.hash = '#/messages'; return; }
  setMode('chat');
  openChatWith = otherId;
  loadMembers(function () {
    var who = memberById(otherId) || { name: 'member', role: 'member' };
    $('view').innerHTML =
      '<header class="chead">' +
        '<a class="icon-btn" href="#/messages" aria-label="back to messages">' + icon('back') + '</a>' +
        '<div class="avatar">' + esc(initials(who.name)) + '</div>' +
        '<div><div class="chead-name">' + esc(who.name) + '</div><div class="chead-role">' + esc(who.role) + '</div></div>' +
      '</header>' +
      '<div class="chat" id="chat" aria-live="polite"><div class="empty">loading…</div></div>' +
      '<div class="composer"><label for="chat-in" class="sr">message</label>' +
        '<input id="chat-in" type="text" placeholder="write a message…" autocomplete="off" enterkeyhint="send">' +
        '<button id="chat-send" aria-label="send">' + icon('send', 20) + '</button></div>';
    var box = $('chat');
    function scrollDown() { window.scrollTo(0, document.body.scrollHeight); }
    sb.from('hub_messages').select('id,sender_id,recipient_id,sender_name,body,created_at,read_at')
      .or('and(sender_id.eq.' + session.id + ',recipient_id.eq.' + otherId + '),and(sender_id.eq.' + otherId + ',recipient_id.eq.' + session.id + ')')
      .order('created_at', { ascending: true }).limit(500)
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        box.innerHTML = rows.length ? rows.map(bubbleHTML).join('') : '<div class="empty" id="chat-empty">say hello to ' + esc(who.name.split(' ')[0]) + '.</div>';
        scrollDown();
        markRead(otherId);
      }).catch(function () { box.innerHTML = '<div class="empty">messages aren’t set up yet — run the setup step in Supabase.</div>'; });
    function send() {
      var inp = $('chat-in'), t = inp.value.trim();
      if (!t) return;
      inp.value = '';
      var row = { sender_id: session.id, recipient_id: otherId, sender_name: session.name, body: t };
      var e = $('chat-empty'); if (e) e.remove();
      box.insertAdjacentHTML('beforeend', bubbleHTML({ sender_id: session.id, body: t, created_at: new Date().toISOString() }));
      scrollDown();
      sb.from('hub_messages').insert(row).then(function (res) {
        if (res.error) { toast('not sent — check your connection'); inp.value = t; }
      }).catch(function () { toast('not sent — check your connection'); inp.value = t; });
    }
    $('chat-send').onclick = send;
    $('chat-in').onkeydown = function (e) { if (e.key === 'Enter') send(); };
  });
};
function markRead(otherId) {
  sb.from('hub_messages').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', session.id).eq('sender_id', otherId).is('read_at', null)
    .then(function () { refreshCounts(); }).catch(function () {});
}

/* ============ live updates ============ */
function startLive() {
  stopLive();
  if (!msgReady()) return;
  try {
    liveChannel = sb.channel('dm-' + session.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hub_messages', filter: 'recipient_id=eq.' + session.id }, function (payload) {
        var m = payload.new;
        if (openChatWith === m.sender_id && (location.hash || '').indexOf('#/chat/') === 0) {
          var e = $('chat-empty'); if (e) e.remove();
          var box = $('chat'); if (box) { box.insertAdjacentHTML('beforeend', bubbleHTML(m)); window.scrollTo(0, document.body.scrollHeight); }
          markRead(m.sender_id);
        } else {
          toast('new message from ' + String(m.sender_name || 'a member').split(' ')[0].toLowerCase());
          refreshCounts();
          if ((location.hash || '') === '#/messages') routes.messages();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, function () { refreshCounts(); })
      .subscribe();
  } catch (e) {}
  refreshCounts();
  pollTimer = setInterval(refreshCounts, 30000);
}
function stopLive() {
  if (liveChannel && sb) { try { sb.removeChannel(liveChannel); } catch (e) {} }
  liveChannel = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
function refreshCounts() {
  if (!msgReady()) return;
  sb.from('hub_messages').select('id', { count: 'exact', head: true })
    .eq('recipient_id', session.id).is('read_at', null)
    .then(function (res) { unreadMsgs = res.error ? 0 : (res.count || 0); paintMsgCount(); refreshBell(); })
    .catch(function () {});
  var seen = lsGet('ppdx_feed_seen_v1', null);
  var q = sb.from('announcements').select('id', { count: 'exact', head: true });
  if (seen) q = q.gt('created_at', seen);
  q.then(function (res) { newPosts = res.error ? 0 : (seen ? (res.count || 0) : 0); refreshBell(); }).catch(function () {});
  if (isLeader()) {
    sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(function (res) { pendingJoins = res.error ? 0 : (res.count || 0); refreshBell(); }).catch(function () {});
  }
}
function paintMsgCount() {
  var el = $('q-msg-count');
  if (el) { el.hidden = !unreadMsgs; el.textContent = unreadMsgs; }
  var navDot = $('nav-msg-dot');
  if (navDot) navDot.hidden = !unreadMsgs;
}

/* ============ updates (bell) ============ */
function dailyReads() {
  var out = [], today = new Date().toDateString(), lastRead = lsGet('ppdx_lastread_v1', {});
  STUDIES.forEach(function (s) {
    var prog = getProgress(s.id);
    if (!prog.done || prog.done >= s.days) return;          // only studies you've started
    if (lastRead[s.id] === today) return;
    var next = Math.max.apply(null, prog.days) + 1;
    if (next > s.days) return;
    out.push({ study: s.id, day: next, title: s.title });
  });
  return out;
}
function refreshBell() {
  var dot = $('bell-dot'); if (!dot) return;
  var n = session ? unreadMsgs + newPosts + dailyReads().length + (isLeader() ? pendingJoins : 0) : 0;
  dot.hidden = !n;
  $('bell-btn').setAttribute('aria-label', n ? 'updates, ' + n + ' new' : 'updates');
}
routes.notifications = function () {
  setNav('#/notifications');
  var html = '<section class="greet"><div class="kicker">updates</div><h1>what’s new.</h1></section><div class="notes">';
  var any = false;
  if (isLeader() && pendingJoins) { any = true; html += '<a class="note" href="#/requests">' + icon('plus') + '<div><h2>' + pendingJoins + ' member request' + (pendingJoins > 1 ? 's' : '') + ' waiting</h2><p>approve or decline new people.</p></div></a>'; }
  if (unreadMsgs) { any = true; html += '<a class="note" href="#/messages">' + icon('msg') + '<div><h2>' + unreadMsgs + ' unread message' + (unreadMsgs > 1 ? 's' : '') + '</h2><p>open your conversations.</p></div></a>'; }
  if (newPosts) { any = true; html += '<a class="note" href="#/member">' + icon('pen') + '<div><h2>' + newPosts + ' new post' + (newPosts > 1 ? 's' : '') + ' in the feed</h2><p>see what the community shared.</p></div></a>'; }
  dailyReads().forEach(function (n) {
    any = true;
    html += '<a class="note" href="#/read/' + n.study + '/' + n.day + '">' + icon('book') + '<div><h2>today’s reading: ' + esc(n.title) + ', day ' + n.day + '</h2><p>tap to open it.</p></div></a>';
  });
  if (!any) html += '<div class="empty">you’re all caught up. new messages, posts, and daily readings show up here.</div>';
  $('view').innerHTML = html + '</div>';
};

/* ============ menu ============ */
routes.menu = function () {
  setNav('#/menu');
  $('view').innerHTML =
    '<section class="greet"><div class="kicker">menu</div><h1>' + esc(session.name) + '</h1><p class="hint">' + esc((session.role || 'member').toLowerCase()) + '</p></section>' +
    '<div class="menu">' +
      (isLeader() ? '<a href="#/requests">' + icon('plus') + 'member requests' + (pendingJoins ? '<b class="badge" style="margin-left:auto">' + pendingJoins + '</b>' : '') + '</a>' : '') +
      '<a href="' + MEET_URL + '" target="_blank" rel="noopener">' + icon('video') + 'open the meeting room</a>' +
      '<button id="m-terms">' + icon('file') + 'read the hub terms</button>' +
      '<button id="m-signout">' + icon('back') + 'sign out</button>' +
    '</div>';
  $('m-terms').onclick = function () {
    $('view').innerHTML = '<section class="panel terms">' + TERMS_HTML + '</section><a class="btn-ghost block" href="#/menu">back to menu</a>';
    window.scrollTo(0, 0);
  };
  $('m-signout').onclick = function () { clearSession(); location.hash = '#/'; toast('signed out'); };
};

/* ============ boot ============ */
$('bell-btn').onclick = function () { location.hash = '#/notifications'; };
(function wireNav() {
  var btns = $('bottomnav').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].onclick = (function (r) { return function () { location.hash = r; }; })(btns[i].getAttribute('data-route'));
})();
function startApp() {
  startTicker();
  route();
  if (session) startLive();
  setTimeout(syncProgress, 3000);
}
function boot() {
  initSB();
  loadSession();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  if (!termsAccepted()) { showGate(); return; }
  $('app').style.display = 'block';
  startApp();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
