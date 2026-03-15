import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';
import Footer from '../common/Footer';

function Login() {
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);

    try {
      await googleLogin(credentialResponse.credential);
    } catch (err) {
      if (err.message === 'email_exists_local') {
        setError('An account with this email exists. Please sign in with your password.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google sign-in failed. Please try again.');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/bc_icon_06.png"
              alt="BandChat"
              className="w-20 h-20 mx-auto mb-4 rounded-xl shadow-lg"
            />
            <h1 className="text-3xl font-bold text-white mb-1">BandChat</h1>
            <p className="text-gray-400">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-8 shadow-2xl border border-gray-800">
          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="mb-6">
            <GoogleSignInButton
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
            />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-gray-900 text-gray-500">Or continue with email</span>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              id="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base pr-16"
                placeholder="Your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm font-medium"
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="mb-6 text-right">
            <Link to="/forgot-password" className="text-sm text-green-400 hover:text-green-300">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-500 transition-colors disabled:opacity-50 text-base"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center mt-6 text-gray-400 text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="text-green-400 font-medium hover:text-green-300">
              Sign up
            </Link>
          </p>
        </form>
        </div>
      </div>
      <Footer theme="dark" />
    </div>
  );
}

export default Login;
