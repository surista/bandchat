import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Returns true if the current user is an admin in the given workspace.
 */
export default function useIsAdmin(workspace) {
  const { user } = useAuth();
  return useMemo(() => {
    if (!workspace?.members || !user) return false;
    return workspace.members.find(m => m.user?.id === user.id)?.role === 'ADMIN';
  }, [workspace, user]);
}
