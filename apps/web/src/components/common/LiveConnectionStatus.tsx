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
      color: 'bg-emerald-400',
      ring: 'bg-emerald-400/40',
      text: 'text-emerald-400',
      label: 'Live'
    },
    connecting: {
      color: 'bg-amber-400',
      ring: 'bg-amber-400/40',
      text: 'text-amber-400',
      label: 'Connecting...'
    },
    disconnected: {
      color: 'bg-rose-400',
      ring: 'bg-rose-400/40',
      text: 'text-zinc-400',
      label: 'Offline'
    }
  };

  const current = configs[status];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Real-time connection status: ${current.label}`}
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141418] border border-[#2C2826] text-xs font-mono shadow-xs ${className}`}
      title={lastActivity ? `Last event: ${lastActivity.toLocaleTimeString()}` : 'SSE real-time stream status'}
    >
      <span className="relative flex h-2 w-2">
        {status === 'connected' && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${current.ring} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${current.color}`} />
      </span>
      <span className={`font-semibold ${current.text}`}>{current.label}</span>
      <Radio className="w-3 h-3 text-zinc-500" />
    </div>
  );
}
