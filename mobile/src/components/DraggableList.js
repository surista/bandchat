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
  const itemsKeyRef = useRef(null);
  const positionsRef = useRef(items.map((_, i) => i));

  // Update positions when items change externally (length OR identity)
  const currentKey = items.map(item => keyExtractor(item)).join(',');
  if (itemsKeyRef.current !== currentKey) {
    positionsRef.current = items.map((_, i) => i);
    itemsKeyRef.current = currentKey;
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
          onMoveByOne={handleDragEnd}
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
  onMoveByOne,
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
          {/* accessibilityRole='adjustable' + increment/decrement actions let
              VoiceOver / TalkBack users swipe up/down on the handle to move
              the item up or down by one. Without this the entire DraggableList
              is inaccessible \u2014 the drag gesture is impossible to actuate via
              screen reader. */}
          <View
            style={styles.dragHandle}
            accessible
            accessibilityLabel={`Drag handle, position ${index + 1} of ${itemCount}`}
            accessibilityHint="Long press and drag to reorder, or swipe up or down to move by one"
            accessibilityRole="adjustable"
            accessibilityValue={{ min: 1, max: itemCount, now: index + 1 }}
            accessibilityActions={[
              { name: 'increment', label: 'Move down' },
              { name: 'decrement', label: 'Move up' },
            ]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'increment' && index < itemCount - 1) {
                onMoveByOne(index, index + 1);
              } else if (e.nativeEvent.actionName === 'decrement' && index > 0) {
                onMoveByOne(index, index - 1);
              }
            }}
          >
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
    width: 48,
    minHeight: 48,
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
