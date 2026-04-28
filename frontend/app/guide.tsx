import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '../src/constants/theme';

const SECTIONS = [
  {
    title: 'Getting Started',
    icon: 'rocket',
    items: [
      'Tap the purple orb to start listening',
      'Speak your command clearly in English',
      'Or type a command in the text field below the orb',
      'Quick action chips at the bottom provide one-tap shortcuts',
    ],
  },
  {
    title: 'Voice Commands',
    icon: 'mic',
    items: [
      '"Turn on flashlight" / "Torch on"',
      '"Open WiFi settings" / "WiFi"',
      '"Call [name/number]"',
      '"Send SMS to [name] saying [message]"',
      '"Set alarm 7:00 AM"',
      '"Open WhatsApp" / "Open YouTube"',
      '"What time is it?" / "What\'s the date?"',
      '"Navigate to [place]" / "Show [place] on map"',
      '"Volume up" / "Volume down"',
      '"Open camera" / "Take a photo"',
      '"Open Bluetooth settings"',
      '"Open contacts" / "Open calendar"',
    ],
  },
  {
    title: 'Wake Words',
    icon: 'ear',
    items: [
      'Say "Hey Mobile" before your command',
      'Alternatives: "Hi Mobile", "Hello Mobile", "Mobile"',
      'Example: "Hey Mobile, turn on flashlight"',
      'Wake words are automatically stripped from commands',
    ],
  },
  {
    title: 'Custom Commands',
    icon: 'code-slash',
    items: [
      'Create macros that chain multiple actions',
      'Example: "Goodnight" → turn off flashlight + set alarm',
      'Go to Settings → Custom Commands to create them',
      'Trigger by voice or tap from the quick actions',
    ],
  },
  {
    title: 'Offline Mode',
    icon: 'airplane',
    items: [
      'All voice commands work without internet',
      'Uses your device\'s built-in speech recognition',
      'Works in airplane mode, no data charges',
      'English (US) offline model is pre-installed on most Android 11+ devices',
      'For older devices: Settings → Google → Voice → Offline speech recognition',
    ],
  },
  {
    title: 'Tips & Tricks',
    icon: 'bulb',
    items: [
      'Speak naturally — "torch", "light", "flashlight" all work',
      'For calls, you can say a name or phone number',
      'Shake your phone to activate voice (enable in Settings)',
      'Check command history for past actions',
      'Failed commands show what went wrong',
    ],
  },
  {
    title: 'Supported Devices',
    icon: 'globe',
    items: [
      'Works on ALL Android devices worldwide',
      'Samsung, Xiaomi, OnePlus, Oppo, Vivo, Sony, Google Pixel, etc.',
      'India, China, Japan, Korea, Europe, Americas — everywhere',
      'Requires Android 7.0+ with Google Play Services',
      'For Huawei (post-2019): Install Google Play Services separately',
    ],
  },
];

export default function GuideScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="guide-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>How to Use</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {SECTIONS.map((section, i) => (
          <Animated.View key={section.title} entering={FadeInDown.delay(i * 60).duration(400)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={section.icon as any} size={20} color={COLORS.accentCyan} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            {section.items.map((item, j) => (
              <View key={j} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </Animated.View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: COLORS.textPrimary },
  scrollContent: { paddingHorizontal: 16 },
  section: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, marginTop: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 7 },
  bulletText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, flex: 1 },
});
