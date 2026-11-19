import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';

/**
 * Ask before leaving a screen with unsaved form edits.
 *
 * Android's back gesture / button (and iOS swipe-back) pop the screen
 * directly, so an edit-mode form lost everything typed with no warning.
 *
 * Dirty-tracking is snapshot based: while `active`, the serialized `values`
 * are compared with a baseline captured when editing starts, and re-captured
 * whenever `resetKey` changes (pass the loaded entity, so populating the form
 * from a fetch isn't counted as an edit).
 *
 * Returns `leave(fn)` — wrap an intentional exit (e.g. a Cancel button that
 * calls navigation.goBack()) so it skips the prompt.
 */
export function useDiscardChangesGuard(navigation, { active, values, resetKey }) {
  const serialized = JSON.stringify(values);
  const baselineRef = useRef(null);
  const resetKeyRef = useRef(resetKey);
  const bypassRef = useRef(false);

  if (!active) {
    baselineRef.current = null;
  } else if (baselineRef.current === null || resetKeyRef.current !== resetKey) {
    baselineRef.current = serialized;
  }
  resetKeyRef.current = resetKey;

  const dirty = active && baselineRef.current !== serialized;

  usePreventRemove(dirty, ({ data }) => {
    if (bypassRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(
      'Discard changes?',
      'You have unsaved changes. Are you sure you want to leave?',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });

  const leave = useCallback((fn) => {
    bypassRef.current = true;
    try {
      fn();
    } finally {
      // Navigation dispatch is synchronous enough that the prevent-remove
      // callback has run by the next tick.
      setTimeout(() => { bypassRef.current = false; }, 0);
    }
  }, []);

  return { dirty, leave };
}

export default useDiscardChangesGuard;
