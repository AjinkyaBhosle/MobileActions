import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { COLORS } from '../src/constants/theme';
import { loadSettings, saveSettings, clearHistory, type AppSettings } from '../src/services/storageService';
import { startBackgroundListening, stopBackgroundListening } from '../src/services/backgroundService';

// ── Expandable Section ──
function AccordionSection({ title, icon, children, testID, defaultOpen = false }: {
  title: string; icon: string; children: React.ReactNode; testID: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.accordion}>
      <TouchableOpacity testID={testID} style={styles.accordionHeader} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <View style={styles.accordionLeft}>
          <Ionicons name={icon as any} size={18} color={COLORS.primary} />
          <Text style={styles.accordionTitle}>{title}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      {open && <View style={styles.accordionBody}>{children}</View>}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => { loadSettings().then(setSettings); }, []);

  const updateSetting = async (key: keyof AppSettings, value: any) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings(updated);

    // If background listening was toggled, start/stop the service
    if (key === 'backgroundListening') {
      if (value) {
        await startBackgroundListening();
      } else {
        await stopBackgroundListening();
      }
    }
  };

  const handleClearHistory = () => {
    Alert.alert('Clear History', 'Delete all command history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { await clearHistory(); Alert.alert('Done', 'History cleared'); } },
    ]);
  };

  if (!settings) return <View style={styles.container}><Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 100 }}>Loading...</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="settings-back-btn" onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Voice Settings */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <AccordionSection title="Voice" icon="mic" testID="section-voice" defaultOpen={false}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Voice Feedback</Text>
                <Text style={styles.toggleDesc}>Spoken confirmation for actions</Text>
              </View>
              <Switch testID="tts-toggle" value={settings.ttsEnabled} onValueChange={v => updateSetting('ttsEnabled', v)} trackColor={{ false: '#E0E0E0', true: COLORS.primaryBg }} thumbColor={settings.ttsEnabled ? COLORS.primary : '#BDBDBD'} />
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Shake to Activate</Text>
                <Text style={styles.toggleDesc}>Shake device to start listening</Text>
              </View>
              <Switch testID="shake-toggle" value={settings.shakeToActivate} onValueChange={v => updateSetting('shakeToActivate', v)} trackColor={{ false: '#E0E0E0', true: COLORS.primaryBg }} thumbColor={settings.shakeToActivate ? COLORS.primary : '#BDBDBD'} />
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Background Listening</Text>
                <Text style={styles.toggleDesc}>Listen when app is closed or locked</Text>
              </View>
              <Switch testID="bg-listen-toggle" value={settings.backgroundListening} onValueChange={v => updateSetting('backgroundListening', v)} trackColor={{ false: '#E0E0E0', true: COLORS.primaryBg }} thumbColor={settings.backgroundListening ? COLORS.primary : '#BDBDBD'} />
            </View>
            {settings.backgroundListening && (
              <View style={styles.noteBox}>
                <Ionicons name="information-circle" size={14} color={COLORS.primary} />
                <Text style={styles.noteText}>Requires production build. May increase battery usage.</Text>
              </View>
            )}
          </AccordionSection>
        </Animated.View>

        {/* How to Use */}
        <Animated.View entering={FadeInDown.delay(60).duration(300)}>
          <AccordionSection title="How to Use" icon="book" testID="section-guide">
            <View style={styles.guideBlock}>
              <Text style={styles.guideHeading}>Getting Started</Text>
              <Text style={styles.guideText}>• Hold the green button and speak your command</Text>
              <Text style={styles.guideText}>• Or tap the keyboard icon to type a command</Text>
              <Text style={styles.guideText}>• Quick action chips provide one-tap shortcuts</Text>
            </View>
            <View style={styles.guideBlock}>
              <Text style={styles.guideHeading}>Voice Commands</Text>
              <Text style={styles.guideText}>• "Turn on flashlight" / "Torch on" / "Light on"</Text>
              <Text style={styles.guideText}>• "Open WiFi settings" / "WiFi"</Text>
              <Text style={styles.guideText}>• "Call [name or number]"</Text>
              <Text style={styles.guideText}>• "Send SMS to [name] saying [message]"</Text>
              <Text style={styles.guideText}>• "Set alarm 7:00 AM"</Text>
              <Text style={styles.guideText}>• "Open WhatsApp" / "Open YouTube"</Text>
              <Text style={styles.guideText}>• "What time is it?" / "What's the date?"</Text>
              <Text style={styles.guideText}>• "Navigate to [place]" / "Show on map"</Text>
              <Text style={styles.guideText}>• "Volume up" / "Volume down"</Text>
              <Text style={styles.guideText}>• "Open camera" / "Take a photo"</Text>
              <Text style={styles.guideText}>• "Open Bluetooth settings"</Text>
              <Text style={styles.guideText}>• "Open contacts" / "Open calendar"</Text>
            </View>
            <View style={styles.guideBlock}>
              <Text style={styles.guideHeading}>Wake Words</Text>
              <Text style={styles.guideText}>Say one of these before your command:</Text>
              <Text style={styles.guideText}>• "Hey Mobile" / "Hi Mobile"</Text>
              <Text style={styles.guideText}>• "Hello Mobile" / "Mobile"</Text>
              <Text style={styles.guideText}>• "OK Mobile" / "Yo Mobile"</Text>
              <Text style={styles.guideText}>Example: "Hey Mobile, turn on flashlight"</Text>
            </View>
            <View style={styles.guideBlock}>
              <Text style={styles.guideHeading}>Custom Commands</Text>
              <Text style={styles.guideText}>• Create macros that chain multiple actions</Text>
              <Text style={styles.guideText}>• Example: "Goodnight" → flashlight off + set alarm</Text>
              <Text style={styles.guideText}>• Go to Custom Commands to create them</Text>
            </View>
            <View style={styles.guideBlock}>
              <Text style={styles.guideHeading}>Offline Mode</Text>
              <Text style={styles.guideText}>• All commands work without internet</Text>
              <Text style={styles.guideText}>• Works in airplane mode</Text>
              <Text style={styles.guideText}>• Uses your device's built-in speech recognition</Text>
              <Text style={styles.guideText}>• No data is ever sent anywhere</Text>
            </View>
            <View style={styles.guideBlock}>
              <Text style={styles.guideHeading}>Supported Devices</Text>
              <Text style={styles.guideText}>• Works on ALL Android devices worldwide</Text>
              <Text style={styles.guideText}>• Samsung, Xiaomi, OnePlus, Oppo, Vivo, Sony, Pixel</Text>
              <Text style={styles.guideText}>• India, China, Japan, Korea, Europe, Americas</Text>
              <Text style={styles.guideText}>• Requires Android 7.0+ with Google Play Services</Text>
            </View>
          </AccordionSection>
        </Animated.View>

        {/* Custom Commands */}
        <Animated.View entering={FadeInDown.delay(120).duration(300)}>
          <AccordionSection title="Custom Commands" icon="code-slash" testID="section-custom-commands">
            <TouchableOpacity testID="nav-custom-commands" style={styles.linkRow} onPress={() => router.push('/custom-commands')}>
              <Text style={styles.linkText}>Manage Custom Commands</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </AccordionSection>
        </Animated.View>

        {/* About */}
        <Animated.View entering={FadeInDown.delay(180).duration(300)}>
          <AccordionSection title="About" icon="information-circle" testID="section-about">
            <Text style={styles.aboutText}>Offline voice assistant for Android. Control your phone with voice commands — no internet required.</Text>
            <View style={styles.aboutFeatures}>
              <View style={styles.aboutRow}><Ionicons name="airplane" size={14} color={COLORS.success} /><Text style={styles.aboutFeatureText}>Works in airplane mode</Text></View>
              <View style={styles.aboutRow}><Ionicons name="shield-checkmark" size={14} color={COLORS.success} /><Text style={styles.aboutFeatureText}>100% private — no data sent anywhere</Text></View>
              <View style={styles.aboutRow}><Ionicons name="flash" size={14} color={COLORS.success} /><Text style={styles.aboutFeatureText}>Instant response — no network latency</Text></View>
              <View style={styles.aboutRow}><Ionicons name="globe" size={14} color={COLORS.success} /><Text style={styles.aboutFeatureText}>Works on all Android devices worldwide</Text></View>
            </View>
          </AccordionSection>
        </Animated.View>

        {/* Clear History - removed per user request */}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: COLORS.textPrimary },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Accordion
  accordion: { marginTop: 8, backgroundColor: COLORS.surface, borderRadius: 12, overflow: 'hidden' },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  accordionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accordionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  accordionBody: { paddingHorizontal: 16, paddingBottom: 16 },

  // Toggles
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '500', color: COLORS.textPrimary },
  toggleDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  noteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: COLORS.primaryBg, borderRadius: 8, padding: 10, marginTop: 8 },
  noteText: { fontSize: 12, color: COLORS.primaryDark, flex: 1 },

  // Wake words
  subLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginTop: 14, marginBottom: 6 },
  wakeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wakeChip: { backgroundColor: COLORS.primaryBg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  wakeText: { fontSize: 12, color: COLORS.primaryDark, fontStyle: 'italic' },

  // Guide
  guideBlock: { marginTop: 12 },
  guideHeading: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 4 },
  guideText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },

  // Links
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  linkText: { fontSize: 15, color: COLORS.primary, fontWeight: '500' },

  // About
  aboutText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  aboutFeatures: { marginTop: 12, gap: 6 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aboutFeatureText: { fontSize: 13, color: COLORS.textSecondary },

  // Clear
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: COLORS.surface, borderRadius: 12 },
  clearText: { fontSize: 15, color: COLORS.error, fontWeight: '500' },
});
