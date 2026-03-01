import { Component } from 'react';

class ErrorBoundary extends Component {
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

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const styles = getComputedStyle(document.documentElement);
      const bgColor = styles.getPropertyValue('--color-bg-primary').trim() || '#1a1d21';
      const textColor = styles.getPropertyValue('--color-text-primary').trim() || '#d1d2d3';
      const mutedColor = styles.getPropertyValue('--color-text-muted').trim() || '#ababad';
      const accentColor = styles.getPropertyValue('--color-accent').trim() || '#4A154B';

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bgColor,
          color: textColor,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '2rem'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: textColor }}>
              Something went wrong
            </h1>
            <p style={{ marginBottom: '1.5rem', color: mutedColor }}>
              An unexpected error occurred. Please reload the page.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                backgroundColor: accentColor,
                color: 'white',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
