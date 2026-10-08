/* Talks to the Google Apps Script backend, or runs the same logic locally in DEMO mode. */
(function () {
  // TEST MODE: open the site with ?test=1 — practice calls stay in this phone only, never touch the Google Sheet
  window.isTest = /[?&]test(=|&|$)/.test(location.search);
  var PFX = window.isTest ? 'icct_' : 'icc_';
  if (window.isTest) window.CONFIG.CAMPAIGN_START_DATE = istDay();
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var DemoStore = {
    all: function (t) {
      var rows = [];
      try { rows = JSON.parse(LS.get(PFX + t) || '[]'); } catch (e) {}
      return rows.map(function (o, i) { o._i = i; return o; });
    },
    save: function (t, rows) {
      LS.set(PFX + t, JSON.stringify(rows.map(function (o) { var c = Object.assign({}, o); delete c._i; return c; })));
    },
    update: function (t, o) { var r = this.all(t); r[o._i] = o; this.save(t, r); },
    insert: function (t, o) { var r = this.all(t); r.push(o); this.save(t, r); },
    replaceAll: function (t, rows) { this.save(t, rows); }
  };
  var DemoAuth = {
    master: function (pw) { return pw === window.CONFIG.DEMO_ADMIN_PASSWORD; },
    issue: function (admin) { var t = 'demo-' + Math.random().toString(36).slice(2); LS.set('icc_admtok_' + t, JSON.stringify(admin)); return t; },
    verify: function (t) { try { return t ? JSON.parse(LS.get('icc_admtok_' + t)) : null; } catch (e) { return null; } }
  };
  // test mode: the first login creates one practice CALL campaign and one practice WHATSAPP campaign,
  // each with 8 practice contacts whose number is YOUR number
  function seedTest(phone) {
    phone = normPhone(phone);
    if (phone.length !== 10 || DemoStore.all('Campaigns').length) return;
    [['Practice calls', 'call'], ['Practice WhatsApp', 'whatsapp']].forEach(function (t) {
      var camp = saveCampaign(DemoStore, { name: t[0], type: t[1], startDate: istDay(), endDate: addDays(istDay(), 2), perDay: 3,
                                           message: t[1] === 'whatsapp' ? window.CONFIG.WHATSAPP_TEMPLATE : '' });
      createCore(scoped(DemoStore, camp.id), camp).saveCaller({ name: 'Test Volunteer', phone: phone, perDay: 3, days: 3, startDate: istDay(), skipAssign: true });
      var rows = [];
      for (var i = 1; i <= 8; i++) rows.push({ id: 'T' + i, name: 'Practice Seeker ' + i, phone: phone, email: '', programs: i % 2 ? 'Shivanga' : 'FMF',
        reservedFor: phone, assignedTo: '', assignedAt: '', status: '', attempts: 0, lastCalledAt: '', calledBy: '', notes: '' });
      DemoStore.replaceAll('Contacts_' + camp.id, rows);
    });
  }

  window.isDemo = !window.CONFIG.API_URL || window.isTest;
  // Live mode: wipe any demo data left in this browser (only this app's keys — never the old calling app's 'ics_' keys)
  if (!window.isDemo) try {
    Object.keys(localStorage).forEach(function (k) { if (/^icc_(Campaigns|Contacts_|Callers_|Log_|Admins|AdminLog|admtok)/.test(k)) localStorage.removeItem(k); });
  } catch (e) {}
  // Wake Google's script up as soon as the page opens, so it is ready by the time the number/password is typed
  if (!window.isDemo) try { fetch(window.CONFIG.API_URL, { mode: 'no-cors' }); } catch (e) {}
  window.api = function (action, payload) {
    payload = payload || {};
    if (window.isDemo) {
      if (window.isTest && payload.phone) seedTest(payload.phone);
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(dispatch(DemoStore, DemoAuth, action, payload)); }
          catch (e) { reject(e); }
        }, 150);
      });
    }
    var body = JSON.stringify(Object.assign({ action: action, reqId: Date.now().toString(36) + Math.random().toString(36).slice(2) }, payload));
    // Google sometimes answers with an error page or drops the connection: retry a few times (same reqId, so a save is never done twice)
    function attempt(n) {
      return fetch(window.CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var res; try { res = JSON.parse(t); } catch (e) { var er = new Error('bad'); er.retry = true; throw er; }
          if (!res.ok) throw new Error(res.error || 'Server error');
          return res.data;
        })
        .catch(function (e) {
          var transient = e.retry || e instanceof TypeError;
          if (transient && n < 4) return new Promise(function (ok) { setTimeout(ok, 700 * n); }).then(function () { return attempt(n + 1); });
          if (transient) throw new Error('The connection is slow right now. Please tap again 🙏');
          throw e;
        });
    }
    return attempt(1);
  };
})();
