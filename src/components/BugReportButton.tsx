'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Bug } from 'lucide-react';
import styles from './BugReportButton.module.css';
import BugReportModal from './BugReportModal';
import {
  installInterceptors,
  removeInterceptors,
  getConsoleLogs,
  getNetworkLogs,
  type ConsoleLogEntry,
  type NetworkLogEntry,
} from '@/lib/bugReportLogger';

export default function BugReportButton() {
  const { status } = useSession();
  const [modalOpen, setModalOpen] = useState(false);
  const [snapConsoleLogs, setSnapConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [snapNetworkLogs, setSnapNetworkLogs] = useState<NetworkLogEntry[]>([]);

  useEffect(() => {
    installInterceptors();
    return () => removeInterceptors();
  }, []);

  if (status !== 'authenticated') return null;

  function handleOpen() {
    setSnapConsoleLogs(getConsoleLogs());
    setSnapNetworkLogs(getNetworkLogs());
    setModalOpen(true);
  }

  return (
    <>
      <button
        className={styles.floatingButton}
        onClick={handleOpen}
        aria-label="Signaler un bug"
        title="Signaler un bug"
      >
        <Bug size={20} />
      </button>
      {modalOpen && (
        <BugReportModal
          consoleLogs={snapConsoleLogs}
          networkLogs={snapNetworkLogs}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
