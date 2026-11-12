import { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../context/ThemeContext';
import { selectionFeedback } from '../utils/haptics';
import { MIN_TOUCH_TARGET } from '../utils/touchTarget';

/**
 * A date field that can be left empty — for optional date-only values such as
 * Setlist.performedAt. `value` is a local Date or null.
 *
 * Empty: an "Add date" button that fills in today.
 * Set, iOS: the native compact picker (tap to open the system calendar popover).
 * Set, Android: the formatted date, tapping opens the system date dialog.
 * Set, both: a clear button to go back to "no date".
 */
export default function OptionalDateField({ value, onChange, label = 'Date' }) {
  const { colors, mode } = useTheme();
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const clear = () => {
    selectionFeedback();
    onChange(null);
  };

  if (!value) {
    return (
      <Pressable
        onPress={() => { selectionFeedback(); onChange(new Date()); }}
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Add ${label.toLowerCase()}`}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text style={[styles.addText, { color: colors.primary }]} maxFontSizeMultiplier={1.5}>Add date</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="compact"
          onChange={(_, date) => { if (date) onChange(date); }}
          themeVariant={mode === 'dark' ? 'dark' : 'light'}
          accessibilityLabel={label}
          style={styles.iosPicker}
        />
      ) : (
        <>
          <Pressable
            onPress={() => setShowAndroidPicker(true)}
            style={({ pressed }) => [styles.androidValue, { backgroundColor: colors.bgTertiary }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${format(value, 'EEEE, dd-MMM-yyyy')}. Tap to change`}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 15 }} maxFontSizeMultiplier={1.5}>{format(value, 'dd-MMM-yyyy')}</Text>
          </Pressable>
          {showAndroidPicker && (
            <DateTimePicker
              value={value}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowAndroidPicker(false);
                if (event.type === 'set' && date) onChange(date);
              }}
            />
          )}
        </>
      )}
      <Pressable
        onPress={clear}
        hitSlop={8}
        style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label.toLowerCase()}`}
      >
        <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET },
  iosPicker: { marginLeft: -8 },
  androidValue: { borderRadius: 8, paddingHorizontal: 14, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH_TARGET, alignSelf: 'flex-start' },
  addText: { fontSize: 15, fontWeight: '600' },
  clearButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
