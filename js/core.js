/* Isha Campaign Seva (calls + WhatsApp) — shared backend logic.
 * The SAME file runs in two places:
 *   1. In the browser (DEMO mode, data kept in this browser's localStorage)
 *   2. In Google Apps Script (copy this file as core.gs) where data lives in the Google Sheet.
 * Keep it plain JavaScript (no import/export, no browser-only APIs).
 */
var STATUS = {
  registered:       { label: 'Registered',             emoji: '🎉', good: true },
  intro:            { label: 'Will join Intro',        emoji: '🌼', good: true },
  interested_later: { label: 'Interested – next time', emoji: '🌱', good: true },
  follow_up:        { label: 'Follow up',              emoji: '📌', good: true },
  budget:           { label: 'Budget issue',           emoji: '💰' },
  not_interested:   { label: 'Not interested',         emoji: '🙏' },
  no_answer:        { label: "Didn't receive",         emoji: '📵' },
  wrong_number:     { label: 'Wrong number',           emoji: '❌' },
  completed_ie:     { label: 'Completed Inner Engineering', emoji: '🪷' }
};
// WhatsApp message campaigns use these instead
var WA_STATUS = {
  sent:         { label: 'Sent',         emoji: '✅', good: true },
  wrong_number: { label: 'Wrong number', emoji: '❌' },
  no_whatsapp:  { label: 'No WhatsApp',  emoji: '🚫' }
};
function statusOf(type) { return type === 'whatsapp' ? WA_STATUS : STATUS; }
// Not reached = we never actually spoke to / messaged this person
function missed(s) { return s === 'no_answer' || s === 'wrong_number' || s === 'no_whatsapp'; }
var TABLES = {
  Campaigns: ['id', 'name', 'type', 'startDate', 'endDate', 'perDay', 'message', 'introDate', 'introTime', 'active', 'createdAt', 'createdBy'],
  Admins:    ['phone', 'name', 'password', 'access', 'active', 'createdAt', 'createdBy'],   // access: whatsapp | call | both
  AdminLog:  ['ts', 'adminName', 'adminPhone', 'campaignId', 'campaignName', 'action', 'details'],
  Contacts: ['id', 'name', 'phone', 'email', 'programs', 'reservedFor', 'assignedTo', 'assignedAt',
             'status', 'attempts', 'lastCalledAt', 'calledBy', 'notes'],
  Callers:  ['phone', 'name', 'perDay', 'endDate', 'active', 'createdAt', 'startDate', 'followedBy', 'followedAt', 'addedBy'],
  Log:      ['ts', 'callerPhone', 'callerName', 'contactId', 'contactName', 'status', 'notes', 'milestone']
};
// Each campaign has its own Contacts_<id>, Callers_<id> and Log_<id> tabs
function tableCols(t) { return TABLES[t] || TABLES[String(t).split('_')[0]]; }
var MAX_ATTEMPTS = 3;        // "Didn't receive" contacts are retried up to 3 times
var RETRY_GAP_HOURS = 20;    // ...and not before 20 hours have passed

function normPhone(p) {
  var d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  return d;
}
function istDay(iso) {
  var t = iso ? new Date(iso).getTime() : Date.now();
  return new Date(t + 19800000).toISOString().slice(0, 10);
}
function addDays(day, n) {
  var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
// A changed result on someone already reached (e.g. Next time -> Not interested) is an update, not a new call
function isCall(l) { return l.milestone !== 'update'; }
function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

function createCore(store, camp) {
  var now = function () { return new Date().toISOString(); };
  camp = camp || {};
  var ST = statusOf(camp.type), DEF_PER = Number(camp.perDay) || (camp.type === 'whatsapp' ? 30 : 2);

  function findCaller(phone) {
    phone = normPhone(phone);
    return store.all('Callers').filter(function (c) { return normPhone(c.phone) === phone; })[0];
  }
  function callerView(c) {
    var today = istDay(), start = c.startDate || '';
    var from = start > today ? start : today;
    var left = c.endDate ? daysBetween(from, c.endDate) + 1 : 0;
    return { name: c.name, phone: normPhone(c.phone), perDay: Number(c.perDay) || DEF_PER, startDate: start, endDate: c.endDate,
             daysLeft: Math.max(0, left), active: String(c.active) !== 'false', notStarted: !!start && today < start,
             followedBy: c.followedBy || '', followedAt: c.followedAt || '', addedBy: c.addedBy || '' };
  }
  function contactView(x) {
    return { id: x.id, name: x.name, phone: normPhone(x.phone), email: x.email, programs: x.programs,
             attempts: Number(x.attempts) || 0, status: x.status, notes: x.notes, lastCalledAt: x.lastCalledAt };
  }
  function eligible(x, phone) {
    if (x.assignedTo) return false;
    if (x.reservedFor && normPhone(x.reservedFor) !== phone) return false;
    if (!x.status) return true;
    if (x.status !== 'no_answer') return false;
    if ((Number(x.attempts) || 0) >= MAX_ATTEMPTS) return false;
    return !x.lastCalledAt || (Date.now() - new Date(x.lastCalledAt).getTime()) >= RETRY_GAP_HOURS * 3600000;
  }
  function rank(x, phone) {  // lower = picked first
    return (x.reservedFor && normPhone(x.reservedFor) === phone ? 0 : 10) + (x.status ? 5 : 0);
  }

  function teamData(log, callers) {
    var names = {};
    callers.forEach(function (c) { names[normPhone(c.phone)] = c.name; });
    var board = {}, team = { dials: 0, connects: 0, intros: 0, regs: 0 }, today = istDay();
    log.forEach(function (l) {
      var p = normPhone(l.callerPhone);
      var b = board[p] || (board[p] = { phone: p, name: names[p] || l.callerName, dials: 0, today: 0, regs: 0, intros: 0 });
      if (isCall(l)) {
        b.dials++; team.dials++;
        if (istDay(l.ts) === today) b.today++;
        if (!missed(l.status)) team.connects++;
      }
      if (l.status === 'registered') { b.regs++; team.regs++; }
      if (l.status === 'intro') { b.intros++; team.intros++; }
    });
    var list = Object.keys(board).map(function (k) {
      var b = board[k]; b.points = b.dials + 3 * b.intros + 10 * b.regs; return b;
    }).sort(function (a, b) { return b.points - a.points; });
    var feed = [];
    for (var i = log.length - 1; i >= 0 && feed.length < 20; i--) {
      var l = log[i];
      var type = l.status === 'registered' ? 'registered' : l.status === 'intro' ? 'intro'
        : l.milestone === 'extra' ? 'extra' : l.milestone === 'target' ? 'target' : null;
      if (type) feed.push({ ts: l.ts, who: firstName(names[normPhone(l.callerPhone)] || l.callerName), phone: normPhone(l.callerPhone), type: type });
    }
    return { board: list, team: team, feed: feed };
  }

  function streakOf(mine, perDay) {
    var byDay = {};
    mine.forEach(function (l) { if (isCall(l) && l.status !== 'no_answer') { var d = istDay(l.ts); byDay[d] = (byDay[d] || 0) + 1; } });
    var d = istDay(), s = 0;
    if ((byDay[d] || 0) < perDay) d = addDays(d, -1);
    while ((byDay[d] || 0) >= perDay) { s++; d = addDays(d, -1); }
    return s;
  }

  function state(p) {
    var c = findCaller(p.phone);
    if (!c) throw new Error('This number is not registered in this campaign. Please contact the admin.');
    var cv = callerView(c), phone = cv.phone, today = istDay();
    var log = store.all('Log');
    var mine = log.filter(function (l) { return normPhone(l.callerPhone) === phone; });
    var todayMine = mine.filter(function (l) { return isCall(l) && istDay(l.ts) === today; });
    var done = todayMine.filter(function (l) { return l.status !== 'no_answer'; }).length;
    // calls owed from earlier days: from the caller's real first day (added mid-campaign = later start) until yesterday
    var created = c.createdAt ? istDay(c.createdAt) : '', first = cv.startDate > created ? cv.startDate : created;
    var lastPast = c.endDate && c.endDate < today ? addDays(c.endDate, 1) : today;
    var pastDays = first && first < lastPast ? daysBetween(first, lastPast) : 0;
    var doneBefore = mine.filter(function (l) { return isCall(l) && istDay(l.ts) < today && l.status !== 'no_answer'; }).length;
    var pending = cv.active ? Math.max(0, pastDays * cv.perDay - doneBefore) : 0;
    var contacts = store.all('Contacts');
    var inHand = contacts.filter(function (x) { return normPhone(x.assignedTo) === phone; });
    var over = !cv.active || cv.daysLeft <= 0, poolEmpty = false;

    if (!inHand.length && !over && !cv.notStarted && (done < cv.perDay || p.extra)) {
      var cands = contacts.filter(function (x) { return eligible(x, phone); });
      cands.sort(function (a, b) { return rank(a, phone) - rank(b, phone) || a._i - b._i; });
      if (cands.length) {
        var pick = cands[0];
        pick.assignedTo = phone; pick.assignedAt = now();
        store.update('Contacts', pick);
        inHand = [pick];
      } else poolEmpty = true;
    }
    var byId = {};
    contacts.forEach(function (x) { byId[x.id] = x; });
    var seen = {}, history = [];
    for (var i = mine.length - 1; i >= 0 && history.length < 40; i--) {
      var l = mine[i];
      if (seen[l.contactId]) continue; seen[l.contactId] = 1;
      var ct = byId[l.contactId] || {};
      history.push({ id: l.contactId, name: l.contactName, phone: normPhone(ct.phone), programs: ct.programs,
                     status: ct.status || l.status, ts: l.ts, notes: ct.notes });
    }
    var td = teamData(log, store.all('Callers'));
    var left = contacts.filter(function (x) { return !x.status && (normPhone(x.reservedFor) === phone || normPhone(x.assignedTo) === phone); }).length;
    var reachedAll = contacts.filter(function (x) { return x.status && x.status !== 'no_answer'; }).length;
    return {
      caller: cv, left: left, camp: { total: contacts.length, done: reachedAll }, today: { done: done, dials: todayMine.length, target: cv.perDay, pending: pending },
      inHand: inHand.map(contactView), over: over, poolEmpty: poolEmpty,
      stats: { total: mine.filter(isCall).length, regs: mine.filter(function (l) { return l.status === 'registered'; }).length,
               reached: Object.keys(mine.reduce(function (m, l) { if (!missed(l.status)) m[l.contactId] = 1; return m; }, {})).length,
               streak: streakOf(mine, cv.perDay) },
      history: history, feed: td.feed, board: td.board, team: td.team,
      followUps: contacts.filter(function (x) { return x.status && normPhone(x.calledBy) === phone; }).map(contactView)
    };
  }

  function submit(p) {
    var c = findCaller(p.phone);
    if (!c) throw new Error('Caller not found');
    if (!ST[p.status]) throw new Error('Unknown status');
    var cv = callerView(c), phone = cv.phone;
    var contact = store.all('Contacts').filter(function (x) { return String(x.id) === String(p.contactId); })[0];
    if (!contact) throw new Error('Contact not found');
    if (normPhone(contact.assignedTo) !== phone && normPhone(contact.calledBy) !== phone)
      throw new Error('This contact is no longer assigned to you');
    var today = istDay();
    var done = store.all('Log').filter(function (l) {
      return isCall(l) && normPhone(l.callerPhone) === phone && istDay(l.ts) === today && l.status !== 'no_answer';
    }).length;
    // Already reached earlier (any result except "Didn't receive") = just an update, not a call
    var isUpdate = !!contact.status && contact.status !== 'no_answer';
    var milestone = isUpdate ? 'update' : '';
    if (isUpdate && contact.status === p.status && !p.notes) { var same = state({ phone: phone }); same.saved = p.status; return same; }   // nothing changed
    if (!isUpdate && p.status !== 'no_answer') {
      if (done + 1 === cv.perDay) milestone = 'target';
      else if (done + 1 > cv.perDay) milestone = 'extra';
    }
    contact.status = p.status;
    if (!isUpdate) contact.attempts = (Number(contact.attempts) || 0) + 1;
    contact.lastCalledAt = now();
    contact.calledBy = phone;
    if (p.notes) contact.notes = (contact.notes ? contact.notes + ' | ' : '') + p.notes;
    contact.assignedTo = '';
    store.update('Contacts', contact);
    store.insert('Log', { ts: now(), callerPhone: phone, callerName: cv.name, contactId: contact.id,
                          contactName: contact.name, status: p.status, notes: p.notes || '', milestone: milestone });
    var s = state({ phone: phone });
    s.milestone = milestone; s.saved = p.status;
    return s;
  }

  function feed() {
    return teamData(store.all('Log'), store.all('Callers'));
  }

  /* ---------------- ADMIN ---------------- */
  function adminData() {
    var contacts = store.all('Contacts'), log = store.all('Log'), callers = store.all('Callers'), today = istDay();
    var counts = { total: contacts.length, fresh: 0, inHand: 0, unreachable: 0, unassigned: 0 };
    Object.keys(ST).forEach(function (k) { counts[k] = 0; });
    contacts.forEach(function (x) {
      if (x.assignedTo) counts.inHand++;
      if (!x.status) { if (!x.assignedTo) counts.fresh++; if (!x.assignedTo && !x.reservedFor) counts.unassigned++; }
      else counts[x.status] = (counts[x.status] || 0) + 1;
      if (x.status === 'no_answer' && (Number(x.attempts) || 0) >= MAX_ATTEMPTS) counts.unreachable++;
    });
    var cl = callers.map(function (c) {
      var v = callerView(c), p = v.phone;
      var mine = log.filter(function (l) { return normPhone(l.callerPhone) === p; });
      v.todayDone = mine.filter(function (l) { return isCall(l) && istDay(l.ts) === today && l.status !== 'no_answer'; }).length;
      v.todayDials = mine.filter(function (l) { return isCall(l) && istDay(l.ts) === today; }).length;
      v.dials = mine.filter(isCall).length;
      v.regs = mine.filter(function (l) { return l.status === 'registered'; }).length;
      v.intros = mine.filter(function (l) { return l.status === 'intro'; }).length;
      v.inHand = contacts.filter(function (x) { return normPhone(x.assignedTo) === p; }).length;
      v.reserved = contacts.filter(function (x) { return normPhone(x.reservedFor) === p && !x.status; }).length;
      v.streak = streakOf(mine, v.perDay);
      return v;
    });
    var dailyCapacity = cl.filter(function (v) { return v.active && v.daysLeft > 0; })
      .reduce(function (s, v) { return s + v.perDay; }, 0);
    return {
      counts: counts, callers: cl, dailyCapacity: dailyCapacity, today: today,
      contacts: contacts.map(function (x) {
        return { id: x.id, name: x.name, phone: normPhone(x.phone), email: x.email, programs: x.programs,
                 reservedFor: normPhone(x.reservedFor), assignedTo: normPhone(x.assignedTo), status: x.status,
                 attempts: Number(x.attempts) || 0, lastCalledAt: x.lastCalledAt, calledBy: normPhone(x.calledBy), notes: x.notes };
      }),
      log: log.slice(-150).reverse(),
      daily: dailySummary(log, callers)
    };
  }

  function dailySummary(log, callers) {
    var names = {}, out = {};
    callers.forEach(function (c) { names[normPhone(c.phone)] = firstName(c.name); });
    log.forEach(function (l) {
      var d = istDay(l.ts), o = out[d] || (out[d] = { calls: 0, connects: 0, intros: 0, regs: 0, extra: {}, regBy: {} });
      var who = names[normPhone(l.callerPhone)] || firstName(l.callerName);
      if (isCall(l)) { o.calls++; if (!missed(l.status)) o.connects++; }
      if (l.status === 'intro') o.intros++;
      if (l.status === 'registered') { o.regs++; o.regBy[who] = 1; }
      if (l.milestone === 'extra') o.extra[who] = 1;
    });
    Object.keys(out).forEach(function (d) { out[d].extra = Object.keys(out[d].extra); out[d].regBy = Object.keys(out[d].regBy); });
    return out;
  }

  function saveCaller(p) {
    var phone = normPhone(p.phone);
    if (phone.length < 10) throw new Error('Enter a valid 10-digit phone number');
    var existing = findCaller(phone);
    var np = normPhone(p.newPhone);
    if (existing && np && np !== phone) {
      if (np.length !== 10) throw new Error('Enter a valid 10-digit new phone number');
      if (findCaller(np)) throw new Error('Another caller already has ' + np);
      var cs = store.all('Contacts');
      cs.forEach(function (x) {
        if (normPhone(x.reservedFor) === phone) x.reservedFor = np;
        if (normPhone(x.assignedTo) === phone) x.assignedTo = np;
        if (normPhone(x.calledBy) === phone) x.calledBy = np;
      });
      store.replaceAll('Contacts', cs);
      var lg = store.all('Log'), moved = false;
      lg.forEach(function (l) { if (normPhone(l.callerPhone) === phone) { l.callerPhone = np; moved = true; } });
      if (moved) store.replaceAll('Log', lg);
      existing.phone = np; phone = np;
    }
    var days = Number(p.days);
    var row = existing || { phone: phone, createdAt: now(), active: 'true', addedBy: p._adminName || '' };
    if (p.name) row.name = String(p.name).trim();
    if (!row.name) throw new Error('Name is required');
    if (p.perDay) row.perDay = Number(p.perDay);
    if (!row.perDay) row.perDay = DEF_PER;
    if (p.startDate) row.startDate = p.startDate;
    var from = row.startDate && row.startDate > istDay() ? row.startDate : istDay();
    if (p.days !== undefined && p.days !== '' && !isNaN(days)) row.endDate = addDays(from, Math.max(days, 0) - 1);
    if (!row.endDate && camp.endDate) row.endDate = camp.endDate;   // no days given: till the campaign ends
    if (!row.startDate && camp.startDate) row.startDate = camp.startDate;
    if (p.active !== undefined) row.active = String(p.active);
    if (existing) store.update('Callers', row); else store.insert('Callers', row);
    if (row.active === 'false') releaseInHand(phone);
    if (!p.skipAssign) syncAll();   // re-split the list fairly across everyone, including this volunteer
    var reserved = store.all('Contacts').filter(function (x) { return normPhone(x.reservedFor) === phone && !x.status; }).length;
    return { ok: true, created: !existing, reserved: reserved };
  }

  /* Keep a caller holding exactly `target` uncalled contacts (= calls per day x days left).
     Too many -> the extra go back to the unassigned pool. Too few -> top up from the pool.
     Contacts already called, or open on the caller's screen right now, are never moved. */
  function rebalanceIn(all, phone, target) {
    var mine = all.filter(function (x) { return normPhone(x.reservedFor) === phone && !x.status; });
    var need = target - mine.length, changed = false;
    if (need > 0) {
      all.forEach(function (x) { if (need > 0 && !x.status && !x.assignedTo && !x.reservedFor) { x.reservedFor = phone; need--; changed = true; } });
    } else if (need < 0) {
      for (var i = mine.length - 1; i >= 0 && need < 0; i--) {   // give back the last-added ones first
        if (!mine[i].assignedTo) { mine[i].reservedFor = ''; need++; changed = true; }
      }
    }
    return changed;
  }
  function targetOf(c) { var cv = callerView(c); return cv.active ? cv.perDay * cv.daysLeft : 0; }
  /* Each volunteer's share = per day x days left. If the list is too small for everyone's full share,
     every share is cut by the same proportion, so a volunteer added later still gets contacts. */
  function fairTargets(all, callers) {
    var want = callers.map(targetOf), sum = want.reduce(function (a, b) { return a + b; }, 0);
    var avail = all.filter(function (x) { return !x.status; }).length;
    if (sum <= avail) return want;
    var out = want.map(function (w) { return Math.floor(w * avail / sum); });
    var spare = avail - out.reduce(function (a, b) { return a + b; }, 0);
    for (var i = 0; spare > 0 && i < out.length; i++) if (want[i] > out[i]) { out[i]++; spare--; }
    return out;
  }
  /* admin: bring every caller in line with calls/day x days left (one read, one write) */
  function syncAll() {
    var all = store.all('Contacts'), changed = false, callers = store.all('Callers');
    var held = function (c) { return all.filter(function (x) { return normPhone(x.reservedFor) === normPhone(c.phone) && !x.status; }).length; };
    var tg = fairTargets(all, callers);
    [true, false].forEach(function (releasing) {   // first give back extras, then top up from the freed pool
      callers.forEach(function (c, i) {
        if ((held(c) > tg[i]) === releasing && rebalanceIn(all, normPhone(c.phone), tg[i])) changed = true;
      });
    });
    if (changed) store.replaceAll('Contacts', all);
    return { ok: true, unassigned: all.filter(function (x) { return !x.status && !x.assignedTo && !x.reservedFor; }).length };
  }

  function releaseInHand(phone) {
    var all = store.all('Contacts'), changed = false;
    all.forEach(function (x) { if (normPhone(x.assignedTo) === phone) { x.assignedTo = ''; changed = true; } });
    if (changed) store.replaceAll('Contacts', all);
  }

  function uploadContacts(p) {
    var all = store.all('Contacts'), byPhone = {}, maxId = 0;
    all.forEach(function (x) {
      byPhone[normPhone(x.phone) || ('E:' + String(x.email).toLowerCase())] = x;
      var n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (n > maxId) maxId = n;
    });
    var reserve = normPhone(p.reservedFor || ''), added = 0, merged = 0, skipped = 0;
    (p.rows || []).forEach(function (r) {
      var ph = normPhone(r.phone), em = String(r.email || '').trim();
      var key = ph || (em ? 'E:' + em.toLowerCase() : '');
      if (!key) { skipped++; return; }   // no phone and no email: nothing to contact. A missing name is fine.
      var progs = String(r.programs || '').split(/[,;|]/).map(function (s) { return s.trim(); }).filter(String);
      var x = byPhone[key];
      if (x) {
        var have = String(x.programs || '').split(',').map(function (s) { return s.trim(); }).filter(String);
        progs.forEach(function (g) { if (have.indexOf(g) < 0) have.push(g); });
        x.programs = have.join(', ');
        if (!x.email && em) x.email = em;
        if (!String(x.name || '').trim() && String(r.name || '').trim()) x.name = String(r.name).trim();
        if (reserve && !x.status && !x.assignedTo) x.reservedFor = reserve;
        merged++;
      } else {
        x = { id: 'C' + (++maxId), name: String(r.name || '').trim(), phone: ph, email: em, programs: progs.join(', '),
              reservedFor: reserve, assignedTo: '', assignedAt: '', status: '', attempts: 0, lastCalledAt: '', calledBy: '', notes: '' };
        all.push(x); byPhone[key] = x; added++;
      }
    });
    store.replaceAll('Contacts', all);
    if (!reserve) syncAll();   // volunteers already in the campaign get their share of the new contacts
    return { added: added, merged: merged, skipped: skipped, total: all.length };
  }

  function assignContacts(p) {  // one-by-one or selected assignment by admin
    var ids = {}, to = normPhone(p.phone || ''), n = 0;
    (p.ids || []).forEach(function (i) { ids[String(i)] = 1; });
    var all = store.all('Contacts');
    all.forEach(function (x) {
      if (!ids[String(x.id)]) return;
      n++;
      if (p.reset) { x.status = ''; x.attempts = 0; }
      x.reservedFor = to;
      if (x.assignedTo && normPhone(x.assignedTo) !== to) x.assignedTo = '';
    });
    store.replaceAll('Contacts', all);
    return { updated: n };
  }

  function assignBulk(p) {  // reserve the next N never-called contacts for one caller
    var to = normPhone(p.phone), want = Number(p.count) || 0, n = 0;
    if (!findCaller(to)) throw new Error('Caller not found');
    var all = store.all('Contacts');
    all.forEach(function (x) {
      if (n < want && !x.status && !x.assignedTo && !x.reservedFor) { x.reservedFor = to; n++; }
    });
    store.replaceAll('Contacts', all);
    return { reserved: n };
  }

  /* admin: note which admin last followed up with a caller, and on which day */
  function markFollow(p) {
    var c = findCaller(p.phone);
    if (!c) throw new Error('Caller not found');
    var by = String(p.by || p._adminName || '').trim();
    if (!by) throw new Error('Enter who followed up');
    c.followedBy = by; c.followedAt = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : istDay();
    store.update('Callers', c);
    return { ok: true, followedBy: c.followedBy, followedAt: c.followedAt };
  }

  return { syncAll: syncAll, markFollow: markFollow, state: state, login: state, submit: submit, feed: feed, adminData: adminData, saveCaller: saveCaller,
           uploadContacts: uploadContacts, assignContacts: assignContacts, assignBulk: assignBulk };
}

/* ---------------- CAMPAIGNS ---------------- */
function campaignView(c) {
  return { id: c.id, name: c.name, type: c.type === 'whatsapp' ? 'whatsapp' : 'call', startDate: c.startDate, endDate: c.endDate,
           perDay: Number(c.perDay) || (c.type === 'whatsapp' ? 30 : 2), message: c.message || '', introDate: c.introDate || '',
           introTime: c.introTime || '', active: String(c.active) !== 'false', createdAt: c.createdAt, createdBy: c.createdBy || '' };
}
function findCampaign(store, id) {
  var c = store.all('Campaigns').filter(function (x) { return String(x.id) === String(id); })[0];
  if (!c) throw new Error('Campaign not found');
  return c;
}
// Same store, but Contacts / Callers / Log point at this campaign's own tabs
function scoped(store, id) {
  var t = function (n) { return n === 'Campaigns' ? n : n + '_' + id; };
  return {
    all: function (n) { return store.all(t(n)); },
    update: function (n, o) { return store.update(t(n), o); },
    insert: function (n, o) { return store.insert(t(n), o); },
    replaceAll: function (n, rows) { return store.replaceAll(t(n), rows); }
  };
}
function saveCampaign(store, p) {
  var name = String(p.name || '').trim();
  if (!name) throw new Error('Campaign name is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(p.endDate || '')) throw new Error('Enter start and end dates');
  if (p.endDate < p.startDate) throw new Error('End date is before start date');
  var all = store.all('Campaigns'), row = p.id ? all.filter(function (x) { return String(x.id) === String(p.id); })[0] : null;
  if (p.id && !row) throw new Error('Campaign not found');
  var isNew = !row;
  if (isNew) {
    var max = 0;
    all.forEach(function (x) { var n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (n > max) max = n; });
    row = { id: 'K' + (max + 1), type: p.type === 'whatsapp' ? 'whatsapp' : 'call', createdAt: new Date().toISOString(), active: 'true', createdBy: p._adminName || '' };
  }
  row.name = name; row.startDate = p.startDate; row.endDate = p.endDate;
  row.perDay = Number(p.perDay) || (row.type === 'whatsapp' ? 30 : 2);
  row.message = String(p.message || ''); row.introDate = p.introDate || ''; row.introTime = p.introTime || '';
  if (p.active !== undefined) row.active = String(p.active);
  if (isNew) store.insert('Campaigns', row); else store.update('Campaigns', row);
  if (isNew && p.volunteers && p.volunteers.length) {   // existing volunteers picked while creating; contacts come with the upload
    var core = createCore(scoped(store, row.id), campaignView(row));
    p.volunteers.forEach(function (v) { core.saveCaller({ name: v.name, phone: v.phone, startDate: row.startDate, skipAssign: true, _adminName: p._adminName }); });
  }
  return campaignView(row);
}
// Admin: everyone who has volunteered in any campaign (to reuse them in a new one)
function allVolunteers(store) {
  var seen = {}, out = [];
  store.all('Campaigns').slice().reverse().forEach(function (c) {
    store.all('Callers_' + c.id).forEach(function (v) {
      var p = normPhone(v.phone);
      if (p && !seen[p]) { seen[p] = 1; out.push({ name: v.name, phone: p }); }
    });
  });
  out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  return { volunteers: out };
}
// Volunteer login: every active campaign this phone is part of
function myCampaigns(store, phone) {
  phone = normPhone(phone);
  if (phone.length !== 10) throw new Error('Please enter your 10-digit mobile number');
  var today = istDay();
  var list = store.all('Campaigns').map(campaignView).filter(function (c) {
    if (!c.active) return false;
    return store.all('Callers_' + c.id).some(function (v) { return normPhone(v.phone) === phone && String(v.active) !== 'false'; });
  }).map(function (c) {   // small progress line for the picker
    var mine = store.all('Contacts_' + c.id).filter(function (x) { return !x.status && (normPhone(x.reservedFor) === phone || normPhone(x.assignedTo) === phone); }).length;
    c.left = mine; c.live = c.startDate <= today && today <= c.endDate; return c;
  });
  if (!list.length) throw new Error('This number is not added to any campaign yet. Please contact the admin 🙏');
  return { campaigns: list };
}

/* ---------------- ADMINS ---------------- */
// The main admin logs in with the master password (Script property ADMIN_PASSWORD). Other admins are rows in the Admins tab.
function canSee(admin, type) { return admin.main || admin.access === 'both' || admin.access === type; }
function adminLogin(store, auth, p) {
  var phone = normPhone(p.phone), pw = String(p.password || '');
  if (phone.length !== 10) throw new Error('Enter your 10-digit mobile number');
  var row = store.all('Admins').filter(function (a) { return normPhone(a.phone) === phone; })[0];
  var admin;
  if (auth.master(pw)) admin = { name: row ? row.name : 'Main admin', phone: phone, access: 'both', main: true };
  else if (row && String(row.active) !== 'false' && pw && String(row.password) === pw)
    admin = { name: row.name, phone: phone, access: row.access || 'both', main: false };
  else throw new Error('Wrong phone number or password');
  return { token: auth.issue(admin), admin: admin, campaigns: visibleCampaigns(store, admin) };
}
function visibleCampaigns(store, admin) {
  return store.all('Campaigns').map(campaignView).filter(function (c) { return canSee(admin, c.type); });
}
function adminView(a) {
  return { phone: normPhone(a.phone), name: a.name, access: a.access || 'both', active: String(a.active) !== 'false', createdBy: a.createdBy || '', createdAt: a.createdAt };
}
function saveAdmin(store, admin, p) {   // main admin only
  var phone = normPhone(p.phone), name = String(p.name || '').trim();
  if (phone.length !== 10) throw new Error('Enter a valid 10-digit phone number');
  if (!name) throw new Error('Name is required');
  if (['whatsapp', 'call', 'both'].indexOf(p.access) < 0) throw new Error('Choose what this admin can access');
  var row = store.all('Admins').filter(function (a) { return normPhone(a.phone) === phone; })[0], isNew = !row;
  if (isNew && String(p.password || '').length < 4) throw new Error('Password must be at least 4 characters');
  row = row || { phone: phone, createdAt: new Date().toISOString(), createdBy: admin.name };
  row.name = name; row.access = p.access;
  if (p.password) row.password = String(p.password);
  if (p.active !== undefined) row.active = String(p.active); else if (isNew) row.active = 'true';
  if (isNew) store.insert('Admins', row); else store.update('Admins', row);
  return adminView(row);
}
// One line per admin action, so everyone can see who did what
var LOGGED = {
  saveCampaign: function (r, p) { return (p.id ? 'Edited campaign' : 'Created campaign') + (p.volunteers && p.volunteers.length ? ' with ' + p.volunteers.length + ' volunteers' : ''); },
  uploadContacts: function (r) { return 'Uploaded contacts: ' + r.added + ' new, ' + r.merged + ' duplicates merged, ' + r.skipped + ' skipped'; },
  saveCaller: function (r, p) { return (r.created ? 'Added volunteer ' : 'Updated volunteer ') + (p.name || '') + ' (' + normPhone(p.phone) + ') · ' + r.reserved + ' contacts'; },
  assignContacts: function (r, p) { return r.updated + ' contacts ' + (p.reset ? 'put back to contact again' : p.phone ? 'assigned to ' + normPhone(p.phone) : 'moved back to the pool'); },
  assignBulk: function (r, p) { return r.reserved + ' contacts reserved for ' + normPhone(p.phone); },
  syncAll: function () { return 'Re-split contacts across all volunteers'; },
  markFollow: function (r, p) { return 'Followed up with volunteer ' + normPhone(p.phone); },
  saveAdmin: function (r, p) { return (p.isNew ? 'Added admin ' : 'Updated admin ') + r.name + ' (' + r.access + ')'; }
};
function logAdmin(store, admin, camp, action, p, r) {
  if (!LOGGED[action]) return;
  store.insert('AdminLog', { ts: new Date().toISOString(), adminName: admin.name, adminPhone: admin.phone,
    campaignId: camp ? camp.id : '', campaignName: camp ? camp.name : '', action: action, details: LOGGED[action](r, p) });
}
function activity(store, campaignId) {
  return { activity: store.all('AdminLog').filter(function (l) { return !campaignId || l.campaignId === campaignId; }).slice(-200).reverse() };
}

/* auth = { master(password) -> bool, issue(admin) -> token, verify(token) -> admin or null } */
function dispatch(store, auth, action, p) {
  var open = { state: 1, login: 1, submit: 1, feed: 1 };
  if (action === 'myCampaigns') return myCampaigns(store, p.phone);
  if (action === 'adminLogin') return adminLogin(store, auth, p);
  if (open[action]) {
    var c0 = campaignView(findCampaign(store, p.campaignId));
    return createCore(scoped(store, c0.id), c0)[action](p);
  }
  var admin = auth.verify(p.token);
  if (!admin) throw new Error('AUTH');
  p._adminName = admin.name;   // set here, never trusted from the browser
  var r;
  if (action === 'campaigns') return { campaigns: visibleCampaigns(store, admin), admin: admin };
  if (action === 'allVolunteers') return allVolunteers(store);
  if (action === 'admins' || action === 'saveAdmin') {
    if (!admin.main) throw new Error('Only the main admin can manage admins');
    if (action === 'admins') return { admins: store.all('Admins').map(adminView) };
    p.isNew = !store.all('Admins').some(function (a) { return normPhone(a.phone) === normPhone(p.phone); });
    r = saveAdmin(store, admin, p); logAdmin(store, admin, null, action, p, r); return r;
  }
  if (action === 'saveCampaign') {
    var type = p.id ? campaignView(findCampaign(store, p.id)).type : (p.type === 'whatsapp' ? 'whatsapp' : 'call');
    if (!canSee(admin, type)) throw new Error('You do not have access to ' + (type === 'whatsapp' ? 'WhatsApp' : 'call') + ' campaigns');
    r = saveCampaign(store, p); logAdmin(store, admin, r, action, p, r); return r;
  }
  var camp = campaignView(findCampaign(store, p.campaignId));
  if (!canSee(admin, camp.type)) throw new Error('You do not have access to this campaign');
  if (action === 'activity') return activity(store, camp.id);
  var core = createCore(scoped(store, camp.id), camp);
  if (!core[action]) throw new Error('Unknown action ' + action);
  r = core[action](p);
  logAdmin(store, admin, camp, action, p, r);
  return r;
}
