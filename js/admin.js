(function () {
  var $ = function (s) { return document.querySelector(s); };
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  var A = { token: LS.get('icc_admin_token'), d: null, page: 0, sel: {}, upRows: null, editing: null, camps: [], camp: null, kEdit: null };
  var ST = STATUS, isWA = false;
  function W(n) { return isWA ? (n === 1 ? 'message' : 'messages') : (n === 1 ? 'call' : 'calls'); }
  var PAGE = 50;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, ms) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, ms || 3000); }
  function fmt(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }); }
  function call(action, p) {
    return api(action, Object.assign({ token: A.token }, A.camp ? { campaignId: A.camp.id } : {}, p || {})).catch(function (e) {
      if (e.message === 'AUTH') { logout(); throw new Error('Session expired, please log in again'); }
      throw e;
    });
  }

  /* login */
  if (window.isDemo) $('#aDemo').classList.remove('hidden');
  $('#pwBtn').onclick = function () {
    $('#pwErr').textContent = '';
    api('adminLogin', { phone: $('#aPhone').value, password: $('#pw').value }).then(function (r) {
      A.token = r.token; LS.set('icc_admin_token', r.token); LS.set('icc_admin_phone', normPhone($('#aPhone').value));
      setMe(r.admin); showCamps(r.campaigns);
    }).catch(function (e) { $('#pwErr').textContent = e.message; });
  };
  $('#aPhone').value = LS.get('icc_admin_phone') || '';
  $('#aPhone').onkeydown = function (e) { if (e.key === 'Enter') $('#pw').focus(); };
  var ACCESS = { whatsapp: '💬 WhatsApp only', call: '📞 Calls only', both: 'WhatsApp + Calls' };
  function setMe(me) {   // who is logged in, and what they may manage
    A.me = me;
    $('#meLine').textContent = 'Namaskaram, ' + me.name + (me.main ? (me.name === 'Main admin' ? '' : ' · Main admin') : ' · ' + ACCESS[me.access]);
    var all = me.main || me.access === 'both';   // only offer the campaign types this admin may create
    $('#kType').innerHTML = (all || me.access === 'whatsapp' ? '<option value="whatsapp">💬 WhatsApp messages</option>' : '') +
                            (all || me.access === 'call' ? '<option value="call">📞 Phone calls</option>' : '');
    kTypeChanged();
    $('#adminsCard').classList.toggle('hidden', !me.main);
    if (me.main) loadAdmins();
  }

  /* ---------- admins (main admin only) ---------- */
  function loadAdmins() {
    call('admins').then(function (r) {
      A.admins = r.admins;
      $('#adminsTbl').innerHTML = '<tr><th>Name</th><th>Mobile</th><th>Can manage</th><th>Added by</th><th></th></tr>' +
        (r.admins.length ? r.admins.map(function (a) {
          return '<tr class="' + (a.active ? '' : 'off') + '"><td><b>' + esc(a.name) + '</b>' + (a.active ? '' : ' (inactive)') + '</td><td>' + a.phone + '</td><td>' + ACCESS[a.access] + '</td><td>' + esc(a.createdBy) + '</td>' +
            '<td><button class="mini" data-adedit="' + a.phone + '">Edit</button></td></tr>';
        }).join('') : '<tr><td colspan="5" class="empty">No other admins yet</td></tr>');
    }).catch(function (e) { toast('⚠️ ' + e.message); });
  }
  function resetAdminForm() {
    A.adEdit = null; $('#adTitle').textContent = '➕ Add an admin'; $('#adSave').textContent = 'Add admin';
    ['#adName', '#adPhone', '#adPw'].forEach(function (x) { $(x).value = ''; }); $('#adPhone').disabled = false;
    $('#adPw').placeholder = 'At least 4 characters'; $('#adAccess').value = 'whatsapp';
    $('#adActiveRow').classList.add('hidden'); $('#adCancel').classList.add('hidden');
  }
  $('#adminsTbl').onclick = function (e) {
    var b = e.target.closest('[data-adedit]'); if (!b) return;
    var a = A.admins.filter(function (x) { return x.phone === b.dataset.adedit; })[0];
    A.adEdit = a; $('#adTitle').textContent = '✏️ Edit ' + a.name; $('#adSave').textContent = 'Save';
    $('#adName').value = a.name; $('#adPhone').value = a.phone; $('#adPhone').disabled = true; $('#adPw').value = '';
    $('#adPw').placeholder = 'Leave empty to keep the same password'; $('#adAccess').value = a.access; $('#adActive').checked = a.active;
    $('#adActiveRow').classList.remove('hidden'); $('#adCancel').classList.remove('hidden');
  };
  $('#adCancel').onclick = resetAdminForm;
  $('#adSave').onclick = function () {
    var b = this; b.disabled = true;
    var p = { name: $('#adName').value, phone: $('#adPhone').value, password: $('#adPw').value, access: $('#adAccess').value };
    if (A.adEdit) p.active = $('#adActive').checked;
    call('saveAdmin', p).then(function (a) {
      toast((A.adEdit ? 'Saved 🙏 ' : 'Admin added 🌸 ') + a.name + ' can log in with ' + a.phone, 4000);
      resetAdminForm(); loadAdmins();
    }).catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { b.disabled = false; });
  };
  $('#pw').onkeydown = function (e) { if (e.key === 'Enter') $('#pwBtn').click(); };
  function logout() { LS.set('icc_admin_token', null); A.token = null; A.camp = null; $('#aApp').classList.add('hidden'); $('#aCamps').classList.add('hidden'); $('#aLogin').classList.remove('hidden'); }
  $('#aOut').onclick = logout; $('#cOut').onclick = logout;

  /* ---------- campaigns ---------- */
  function niceD(d) { return d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''; }
  function showCamps(list) {
    if (list) A.camps = list;
    A.camp = null; A.d = null;
    $('#aLogin').classList.add('hidden'); $('#aApp').classList.add('hidden'); $('#aCamps').classList.remove('hidden');
    var rows = A.camps.slice().reverse();
    $('#campList').innerHTML = rows.length ? rows.map(function (c) {
      var wa = c.type === 'whatsapp';
      return '<div class="camp-card ' + (wa ? 'wa' : 'call') + (c.active ? '' : ' off') + '">' +
        '<span class="camp-ic">' + (wa ? '💬' : '📞') + '</span>' +
        '<span class="camp-body"><b>' + esc(c.name) + (c.active ? '' : ' (hidden)') + '</b><small>' + (wa ? 'WhatsApp' : 'Calls') + ' · ' + c.perDay + '/day · ' + niceD(c.startDate) + ' – ' + niceD(c.endDate) + '</small></span>' +
        '<span class="camp-btns"><button class="mini" data-kedit="' + esc(c.id) + '">Edit</button><button class="btn primary" data-open="' + esc(c.id) + '">Open</button></span></div>';
    }).join('') : '<p class="muted">No campaigns yet. Create your first one below 🌸</p>';
    resetCampForm();
  }
  function refreshCamps() {
    if (!A.me) call('campaigns').then(function (r) { setMe(r.admin); }).catch(function () {});
    call('allVolunteers').then(function (r) { A.vols = r.volunteers; renderVolPick(); }).catch(function () {});
    return call('campaigns').then(function (r) { showCamps(r.campaigns); });
  }
  /* existing volunteers: tick them while creating a campaign */
  A.vols = []; A.kSel = {};
  function renderVolPick() {
    var q = ($('#kVolQ').value || '').toLowerCase();
    $('#kVolsBox').classList.toggle('hidden', !A.vols.length || !!A.kEdit);
    $('#kVols').innerHTML = A.vols.filter(function (v) { return !q || (v.name + ' ' + v.phone).toLowerCase().indexOf(q) >= 0; }).map(function (v) {
      return '<label class="k-vol"><input type="checkbox" data-ph="' + v.phone + '" ' + (A.kSel[v.phone] ? 'checked' : '') + '> <span>' + esc(v.name) + ' <small class="muted">' + v.phone + '</small></span></label>';
    }).join('') || '<p class="muted tiny">Nobody matches</p>';
    $('#kCount').textContent = Object.keys(A.kSel).length ? ' · ' + Object.keys(A.kSel).length + ' selected' : '';
  }
  $('#kVolQ').oninput = renderVolPick;
  $('#kVols').onchange = function (e) { var p = e.target.dataset.ph; if (!p) return; if (e.target.checked) A.kSel[p] = 1; else delete A.kSel[p]; $('#kCount').textContent = Object.keys(A.kSel).length ? ' · ' + Object.keys(A.kSel).length + ' selected' : ''; };
  $('#kAll').onclick = function () { A.vols.forEach(function (v) { A.kSel[v.phone] = 1; }); renderVolPick(); };
  $('#campList').onclick = function (e) {
    var o = e.target.closest('[data-open]'), ed = e.target.closest('[data-kedit]');
    var id = (o || ed || {}).dataset; if (!id) return;
    var c = A.camps.filter(function (x) { return x.id === (o ? o.dataset.open : ed.dataset.kedit); })[0];
    if (o) openCamp(c); else editCamp(c);
  };
  function kTypeChanged() {
    var wa = $('#kType').value === 'whatsapp';
    [].forEach.call(document.querySelectorAll('.k-wa'), function (x) { x.classList.toggle('hidden', !wa); });
    [].forEach.call(document.querySelectorAll('.k-call'), function (x) { x.classList.toggle('hidden', wa); });
    $('#kPerLbl').textContent = wa ? 'Messages per volunteer per day' : 'Calls per volunteer per day';
    if (!A.kEdit) { $('#kPer').value = wa ? 30 : 2; if (wa && !$('#kMsg').value) $('#kMsg').value = window.CONFIG.WHATSAPP_TEMPLATE; }
    kCalc();
  }
  function kCalc() {   // how many volunteers a list needs
    var per = Number($('#kPer').value) || 0, s = $('#kStart').value, e = $('#kEnd').value;
    var days = s && e && e >= s ? daysBetween(s, e) + 1 : 0;
    $('#kCalc').textContent = per && days ? days + ' days × ' + per + ' a day = ' + per * days + ' contacts per volunteer. ' +
      'e.g. 5,000 contacts need ' + Math.ceil(5000 / (per * days)) + ' volunteers.' : '';
  }
  $('#kType').onchange = kTypeChanged; $('#kPer').oninput = kCalc; $('#kStart').onchange = kCalc; $('#kEnd').onchange = kCalc;
  function resetCampForm() {
    A.kEdit = null; $('#kTitle').textContent = '➕ New campaign'; $('#kSave').textContent = 'Create campaign';
    ['#kName', '#kMsg', '#kIntro', '#kIntroT'].forEach(function (x) { $(x).value = ''; });
    $('#kType').disabled = false; $('#kType').value = 'whatsapp';
    $('#kStart').value = istDay(); $('#kEnd').value = addDays(istDay(), 6);
    $('#kActiveRow').classList.add('hidden'); $('#kCancel').classList.add('hidden');
    A.kSel = {}; $('#kVolQ').value = ''; renderVolPick();
    kTypeChanged();
  }
  function editCamp(c) {
    A.kEdit = c; $('#kTitle').textContent = '✏️ Edit ' + c.name; $('#kSave').textContent = 'Save changes';
    $('#kName').value = c.name; $('#kType').value = c.type; $('#kType').disabled = true;
    $('#kPer').value = c.perDay; $('#kStart').value = c.startDate; $('#kEnd').value = c.endDate;
    $('#kMsg').value = c.message || ''; $('#kIntro').value = c.introDate || ''; $('#kIntroT').value = c.introTime || '';
    $('#kActive').checked = c.active; $('#kActiveRow').classList.remove('hidden'); $('#kCancel').classList.remove('hidden');
    renderVolPick(); kTypeChanged(); $('#campFormCard').scrollIntoView({ behavior: 'smooth' });
  }
  $('#kCancel').onclick = resetCampForm;
  $('#kSave').onclick = function () {
    var b = this; b.disabled = true;
    var p = { name: $('#kName').value, type: $('#kType').value, perDay: $('#kPer').value, startDate: $('#kStart').value, endDate: $('#kEnd').value,
              message: $('#kType').value === 'whatsapp' ? $('#kMsg').value : '', introDate: $('#kIntro').value, introTime: $('#kIntroT').value };
    if (A.kEdit) { p.id = A.kEdit.id; p.active = $('#kActive').checked; }
    else p.volunteers = A.vols.filter(function (v) { return A.kSel[v.phone]; });
    call('saveCampaign', p).then(function (c) {
      toast(A.kEdit ? 'Saved 🙏' : 'Campaign created 🌸 Now upload its contacts', 4000);
      var created = !A.kEdit;
      return refreshCamps().then(function () { if (created) openCamp(A.camps.filter(function (x) { return x.id === c.id; })[0]); });
    }).catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { b.disabled = false; });
  };
  $('#toCamps').onclick = function () { refreshCamps().catch(function (e) { toast('⚠️ ' + e.message); }); };

  function openCamp(c) {
    A.camp = c; isWA = c.type === 'whatsapp'; ST = statusOf(c.type);
    var C = window.CONFIG;
    C.CAMPAIGN_TITLE = c.name; C.CAMPAIGN_START_DATE = c.startDate; C.CAMPAIGN_END_DATE = c.endDate;
    document.body.classList.toggle('wa-mode', isWA);
    [].forEach.call(document.querySelectorAll('.perLbl'), function (x) { x.textContent = isWA ? 'Messages per day' : 'Calls per day'; });
    $('#cPer').value = c.perDay; $('#nPer').value = c.perDay;
    $('#fStatus').innerHTML = ''; A.sel = {}; A.page = 0; A.sumDay = null;
    $('#aCamps').classList.add('hidden'); $('#aApp').classList.remove('hidden');
    $('#aTitle').textContent = (isWA ? '💬 ' : '📞 ') + c.name + (window.isDemo ? ' · DEMO' : '');
    load().then(function () {   // a new, empty campaign: go straight to uploading its contacts
      var tab = A.d && !A.d.counts.total ? 'upload' : 'callers';
      document.querySelector('.a-tabs [data-t="' + tab + '"]').click();
    });
  }
  function load() {
    if (!A.camp) return Promise.resolve();
    return call('adminData').then(function (d) { A.d = d; renderAll(); }).catch(function (e) { toast('⚠️ ' + e.message); });
  }
  $('#refresh').onclick = function () { load().then(function () { toast('Refreshed'); }); };
  setInterval(function () { if (A.token && A.camp && !document.hidden && !$('#aApp').classList.contains('hidden')) load(); }, 60000);

  document.querySelector('.a-tabs').onclick = function (e) {
    var b = e.target.closest('button'); if (!b) return;
    [].forEach.call(document.querySelectorAll('.a-tabs button'), function (x) { x.classList.toggle('on', x === b); });
    ['dash', 'callers', 'contacts', 'upload'].forEach(function (t) { $('#t-' + t).classList.toggle('hidden', t !== b.dataset.t); });
  };

  /* daily WhatsApp summary */
  function summaryText(day) {
    var d = (A.d.daily || {})[day] || { calls: 0, connects: 0, intros: 0, regs: 0, extra: [], regBy: [] };
    if (isWA) return waSummary(day, d);
    var start = window.CONFIG.CAMPAIGN_START_DATE, n = start ? daysBetween(start, day) + 1 : 0;
    var nice = new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    var lines = ['🌸 *Karma Sadhana – ' + (n > 0 ? 'Day ' + n + ' · ' : '') + nice + '* 🌸', '',
      'Namaskaram everyone 🙏', '',
      '📞 ' + d.calls + ' calls made', '🗣️ ' + d.connects + ' conversations', '🌼 ' + d.intros + ' will join the intro', '🎉 ' + d.regs + ' registrations'];
    if (d.regBy.length) lines.push('', '👏 Registrations by ' + d.regBy.join(', ') + ' – Jai!');
    if (d.extra.length) lines.push('✨ Heartfelt thanks to ' + d.extra.join(', ') + ' for going the extra mile');
    var c = A.d.counts, reached = A.d.contacts.filter(function (x) { return x.status; }).length;
    lines.push('', 'Together we have now reached out to ' + reached + ' of ' + c.total + ' people 🌸', 'Thank you for offering your time. Let’s keep going today 🙏');
    return lines.join('\n');
  }
  function waSummary(day, d) {
    var start = window.CONFIG.CAMPAIGN_START_DATE, n = start ? daysBetween(start, day) + 1 : 0;
    var nice = new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    var c = A.d.counts, reached = A.d.contacts.filter(function (x) { return x.status; }).length;
    var lines = ['🌸 *' + A.camp.name + ' – ' + (n > 0 ? 'Day ' + n + ' · ' : '') + nice + '* 🌸', '', 'Namaskaram everyone 🙏', '',
      '💬 ' + d.connects + ' ' + W(d.connects) + ' sent'];
    var vols = A.d.callers.filter(function (v) { return v.todayDone || v.todayDials; }).length;
    if (day === istDay() || vols) lines.push('👥 ' + vols + (vols === 1 ? ' volunteer' : ' volunteers') + ' offered their time today');
    if (d.extra.length) lines.push('', '✨ Heartfelt thanks to ' + d.extra.join(', ') + ' for going the extra mile');
    lines.push('', 'Together we have now reached out to ' + reached + ' of ' + c.total + ' people 🌸', 'Thank you for offering your time. Let’s keep going today 🙏');
    return lines.join('\n');
  }
  function showSummary(day) { A.sumDay = day; $('#sumText').value = summaryText(day); }
  $('#sumYday').onclick = function () { showSummary(addDays(istDay(), -1)); };
  $('#sumToday').onclick = function () { showSummary(istDay()); };
  $('#sumCopy').onclick = function () {
    var t = $('#sumText'); t.select();
    (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(function () { toast('Copied 🙏 Paste it in the group'); })
      .catch(function () { try { document.execCommand('copy'); toast('Copied 🙏'); } catch (e) { toast('Select the text and copy it'); } });
  };
  $('#sumWa').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent($('#sumText').value), '_blank'); };

  function renderAll() { if (!A.sumDay) showSummary(addDays(istDay(), -1)); renderDash(); loadActivity(); renderCallers(); renderContacts(); updatePreview(); fillCallerSelects(); }
  function callerName(p) { var c = A.d.callers.filter(function (x) { return x.phone === p; })[0]; return c ? c.name : p; }

  function loadActivity() {
    call('activity').then(function (r) {
      $('#adminAct').innerHTML = r.activity.slice(0, 60).map(function (l) {
        return '<li><span class="fi">🗂️</span><div><b>' + esc(l.adminName) + '</b>: ' + esc(l.details) + '<time>' + fmt(l.ts) + '</time></div></li>';
      }).join('') || '<li class="empty">Nothing yet</li>';
    }).catch(function () {});
  }

  /* dashboard */
  function renderDash() {
    var d = A.d, c = d.counts;
    var todayDials = d.callers.reduce(function (s, v) { return s + v.todayDials; }, 0);
    var remaining = c.fresh + d.contacts.filter(function (x) { return x.assignedTo && !x.status; }).length;
    var eta = d.dailyCapacity ? Math.ceil(remaining / d.dailyCapacity) : '—';
    $('#kpis').innerHTML = [
      [c.total, 'contacts in list'], [c.total - remaining, isWA ? 'contacted' : 'called at least once'], [remaining, isWA ? 'not messaged yet' : 'not called yet'],
      [todayDials, isWA ? 'messages today' : 'dials today']].concat(isWA ? [[c.sent || 0, 'sent ✅', 'gold'], [(c.no_whatsapp || 0) + (c.wrong_number || 0), 'no WhatsApp / wrong no.']]
      : [[c.intro, 'will join intro'], [c.registered + ' 🎉', 'registered', 'gold']]).concat([
      [d.dailyCapacity + '/day', 'team capacity'], [eta + (eta === '—' ? '' : ' days'), 'to finish at this pace']
    ]).map(function (k) { return '<div class="kpi ' + (k[2] || '') + '"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join('');
    var max = Math.max(1, Math.max.apply(null, Object.keys(ST).map(function (k) { return c[k] || 0; })));
    $('#bars').innerHTML = Object.keys(ST).map(function (k) {
      return '<div class="bar"><span>' + ST[k].emoji + ' ' + ST[k].label + '</span><div class="track"><div class="fill" style="width:' + (100 * (c[k] || 0) / max) + '%"></div></div><span class="n">' + (c[k] || 0) + '</span></div>';
    }).join('') + '<p class="muted tiny" style="margin:8px 0 0">' + c.unreachable + ' contacts did not pick up after 3 tries.</p>';
    var rows = d.callers.slice().sort(function (a, b) { return (b.active - a.active) || (a.todayDone / a.perDay) - (b.todayDone / b.perDay); });
    if (!$('#dashCallers').contains(document.activeElement)) $('#dashCallers').innerHTML = '<tr><th>Caller</th><th>Follow-up</th><th>Today</th><th class="num">Dials</th><th class="num">Total</th><th class="num">Intro</th><th class="num">Reg</th><th class="num">Days left</th></tr>' +
      (rows.length ? rows.map(function (v) {
        var pct = Math.min(100, 100 * v.todayDone / v.perDay);
        return '<tr class="' + (v.active ? '' : 'off') + '"><td><b>' + esc(v.name) + '</b><br><span class="muted">' + v.phone + '</span>' +
          '<div class="c-acts"><a class="call" href="tel:+91' + v.phone + '">📞 Call</a><a class="wa" target="_blank" rel="noopener" href="https://wa.me/91' + v.phone + '?text=' + encodeURIComponent(nudgeText(v)) + '">💬 WhatsApp</a></div></td>' +
          '<td class="fu-cell" data-phone="' + v.phone + '"><div class="' + (v.followedBy ? 'fu-last' : 'fu-last none') + '">' + (v.followedBy ? '✅ ' + esc(v.followedBy) + ' · ' + shortDay(v.followedAt) : 'Not followed up yet') + '</div>' +
          '<div class="fu-form"><input class="fu-by" placeholder="Your name" value="' + esc(LS.get('icc_admin_name') || (A.me ? A.me.name : '')) + '"><input class="fu-date" type="date" value="' + istDay() + '"><button class="mini fu-save" title="Save follow-up">✓</button></div></td>' +
          '<td>' + v.todayDone + '/' + v.perDay + '<span class="bar-mini"><i style="width:' + pct + '%"></i></span></td><td class="num">' + v.todayDials + '</td><td class="num">' + v.dials + '</td>' +
          '<td class="num">' + v.intros + '</td><td class="num">' + v.regs + '</td><td class="num">' + v.daysLeft + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty">No volunteers yet — add them in the Volunteers tab</td></tr>');
    $('#recent').innerHTML = d.log.slice(0, 40).map(function (l) {
      var s = ST[l.status] || { emoji: '', label: l.status };
      return '<li><span class="fi">' + s.emoji + '</span><div><b>' + esc(callerName(normPhone(l.callerPhone)) || l.callerName) + '</b> → ' + esc(l.contactName) + ': ' + esc(s.label) +
        (l.milestone === 'extra' ? ' ✨ extra' : l.milestone === 'update' ? ' <span class="muted">(updated)</span>' : '') + (l.notes ? ' <span class="muted">“' + esc(l.notes) + '”</span>' : '') + '<time>' + fmt(l.ts) + '</time></div></li>';
    }).join('') || '<li class="empty">Nothing yet</li>';
  }

  function shortDay(d) { return d ? Number(d.slice(8, 10)) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(d.slice(5, 7)) - 1] : ''; }
  $('#dashCallers').onclick = function (e) {   // admin logs a follow-up with a caller
    var b = e.target.closest('.fu-save'); if (!b) return;
    var td = b.closest('.fu-cell'), by = td.querySelector('.fu-by').value.trim(), date = td.querySelector('.fu-date').value;
    if (!by) { toast('Please type your name'); return; }
    LS.set('icc_admin_name', by); b.disabled = true;
    call('markFollow', { phone: td.dataset.phone, by: by, date: date }).then(function (r) {
      td.querySelector('.fu-last').className = 'fu-last'; td.querySelector('.fu-last').textContent = '✅ ' + r.followedBy + ' · ' + shortDay(r.followedAt);
      b.blur(); toast('Follow-up saved 🙏'); return load();
    }).catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { b.disabled = false; });
  };
  $('#syncAll').onclick = function () {
    var b = this; b.disabled = true;
    call('syncAll').then(function (r) { toast('Synced 🙏 ' + r.unassigned + ' contacts unassigned'); return load(); })
      .catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { b.disabled = false; });
  };
  function nudgeText(v) {   // warm check-in message from the admin to a caller
    var n = firstName(v.name), left = v.perDay - v.todayDone;
    return left > 0
      ? 'Namaskaram ' + n + ' 🙏\n\nHope you are doing well. A gentle reminder for today’s Karma Sadhana ' + W(2) + ': ' + v.todayDone + ' of ' + v.perDay + ' done, ' + left + ' more to go 🌸\n\nThank you for offering your time to make this happen.'
      : 'Namaskaram ' + n + ' 🙏\n\nYou have completed today’s Karma Sadhana ' + W(2) + ' 🌸 Thank you so much for your offering!';
  }

  /* callers */
  function renderCallers() {
    var rows = A.d.callers;
    $('#callersTbl').innerHTML = '<tr><th>Name</th><th>Phone</th><th class="num">Per day</th><th class="num">Days left</th><th>Ends</th><th class="num">Open now</th><th class="num">Assigned (left)</th><th>Added by</th><th></th></tr>' +
      (rows.length ? rows.map(function (v) {
        return '<tr class="' + (v.active ? '' : 'off') + '"><td><b>' + esc(v.name) + '</b>' + (v.active ? '' : ' (inactive)') + '</td><td>' + v.phone + '</td><td class="num">' + v.perDay + '</td><td class="num">' + v.daysLeft + '</td><td>' + esc(v.endDate) + '</td>' +
          '<td class="num">' + v.inHand + '</td><td class="num">' + v.reserved + '</td><td>' + esc(v.addedBy) + '</td><td><button class="mini" data-edit="' + v.phone + '">Edit</button></td></tr>';
      }).join('') : '<tr><td colspan="9" class="empty">No volunteers yet</td></tr>');
  }
  $('#callersTbl').onclick = function (e) {
    var b = e.target.closest('[data-edit]'); if (!b) return;
    var v = A.d.callers.filter(function (x) { return x.phone === b.dataset.edit; })[0];
    A.editing = v; $('#eTitle').textContent = v.name + ' · ' + v.phone;
    $('#eName').value = v.name; $('#ePhone').value = v.phone; $('#ePer').value = v.perDay; $('#eDays').value = v.daysLeft; $('#eActive').checked = v.active;
    $('#editWrap').classList.remove('hidden');
  };
  $('#eCancel').onclick = function () { $('#editWrap').classList.add('hidden'); };
  $('#eSave').onclick = function () {
    var v = A.editing;
    call('saveCaller', { phone: v.phone, newPhone: $('#ePhone').value, name: $('#eName').value, perDay: $('#ePer').value, days: $('#eDays').value, active: $('#eActive').checked, startDate: v.startDate || window.CONFIG.CAMPAIGN_START_DATE })
      .then(function (r) { $('#editWrap').classList.add('hidden'); toast(normPhone($('#ePhone').value) !== v.phone ? 'Saved 🙏 Ask the volunteer to log in with the new number' : 'Saved 🙏 ' + r.reserved + ' contacts assigned', 5000); return load(); }).catch(function (e) { toast('⚠️ ' + e.message); });
  };
  function startDay() { var s = window.CONFIG.CAMPAIGN_START_DATE, t = istDay(); return s > t ? s : t; }
  function autoDays() { return Math.max(0, daysBetween(startDay(), window.CONFIG.CAMPAIGN_END_DATE) + 1); }
  function niceDate(d) { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function updatePreview() {
    if (!A.d) return;
    var days = $('#cDays').value === '' ? autoDays() : Number($('#cDays').value);
    $('#cDays').placeholder = 'Auto: ' + autoDays() + (autoDays() === 1 ? ' day (' : ' days (') + niceDate(startDay()) + ' – ' + niceDate(window.CONFIG.CAMPAIGN_END_DATE) + ')';
    var n = Number($('#cPer').value) * days;
    $('#assignPreview').textContent = '→ ' + $('#cPer').value + ' ' + W(2) + ' × ' + days + ' days = ' + n + ' contacts will be assigned' +
      (n > A.d.counts.unassigned ? ' (not enough left, so the list will be split fairly with the other volunteers)' : '');
    var cap = A.d.dailyCapacity, rem = A.d.counts.unassigned;
    $('#poolInfo').innerHTML = '<b>' + rem + '</b> of ' + A.d.counts.total + ' contacts are not yet assigned to any volunteer.' +
      (rem && Number($('#cPer').value) && autoDays() ? ' That needs about <b>' + Math.ceil(rem / (Number($('#cPer').value) * autoDays())) + '</b> more volunteers at this pace.' : '');
  }
  $('#cPer').oninput = updatePreview;
  $('#cPick').onchange = function () {
    var v = A.vols.filter(function (x) { return x.phone === $('#cPick').value; })[0];
    $('#cName').value = v ? v.name : ''; $('#cPhone').value = v ? v.phone : '';
  }; $('#cDays').oninput = updatePreview;
  $('#cSave').onclick = function () {
    var b = $('#cSave'), phone = normPhone($('#cPhone').value);
    var days = $('#cDays').value === '' ? autoDays() : $('#cDays').value;
    b.disabled = true;
    call('saveCaller', { name: $('#cName').value, phone: phone, perDay: $('#cPer').value, days: days, startDate: window.CONFIG.CAMPAIGN_START_DATE })
      .then(function (r) {
        toast((r.created ? 'Volunteer added 🌸 ' : 'Volunteer updated 🙏 ') + r.reserved + ' contacts assigned', 4000);
        if (!A.vols.some(function (v) { return v.phone === phone; })) A.vols.push({ name: $('#cName').value || phone, phone: phone });
        ['#cName', '#cPhone', '#cDays'].forEach(function (s) { $(s).value = ''; }); $('#cPer').value = A.camp.perDay;
        return load();
      }).catch(function (e) { toast('⚠️ ' + e.message); }).then(function () { b.disabled = false; });
  };

  function fillCallerSelects() {
    var inCamp = {}; A.d.callers.forEach(function (v) { inCamp[v.phone] = 1; });
    $('#cPick').innerHTML = '<option value="">— new volunteer —</option>' + A.vols.filter(function (v) { return !inCamp[v.phone]; })
      .map(function (v) { return '<option value="' + v.phone + '">' + esc(v.name) + ' · ' + v.phone + '</option>'; }).join('');
    var opts = A.d.callers.filter(function (v) { return v.active; }).map(function (v) { return '<option value="' + v.phone + '">' + esc(v.name) + '</option>'; }).join('');
    $('#bulkTo').innerHTML = '<option value="">— anyone (pool) —</option>' + opts;
    var keep = $('#uFor').value;
    $('#uFor').innerHTML = '<option value="">— everyone (common pool) —</option><option value="__new">➕ A new volunteer…</option>' + opts;
    if (keep) $('#uFor').value = keep;
    $('#nDays').placeholder = $('#cDays').placeholder;
    if (!$('#fStatus').options.length) {
      $('#fStatus').innerHTML = '<option value="all">All statuses</option><option value="fresh">' + (isWA ? 'Not messaged yet' : 'Not called yet') + '</option><option value="inhand">With a volunteer now</option><option value="notreached">Not reached</option>' + (isWA ? '' : '<option value="unreach">Unreachable (3 tries)</option>') +
        Object.keys(ST).map(function (k) { return '<option value="' + k + '">' + ST[k].emoji + ' ' + ST[k].label + '</option>'; }).join('');
    }
  }

  /* contacts */
  function filtered() {
    var q = $('#q').value.trim().toLowerCase(), f = $('#fStatus').value || 'all';
    return A.d.contacts.filter(function (x) {
      if (f === 'fresh' && x.status) return false;
      if (f === 'inhand' && !x.assignedTo) return false;
      if (f === 'unreach' && !(x.status === 'no_answer' && x.attempts >= 3)) return false;
      if (f === 'notreached' && !notReached(x)) return false;
      if (ST[f] && x.status !== f) return false;
      if (q && (x.name + ' ' + x.phone + ' ' + x.programs + ' ' + x.email).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderContacts() {
    var list = filtered(), pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (A.page >= pages) A.page = pages - 1;
    var rows = list.slice(A.page * PAGE, A.page * PAGE + PAGE);
    $('#contactsTbl').innerHTML = '<tr><th><input type="checkbox" id="selAll"></th><th>Name</th><th>Phone</th><th>Programs</th><th>Status</th><th>Volunteer</th><th>Notes</th></tr>' +
      rows.map(function (x) {
        var s = ST[x.status];
        var who = x.assignedTo ? '📞 ' + callerName(x.assignedTo) : x.calledBy ? callerName(x.calledBy) : x.reservedFor ? '📌 ' + callerName(x.reservedFor) : '<span class="muted">pool</span>';
        return '<tr><td><input type="checkbox" data-id="' + esc(x.id) + '" ' + (A.sel[x.id] ? 'checked' : '') + '></td><td><b>' + esc(x.name) + '</b><br><span class="muted">' + esc(x.email) + '</span></td><td>' + x.phone + '</td><td>' + esc(x.programs) + '</td>' +
          '<td>' + (s ? '<span class="spill ' + x.status + '">' + s.emoji + ' ' + s.label + '</span>' + (x.attempts > 1 ? ' ×' + x.attempts : '') : '<span class="muted">' + (isWA ? 'not messaged' : 'not called') + '</span>') + (x.lastCalledAt ? '<br><span class="muted">' + fmt(x.lastCalledAt) + '</span>' : '') + '</td>' +
          '<td>' + who + '</td><td>' + esc(x.notes) + '</td></tr>';
      }).join('');
    $('#pager').innerHTML = '<button id="pPrev">‹</button><span>' + (A.page + 1) + ' / ' + pages + ' · ' + list.length + ' contacts</span><button id="pNext">›</button>';
    $('#pPrev').onclick = function () { if (A.page > 0) { A.page--; renderContacts(); } };
    $('#pNext').onclick = function () { if (A.page < pages - 1) { A.page++; renderContacts(); } };
    $('#selAll').onchange = function (e) { rows.forEach(function (x) { if (e.target.checked) A.sel[x.id] = 1; else delete A.sel[x.id]; }); renderContacts(); };
    $('#selCount').textContent = Object.keys(A.sel).length + ' selected';
  }
  $('#contactsTbl').onchange = function (e) {
    var id = e.target.dataset && e.target.dataset.id; if (!id) return;
    if (e.target.checked) A.sel[id] = 1; else delete A.sel[id];
    $('#selCount').textContent = Object.keys(A.sel).length + ' selected';
  };
  $('#q').oninput = function () { A.page = 0; renderContacts(); };
  $('#fStatus').onchange = function () { A.page = 0; renderContacts(); };
  function bulk(reset) {
    var ids = Object.keys(A.sel); if (!ids.length) return toast('Select contacts first');
    call('assignContacts', { ids: ids, phone: $('#bulkTo').value, reset: reset }).then(function (r) {
      A.sel = {}; toast(r.updated + ' contacts ' + (reset ? 'put back to call again' : 'assigned')); return load();
    }).catch(function (e) { toast('⚠️ ' + e.message); });
  }
  $('#bulkAssign').onclick = function () { bulk(false); };
  $('#bulkReset').onclick = function () { bulk(true); };
  function notReached(x) { return !x.status || missed(x.status); }
  function downloadCsv(list, file) {
    var cols = ['name', 'phone', 'email', 'programs', 'status', 'attempts', 'lastCalledAt', 'calledBy', 'notes'];
    var head = ['Name', 'Phone', 'Email', 'Programs', 'Status', 'Tries', 'Last contacted', 'Volunteer', 'Notes'];
    var lines = [head.join(',')].concat(list.map(function (x) {
      return cols.map(function (c) {
        var v = x[c];
        if (c === 'status') v = ST[v] ? ST[v].label : 'Not contacted';
        if (c === 'calledBy') v = v ? callerName(v) : '';
        if (c === 'lastCalledAt') v = fmt(v);
        return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      }).join(',');
    }));
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' }));
    a.download = A.camp.name.replace(/[^\w-]+/g, '-') + '-' + file + '-' + istDay() + '.csv'; a.click();
  }
  $('#dlCsv').onclick = function () { downloadCsv(filtered(), 'contacts'); };
  $('#dlNotReached').onclick = function () {
    var list = A.d.contacts.filter(notReached);
    downloadCsv(list, 'not-reached'); toast(list.length + ' people not reached — downloaded');
  };

  /* upload */
  function pick(headers, tests) {
    for (var t = 0; t < tests.length; t++) for (var i = 0; i < headers.length; i++) if (tests[t].test(headers[i])) return headers[i];
    return null;
  }
  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      if (!window.XLSX) throw new Error('Excel reader did not load — check your internet connection');
      var wb = XLSX.read(buf, { type: 'array' });
      var raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      if (!raw.length) throw new Error('The file is empty');
      var h = Object.keys(raw[0]).map(function (k) { return k; }), low = function (re) { return { test: function (k) { return re.test(k.toLowerCase().trim()); } }; };
      var cn = pick(h, [low(/^name$/), low(/full ?name/), low(/name/)]);
      var cp = pick(h, [low(/^phone( number)?$/), low(/mobile/), low(/phone/), low(/whatsapp/), low(/contact/)]);
      var ce = pick(h, [low(/e-?mail/)]);
      var cg = pick(h, [low(/^programs?$/), low(/program/)]);
      if (!cp) throw new Error('Could not find a Phone column. Found: ' + h.join(', '));
      var extra = ($('#uProg') && $('#uProg').value.trim()) || '';
      return raw.map(function (r) {
        var progs = cg === 'Program Tags' ? '' : String(r[cg] || '');
        if (extra) progs = progs ? progs + ', ' + extra : extra;
        return { name: cn ? r[cn] : '', phone: r[cp], email: ce ? r[ce] : '', programs: progs };
      });
    });
  }
  $('#uFile').onchange = function () {
    var f = $('#uFile').files[0]; A.upRows = null; $('#uGo').disabled = true; $('#uResult').textContent = '';
    if (!f) return;
    $('#uPreview').textContent = 'Reading…';
    readFile(f).then(function (rows) {
      A.upRows = rows; $('#uGo').disabled = false;
      $('#uPreview').innerHTML = '<p><b>' + rows.length + '</b> rows found. First: ' + esc(rows[0].name) + ' · ' + esc(rows[0].phone) + ' · ' + esc(rows[0].programs) + '</p>';
    }).catch(function (e) { $('#uPreview').textContent = '⚠️ ' + e.message; });
  };
  $('#uProg').oninput = function () { if ($('#uFile').files[0]) $('#uFile').onchange(); };
  $('#uFor').onchange = function () { $('#uNew').classList.toggle('hidden', $('#uFor').value !== '__new'); };
  $('#uGo').onclick = function () {
    if (!A.upRows) return;
    var b = $('#uGo'), to = $('#uFor').value, first = Promise.resolve();
    var toName = to === '__new' ? $('#nName').value : to ? callerName(to) : '';
    if (to === '__new') {
      to = normPhone($('#nPhone').value);
      first = call('saveCaller', { name: $('#nName').value, phone: to, perDay: $('#nPer').value,
        days: $('#nDays').value === '' ? autoDays() : $('#nDays').value, startDate: window.CONFIG.CAMPAIGN_START_DATE, skipAssign: true });
    }
    b.disabled = true; b.textContent = 'Uploading…';
    first.then(function () { return call('uploadContacts', { rows: A.upRows, reservedFor: to }); }).then(function (r) {
      $('#uResult').textContent = '✅ ' + r.added + ' new contacts added, ' + r.merged + ' duplicates merged, ' + r.skipped + ' skipped. Total now ' + r.total + '.' +
        (toName ? ' They are given to ' + toName + '.' : '');
      if ($('#uFor').value === '__new') toast('Volunteer ' + $('#nName').value + ' added 🌸', 4000);
      ['#uFile', '#nName', '#nPhone', '#nDays'].forEach(function (s) { $(s).value = ''; });
      $('#uFor').value = to; $('#uNew').classList.add('hidden'); A.upRows = null; return load();
    }).catch(function (e) { toast('⚠️ ' + e.message, 5000); }).then(function () { b.textContent = 'Upload'; b.disabled = !A.upRows; });
  };

  if (A.token) refreshCamps().catch(function () {});
})();
