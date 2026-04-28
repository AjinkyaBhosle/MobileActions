// Action Executor — executes parsed commands using Expo APIs
// Works offline — uses Linking, IntentLauncher, and native APIs

import { Platform, Alert, PermissionsAndroid, NativeModules } from 'react-native';
import * as Linking from 'expo-linking';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Speech from 'expo-speech';
import * as Battery from 'expo-battery';
import * as Brightness from 'expo-brightness';
import type { ParsedCommand } from './commandParser';

const { WakeWordModule } = NativeModules;

export interface ActionResult {
  success: boolean;
  message: string;
  spoken: string;
  actionSignal?: 'FLASHLIGHT_ON' | 'FLASHLIGHT_OFF';
}

// Text-to-speech feedback. Tries premium OpenAI voice ("onyx" — JARVIS-like)
// first, falls back to system TTS if it fails or libs unavailable.
let _personaCache: 'jarvis' | 'neutral' | null = null;
async function getPersona(): Promise<'jarvis' | 'neutral'> {
  if (_personaCache) return _personaCache;
  try {
    const { loadSettings } = await import('./storageService');
    const s = await loadSettings();
    _personaCache = (s?.persona === 'neutral') ? 'neutral' : 'jarvis';
  } catch { _personaCache = 'jarvis'; }
  return _personaCache;
}

async function speak(text: string) {
  if (!text) return;
  try {
    const { speakPremium } = await import('./aiAgent');
    const persona = await getPersona();
    // Premium TTS only for JARVIS persona to save API cost; fall through to system.
    if (persona === 'jarvis') {
      const ok = await speakPremium(text, 'onyx');
      if (ok) return;
    }
  } catch { /* fall through */ }
  Speech.speak(text, { language: 'en-US', rate: 1.0, pitch: 1.0 });
}

export async function executeAction(command: ParsedCommand): Promise<ActionResult> {
  const { action, params } = command;
  console.log('[Executor] action=' + action + ' params=' + JSON.stringify(params || {}));

  try {
    switch (action) {
      // ── Flashlight ──
      case 'flashlight_on':
        WakeWordModule.setFlashlight(true);
        speak('Flashlight turned on');
        return { success: true, message: 'Flashlight ON', spoken: 'Flashlight turned on', actionSignal: 'FLASHLIGHT_ON' };

      case 'flashlight_off':
        WakeWordModule.setFlashlight(false);
        speak('Flashlight turned off');
        return { success: true, message: 'Flashlight OFF', spoken: 'Flashlight turned off', actionSignal: 'FLASHLIGHT_OFF' };

      // ── Time & Date ──
      case 'time_query': {
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        speak(`The time is ${time}`);
        return { success: true, message: `Current time: ${time}`, spoken: `The time is ${time}` };
      }

      case 'date_query': {
        const now = new Date();
        const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        speak(`Today is ${date}`);
        return { success: true, message: `Today: ${date}`, spoken: `Today is ${date}` };
      }

      // ── Volume ──
      case 'volume_up': {
        WakeWordModule.adjustVolume(true);
        speak('Volume increased');
        return { success: true, message: 'Volume Up', spoken: 'Volume increased' };
      }

      case 'volume_down': {
        WakeWordModule.adjustVolume(false);
        speak('Volume decreased');
        return { success: true, message: 'Volume Down', spoken: 'Volume decreased' };
      }

      // ── Brightness ──
      case 'brightness_up': {
        const current = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(Math.min(current + 0.2, 1.0));
        speak('Brightness increased');
        return { success: true, message: 'Brightness Up', spoken: 'Brightness increased' };
      }

      case 'brightness_down': {
        const current = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(Math.max(current - 0.2, 0.0));
        speak('Brightness decreased');
        return { success: true, message: 'Brightness Down', spoken: 'Brightness decreased' };
      }

      // ── Settings ──
      case 'wifi_settings':
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.settings.WIFI_SETTINGS');
        }
        speak('Opening WiFi settings');
        return { success: true, message: 'WiFi Settings opened', spoken: 'Opening WiFi settings' };

      case 'bluetooth_settings':
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.settings.BLUETOOTH_SETTINGS');
        }
        speak('Opening Bluetooth settings');
        return { success: true, message: 'Bluetooth Settings opened', spoken: 'Opening Bluetooth settings' };

      case 'airplane_settings':
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.settings.AIRPLANE_MODE_SETTINGS');
        }
        speak('Opening airplane mode settings');
        return { success: true, message: 'Airplane Mode settings opened', spoken: 'Opening airplane mode settings' };

      case 'display_settings':
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.settings.DISPLAY_SETTINGS');
        }
        speak('Opening display settings');
        return { success: true, message: 'Display Settings opened', spoken: 'Opening display settings' };

      case 'sound_settings':
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.settings.SOUND_SETTINGS');
        }
        speak('Opening sound settings');
        return { success: true, message: 'Sound Settings opened', spoken: 'Opening sound settings' };

      case 'open_settings':
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.settings.SETTINGS');
        } else {
          await Linking.openURL('app-settings:');
        }
        speak('Opening settings');
        return { success: true, message: 'Settings opened', spoken: 'Opening settings' };

      // ── Battery ──
      case 'battery_info': {
        const level = await Battery.getBatteryLevelAsync();
        const percent = Math.round(level * 100);
        speak(`Your battery is at ${percent} percent`);
        return { success: true, message: `Battery Level: ${percent}%`, spoken: `Battery is at ${percent}%` };
      }

      // ── Camera ──
      case 'open_camera':
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.media.action.STILL_IMAGE_CAMERA');
        }
        speak('Opening camera');
        return { success: true, message: 'Camera opened', spoken: 'Opening camera' };

      // ── Maps / Navigation ──
      case 'open_maps': {
        const query = params.query || '';
        if (query) {
          const url = Platform.OS === 'android'
            ? `geo:0,0?q=${encodeURIComponent(query)}`
            : `maps:0,0?q=${encodeURIComponent(query)}`;
          await Linking.openURL(url);
          speak(`Showing ${query} on map`);
          return { success: true, message: `Maps: ${query}`, spoken: `Showing ${query} on map` };
        }
        await Linking.openURL('geo:0,0');
        speak('Opening maps');
        return { success: true, message: 'Maps opened', spoken: 'Opening maps' };
      }

      // ── Phone Call ──
      case 'make_call': {
        const contact = (params.contact || params.nameOrNumber || '').toString();
        if (!contact) {
          await Linking.openURL('tel:');
          speak('Opening dialer');
          return { success: true, message: 'Dialer opened', spoken: 'Opening dialer' };
        }

        const isNumber = /^[\d+\-\s()]+$/.test(contact);
        let resolvedNumber = isNumber ? contact.replace(/[\s\-()]/g, '') : '';

        // If not a number, look up the contact by name via native bridge
        if (!resolvedNumber && Platform.OS === 'android' && WakeWordModule?.lookupContact) {
          try {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.READ_CONTACTS
            );
            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
              const found: string | null = await WakeWordModule.lookupContact(contact);
              if (found) resolvedNumber = found;
            }
          } catch (e) {
            console.warn('[Action] Contact lookup failed:', e);
          }
        }

        if (!resolvedNumber) {
          speak(`I couldn't find ${contact} in your contacts`);
          return {
            success: false,
            message: `Contact "${contact}" not found`,
            spoken: `I couldn't find ${contact} in your contacts`,
          };
        }

        // Try silent placeCall via native TelecomManager first (no dialer flicker)
        if (Platform.OS === 'android') {
          try {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.CALL_PHONE
            );
            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
              if (WakeWordModule?.placeCall) {
                await WakeWordModule.placeCall(resolvedNumber);
              } else {
                await IntentLauncher.startActivityAsync('android.intent.action.CALL', {
                  data: `tel:${resolvedNumber}`,
                  flags: 268435456,
                }).catch(() => {});
              }
              speak(`Calling ${contact}`);
              return {
                success: true,
                message: `Calling ${contact} (${resolvedNumber})`,
                spoken: `Calling ${contact}`,
              };
            }
          } catch (error) {
            console.warn('Call permission error:', error);
          }
        }

        // Fallback to dialer (iOS or no permission)
        await Linking.openURL(`tel:${resolvedNumber}`);
        speak(`Opening dialer for ${contact}`);
        return { success: true, message: `Dialer: ${contact}`, spoken: `Opening dialer` };
      }

      // ── SMS ──
      case 'send_sms': {
        const recipientRaw = (params.contact || params.nameOrNumber || '').toString();
        const message = (params.message || '').toString();
        let recipient = recipientRaw;

        // Resolve name → number if needed (Android)
        const isNumber = /^[\d+\-\s()]+$/.test(recipientRaw);
        if (recipientRaw && !isNumber && Platform.OS === 'android' && WakeWordModule?.lookupContact) {
          try {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.READ_CONTACTS
            );
            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
              const found: string | null = await WakeWordModule.lookupContact(recipientRaw);
              if (found) recipient = found;
            }
          } catch (e) {
            console.warn('[Action] Contact lookup failed:', e);
          }
        } else if (isNumber) {
          recipient = recipientRaw.replace(/[\s\-()]/g, '');
        }

        const smsUrl = message
          ? `sms:${recipient}?body=${encodeURIComponent(message)}`
          : `sms:${recipient}`;
        await Linking.openURL(smsUrl);
        speak(`Opening message to ${recipientRaw || 'new contact'}`);
        return {
          success: true,
          message: `SMS to ${recipientRaw || 'new'}: ${message || '(no body)'}`,
          spoken: `Opening messaging`,
        };
      }

      case 'open_dialer':
        await Linking.openURL('tel:');
        speak('Opening dialer');
        return { success: true, message: 'Dialer opened', spoken: 'Opening dialer' };

      // ── Calendar & Contacts ──
      case 'open_calendar':
        if (Platform.OS === 'android') {
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
              category: 'android.intent.category.APP_CALENDAR',
            });
          } catch {
            await Linking.openURL('content://com.android.calendar');
          }
        }
        speak('Opening calendar');
        return { success: true, message: 'Calendar opened', spoken: 'Opening calendar' };

      case 'open_contacts':
        if (Platform.OS === 'android') {
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
              data: 'content://contacts/people',
            });
          } catch {
            await Linking.openURL('content://contacts/people');
          }
        }
        speak('Opening contacts');
        return { success: true, message: 'Contacts opened', spoken: 'Opening contacts' };

      // ── Alarm ──
      case 'set_alarm': {
        if (Platform.OS === 'android') {
          const hour = parseInt((params.hour || '7').toString(), 10);
          const minute = parseInt((params.minute || '0').toString(), 10);
          console.log('[Action] set_alarm -> hour=' + hour + ' minute=' + minute);
          try {
            // Do NOT use SKIP_UI — Oppo/ColorOS, MIUI, ColorOS, OneUI silently drop alarms
            // when SKIP_UI=true is requested by non-system apps. Without SKIP_UI the user
            // sees the clock app open with the alarm pre-filled, which is reliable.
            await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
              extra: {
                'android.intent.extra.alarm.HOUR': hour,
                'android.intent.extra.alarm.MINUTES': minute,
                'android.intent.extra.alarm.MESSAGE': (params.label || 'Mobile Action alarm').toString(),
              },
            });
            console.log('[Action] set_alarm intent fired OK');
          } catch (e) {
            console.warn('[Action] SET_ALARM intent failed:', e);
            // Fallback — just open the clock app
            try {
              await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
                category: 'android.intent.category.APP_CALENDAR',
              });
            } catch {}
            return {
              success: false,
              message: 'Could not open alarm app. Please check a clock app is installed.',
              spoken: 'I could not set the alarm',
            };
          }
        }
        const hh = (params.hour || '7').toString();
        const mm = (params.minute || '0').toString().padStart(2, '0');
        speak(`Setting alarm for ${hh}:${mm}`);
        return { success: true, message: `Alarm set for ${hh}:${mm}`, spoken: `Setting alarm for ${hh}:${mm}` };
      }

      // ── Open App (works for ANY installed app: Excel, Word, PDF readers, SOS apps, banking apps, etc.) ──
      case 'open_app': {
        const appName = (params.appName || params.name || params.query || '').toString().trim();
        const pkg = (params.packageName || '').toString().trim();

        if (Platform.OS === 'android' && pkg) {
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
              packageName: pkg,
            });
            speak(`Opening ${appName || 'app'}`);
            return { success: true, message: `${appName || pkg} opened`, spoken: `Opening ${appName || 'app'}` };
          } catch { /* fall through */ }
        }

        // Try common URL schemes first (faster than scanning installed apps)
        const schemes: Record<string, string> = {
          whatsapp: 'whatsapp://',
          youtube: 'vnd.youtube://',
          instagram: 'instagram://',
          twitter: 'twitter://',
          spotify: 'spotify://',
          telegram: 'tg://',
          gmail: 'googlegmail://',
        };
        const scheme = schemes[appName.toLowerCase()];
        if (scheme) {
          try {
            await Linking.openURL(scheme);
            speak(`Opening ${appName}`);
            return { success: true, message: `${appName} opened`, spoken: `Opening ${appName}` };
          } catch { /* fall through to package lookup */ }
        }

        // Generic: ask Kotlin to find ANY installed app whose label matches.
        // This makes "open Excel", "open Word", "open my SOS app", "open Adobe Reader" all work.
        if (Platform.OS === 'android' && WakeWordModule?.launchAppByName && appName) {
          try {
            const foundPkg: string | null = await WakeWordModule.launchAppByName(appName);
            if (foundPkg) {
              speak(`Opening ${appName}`);
              return { success: true, message: `${appName} opened (${foundPkg})`, spoken: `Opening ${appName}` };
            }
          } catch (e) { console.warn('[open_app] launchAppByName error:', e); }
        }

        speak(`Could not find ${appName || 'that app'}`);
        return { success: false, message: `App "${appName || pkg}" not installed or not launchable`, spoken: `Could not find ${appName}` };
      }

      // ── YouTube search & play ──
      case 'play_youtube': {
        const query = (params.query || params.song || '').toString().trim();
        if (!query) {
          await Linking.openURL('vnd.youtube://').catch(() => Linking.openURL('https://www.youtube.com'));
          return { success: true, message: 'YouTube opened', spoken: 'Opening YouTube' };
        }
        // vnd.youtube deep link opens app and runs search; first result usually auto-plays after tap.
        const ytApp = `vnd.youtube://results?search_query=${encodeURIComponent(query)}`;
        const ytWeb = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        try {
          await Linking.openURL(ytApp);
        } catch {
          await Linking.openURL(ytWeb);
        }
        speak(`Searching YouTube for ${query}`);
        return { success: true, message: `YouTube: ${query}`, spoken: `Playing ${query}` };
      }

      // ── Spotify search ──
      case 'play_spotify': {
        const query = (params.query || params.song || '').toString().trim();
        const url = query ? `spotify:search:${encodeURIComponent(query)}` : 'spotify://';
        try {
          await Linking.openURL(url);
        } catch {
          await Linking.openURL(`https://open.spotify.com/search/${encodeURIComponent(query)}`);
        }
        speak(query ? `Searching Spotify for ${query}` : 'Opening Spotify');
        return { success: true, message: `Spotify: ${query || 'opened'}`, spoken: query ? `Playing ${query}` : 'Opening Spotify' };
      }

      // ── WhatsApp message (deep link, user must tap Send) ──
      case 'whatsapp_send': {
        const contact = (params.contact || params.nameOrNumber || '').toString();
        const message = (params.message || '').toString();
        let number = contact.replace(/[\s\-()]/g, '');
        const isNumber = /^[\+]?[\d]+$/.test(number);

        if (!isNumber && contact && Platform.OS === 'android' && WakeWordModule?.lookupContact) {
          try {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.READ_CONTACTS
            );
            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
              const found: string | null = await WakeWordModule.lookupContact(contact);
              if (found) number = found;
            }
          } catch { /* fall through */ }
        }
        // Strip leading + and 00 for wa.me
        const cleanNumber = number.replace(/^\+/, '').replace(/^00/, '');
        const waUrl = cleanNumber
          ? `https://wa.me/${cleanNumber}${message ? `?text=${encodeURIComponent(message)}` : ''}`
          : 'whatsapp://';
        await Linking.openURL(waUrl);
        speak(`Opening WhatsApp${contact ? ` for ${contact}` : ''}`);
        return {
          success: true,
          message: `WhatsApp → ${contact || 'open'}: ${message || '(no message)'}`,
          spoken: `Opening WhatsApp. Tap send when ready`,
        };
      }

      // ── Gmail compose (deep link via mailto:) ──
      case 'gmail_compose': {
        const to = (params.to || params.email || '').toString();
        const subject = (params.subject || '').toString();
        const body = (params.body || params.message || '').toString();
        const queryParts: string[] = [];
        if (subject) queryParts.push(`subject=${encodeURIComponent(subject)}`);
        if (body) queryParts.push(`body=${encodeURIComponent(body)}`);
        const url = `mailto:${to}${queryParts.length ? `?${queryParts.join('&')}` : ''}`;
        await Linking.openURL(url);
        speak(`Composing email${to ? ` to ${to}` : ''}`);
        return {
          success: true,
          message: `Gmail compose → ${to || '(no recipient)'}: ${subject || '(no subject)'}`,
          spoken: 'Email ready. Tap send when finished.',
        };
      }

      // ── Web search via Google ──
      case 'web_search': {
        const query = (params.query || '').toString().trim();
        if (!query) return { success: false, message: 'No search query', spoken: 'What should I search for?' };
        await Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
        speak(`Searching for ${query}`);
        return { success: true, message: `Search: ${query}`, spoken: `Searching ${query}` };
      }

      // ── Open arbitrary URL ──
      case 'open_url': {
        let url = (params.url || '').toString().trim();
        if (!url) return { success: false, message: 'No URL', spoken: 'No URL given' };
        if (!/^https?:\/\//i.test(url) && !/^\w+:\/\//i.test(url)) {
          url = `https://${url}`;
        }
        await Linking.openURL(url);
        speak('Opening website');
        return { success: true, message: `Opened ${url}`, spoken: 'Opening website' };
      }

      // ── Take note (save to Firestore + open Keep) ──
      case 'take_note': {
        const text = (params.text || params.body || params.note || '').toString().trim();
        if (!text) return { success: false, message: 'Note is empty', spoken: 'What should I note?' };

        // Save to Firestore in parallel (no await — fire and continue)
        try {
          // Lazy import to avoid pulling Firestore on cold start
          const { db } = await import('./firebaseConfig');
          const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
          addDoc(collection(db, 'notes'), {
            text,
            created_at: serverTimestamp(),
            source: 'voice',
          }).catch(e => console.warn('[Note] Firestore save failed:', e));
        } catch (e) {
          console.warn('[Note] Firestore module unavailable:', e);
        }

        // Open Google Keep with the note prefilled (Keep listens to ACTION_SEND with text/plain)
        if (Platform.OS === 'android') {
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
              type: 'text/plain',
              extra: { 'android.intent.extra.TEXT': text },
              packageName: 'com.google.android.keep',
            });
          } catch {
            // Fallback: any app that handles ACTION_SEND
            await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
              type: 'text/plain',
              extra: { 'android.intent.extra.TEXT': text },
            }).catch(() => {});
          }
        }
        speak('Note saved');
        return { success: true, message: `Note: "${text}"`, spoken: 'Note saved' };
      }

      // ── Calendar event ──
      case 'create_calendar_event': {
        const title = (params.title || params.event || 'Event').toString();
        const hour = parseInt((params.hour || '12').toString(), 10);
        const minute = parseInt((params.minute || '0').toString(), 10);
        // Compute beginTime (today at hour:minute, or tomorrow if past)
        const begin = new Date();
        begin.setHours(hour, minute, 0, 0);
        if (begin.getTime() < Date.now()) begin.setDate(begin.getDate() + 1);
        const end = new Date(begin.getTime() + 60 * 60 * 1000); // +1 hour

        if (Platform.OS === 'android') {
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.INSERT', {
              data: 'content://com.android.calendar/events',
              extra: {
                'title': title,
                'beginTime': begin.getTime(),
                'endTime': end.getTime(),
              },
            });
          } catch (e) {
            console.warn('Calendar insert failed:', e);
          }
        }
        speak(`Creating event ${title}`);
        return { success: true, message: `Calendar: ${title} @ ${hour}:${minute.toString().padStart(2, '0')}`, spoken: `Creating event ${title}` };
      }

      // ── Read recent notifications (requires NotificationListener perm) ──
      case 'read_notifications': {
        if (Platform.OS !== 'android' || !WakeWordModule?.getRecentNotifications) {
          speak('Notification reading is not available');
          return { success: false, message: 'Not available', spoken: 'Notification reading is not available' };
        }
        try {
          const list: any[] = await WakeWordModule.getRecentNotifications();
          if (!list || list.length === 0) {
            speak('You have no recent notifications');
            return { success: true, message: 'No notifications', spoken: 'You have no recent notifications' };
          }
          const top = list.slice(0, 5);
          const summary = top.map(n => `${n.appName || 'App'}: ${n.title || ''} ${n.text || ''}`.trim()).join('. ');
          speak(`You have ${list.length} notifications. ${summary}`);
          return {
            success: true,
            message: `${list.length} notifications:\n${top.map(n => `• ${n.appName}: ${n.title} — ${n.text}`).join('\n')}`,
            spoken: `You have ${list.length} notifications`,
          };
        } catch (e: any) {
          // Likely permission not granted — open the special-access settings page
          await IntentLauncher.startActivityAsync('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS').catch(() => {});
          speak('Please grant notification access in settings, then try again.');
          return {
            success: false,
            message: 'Notification permission needed — opened settings',
            spoken: 'Please grant notification access',
          };
        }
      }

      // ── Audio mute / unmute ──
      case 'mute_audio': {
        if (Platform.OS === 'android' && WakeWordModule?.setMute) {
          try { await WakeWordModule.setMute(true); } catch (e) { console.warn(e); }
        }
        speak('Muted');
        return { success: true, message: 'Audio muted', spoken: 'Muted' };
      }
      case 'unmute_audio': {
        if (Platform.OS === 'android' && WakeWordModule?.setMute) {
          try { await WakeWordModule.setMute(false); } catch (e) { console.warn(e); }
        }
        speak('Unmuted');
        return { success: true, message: 'Audio unmuted', spoken: 'Unmuted' };
      }

      // ── Media controls ──
      case 'play_music':
      case 'pause_music':
      case 'next_track':
      case 'previous_track': {
        const keyMap: Record<string, string> = {
          play_music: 'PLAY',
          pause_music: 'PAUSE',
          next_track: 'NEXT',
          previous_track: 'PREVIOUS',
        };
        const key = keyMap[action];
        if (Platform.OS === 'android' && WakeWordModule?.mediaKey) {
          try { await WakeWordModule.mediaKey(key); } catch (e) { console.warn(e); }
        }
        speak(action.replace('_', ' '));
        return { success: true, message: `Media: ${key.toLowerCase()}`, spoken: action.replace('_', ' ') };
      }

      // ── Take screenshot (via accessibility service if enabled) ──
      case 'take_screenshot': {
        if (Platform.OS === 'android' && WakeWordModule?.takeScreenshot) {
          try {
            const ok = await WakeWordModule.takeScreenshot();
            if (ok) {
              speak('Screenshot taken');
              return { success: true, message: 'Screenshot', spoken: 'Screenshot taken' };
            }
          } catch (e) { console.warn(e); }
        }
        speak('Screenshot requires accessibility access');
        return { success: false, message: 'Enable accessibility for screenshots', spoken: 'Please enable accessibility access' };
      }

      // ── Translate via OpenAI (no extra API needed) ──
      case 'translate': {
        const text = (params.text || '').toString().trim();
        const target = (params.target || params.language || 'English').toString();
        if (!text) return { success: false, message: 'Nothing to translate', spoken: 'What should I translate?' };
        try {
          const { translateWithAI } = await import('./aiAgent');
          const result = await translateWithAI(text, target);
          speak(result);
          return { success: true, message: `${target}: ${result}`, spoken: result };
        } catch (e: any) {
          return { success: false, message: 'Translation failed', spoken: 'Translation failed' };
        }
      }

      // ── Web fetch + summarize ──
      case 'web_fetch': {
        const url = (params.url || '').toString().trim();
        if (!url) return { success: false, message: 'No URL', spoken: 'No URL given' };
        try {
          const { default: axios } = await import('axios');
          const r = await axios.get(/^https?:/.test(url) ? url : `https://${url}`, { timeout: 8000 });
          const stripped = String(r.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000);
          const { summarizeWithAI } = await import('./aiAgent');
          const summary = await summarizeWithAI(stripped);
          speak(summary);
          return { success: true, message: summary, spoken: summary };
        } catch (e: any) {
          return { success: false, message: `Fetch failed: ${e?.message}`, spoken: 'Could not fetch that page' };
        }
      }

      // ── Latest news (web search + AI summary) ──
      case 'latest_news': {
        const topic = (params.topic || params.category || 'top headlines').toString();
        try {
          const { newsBriefingWithAI } = await import('./aiAgent');
          const briefing = await newsBriefingWithAI(topic);
          speak(briefing);
          return { success: true, message: briefing, spoken: briefing };
        } catch (e: any) {
          await Linking.openURL(`https://news.google.com/search?q=${encodeURIComponent(topic)}`);
          speak(`Opening news for ${topic}`);
          return { success: true, message: `News: ${topic}`, spoken: `Opening news` };
        }
      }

      // ── Find route / fastest route ──
      case 'find_route':
      case 'navigate_route': {
        const destination = (params.destination || params.to || params.query || '').toString();
        const origin = (params.origin || params.from || '').toString();
        const mode = ((params.mode || 'driving').toString().toLowerCase()); // driving | walking | bicycling | transit
        if (!destination) return { success: false, message: 'Where to?', spoken: 'Where should I navigate?' };
        const params2 = new URLSearchParams({
          api: '1',
          destination,
          travelmode: mode,
          dir_action: 'navigate',
        });
        if (origin) params2.set('origin', origin);
        const url = `https://www.google.com/maps/dir/?${params2.toString()}`;
        await Linking.openURL(url);
        speak(`Navigating to ${destination}`);
        return { success: true, message: `Navigate (${mode}) to ${destination}`, spoken: `Navigating to ${destination}` };
      }

      // ── Share my location ──
      case 'show_location': {
        // Open Maps centered on user's current GPS coordinates (no sharing).
        if (Platform.OS !== 'android' || !WakeWordModule?.getLocation) {
          await Linking.openURL('https://www.google.com/maps?q=My+Location');
          return { success: true, message: 'Maps opened', spoken: 'Opening maps' };
        }
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            return { success: false, message: 'Location permission denied', spoken: 'Please grant location access' };
          }
          const loc: { lat: number; lng: number } = await WakeWordModule.getLocation();
          // geo:lat,lng?z=16  opens native maps centered + zoomed on user.
          const url = `geo:${loc.lat},${loc.lng}?q=${loc.lat},${loc.lng}(You)&z=16`;
          try {
            await Linking.openURL(url);
          } catch {
            await Linking.openURL(`https://www.google.com/maps?q=${loc.lat},${loc.lng}`);
          }
          speak('This is your current location');
          return {
            success: true,
            message: `Location: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`,
            spoken: 'This is your current location',
          };
        } catch (e: any) {
          // Fallback to Maps "my location" view
          await Linking.openURL('https://www.google.com/maps?q=My+Location');
          return { success: false, message: 'GPS not ready — opening maps', spoken: 'Opening maps' };
        }
      }

      // ── Share my location ──
      case 'share_location': {
        const recipient = (params.contact || '').toString();
        if (Platform.OS !== 'android' || !WakeWordModule?.getLocation) {
          return { success: false, message: 'Location not supported', spoken: 'Cannot get location on this device' };
        }
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            return { success: false, message: 'Location permission denied', spoken: 'Please grant location access' };
          }
          const loc: { lat: number; lng: number } = await WakeWordModule.getLocation();
          const mapsLink = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
          if (recipient) {
            // Send via SMS or WhatsApp deep link
            let number = recipient.replace(/[\s\-()]/g, '');
            if (!/^[\+]?\d+$/.test(number) && WakeWordModule?.lookupContact) {
              const found: string | null = await WakeWordModule.lookupContact(recipient).catch(() => null);
              if (found) number = found;
            }
            if (/^[\+]?\d+$/.test(number)) {
              await Linking.openURL(`sms:${number}?body=${encodeURIComponent('My location: ' + mapsLink)}`);
            } else {
              await Linking.openURL(`https://wa.me/?text=${encodeURIComponent('My location: ' + mapsLink)}`);
            }
            speak(`Sharing location with ${recipient}`);
            return { success: true, message: `Location → ${recipient}: ${mapsLink}`, spoken: `Sharing location with ${recipient}` };
          }
          // No recipient — open share sheet
          await Linking.openURL(`https://wa.me/?text=${encodeURIComponent('My location: ' + mapsLink)}`);
          return { success: true, message: `Location: ${mapsLink}`, spoken: 'Sharing location' };
        } catch (e: any) {
          return { success: false, message: `Location error: ${e?.message || e?.code}`, spoken: 'Could not get location' };
        }
      }

      // ── Hardware: vibrate ──
      case 'vibrate': {
        const ms = parseInt((params.duration || '500').toString(), 10);
        if (Platform.OS === 'android' && WakeWordModule?.vibrateDevice) {
          try { await WakeWordModule.vibrateDevice(ms); } catch (e) { console.warn(e); }
        }
        return { success: true, message: 'Vibrated', spoken: 'Vibrating' };
      }

      // ── Hardware: set brightness to specific level ──
      case 'set_brightness': {
        let level = parseFloat((params.level || params.value || '50').toString());
        if (level > 1) level = level / 100; // accept 0-100 or 0-1
        level = Math.max(0, Math.min(1, level));
        try {
          await Brightness.setBrightnessAsync(level);
        } catch (e) { console.warn(e); }
        speak(`Brightness ${Math.round(level * 100)}%`);
        return { success: true, message: `Brightness: ${Math.round(level * 100)}%`, spoken: `Brightness ${Math.round(level * 100)} percent` };
      }

      // ── Camera with specific lens ──
      case 'camera_front':
      case 'camera_back': {
        const useFront = action === 'camera_front';
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.media.action.STILL_IMAGE_CAMERA', {
            extra: { 'android.intent.extras.CAMERA_FACING': useFront ? 1 : 0, 'android.intent.extras.USE_FRONT_CAMERA': useFront },
          });
        }
        speak(useFront ? 'Front camera' : 'Back camera');
        return { success: true, message: useFront ? 'Front camera' : 'Back camera', spoken: useFront ? 'Opening front camera' : 'Opening back camera' };
      }

      // ── Lock screen / phone (via accessibility) ──
      case 'lock_screen': {
        if (Platform.OS === 'android' && WakeWordModule?.accGlobalAction) {
          try {
            const ok = await WakeWordModule.accGlobalAction('LOCK_SCREEN');
            if (ok) { speak('Locking'); return { success: true, message: 'Locked', spoken: 'Locking' }; }
          } catch (e) { console.warn(e); }
        }
        return { success: false, message: 'Enable accessibility to lock screen', spoken: 'Please enable accessibility access' };
      }

      // ── Accessibility-driven UI control ──
      case 'go_back': {
        try { await WakeWordModule.accGlobalAction('BACK'); } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        return { success: true, message: 'Back', spoken: 'Going back' };
      }
      case 'go_home': {
        try { await WakeWordModule.accGlobalAction('HOME'); } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        return { success: true, message: 'Home', spoken: 'Going home' };
      }
      case 'show_recents': {
        try { await WakeWordModule.accGlobalAction('RECENTS'); } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        return { success: true, message: 'Recents', spoken: 'Showing recents' };
      }
      case 'scroll_up':
      case 'scroll_down': {
        const dir = action === 'scroll_up' ? 'up' : 'down';
        try { await WakeWordModule.accScroll(dir); } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        return { success: true, message: `Scrolled ${dir}`, spoken: `Scrolling ${dir}` };
      }
      case 'tap_label': {
        const label = (params.label || params.text || '').toString();
        if (!label) return { success: false, message: 'No label', spoken: 'Tap what?' };
        try {
          const ok = await WakeWordModule.accClickLabel(label);
          if (ok) { speak(`Tapped ${label}`); return { success: true, message: `Tapped: ${label}`, spoken: `Tapped ${label}` }; }
        } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        return { success: false, message: `No "${label}" on screen`, spoken: `Could not find ${label}` };
      }
      case 'type_text': {
        const text = (params.text || '').toString();
        if (!text) return { success: false, message: 'Nothing to type', spoken: 'Type what?' };
        try {
          const ok = await WakeWordModule.accTypeText(text);
          if (ok) { speak('Typed'); return { success: true, message: `Typed: ${text}`, spoken: 'Typed' }; }
        } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        return { success: false, message: 'No text field focused', spoken: 'Tap a text field first' };
      }
      case 'read_screen': {
        try {
          const screenText: string = await WakeWordModule.accReadScreen();
          if (!screenText) {
            speak('Screen is empty');
            return { success: true, message: '(empty)', spoken: 'Screen is empty' };
          }
          const { summarizeWithAI } = await import('./aiAgent');
          const summary = await summarizeWithAI(screenText);
          speak(summary);
          return { success: true, message: summary, spoken: summary };
        } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
      }

      // ── JARVIS daily briefing ──
      case 'daily_briefing': {
        const facts: string[] = [];
        const now = new Date();
        const hour = now.getHours();
        const tod = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
        facts.push(`time: ${now.toLocaleTimeString()} (${tod})`);
        facts.push(`date: ${now.toDateString()}`);
        try {
          const level = await Battery.getBatteryLevelAsync();
          const charging = (await Battery.getBatteryStateAsync()) === Battery.BatteryState.CHARGING;
          facts.push(`battery: ${Math.round(level * 100)}%${charging ? ' (charging)' : ''}`);
        } catch {}
        try {
          if (Platform.OS === 'android' && WakeWordModule?.getRecentNotifications) {
            const list: any[] = await WakeWordModule.getRecentNotifications();
            if (list?.length) {
              const apps = [...new Set(list.slice(0, 8).map(n => n.appName))].join(', ');
              facts.push(`unread notifications: ${list.length} (from ${apps})`);
            } else {
              facts.push('unread notifications: none');
            }
          }
        } catch {}
        try {
          const { loadHistory } = await import('./storageService');
          const hist = await loadHistory();
          if (hist?.length) facts.push(`last command: "${hist[0].command}"`);
        } catch {}

        try {
          const { dailyBriefingWithAI } = await import('./aiAgent');
          const persona = await getPersona();
          const briefing = await dailyBriefingWithAI(facts.join('; '), persona);
          speak(briefing);
          return { success: true, message: briefing, spoken: briefing };
        } catch (e: any) {
          const fallback = `Currently ${facts.join(', ')}.`;
          speak(fallback);
          return { success: true, message: fallback, spoken: fallback };
        }
      }

      // ── Small talk / non-action utterances → witty JARVIS reply ──
      case 'small_talk': {
        const utterance = (params.text || params.query || '').toString();
        try {
          const { jarvisReplyWithAI } = await import('./aiAgent');
          const persona = await getPersona();
          const reply = await jarvisReplyWithAI(utterance, { history: [], persona });
          speak(reply);
          return { success: true, message: reply, spoken: reply };
        } catch (e) {
          speak('At your service.');
          return { success: true, message: 'At your service.', spoken: 'At your service.' };
        }
      }

      // ── File manager / folder open ──
      case 'open_file_manager': {
        const folder = (params.folder || params.path || '').toString();
        if (Platform.OS === 'android' && WakeWordModule?.openFileManager) {
          try { await WakeWordModule.openFileManager(folder); } catch (e) { console.warn(e); }
        }
        speak(folder ? `Opening ${folder}` : 'Opening file manager');
        return { success: true, message: folder ? `Files: ${folder}` : 'File manager', spoken: 'Opening file manager' };
      }

      // ── Play media file by name (audio/video) ──
      case 'play_file': {
        const name = (params.name || params.file || params.query || '').toString().trim();
        const type = ((params.type || 'any').toString().toLowerCase()); // audio | video | any
        if (!name) return { success: false, message: 'Which file?', spoken: 'Which file?' };

        if (Platform.OS === 'android' && WakeWordModule?.findAndPlayMedia) {
          try {
            // Need READ_MEDIA_AUDIO / READ_MEDIA_VIDEO on Android 13+
            const granted = await PermissionsAndroid.requestMultiple([
              'android.permission.READ_MEDIA_AUDIO' as any,
              'android.permission.READ_MEDIA_VIDEO' as any,
              PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            ]);
            const ok = Object.values(granted).some(v => v === PermissionsAndroid.RESULTS.GRANTED);
            if (!ok) {
              speak('I need media access to play files');
              return { success: false, message: 'Media permission denied', spoken: 'Please grant media access' };
            }
            const title: string | null = await WakeWordModule.findAndPlayMedia(name, type);
            if (title) {
              speak(`Playing ${title}`);
              return { success: true, message: `Playing: ${title}`, spoken: `Playing ${title}` };
            }
          } catch (e) { console.warn('[play_file] error:', e); }
        }
        speak(`I couldn't find ${name}`);
        return { success: false, message: `No media file matching "${name}"`, spoken: `Could not find ${name}` };
      }

      // ── Dismiss / Snooze a ringing alarm via Accessibility ──
      // Works when the alarm UI is visible (even on locked screen) by tapping
      // its on-screen Stop / Dismiss / Snooze button by label.
      case 'dismiss_alarm':
      case 'snooze_alarm': {
        if (!WakeWordModule?.accClickLabel) {
          return { success: false, message: 'Enable accessibility to dismiss alarms', spoken: 'Please enable accessibility access' };
        }
        const labels = action === 'dismiss_alarm'
          ? ['stop', 'dismiss', 'turn off', 'cancel alarm', 'stop alarm', 'ok']
          : ['snooze', 'snooze alarm', 'remind me later'];
        let succeeded = false;
        for (const lbl of labels) {
          try {
            const ok = await WakeWordModule.accClickLabel(lbl);
            if (ok) { succeeded = true; break; }
          } catch { /* try next label */ }
        }
        if (succeeded) {
          speak(action === 'dismiss_alarm' ? 'Alarm dismissed' : 'Snoozed');
          return { success: true, message: action === 'dismiss_alarm' ? 'Alarm stopped' : 'Snoozed', spoken: action === 'dismiss_alarm' ? 'Alarm dismissed' : 'Snoozed' };
        }
        // Fallback: kill the audio for the alarm stream
        try { await WakeWordModule.setMute?.(true); } catch {}
        speak('Tried to dismiss the alarm');
        return { success: false, message: 'No alarm UI button found — muted instead', spoken: 'Could not find dismiss button' };
      }

      // ── Continuous location tracking → Firestore ──
      case 'start_tracking': {
        const minutes = parseInt((params.duration || params.minutes || '30').toString(), 10);
        const intervalSec = parseInt((params.interval || '30').toString(), 10);
        if (Platform.OS !== 'android' || !WakeWordModule?.startLocationTracking) {
          return { success: false, message: 'Tracking not supported', spoken: 'Tracking is not supported on this device' };
        }
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          return { success: false, message: 'Location permission denied', spoken: 'Please grant location access' };
        }
        // Start session in Firestore
        let sessionId = `track-${Date.now()}`;
        try {
          const { db } = await import('./firebaseConfig');
          const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
          await setDoc(doc(db, 'tracking-sessions', sessionId), {
            started_at: serverTimestamp(),
            duration_min: minutes,
            interval_sec: intervalSec,
            status: 'active',
          });
        } catch (e) { console.warn('[track] Firestore session create failed:', e); }

        // Subscribe to native location updates and write each to Firestore
        try {
          const { DeviceEventEmitter } = await import('react-native');
          const sub = DeviceEventEmitter.addListener('onLocationUpdate', async (loc) => {
            try {
              const { db } = await import('./firebaseConfig');
              const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
              await addDoc(collection(db, 'tracking-sessions', sessionId, 'points'), {
                lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy,
                ts: loc.ts, recorded_at: serverTimestamp(),
              });
            } catch (e) { console.warn('[track] write point failed:', e); }
          });
          // Auto-cleanup after duration
          setTimeout(() => sub.remove(), minutes * 60_000 + 5_000);
        } catch (e) { console.warn(e); }

        await WakeWordModule.startLocationTracking(intervalSec, minutes);
        speak(`Tracking your location for ${minutes} minutes`);
        return { success: true, message: `Tracking started — session ${sessionId} for ${minutes} min`, spoken: `Tracking for ${minutes} minutes` };
      }
      case 'stop_tracking': {
        if (Platform.OS === 'android' && WakeWordModule?.stopLocationTracking) {
          try { await WakeWordModule.stopLocationTracking(); } catch (e) { console.warn(e); }
        }
        speak('Tracking stopped');
        return { success: true, message: 'Tracking stopped', spoken: 'Tracking stopped' };
      }

      // ── Share live location ──
      // Two-step: opens Google Maps share dialog. User taps "Share live location"
      // and selects duration/recipient (Maps' own UI — we can't bypass that).
      case 'share_live_location': {
        const contact = (params.contact || '').toString();
        const minutes = (params.minutes || params.duration || '60').toString();
        // Open Google Maps to its share-location entry point
        await Linking.openURL('https://www.google.com/maps/timeline/_/sharelocation').catch(async () => {
          await Linking.openURL('google.navigation:q=current+location');
        });
        const hint = `Tap Share Live Location, choose ${minutes} minutes${contact ? `, then select ${contact}` : ''}.`;
        speak(`Opening Maps. ${hint}`);
        return { success: true, message: `Live location → ${contact || 'pick recipient'} for ${minutes} min. ${hint}`, spoken: hint };
      }

      // ── Small talk PLACEHOLDER markers fixed (avoid duplicate case) ──

      // ── Take photo ──
      case 'take_photo': {
        const useFront = !!(params.front || params.selfie);
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            return { success: false, message: 'Camera permission denied', spoken: 'Please grant camera access' };
          }
          await IntentLauncher.startActivityAsync('android.media.action.IMAGE_CAPTURE', {
            extra: useFront ? { 'android.intent.extras.CAMERA_FACING': 1, 'android.intent.extras.USE_FRONT_CAMERA': true } : {},
          });
          // After camera launches, optionally tap the shutter via accessibility (Android shows a "Shutter" or "Take photo" button)
          if (params.autoShutter && WakeWordModule?.accClickLabel) {
            await new Promise(r => setTimeout(r, 1500));
            try { await WakeWordModule.accClickLabel('shutter'); } catch {}
          }
        }
        speak(useFront ? 'Front camera ready' : 'Camera ready');
        return { success: true, message: 'Camera opened', spoken: useFront ? 'Front camera' : 'Camera' };
      }

      // ── Record audio ──
      case 'record_audio': {
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.provider.MediaStore.RECORD_SOUND_ACTION');
        }
        speak('Audio recorder open');
        return { success: true, message: 'Audio recorder', spoken: 'Audio recorder open' };
      }

      // ── Record video ──
      case 'record_video': {
        if (Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.media.action.VIDEO_CAPTURE');
        }
        speak('Video recorder open');
        return { success: true, message: 'Video recorder', spoken: 'Video recorder open' };
      }

      // ── Clipboard / Edit operations (work in any text field via accessibility) ──
      case 'copy_text': {
        const text = (params.text || '').toString();
        if (text && WakeWordModule?.setClipboard) {
          try { await WakeWordModule.setClipboard(text); } catch (e) { console.warn(e); }
          speak('Copied');
          return { success: true, message: `Copied: ${text}`, spoken: 'Copied' };
        }
        // Otherwise copy whatever is selected in the focused field
        try { await WakeWordModule.accClipboardAction('COPY'); } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        speak('Copied');
        return { success: true, message: 'Copied selection', spoken: 'Copied' };
      }
      case 'cut_text': {
        try { await WakeWordModule.accClipboardAction('CUT'); } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        speak('Cut');
        return { success: true, message: 'Cut selection', spoken: 'Cut' };
      }
      case 'paste_text': {
        const inline = (params.text || '').toString();
        if (inline && WakeWordModule?.setClipboard) {
          try { await WakeWordModule.setClipboard(inline); } catch {}
        }
        try { await WakeWordModule.accClipboardAction('PASTE'); } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        speak('Pasted');
        return { success: true, message: 'Pasted', spoken: 'Pasted' };
      }
      case 'select_all': {
        try { await WakeWordModule.accClipboardAction('SELECT_ALL'); } catch (e: any) {
          return { success: false, message: 'Enable accessibility', spoken: 'Please enable accessibility' };
        }
        speak('Selected all');
        return { success: true, message: 'Selected all', spoken: 'Selected all' };
      }

      // ── Ringer / silent / DND ──
      case 'silent_mode':
      case 'normal_mode':
      case 'vibrate_mode': {
        const mode = action === 'silent_mode' ? 'SILENT' : action === 'vibrate_mode' ? 'VIBRATE' : 'NORMAL';
        try { await WakeWordModule.setRingerMode(mode); } catch (e: any) {
          if (e?.code === 'DND_PERMISSION') {
            return { success: false, message: 'Grant DND access to silent the phone', spoken: 'Please grant Do Not Disturb access' };
          }
        }
        speak(action === 'silent_mode' ? 'Silenced' : action === 'vibrate_mode' ? 'Vibrate mode' : 'Normal mode');
        return { success: true, message: action.replace('_', ' '), spoken: action.replace('_', ' ') };
      }
      case 'dnd_on':
      case 'dnd_off': {
        const filter = action === 'dnd_on' ? 'PRIORITY' : 'OFF';
        try { await WakeWordModule.setDoNotDisturb(filter); } catch (e: any) {
          return { success: false, message: 'Grant DND access first', spoken: 'Please grant Do Not Disturb access' };
        }
        speak(action === 'dnd_on' ? 'Do not disturb on' : 'Do not disturb off');
        return { success: true, message: action.replace('_', ' '), spoken: action.replace('_', ' ') };
      }

      // ── Bluetooth audio routing ──
      case 'bluetooth_audio_on':
      case 'bluetooth_audio_off': {
        const on = action === 'bluetooth_audio_on';
        try { await WakeWordModule.setBluetoothAudio(on); } catch (e) { console.warn(e); }
        speak(on ? 'Routing audio to Bluetooth' : 'Audio back to phone');
        return { success: true, message: on ? 'Bluetooth audio on' : 'Bluetooth audio off', spoken: on ? 'Bluetooth' : 'Phone audio' };
      }

      // ── Calls: answer / decline / silence ringer ──
      case 'answer_call': {
        const labels = ['answer', 'accept', 'pick up', 'receive'];
        for (const l of labels) {
          try { if (await WakeWordModule.accClickLabel(l)) { speak('Call answered'); return { success: true, message: 'Answered', spoken: 'Call answered' }; } } catch {}
        }
        return { success: false, message: 'No answer button visible. Enable accessibility.', spoken: 'No incoming call to answer' };
      }
      case 'decline_call':
      case 'reject_call': {
        const labels = ['decline', 'reject', 'dismiss', 'end call', 'hang up'];
        for (const l of labels) {
          try { if (await WakeWordModule.accClickLabel(l)) { speak('Call declined'); return { success: true, message: 'Declined', spoken: 'Call declined' }; } } catch {}
        }
        return { success: false, message: 'No decline button visible. Enable accessibility.', spoken: 'No call to decline' };
      }
      case 'silence_ringer': {
        try { await WakeWordModule.setMute?.(true); } catch {}
        speak('Silenced');
        return { success: true, message: 'Ringer muted', spoken: 'Silenced' };
      }

      // ── Scan QR / barcode (open Google Lens) ──
      case 'scan_qr': {
        if (Platform.OS === 'android' && WakeWordModule?.launchAppByName) {
          try {
            const pkg = await WakeWordModule.launchAppByName('lens');
            if (pkg) { speak('Opening Google Lens to scan'); return { success: true, message: 'Lens opened', spoken: 'Opening Lens to scan' }; }
          } catch {}
        }
        await Linking.openURL('https://lens.google.com').catch(() => {});
        speak('Opening Lens for scanning');
        return { success: true, message: 'Lens opened', spoken: 'Opening Lens to scan' };
      }

      // ── Remember / recall facts (persist to Firestore) ──
      case 'remember_fact':
      case 'remember': {
        const fact = (params.text || params.fact || '').toString().trim();
        if (!fact) return { success: false, message: 'Remember what?', spoken: 'What should I remember?' };
        try {
          const { db } = await import('./firebaseConfig');
          const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
          await addDoc(collection(db, 'memories'), { text: fact, created_at: serverTimestamp() });
          speak('Got it, I will remember');
          return { success: true, message: `Remembered: "${fact}"`, spoken: 'I will remember that' };
        } catch (e: any) {
          return { success: false, message: 'Could not save: ' + (e?.message || ''), spoken: 'Could not remember that' };
        }
      }
      case 'recall_fact':
      case 'recall': {
        const query = (params.text || params.query || '').toString().trim();
        try {
          const { db } = await import('./firebaseConfig');
          const { getDocs, query: fbQuery, collection, orderBy, limit } = await import('firebase/firestore');
          const snap = await getDocs(fbQuery(collection(db, 'memories'), orderBy('created_at', 'desc'), limit(50)));
          const facts = snap.docs.map(d => (d.data() as any).text).filter(Boolean);
          if (facts.length === 0) {
            speak('I have nothing remembered yet');
            return { success: true, message: 'No memories', spoken: 'I have nothing remembered yet' };
          }
          const { chat } = await import('./aiAgent');
          const sys = 'You receive a question and a list of remembered facts. Reply with the single most relevant fact in 1 short sentence. If none match, say "I do not have that information yet."';
          const reply = await chat(sys, `Question: ${query || 'what do I have'}\nFacts:\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
          speak(reply);
          return { success: true, message: reply, spoken: reply };
        } catch (e: any) {
          return { success: false, message: 'Could not recall: ' + (e?.message || ''), spoken: 'Could not recall' };
        }
      }

      // ── Set reminder (alarm with label) ──
      case 'set_reminder': {
        const text = (params.text || params.label || 'Reminder').toString();
        const hour = parseInt((params.hour || '9').toString(), 10);
        const minute = parseInt((params.minute || '0').toString(), 10);
        if (Platform.OS === 'android') {
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
              extra: {
                'android.intent.extra.alarm.HOUR': hour,
                'android.intent.extra.alarm.MINUTES': minute,
                'android.intent.extra.alarm.SKIP_UI': true,
                'android.intent.extra.alarm.MESSAGE': text,
              },
            });
          } catch (e) { console.warn(e); }
        }
        speak(`Reminder set for ${hour}:${minute.toString().padStart(2, '0')}`);
        return { success: true, message: `Reminder: ${hour}:${minute.toString().padStart(2, '0')} ${text}`, spoken: `Reminder set` };
      }

      // ── Close app (best-effort via Recents) ──
      case 'close_app': {
        const name = (params.appName || params.name || '').toString();
        try { await WakeWordModule.accGlobalAction?.('HOME'); } catch {}
        await new Promise(r => setTimeout(r, 300));
        if (name) {
          try { await WakeWordModule.accGlobalAction?.('RECENTS'); } catch {}
          await new Promise(r => setTimeout(r, 700));
          for (const l of [`close ${name.toLowerCase()}`, `dismiss ${name.toLowerCase()}`, 'clear all', 'close all']) {
            try { if (await WakeWordModule.accClickLabel?.(l)) break; } catch {}
          }
        }
        speak(name ? `Closed ${name}` : 'Closed');
        return { success: true, message: name ? `Closed ${name}` : 'App closed (best effort)', spoken: name ? `Closed ${name}` : 'Closed' };
      }


      // ── AI chat / question / audit / compare / solve / answer ──
      // Free-form OpenAI Q&A. Handles: 'compare X and Y', 'audit my last note',
      // 'solve 2x+5=11', 'what is the capital of France', 'why is the sky blue',
      // 'is this email professional', 'tell me a story', 'explain quantum mechanics'
      case 'ai_chat':
      case 'ai_question':
      case 'ai_audit':
      case 'ai_compare':
      case 'ai_solve': {
        const question = (params.text || params.query || params.question || '').toString().trim();
        if (!question) return { success: false, message: 'Ask what?', spoken: 'What is your question?' };
        try {
          const { jarvisReplyWithAI } = await import('./aiAgent');
          const persona = await getPersona();
          // Override with a more capable system prompt for reasoning tasks.
          const sys = persona === 'jarvis'
            ? 'You are J.A.R.V.I.S. — a witty British-butler AI that answers ANY question concisely and accurately. Audit / compare / solve / explain / advise as needed. Address the user as sir. Replies must fit in 1-3 spoken sentences. No markdown.'
            : 'You are a concise helpful assistant. Answer ANY question accurately in 1-3 sentences. No markdown.';
          // Use chat() directly with the override prompt
          const { chat } = await import('./aiAgent');
          const reply = await chat(sys, question);
          speak(reply);
          return { success: true, message: reply, spoken: reply };
        } catch (e: any) {
          return { success: false, message: 'AI failed: ' + (e?.message || ''), spoken: 'I could not answer that' };
        }
      }

      // ── Unknown ──
      default:
        speak("Sorry, I didn't understand that command");
        return { success: false, message: `Unknown command: "${(params.rawText || '').toString()}"`, spoken: "Sorry, I didn't understand that command" };
    }
  } catch (error: any) {
    const msg = error?.message || 'Action failed';
    speak('Sorry, something went wrong');
    return { success: false, message: msg, spoken: 'Sorry, something went wrong' };
  }
}
