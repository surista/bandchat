import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';

const ToastContext = createContext(null);

let toastId = 0;

const TOAST_COLORS = {
  dark: {
    success: { bg: '#065f46', border: '#10b981', text: '#ffffff', icon: '#ffffff', close: '#d1d5db' },
    error: { bg: '#7f1d1d', border: '#ef4444', text: '#ffffff', icon: '#ffffff', close: '#d1d5db' },
    warning: { bg: '#78350f', border: '#f59e0b', text: '#ffffff', icon: '#ffffff', close: '#d1d5db' },
    info: { bg: '#1e3a5f', border: '#3b82f6', text: '#ffffff', icon: '#ffffff', close: '#d1d5db' },
  },
  light: {
    success: { bg: '#ecfdf5', border: '#10b981', text: '#064e3b', icon: '#059669', close: '#6b7280' },
    error: { bg: '#fef2f2', border: '#ef4444', text: '#7f1d1d', icon: '#dc2626', close: '#6b7280' },
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#78350f', icon: '#d97706', close: '#6b7280' },
    info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e3a8a', icon: '#2563eb', close: '#6b7280' },
  },
};

const TOAST_ICONS = {
  success: 'checkmark-circle',
  error: 'close-circle',
  warning: 'warning',
  info: 'information-circle',
};

function Toast({ toast: t, onRemove }) {
  const { mode } = useTheme();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (t.exiting) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [t.exiting]);

  const palette = TOAST_COLORS[mode === 'dark' ? 'dark' : 'light'];
  const c = palette[t.type] || palette.info;

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: c.bg, borderLeftColor: c.border, transform: [{ translateY }], opacity },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t.type}: ${t.message}`}
    >
      <Ionicons name={TOAST_ICONS[t.type] || TOAST_ICONS.info} size={18} color={c.icon} style={styles.toastIcon} accessibilityElementsHidden />
      <Text style={[styles.toastMessage, { color: c.text }]} numberOfLines={3}>{t.message}</Text>
      <TouchableOpacity
        onPress={() => onRemove(t.id)}
        style={styles.toastCloseButton}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={16} color={c.close} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const insets = useSafeAreaInsets();

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }, 200);
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type, exiting: false }]);

    if (duration > 0) {
      const timer = setTimeout(() => removeToast(id), duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [removeToast]);

  const toast = useMemo(() => {
    const fn = (message) => addToast(message, 'info');
    fn.success = (message) => addToast(message, 'success');
    fn.error = (message, duration = 6000) => addToast(message, 'error', duration);
    fn.warning = (message) => addToast(message, 'warning');
    fn.info = (message) => addToast(message, 'info');
    return fn;
  }, [addToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  toastIcon: {
    marginRight: 10,
  },
  toastMessage: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  toastCloseButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    marginRight: -8,
  },
});
