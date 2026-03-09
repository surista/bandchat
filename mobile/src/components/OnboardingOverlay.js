import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

const STEPS = [
  {
    title: 'Welcome to BandChat!',
    body: 'The communication and management app built specifically for bands. Everything your band needs, all in one place.',
    icon: '\uD83C\uDFB8',
  },
  {
    title: 'Channels',
    body: 'Organize your band communication with channels. Create channels for gig planning, song ideas, or general chat.',
    icon: '\uD83D\uDCAC',
  },
  {
    title: 'Band Features',
    body: 'Manage your songs, build setlists, and keep track of gigs with the built-in calendar. Everything a band needs to stay organized.',
    icon: '\uD83C\uDFB5',
  },
  {
    title: 'Settings',
    body: 'Customize your experience with themes, notification preferences, and profile settings. Make BandChat yours.',
    icon: '\u2699\uFE0F',
  },
];

export default function OnboardingOverlay({ onComplete }) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.min(screenWidth - 48, 360);
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const animateToStep = (nextStep) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setCurrentStep(nextStep);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      animateToStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: colors.modalBg || colors.bgSecondary, opacity: fadeAnim, width: cardWidth },
        ]}
      >
        <Text style={styles.icon}>{step.icon}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{step.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{step.body}</Text>

        {/* Step indicator dots */}
        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === currentStep ? colors.primary : colors.border,
                },
              ]}
            />
          ))}
        </View>

        <Text style={[styles.stepCount, { color: colors.textSecondary }]}>
          {currentStep + 1} / {STEPS.length}
        </Text>

        {/* Buttons */}
        <View style={styles.buttonsRow}>
          {!isLastStep && (
            <TouchableOpacity
              style={[styles.skipButton, { backgroundColor: colors.bgTertiary }]}
              onPress={handleSkip}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding tour"
            >
              <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.nextButton,
              { backgroundColor: colors.primary },
              isLastStep && styles.fullWidthButton,
            ]}
            onPress={handleNext}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isLastStep ? 'Get started' : 'Next step'}
          >
            <Text style={styles.nextText}>{isLastStep ? 'Get Started' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: 24,
  },
  card: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepCount: {
    fontSize: 13,
    marginBottom: 20,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  fullWidthButton: {
    flex: 1,
  },
  nextText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
