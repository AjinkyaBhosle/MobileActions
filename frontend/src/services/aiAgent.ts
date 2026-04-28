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

export const processCommandWithAI = async (commandText: string): Promise<AIActionResponse[]> => {
  if (!OPENAI_API_KEY) {
    console.error("[AI Agent] Missing EXPO_PUBLIC_OPENAI_API_KEY. Add it to frontend/.env and rebuild.");
    throw new Error("Missing OpenAI API Key");
  }

  const systemPrompt = `
You are the intelligent Brain for a mobile automation agent.
Your job is to read the user's natural language command and convert it into one or more JSON action objects.
You control the user's Android phone.

Available actions you can perform (use these exact names):
1.  "flashlight_on"      — Turns the flashlight on. No params.
2.  "flashlight_off"     — Turns the flashlight off. No params.
3.  "make_call"          — Calls a phone number or contact. params: { "contact": "<name or number>" }
4.  "send_sms"           — Sends a text message. params: { "contact": "<name or number>", "message": "<body>" }
5.  "set_alarm"          — Sets an alarm. params: { "hour": "7", "minute": "30" }
6.  "open_camera"        — Opens the camera app. No params.
7.  "open_maps"          — Opens maps. params: { "query": "<destination>" } (optional)
8.  "volume_up"          — Increases volume. No params.
9.  "volume_down"        — Decreases volume. No params.
10. "brightness_up"      — Increases brightness. No params.
11. "brightness_down"    — Decreases brightness. No params.
12. "wifi_settings"      — Opens WiFi settings. No params.
13. "bluetooth_settings" — Opens Bluetooth settings. No params.
14. "airplane_settings"  — Opens Airplane mode settings. No params.
15. "battery_info"       — Reports battery level. No params.
16. "open_calendar"      — Opens the calendar app. No params.
17. "open_contacts"      — Opens contacts app. No params.
18. "open_app"           — Opens any app. params: { "appName": "<name>", "packageName": "<android.pkg>" } (packageName optional)
19. "time_query"         — Tells the current time. No params.
20. "date_query"         — Tells today's date. No params.

Output Requirements:
- Return ONLY a raw JSON array of action objects, no markdown, no explanation.
- If multiple actions are requested, return them in order.
- If you cannot map the command, return an empty array [].

Example Output:
[
  {"action": "flashlight_on", "params": {}},
  {"action": "send_sms", "params": {"contact": "John", "message": "I'll be late"}}
]
`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: commandText }
        ],
        temperature: 0.1,
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
    // Clean up potential markdown formatting
    const jsonString = reply.replace(/```json/g, '').replace(/```/g, '').trim();
    const actions = JSON.parse(jsonString) as AIActionResponse[];
    return Array.isArray(actions) ? actions : [];

  } catch (error: any) {
    console.error("[AI Agent] Failed to process command:", error?.message || error);
    throw error;
  }
};
