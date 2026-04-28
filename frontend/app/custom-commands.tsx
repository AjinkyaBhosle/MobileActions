import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '../src/constants/theme';
import { loadCustomCommands, saveCustomCommands, type CustomCommand } from '../src/services/storageService';

const ICONS = ['moon', 'sunny', 'car', 'home', 'briefcase', 'game-controller', 'musical-notes', 'fitness', 'cafe', 'airplane'];
const CMD_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF9800', '#7C4DFF', '#00BCD4', '#E91E63'];

const EXAMPLE_ACTIONS = [
  'turn on flashlight', 'turn off flashlight', 'open wifi settings', 'open bluetooth settings',
  'open camera', 'set alarm 7:00 am', 'open maps', 'open whatsapp', 'open youtube',
  'what time is it', 'volume up', 'volume down', 'open settings', 'open dialer',
];

export default function CustomCommandsScreen() {
  const router = useRouter();
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState('');
  const [newActions, setNewActions] = useState<string[]>([]);
  const [selectedIcon, setSelectedIcon] = useState(0);
  const [selectedColor, setSelectedColor] = useState(0);

  useEffect(() => { loadCustomCommands().then(setCommands); }, []);

  const handleSave = async () => {
    if (!newName.trim() || !newTrigger.trim() || newActions.length === 0) {
      Alert.alert('Missing Info', 'Please fill in name, trigger word, and at least one action.');
      return;
    }
    const cmd: CustomCommand = {
      id: Date.now().toString(),
      name: newName.trim(),
      trigger: newTrigger.trim().toLowerCase(),
      actions: newActions,
      icon: ICONS[selectedIcon],
      color: CMD_COLORS[selectedColor],
    };
    const updated = [...commands, cmd];
    setCommands(updated);
    await saveCustomCommands(updated);
    setShowCreate(false);
    setNewName('');
    setNewTrigger('');
    setNewActions([]);
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Command', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = commands.filter(c => c.id !== id);
        setCommands(updated);
        await saveCustomCommands(updated);
      }},
    ]);
  };

  const toggleAction = (action: string) => {
    setNewActions(prev => prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="custom-cmd-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Custom Commands</Text>
        <TouchableOpacity testID="add-custom-cmd-btn" onPress={() => setShowCreate(!showCreate)} style={styles.addBtn}>
          <Ionicons name={showCreate ? 'close' : 'add'} size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Create Form */}
        {showCreate && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.createForm}>
            <Text style={styles.formTitle}>Create Macro</Text>

            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput testID="macro-name-input" style={styles.input} placeholder="e.g. Goodnight" placeholderTextColor={COLORS.textMuted} value={newName} onChangeText={setNewName} />

            <Text style={styles.fieldLabel}>TRIGGER WORD (say this to activate)</Text>
            <TextInput testID="macro-trigger-input" style={styles.input} placeholder="e.g. goodnight" placeholderTextColor={COLORS.textMuted} value={newTrigger} onChangeText={setNewTrigger} />

            <Text style={styles.fieldLabel}>ICON</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconRow}>
              {ICONS.map((icon, i) => (
                <TouchableOpacity key={icon} onPress={() => setSelectedIcon(i)} style={[styles.iconOption, i === selectedIcon && { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight }]}>
                  <Ionicons name={icon as any} size={20} color={i === selectedIcon ? COLORS.textPrimary : COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>COLOR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconRow}>
              {CMD_COLORS.map((color, i) => (
                <TouchableOpacity key={color} onPress={() => setSelectedColor(i)} style={[styles.colorOption, { backgroundColor: color }, i === selectedColor && { borderWidth: 3, borderColor: COLORS.textPrimary }]} />
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>ACTIONS (tap to select, order matters)</Text>
            <View style={styles.actionsGrid}>
              {EXAMPLE_ACTIONS.map(action => (
                <TouchableOpacity key={action} onPress={() => toggleAction(action)} style={[styles.actionChip, newActions.includes(action) && { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight }]}>
                  <Text style={[styles.actionChipText, newActions.includes(action) && { color: COLORS.textPrimary }]}>
                    {newActions.includes(action) ? `${newActions.indexOf(action) + 1}. ` : ''}{action}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity testID="save-macro-btn" style={styles.saveBtn} onPress={handleSave}>
              <Ionicons name="checkmark" size={20} color={COLORS.textPrimary} />
              <Text style={styles.saveBtnText}>Save Command</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Existing Commands */}
        {commands.length === 0 && !showCreate && (
          <View style={styles.emptyState}>
            <Ionicons name="code-slash" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No custom commands yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create a macro that chains multiple actions</Text>
          </View>
        )}

        {commands.map((cmd, i) => (
          <Animated.View key={cmd.id} entering={FadeInDown.delay(i * 50).duration(300)} style={styles.commandCard}>
            <View style={[styles.commandIcon, { backgroundColor: cmd.color + '20' }]}>
              <Ionicons name={cmd.icon as any} size={22} color={cmd.color} />
            </View>
            <View style={styles.commandInfo}>
              <Text style={styles.commandName}>{cmd.name}</Text>
              <Text style={styles.commandTrigger}>Say: "{cmd.trigger}"</Text>
              <Text style={styles.commandActions}>{cmd.actions.length} action{cmd.actions.length > 1 ? 's' : ''}: {cmd.actions.join(' → ')}</Text>
            </View>
            <TouchableOpacity testID={`delete-cmd-${cmd.id}`} onPress={() => handleDelete(cmd.id)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
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
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16 },

  createForm: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, marginTop: 12 },
  formTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: COLORS.textPrimary, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  iconRow: { flexDirection: 'row', marginBottom: 4 },
  iconOption: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderWidth: 1, borderColor: COLORS.border },
  colorOption: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  actionChipText: { fontSize: 12, color: COLORS.textSecondary },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, marginTop: 16 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: COLORS.textSecondary, marginTop: 16 },
  emptySubtext: { fontSize: 14, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' },

  commandCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginTop: 8 },
  commandIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  commandInfo: { flex: 1 },
  commandName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  commandTrigger: { fontSize: 12, color: COLORS.primary, marginTop: 2 },
  commandActions: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  deleteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.errorBg, alignItems: 'center', justifyContent: 'center' },
});
