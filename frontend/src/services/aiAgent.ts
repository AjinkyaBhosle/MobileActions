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

export interface ConversationContext {
  /** Last N user commands + interpretations, oldest → newest */
  history: { user: string; actions: AIActionResponse[] }[];
  /** Optional persona — 'jarvis' enables witty butler tone */
  persona?: 'jarvis' | 'neutral';
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
18. open_app                   params: {"appName": "<any installed app's display name, e.g. 'whatsapp', 'excel', 'word', 'pdf reader', 'adobe reader', 'my bank app', 'sos'>"}
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
37. translate                  params: {"text": "<text>", "target": "<language e.g. Spanish, Hindi>"}
38. web_fetch                  params: {"url": "<URL to fetch and summarize>"}
39. latest_news                params: {"topic": "<news topic, e.g. tech, sports, world>"}
40. find_route                 params: {"destination": "<place>", "origin": "<optional>", "mode": "driving|walking|bicycling|transit"}
41. share_location             params: {"contact": "<optional name or number>"}  — when the user wants to SEND their location to someone
42. show_location              params: {}  — when the user wants to SEE their own location on a map ("where am I", "show my location", "open my location on map")
42. vibrate                    params: {"duration": "<ms, default 500>"}
43. set_brightness             params: {"level": "<0-100>"}
44. camera_front               params: {}
45. camera_back                params: {}
46. lock_screen                params: {}
47. go_back                    params: {}
48. go_home                    params: {}
49. show_recents               params: {}
50. scroll_up                  params: {}
51. scroll_down                params: {}
52. tap_label                  params: {"label": "<visible text on a button or link>"}
53. type_text                  params: {"text": "<text to type into focused field>"}
54. read_screen                params: {}
55. daily_briefing             params: {}                    — for "good morning", "what's my status", "give me a briefing", "morning briefing"
56. small_talk                 params: {"text": "<original utterance>"}
57. open_file_manager          params: {"folder": "<optional path like 'Download', 'DCIM'>"}
58. play_file                  params: {"name": "<file name fragment>", "type": "audio|video|any"}
59. dismiss_alarm              params: {}     — when user says 'turn off the alarm', 'stop the alarm', 'dismiss alarm'
60. snooze_alarm               params: {}     — when user says 'snooze', 'snooze the alarm', 'remind me in 10 minutes'
61. start_tracking             params: {"duration": "<minutes, default 30>", "interval": "<seconds, default 30>"}
62. stop_tracking              params: {}
63. share_live_location        params: {"contact": "<optional name>", "minutes": "<duration, default 60>"}
64. take_photo                 params: {"front": "<true if selfie>", "autoShutter": "<true to auto-click after open>"}
65. record_audio               params: {}
66. record_video               params: {}
67. copy_text                  params: {"text": "<optional text to set on clipboard; otherwise copies current selection>"}
68. cut_text                   params: {}
69. paste_text                 params: {"text": "<optional text to put on clipboard before pasting>"}
70. select_all                 params: {}
71. ai_chat                    params: {"text": "<the user's question/audit/compare/solve/answer/chat request>"}  — for ANYTHING that is not a phone-control action: questions, math, reasoning, comparisons, audits, jokes, advice, explanations, "what is", "why", "how", "tell me about", "compare X and Y", "is this correct", etc.

CRITICAL FALLBACK RULE:
- If a user's command does NOT clearly match any phone-control action above (1-70),
  AND it's not blank/nonsense, route it to ai_chat with the original text. The AI
  will reason about it. NEVER return {"actions": []} for an intelligible question.
- Example: "tell me about quantum physics" → ai_chat
           "is 2 plus 2 four" → ai_chat
           "compare iphone vs samsung" → ai_chat
           "audit this email i wrote" → ai_chat
           "what should i wear today" → ai_chat (if no specific app action requested)
- Real-time data still goes to web_search (gold rate, sports score, weather).

PARSING NOTES:
- 24-hour conversion: "7am" → 7:00, "7:30 pm" → 19:30, "noon" → 12:00, "midnight" → 0:00.
- Strip wake words ("hey mobile", "hi mobile", "ok mobile", "mobile", etc.) from your understanding.
- Spoken digits → joined number ("two zero one" → "201").
- For YouTube/Spotify, extract the song/artist into the query.
- For WhatsApp/Gmail, extract recipient and message body separately.
- "Take a note that I need milk" → {"text": "I need milk"}
- "Set alarms every 5 min from 7 to 8 am" → 13 set_alarm actions: 7:00, 7:05, 7:10, ..., 8:00.

CONTEXT / PRONOUN RESOLUTION:
- Conversation history is provided as prior turns. Use it to resolve pronouns.
- "call her back" / "him back" / "them" → look up the most recent make_call action's contact and reuse it.
- "send the same message to dad" → reuse last send_sms/whatsapp_send 'message' field, set contact to "dad".
- "do that again" / "repeat that" → re-emit the most recent action verbatim.
- "and then ..." → append to chain; do not include the historical action.
- "cancel that" / "never mind" → return {"actions": []}.

REAL-TIME DATA QUERIES (gold rate, stock price, sports score, weather, exchange rate, current news, "what is X today"):
- You DO NOT have live data. Never invent numbers.
- Always route to web_search with a precise query.
  Examples: "what's today's gold rate" → {"actions":[{"action":"web_search","params":{"query":"today gold rate"}}]}
            "current bitcoin price" → web_search "current bitcoin price"
            "match score india vs australia" → web_search "match score india vs australia"
            "today's weather" → web_search "today's weather"
- For "what time is it" or "what date is it" → use the offline time_query / date_query (the device clock IS real-time).

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

User: "translate good morning to spanish"
Response: {"actions":[{"action":"translate","params":{"text":"good morning","target":"Spanish"}}]}

User: "what is the latest news on technology"
Response: {"actions":[{"action":"latest_news","params":{"topic":"technology"}}]}

User: "navigate to mumbai airport by car"
Response: {"actions":[{"action":"find_route","params":{"destination":"mumbai airport","mode":"driving"}}]}

User: "find fastest walking route to central park"
Response: {"actions":[{"action":"find_route","params":{"destination":"central park","mode":"walking"}}]}

User: "share my location with mom"
Response: {"actions":[{"action":"share_location","params":{"contact":"mom"}}]}

User: "turn on front camera"
Response: {"actions":[{"action":"camera_front","params":{}}]}

User: "open the back camera"
Response: {"actions":[{"action":"camera_back","params":{}}]}

User: "set brightness to 80 percent"
Response: {"actions":[{"action":"set_brightness","params":{"level":"80"}}]}

User: "vibrate the phone"
Response: {"actions":[{"action":"vibrate","params":{"duration":"800"}}]}

User: "lock the phone"
Response: {"actions":[{"action":"lock_screen","params":{}}]}

User: "go back"
Response: {"actions":[{"action":"go_back","params":{}}]}

User: "go to home screen"
Response: {"actions":[{"action":"go_home","params":{}}]}

User: "scroll down"
Response: {"actions":[{"action":"scroll_down","params":{}}]}

User: "tap the login button"
Response: {"actions":[{"action":"tap_label","params":{"label":"login"}}]}

User: "type my email address"
Response: {"actions":[{"action":"type_text","params":{"text":"my email address"}}]}

User: "read whats on screen"
Response: {"actions":[{"action":"read_screen","params":{}}]}

User: "fetch the article from example.com/news and summarize it"
Response: {"actions":[{"action":"web_fetch","params":{"url":"example.com/news"}}]}

User: "open file manager"
Response: {"actions":[{"action":"open_file_manager","params":{}}]}

User: "open download folder"
Response: {"actions":[{"action":"open_file_manager","params":{"folder":"Download"}}]}

User: "play the song titled hotel california"
Response: {"actions":[{"action":"play_file","params":{"name":"hotel california","type":"audio"}}]}

User: "play my video about my birthday"
Response: {"actions":[{"action":"play_file","params":{"name":"birthday","type":"video"}}]}

User: "turn off the alarm" / "stop the alarm" / "dismiss alarm"
Response: {"actions":[{"action":"dismiss_alarm","params":{}}]}

User: "snooze the alarm" / "snooze for 10 minutes"
Response: {"actions":[{"action":"snooze_alarm","params":{}}]}

User: "track my location for 30 minutes"
Response: {"actions":[{"action":"start_tracking","params":{"duration":"30","interval":"30"}}]}

User: "stop tracking"
Response: {"actions":[{"action":"stop_tracking","params":{}}]}

User: "share my live location with mom for 1 hour"
Response: {"actions":[{"action":"share_live_location","params":{"contact":"mom","minutes":"60"}}]}

User: "take a photo" / "click a picture"
Response: {"actions":[{"action":"take_photo","params":{}}]}

User: "take a selfie"
Response: {"actions":[{"action":"take_photo","params":{"front":true}}]}

User: "record audio"
Response: {"actions":[{"action":"record_audio","params":{}}]}

User: "record a video"
Response: {"actions":[{"action":"record_video","params":{}}]}

User: "copy hello world to clipboard"
Response: {"actions":[{"action":"copy_text","params":{"text":"hello world"}}]}

User: "paste"
Response: {"actions":[{"action":"paste_text","params":{}}]}

User: "select all"
Response: {"actions":[{"action":"select_all","params":{}}]}

User: "what is 2 plus 2"
Response: {"actions":[{"action":"ai_chat","params":{"text":"what is 2 plus 2"}}]}

User: "compare iphone vs samsung"
Response: {"actions":[{"action":"ai_chat","params":{"text":"compare iphone vs samsung"}}]}

User: "audit my last note for grammar mistakes"
Response: {"actions":[{"action":"ai_chat","params":{"text":"audit my last note for grammar mistakes"}}]}

User: "solve x squared plus 5x plus 6 equals 0"
Response: {"actions":[{"action":"ai_chat","params":{"text":"solve x squared plus 5x plus 6 equals 0"}}]}

User: "tell me about quantum physics"
Response: {"actions":[{"action":"ai_chat","params":{"text":"tell me about quantum physics"}}]}

(Vague/incomplete user input — model should still route sensibly:)
User: "uhh, the thing... call mom?"
Response: {"actions":[{"action":"make_call","params":{"contact":"mom"}}]}

(Misspelled — model should normalize:)
User: "set alram for sevn am"
Response: {"actions":[{"action":"set_alarm","params":{"hour":"7","minute":"0"}}]}

User: "open excel and tap cell A1 and type 100"
Response: {"actions":[{"action":"open_app","params":{"appName":"excel"}},{"action":"tap_label","params":{"label":"A1"}},{"action":"type_text","params":{"text":"100"}}]}

User: "open word and type my address is 123 main street"
Response: {"actions":[{"action":"open_app","params":{"appName":"word"}},{"action":"type_text","params":{"text":"my address is 123 main street"}}]}

User: "open the pdf and scroll down"
Response: {"actions":[{"action":"open_app","params":{"appName":"pdf"}},{"action":"scroll_down","params":{}}]}

User: "open my sos app and tap emergency"
Response: {"actions":[{"action":"open_app","params":{"appName":"sos"}},{"action":"tap_label","params":{"label":"emergency"}}]}

User: "open whatsapp tap mom type meeting at 5 and tap send"
Response: {"actions":[{"action":"open_app","params":{"appName":"whatsapp"}},{"action":"tap_label","params":{"label":"mom"}},{"action":"type_text","params":{"text":"meeting at 5"}},{"action":"tap_label","params":{"label":"send"}}]}

User: "good morning"
Response: {"actions":[{"action":"daily_briefing","params":{}}]}

User: "give me a briefing"
Response: {"actions":[{"action":"daily_briefing","params":{}}]}

User: "how are you"
Response: {"actions":[{"action":"small_talk","params":{"text":"how are you"}}]}

User: "tell me a joke"
Response: {"actions":[{"action":"small_talk","params":{"text":"tell me a joke"}}]}

User: "thank you" / "thanks jarvis"
Response: {"actions":[{"action":"small_talk","params":{"text":"thank you"}}]}

PRONOUN-RESOLUTION EXAMPLE (using prior conversation history):
[prior turn] user: "call mom"   assistant: {"actions":[{"action":"make_call","params":{"contact":"mom"}}]}
User: "send her a message saying running late"
Response: {"actions":[{"action":"send_sms","params":{"contact":"mom","message":"running late"}}]}

User: "wxyzqq blah blah"
Response: {"actions":[]}`;

export const processCommandWithAI = async (
  commandText: string,
  context: ConversationContext = { history: [], persona: 'jarvis' }
): Promise<AIActionResponse[]> => {
  if (!OPENAI_API_KEY) {
    console.error("[AI Agent] Missing EXPO_PUBLIC_OPENAI_API_KEY. Add it to frontend/.env and rebuild.");
    throw new Error("Missing OpenAI API Key");
  }

  // Build messages with conversation history for pronoun resolution.
  // ('call her back' → look up the last make_call's contact).
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];
  for (const turn of (context.history || []).slice(-5)) {
    messages.push({ role: 'user', content: turn.user });
    messages.push({ role: 'assistant', content: JSON.stringify({ actions: turn.actions }) });
  }
  messages.push({ role: 'user', content: commandText });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages,
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

// ─── Helper: free-form OpenAI calls (translation, summary, news) ───────────

export async function chat(systemPrompt: string, userPrompt: string, opts: { json?: boolean } = {}): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('Missing OpenAI API Key');
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    },
    {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    }
  );
  return (response.data.choices[0].message.content || '').trim();
}

export async function translateWithAI(text: string, target: string): Promise<string> {
  return chat(
    `You are a translator. Translate the user's text to ${target}. Return ONLY the translation, no quotes, no explanation.`,
    text
  );
}

export async function summarizeWithAI(text: string): Promise<string> {
  return chat(
    'Summarize the user\'s text in 2-3 short spoken sentences. Use plain language, no markdown.',
    text.length > 6000 ? text.slice(0, 6000) : text
  );
}

export async function newsBriefingWithAI(topic: string): Promise<string> {
  return chat(
    'You are a news briefer. Give a 3-sentence verbal summary of likely current top headlines on the requested topic. ' +
    'Use phrases like "in recent news" or "lately" — do not invent specific dates or breaking events. End by suggesting the user open a news app for full details.',
    `Topic: ${topic}`
  );
}

/**
 * Generate a JARVIS-style witty reply for a non-action utterance
 * (greetings, small talk, confirmations).
 */
export async function jarvisReplyWithAI(userText: string, context?: ConversationContext): Promise<string> {
  const persona = (context?.persona ?? 'jarvis') === 'jarvis'
    ? 'You are J.A.R.V.I.S., a witty, formal British-butler AI assistant. Address the user as "sir" or "ma\'am". Keep replies to 1-2 short spoken sentences. Be dry, helpful, slightly cheeky. No markdown.'
    : 'You are a helpful concise voice assistant. 1 short sentence reply. No markdown.';
  return chat(persona, userText);
}

/**
 * Synthesize a JARVIS-style daily briefing from supplied context facts.
 * `facts` is a free-text bag like "battery 87%; 5 unread WhatsApp; 2 alarms today; 14:32".
 */
export async function dailyBriefingWithAI(facts: string, persona: 'jarvis' | 'neutral' = 'jarvis'): Promise<string> {
  const sys = persona === 'jarvis'
    ? 'You are J.A.R.V.I.S. Synthesize the supplied phone-state facts into a friendly, formal British-butler 3-sentence briefing. Greet by time of day. Address as sir. End with a polite "anything else?". No markdown, plain text.'
    : 'Synthesize the supplied phone-state facts into a friendly 3-sentence verbal briefing. End with "anything else?". Plain text.';
  return chat(sys, facts);
}

// ─── Premium TTS via OpenAI /v1/audio/speech ─────────────────────────────────
//
// JARVIS-tier voice. Voices: 'onyx' (deep male, JARVIS-like), 'echo', 'nova',
// 'shimmer', 'fable' (British male). Falls back to system TTS if any step fails.
//
// REQUIRES the user to install: yarn add expo-av expo-file-system
// (Both are dynamically required so the app still runs without them.)

let _ttsSound: any = null;

export async function speakPremium(
  text: string,
  voice: 'onyx' | 'echo' | 'nova' | 'shimmer' | 'fable' = 'onyx'
): Promise<boolean> {
  if (!OPENAI_API_KEY || !text) return false;

  // Lazy-require so app still builds if these libs aren't installed.
  let FileSystem: any, Audio: any;
  try {
    FileSystem = require('expo-file-system');
    Audio = require('expo-av').Audio;
  } catch (e) {
    console.warn('[Premium TTS] expo-av / expo-file-system not installed — falling back to system TTS. Run `yarn add expo-av expo-file-system`.');
    return false;
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      { model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3', speed: 1.05 },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        responseType: 'arraybuffer',
        timeout: 12000,
      }
    );

    const fileUri = `${FileSystem.cacheDirectory}jarvis-tts-${Date.now()}.mp3`;
    // Convert ArrayBuffer → base64 without relying on Node Buffer
    const bytes = new Uint8Array(response.data);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = (typeof btoa !== 'undefined') ? btoa(binary) : globalThis.Buffer?.from(bytes).toString('base64') || '';
    if (!b64) return false;

    await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });

    if (_ttsSound) {
      try { await _ttsSound.unloadAsync(); } catch {}
      _ttsSound = null;
    }
    const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true });
    _ttsSound = sound;
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        if (_ttsSound === sound) _ttsSound = null;
      }
    });
    return true;
  } catch (e: any) {
    console.warn('[Premium TTS] Failed, will fall back to system TTS:', e?.message);
    return false;
  }
}
