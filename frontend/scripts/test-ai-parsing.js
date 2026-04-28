#!/usr/bin/env node
/**
 * End-to-end test harness for Mobile Action AI parsing (extended catalog).
 *
 * Runs sample voice commands through the live OpenAI gpt-4o-mini parser and
 * validates that the returned action sequence is the correct shape, the actions
 * exist in the catalog, and the params line up with what actionExecutor.ts
 * expects.
 *
 * Usage:
 *   export EXPO_PUBLIC_OPENAI_API_KEY=sk-...
 *   node scripts/test-ai-parsing.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Error: set EXPO_PUBLIC_OPENAI_API_KEY in your env first.');
  process.exit(1);
}

// Pull the SYSTEM_PROMPT from src/services/aiAgent.ts so this stays in sync.
const aiAgentSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'aiAgent.ts'),
  'utf8'
);
const promptMatch = aiAgentSrc.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
if (!promptMatch) {
  console.error('Could not find SYSTEM_PROMPT in aiAgent.ts');
  process.exit(1);
}
const SYSTEM_PROMPT = promptMatch[1];

const VALID_ACTIONS = new Set([
  'flashlight_on', 'flashlight_off', 'make_call', 'send_sms', 'set_alarm',
  'open_camera', 'open_maps', 'volume_up', 'volume_down', 'brightness_up',
  'brightness_down', 'wifi_settings', 'bluetooth_settings', 'airplane_settings',
  'battery_info', 'open_calendar', 'open_contacts', 'open_app', 'time_query',
  'date_query',
  // extended
  'play_youtube', 'play_spotify', 'whatsapp_send', 'gmail_compose',
  'web_search', 'open_url', 'take_note', 'create_calendar_event',
  'read_notifications', 'mute_audio', 'unmute_audio',
  'play_music', 'pause_music', 'next_track', 'previous_track',
  'take_screenshot',
  // newest batch
  'translate', 'web_fetch', 'latest_news', 'find_route', 'navigate_route',
  'share_location', 'vibrate', 'set_brightness', 'camera_front', 'camera_back',
  'lock_screen', 'go_back', 'go_home', 'show_recents',
  'scroll_up', 'scroll_down', 'tap_label', 'type_text', 'read_screen',
  // JARVIS tier
  'daily_briefing', 'small_talk',
  // location & real-time data
  'show_location',
  // file ops + alarm + tracking
  'open_file_manager', 'play_file', 'dismiss_alarm', 'snooze_alarm',
  'start_tracking', 'stop_tracking', 'share_live_location',
]);

function callOpenAI(userText) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const req = https.request(
      {
        method: 'POST',
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
      },
      (res) => {
        let chunks = '';
        res.on('data', (d) => (chunks += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(chunks);
            if (j.error) return reject(new Error(JSON.stringify(j.error)));
            const reply = j.choices[0].message.content.trim();
            const parsed = JSON.parse(reply);
            resolve(parsed.actions || []);
          } catch (e) {
            reject(new Error(`Parse error: ${e.message} — raw: ${chunks}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

const TESTS = [
  // Original 15
  { cmd: 'call mom', expect: ['make_call'], check: (a) => /mom/i.test(a[0].params.contact) },
  { cmd: 'turn on the flashlight', expect: ['flashlight_on'], check: () => true },
  { cmd: 'turn off the torch', expect: ['flashlight_off'], check: () => true },
  { cmd: 'set an alarm for 7 am tomorrow', expect: ['set_alarm'], check: (a) => String(a[0].params.hour) === '7' && Number(a[0].params.minute) === 0 },
  { cmd: 'set alarm to 6:30 pm', expect: ['set_alarm'], check: (a) => Number(a[0].params.hour) === 18 && Number(a[0].params.minute) === 30 },
  { cmd: 'call mom and set an alarm to 7 am tomorrow', expect: ['make_call', 'set_alarm'],
    check: (a) => a.find(x => x.action === 'make_call') && a.find(x => x.action === 'set_alarm') },
  { cmd: 'turn on flashlight then open whatsapp and increase volume', expect: ['flashlight_on', 'open_app', 'volume_up'],
    check: (a) => a.some(x => x.action === 'open_app' && /whatsapp/i.test(x.params.appName)) },
  { cmd: 'send sms to john saying I will be late', expect: ['send_sms'],
    check: (a) => /john/i.test(a[0].params.contact) && /late/i.test(a[0].params.message) },
  { cmd: 'what time is it', expect: ['time_query'], check: () => true },
  { cmd: 'how much battery do i have', expect: ['battery_info'], check: () => true },
  { cmd: 'navigate to the airport', expect: ['find_route'],
    check: (a) => /airport/i.test(a[0].params.destination || a[0].params.query || '') },
  { cmd: 'open camera', expect: ['open_camera'], check: () => true },
  { cmd: 'open wifi settings', expect: ['wifi_settings'], check: () => true },
  { cmd: 'sjkdfh blah blah random nonsense', expect: [], check: (a) => a.length === 0 },
  { cmd: 'call ajinkya and message him saying meeting at 5', expect: ['make_call'],
    check: (a) => a.find(x => x.action === 'make_call') && a.find(x => (x.action === 'send_sms' || x.action === 'whatsapp_send') && /5/.test(x.params.message || '')) },

  // === New extended catalog ===
  { cmd: 'play despacito on youtube', expect: ['play_youtube'],
    check: (a) => /despacito/i.test(a[0].params.query) },
  { cmd: 'open youtube and play imagine dragons believer', expect: ['play_youtube'],
    check: (a) => a.some(x => x.action === 'play_youtube' && /imagine dragons|believer/i.test(x.params.query || '')) },
  { cmd: 'play shape of you on spotify', expect: ['play_spotify'],
    check: (a) => /shape of you/i.test(a[0].params.query) },
  { cmd: 'send a whatsapp to ajinkya saying I am running late', expect: ['whatsapp_send'],
    check: (a) => /ajinkya/i.test(a[0].params.contact) && /late/i.test(a[0].params.message) },
  { cmd: 'whatsapp mom that i will be home by 8', expect: ['whatsapp_send'],
    check: (a) => /mom/i.test(a[0].params.contact) && /8/.test(a[0].params.message) },
  { cmd: 'compose an email to john at example dot com with subject hello and body see you tomorrow',
    expect: ['gmail_compose'],
    check: (a) => /example/i.test(a[0].params.to) && /hello/i.test(a[0].params.subject) },
  { cmd: 'search google for best italian restaurants', expect: ['web_search'],
    check: (a) => /italian|restaurants/i.test(a[0].params.query) },
  { cmd: 'open google.com', expect: ['open_url'],
    check: (a) => /google/i.test(a[0].params.url) },
  { cmd: 'take a note buy groceries tomorrow', expect: ['take_note'],
    check: (a) => /groceries/i.test(a[0].params.text) },
  { cmd: 'create a calendar event meeting at 3 pm', expect: ['create_calendar_event'],
    check: (a) => Number(a[0].params.hour) === 15 && /meeting/i.test(a[0].params.title) },
  { cmd: 'what are my notifications', expect: ['read_notifications'], check: () => true },
  { cmd: 'read my notifications', expect: ['read_notifications'], check: () => true },
  { cmd: 'mute the phone', expect: ['mute_audio'], check: () => true },
  { cmd: 'unmute', expect: ['unmute_audio'], check: () => true },
  { cmd: 'pause the music', expect: ['pause_music'], check: () => true },
  { cmd: 'play music', expect: ['play_music'], check: () => true },
  { cmd: 'next track', expect: ['next_track'], check: () => true },
  { cmd: 'previous song', expect: ['previous_track'], check: () => true },

  // === Multi-action with new actions ===
  { cmd: 'play despacito on youtube and turn up the volume',
    expect: ['play_youtube', 'volume_up'],
    check: (a) => a.find(x => x.action === 'play_youtube') && a.find(x => x.action === 'volume_up') },
  { cmd: 'pause music and turn down volume',
    expect: ['pause_music', 'volume_down'],
    check: (a) => a.find(x => x.action === 'pause_music') && a.find(x => x.action === 'volume_down') },
  { cmd: 'take a note call dentist tomorrow and set an alarm for 9 am',
    expect: ['take_note', 'set_alarm'],
    check: (a) => a.find(x => x.action === 'take_note' && /dentist/i.test(x.params.text))
              && a.find(x => x.action === 'set_alarm' && Number(x.params.hour) === 9) },

  // === Multi-alarm range ===
  { cmd: 'set alarms every 30 minutes from 6 am to 7 am',
    expect: ['set_alarm', 'set_alarm', 'set_alarm'],
    check: (a) => a.length >= 3 && a.every(x => x.action === 'set_alarm') },

  // === Newest batch (translate / fetch / news / route / location / hardware / accessibility) ===
  { cmd: 'translate good morning to spanish', expect: ['translate'],
    check: (a) => /good morning/i.test(a[0].params.text) && /spanish/i.test(a[0].params.target) },
  { cmd: 'translate I am hungry to hindi', expect: ['translate'],
    check: (a) => /hungry/i.test(a[0].params.text) && /hindi/i.test(a[0].params.target) },
  { cmd: 'what is the latest news on technology', expect: ['latest_news'],
    check: (a) => /tech/i.test(a[0].params.topic) },
  { cmd: 'fetch the article from example.com slash news', expect: ['web_fetch'],
    check: (a) => /example/i.test(a[0].params.url) },
  { cmd: 'navigate to mumbai airport by car', expect: ['find_route'],
    check: (a) => /mumbai/i.test(a[0].params.destination) && /driv/i.test(a[0].params.mode) },
  { cmd: 'find fastest walking route to central park', expect: ['find_route'],
    check: (a) => /central park/i.test(a[0].params.destination) && /walk/i.test(a[0].params.mode) },
  { cmd: 'share my location with mom', expect: ['share_location'],
    check: (a) => /mom/i.test(a[0].params.contact) },
  { cmd: 'turn on front camera', expect: ['camera_front'], check: () => true },
  { cmd: 'open back camera', expect: ['camera_back'], check: () => true },
  { cmd: 'set brightness to 80 percent', expect: ['set_brightness'],
    check: (a) => Number(a[0].params.level) === 80 },
  { cmd: 'vibrate the phone', expect: ['vibrate'], check: () => true },
  { cmd: 'lock the phone', expect: ['lock_screen'], check: () => true },
  { cmd: 'go back', expect: ['go_back'], check: () => true },
  { cmd: 'go to home screen', expect: ['go_home'], check: () => true },
  { cmd: 'scroll down', expect: ['scroll_down'], check: () => true },
  { cmd: 'scroll up', expect: ['scroll_up'], check: () => true },
  { cmd: 'tap the login button', expect: ['tap_label'],
    check: (a) => /login/i.test(a[0].params.label) },
  { cmd: 'read whats on screen', expect: ['read_screen'], check: () => true },
  // JARVIS tier
  { cmd: 'good morning', expect: ['daily_briefing'], check: () => true },
  { cmd: 'give me a briefing', expect: ['daily_briefing'], check: () => true },
  { cmd: 'how are you', expect: ['small_talk'], check: () => true },
  { cmd: 'tell me a joke', expect: ['small_talk'], check: () => true },
  { cmd: 'thanks', expect: ['small_talk'], check: () => true },
  // === Generic-app control via Accessibility (Excel / Word / PDF / SOS / etc) ===
  { cmd: 'open excel and tap cell A1 and type 100',
    expect: ['open_app', 'tap_label', 'type_text'],
    check: (a) => a.find(x => x.action === 'open_app' && /excel/i.test(x.params.appName))
              && a.find(x => x.action === 'tap_label' && /A1/i.test(x.params.label))
              && a.find(x => x.action === 'type_text' && /100/.test(x.params.text)) },
  { cmd: 'open word and type my address',
    expect: ['open_app', 'type_text'],
    check: (a) => a.find(x => x.action === 'open_app' && /word/i.test(x.params.appName))
              && a.find(x => x.action === 'type_text') },
  { cmd: 'open the pdf and scroll down',
    expect: ['open_app', 'scroll_down'],
    check: (a) => a.find(x => x.action === 'open_app' && /pdf/i.test(x.params.appName))
              && a.find(x => x.action === 'scroll_down') },
  { cmd: 'open my sos app and tap emergency',
    expect: ['open_app', 'tap_label'],
    check: (a) => a.find(x => x.action === 'open_app' && /sos/i.test(x.params.appName))
              && a.find(x => x.action === 'tap_label' && /emergency/i.test(x.params.label)) },
  { cmd: 'open whatsapp tap mom type meeting at 5 and tap send',
    expect: ['open_app', 'tap_label', 'type_text', 'tap_label'],
    check: (a) => a[0].action === 'open_app' && a.filter(x => x.action === 'tap_label').length >= 2
              && a.find(x => x.action === 'type_text' && /5/.test(x.params.text)) },
  // === Real-time data → web_search ===
  { cmd: "what's today's gold rate", expect: ['web_search'],
    check: (a) => /gold/i.test(a[0].params.query) },
  { cmd: 'current bitcoin price', expect: ['web_search'],
    check: (a) => /bitcoin/i.test(a[0].params.query) },
  { cmd: 'match score india vs australia', expect: ['web_search'],
    check: (a) => /india|australia|score/i.test(a[0].params.query) },
  { cmd: "what's the weather like today", expect: ['web_search'],
    check: (a) => /weather/i.test(a[0].params.query) },
  { cmd: 'google something funny', expect: ['web_search'], check: () => true },
  // === Location ===
  { cmd: 'where am i show on map', expect: ['show_location'], check: () => true },
  { cmd: 'open my location on map', expect: ['show_location'], check: () => true },
  { cmd: 'show my current location', expect: ['show_location'], check: () => true },

  // === File ops + media + alarm dismiss + tracking + live location ===
  { cmd: 'open file manager', expect: ['open_file_manager'], check: () => true },
  { cmd: 'open the download folder', expect: ['open_file_manager'],
    check: (a) => /download/i.test((a[0].params.folder || a[0].params.path || '')) },
  { cmd: 'play the song titled hotel california', expect: ['play_file'],
    check: (a) => /hotel california/i.test(a[0].params.name) && /audio/i.test(a[0].params.type) },
  { cmd: 'play my video about my birthday', expect: ['play_file'],
    check: (a) => /birthday/i.test(a[0].params.name) && /video/i.test(a[0].params.type) },
  { cmd: 'turn off the alarm', expect: ['dismiss_alarm'], check: () => true },
  { cmd: 'stop the alarm', expect: ['dismiss_alarm'], check: () => true },
  { cmd: 'dismiss the alarm', expect: ['dismiss_alarm'], check: () => true },
  { cmd: 'snooze the alarm', expect: ['snooze_alarm'], check: () => true },
  { cmd: 'track my location for 30 minutes', expect: ['start_tracking'],
    check: (a) => Number(a[0].params.duration) === 30 },
  { cmd: 'stop tracking', expect: ['stop_tracking'], check: () => true },
  { cmd: 'share my live location with mom for 1 hour', expect: ['share_live_location'],
    check: (a) => /mom/i.test(a[0].params.contact) && Number(a[0].params.minutes) >= 60 },
];

(async () => {
  let pass = 0;
  let fail = 0;
  console.log(`\nRunning ${TESTS.length} test(s) against gpt-4o-mini...\n`);

  for (const t of TESTS) {
    process.stdout.write(`▶ "${t.cmd}"\n`);
    try {
      const actions = await callOpenAI(t.cmd);
      const actionNames = actions.map((a) => a.action);

      const unknown = actionNames.filter((n) => !VALID_ACTIONS.has(n));
      if (unknown.length) {
        console.log(`  ❌ Unknown action(s): ${unknown.join(', ')}`);
        fail++;
        continue;
      }

      const missing = t.expect.filter((e) => !actionNames.includes(e));
      if (missing.length || (t.expect.length && actionNames.length === 0)) {
        console.log(`  ❌ Expected ${JSON.stringify(t.expect)}, got ${JSON.stringify(actionNames)}`);
        fail++;
        continue;
      }

      if (!t.check(actions)) {
        console.log(`  ❌ Param check failed. Got: ${JSON.stringify(actions)}`);
        fail++;
        continue;
      }

      console.log(`  ✅ ${JSON.stringify(actionNames)}`);
      pass++;
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n${pass}/${TESTS.length} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})();
