import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { selectionFeedback } from '../utils/haptics';
import { MIN_TOUCH_TARGET } from '../utils/touchTarget';
import api from '../services/api';

const MAX_SUGGESTIONS = 5;

/**
 * Venue name input that suggests the workspace's saved venues while typing.
 * Free text is still allowed (one-off venues), but picking a suggestion uses
 * the saved name exactly — which matters because setlist PDF export finds the
 * venue logo by name.
 */
export default function VenueField({ workspaceId, value, onChangeText, inputStyle, accessibilityLabel = 'Venue' }) {
  const { colors } = useTheme();
  const [venues, setVenues] = useState([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getVenues(workspaceId)
      .then(list => { if (!cancelled && Array.isArray(list)) setVenues(list); })
      .catch(() => {}); // suggestions are optional; plain text still works
    return () => { cancelled = true; };
  }, [workspaceId]);

  const suggestions = useMemo(() => {
    if (!focused || venues.length === 0) return [];
    const q = value.trim().toLowerCase();
    return venues
      .filter(v => v.name && v.name.toLowerCase() !== q && (!q || v.name.toLowerCase().includes(q)))
      .slice(0, MAX_SUGGESTIONS);
  }, [focused, venues, value]);

  return (
    <View>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={venues.length > 0 ? 'Choose a saved venue or type one' : 'Optional'}
        placeholderTextColor={colors.textSecondary}
        autoCorrect={false}
        maxLength={120}
        returnKeyType="done"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={venues.length > 0 ? 'Suggestions from your saved venues appear below' : undefined}
      />
      {suggestions.length > 0 && (
        <View style={[styles.suggestions, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          {suggestions.map((v, i) => (
            <Pressable
              key={v.id}
              onPress={() => { selectionFeedback(); onChangeText(v.name); }}
              style={({ pressed }) => [
                styles.suggestion,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                pressed && { backgroundColor: colors.bgTertiary },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Use saved venue ${v.name}`}
            >
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.suggestionText, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
                {v.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginTop: -10,
    marginBottom: 16,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    minHeight: MIN_TOUCH_TARGET,
  },
  suggestionText: { fontSize: 15, flex: 1 },
});
