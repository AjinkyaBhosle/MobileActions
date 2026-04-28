// Command Parser — maps voice text to actions using keyword matching + synonyms
// No AI, no cloud — pure pattern matching

export type ActionType =
  | 'flashlight_on' | 'flashlight_off'
  | 'open_app' | 'make_call' | 'send_sms'
  | 'set_alarm' | 'open_camera' | 'open_maps'
  | 'wifi_settings' | 'bluetooth_settings' | 'airplane_settings'
  | 'display_settings' | 'sound_settings' | 'battery_info'
  | 'volume_up' | 'volume_down' | 'brightness_up' | 'brightness_down'
  | 'open_calendar' | 'open_contacts' | 'time_query' | 'date_query'
  | 'open_settings' | 'open_dialer' | 'unknown';

export interface ParsedCommand {
  action: ActionType;
  params: Record<string, string>;
  confidence: number;
  displayText: string;
}

interface CommandPattern {
  action: ActionType;
  keywords: string[][];
  extractParam?: (text: string) => Record<string, string>;
  displayText: string;
}

const APP_NAMES: Record<string, string> = {
  'whatsapp': 'com.whatsapp',
  'youtube': 'com.google.android.youtube',
  'instagram': 'com.instagram.android',
  'facebook': 'com.facebook.katana',
  'twitter': 'com.twitter.android',
  'x': 'com.twitter.android',
  'gmail': 'com.google.android.gm',
  'chrome': 'com.android.chrome',
  'spotify': 'com.spotify.music',
  'telegram': 'org.telegram.messenger',
  'snapchat': 'com.snapchat.android',
  'tiktok': 'com.zhiliaoapp.musically',
  'netflix': 'com.netflix.mediaclient',
  'amazon': 'com.amazon.mShop.android.shopping',
  'maps': 'com.google.android.apps.maps',
  'google maps': 'com.google.android.apps.maps',
  'calculator': 'com.google.android.calculator',
  'calendar': 'com.google.android.calendar',
  'clock': 'com.google.android.deskclock',
  'files': 'com.google.android.apps.nbu.files',
  'photos': 'com.google.android.apps.photos',
  'play store': 'com.android.vending',
  'settings': 'com.android.settings',
  'messages': 'com.google.android.apps.messaging',
  'phone': 'com.google.android.dialer',
  'contacts': 'com.google.android.contacts',
  'notes': 'com.google.android.keep',
  'keep': 'com.google.android.keep',
};

const COMMAND_PATTERNS: CommandPattern[] = [
  // Flashlight
  {
    action: 'flashlight_on',
    keywords: [['flashlight', 'torch', 'flash', 'light'], ['on', 'enable', 'turn on', 'start', 'activate']],
    displayText: 'Flashlight ON',
  },
  {
    action: 'flashlight_on',
    keywords: [['turn on', 'switch on', 'enable'], ['flashlight', 'torch', 'flash', 'light']],
    displayText: 'Flashlight ON',
  },
  {
    action: 'flashlight_off',
    keywords: [['flashlight', 'torch', 'flash', 'light'], ['off', 'disable', 'turn off', 'stop', 'deactivate']],
    displayText: 'Flashlight OFF',
  },
  {
    action: 'flashlight_off',
    keywords: [['turn off', 'switch off', 'disable'], ['flashlight', 'torch', 'flash', 'light']],
    displayText: 'Flashlight OFF',
  },

  // Time & Date
  {
    action: 'time_query',
    keywords: [['what', 'tell'], ['time']],
    displayText: 'Current Time',
  },
  {
    action: 'date_query',
    keywords: [['what', 'tell'], ['date', 'day', 'today']],
    displayText: 'Current Date',
  },

  // Volume
  {
    action: 'volume_up',
    keywords: [['volume', 'sound'], ['up', 'increase', 'raise', 'higher', 'louder']],
    displayText: 'Volume Up',
  },
  {
    action: 'volume_up',
    keywords: [['increase', 'raise', 'turn up'], ['volume', 'sound']],
    displayText: 'Volume Up',
  },
  {
    action: 'volume_down',
    keywords: [['volume', 'sound'], ['down', 'decrease', 'lower', 'quieter', 'reduce']],
    displayText: 'Volume Down',
  },
  {
    action: 'volume_down',
    keywords: [['decrease', 'lower', 'turn down', 'reduce'], ['volume', 'sound']],
    displayText: 'Volume Down',
  },

  // Brightness
  {
    action: 'brightness_up',
    keywords: [['brightness', 'screen'], ['up', 'increase', 'higher', 'brighter']],
    displayText: 'Brightness Up',
  },
  {
    action: 'brightness_down',
    keywords: [['brightness', 'screen'], ['down', 'decrease', 'lower', 'dimmer', 'dim']],
    displayText: 'Brightness Down',
  },

  // Settings
  {
    action: 'wifi_settings',
    keywords: [['wifi', 'wi-fi', 'wi fi', 'wireless', 'internet']],
    displayText: 'WiFi Settings',
  },
  {
    action: 'bluetooth_settings',
    keywords: [['bluetooth', 'blue tooth']],
    displayText: 'Bluetooth Settings',
  },
  {
    action: 'airplane_settings',
    keywords: [['airplane', 'aeroplane', 'flight', 'plane'], ['mode', 'setting']],
    displayText: 'Airplane Mode',
  },
  {
    action: 'display_settings',
    keywords: [['display', 'screen'], ['settings', 'setting']],
    displayText: 'Display Settings',
  },
  {
    action: 'sound_settings',
    keywords: [['sound', 'audio', 'ringtone'], ['settings', 'setting']],
    displayText: 'Sound Settings',
  },
  {
    action: 'open_settings',
    keywords: [['open', 'go to', 'show'], ['settings', 'setting']],
    displayText: 'Open Settings',
  },

  // Battery
  {
    action: 'battery_info',
    keywords: [['battery', 'charge', 'power']],
    displayText: 'Battery Status',
  },

  // Camera
  {
    action: 'open_camera',
    keywords: [['open', 'start', 'launch', 'take'], ['camera', 'photo', 'picture', 'selfie']],
    displayText: 'Open Camera',
  },

  // Navigation / Maps
  {
    action: 'open_maps',
    keywords: [['navigate', 'navigation', 'directions', 'direction', 'map', 'maps', 'show me']],
    displayText: 'Open Maps',
    extractParam: (text: string) => {
      const patterns = [/(?:navigate|directions?|go|take me) (?:to|for) (.+)/i, /(?:show|find|search) (?:on map|map|maps) (.+)/i, /(?:map|maps) (.+)/i];
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return { query: m[1].trim() };
      }
      return {};
    },
  },

  // Communication
  {
    action: 'make_call',
    keywords: [['call', 'dial', 'ring']],
    displayText: 'Make Call',
    extractParam: (text: string) => {
      const m = text.match(/(?:call|phone|dial|ring)\s+(.+)/i);
      return m ? { contact: m[1].trim() } : {};
    },
  },
  {
    action: 'send_sms',
    keywords: [['send', 'text', 'sms', 'message']],
    displayText: 'Send SMS',
    extractParam: (text: string) => {
      const m = text.match(/(?:send|text|sms|message)\s+(?:to\s+)?(.+?)(?:\s+saying\s+(.+))?$/i);
      return m ? { contact: m[1].trim(), message: m[2]?.trim() || '' } : {};
    },
  },
  {
    action: 'open_dialer',
    keywords: [['open', 'show'], ['dialer', 'keypad', 'dial pad']],
    displayText: 'Open Dialer',
  },

  // Calendar & Contacts
  {
    action: 'open_calendar',
    keywords: [['open', 'show', 'check'], ['calendar', 'schedule', 'events']],
    displayText: 'Open Calendar',
  },
  {
    action: 'open_contacts',
    keywords: [['open', 'show'], ['contacts', 'address book', 'people']],
    displayText: 'Open Contacts',
  },

  // Alarm
  {
    action: 'set_alarm',
    keywords: [['set', 'create', 'make'], ['alarm', 'timer', 'reminder']],
    displayText: 'Set Alarm',
    extractParam: (text: string) => {
      const timeMatch = text.match(/(\d{1,2})\s*(?::|\s)\s*(\d{2})?\s*(am|pm|a\.m|p\.m)?/i);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const min = timeMatch[2] || '00';
        const ampm = timeMatch[3]?.toLowerCase();
        if (ampm?.startsWith('p') && hour < 12) hour += 12;
        if (ampm?.startsWith('a') && hour === 12) hour = 0;
        return { hour: String(hour), minute: min };
      }
      return {};
    },
  },

  // Open App (catch-all — must be last)
  {
    action: 'open_app',
    keywords: [['open', 'launch', 'start', 'go to', 'run']],
    displayText: 'Open App',
    extractParam: (text: string) => {
      const m = text.match(/(?:open|launch|start|go to|run)\s+(.+)/i);
      if (m) {
        const appName = m[1].trim().toLowerCase();
        const pkg = APP_NAMES[appName];
        return { appName: m[1].trim(), packageName: pkg || '' };
      }
      return {};
    },
  },
];

export function parseCommand(rawText: string): ParsedCommand {
  const text = rawText.toLowerCase().trim();

  // Remove wake words
  const wakeWords = ['hey mobile', 'hi mobile', 'hello mobile', 'ok mobile', 'yo mobile', 'mobile'];
  let cleaned = text;
  for (const ww of wakeWords) {
    if (cleaned.startsWith(ww)) {
      cleaned = cleaned.slice(ww.length).trim();
      cleaned = cleaned.replace(/^[,.\s]+/, '');
      break;
    }
  }
  if (!cleaned) cleaned = text;

  // ── Multi-command: detect "and" / "then" / "also" ──
  const multiSplit = cleaned.split(/\s+(?:and|then|also)\s+/);
  if (multiSplit.length > 1) {
    // Return the first command, store remaining for sequential execution
    const firstResult = parseSingleCommand(multiSplit[0]);
    firstResult.params._multiCommands = multiSplit.slice(1).join('|||');
    firstResult.displayText += ` (+${multiSplit.length - 1} more)`;
    return firstResult;
  }

  return parseSingleCommand(cleaned);
}

// Extract multi-commands for sequential execution
export function getMultiCommands(params: Record<string, string>): string[] {
  const multi = params._multiCommands;
  if (!multi) return [];
  return multi.split('|||');
}

function parseSingleCommand(cleaned: string): ParsedCommand {

  // ── Normalize common speech transcription errors ──
  cleaned = cleaned.replace(/flash right|flesh light|flex light|flush light/g, 'flashlight');
  cleaned = cleaned.replace(/y fi|why fi|wife i/g, 'wifi');
  cleaned = cleaned.replace(/blue tooth/g, 'bluetooth');
  cleaned = cleaned.replace(/tourch/g, 'torch');

  // Try each pattern
  for (const pattern of COMMAND_PATTERNS) {
    if (matchesPattern(cleaned, pattern.keywords)) {
      const params = pattern.extractParam ? pattern.extractParam(cleaned) : {};
      return {
        action: pattern.action,
        params,
        confidence: 0.9,
        displayText: pattern.displayText,
      };
    }
  }

  // ── VAGUE / single-word matching ──
  const VAGUE_MAP: Record<string, { action: ActionType; displayText: string }> = {
    'flashlight': { action: 'flashlight_on', displayText: 'Flashlight ON' },
    'torch': { action: 'flashlight_on', displayText: 'Flashlight ON' },
    'light': { action: 'flashlight_on', displayText: 'Flashlight ON' },
    'flash': { action: 'flashlight_on', displayText: 'Flashlight ON' },
    'wifi': { action: 'wifi_settings', displayText: 'WiFi Settings' },
    'bluetooth': { action: 'bluetooth_settings', displayText: 'Bluetooth Settings' },
    'camera': { action: 'open_camera', displayText: 'Open Camera' },
    'photo': { action: 'open_camera', displayText: 'Open Camera' },
    'selfie': { action: 'open_camera', displayText: 'Open Camera' },
    'picture': { action: 'open_camera', displayText: 'Open Camera' },
    'alarm': { action: 'set_alarm', displayText: 'Set Alarm' },
    'timer': { action: 'set_alarm', displayText: 'Set Alarm' },
    'maps': { action: 'open_maps', displayText: 'Open Maps' },
    'map': { action: 'open_maps', displayText: 'Open Maps' },
    'navigate': { action: 'open_maps', displayText: 'Open Maps' },
    'directions': { action: 'open_maps', displayText: 'Open Maps' },
    'call': { action: 'open_dialer', displayText: 'Open Dialer' },
    'phone': { action: 'open_dialer', displayText: 'Open Dialer' },
    'dial': { action: 'open_dialer', displayText: 'Open Dialer' },
    'sms': { action: 'send_sms', displayText: 'Send SMS' },
    'message': { action: 'send_sms', displayText: 'Send SMS' },
    'text': { action: 'send_sms', displayText: 'Send SMS' },
    'time': { action: 'time_query', displayText: 'Current Time' },
    'clock': { action: 'time_query', displayText: 'Current Time' },
    'date': { action: 'date_query', displayText: 'Current Date' },
    'today': { action: 'date_query', displayText: 'Current Date' },
    'calendar': { action: 'open_calendar', displayText: 'Open Calendar' },
    'schedule': { action: 'open_calendar', displayText: 'Open Calendar' },
    'contacts': { action: 'open_contacts', displayText: 'Open Contacts' },
    'people': { action: 'open_contacts', displayText: 'Open Contacts' },
    'settings': { action: 'open_settings', displayText: 'Open Settings' },
    'battery': { action: 'battery_info', displayText: 'Battery Status' },
    'charge': { action: 'battery_info', displayText: 'Battery Status' },
    'volume': { action: 'volume_up', displayText: 'Volume Up' },
    'loud': { action: 'volume_up', displayText: 'Volume Up' },
    'quiet': { action: 'volume_down', displayText: 'Volume Down' },
    'mute': { action: 'volume_down', displayText: 'Volume Down' },
    'bright': { action: 'brightness_up', displayText: 'Brightness Up' },
    'brightness': { action: 'brightness_up', displayText: 'Brightness Up' },
    'dim': { action: 'brightness_down', displayText: 'Brightness Down' },
    'airplane': { action: 'airplane_settings', displayText: 'Airplane Mode' },
    'flight': { action: 'airplane_settings', displayText: 'Airplane Mode' },
  };

  // Check if any vague word is in the command
  for (const [word, result] of Object.entries(VAGUE_MAP)) {
    if (cleaned.includes(word)) {
      return { action: result.action, params: {}, confidence: 0.7, displayText: result.displayText };
    }
  }

  // Fallback: check for app names directly
  for (const [name, pkg] of Object.entries(APP_NAMES)) {
    if (cleaned.includes(name)) {
      return {
        action: 'open_app',
        params: { appName: name, packageName: pkg },
        confidence: 0.7,
        displayText: `Open ${name.charAt(0).toUpperCase() + name.slice(1)}`,
      };
    }
  }

  return {
    action: 'unknown',
    params: { rawText: cleaned },
    confidence: 0,
    displayText: 'Command not recognized',
  };
}

function matchesPattern(text: string, keywordGroups: string[][]): boolean {
  // All groups must have at least one keyword present in the text
  return keywordGroups.every(group =>
    group.some(keyword => text.includes(keyword))
  );
}
