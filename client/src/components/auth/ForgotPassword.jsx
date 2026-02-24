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
    <div className="min-h-screen bg-slack-purple flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src="/icon-192.png"
              alt="BandChat"
              className="w-24 h-24 mx-auto mb-4 rounded-xl shadow-lg"
            />
            <h1 className="text-4xl font-bold text-white mb-2">Reset Password</h1>
            <p className="text-gray-300">Enter your email to receive a reset link</p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-xl">
            {success ? (
              <div className="text-center">
                <div className="text-green-600 text-5xl mb-4">✓</div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Check your email</h2>
                <p className="text-gray-600 mb-6">
                  If an account exists with <strong>{email}</strong>, we've sent a password reset link.
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  The link will expire in 1 hour.
                </p>
                <Link
                  to="/login"
                  className="inline-block bg-slack-purple text-white px-6 py-2 rounded font-medium hover:bg-slack-purple-dark transition-colors"
                >
                  Back to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                  </div>
                )}

                <div className="mb-6">
                  <label htmlFor="email" className="block text-gray-700 font-medium mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-slack-purple focus:border-transparent"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slack-purple text-white py-3 rounded font-medium hover:bg-slack-purple-dark transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>

                <p className="text-center mt-6 text-gray-600">
                  Remember your password?{' '}
                  <Link to="/login" className="text-slack-purple font-medium hover:underline">
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
