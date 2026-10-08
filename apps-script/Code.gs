/* Isha Campaign Seva (calls + WhatsApp) — Google Sheet backend.
 * Put this file AND core.gs (copy of js/core.js) into the Apps Script project of your Google Sheet.
 * Then run setup() once, and deploy as a Web app (see README).
 */
var SPREADSHEET_ID = '';   // leave empty when the script is opened from the Sheet (Extensions > Apps Script)

function book_() { return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  var ss = book_(), s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, tableCols(name).length).setValues([tableCols(name)]).setFontWeight('bold').setBackground('#FBE9D2');
    s.setFrozenRows(1);
  }
  return s;
}
var _cache = {};
function read_(t) {
  if (_cache[t]) return _cache[t];
  var s = sheet_(t), cols = tableCols(t), n = s.getLastRow() - 1;
  var vals = n > 0 ? s.getRange(2, 1, n, cols.length).getValues() : [];
  _cache[t] = vals.map(function (r, i) {
    var o = { _i: i };
    cols.forEach(function (c, j) { var v = r[j]; if (v instanceof Date) v = v.toISOString(); o[c] = v === null ? '' : v; });
    return o;
  });
  return _cache[t];
}
function toRow_(t, o) { return tableCols(t).map(function (c) { return o[c] == null ? '' : String(o[c]); }); }
function write_(t, startRow, rows) {
  var s = sheet_(t), need = startRow + rows.length - 1 - s.getMaxRows();
  if (s.getLastColumn() < tableCols(t).length)   // a newer version added columns: label them
    s.getRange(1, 1, 1, tableCols(t).length).setValues([tableCols(t)]).setFontWeight('bold').setBackground('#FBE9D2');
  if (need > 0) s.insertRowsAfter(s.getMaxRows(), need);   // a new sheet only has 1000 rows
  var r = s.getRange(startRow, 1, rows.length, tableCols(t).length);
  r.setNumberFormat('@');   // keep phones / dates as plain text
  r.setValues(rows);
}
var SheetStore = {
  all: function (t) { return read_(t).map(function (o) { return Object.assign({}, o); }); },
  update: function (t, o) { write_(t, o._i + 2, [toRow_(t, o)]); read_(t)[o._i] = Object.assign({}, o); },
  insert: function (t, o) { var rows = read_(t); o._i = rows.length; write_(t, o._i + 2, [toRow_(t, o)]); rows.push(Object.assign({}, o)); },
  replaceAll: function (t, rows) {
    var s = sheet_(t), last = s.getLastRow();
    if (last > 1) s.getRange(2, 1, last - 1, tableCols(t).length).clearContent();
    if (rows.length) write_(t, 2, rows.map(function (o) { return toRow_(t, o); }));
    _cache[t] = rows.map(function (o, i) { var c = Object.assign({}, o); c._i = i; return c; });
  }
};
var SheetAuth = {   // a login lasts 6 hours
  master: function (pw) { return !!pw && pw === (PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || 'isha@123'); },
  issue: function (admin) { var t = Utilities.getUuid(); CacheService.getScriptCache().put('adm_' + t, JSON.stringify(admin), 21600); return t; },
  verify: function (t) { var v = t && CacheService.getScriptCache().get('adm_' + t); try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }
};

function doPost(e) {
  var out, lock = LockService.getScriptLock(), locked = false;
  try {
    var p = JSON.parse(e.postData.contents), cache = CacheService.getScriptCache();
    var seen = p.reqId && p.action === 'submit' ? cache.get('req_' + p.reqId) : null;
    if (seen) return ContentService.createTextOutput(seen).setMimeType(ContentService.MimeType.JSON);   // retried save: don't save twice
    if (['feed', 'adminLogin', 'adminData', 'myCampaigns', 'campaigns', 'allVolunteers', 'activity', 'admins'].indexOf(p.action) < 0) { lock.waitLock(28000); locked = true; }
    out = { ok: true, data: dispatch(SheetStore, SheetAuth, p.action, p) };
    if (p.reqId && p.action === 'submit') { var js = JSON.stringify(out); if (js.length < 90000) cache.put('req_' + p.reqId, js, 600); }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  } finally {
    if (locked) lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return ContentService.createTextOutput('Isha Campaign Seva API is running 🙏'); }

/* Run once from the editor: creates the Campaigns tab. Each campaign's tabs are created when it is first used. */
function setup() {
  sheet_('Campaigns'); sheet_('Admins'); sheet_('AdminLog');
  if (!PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD'))
    PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', 'isha@123');
  Logger.log('Sheets ready. Admin password is in Project Settings > Script properties > ADMIN_PASSWORD');
}
