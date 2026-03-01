import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
function Badge({ label, color = '#3b82f6', bgColor }) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColor || (color + '20') }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}
export default memo(Badge);
const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
});
