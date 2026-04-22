import { useCallback, useEffect, useState } from 'react';
import { getActiveFileId, setActiveFileId } from '../utils/storage';

export function useSession() {
  const [activeFileId, setActiveFileIdState] = useState<string | null>(() =>
    getActiveFileId(),
  );

  useEffect(() => {
    setActiveFileId(activeFileId);
  }, [activeFileId]);

  const select = useCallback((fileId: string | null) => {
    setActiveFileIdState(fileId);
  }, []);

  const clear = useCallback(() => setActiveFileIdState(null), []);

  return { activeFileId, select, clear };
}
