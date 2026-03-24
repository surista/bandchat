import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ToastContext = createContext(null);

let toastId = 0;

const TOAST_COLORS = {
  success: { bg: '#065f46', border: '#10b981' },
  error: { bg: '#7f1d1d', border: '#ef4444' },
  warning: { bg: '#78350f', border: '#f59e0b' },
  info: { bg: '#1e3a5f', border: '#3b82f6' },
};

const TOAST_ICONS = {
  success: '\u2713',
  error: '\u2715',
  warning: '!',
  info: '\u2139',
};

function Toast({ toast: t, onRemove }) {
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

  const colors = TOAST_COLORS[t.type] || TOAST_COLORS.info;

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: colors.bg, borderLeftColor: colors.border, transform: [{ translateY }], opacity },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t.type}: ${t.message}`}
    >
      <Text style={styles.toastIcon} accessibilityElementsHidden>{TOAST_ICONS[t.type] || TOAST_ICONS.info}</Text>
      <Text style={styles.toastMessage} numberOfLines={3}>{t.message}</Text>
      <TouchableOpacity
        onPress={() => onRemove(t.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
      >
        <Text style={styles.toastClose}>\u00d7</Text>
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
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 10,
    width: 20,
    textAlign: 'center',
  },
  toastMessage: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  toastClose: {
    color: '#9ca3af',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 10,
    paddingHorizontal: 4,
  },
});
