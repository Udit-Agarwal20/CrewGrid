import { Routes, Route, Link } from 'react-router';
import { Home } from './routes/Home';
import { Login } from './routes/Login';
import { Register } from './routes/Register';

export function App() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0B1020] text-[#E9EDF5]">
      <header className="border-b border-[#35405A] bg-[#171E31]/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-lg text-[#E9EDF5] hover:opacity-90">
            <span className="w-6 h-6 rounded-md bg-[#9BF5CC] flex items-center justify-center text-[#0B1020] text-xs font-black">
              C
            </span>
            <span>CrewGrid</span>
          </Link>

          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link to="/" className="text-[#B5C1D4] hover:text-[#E9EDF5] transition">
              Home
            </Link>
            <Link to="/login" className="text-[#B5C1D4] hover:text-[#E9EDF5] transition">
              Sign In
            </Link>
            <Link
              to="/register"
              className="px-3.5 py-1.5 rounded-lg bg-[#9BF5CC] text-[#0B1020] font-semibold hover:bg-[#86e0b7] transition"
            >
              Register
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="*"
            element={
              <div className="max-w-md mx-auto py-24 text-center">
                <h1 className="text-4xl font-bold mb-4">404</h1>
                <p className="text-[#B5C1D4] mb-6">Page not found</p>
                <Link to="/" className="text-[#9BF5CC] hover:underline">
                  Return to Home
                </Link>
              </div>
            }
          />
        </Routes>
      </main>

      <footer className="border-t border-[#35405A] py-8 text-center text-xs text-[#B5C1D4]">
        <p>CrewGrid — Hack4Hack Crew Hiring Challenge 2026 (PS1)</p>
      </footer>
    </div>
  );
}

