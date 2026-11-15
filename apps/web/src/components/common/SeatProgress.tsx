interface SeatProgressProps {
  memberCount: number;
  maxSize: number;
  minSize?: number;
  className?: string;
}

export function SeatProgress({ memberCount, maxSize, minSize, className = '' }: SeatProgressProps) {
  const openSeats = Math.max(0, maxSize - memberCount);
  const percentage = Math.min(100, Math.round((memberCount / maxSize) * 100));
  const isFull = openSeats === 0;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-300">
          <strong className="text-white font-semibold">{memberCount}</strong> of {maxSize} seats filled
        </span>
        <span className={`font-mono font-medium ${isFull ? 'text-rose-400' : 'text-[#FF7A45]'}`}>
          {isFull ? 'Team full' : `${openSeats} open seat${openSeats === 1 ? '' : 's'}`}
        </span>
      </div>
      <div
        className="w-full h-2 bg-[#18181C] rounded-full overflow-hidden border border-[#2C2826]"
        role="progressbar"
        aria-valuenow={memberCount}
        aria-valuemin={0}
        aria-valuemax={maxSize}
        aria-label={`${memberCount} of ${maxSize} seats filled`}
      >
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isFull
              ? 'bg-emerald-400'
              : memberCount >= (minSize || 1)
                ? 'bg-[#FF6B35]'
                : 'bg-amber-400'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
