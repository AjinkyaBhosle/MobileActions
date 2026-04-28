import notifee, { AndroidImportance } from '@notifee/react-native';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { loadSettings } from './storageService';

const { WakeWordModule } = NativeModules;

/**
 * Initializes the Wake Word Service.
 * The native WakeWordService handles everything: wake word detection,
 * command grammar switching, and command execution.
 * This JS function just starts the foreground service.
 */
export async function startBackgroundListening() {
  try {
    if (WakeWordModule) WakeWordModule.startService();

    // Create a LOW importance channel (no vibration/sound)
    const channelId = await notifee.createChannel({
      id: 'background_listening',
      name: 'Background Listening Service',
      importance: AndroidImportance.LOW,
    });

    // Display a persistent notification
    await notifee.displayNotification({
      title: 'Assistant Ready',
      body: 'Always listening for "Hey Mobile"',
      android: {
        channelId,
        asForegroundService: false, 
        smallIcon: 'ic_launcher',
        color: '#1B8C3D',
        pressAction: {
          id: 'default',
        },
      },
    });

    // The native service starts listening automatically via initModel().
    // Do NOT call WakeWordModule.startListening() here — it would duplicate/restart the recognizer.
    console.log('[Background] Native service started. Vosk handles everything.');

    // Keep the headless task alive
    await new Promise(() => {});
  } catch (error) {
    console.error('[Background] Failed to start native service:', error);
  }
}

/**
 * Stops the Foreground Service and Native listener.
 */
export async function stopBackgroundListening() {
  try {
    if (WakeWordModule) {
      WakeWordModule.stopListening();
      WakeWordModule.stopService();
    }
    await notifee.stopForegroundService();
    console.log('[Background] Service stopped.');
  } catch (error) {
    console.error('[Background] Failed to stop service:', error);
  }
}

/**
 * Manages Microphone Handshake for manual input.
 */
export async function stopVoskOnly() {
  if (WakeWordModule) {
    WakeWordModule.stopListening();
    console.log('[Background] Native listener paused for manual input.');
  }
}

export async function startVoskOnly() {
  if (WakeWordModule) {
    WakeWordModule.startListening();
    console.log('[Background] Native listener resumed.');
  }
}
