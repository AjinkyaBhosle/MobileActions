#!/usr/bin/env node
/**
 * End-to-end test harness for Mobile Action AI parsing.
 *
 * Runs sample voice commands through the live OpenAI gpt-4o-mini parser and
 * validates that the returned action sequence is the correct shape, the actions
 * exist in the catalog, and the params line up with what actionExecutor.ts
 * expects.
 *
 * Usage:
 *   export EXPO_PUBLIC_OPENAI_API_KEY=sk-...
 *   node scripts/test-ai-parsing.js
 *
 * Or pass the key inline:
 *   EXPO_PUBLIC_OPENAI_API_KEY=sk-... node scripts/test-ai-parsing.js
 */

const https = require('https');

const API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Error: set EXPO_PUBLIC_OPENAI_API_KEY in your env first.');
  process.exit(1);
}

// Keep prompt in lock-step with src/services/aiAgent.ts
const SYSTEM_PROMPT = `You are the brain of "Mobile Action", a voice automation app for Android.
Convert the user's spoken command into a sequence of structured action objects.

CRITICAL RULES:
- Output STRICT JSON in this exact shape: {"actions": [<action>, ...]}
- Use ONLY action names from the catalog below — no others.
- If the user requests multiple things ("call mom AND set alarm AND turn on flashlight"), return ONE action object per request, in the order spoken.
- If you cannot understand the command, return {"actions": []}.
- Do not include explanations, markdown, or any text outside the JSON object.

ACTION CATALOG (use these exact names):
1.  flashlight_on        — params: {}
2.  flashlight_off       — params: {}
3.  make_call            — params: {"contact": "<name or phone number>"}
4.  send_sms             — params: {"contact": "<name or number>", "message": "<text>"}
5.  set_alarm            — params: {"hour": "<0-23>", "minute": "<0-59>", "label": "<optional>"}
6.  open_camera          — params: {}
7.  open_maps            — params: {"query": "<destination>"}
8.  volume_up            — params: {}
9.  volume_down          — params: {}
10. brightness_up        — params: {}
11. brightness_down      — params: {}
12. wifi_settings        — params: {}
13. bluetooth_settings   — params: {}
14. airplane_settings    — params: {}
15. battery_info         — params: {}
16. open_calendar        — params: {}
17. open_contacts        — params: {}
18. open_app             — params: {"appName": "<lowercase name>"}
19. time_query           — params: {}
20. date_query           — params: {}

PARSING NOTES:
- Convert spoken time to 24-hour: "7am" → hour 7, minute 0. "7:30 pm" → hour 19, minute 30. "noon" → hour 12. "midnight" → hour 0.
- Strip wake words ("hey mobile", "ok mobile", etc.) from your understanding.
- If user says "tomorrow" with an alarm, just use the time — Android schedules for next occurrence.
- Phone number in spoken digits → join digits, no spaces.

EXAMPLES:
User: "call mom and set an alarm to 7 am tomorrow"
Response: {"actions":[{"action":"make_call","params":{"contact":"mom"}},{"action":"set_alarm","params":{"hour":"7","minute":"0"}}]}

User: "turn on the flashlight then open whatsapp"
Response: {"actions":[{"action":"flashlight_on","params":{}},{"action":"open_app","params":{"appName":"whatsapp"}}]}

User: "send a message to john saying I'll be late"
Response: {"actions":[{"action":"send_sms","params":{"contact":"john","message":"I'll be late"}}]}

User: "what time is it"
Response: {"actions":[{"action":"time_query","params":{}}]}

User: "wxyzqq blah blah"
Response: {"actions":[]}`;

const VALID_ACTIONS = new Set([
  'flashlight_on', 'flashlight_off', 'make_call', 'send_sms', 'set_alarm',
  'open_camera', 'open_maps', 'volume_up', 'volume_down', 'brightness_up',
  'brightness_down', 'wifi_settings', 'bluetooth_settings', 'airplane_settings',
  'battery_info', 'open_calendar', 'open_contacts', 'open_app', 'time_query',
  'date_query',
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
        timeout: 20000,
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

// Test cases: [user input, expected action(s) in any order, validator]
const TESTS = [
  {
    cmd: 'call mom',
    expect: ['make_call'],
    check: (acts) => acts[0].params.contact && /mom/i.test(acts[0].params.contact),
  },
  {
    cmd: 'turn on the flashlight',
    expect: ['flashlight_on'],
    check: () => true,
  },
  {
    cmd: 'turn off the torch',
    expect: ['flashlight_off'],
    check: () => true,
  },
  {
    cmd: 'set an alarm for 7 am tomorrow',
    expect: ['set_alarm'],
    check: (acts) => String(acts[0].params.hour) === '7' && Number(acts[0].params.minute) === 0,
  },
  {
    cmd: 'set alarm to 6:30 pm',
    expect: ['set_alarm'],
    check: (acts) => Number(acts[0].params.hour) === 18 && Number(acts[0].params.minute) === 30,
  },
  {
    cmd: 'call mom and set an alarm to 7 am tomorrow',
    expect: ['make_call', 'set_alarm'],
    check: (acts) => {
      const call = acts.find((a) => a.action === 'make_call');
      const al = acts.find((a) => a.action === 'set_alarm');
      return call && /mom/i.test(call.params.contact) && al && String(al.params.hour) === '7';
    },
  },
  {
    cmd: 'turn on flashlight then open whatsapp and increase volume',
    expect: ['flashlight_on', 'open_app', 'volume_up'],
    check: (acts) => acts.some((a) => a.action === 'open_app' && /whatsapp/i.test(a.params.appName)),
  },
  {
    cmd: 'send a message to john saying I will be late',
    expect: ['send_sms'],
    check: (acts) => /john/i.test(acts[0].params.contact) && /late/i.test(acts[0].params.message),
  },
  {
    cmd: 'what time is it',
    expect: ['time_query'],
    check: () => true,
  },
  {
    cmd: 'how much battery do i have',
    expect: ['battery_info'],
    check: () => true,
  },
  {
    cmd: 'navigate to the airport',
    expect: ['open_maps'],
    check: (acts) => /airport/i.test(acts[0].params.query || ''),
  },
  {
    cmd: 'open camera and take a selfie',
    expect: ['open_camera'],
    check: () => true,
  },
  {
    cmd: 'open wifi settings',
    expect: ['wifi_settings'],
    check: () => true,
  },
  {
    cmd: 'sjkdfh blah blah random nonsense',
    expect: [],
    check: (acts) => acts.length === 0,
  },
  {
    cmd: 'call ajinkya and message him saying meeting at 5',
    expect: ['make_call', 'send_sms'],
    check: (acts) => {
      const call = acts.find((a) => a.action === 'make_call');
      const sms = acts.find((a) => a.action === 'send_sms');
      return !!call && !!sms && /5/.test(sms.params.message || '');
    },
  },
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

      // 1. all action names must be in catalog
      const unknown = actionNames.filter((n) => !VALID_ACTIONS.has(n));
      if (unknown.length) {
        console.log(`  ❌ Unknown action(s): ${unknown.join(', ')}`);
        fail++;
        continue;
      }

      // 2. expected actions must all be present (any order)
      const missing = t.expect.filter((e) => !actionNames.includes(e));
      const extra = actionNames.filter((a) => !t.expect.includes(a));
      if (missing.length || (t.expect.length && actionNames.length === 0)) {
        console.log(`  ❌ Expected ${JSON.stringify(t.expect)}, got ${JSON.stringify(actionNames)}`);
        fail++;
        continue;
      }

      // 3. param validator
      if (!t.check(actions)) {
        console.log(`  ❌ Param check failed. Got: ${JSON.stringify(actions)}`);
        fail++;
        continue;
      }

      console.log(`  ✅ ${JSON.stringify(actionNames)}${extra.length ? ` (extras: ${extra.join(',')})` : ''}`);
      pass++;
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n${pass}/${TESTS.length} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})();
