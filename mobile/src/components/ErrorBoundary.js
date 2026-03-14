import { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Appearance } from 'react-native';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isDark = Appearance.getColorScheme() === 'dark';
      const bg = isDark ? '#1a1d21' : '#f9fafb';
      const titleColor = isDark ? '#ffffff' : '#111827';
      const messageColor = isDark ? '#9ca3af' : '#6b7280';

      return (
        <View style={[styles.container, { backgroundColor: bg }]}>
          <Text style={styles.icon}>{'\u26A0\uFE0F'}</Text>
          <Text style={[styles.title, { color: titleColor }]}>Something went wrong</Text>
          <Text style={[styles.message, { color: messageColor }]}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
