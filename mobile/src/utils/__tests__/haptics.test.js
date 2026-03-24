// Must mock expo-haptics before requiring the module
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const Haptics = require('expo-haptics');
const {
  lightImpact,
  mediumImpact,
  heavyImpact,
  successNotification,
  errorNotification,
  selectionFeedback,
} = require('../haptics');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('haptics', () => {
  test('lightImpact calls impactAsync with Light', () => {
    lightImpact();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  test('mediumImpact calls impactAsync with Medium', () => {
    mediumImpact();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
  });

  test('heavyImpact calls impactAsync with Heavy', () => {
    heavyImpact();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
  });

  test('successNotification calls notificationAsync with Success', () => {
    successNotification();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  test('errorNotification calls notificationAsync with Error', () => {
    errorNotification();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
  });

  test('selectionFeedback calls selectionAsync', () => {
    selectionFeedback();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  test('handles rejection without throwing', () => {
    Haptics.impactAsync.mockRejectedValueOnce(new Error('not available'));
    // Should not throw
    expect(() => lightImpact()).not.toThrow();
  });
});
