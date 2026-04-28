import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const KEYS = {
  SETTINGS: '@ma_settings',
  HISTORY: '@ma_history',
  CUSTOM_COMMANDS: '@ma_custom_commands',
  STATS: '@ma_stats',
};

// ── Settings ──
export interface AppSettings {
  backgroundListening: boolean;
  shakeToActivate: boolean;
  ttsEnabled: boolean;
  ttsLanguage: string;
  wakeWords: string[];
}

const DEFAULT_SETTINGS: AppSettings = {
  backgroundListening: true,
  shakeToActivate: false,
  ttsEnabled: true,
  ttsLanguage: 'en-US',
  wakeWords: ['hey mobile', 'hi mobile', 'hello mobile', 'ok mobile', 'yo mobile', 'mobile'],
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

// ── History ──
export interface HistoryItem {
  id: string;
  command: string;
  result: string;
  success: boolean;
  timestamp: string;
  actionType: string;
}

export async function loadHistory(): Promise<HistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveHistory(items: HistoryItem[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(items.slice(0, 200)));
  
  // Sync the latest item to Cloud Firestore (Free tier allows 20k writes/day)
  if (items.length > 0) {
    try {
      const latest = items[0];
      await addDoc(collection(db, "command_history"), {
        ...latest,
        server_timestamp: serverTimestamp()
      });
      console.log('[Storage] Synced to Firestore');
    } catch (e) {
      console.warn('[Storage] Firestore sync failed (likely offline):', e);
    }
  }
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.setItem(KEYS.HISTORY, '[]');
}

// ── Custom Commands (Macros) ──
export interface CustomCommand {
  id: string;
  name: string;
  trigger: string;
  actions: string[];
  icon: string;
  color: string;
}

export async function loadCustomCommands(): Promise<CustomCommand[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.CUSTOM_COMMANDS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveCustomCommands(cmds: CustomCommand[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.CUSTOM_COMMANDS, JSON.stringify(cmds));
}

// ── Stats ──
export interface CommandStats {
  totalExecuted: number;
  totalSuccess: number;
  totalFailed: number;
  todayCount: number;
  todayDate: string;
  mostUsed: Record<string, number>;
}

const DEFAULT_STATS: CommandStats = {
  totalExecuted: 0, totalSuccess: 0, totalFailed: 0,
  todayCount: 0, todayDate: new Date().toDateString(),
  mostUsed: {},
};

export async function loadStats(): Promise<CommandStats> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.STATS);
    const stats = raw ? { ...DEFAULT_STATS, ...JSON.parse(raw) } : DEFAULT_STATS;
    if (stats.todayDate !== new Date().toDateString()) {
      stats.todayCount = 0;
      stats.todayDate = new Date().toDateString();
    }
    return stats;
  } catch { return DEFAULT_STATS; }
}

export async function recordCommand(actionType: string, success: boolean): Promise<CommandStats> {
  const stats = await loadStats();
  stats.totalExecuted++;
  if (success) stats.totalSuccess++; else stats.totalFailed++;
  stats.todayCount++;
  stats.mostUsed[actionType] = (stats.mostUsed[actionType] || 0) + 1;
  await AsyncStorage.setItem(KEYS.STATS, JSON.stringify(stats));
  return stats;
}
