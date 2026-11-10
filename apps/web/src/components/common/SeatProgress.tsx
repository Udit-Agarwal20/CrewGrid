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
        <span className="font-semibold text-[#E9EDF5]">
          {memberCount} of {maxSize} seats filled
        </span>
        <span className={`font-mono ${isFull ? 'text-[#F87171] font-medium' : 'text-[#9BF5CC]'}`}>
          {isFull ? 'Team full' : `${openSeats} open seat${openSeats === 1 ? '' : 's'}`}
        </span>
      </div>
      <div
        className="w-full h-2 bg-[#222A42] rounded-full overflow-hidden border border-[#35405A]"
        role="progressbar"
        aria-valuenow={memberCount}
        aria-valuemin={0}
        aria-valuemax={maxSize}
        aria-label={`${memberCount} of ${maxSize} seats filled`}
      >
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isFull ? 'bg-[#9BF5CC]' : memberCount >= (minSize || 1) ? 'bg-[#9BF5CC]' : 'bg-[#FBBF24]'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
