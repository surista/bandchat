import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

function SkeletonPulse({ style }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: colors.bgTertiary, borderRadius: 6, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonLine({ width = '100%', height = 14, style }) {
  return <SkeletonPulse style={[{ width, height }, style]} />;
}

export function SkeletonCircle({ size = 40, style }) {
  return <SkeletonPulse style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
}

export function SkeletonCard({ lines = 3, showAvatar = false, style }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSecondary }, style]}>
      <View style={styles.cardContent}>
        {showAvatar && <SkeletonCircle size={40} style={styles.avatar} />}
        <View style={styles.lines}>
          <SkeletonLine width="60%" height={16} />
          {Array.from({ length: lines - 1 }).map((_, i) => (
            <SkeletonLine
              key={i}
              width={i === lines - 2 ? '40%' : '90%'}
              height={12}
              style={styles.line}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function SkeletonList({ count = 5, showAvatar = true, lines = 2 }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} showAvatar={showAvatar} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    marginRight: 12,
  },
  lines: {
    flex: 1,
    gap: 8,
  },
  line: {
    marginTop: 0,
  },
  list: {
    padding: 12,
  },
});
