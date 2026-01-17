import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Footer from '../common/Footer';

function JoinWorkspace() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const joinWorkspace = async () => {
      try {
        const workspace = await api.joinWorkspace(inviteCode);
        navigate(`/workspace/${workspace.id}`);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    joinWorkspace();
  }, [inviteCode, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-purple flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-white text-xl">Joining workspace...</div>
        </div>
        <Footer theme="dark" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slack-purple flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Unable to Join</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="btn bg-green-600 hover:bg-green-700 text-white"
          >
            Go to Workspaces
          </button>
        </div>
      </div>
      <Footer theme="dark" />
    </div>
  );
}

export default JoinWorkspace;
