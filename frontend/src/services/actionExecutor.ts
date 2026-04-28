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
        const contact = params.contact || '';
        if (contact) {
          const isNumber = /^[\d+\-\s()]+$/.test(contact);
          const sanitizedContact = isNumber ? contact.replace(/[\s\-()]/g, '') : '';
          
          if (sanitizedContact && Platform.OS === 'android') {
            try {
              // Request runtime permission to make direct calls
              const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.CALL_PHONE
              );
              
              if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                // FLAG_ACTIVITY_NEW_TASK (268435456) forces the intent out of our activity stack.
                // This prevents `startActivityForResult` from hanging indefinitely, which avoids E_ACTIVITY_ALREADY_STARTED.
                await IntentLauncher.startActivityAsync('android.intent.action.CALL', {
                  data: `tel:${sanitizedContact}`,
                  flags: 268435456,
                }).catch(() => {
                  // Catch internally if it immediately cancels
                });
                
                speak(`Calling ${sanitizedContact}`);
                return { success: true, message: `Calling ${sanitizedContact}`, spoken: `Calling ${sanitizedContact}` };
              }
            } catch (error) {
              console.warn('Call permission error:', error);
            }
          }
          
          // Fallback to dialer if iOS, if not a direct number, or if permission denied
          await Linking.openURL(`tel:${sanitizedContact || contact}`);
          speak(`Opening dialer for ${contact}`);
          return { success: true, message: `Dialer: ${contact}`, spoken: `Opening dialer` };
        }
        await Linking.openURL('tel:');
        speak('Opening dialer');
        return { success: true, message: 'Dialer opened', spoken: 'Opening dialer' };
      }

      // ── SMS ──
      case 'send_sms': {
        const recipient = params.contact || '';
        const message = params.message || '';
        const smsUrl = message
          ? `sms:${recipient}?body=${encodeURIComponent(message)}`
          : `sms:${recipient}`;
        await Linking.openURL(smsUrl);
        speak(`Opening messaging for ${recipient || 'new message'}`);
        return { success: true, message: `SMS to ${recipient || 'new'}`, spoken: `Opening messaging` };
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
          const hour = params.hour || '7';
          const minute = params.minute || '0';
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
              extra: {
                'android.intent.extra.alarm.HOUR': parseInt(hour),
                'android.intent.extra.alarm.MINUTES': parseInt(minute),
                'android.intent.extra.alarm.SKIP_UI': false,
              },
            });
          } catch {
            await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
              category: 'android.intent.category.APP_CALENDAR',
            });
          }
        }
        speak(`Setting alarm for ${params.hour || '7'}:${params.minute || '00'}`);
        return { success: true, message: `Alarm set for ${params.hour || '7'}:${(params.minute || '00').padStart(2, '0')}`, spoken: `Setting alarm` };
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
