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

    // Verify the token is valid
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

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
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
      <div className="min-h-screen bg-slack-purple flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-white text-xl">Verifying reset link...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slack-purple flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/icon-192.png"
              alt="BandChat"
              className="w-24 h-24 mx-auto mb-4 rounded-xl shadow-lg"
            />
            <h1 className="text-4xl font-bold text-white mb-2">Set New Password</h1>
            <p className="text-gray-300">Enter your new password below</p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-xl">
            {success ? (
              <div className="text-center">
                <div className="text-green-600 text-5xl mb-4">✓</div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Password Reset!</h2>
                <p className="text-gray-600 mb-6">
                  Your password has been successfully reset. You can now sign in with your new password.
                </p>
                <Link
                  to="/login"
                  className="inline-block bg-[#4A154B] text-white px-6 py-2 rounded font-medium hover:bg-[#3D1140] transition-colors"
                >
                  Sign In
                </Link>
              </div>
            ) : !tokenValid ? (
              <div className="text-center">
                <div className="text-red-500 text-5xl mb-4">!</div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Invalid Reset Link</h2>
                <p className="text-gray-600 mb-6">
                  {error || 'This password reset link is invalid or has expired.'}
                </p>
                <Link
                  to="/forgot-password"
                  className="inline-block bg-[#4A154B] text-white px-6 py-2 rounded font-medium hover:bg-[#3D1140] transition-colors"
                >
                  Request New Link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                  </div>
                )}

                <div className="mb-4">
                  <label htmlFor="password" className="block text-gray-700 font-medium mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-slack-purple focus:border-transparent pr-12"
                      placeholder="At least 6 characters"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                      tabIndex={-1}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <label htmlFor="confirmPassword" className="block text-gray-700 font-medium mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-slack-purple focus:border-transparent pr-12"
                      placeholder="Confirm your new password"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#4A154B] text-white py-3 rounded font-medium hover:bg-[#3D1140] transition-colors disabled:opacity-50"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>

                <p className="text-center mt-6 text-gray-600">
                  <Link to="/login" className="text-[#4A154B] font-medium hover:underline">
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
