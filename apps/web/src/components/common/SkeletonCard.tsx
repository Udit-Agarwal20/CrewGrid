export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-5 rounded-2xl bg-[#171E31] border border-[#35405A] animate-pulse flex flex-col gap-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="h-5 bg-[#222A42] rounded-md w-1/3" />
        <div className="h-5 bg-[#222A42] rounded-full w-16" />
      </div>
      <div className="h-4 bg-[#222A42] rounded-md w-3/4 mt-1" />
      <div className="h-3 bg-[#222A42] rounded-md w-1/2" />
      <div className="h-2 bg-[#222A42] rounded-full w-full mt-2" />
      <div className="flex items-center gap-2 mt-2">
        <div className="h-6 bg-[#222A42] rounded-md w-16" />
        <div className="h-6 bg-[#222A42] rounded-md w-20" />
      </div>
    </div>
  );
}
