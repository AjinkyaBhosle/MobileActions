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

// Text-to-speech feedback
function speak(text: string) {
  Speech.speak(text, {
    language: 'en-US',
    rate: 1.0,
    pitch: 1.0,
  });
}

export async function executeAction(command: ParsedCommand): Promise<ActionResult> {
  const { action, params } = command;

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
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
              extra: {
                'android.intent.extra.alarm.HOUR': hour,
                'android.intent.extra.alarm.MINUTES': minute,
                'android.intent.extra.alarm.SKIP_UI': true,
                'android.intent.extra.alarm.MESSAGE': (params.label || 'Mobile Action alarm').toString(),
              },
            });
          } catch (e) {
            console.warn('SET_ALARM intent failed:', e);
            await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
              category: 'android.intent.category.APP_CALENDAR',
            }).catch(() => {});
          }
        }
        const hh = (params.hour || '7').toString();
        const mm = (params.minute || '0').toString().padStart(2, '0');
        speak(`Setting alarm for ${hh}:${mm}`);
        return { success: true, message: `Alarm set for ${hh}:${mm}`, spoken: `Setting alarm for ${hh}:${mm}` };
      }

      // ── Open App ──
      case 'open_app': {
        const appName = (params.appName || '').toString();
        const pkg = (params.packageName || '').toString();

        if (Platform.OS === 'android' && pkg) {
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
              packageName: pkg,
            });
            speak(`Opening ${appName}`);
            return { success: true, message: `${appName} opened`, spoken: `Opening ${appName}` };
          } catch {
            // Try Play Store as fallback
            await Linking.openURL(`market://details?id=${pkg}`);
          }
        }

        // Try common URL schemes
        const schemes: Record<string, string> = {
          whatsapp: 'whatsapp://',
          youtube: 'vnd.youtube://',
          instagram: 'instagram://',
          twitter: 'twitter://',
          spotify: 'spotify://',
          telegram: 'tg://',
        };
        const scheme = schemes[appName.toLowerCase()];
        if (scheme) {
          try {
            await Linking.openURL(scheme);
            speak(`Opening ${appName}`);
            return { success: true, message: `${appName} opened`, spoken: `Opening ${appName}` };
          } catch { /* continue */ }
        }

        speak(`Could not open ${appName}`);
        return { success: false, message: `Cannot open ${appName}`, spoken: `Could not open ${appName}` };
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

      // ── Take screenshot (system shortcut, requires Android 9+) ──
      case 'take_screenshot': {
        if (Platform.OS === 'android' && WakeWordModule?.takeScreenshot) {
          try { await WakeWordModule.takeScreenshot(); } catch (e) { console.warn(e); }
        }
        speak('Screenshot taken');
        return { success: true, message: 'Screenshot', spoken: 'Screenshot taken' };
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
