export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-5 rounded-2xl bg-[#111114] border border-[#2C2826] animate-pulse flex flex-col gap-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="h-5 bg-[#18181C] rounded-md w-1/3" />
        <div className="h-5 bg-[#18181C] rounded-full w-16" />
      </div>
      <div className="h-4 bg-[#18181C] rounded-md w-3/4 mt-1" />
      <div className="h-3 bg-[#18181C] rounded-md w-1/2" />
      <div className="h-2 bg-[#18181C] rounded-full w-full mt-2" />
      <div className="flex items-center gap-2 mt-2">
        <div className="h-6 bg-[#18181C] rounded-md w-16" />
        <div className="h-6 bg-[#18181C] rounded-md w-20" />
      </div>
    </div>
  );
}
