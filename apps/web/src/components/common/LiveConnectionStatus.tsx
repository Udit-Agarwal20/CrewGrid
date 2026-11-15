import { Radio } from 'lucide-react';
import { ConnectionState } from '../../hooks/useEvents';

interface LiveConnectionStatusProps {
  status: ConnectionState;
  lastActivity?: Date | null;
  className?: string;
}

export function LiveConnectionStatus({ status, lastActivity, className = '' }: LiveConnectionStatusProps) {
  const configs = {
    connected: {
      color: 'bg-[#9BF5CC]',
      ring: 'bg-[#9BF5CC]/30',
      text: 'text-[#9BF5CC]',
      label: 'Live'
    },
    connecting: {
      color: 'bg-[#FBBF24]',
      ring: 'bg-[#FBBF24]/30',
      text: 'text-[#FBBF24]',
      label: 'Connecting...'
    },
    disconnected: {
      color: 'bg-[#F87171]',
      ring: 'bg-[#F87171]/30',
      text: 'text-[#B5C1D4]',
      label: 'Offline'
    }
  };

  const current = configs[status];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Real-time connection status: ${current.label}`}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#171E31] border border-[#35405A] text-xs font-mono ${className}`}
      title={lastActivity ? `Last event: ${lastActivity.toLocaleTimeString()}` : 'SSE real-time stream status'}
    >
      <span className="relative flex h-2 w-2">
        {status === 'connected' && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${current.ring} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${current.color}`} />
      </span>
      <span className={`font-semibold ${current.text}`}>{current.label}</span>
      <Radio className="w-3 h-3 text-[#B5C1D4]" />
    </div>
  );
}

