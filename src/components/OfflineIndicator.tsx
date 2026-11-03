import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC<{ message: string }> = ({ message }) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 md:right-auto z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-[#142438] px-4 py-2.5 text-xs font-medium text-amber-300 shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
      <span>{message}</span>
    </div>
  );
};
