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
- Multi-alarm ranges like "every 5 minutes from 7 to 8" → expand into one set_alarm per time slot.
- If you cannot understand the command, return {"actions": []}.
- Do not include explanations, markdown, or any text outside the JSON object.

ACTION CATALOG (use these exact names):
1.  flashlight_on              params: {}
2.  flashlight_off             params: {}
3.  make_call                  params: {"contact": "<name or phone number>"}
4.  send_sms                   params: {"contact": "<name or number>", "message": "<text>"}
5.  set_alarm                  params: {"hour": "<0-23>", "minute": "<0-59>", "label": "<optional>"}
6.  open_camera                params: {}
7.  open_maps                  params: {"query": "<destination>"}
8.  volume_up                  params: {}
9.  volume_down                params: {}
10. brightness_up              params: {}
11. brightness_down            params: {}
12. wifi_settings              params: {}
13. bluetooth_settings         params: {}
14. airplane_settings          params: {}
15. battery_info               params: {}
16. open_calendar              params: {}
17. open_contacts              params: {}
18. open_app                   params: {"appName": "<lowercase name>"}
19. time_query                 params: {}
20. date_query                 params: {}
21. play_youtube               params: {"query": "<song or video>"}
22. play_spotify               params: {"query": "<song or playlist>"}
23. whatsapp_send              params: {"contact": "<name or number>", "message": "<text>"}
24. gmail_compose              params: {"to": "<email>", "subject": "<...>", "body": "<...>"}
25. web_search                 params: {"query": "<search terms>"}
26. open_url                   params: {"url": "<full or partial url>"}
27. take_note                  params: {"text": "<note content>"}
28. create_calendar_event      params: {"title": "<event>", "hour": "<0-23>", "minute": "<0-59>"}
29. read_notifications         params: {}
30. mute_audio                 params: {}
31. unmute_audio               params: {}
32. play_music                 params: {}
33. pause_music                params: {}
34. next_track                 params: {}
35. previous_track             params: {}
36. take_screenshot            params: {}

PARSING NOTES:
- 24-hour conversion: "7am" → 7:00, "7:30 pm" → 19:30, "noon" → 12:00, "midnight" → 0:00.
- Strip wake words ("hey mobile", etc.) from your understanding.
- Spoken digits → joined number ("two zero one" → "201").
- For YouTube/Spotify, extract the song/artist into the query.
- For WhatsApp/Gmail, extract recipient and message body separately.
- "Take a note that I need milk" → {"text": "I need milk"}
- "Set alarms every 5 min from 7 to 8 am" → 13 set_alarm actions: 7:00, 7:05, 7:10, ..., 8:00.

EXAMPLES:
User: "call mom and set an alarm to 7 am tomorrow"
Response: {"actions":[{"action":"make_call","params":{"contact":"mom"}},{"action":"set_alarm","params":{"hour":"7","minute":"0"}}]}

User: "play despacito on youtube"
Response: {"actions":[{"action":"play_youtube","params":{"query":"despacito"}}]}

User: "send a whatsapp to ajinkya saying I'm running late"
Response: {"actions":[{"action":"whatsapp_send","params":{"contact":"ajinkya","message":"I'm running late"}}]}

User: "compose an email to john@example.com with subject hello and body see you tomorrow"
Response: {"actions":[{"action":"gmail_compose","params":{"to":"john@example.com","subject":"hello","body":"see you tomorrow"}}]}

User: "search google for best restaurants near me"
Response: {"actions":[{"action":"web_search","params":{"query":"best restaurants near me"}}]}

User: "take a note buy groceries tomorrow"
Response: {"actions":[{"action":"take_note","params":{"text":"buy groceries tomorrow"}}]}

User: "what are my notifications"
Response: {"actions":[{"action":"read_notifications","params":{}}]}

User: "set alarms every 30 minutes from 6am to 7am"
Response: {"actions":[{"action":"set_alarm","params":{"hour":"6","minute":"0"}},{"action":"set_alarm","params":{"hour":"6","minute":"30"}},{"action":"set_alarm","params":{"hour":"7","minute":"0"}}]}

User: "pause the music and turn down the volume"
Response: {"actions":[{"action":"pause_music","params":{}},{"action":"volume_down","params":{}}]}

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
