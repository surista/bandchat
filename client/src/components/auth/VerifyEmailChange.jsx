import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

function VerifyEmailChange() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      const email = searchParams.get('email');

      if (!token || !email) {
        setStatus('error');
        setMessage('Invalid verification link. Missing token or email.');
        return;
      }

      try {
        const result = await api.verifyEmailChange(token, email);
        setStatus('success');
        setMessage('Your email has been updated successfully!');
        // Update the user context with new email
        if (result.user) {
          updateUser(result.user);
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Failed to verify email change.');
      }
    };

    verifyEmail();
  }, [searchParams, updateUser]);

  return (
    <div className="min-h-screen bg-slack-purple flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
        {status === 'verifying' && (
          <>
            <div className="animate-spin w-12 h-12 border-4 border-slack-purple border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800">Verifying your email...</h2>
            <p className="text-gray-600 mt-2">Please wait while we update your email address.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Email Updated!</h2>
            <p className="text-gray-600 mt-2">{message}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 bg-slack-purple text-white px-6 py-2 rounded-lg hover:bg-opacity-90 transition-colors"
            >
              Go to BandChat
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Verification Failed</h2>
            <p className="text-gray-600 mt-2">{message}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 bg-slack-purple text-white px-6 py-2 rounded-lg hover:bg-opacity-90 transition-colors"
            >
              Go to BandChat
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmailChange;
