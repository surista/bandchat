import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Svg, {
  Rect, Circle, Ellipse, Line, Path, Text as SvgText,
} from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { lightImpact, mediumImpact, successNotification } from '../../utils/haptics';
import api from '../../services/api';
import ActionSheet from '../../components/ActionSheet';

// ─── Instrument image assets ───
const INSTRUMENT_IMAGES = {
  'electric-guitar': require('../../../assets/instruments/guitar_01.png'),
  'acoustic-guitar': require('../../../assets/instruments/ac_guitar_01.png'),
  'bass-guitar': require('../../../assets/instruments/bass_01.png'),
};

// ─── Label map ───
const LABEL_MAP = {
  vocals: 'Vocals', 'mic-stand': 'Mic Stand',
  'electric-guitar': 'Electric Gtr', 'acoustic-guitar': 'Acoustic Gtr',
  'guitar-combo': 'Gtr Combo', 'guitar-212': 'Gtr 2x12',
  'guitar-halfstack': 'Gtr Half', 'guitar-fullstack': 'Gtr Full',
  'guitar-stand': 'Guitar Stand',
  'bass-guitar': 'Bass Guitar',
  'bass-combo': 'Bass Combo', 'bass-115': 'Bass 1x15', 'bass-410': 'Bass 4x10',
  'bass-stack': 'Bass Stack',
  keyboard: 'Keys', 'keyboard-stand': 'Keys Stand', piano: 'Piano',
  drums: 'Drums',
  'monitor-wedge': 'Monitor', 'di-box': 'DI Box', pedalboard: 'Pedalboard',
  text: 'Text Label',
};

// ─── Palette sections ───
const PALETTE_SECTIONS = [
  { label: 'Vocals', items: ['vocals', 'mic-stand'] },
  { label: 'Guitar', items: ['electric-guitar', 'acoustic-guitar', 'guitar-combo', 'guitar-212', 'guitar-halfstack', 'guitar-fullstack', 'guitar-stand'] },
  { label: 'Bass', items: ['bass-guitar', 'bass-combo', 'bass-115', 'bass-410', 'bass-stack'] },
  { label: 'Keys / Piano', items: ['keyboard', 'keyboard-stand', 'piano'] },
  { label: 'Drums', items: ['drums'] },
  { label: 'Monitors / PA', items: ['monitor-wedge', 'di-box', 'pedalboard'] },
  { label: 'Other', items: ['text'] },
];

const ITEM_SIZE = 48;
const STAGE_PADDING = 8;

// ─── SVG instrument components ───
function InstrumentSvg({ type, size = 48 }) {
  const s = size;
  const scale = s / 64;

  switch (type) {
    case 'vocals':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="28" y="8" width="8" height="20" rx="4" fill="#e74c3c" />
          <Path d="M22 18v6a10 10 0 0 0 20 0v-6" fill="none" stroke="#e74c3c" strokeWidth="2.5" />
          <Line x1="32" y1="34" x2="32" y2="46" stroke="#e74c3c" strokeWidth="2.5" />
          <Line x1="24" y1="46" x2="40" y2="46" stroke="#e74c3c" strokeWidth="2.5" />
          <Line x1="32" y1="46" x2="32" y2="56" stroke="#888" strokeWidth="2" />
          <Circle cx="32" cy="58" r="3" fill="#888" />
        </Svg>
      );
    case 'guitar-combo':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="14" y="14" width="36" height="40" rx="4" fill="#3e2c1a" />
          <Rect x="17" y="17" width="30" height="18" rx="2" fill="#2a1e12" />
          <Circle cx="32" cy="26" r="7" fill="none" stroke="#6b4f30" strokeWidth="1.5" />
          <Circle cx="32" cy="26" r="3" fill="none" stroke="#6b4f30" strokeWidth="1" />
          <Circle cx="22" cy="44" r="1.5" fill="#e67e22" />
          <Circle cx="28" cy="44" r="1.5" fill="#e67e22" />
          <Circle cx="34" cy="44" r="1.5" fill="#e67e22" />
          <Rect x="38" y="42" width="6" height="4" rx="1" fill="#e67e22" />
          <SvgText x="32" y="10" textAnchor="middle" fontSize="7" fill="#e67e22" fontWeight="bold">COMBO</SvgText>
        </Svg>
      );
    case 'guitar-212':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="10" y="14" width="44" height="40" rx="4" fill="#2c3e50" />
          <Rect x="13" y="17" width="38" height="22" rx="2" fill="#1a252f" />
          <Circle cx="24" cy="28" r="7" fill="none" stroke="#555" strokeWidth="1.5" />
          <Circle cx="40" cy="28" r="7" fill="none" stroke="#555" strokeWidth="1.5" />
          <Circle cx="18" cy="48" r="1.5" fill="#e67e22" />
          <Circle cx="24" cy="48" r="1.5" fill="#e67e22" />
          <Circle cx="30" cy="48" r="1.5" fill="#e67e22" />
          <Circle cx="36" cy="48" r="1.5" fill="#e67e22" />
          <Circle cx="42" cy="48" r="1.5" fill="#e67e22" />
          <SvgText x="32" y="10" textAnchor="middle" fontSize="7" fill="#e67e22" fontWeight="bold">GTR 2x12</SvgText>
        </Svg>
      );
    case 'guitar-halfstack':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="12" y="6" width="40" height="14" rx="3" fill="#2c3e50" />
          <Circle cx="20" cy="13" r="1.5" fill="#e67e22" />
          <Circle cx="26" cy="13" r="1.5" fill="#e67e22" />
          <Circle cx="32" cy="13" r="1.5" fill="#e67e22" />
          <Rect x="38" y="10" width="10" height="5" rx="1" fill="#1a252f" />
          <Rect x="10" y="22" width="44" height="36" rx="4" fill="#2c3e50" />
          <Rect x="13" y="25" width="38" height="28" rx="2" fill="#1a252f" />
          <Circle cx="24" cy="33" r="6" fill="none" stroke="#555" strokeWidth="1.5" />
          <Circle cx="40" cy="33" r="6" fill="none" stroke="#555" strokeWidth="1.5" />
          <Circle cx="24" cy="47" r="6" fill="none" stroke="#555" strokeWidth="1.5" />
          <Circle cx="40" cy="47" r="6" fill="none" stroke="#555" strokeWidth="1.5" />
        </Svg>
      );
    case 'guitar-fullstack':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="14" y="2" width="36" height="10" rx="2" fill="#2c3e50" />
          <Circle cx="22" cy="7" r="1.2" fill="#e67e22" />
          <Circle cx="27" cy="7" r="1.2" fill="#e67e22" />
          <Circle cx="32" cy="7" r="1.2" fill="#e67e22" />
          <Rect x="36" y="5" width="8" height="4" rx="1" fill="#1a252f" />
          <Rect x="12" y="13" width="40" height="24" rx="3" fill="#2c3e50" />
          <Rect x="14" y="15" width="36" height="20" rx="2" fill="#1a252f" />
          <Circle cx="24" cy="21" r="4.5" fill="none" stroke="#555" strokeWidth="1.2" />
          <Circle cx="40" cy="21" r="4.5" fill="none" stroke="#555" strokeWidth="1.2" />
          <Circle cx="24" cy="31" r="4.5" fill="none" stroke="#555" strokeWidth="1.2" />
          <Circle cx="40" cy="31" r="4.5" fill="none" stroke="#555" strokeWidth="1.2" />
          <Rect x="12" y="38" width="40" height="24" rx="3" fill="#2c3e50" />
          <Rect x="14" y="40" width="36" height="20" rx="2" fill="#1a252f" />
          <Circle cx="24" cy="46" r="4.5" fill="none" stroke="#555" strokeWidth="1.2" />
          <Circle cx="40" cy="46" r="4.5" fill="none" stroke="#555" strokeWidth="1.2" />
          <Circle cx="24" cy="56" r="4.5" fill="none" stroke="#555" strokeWidth="1.2" />
          <Circle cx="40" cy="56" r="4.5" fill="none" stroke="#555" strokeWidth="1.2" />
        </Svg>
      );
    case 'bass-combo':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="12" y="14" width="40" height="40" rx="4" fill="#1a2a3a" />
          <Rect x="15" y="17" width="34" height="20" rx="2" fill="#0f1a26" />
          <Circle cx="32" cy="27" r="8" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
          <Circle cx="32" cy="27" r="4" fill="none" stroke="#2a4a6a" strokeWidth="1" />
          <Circle cx="20" cy="46" r="1.5" fill="#3498db" />
          <Circle cx="26" cy="46" r="1.5" fill="#3498db" />
          <Circle cx="32" cy="46" r="1.5" fill="#3498db" />
          <Rect x="36" y="44" width="8" height="4" rx="1" fill="#3498db" />
          <SvgText x="32" y="10" textAnchor="middle" fontSize="7" fill="#3498db" fontWeight="bold">COMBO</SvgText>
        </Svg>
      );
    case 'bass-115':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="10" y="12" width="44" height="44" rx="4" fill="#1a2a3a" />
          <Rect x="13" y="15" width="38" height="36" rx="2" fill="#0f1a26" />
          <Circle cx="32" cy="33" r="14" fill="none" stroke="#2a4a6a" strokeWidth="2" />
          <Circle cx="32" cy="33" r="7" fill="none" stroke="#2a4a6a" strokeWidth="1" />
          <Circle cx="32" cy="33" r="2" fill="#2a4a6a" />
          <SvgText x="32" y="9" textAnchor="middle" fontSize="7" fill="#3498db" fontWeight="bold">1x15</SvgText>
        </Svg>
      );
    case 'bass-410':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="10" y="10" width="44" height="46" rx="4" fill="#1a2a3a" />
          <Rect x="13" y="13" width="38" height="38" rx="2" fill="#0f1a26" />
          <Circle cx="24" cy="24" r="6.5" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
          <Circle cx="40" cy="24" r="6.5" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
          <Circle cx="24" cy="40" r="6.5" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
          <Circle cx="40" cy="40" r="6.5" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
          <SvgText x="32" y="7" textAnchor="middle" fontSize="7" fill="#3498db" fontWeight="bold">4x10</SvgText>
        </Svg>
      );
    case 'bass-stack':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="14" y="4" width="36" height="12" rx="2" fill="#1a2a3a" />
          <Circle cx="22" cy="10" r="1.5" fill="#3498db" />
          <Circle cx="28" cy="10" r="1.5" fill="#3498db" />
          <Rect x="34" y="7" width="10" height="5" rx="1" fill="#0f1a26" />
          <Rect x="12" y="18" width="40" height="42" rx="3" fill="#1a2a3a" />
          <Rect x="14" y="20" width="36" height="38" rx="2" fill="#0f1a26" />
          <Circle cx="24" cy="30" r="6" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
          <Circle cx="40" cy="30" r="6" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
          <Circle cx="24" cy="46" r="6" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
          <Circle cx="40" cy="46" r="6" fill="none" stroke="#2a4a6a" strokeWidth="1.5" />
        </Svg>
      );
    case 'keyboard':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="8" y="28" width="48" height="20" rx="3" fill="#2c3e50" />
          <Rect x="12" y="32" width="4" height="12" rx="1" fill="#ecf0f1" />
          <Rect x="18" y="32" width="4" height="12" rx="1" fill="#ecf0f1" />
          <Rect x="24" y="32" width="4" height="12" rx="1" fill="#ecf0f1" />
          <Rect x="30" y="32" width="4" height="12" rx="1" fill="#ecf0f1" />
          <Rect x="36" y="32" width="4" height="12" rx="1" fill="#ecf0f1" />
          <Rect x="42" y="32" width="4" height="12" rx="1" fill="#ecf0f1" />
          <Rect x="48" y="32" width="4" height="12" rx="1" fill="#ecf0f1" />
          <Rect x="15" y="32" width="3" height="7" rx="0.5" fill="#2c3e50" />
          <Rect x="21" y="32" width="3" height="7" rx="0.5" fill="#2c3e50" />
          <Rect x="33" y="32" width="3" height="7" rx="0.5" fill="#2c3e50" />
          <Rect x="39" y="32" width="3" height="7" rx="0.5" fill="#2c3e50" />
          <Rect x="45" y="32" width="3" height="7" rx="0.5" fill="#2c3e50" />
          <SvgText x="32" y="24" textAnchor="middle" fontSize="8" fill="#9b59b6" fontWeight="bold">KEYS</SvgText>
        </Svg>
      );
    case 'drums':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Ellipse cx="32" cy="40" rx="12" ry="8" fill="none" stroke="#e74c3c" strokeWidth="2" />
          <Ellipse cx="18" cy="28" rx="7" ry="5" fill="none" stroke="#f39c12" strokeWidth="1.5" />
          <Ellipse cx="46" cy="28" rx="7" ry="5" fill="none" stroke="#f39c12" strokeWidth="1.5" />
          <Ellipse cx="32" cy="18" rx="8" ry="5" fill="none" stroke="#e67e22" strokeWidth="1.5" />
          <Circle cx="12" cy="16" r="5" fill="none" stroke="#c0392b" strokeWidth="1.5" />
          <Circle cx="52" cy="16" r="5" fill="none" stroke="#c0392b" strokeWidth="1.5" />
          <Ellipse cx="22" cy="52" rx="6" ry="3" fill="none" stroke="#95a5a6" strokeWidth="1.5" />
          <Ellipse cx="42" cy="52" rx="6" ry="3" fill="none" stroke="#95a5a6" strokeWidth="1.5" />
        </Svg>
      );
    case 'piano':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Path d="M16 52 Q8 40 10 24 Q12 12 32 8 Q52 12 54 24 Q56 40 48 52 Z" fill="#1a1a1a" stroke="#333" strokeWidth="1.5" />
          <Path d="M20 48 Q14 38 16 26 Q18 18 32 14 Q46 18 48 26 Q50 38 44 48 Z" fill="#2c2c2c" />
          <Rect x="22" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1" />
          <Rect x="26" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1" />
          <Rect x="30" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1" />
          <Rect x="34" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1" />
          <Rect x="38" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1" />
          <Line x1="16" y1="52" x2="12" y2="58" stroke="#333" strokeWidth="2" />
          <Line x1="48" y1="52" x2="52" y2="58" stroke="#333" strokeWidth="2" />
          <Line x1="32" y1="52" x2="32" y2="58" stroke="#333" strokeWidth="2" />
        </Svg>
      );
    case 'mic-stand':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Circle cx="22" cy="10" r="5" fill="none" stroke="#e74c3c" strokeWidth="2" />
          <Line x1="27" y1="10" x2="42" y2="10" stroke="#888" strokeWidth="2" />
          <Line x1="32" y1="10" x2="32" y2="54" stroke="#888" strokeWidth="2" />
          <Line x1="22" y1="54" x2="42" y2="54" stroke="#888" strokeWidth="2.5" />
          <Circle cx="32" cy="54" r="2" fill="#888" />
        </Svg>
      );
    case 'electric-guitar':
    case 'acoustic-guitar':
      return (
        <Image source={INSTRUMENT_IMAGES[type]} style={{ width: s, height: s }} resizeMode="contain" />
      );
    case 'guitar-stand':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Line x1="32" y1="8" x2="32" y2="48" stroke="#888" strokeWidth="2.5" />
          <Line x1="32" y1="48" x2="18" y2="58" stroke="#888" strokeWidth="2" />
          <Line x1="32" y1="48" x2="46" y2="58" stroke="#888" strokeWidth="2" />
          <Line x1="26" y1="18" x2="38" y2="18" stroke="#888" strokeWidth="2" />
          <Path d="M28 12 Q32 8 36 12" fill="none" stroke="#888" strokeWidth="2" />
          <Circle cx="18" cy="58" r="2" fill="#666" />
          <Circle cx="46" cy="58" r="2" fill="#666" />
        </Svg>
      );
    case 'bass-guitar':
      return (
        <Image source={INSTRUMENT_IMAGES[type]} style={{ width: s, height: s }} resizeMode="contain" />
      );
    case 'keyboard-stand':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Line x1="16" y1="22" x2="48" y2="22" stroke="#9b59b6" strokeWidth="3" strokeLinecap="round" />
          <Line x1="18" y1="22" x2="32" y2="54" stroke="#888" strokeWidth="2" />
          <Line x1="46" y1="22" x2="32" y2="54" stroke="#888" strokeWidth="2" />
          <Line x1="22" y1="54" x2="42" y2="54" stroke="#888" strokeWidth="2" />
          <Line x1="20" y1="38" x2="44" y2="38" stroke="#888" strokeWidth="1.5" />
        </Svg>
      );
    case 'monitor-wedge':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Path d="M10 44 L14 24 L50 24 L54 44 Z" fill="#555" stroke="#777" strokeWidth="1.5" />
          <Rect x="18" y="28" width="28" height="12" rx="2" fill="#333" />
          <Ellipse cx="32" cy="34" rx="4" ry="3" fill="none" stroke="#888" strokeWidth="1" />
          <SvgText x="32" y="54" textAnchor="middle" fontSize="7" fill="#2ecc71" fontWeight="bold">MON</SvgText>
        </Svg>
      );
    case 'di-box':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="16" y="20" width="32" height="24" rx="3" fill="#444" />
          <Rect x="18" y="22" width="28" height="20" rx="2" fill="#333" />
          <Circle cx="26" cy="32" r="4" fill="none" stroke="#e67e22" strokeWidth="1.5" />
          <Circle cx="38" cy="32" r="4" fill="none" stroke="#e67e22" strokeWidth="1.5" />
          <SvgText x="32" y="54" textAnchor="middle" fontSize="7" fill="#e67e22" fontWeight="bold">DI</SvgText>
        </Svg>
      );
    case 'pedalboard':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="8" y="22" width="48" height="24" rx="4" fill="#333" stroke="#555" strokeWidth="1" />
          <Rect x="12" y="26" width="10" height="16" rx="2" fill="#2c3e50" />
          <Rect x="27" y="26" width="10" height="16" rx="2" fill="#2c3e50" />
          <Rect x="42" y="26" width="10" height="16" rx="2" fill="#2c3e50" />
          <Circle cx="17" cy="30" r="2" fill="#e74c3c" />
          <Circle cx="32" cy="30" r="2" fill="#2ecc71" />
          <Circle cx="47" cy="30" r="2" fill="#3498db" />
          <Rect x="14" y="36" width="6" height="4" rx="1" fill="#aaa" />
          <Rect x="29" y="36" width="6" height="4" rx="1" fill="#aaa" />
          <Rect x="44" y="36" width="6" height="4" rx="1" fill="#aaa" />
        </Svg>
      );
    case 'text':
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="8" y="16" width="48" height="32" rx="4" fill="none" stroke="#9b59b6" strokeWidth="2" strokeDasharray="4 2" />
          <SvgText x="32" y="37" textAnchor="middle" fontSize="14" fill="#9b59b6" fontWeight="bold">Aa</SvgText>
        </Svg>
      );
    default:
      return (
        <Svg width={s} height={s} viewBox="0 0 64 64">
          <Rect x="8" y="8" width="48" height="48" rx="8" fill="#555" />
          <SvgText x="32" y="38" textAnchor="middle" fontSize="10" fill="#fff">?</SvgText>
        </Svg>
      );
  }
}

// ─── Draggable stage item ───
function DraggableItem({ item, stageLayout, onMove, onRemove, onLongPress, onUpdateText, colors }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      startX.value = item.x;
      startY.value = item.y;
      translateX.value = 0;
      translateY.value = 0;
      runOnJS(lightImpact)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      isDragging.value = false;
      const newX = Math.max(0, Math.min(stageLayout.width - ITEM_SIZE, startX.value + e.translationX));
      const newY = Math.max(0, Math.min(stageLayout.height - ITEM_SIZE - 16, startY.value + e.translationY));
      translateX.value = 0;
      translateY.value = 0;
      runOnJS(onMove)(item.id, newX, newY);
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(400)
    .onStart(() => {
      runOnJS(mediumImpact)();
      runOnJS(onLongPress)(item);
    });

  const composed = Gesture.Race(panGesture, longPressGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: isDragging.value ? 0.7 : 1,
    zIndex: isDragging.value ? 100 : 1,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.stageItem,
          { left: item.x, top: item.y },
          item.type === 'text' && { width: 'auto' },
          animatedStyle,
        ]}
      >
        {item.type === 'text' ? (
          <TextInput
            style={styles.stageTextInput}
            value={item.text || ''}
            onChangeText={(val) => onUpdateText(item.id, val)}
            placeholder="Type here..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            multiline={false}
          />
        ) : (
          <>
            <InstrumentSvg type={item.type} size={44} />
            <Text style={styles.stageItemLabel} numberOfLines={1}>
              {item.label || LABEL_MAP[item.type]}
            </Text>
          </>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Main screen ───
export default function StagePlotEditorScreen({ navigation, route }) {
  const { plotId, workspaceId } = route.params;
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [plot, setPlot] = useState(null);
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [bandName, setBandName] = useState('');
  const [eventName, setEventName] = useState('');
  const [showPalette, setShowPalette] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showItemActions, setShowItemActions] = useState(false);
  const [stageLayout, setStageLayout] = useState({ width: 0, height: 0 });
  const [collapsedSections, setCollapsedSections] = useState({});

  const saveTimerRef = useRef(null);
  const titleTimerRef = useRef(null);

  // Load plot data
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getStagePlot(plotId);
        setPlot(data);
        setTitle(data.title || '');
        const plotData = data.data || {};
        setItems(plotData.items || []);
        setBandName(plotData.bandName || '');
        setEventName(plotData.eventName || '');
      } catch (err) {
        Alert.alert('Error', 'Failed to load stage plot');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [plotId]);

  // Print / PDF export
  const handlePrintExport = useCallback(async () => {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sw = 900, sh = 500;

    // Simple SVG shapes for print (colored circles with labels, lightweight)
    const printSvg = (type) => {
      const colors = {
        vocals: '#e74c3c', 'mic-stand': '#e74c3c',
        'electric-guitar': '#e67e22', 'acoustic-guitar': '#c48a3f',
        'guitar-combo': '#6b4f30', 'guitar-212': '#4a6a85', 'guitar-halfstack': '#4a6a85', 'guitar-fullstack': '#4a6a85', 'guitar-stand': '#888',
        'bass-guitar': '#3498db', 'bass-combo': '#2d4a60', 'bass-115': '#2d4a60', 'bass-410': '#2d4a60', 'bass-stack': '#2d4a60',
        keyboard: '#9b59b6', 'keyboard-stand': '#9b59b6', piano: '#666',
        drums: '#e74c3c',
        'monitor-wedge': '#27ae60', 'di-box': '#f39c12', pedalboard: '#e67e22',
      };
      const c = colors[type] || '#888';
      return `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="${c}" opacity="0.2" stroke="${c}" stroke-width="1.5"/><text x="18" y="22" text-anchor="middle" font-size="8" font-weight="bold" fill="${c}">${esc(LABEL_MAP[type] || type).substring(0, 6)}</text></svg>`;
    };

    const itemsHtml = items.map(item => {
      if (item.type === 'text') {
        return `<div style="position:absolute;left:${item.x}px;top:${item.y}px;font-size:12px;font-weight:500;color:#333;background:rgba(200,200,200,0.3);border:1px dashed #999;border-radius:3px;padding:2px 6px;white-space:nowrap">${esc(item.text || '')}</div>`;
      }
      const label = LABEL_MAP[item.type] || item.type;
      return `<div style="position:absolute;left:${item.x}px;top:${item.y}px;display:flex;flex-direction:column;align-items:center;gap:2px">${printSvg(item.type)}<span style="font-size:8px;text-transform:uppercase;letter-spacing:0.5px;background:rgba(0,0,0,0.6);color:#fff;padding:1px 4px;border-radius:2px;white-space:nowrap">${esc(label)}</span></div>`;
    }).join('');

    const headerParts = [bandName, eventName].filter(Boolean);

    const html = `<!DOCTYPE html><html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding:20px; }
      .header { text-align:center; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #222; }
      .plot-title { font-size:24px; font-weight:800; letter-spacing:1px; text-transform:uppercase; }
      .plot-meta { font-size:14px; color:#666; margin-top:4px; }
      .stage-container { display:flex; flex-direction:column; align-items:center; }
      .front-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#999; margin-bottom:6px; }
      .stage { position:relative; border:2px solid #333; border-radius:6px; background:#f8f8f8; background-image:linear-gradient(#ddd 1px,transparent 1px),linear-gradient(90deg,#ddd 1px,transparent 1px); background-size:40px 40px; overflow:hidden; }
      .back-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#999; margin-top:6px; }
    </style></head><body>
      <div class="header">
        <div class="plot-title">${esc(title || 'Stage Plot')}</div>
        ${headerParts.length ? `<div class="plot-meta">${headerParts.map(esc).join(' &middot; ')}</div>` : ''}
      </div>
      <div class="stage-container">
        <div class="back-label">Back of Stage</div>
        <div class="stage" style="width:${sw}px;height:${sh}px">${itemsHtml}</div>
        <div class="front-label">Front of Stage / Audience</div>
      </div>
    </body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 }); // A4 landscape
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Export ${title || 'Stage Plot'}` });
    } catch (err) {
      if (err.message !== 'User did not share') {
        Alert.alert('Export Failed', err.message || 'Could not create PDF');
      }
    }
  }, [items, bandName, eventName, title]);

  // Set header title
  useEffect(() => {
    navigation.setOptions({
      title: title || 'Stage Plot',
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={handlePrintExport}
            style={[styles.headerButton, { backgroundColor: '#ea580c' }]}
            accessibilityLabel="Export as PDF"
          >
            <Text style={styles.headerButtonText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowPalette(true)}
            style={styles.headerButton}
            accessibilityLabel="Add instrument"
          >
            <Text style={styles.headerButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, title, handlePrintExport]);

  // Auto-save data
  const scheduleAutoSave = useCallback((newItems, newBandName, newEventName) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.updateStagePlot(plotId, {
          data: {
            items: newItems,
            stageWidth: 900,
            stageHeight: 500,
            bandName: newBandName,
            eventName: newEventName,
          },
        });
      } catch {
        // silent
      }
    }, 1000);
  }, [plotId]);

  // Save title with debounce
  const saveTitle = useCallback((newTitle) => {
    clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(async () => {
      try {
        await api.updateStagePlot(plotId, { title: newTitle });
      } catch {
        // silent
      }
    }, 600);
  }, [plotId]);

  const handleTitleChange = useCallback((text) => {
    setTitle(text);
    saveTitle(text);
  }, [saveTitle]);

  const handleBandNameChange = useCallback((text) => {
    setBandName(text);
    scheduleAutoSave(items, text, eventName);
  }, [items, eventName, scheduleAutoSave]);

  const handleEventNameChange = useCallback((text) => {
    setEventName(text);
    scheduleAutoSave(items, bandName, text);
  }, [items, bandName, scheduleAutoSave]);

  // Add instrument from palette
  const addItem = useCallback((type) => {
    const newItem = {
      type,
      x: Math.random() * Math.max(stageLayout.width - ITEM_SIZE - 20, 50) + 10,
      y: Math.random() * Math.max(stageLayout.height - ITEM_SIZE - 36, 50) + 10,
      id: Date.now() + Math.random(),
    };
    if (type === 'text') newItem.text = 'Label';
    const newItems = [...items, newItem];
    setItems(newItems);
    setShowPalette(false);
    lightImpact();
    scheduleAutoSave(newItems, bandName, eventName);
  }, [items, stageLayout, bandName, eventName, scheduleAutoSave]);

  // Move item
  const moveItem = useCallback((id, newX, newY) => {
    const newItems = items.map(it => it.id === id ? { ...it, x: newX, y: newY } : it);
    setItems(newItems);
    scheduleAutoSave(newItems, bandName, eventName);
  }, [items, bandName, eventName, scheduleAutoSave]);

  // Remove item
  const removeItem = useCallback((id) => {
    const newItems = items.filter(it => it.id !== id);
    setItems(newItems);
    successNotification();
    scheduleAutoSave(newItems, bandName, eventName);
  }, [items, bandName, eventName, scheduleAutoSave]);

  // Update text item content
  const updateItemText = useCallback((id, text) => {
    const newItems = items.map(it => it.id === id ? { ...it, text } : it);
    setItems(newItems);
    scheduleAutoSave(newItems, bandName, eventName);
  }, [items, bandName, eventName, scheduleAutoSave]);

  // Handle long-press on item
  const handleItemLongPress = useCallback((item) => {
    setSelectedItem(item);
    setShowItemActions(true);
  }, []);

  // Handle stage layout
  const handleStageLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setStageLayout({ width, height });
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Info bar */}
      <View style={[styles.infoBar, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <View style={styles.infoRow}>
          <View style={styles.infoField}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Title</Text>
            <TextInput
              style={[styles.infoInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={title}
              onChangeText={handleTitleChange}
              placeholder="Plot title"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.infoField}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Band</Text>
            <TextInput
              style={[styles.infoInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={bandName}
              onChangeText={handleBandNameChange}
              placeholder="Band name"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>
        <View style={styles.infoRow}>
          <View style={[styles.infoField, { flex: 1 }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Event / Venue</Text>
            <TextInput
              style={[styles.infoInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={eventName}
              onChangeText={handleEventNameChange}
              placeholder="Event or venue"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>
      </View>

      {/* Stage label - back */}
      <Text style={[styles.stageLabel, { color: colors.textSecondary }]}>
        {'\u25B2'} Back of Stage {'\u25B2'}
      </Text>

      {/* Stage canvas */}
      <View
        style={[styles.stageCanvas, { borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
        onLayout={handleStageLayout}
      >
        {stageLayout.width > 0 && items.map((item) => (
          <DraggableItem
            key={item.id}
            item={item}
            stageLayout={stageLayout}
            onMove={moveItem}
            onRemove={removeItem}
            onLongPress={handleItemLongPress}
            onUpdateText={updateItemText}
            colors={colors}
          />
        ))}
        {items.length === 0 && stageLayout.width > 0 && (
          <View style={styles.stageEmpty}>
            <Text style={[styles.stageEmptyText, { color: colors.textSecondary }]}>
              Tap "+ Add" to place instruments on stage
            </Text>
          </View>
        )}
      </View>

      {/* Stage label - front */}
      <Text style={[styles.stageLabel, { color: colors.textSecondary }]}>
        {'\u25BC'} Front of Stage (Audience) {'\u25BC'}
      </Text>

      {/* Item count */}
      <Text style={[styles.itemCount, { color: colors.textSecondary }]}>
        {items.length} item{items.length !== 1 ? 's' : ''} {'\u00B7'} Auto-saved
      </Text>

      {/* Instrument palette modal */}
      <Modal visible={showPalette} transparent animationType="fade" onRequestClose={() => setShowPalette(false)}>
        <TouchableOpacity style={styles.paletteOverlay} activeOpacity={1} onPress={() => setShowPalette(false)}>
          <View style={[styles.paletteSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.paletteHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.paletteTitle, { color: colors.textPrimary }]}>Add Instrument</Text>
            <ScrollView style={styles.paletteScroll} showsVerticalScrollIndicator={false}>
              {PALETTE_SECTIONS.map(section => {
                const isCollapsed = collapsedSections[section.label];
                return (
                  <View key={section.label}>
                    <TouchableOpacity
                      style={[styles.paletteSectionHeader, { borderTopColor: colors.border }]}
                      onPress={() => setCollapsedSections(prev => ({ ...prev, [section.label]: !prev[section.label] }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.paletteSectionChevron, { color: colors.textSecondary }]}>
                        {isCollapsed ? '\u25B6' : '\u25BC'}
                      </Text>
                      <Text style={[styles.paletteSectionLabel, { color: colors.textSecondary }]}>
                        {section.label}
                      </Text>
                    </TouchableOpacity>
                    {!isCollapsed && (
                      <View style={styles.paletteGrid}>
                        {section.items.map(type => (
                          <TouchableOpacity
                            key={type}
                            style={[styles.paletteItem, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
                            onPress={() => addItem(type)}
                            activeOpacity={0.7}
                          >
                            <InstrumentSvg type={type} size={40} />
                            <Text style={[styles.paletteItemLabel, { color: colors.textPrimary }]}>{LABEL_MAP[type]}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Item actions */}
      <ActionSheet
        visible={showItemActions}
        onClose={() => setShowItemActions(false)}
        title={selectedItem ? LABEL_MAP[selectedItem.type] : ''}
        actions={[
          {
            label: 'Remove from Stage',
            destructive: true,
            onPress: () => {
              setShowItemActions(false);
              if (selectedItem) removeItem(selectedItem.id);
            },
          },
        ]}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    color: '#16a34a',
    fontSize: 15,
    fontWeight: '600',
  },
  infoBar: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  infoField: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoInput: {
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stageLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingVertical: 6,
  },
  stageCanvas: {
    flex: 1,
    marginHorizontal: 8,
    borderWidth: 2,
    borderRadius: 8,
    borderStyle: 'dashed',
    position: 'relative',
    overflow: 'hidden',
  },
  stageEmpty: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  stageEmptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  stageItem: {
    position: 'absolute',
    alignItems: 'center',
    width: ITEM_SIZE,
  },
  stageItemLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#ccc',
    textAlign: 'center',
    marginTop: 1,
  },
  stageTextInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(155, 89, 246, 0.6)',
    borderRadius: 4,
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 70,
    maxWidth: 160,
    textAlign: 'center',
  },
  itemCount: {
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 8,
  },
  paletteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  paletteSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 34,
    maxHeight: '70%',
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  paletteHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  paletteTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  paletteScroll: {
    paddingHorizontal: 16,
  },
  paletteSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  paletteSectionChevron: {
    fontSize: 9,
    width: 12,
  },
  paletteSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  paletteItem: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    width: 80,
  },
  paletteItemLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
});
