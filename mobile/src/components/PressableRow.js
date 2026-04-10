import { memo } from 'react';
import { Pressable, Platform, StyleSheet } from 'react-native';

/**
 * A row/button component that shows ripple feedback on Android
 * and opacity feedback on iOS.
 *
 * Drop-in replacement for TouchableOpacity on list items, settings rows,
 * action sheet items, and other "row" interactive elements.
 */
function PressableRow({
  children,
  style,
  onPress,
  onLongPress,
  delayLongPress,
  disabled,
  rippleColor,
  borderless,
  ...rest
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        typeof style === 'function' ? style({ pressed }) : style,
        Platform.OS === 'ios' && pressed && styles.iosPressed,
      ]}
      android_ripple={{
        color: rippleColor || 'rgba(128,128,128,0.2)',
        borderless: borderless || false,
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

export default memo(PressableRow);

const styles = StyleSheet.create({
  iosPressed: {
    opacity: 0.6,
  },
});
