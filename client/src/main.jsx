import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import { pushService } from './services/push';
import { isNative } from './services/platform';
import { initNativeApp } from './services/nativeApp';
import '../styles/main.css';

// Initialize platform-specific services
if (isNative) {
  // Native iOS/Android — set up status bar, keyboard, lifecycle
  initNativeApp();
} else {
  // Web — service worker for PWA and web push notifications
  pushService.init().then((registered) => {
    if (registered) {
      console.log('Push notifications ready');
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <BrowserRouter>
          <ThemeProvider>
            <AuthProvider>
              <SocketProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </SocketProvider>
            </AuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
