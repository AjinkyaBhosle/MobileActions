import axios from 'axios';

// Read the key from Expo public env at build time.
// Set EXPO_PUBLIC_OPENAI_API_KEY in /app/frontend/.env (see .env.example).
//
// SECURITY NOTE: EXPO_PUBLIC_* vars are baked into the JS bundle and visible
// to anyone who decompiles the APK. For production, proxy these calls through
// your own backend (e.g., backend/server.py) so the key never leaves the server.
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

export interface AIActionResponse {
  action: string;
  params?: Record<string, any>;
}

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
3.  make_call            — params: {"contact": "<name or phone number>"}    (e.g. "mom", "John Smith", "+1234567890")
4.  send_sms             — params: {"contact": "<name or number>", "message": "<text>"}
5.  set_alarm            — params: {"hour": "<0-23>", "minute": "<0-59>", "label": "<optional>"}
6.  open_camera          — params: {}
7.  open_maps            — params: {"query": "<destination>"}   (omit if no destination)
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
18. open_app             — params: {"appName": "<lowercase name>"}    (e.g. "whatsapp", "youtube", "spotify")
19. time_query           — params: {}
20. date_query           — params: {}

PARSING NOTES:
- Convert spoken time to 24-hour: "7am" → hour 7, minute 0. "7:30 pm" → hour 19, minute 30. "noon" → hour 12. "midnight" → hour 0.
- Strip wake words ("hey mobile", "ok mobile", etc.) from your understanding.
- If user says "tomorrow" with an alarm, just use the time — Android schedules for next occurrence.
- Phone number in spoken digits → join digits, no spaces. ("two zero one five five five" → "201555")

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

export const processCommandWithAI = async (commandText: string): Promise<AIActionResponse[]> => {
  if (!OPENAI_API_KEY) {
    console.error("[AI Agent] Missing EXPO_PUBLIC_OPENAI_API_KEY. Add it to frontend/.env and rebuild.");
    throw new Error("Missing OpenAI API Key");
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: commandText }
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000,
      }
    );

    const reply: string = response.data.choices[0].message.content.trim();
    let parsed: { actions?: AIActionResponse[] };
    try {
      parsed = JSON.parse(reply);
    } catch (parseErr) {
      // Fallback: strip markdown fences if model ignored json mode
      const cleaned = reply.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    console.log('[AI Agent] Parsed', actions.length, 'action(s):', JSON.stringify(actions));
    return actions;
  } catch (error: any) {
    console.error("[AI Agent] Failed:", error?.response?.data || error?.message || error);
    throw error;
  }
};
