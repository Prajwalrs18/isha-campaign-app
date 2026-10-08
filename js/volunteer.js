(function () {
  var C = window.CONFIG;
  var $ = function (s) { return document.querySelector(s); };
  var S = { phone: null, st: null, sel: null, busy: false, lastSeen: null, camps: [], camp: null, isWA: false };
  var ST = STATUS;   // this campaign's result buttons (calls or WhatsApp)
  var DEFAULT_WA = C.WHATSAPP_TEMPLATE;
  // "call"/"calls" or "message"/"messages", depending on the campaign
  function W(n) { return S.isWA ? (n === 1 ? 'message' : 'messages') : (n === 1 ? 'call' : 'calls'); }
  function squad() { return S.isWA ? 'The messaging squad' : 'The calling squad'; }
  function withCamp(p) { return Object.assign({ phone: S.phone, campaignId: S.camp.id }, p || {}); }
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  var ICON_PHONE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.2-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 5 5 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function niceDate(d) { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function dayOneText(start) {
    var d = daysBetween(istDay(), start);
    return 'Day 1 ' + (d === 1 ? 'starts tomorrow' : 'starts on ' + niceDate(start)) + ' 🌸';
  }
  // contacts uploaded without a name
  function nameOf(c) { return c.name ? esc(c.name) : '<span class="muted">Name not given</span>'; }
  function quote() { return C.QUOTES[Math.floor(Math.random() * C.QUOTES.length)]; }
  function titleFirst(n) { var f = firstName(n).toLowerCase(); return f.charAt(0).toUpperCase() + f.slice(1); }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago';
  }
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2800);
  }
  function telLink(p) { return 'tel:' + (p.length === 10 ? '+91' + p : p); }
  function waLink(c) {
    var p = c.phone.length === 10 ? '91' + c.phone : c.phone;
    var txt = C.WHATSAPP_TEMPLATE
      .replace(c.programs ? '{programs}' : ' ({programs})', c.programs || '')
      .replace(titleFirst(c.name) ? '{name}' : ' {name}', titleFirst(c.name)).replace('{caller}', titleFirst(S.st.caller.name));
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(txt);
  }

  /* backgrounds */
  var bgI = 0, bgFlip = false;
  function rotateBg() {
    var el = bgFlip ? $('#bgA') : $('#bgB'), other = bgFlip ? $('#bgB') : $('#bgA');
    el.style.backgroundImage = 'url(' + C.BACKGROUNDS[bgI % C.BACKGROUNDS.length] + ')';
    el.classList.add('show'); other.classList.remove('show');
    bgI++; bgFlip = !bgFlip;
  }

  /* login */
  function initLogin() {
    $('#campTitle').textContent = C.CAMPAIGN_TITLE; $('#sectorName').textContent = C.SECTOR;
    $('#loginQuote').textContent = quote();
    if (window.isTest) {
      var tb = document.createElement('div');
      tb.textContent = '🧪 TEST MODE — practice only, nothing is saved to the sheet. Calls go to your own number.';
      tb.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:95;background:#1F8A4C;color:#fff;font:600 12px Poppins,sans-serif;padding:6px 10px;text-align:center';
      document.body.appendChild(tb); document.body.style.paddingTop = tb.offsetHeight + 'px';
    }
    FX.ambient(true);
    var saved = LS.get('icc_phone');
    if (saved) { $('#phoneIn').value = saved; }
    $('#loginBtn').onclick = function () { login(); };
    $('#phoneIn').onkeydown = function (e) { if (e.key === 'Enter') login(); };
    // Phones with little memory reload the page after a call: go straight back in, no need to log in again
    if (saved && normPhone(saved).length === 10) login(true);
  }
  function login(resume) {
    if (!resume) FX.unlockAudio();
    var p = normPhone($('#phoneIn').value);
    $('#loginErr').textContent = '';
    if (p.length !== 10) { $('#loginErr').textContent = 'Please enter your 10-digit mobile number'; return; }
    var b = $('#loginBtn'); b.disabled = true; b.textContent = 'Opening…';
    api('myCampaigns', { phone: p }).then(function (r) {
      S.phone = p; S.camps = r.campaigns; LS.set('icc_phone', p);
      var last = LS.get('icc_camp_' + p), only = S.camps.length === 1 ? S.camps[0] : null;
      var again = resume && S.camps.filter(function (c) { return c.id === last; })[0];
      if (only || again) return openCampaign(only || again, resume);
      showPicker();
    }).catch(function (e) {
      $('#loginErr').textContent = e.message;
    }).then(function () { b.disabled = false; b.textContent = 'Begin my Karma Sadhana 🌸'; });
  }

  /* campaign picker: every campaign this volunteer is part of */
  function showPicker() {
    $('#login').classList.add('hidden'); $('#app').classList.add('hidden'); $('#pick').classList.remove('hidden');
    $('#pickHello').textContent = 'Namaskaram 🙏';
    $('#pickList').innerHTML = S.camps.map(function (c) {
      var wa = c.type === 'whatsapp';
      return '<button class="camp-card ' + (wa ? 'wa' : 'call') + '" data-id="' + esc(c.id) + '">' +
        '<span class="camp-ic">' + (wa ? ICON_CHAT : ICON_PHONE) + '</span>' +
        '<span class="camp-body"><b>' + esc(c.name) + '</b><small>' + (wa ? 'WhatsApp messages' : 'Phone calls') + ' · ' + niceDate(c.startDate) + ' – ' + niceDate(c.endDate) + '</small>' +
        '<small class="camp-left">' + (c.live ? (c.left ? c.left + ' left to ' + (wa ? 'send' : 'call') : 'All done 🌸') : (c.startDate > istDay() ? 'Starts ' + niceDate(c.startDate) : 'Ended')) + '</small></span>' +
        '<span class="camp-go">›</span></button>';
    }).join('');
  }
  $('#pickList').onclick = function (e) {
    var b = e.target.closest('[data-id]'); if (!b || b.disabled) return;
    var c = S.camps.filter(function (x) { return x.id === b.dataset.id; })[0];
    b.disabled = true; b.classList.add('loading');
    openCampaign(c).then(function () { b.disabled = false; b.classList.remove('loading'); });
  };
  $('#pickOut').onclick = function () { LS.set('icc_phone', null); location.reload(); };

  function openCampaign(c, resume) {
    S.camp = c; S.isWA = c.type === 'whatsapp'; ST = statusOf(c.type);
    C.CAMPAIGN_TITLE = c.name; C.CAMPAIGN_START_DATE = c.startDate; C.CAMPAIGN_END_DATE = c.endDate;
    C.WHATSAPP_TEMPLATE = c.message || DEFAULT_WA; C.INTRO_DATE = c.introDate || ''; C.INTRO_TIME = c.introTime || '';
    FEED_TXT.extra[1] = ' went the <b>extra mile</b> with one more ' + W(1);
    document.body.classList.toggle('wa-mode', S.isWA);
    $('#tabMainIc').textContent = S.isWA ? '💬' : '📞'; $('#tabMainTx').textContent = S.isWA ? 'Send' : 'Call';
    $('#tabListTx').firstChild.textContent = S.isWA ? 'My list' : 'Follow-ups';
    $('#switchBtn').classList.toggle('hidden', S.camps.length < 2);
    if (!S.fuHelp) S.fuHelp = $('#fuHelp').textContent;
    $('#fuHead').textContent = S.isWA ? '📋 My list' : '📌 My follow-ups';
    $('#fuHelp').textContent = S.isWA ? 'Everyone you have messaged, by result. You can message again or change the result here.' : S.fuHelp;
    S.sel = null; S.note = ''; S.fuTabPicked = false;
    return api('state', withCamp()).then(function (st) {
      S.st = st; LS.set('icc_camp_' + S.phone, c.id);
      S.lastSeen = LS.get('icc_lastSeen_' + S.phone + '_' + c.id) || (st.feed[0] && st.feed[0].ts) || new Date().toISOString();
      $('#pick').classList.add('hidden');
      if (resume || S.started) { $('#login').classList.add('hidden'); enterApp(); } else showWelcome();
    }).catch(function (e) { if (!numberGone(e)) toast('⚠️ ' + e.message, 4000); });
  }
  function showWelcome() {
    var st = S.st, left = st.today.target - st.today.done;
    $('#wName').textContent = st.caller.name;
    $('#wLine').textContent = st.caller.notStarted ? dayOneText(st.caller.startDate) + ' Get ready!'
      : st.over ? 'Thank you for your Karma Sadhana 🙏'
      : 'Thank you for offering your time to make this happen 🙏';
    $('#wQuote').textContent = quote();
    $('#welcome').classList.remove('hidden');
    $('#login').classList.add('hidden'); FX.shower(35); FX.chime();
    $('#wGo').onclick = enterApp;
  }
  function enterApp() {
    $('#welcome').classList.add('hidden');
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    document.querySelector('.tabs [data-v="home"]').click();
    render();
    if (S.started) return;   // switching campaign: timers are already running
    S.started = true;
    FX.ambient(false);
    rotateBg(); setInterval(rotateBg, 12000);
    setInterval(poll, (C.POLL_SECONDS || 25) * 1000);
  }
  $('#switchBtn').onclick = function () { showPicker(); };

  /* render */
  function render() {
    var st = S.st, cv = st.caller;
    $('#avatar').textContent = (cv.name || '?').charAt(0).toUpperCase();
    $('#myName').textContent = cv.name;
    var pct = Math.min(1, st.today.done / Math.max(1, st.today.target));
    $('#ringFg').style.strokeDashoffset = 264 * (1 - pct);
    $('#ringNum').textContent = st.today.done + '/' + st.today.target;
    var left = st.today.target - st.today.done;
    $('#progTitle').textContent = cv.notStarted ? dayOneText(cv.startDate)
      : st.over ? 'Karma Sadhana period complete 🙏'
      : left > 0 ? 'Let’s become a mother to ' + left + (left === 1 ? ' person' : ' people') + ' today 🌸'
      : left === 0 ? "Today's target done! 🌸" : 'Extra mile: +' + (-left) + ' ✨';
    var total = C.CAMPAIGN_START_DATE && C.CAMPAIGN_END_DATE ? daysBetween(C.CAMPAIGN_START_DATE, C.CAMPAIGN_END_DATE) + 1 : 0;
    var dayNo = C.CAMPAIGN_START_DATE ? daysBetween(C.CAMPAIGN_START_DATE, istDay()) + 1 : 0;
    $('#progSub').textContent = (!cv.notStarted && dayNo > 0 && total ? 'Day ' + dayNo + ' of ' + total : '') +
      (!S.isWA && st.today.dials > st.today.done ? (dayNo > 0 ? ' · ' : '') + st.today.dials + ' dials today' : '');
    var tl = Math.max(0, st.today.target - st.today.done);
    $('#todayLeft').textContent = cv.notStarted || st.over ? '' : tl ? tl + ' left today' : 'Today done ✅';
    $('#myLeft').textContent = (st.left || 0) + ' left in your list';
    var cp = st.camp || { total: 0, done: 0 };
    $('#campFill').style.width = (cp.total ? 100 * cp.done / cp.total : 0) + '%';
    $('#campText').textContent = 'Team has reached ' + cp.done + ' of ' + cp.total + ' people 🌸';
    $('#daysLeft').textContent = st.caller.daysLeft + (st.caller.daysLeft === 1 ? ' day left' : ' days left');
    var r = st.stats.reached || 0;
    $('#myTotal').textContent = r ? 'You’ve offered this possibility to ' + r + (r === 1 ? ' person' : ' people') + ' 🙏' : 'Your first offering awaits 🙏';
    var pend = st.today.pending || 0, dl = cv.daysLeft || 0, x = dl ? Math.ceil(pend / dl) : 0;
    $('#catchUp').textContent = !pend || cv.notStarted || st.over ? ''
      : 'You have ' + pend + ' pending ' + W(pend) + ' from earlier days 🌱 ' +
        (pend <= dl ? 'Just 1 extra ' + W(1) + ' a day for ' + pend + (pend === 1 ? ' day' : ' days') + ' will catch you up.'
                    : x + ' extra ' + W(x) + ' a day for the remaining ' + dl + ' days will catch you up.');
    var intro = C.INTRO_DATE && addDays(C.INTRO_DATE, -1) === istDay()
      ? (st.followUps || []).filter(function (f) { return f.status === 'intro'; }).length : 0;
    $('#introBanner').innerHTML = intro ? '<div class="card" style="text-align:center"><b>🌼 Intro is tomorrow at ' + esc(C.INTRO_TIME || '') +
      '</b><p class="muted">Call your ' + intro + (intro === 1 ? ' person' : ' people') + ' who will join the Intro today and remind them 🙏</p>' +
      '<button class="btn primary" id="introGo">Open Follow-ups</button></div>' : '';
    if (intro) $('#introGo').onclick = function () { document.querySelector('.tabs [data-v="follow"]').click(); };
    renderContact(); renderTicker(); renderFollow();
  }

  function statusButtons(selected, prefix) {
    return Object.keys(ST).map(function (k) {
      var s = ST[k];
      return '<button class="sbtn ' + (k === 'registered' ? 'registered wide ' : '') + (selected === k ? 'on' : '') + '" data-s="' + k + '">' +
        '<span class="e">' + s.emoji + '</span>' + esc(s.label) + '</button>';
    }).join('');
  }

  function renderContact() {
    var st = S.st, area = $('#contactArea');
    if (st.inHand.length && S.isWA) return renderWaContact(st.inHand[0]);
    if (st.inHand.length) {
      var c = st.inHand[0];
      var progs = String(c.programs || '').split(',').map(function (s) { return s.trim(); }).filter(String);
      area.innerHTML =
        '<div class="card contact">' +
        '<div class="c-label">' + (st.today.done >= st.today.target ? 'Extra call ✨' : 'Your next call') + '</div>' +
        '<h2 class="c-name">' + nameOf(c) + '</h2>' +
        '<div class="chips">' + progs.map(function (p) { return '<span class="chip">' + esc(p) + '</span>'; }).join('') +
        (c.attempts ? '<span class="chip soft">Try #' + (c.attempts + 1) + '</span>' : '') + '</div>' +
        '<div class="c-phone">' + esc(c.phone.replace(/(\d{5})(\d{5})/, '$1 $2')) + '</div>' +
        (c.phone ? '<div class="act"><a class="btn call" href="' + telLink(c.phone) + '">' + ICON_PHONE + 'Call now</a>' +
        '<a class="btn wa" target="_blank" rel="noopener" href="' + waLink(c) + '">' + ICON_CHAT + 'WhatsApp</a></div>'
          : '<p class="muted">No phone number — email: ' + esc(c.email) + '. Mark “Wrong number” to skip.</p>') +
        (c.notes ? '<p class="muted tiny" style="margin:10px 0 0">📝 ' + esc(c.notes) + '</p>' : '') +
        '<div class="how">After the call, tap what happened 👇</div>' +
        '<div class="status-grid" id="grid">' + statusButtons(S.sel) + '</div>' +
        '<details class="note-box"><summary>✏️ Add a note (optional)</summary><textarea id="note" placeholder="e.g. call after 6pm, asked about dates">' + esc(S.note || '') + '</textarea></details>' +
        '<div class="save-row"><button class="btn primary big" id="saveBtn" ' + (S.sel ? '' : 'disabled') + '>Save & next 🌸</button></div>' +
        '</div>';
      $('#grid').onclick = function (e) {
        var b = e.target.closest('.sbtn'); if (!b) return;
        S.sel = b.dataset.s;
        [].forEach.call($('#grid').children, function (x) { x.classList.toggle('on', x === b); });
        $('#saveBtn').disabled = false; FX.buzz(15);
      };
      $('#note').oninput = function () { S.note = this.value; };
      $('#saveBtn').onclick = function () { save(c.id, S.sel, $('#note').value); };
      return;
    }
    if (st.caller.notStarted) {
      area.innerHTML = '<div class="card done-card"><img src="img/done.jpg" alt=""><div class="inner"><h2>' + dayOneText(st.caller.startDate) + '</h2>' +
        '<p class="muted">You have ' + st.caller.perDay + ' ' + W(st.caller.perDay) + ' a day for ' + st.caller.daysLeft + ' days. Your contacts will appear here on day one.</p>' +
        '<blockquote class="quote">' + esc(quote()) + '</blockquote></div></div>';
      return;
    }
    var done = st.today.done >= st.today.target;
    var img = st.over ? 'img/done.jpg' : st.poolEmpty ? 'img/extra.jpg' : 'img/done.jpg';
    var title = st.over ? 'Your Karma Sadhana period is complete 🙏'
      : st.poolEmpty ? (S.isWA ? 'Everyone has been messaged 🌸' : 'All contacts are being called right now 🌸')
      : done ? "Today's Karma Sadhana is complete 🙏" : 'Resting…';
    var body = st.over ? 'Thank you for every single ' + W(1) + '. Ask the admin if you would like to continue.'
      : st.poolEmpty ? (S.isWA ? 'There is nobody left to message in this campaign. Thank you 🙏' : 'Every name is being called. Please check back later — more may come back for a retry.')
      : 'You met your target. Want to go one more? Everyone will see your extra mile ✨';
    area.innerHTML = '<div class="card done-card"><img src="' + img + '" alt=""><div class="inner"><h2>' + title + '</h2>' +
      '<p class="muted">' + body + '</p><blockquote class="quote">' + esc(quote()) + '</blockquote>' +
      (!st.over && !st.poolEmpty && done ? '<button class="btn primary big" id="extraBtn">' + (S.isWA ? 'Send one extra message ✨' : 'Make one extra call ✨') + '</button>' : '') +
      '</div></div>';
    var eb = $('#extraBtn');
    if (eb) eb.onclick = function () {
      eb.disabled = true;
      api('state', withCamp({ extra: true })).then(function (st2) {
        S.st = st2; S.sel = null; render();
        if (!st2.inHand.length) toast('No contacts available right now 🙏');
        else { FX.shower(20); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      }).catch(function (e) { toast(e.message); eb.disabled = false; });
    };
  }

  /* WhatsApp campaign: one person at a time — open WhatsApp, send, tap the result (saves straight away) */
  function renderWaContact(c) {
    var st = S.st, progs = String(c.programs || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    $('#contactArea').innerHTML =
      '<div class="card contact wa-card">' +
      '<div class="c-label">' + (st.today.done >= st.today.target ? 'Extra message ✨' : 'Message ' + (st.today.done + 1) + ' of ' + st.today.target + ' today') + '</div>' +
      '<h2 class="c-name">' + nameOf(c) + '</h2>' +
      (progs.length ? '<div class="chips">' + progs.map(function (p) { return '<span class="chip">' + esc(p) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="c-phone">' + esc(c.phone.replace(/(\d{5})(\d{5})/, '$1 $2')) + '</div>' +
      (c.phone ? '<a class="btn wa big wa-open" target="_blank" rel="noopener" href="' + waLink(c) + '">' + ICON_CHAT + 'Open WhatsApp & send</a>'
        : '<p class="muted">No phone number. Tap “Wrong number” to skip.</p>') +
      '<div class="how">After sending, tap what happened 👇</div>' +
      '<div class="status-grid wa-grid" id="grid">' + statusButtons(null) + '</div>' +
      '</div>';
    $('#grid').onclick = function (e) {
      var b = e.target.closest('.sbtn'); if (!b) return;
      b.classList.add('on'); FX.buzz(15); save(c.id, b.dataset.s, '');
    };
  }

  function numberGone(e) {   // admin changed or removed this number
    if (!/not registered|Caller not found/.test(e && e.message)) return false;
    LS.set('icc_phone', ''); S.st = null;
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#phoneIn').value = '';
    $('#loginErr').textContent = 'Your number was updated by the admin. Please log in with your new number 🙏';
    return true;
  }
  function save(id, status, notes, fromList) {
    if (S.busy || !status) return;
    S.busy = true;
    var prevTotal = S.st.stats.total, prevTeam = S.st.team ? S.st.team.dials : 0;
    S.prevLeft = S.st.left;
    var card = fromList ? document.querySelector('#fuList li[data-id="' + id + '"]') : $('.contact'); if (card) card.classList.add('loading');
    api('submit', withCamp({ contactId: id, status: status, notes: (notes || '').trim() })).then(function (st) {
      S.st = st;
      if (!fromList) { S.sel = null; S.note = ''; }
      render(); celebrateOwn(st.saved, st.milestone, prevTotal);
      var sm = SECTOR_MILESTONES.filter(function (m) { return prevTeam < m && st.team.dials >= m; }).pop();
      if (sm) setTimeout(function () { celebrate('🎊', squad() + ' crossed ' + sm + ' ' + W(sm) + '!', 'And your ' + W(1) + ' took us there. Thank you, everyone 🙏', true); }, 2500);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) { if (numberGone(e)) return; toast('⚠️ ' + e.message, 4000); if (card) card.classList.remove('loading'); })
      .then(function () { S.busy = false; });
  }

  function celebrate(emoji, title, sub, big) {
    $('#celEmoji').textContent = emoji; $('#celTitle').textContent = title; $('#celSub').textContent = sub;
    $('#celebrate').classList.remove('hidden');
    FX.confetti(big ? 4500 : 2500); FX.shower(big ? 70 : 35);
    if (big) FX.clap(2.6); else FX.chime();
    FX.buzz(big ? [80, 50, 80, 50, 160] : [50]);
    $('#celClose').onclick = function () { $('#celebrate').classList.add('hidden'); };
  }
  var MILESTONES = [10, 25, 50, 75, 100];
  var SECTOR_MILESTONES = [100, 250, 500, 750, 1000, 1500, 2000];
  function celebrateOwn(status, milestone, prevTotal) {
    var name = titleFirst(S.st.caller.name), st = S.st.stats;
    if (S.isWA) {   // WhatsApp: only flowers along the way; the big celebration is for finishing the whole list
      var t = S.st.today, left = t.target - t.done;
      if (S.prevLeft > 0 && S.st.left === 0)
        return celebrate('🏆', 'Your whole list is complete, ' + name + '!', 'Every person in your list has received this possibility because of you. Thank you for this beautiful Karma Sadhana 🙏', true);
      if (milestone === 'update') return toast('✅ Updated', 1500);
      if (milestone === 'target') { FX.shower(40); FX.chime(); return toast("🙏 Today's target complete! Thank you, " + name, 3000); }
      if (milestone !== 'extra' && t.done && t.done % 10 === 0 && left > 0) { FX.shower(30); return toast('🌸 ' + t.done + ' done! Only ' + left + ' to go today', 3000); }
      if (milestone === 'extra') { FX.shower(15); return toast('✨ Extra mile! Everyone can see it', 2000); }
      return toast(status === 'sent' ? '✅ Sent' : '🙏 Noted', 1200);
    }
    if (status === 'registered' && st.regs === 1) return celebrate('🏆', 'Your FIRST registration, ' + name + '!', 'A moment to remember. Someone will experience Inner Engineering because you picked up the phone 🙏', true);
    var hit = MILESTONES.filter(function (m) { return prevTotal < m && st.total >= m; })[0];
    if (hit) return celebrate('🌟', hit + ' ' + W(hit) + ', ' + name + '!', 'You have ' + (S.isWA ? 'sent ' : 'made ') + hit + ' ' + W(hit) + ' in this Karma Sadhana. Every one of them was an offering 🙏', hit >= 50);
    if (status === 'registered') return celebrate('👏', 'A Registration! Jai, ' + name + '!', 'Someone is going to experience Inner Engineering because of your call. Everyone is clapping for you.', true);
    if (milestone === 'update' && status !== 'intro') return toast('✅ Updated (not counted as a new ' + W(1) + ')');
    if (milestone === 'target') return celebrate('🙏', "Today's target complete!", 'Beautiful Karma Sadhana, ' + name + ' 🙏', false);
    if (status === 'intro') { FX.shower(45); FX.chime(); return toast('🌼 Wonderful! They will join the intro'); }
    if (status === 'interested_later') { FX.shower(25); return toast('🌱 A seed is planted. Thank you!'); }
    if (milestone === 'extra') { FX.shower(30); FX.chime(); return toast('✨ Extra mile! Everyone can see it'); }
    if (status === 'follow_up') { FX.shower(15); return toast('📌 Added to your Follow-ups tab'); }
    if (status === 'no_answer') return toast("📵 No worries — here's your next call");
    toast('🙏 Thank you. Every ' + W(1) + ' counts');
  }

  /* team */
  var FEED_TXT = {
    registered: ['🎉', ' got a <b>registration</b>!'], intro: ['🌼', ' has someone joining the <b>intro</b>'],
    extra: ['✨', ' went the <b>extra mile</b> with one more call'], target: ['🙏', " completed today's <b>target</b>"]
  };
  function renderTicker() {
    var today = istDay(), f = S.st.feed.filter(function (x) { return istDay(x.ts) === today; }).slice(0, 8);   // today's news only
    var items = f.length ? f.map(function (x) {
      return '<span>' + FEED_TXT[x.type][0] + ' ' + esc(x.phone === S.phone ? 'You' : x.who) + FEED_TXT[x.type][1].replace(/<\/?b>/g, '').replace(x.phone === S.phone ? ' has ' : '#', ' have ') + '</span>';
    }) : ['<span>🌸 ' + S.st.team.dials + ' ' + W(S.st.team.dials) + ' ' + (S.isWA ? 'sent by the messaging squad' : 'made by the calling squad') + ' so far</span>'];
    $('#ticker').innerHTML = items.join('');
  }
  /* follow-ups: contacts this caller marked "Follow up" */
  function dayLabel(d) { return Number(d.slice(8, 10)) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(d.slice(5, 7)) - 1]; }
  function introWhen() { return dayLabel(C.INTRO_DATE) + (C.INTRO_TIME ? ', ' + C.INTRO_TIME : ''); }
  var FU_GROUPS = [   // [status, tab label, colour, empty text] — one tab per call result
    ['follow_up', '📌 Follow up', '#2563A8', 'No follow-ups. When someone asks you to call back, mark the call “📌 Follow up”.'],
    ['intro', '🌼 Intro', '#C98A0B', 'Nobody yet. People you mark “🌼 Will join Intro” appear here.'],
    ['interested_later', '🌱 Next time', '#3C8D2F', 'Nobody marked “Interested – next time” yet.'],
    ['no_answer', '📵 No answer', '#7A6E66', 'Nobody here. People who didn’t pick up appear here, in case they call you back.'],
    ['budget', '💰 Budget', '#8A5A12', 'Nobody marked “Budget issue” yet.'],
    ['not_interested', '🙏 Not interested', '#9A4B5B', 'Nobody marked “Not interested” yet.'],
    ['wrong_number', '❌ Wrong no.', '#B8142C', 'Nobody marked “Wrong number” yet.'],
    ['registered', '🎉 Registered', '#1F8A4C', 'No registrations yet — your next call could be the one 🌸'],
    ['completed_ie', '🪷 Completed IE', '#6A4C93', 'Nobody marked “Completed Inner Engineering” yet.']
  ];
  var WA_GROUPS = [
    ['sent', '✅ Sent', '#1F8A4C', 'Nobody yet. People you message appear here.'],
    ['no_whatsapp', '🚫 No WhatsApp', '#7A6E66', 'Nobody marked “No WhatsApp” yet.'],
    ['wrong_number', '❌ Wrong no.', '#B8142C', 'Nobody marked “Wrong number” yet.']
  ];
  function groups() { return S.isWA ? WA_GROUPS : FU_GROUPS; }
  function fuItem(x, g) {
    var meta = [x.lastCalledAt ? (S.isWA ? 'messaged ' : 'last call ') + ago(x.lastCalledAt) : '', x.status === 'no_answer' && x.attempts ? 'tried ' + x.attempts + 'x' : '', x.programs ? esc(x.programs) : '']
      .filter(String).join(' · ');
    return '<li class="fu-card" data-id="' + esc(x.id) + '" style="border-left-color:' + g[2] + '">' +
      '<div class="fu-name">' + (x.name ? esc(x.name) : esc(x.phone)) + '</div>' +
      (x.status === 'intro' ? '<div class="fu-tag">🌼 Intro ' + (C.INTRO_DATE && istDay() <= C.INTRO_DATE ? introWhen() + ' · call on ' + dayLabel(addDays(C.INTRO_DATE, -1)) : '· call the day before') + '</div>' : '') +
      '<div class="fu-meta">' + meta + '</div>' +
      (x.notes ? '<div class="fu-meta">📝 ' + esc(x.notes) + '</div>' : '') +
      '<div class="fu-acts">' + (S.isWA ? '' : '<a class="btn call" href="' + telLink(x.phone) + '">' + ICON_PHONE + 'Call</a>') +
      '<a class="btn wa" target="_blank" rel="noopener" href="' + waLink(x) + '">' + ICON_CHAT + 'WhatsApp</a></div>' +
      '<div class="fu-update"><select><option value="">What happened?</option>' +
      Object.keys(ST).map(function (k) { return '<option value="' + k + '">' + ST[k].emoji + ' ' + esc(ST[k].label) + '</option>'; }).join('') +
      '</select><input class="fu-note" placeholder="Remarks (optional)"><button class="btn primary" data-save="1" disabled>Update</button></div></li>';
  }
  function renderFollow() {
    var f = S.st.followUps || [];
    var open = f.filter(function (x) { return x.status === 'follow_up' || x.status === 'intro'; }).length;   // badge: people waiting for a call back
    $('#fuCount').textContent = open ? ' (' + open + ')' : '';
    if (!S.fuTabPicked) S.fuTab = (groups().filter(function (g) { return f.some(function (x) { return x.status === g[0]; }); })[0] || groups()[0])[0];
    $('#fuTabs').innerHTML = groups().map(function (g) {
      var n = f.filter(function (x) { return x.status === g[0]; }).length;
      return '<button data-tab="' + g[0] + '" class="' + (S.fuTab === g[0] ? 'on' : '') + '" style="--c:' + g[2] + '">' + g[1] + ' <b>' + n + '</b></button>';
    }).join('');
    var g = groups().filter(function (x) { return x[0] === S.fuTab; })[0] || groups()[0];
    var items = f.filter(function (x) { return x.status === g[0]; });
    $('#fuList').innerHTML = items.length ? items.map(function (x) { return fuItem(x, g); }).join('') : '<li class="empty">' + g[3] + '</li>';
  }
  $('#fuTabs').onclick = function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    S.fuTab = b.dataset.tab; S.fuTabPicked = true; renderFollow();
  };
  $('#fuList').onchange = function (e) {
    var li = e.target.closest('li[data-id]'); if (li && e.target.tagName === 'SELECT') li.querySelector('[data-save]').disabled = !e.target.value;
  };
  $('#fuList').onclick = function (e) {
    var li = e.target.closest('li[data-id]'); if (!li || !e.target.closest('[data-save]')) return;
    var v = li.querySelector('select').value; if (v) save(li.dataset.id, v, li.querySelector('.fu-note').value, true);
  };
  document.querySelector('.tabs').onclick = function (e) {
    var b = e.target.closest('button'); if (!b) return;
    [].forEach.call(document.querySelectorAll('.tabs button'), function (x) { x.classList.toggle('on', x === b); });
    ['home', 'follow'].forEach(function (v) { $('#v-' + v).classList.toggle('hidden', v !== b.dataset.v); });
    window.scrollTo(0, 0);
  };

  /* live updates from other volunteers */
  function poll() {
    if (document.hidden || !S.st) return;
    if (!S.camp) return;
    api('feed', { campaignId: S.camp.id }).then(function (d) {
      var before = S.st.team ? S.st.team.dials : 0;
      S.st.feed = d.feed; S.st.team = d.team;
      renderTicker();
      var sm = SECTOR_MILESTONES.filter(function (m) { return before < m && d.team.dials >= m; }).pop();
      if (sm && before > 0) return celebrate('🎊', squad() + ' crossed ' + sm + ' ' + W(sm) + '!', 'Together we have offered this possibility ' + sm + ' times. Thank you, everyone 🙏', true);
      var fresh = d.feed.filter(function (f) { return f.ts > S.lastSeen && f.phone !== S.phone; }).reverse();
      if (d.feed[0] && d.feed[0].ts > S.lastSeen) { S.lastSeen = d.feed[0].ts; LS.set('icc_lastSeen_' + S.phone + '_' + S.camp.id, S.lastSeen); }
      var reg = fresh.filter(function (f) { return f.type === 'registered'; })[0];
      if (reg) return celebrate('👏', reg.who + ' got a registration!', 'Let us all clap for ' + reg.who + ' 🙏 Your next call could be the one.', true);
      var other = fresh[fresh.length - 1];
      if (other) { var x = FEED_TXT[other.type]; toast(x[0] + ' ' + other.who + x[1].replace(/<\/?b>/g, ''), 3500); FX.shower(15); }
    }).catch(function () {});
  }

  /* misc */
  $('#logoutBtn').onclick = function () { LS.set('icc_phone', null); location.reload(); };
  document.addEventListener('visibilitychange', function () {  // coming back from the dialer: refresh
    if (!document.hidden && S.st && S.camp && !S.busy && !$('#app').classList.contains('hidden')) api('state', withCamp()).then(function (st) { S.st = st; render(); }).catch(numberGone);
  });

  initLogin();
})();
