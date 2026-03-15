import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Footer from '../common/Footer';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setError('No reset token provided');
      return;
    }

    api.verifyResetToken(token)
      .then(result => {
        setTokenValid(result.valid);
        if (!result.valid) {
          setError(result.error || 'Invalid or expired reset link');
        }
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [token]);

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
      await api.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-white text-xl">Verifying reset link...</div>
        </div>
      </div>
    );
  }

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
            <h1 className="text-3xl font-bold text-white mb-1">Set New Password</h1>
            <p className="text-gray-400">Enter your new password below</p>
          </div>

          <div className="bg-gray-900 rounded-xl p-8 shadow-2xl border border-gray-800">
            {success ? (
              <div className="text-center">
                <div className="text-green-400 text-5xl mb-4">&#10003;</div>
                <h2 className="text-xl font-semibold text-white mb-2">Password Reset!</h2>
                <p className="text-gray-400 mb-6">
                  Your password has been successfully reset. You can now sign in with your new password.
                </p>
                <Link
                  to="/login"
                  className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-500 transition-colors"
                >
                  Sign In
                </Link>
              </div>
            ) : !tokenValid ? (
              <div className="text-center">
                <div className="text-red-400 text-5xl mb-4">!</div>
                <h2 className="text-xl font-semibold text-white mb-2">Invalid Reset Link</h2>
                <p className="text-gray-400 mb-6">
                  {error || 'This password reset link is invalid or has expired.'}
                </p>
                <Link
                  to="/forgot-password"
                  className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-500 transition-colors"
                >
                  Request New Link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
                    {error}
                  </div>
                )}

                <div className="mb-4">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base pr-16"
                      placeholder="Min 8 chars, upper + lower + number"
                      minLength={8}
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

                <div className="mb-6">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                    placeholder="Confirm your new password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-500 transition-colors disabled:opacity-50 text-base"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>

                <p className="text-center mt-6 text-gray-400 text-sm">
                  <Link to="/login" className="text-green-400 font-medium hover:text-green-300">
                    Back to Login
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
      <Footer theme="dark" />
    </div>
  );
}

export default ResetPassword;
