import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

const ITEM_HEIGHT = 56;
const SPRING_CONFIG = { damping: 20, stiffness: 200 };

export default function DraggableList({ items, renderItem, keyExtractor, onReorder, itemHeight = ITEM_HEIGHT }) {
  const { colors } = useTheme();
  const [draggingIndex, setDraggingIndex] = useState(-1);
  const positionsRef = useRef(items.map((_, i) => i));

  // Update positions when items change externally
  if (positionsRef.current.length !== items.length) {
    positionsRef.current = items.map((_, i) => i);
  }

  const handleDragStart = useCallback((index) => {
    setDraggingIndex(index);
  }, []);

  const handleDragEnd = useCallback((fromIndex, toIndex) => {
    setDraggingIndex(-1);
    if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0 && toIndex < items.length) {
      const newItems = [...items];
      const [moved] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, moved);
      onReorder(newItems);
    }
  }, [items, onReorder]);

  return (
    <View style={{ minHeight: items.length * itemHeight }}>
      {items.map((item, index) => (
        <DraggableItem
          key={keyExtractor(item)}
          item={item}
          index={index}
          itemCount={items.length}
          itemHeight={itemHeight}
          renderItem={renderItem}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          isDragging={draggingIndex === index}
          someoneIsDragging={draggingIndex >= 0}
          colors={colors}
        />
      ))}
    </View>
  );
}

function DraggableItem({
  item,
  index,
  itemCount,
  itemHeight,
  renderItem,
  onDragStart,
  onDragEnd,
  isDragging,
  someoneIsDragging,
  colors,
}) {
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(false);
  const startY = useSharedValue(0);
  const currentIndex = useSharedValue(index);

  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
      isActive.value = true;
      currentIndex.value = index;
      runOnJS(onDragStart)(index);
    });

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_, state) => {
      if (isActive.value) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onStart((e) => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (!isActive.value) return;
      translateY.value = startY.value + e.translationY;
      // Calculate which position we're hovering over
      const newIndex = Math.round((index * itemHeight + translateY.value) / itemHeight);
      const clampedIndex = Math.max(0, Math.min(itemCount - 1, newIndex));
      currentIndex.value = clampedIndex;
    })
    .onEnd(() => {
      const finalIndex = currentIndex.value;
      translateY.value = withSpring(0, SPRING_CONFIG);
      isActive.value = false;
      runOnJS(onDragEnd)(index, finalIndex);
    })
    .onFinalize(() => {
      if (isActive.value) {
        translateY.value = withSpring(0, SPRING_CONFIG);
        isActive.value = false;
        runOnJS(onDragEnd)(index, index);
      }
    });

  const composedGesture = Gesture.Simultaneous(longPressGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      zIndex: isActive.value ? 999 : 0,
      shadowOpacity: isActive.value ? 0.3 : 0,
      elevation: isActive.value ? 8 : 0,
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.itemContainer, animatedStyle]}>
        <View style={[styles.itemRow, { minHeight: itemHeight }]}>
          <View style={styles.dragHandle} accessibilityLabel="Drag handle" accessibilityHint="Long press and drag to reorder">
            <Text style={[styles.dragIcon, { color: colors.textSecondary }]}>{'\u2261'}</Text>
          </View>
          <View style={styles.itemContent}>
            {renderItem({ item, index, isDragging })}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  dragIcon: {
    fontSize: 24,
    fontWeight: '700',
  },
  itemContent: {
    flex: 1,
  },
});
