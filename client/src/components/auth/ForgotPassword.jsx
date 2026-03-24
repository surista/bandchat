import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import Footer from '../common/Footer';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.forgotPassword(email);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
            <h1 className="text-3xl font-bold text-white mb-1">Reset Password</h1>
            <p className="text-gray-400">Enter your email to receive a reset link</p>
          </div>

          <div className="bg-gray-900 rounded-xl p-8 shadow-2xl border border-gray-800">
            {success ? (
              <div className="text-center">
                <div className="text-green-400 text-5xl mb-4">&#10003;</div>
                <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
                <p className="text-gray-400 mb-6">
                  If an account exists with <strong className="text-gray-200">{email}</strong>, we've sent a password reset link.
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  The link will expire in 1 hour.
                </p>
                <Link
                  to="/login"
                  className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-500 transition-colors"
                >
                  Back to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && (
                  <div role="alert" className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
                    {error}
                  </div>
                )}

                <div className="mb-6">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-500 transition-colors disabled:opacity-50 text-base"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>

                <p className="text-center mt-6 text-gray-400 text-sm">
                  Remember your password?{' '}
                  <Link to="/login" className="text-green-400 font-medium hover:text-green-300">
                    Sign in
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

export default ForgotPassword;
