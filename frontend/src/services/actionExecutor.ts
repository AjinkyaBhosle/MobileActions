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
        const appName = params.appName || '';
        const pkg = params.packageName || '';

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

      // ── Unknown ──
      default:
        speak("Sorry, I didn't understand that command");
        return { success: false, message: `Unknown command: "${params.rawText || ''}"`, spoken: "Sorry, I didn't understand that command" };
    }
  } catch (error: any) {
    const msg = error?.message || 'Action failed';
    speak('Sorry, something went wrong');
    return { success: false, message: msg, spoken: 'Sorry, something went wrong' };
  }
}
