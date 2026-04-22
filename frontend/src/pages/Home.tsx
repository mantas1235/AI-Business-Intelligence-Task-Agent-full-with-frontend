import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import InputBar from '../components/InputBar';
import { useSession } from '../hooks/useSession';
import { useFiles } from '../hooks/useFiles';
import { useChat } from '../hooks/useChat';
import type { UploadResponse } from '../types';

export default function Home() {
  const { activeFileId, select } = useSession();
  const { files, loading, error, refresh, addFileOptimistic, deleteFile } = useFiles();
  const { messages, sending, error: chatError, send, cancel } = useChat(activeFileId);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // If the persisted file_id no longer exists server-side, clear it.
  useEffect(() => {
    if (!activeFileId || loading || error) return;
    const exists = files.some((f) => f.file_id === activeFileId);
    if (!exists && files.length > 0) select(null);
  }, [activeFileId, files, loading, error, select]);

  const activeFile = useMemo(
    () => files.find((f) => f.file_id === activeFileId) ?? null,
    [files, activeFileId],
  );

  const handleUploaded = (res: UploadResponse) => {
    addFileOptimistic({
      file_id: res.file_id,
      original_name: res.info.name,
      created_at: Date.now() / 1000,
    });
    select(res.file_id);
    setSidebarOpen(false);
    // Hydrate with authoritative list from server.
    void refresh();
  };

  const handleSelect = (fileId: string) => {
    select(fileId);
    setSidebarOpen(false);
  };

  const handleDelete = async (fileId: string) => {
    try {
      await deleteFile(fileId);
      if (activeFileId === fileId) select(null);
    } catch {
      // error surfaced via useFiles state
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950">
      <Sidebar
        files={files}
        activeFileId={activeFileId}
        loading={loading}
        error={error}
        onSelect={handleSelect}
        onDelete={handleDelete}
        onUploaded={handleUploaded}
        onRefresh={() => void refresh()}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <ChatWindow
          messages={messages}
          activeFile={activeFile}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        {chatError && (
          <p
            role="alert"
            className="border-t border-rose-900/40 bg-rose-950/40 px-4 py-2 text-center text-xs text-rose-300"
          >
            {chatError}
          </p>
        )}

        <InputBar
          disabled={!activeFileId}
          sending={sending}
          onSend={send}
          onCancel={cancel}
        />
      </main>
    </div>
  );
}
