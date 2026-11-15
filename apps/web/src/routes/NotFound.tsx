import { Link } from 'react-router';
import { ArrowLeft, Compass } from 'lucide-react';

export function NotFound() {
  return (
    <div className="min-h-screen bg-[#08080A] text-[#F4F4F5] flex items-center justify-center p-4 selection:bg-[#FF6B35] selection:text-[#08080A]">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#111114] border border-[#2C2826] text-center space-y-5 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-[#18181C] border border-[#2C2826] text-white font-mono font-black text-2xl flex items-center justify-center mx-auto shadow-inner">
          404
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Page Not Found</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The requested page does not exist or may have been moved.
          </p>
        </div>
        <div className="pt-2 flex justify-center gap-3">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-black bg-white hover:bg-zinc-200 transition-all duration-200 active:scale-95 shadow-md shadow-white/10"
          >
            <Compass className="w-4 h-4" />
            Go to App
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-zinc-300 bg-white/5 hover:bg-white/10 border border-[#2C2826] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

