# Isha Outreach Seva — call + WhatsApp campaigns

A phone-first web app for volunteers, plus an admin page. Data lives in a **new** Google Sheet, never the old calling app's Sheet.

- `index.html`: the volunteer page. Volunteers log in with their mobile number and see every campaign they are part of.
- `admin.html`: the admin page. It needs a password.

## How it works
1. **Admin creates a campaign**: name, type (📞 Calls or 💬 WhatsApp), start and end dates, and per-day target (default 30 messages or 2 calls). A WhatsApp campaign also has its own message, where `{name}` is the contact's first name and `{caller}` is the volunteer's first name.
2. **Upload the campaign's contacts** (CSV or Excel with Name and Phone columns). Each campaign keeps its own list, so campaigns never mix.
3. **Add volunteers** (name and phone). Each one gets a share of per day × days. If the list is too small for everyone's full share, it is split fairly. The admin page shows how many more volunteers you need.
4. **Volunteer flow (one person at a time)**:
   - Calls: same as the old calling app.
   - WhatsApp: **Open WhatsApp & send**, then tap **Sent / Wrong number / No WhatsApp**, and the next person appears.
   - Each volunteer sees what's left today, what's left in their list, and how far the whole team has got.

## Admins
- **Main admin**: log in with your mobile number and the main password (`ADMIN_PASSWORD`, or `isha@123` in demo mode). Only the main admin sees the **👥 Admins** card, where you add other admins with a name, mobile, password and access: **WhatsApp only**, **Calls only**, or **Both**.
- Add yourself to the Admins list too, so the activity record shows your name instead of "Main admin".
- Admins only see, create and manage campaigns of their type.
- Every admin action is recorded with the admin's name (created campaign, uploaded contacts, added volunteer, assigned contacts). You'll find it under Dashboard → **🗂️ Admin activity**, and the **Added by** column shows who added each volunteer. The full record is in the `AdminLog` tab of the Sheet.
- Admin passwords are kept in the `Admins` tab of your private Google Sheet. Don't share that Sheet.

## 1. Try it on localhost (DEMO mode)
1. Leave `API_URL` empty in `js/config.js`.
2. Double-click `start-local.bat` (it needs Python).
3. Open http://localhost:8080/admin.html, log in with any mobile number and password `isha@123`, create a campaign, upload contacts and add yourself as a volunteer.
4. Open http://localhost:8080/ and log in with that number.

**Practice mode:** open `index.html?test=1` and log in with your own number. You get a practice call campaign and a practice WhatsApp campaign whose contacts are your own number.

## 2. Connect a NEW Google Sheet (real mode)
1. Create a **new** Google Sheet, for example "Outreach Seva". Do **not** reuse the calling app's Sheet.
2. Open Extensions → Apps Script, and replace everything in `Code.gs` with `apps-script/PASTE_THIS_IN_APPS_SCRIPT.gs`.
3. Run `setup` once and allow permissions. This creates the **Campaigns**, **Admins** and **AdminLog** tabs. Each campaign gets its own `Contacts_K1`, `Callers_K1` and `Log_K1` tabs automatically.
4. Change the admin password: Project Settings → Script properties → `ADMIN_PASSWORD`.
5. Deploy → New deployment → **Web app**. Set Execute as **Me** and Who has access **Anyone**, then copy the URL.
6. Paste that URL into `js/config.js` as `API_URL`.

When you change the script later: Deploy → Manage deployments → Edit → Version: New version.

## 3. GitHub Pages
Push this folder to a **new** repo, then go to Settings → Pages → Deploy from branch (main, root). This app stores its browser data under different keys (`icc_`) from the old calling app (`ics_`), so both can run on the same github.io site without clashing.

## Notes
- WhatsApp messages are sent from each volunteer's own WhatsApp. Keep the message personal ({name}) and the daily number reasonable, because many identical messages to unsaved numbers can get a number flagged.
- Old campaigns: Edit → untick **Active** to hide them from volunteers.
- `js/core.js` and `apps-script/core.gs` are the same file. If you change one, copy it to the other and rebuild the PASTE file.
