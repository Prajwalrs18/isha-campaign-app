/* ===== Isha Outreach Seva (calls + WhatsApp) — settings you can edit ===== */
window.CONFIG = {
  // Paste your Google Apps Script "Web app" URL here (see README).
  // Leave EMPTY to run in DEMO mode: data stays only in this browser (good for testing on localhost).
  API_URL: '',   // NEW Sheet's URL goes here — never the old calling app's URL

  // Only used in DEMO mode. With the Google Sheet, the password is set in Apps Script (see README).
  DEMO_ADMIN_PASSWORD: 'isha@123',

  CAMPAIGN_TITLE: 'Outreach Seva · Calls & WhatsApp',
  // Campaign dates, per-day targets and the WhatsApp message are now set per campaign on the admin page.
  CAMPAIGN_START_DATE: '', CAMPAIGN_END_DATE: '', INTRO_DATE: '', INTRO_TIME: '',
  SECTOR: 'Isha · Electronic City Sector',
  POLL_SECONDS: 25,   // how often the team feed refreshes

  // DEFAULT WhatsApp message, pre-filled when the admin creates a WhatsApp campaign (each campaign can change it).
  // {name} = contact first name, {caller} = volunteer first name
  WHATSAPP_TEMPLATE:
    "Namaskaram {name} 🙏🏼\n" +
    "\n" +
    "🌸 *Inner Engineering* at Electronic City \n" +
    "\n" +
    "A 4-day in-person program in English to explore powerful tools for wellbeing designed by Sadhguru.\n" +
    "_Let’s take charge of our body, mind, emotions and energies._\n" +
    "\n" +
    "📽️ What is Inner Engineering?\n" +
    "https://youtu.be/qP5pQQOpDeY\n" +
    "\n" +
    "🗓️ Oct 29 – Nov 1, 2026\n" +
    "\n" +
    "📍 Venue: Incture Technologies, Near Infosys Metro, Electronic City\n" +
    "\n" +
    "🎁 Free Introductory Talk: Oct 29 | 6:00–7:00 AM\n" +
    "\n" +
    "🔗 Register: isha.co/IE4-ECity-29Oct\n" +
    "\n" +
    "📞 Contact: +91 80959 63111\n" +
    "\n" +
    "✨ Interested to know more? Join the Isha Ecity WhatsApp group:\n" +
    "https://chat.whatsapp.com/CdLEQqNQimMJialWorqQP8\n" +
    "\n" +
    "In love, light & laughter,\n" +
    "Isha Volunteers 🪔",

  // Quotes shown across the app. Please verify wording against Isha's official sources before going live.
  // Add Sadhguru's volunteering quotes from official Isha material here, one per line.
  QUOTES: [
    'The most beautiful moments in life are moments when you are expressing your joy, not when you are seeking it.',
    'Do not try to fix whatever comes in your life. Fix yourself in such a way that whatever comes, you will be fine.',
    'If you think you are big, you become small. If you know you are nothing, you become unlimited.'
  ],

  // Background photos (in /img). Rotate slowly behind the app.
  BACKGROUNDS: ['img/bg1.jpg', 'img/bg2.jpg', 'img/bg3.jpg', 'img/bg4.jpg', 'img/bg5.jpg', 'img/bg6.jpg', 'img/bg7.jpg', 'img/bg8.jpg']
};
