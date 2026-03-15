import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';
import Footer from '../common/Footer';

function Signup() {
  const { signup, googleLogin } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, and a number');
      return;
    }

    setLoading(true);

    try {
      await signup(email, password, displayName);
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
    setError('Google sign-up failed. Please try again.');
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
            <p className="text-gray-400">Create your account</p>
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
              text="signup_with"
            />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-gray-900 text-gray-500">Or sign up with email</span>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-300 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              id="displayName"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
              placeholder="Your name"
              required
            />
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base pr-16"
                placeholder="Min 8 chars, upper + lower + number"
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

          <div className="mb-4">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1.5">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
              placeholder="Confirm your password"
              required
            />
          </div>

          <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500"
            />
            <span className="text-sm text-gray-400">
              I agree to the{' '}
              <Link to="/terms" className="text-green-400 hover:text-green-300">Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" className="text-green-400 hover:text-green-300">Privacy Policy</Link>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !agreedToTerms}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-500 transition-colors disabled:opacity-50 text-base"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <p className="text-center mt-6 text-gray-400 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-green-400 font-medium hover:text-green-300">
              Sign in
            </Link>
          </p>
        </form>
        </div>
      </div>
      <Footer theme="dark" />
    </div>
  );
}

export default Signup;
