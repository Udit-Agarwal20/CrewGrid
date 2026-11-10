import { Link } from 'react-router';
import { ArrowLeft, Compass } from 'lucide-react';

export function NotFound() {
  return (
    <div className="min-h-screen bg-[#0B1020] text-[#E9EDF5] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#171E31] border border-[#35405A] text-center space-y-4 shadow-2xl">
        <div className="w-12 h-12 rounded-xl bg-[#222A42] border border-[#35405A] text-[#9BF5CC] font-mono font-black text-xl flex items-center justify-center mx-auto">
          404
        </div>
        <h1 className="text-xl font-bold">Page Not Found</h1>
        <p className="text-xs text-[#B5C1D4] leading-relaxed">
          The requested page does not exist or may have been moved.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] transition"
          >
            <Compass className="w-4 h-4" />
            Go to App
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#B5C1D4] bg-[#222A42] hover:bg-[#35405A] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
