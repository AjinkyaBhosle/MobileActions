import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  TextInput, KeyboardAvoidingView, Image, Pressable, DeviceEventEmitter,
  PermissionsAndroid, NativeModules
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import notifee from '@notifee/react-native';
import * as Brightness from 'expo-brightness';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { executeAction } from '../src/services/actionExecutor';
import { COLORS } from '../src/constants/theme';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  recordCommand, loadHistory, saveHistory, clearHistory,
  type HistoryItem, loadStats, type CommandStats, loadSettings,
} from '../src/services/storageService';
import { processCommandWithAI } from '../src/services/aiAgent';
import { startBackgroundListening, stopVoskOnly, startVoskOnly } from '../src/services/backgroundService';

type AppState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const SUPPORTED_ACTIONS = [
  { icon: 'flashlight-outline', label: 'Turn flashlight on/off' },
  { icon: 'person-add-outline', label: 'Create contact' },
  { icon: 'mail-outline', label: 'Send email' },
  { icon: 'calendar-outline', label: 'Create calendar event' },
  { icon: 'map-outline', label: 'Show location on map' },
  { icon: 'wifi-outline', label: 'Open WIFI settings' },
];

const QUICK_CHIPS = [
  'Flashlight on', 'Flashlight off', 'Open camera', 'Set alarm',
  'Open WiFi', 'What time', 'Open maps', 'Open WhatsApp',
  'Call', 'Send SMS', 'Volume up', 'Bluetooth',
];

export default function HomeScreen() {
  const router = useRouter();
  const [appState, setAppState] = useState<AppState>('idle');
  const appStateRef = useRef<AppState>('idle');

  // Keep ref in sync
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);
  const [transcript, setTranscript] = useState('');
  const [responseText, setResponseText] = useState('');
  const [functionCalled, setFunctionCalled] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [stats, setStats] = useState<CommandStats | null>(null);
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);
  const holdingRef = useRef(false);
  const nativeHandlingRef = useRef(false);  // True when native Vosk is handling a command

  const [supportedLang, setSupportedLang] = useState('en-US');
  const [recognizerPkg, setRecognizerPkg] = useState<string | undefined>();
  const supportedLangRef = useRef(supportedLang);
  const recognizerPkgRef = useRef(recognizerPkg);

  const requestAllPermissions = async () => {
    try {
      console.log('[Permissions] Starting sequential grant...');
      
      // 1. Runtime permissions for communication (Android) - MOST CRITICAL
      if (Platform.OS === 'android') {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.CALL_PHONE,
          PermissionsAndroid.PERMISSIONS.SEND_SMS,
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        ];

        if (parseInt(Platform.Version as string, 10) >= 33) {
          // @ts-ignore
          permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }

        const results = await PermissionsAndroid.requestMultiple(permissions);
        console.log('[Permissions] Basic Results:', results);
      }

      // 2. Specific Expo Module permissions
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      await Brightness.requestPermissionsAsync();
      
      // 3. Notifee (Separate flow)
      await notifee.requestPermission();
      
      console.log('[Permissions] Sequence Completed.');
    } catch (err) {
      console.warn('[Permissions] Grant Error:', err);
    }
  };

  useEffect(() => {
    requestAllPermissions();
    loadHistory().then(setHistory);
    loadStats().then(setStats);
    
    loadSettings().then(settings => {
      if (settings.backgroundListening) {
        // DEFENSIVE: Wait for splash screen to clear before engaging native mic
        setTimeout(() => {
          startBackgroundListening().catch(e => console.error('Failed to auto-start background service:', e));
        }, 2000);
      }
    });

    const wakeSub = DeviceEventEmitter.addListener('onBackgroundWake', async () => {
      console.log('[UI] Native Wake Detected! Handing off to Google STT.');
      if (appStateRef.current === 'idle') {
         nativeHandlingRef.current = true;
         setAppState('listening');
         setTranscript('Listening for command...');
         
         // Start Google STT to capture the complex command
         console.log('[STT] Starting with lang:', supportedLangRef.current, 'pkg:', recognizerPkgRef.current);
         ExpoSpeechRecognitionModule.start({
           lang: supportedLangRef.current,
           interimResults: true,
           continuous: false,
           requiresOnDeviceRecognition: false,
           addsPunctuation: false,
           androidRecognitionServicePackage: recognizerPkgRef.current,
         });
         
         // Auto-reset UI after timeout in case nothing happens
         setTimeout(() => {
           if (appStateRef.current === 'listening') {
             nativeHandlingRef.current = false;
             ExpoSpeechRecognitionModule.stop();
             setAppState('idle');
             setTranscript('');
             startVoskOnly();
           }
         }, 7000);
      }
    });

    ExpoSpeechRecognitionModule.getSupportedLocales({}).then((info) => {
      const services = ExpoSpeechRecognitionModule.getSpeechRecognitionServices() || [];
      if (services.includes('com.google.android.as')) {
        setRecognizerPkg('com.google.android.as');
        recognizerPkgRef.current = 'com.google.android.as';
      } else if (services.includes('com.google.android.googlequicksearchbox')) {
        setRecognizerPkg('com.google.android.googlequicksearchbox');
        recognizerPkgRef.current = 'com.google.android.googlequicksearchbox';
      }
      const offlineEn = info.installedLocales.find((l: string) => l.startsWith('en-'));
      const onlineEn = info.locales.find((l: string) => l.startsWith('en-'));
      if (offlineEn) { setSupportedLang(offlineEn); supportedLangRef.current = offlineEn; }
      else if (onlineEn) { setSupportedLang(onlineEn); supportedLangRef.current = onlineEn; }
      console.log('[STT] Detected lang:', supportedLangRef.current, 'pkg:', recognizerPkgRef.current);
    }).catch(console.warn);

    // NOTE: The 'onTranscript' event is no longer emitted by the current
    // native WakeWordService (it was part of the offline-Vosk-only flow that
    // has been replaced by the Vosk wake-word + Google STT + OpenAI hybrid).
    // The Google STT result handler below ('useSpeechRecognitionEvent("result")')
    // is what actually drives processCommand() now.

    const commandSub = DeviceEventEmitter.addListener('onCommandHandled', () => {
       console.log('[UI] Native Command Handled. Resetting...');
       nativeHandlingRef.current = false;  // Unblock
       ExpoSpeechRecognitionModule.stop();
       setAppState('idle');
       setTranscript('');
    });

    return () => {
      wakeSub.remove();
      commandSub.remove();
    };
  }, []);

  useSpeechRecognitionEvent('start', () => {
    setAppState('listening');
    setTranscript('');
    setResponseText('');
    setFunctionCalled('');
  });

  useSpeechRecognitionEvent('end', () => {
    console.log('[STT] end event. appState:', appStateRef.current, 'nativeHandling:', nativeHandlingRef.current);
    if (holdingRef.current) holdingRef.current = false;
    // Don't process transcript here — the 'result' event with isFinal=true already handles it.
    // This handler only resets state if STT ended without capturing anything.
    if (appStateRef.current === 'listening') {
      console.log('[STT] end -> no final result received, resetting to idle');
      setAppState('idle');
      nativeHandlingRef.current = false;
      startVoskOnly();
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript || '';
    console.log('[STT] result event. text:', text, 'isFinal:', event.isFinal);
    setTranscript(text);
    if (event.isFinal && text) {
      console.log('[STT] Final result -> processing:', text);
      processCommand(text);
      setTimeout(() => startVoskOnly(), 3000);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.log('Speech error:', event.error);
    if (event.error === 'no-speech' || event.error === 'audio-capture') {
      setAppState('idle');
      setResponseText('');
      setTranscript('');
      startVoskOnly();
      return;
    }
    setAppState('error');
    setResponseText('Could not recognize speech. Please try again.');
    setTimeout(() => {
      setAppState('idle');
      setResponseText('');
      setTranscript('');
      startVoskOnly();
    }, 3000);
  });

  const processCommand = useCallback(async (rawText: string) => {
    console.log('[AI] processCommand called with:', rawText);
    setAppState('processing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      console.log('[AI] Sending to OpenAI...');
      const aiActions = await processCommandWithAI(rawText);
      console.log('[AI] OpenAI response:', JSON.stringify(aiActions));
      const allMessages: string[] = [];
      let successCount = 0;
      
      for (const cmd of aiActions) {
        setFunctionCalled(cmd.action);
        // Map to ParsedCommand format for actionExecutor
        const parsed = { action: cmd.action, params: cmd.params || {}, displayText: cmd.action };
        const result = await executeAction(parsed);
        
        if (result.actionSignal === 'FLASHLIGHT_ON') setIsFlashlightOn(true);
        if (result.actionSignal === 'FLASHLIGHT_OFF') setIsFlashlightOn(false);
        
        allMessages.push(result.message);
        if (result.success) successCount++;
        
        // Record history
        const item: HistoryItem = { id: Date.now().toString(), command: rawText, result: result.message, success: result.success, timestamp: new Date().toISOString(), actionType: parsed.action };
        setHistory(prev => {
          const newHistory = [item, ...prev].slice(0, 50);
          saveHistory(newHistory);
          return newHistory;
        });
      }
      
      setResponseText(allMessages.join(' → '));
      setAppState(successCount > 0 ? 'success' : 'error');
    } catch (e: any) {
      setResponseText('Failed to process with AI: ' + e.message);
      setAppState('error');
    }
    
    setTimeout(() => { setAppState('idle'); setResponseText(''); setTranscript(''); }, 4000);
  }, [history]);

  const handlePressIn = useCallback((isHandsFree = false) => {
    if (!isHandsFree) holdingRef.current = true;
    stopVoskOnly();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTranscript('');
    setResponseText('');
    setFunctionCalled('');
    setTimeout(() => {
      ExpoSpeechRecognitionModule.start({
        lang: supportedLang,
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        androidRecognitionServicePackage: recognizerPkg,
      });
    }, 200);
  }, [supportedLang, recognizerPkg]);

  const handlePressOut = useCallback(() => {
    holdingRef.current = false;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const handleChipPress = useCallback((cmd: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTranscript(cmd);
    processCommand(cmd);
  }, [processCommand]);

  const handleTextSubmit = useCallback(() => {
    if (textInput.trim()) {
      setTranscript(textInput.trim());
      processCommand(textInput.trim());
      setTextInput('');
      setShowKeyboard(false);
    }
  }, [textInput, processCommand]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <View style={styles.header} testID="app-header">
            <View style={styles.headerLeft}>
              <Image source={require('../assets/images/logo.jpg')} style={styles.headerLogo} />
              <Text style={styles.headerTitle}>Mobile Action</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/settings')} style={styles.headerBtn}>
              <Ionicons name="settings-outline" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Battery Optimization Settings Shortcut */}
            {Platform.OS === 'android' && (
              <TouchableOpacity 
                style={styles.batteryWarning}
                onPress={() => IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS')}
              >
                <Ionicons name="flash-outline" size={18} color="#FFD60A" />
                <Text style={styles.batteryWarningText}>Enable "Always Active" to prevent background kill</Text>
                <Ionicons name="chevron-forward" size={14} color="#FFD60A" opacity={0.5} />
              </TouchableOpacity>
            )}
            {appState === 'idle' && !responseText && (
              <Animated.View entering={FadeIn.duration(400)} style={styles.titleSection}>
                <Text style={styles.appTitle}>Mobile Action</Text>
                <Text style={styles.appSubtitle}>Control your device with simple commands</Text>
                <View style={styles.actionsBlock}>
                  <Text style={styles.actionsHeader}>Supported sample actions:</Text>
                  {SUPPORTED_ACTIONS.map((a, i) => (
                    <View key={i} style={styles.actionRow}>
                      <Ionicons name={a.icon as any} size={18} color={COLORS.textSecondary} />
                      <Text style={styles.actionLabel}>{a.label}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {appState === 'listening' && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.listeningSection}>
                <View style={styles.listeningDots}>
                  <View style={[styles.dot, { backgroundColor: COLORS.listening }]} />
                  <View style={[styles.dot, { backgroundColor: COLORS.listening, opacity: 0.6 }]} />
                  <View style={[styles.dot, { backgroundColor: COLORS.listening, opacity: 0.3 }]} />
                </View>
                <Text style={styles.listeningLabel}>Listening...</Text>
                {transcript ? <Text style={styles.transcriptText}>"{transcript}"</Text> : null}
              </Animated.View>
            )}

            {appState === 'processing' && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.processingSection}>
                <Ionicons name="hourglass" size={24} color={COLORS.processing} />
                <Text style={styles.processingLabel}>Processing command...</Text>
              </Animated.View>
            )}

            {(appState === 'success' || appState === 'error') && (
              <Animated.View entering={FadeInDown.duration(400)} style={styles.resultSection}>
                {transcript ? <Text style={styles.transcriptText}>"{transcript}"</Text> : null}
                {functionCalled ? (
                  <View style={[styles.functionBadge, { backgroundColor: appState === 'success' ? COLORS.successBg : COLORS.errorBg }]}>
                    <Text style={[styles.functionText, { color: appState === 'success' ? COLORS.success : COLORS.error }]}>{functionCalled}</Text>
                  </View>
                ) : null}
                {responseText ? <Text style={styles.responseText}>{responseText}</Text> : null}
              </Animated.View>
            )}
          </ScrollView>

          <View style={styles.bottomBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {QUICK_CHIPS.map((chip) => (
                <TouchableOpacity key={chip} style={styles.chip} onPress={() => handleChipPress(chip)}>
                  <Text style={styles.chipText}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {showKeyboard && (
              <View style={styles.textRow}>
                <TextInput style={styles.textInput} placeholder="Type a command..." value={textInput} onChangeText={setTextInput} onSubmitEditing={handleTextSubmit} autoFocus />
                <TouchableOpacity style={styles.sendBtn} onPress={handleTextSubmit}>
                  <Ionicons name="send" size={18} color={COLORS.textOnPrimary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.talkRow}>
              <TouchableOpacity style={styles.keyboardBtn} onPress={() => setShowKeyboard(!showKeyboard)}>
                <Ionicons name={showKeyboard ? 'mic' : 'keypad'} size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <Pressable
                onPressIn={() => handlePressIn(false)}
                onPressOut={handlePressOut}
                style={({ pressed }) => [styles.talkBtn, { backgroundColor: pressed || appState === 'listening' ? COLORS.listening : COLORS.primary }]}
              >
                <Text style={styles.talkBtnText}>{appState === 'listening' ? 'Listening...' : 'Hold to talk'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogo: { width: 28, height: 28, borderRadius: 6 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: COLORS.primary },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  titleSection: { alignItems: 'center' },
  appTitle: { fontSize: 28, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  appSubtitle: { fontSize: 15, color: COLORS.textSecondary, marginBottom: 32 },
  actionsHeader: { fontSize: 13, color: COLORS.textMuted, marginBottom: 16 },
  actionsBlock: { alignSelf: 'center' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 7 },
  actionLabel: { fontSize: 15, color: COLORS.textPrimary },
  listeningSection: { alignItems: 'center', paddingTop: 60 },
  listeningDots: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  listeningLabel: { fontSize: 16, color: COLORS.listening, fontWeight: '600', marginBottom: 20 },
  transcriptText: { fontSize: 18, color: COLORS.textPrimary, textAlign: 'center', fontStyle: 'italic', lineHeight: 26 },
  processingSection: { alignItems: 'center', paddingTop: 60, gap: 12 },
  processingLabel: { fontSize: 16, color: COLORS.processing, fontWeight: '600' },
  resultSection: { paddingTop: 20, gap: 16, alignItems: 'center' },
  functionBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  functionText: { fontSize: 15, fontWeight: '600' },
  responseText: { fontSize: 16, color: COLORS.textPrimary, textAlign: 'center', lineHeight: 24 },
  bottomBar: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.surfaceLight, paddingBottom: 4 },
  chipsRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  chipText: { fontSize: 14, color: COLORS.textPrimary },
  textRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  textInput: { flex: 1, backgroundColor: COLORS.background, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  talkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  keyboardBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  talkBtn: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  talkBtnText: { fontSize: 17, fontWeight: '700', color: COLORS.textOnPrimary },
  batteryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#322200',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#4D3600',
  },
  batteryWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#FFD60A',
    fontWeight: '500',
  },
});
