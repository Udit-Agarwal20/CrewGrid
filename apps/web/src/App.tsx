import { Routes, Route, Navigate } from 'react-router';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { HackathonProvider } from './context/HackathonContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';

// Routes
import { Home } from './routes/Home';
import { Login } from './routes/Login';
import { Register } from './routes/Register';
import { Onboarding } from './routes/Onboarding';
import { Dashboard } from './routes/Dashboard';
import { TeamDiscovery } from './routes/TeamDiscovery';
import { TeamDetail } from './routes/TeamDetail';
import { TeammateDiscovery } from './routes/TeammateDiscovery';
import { MyRequests } from './routes/MyRequests';
import { Profile } from './routes/Profile';
import { InviteRedeem } from './routes/InviteRedeem';
import { EngineeringEvidence } from './routes/EngineeringEvidence';
import { NotFound } from './routes/NotFound';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HackathonProvider>
          <Routes>
            {/* Public Marketing & Auth */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/invite" element={<InviteRedeem />} />
            <Route path="/engineering" element={<EngineeringEvidence />} />

            {/* Protected Application Routes */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/events/:id/teams"
              element={
                <ProtectedRoute>
                  <TeamDiscovery />
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/teams/:id"
              element={
                <ProtectedRoute>
                  <TeamDetail />
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/events/:id/teammates"
              element={
                <ProtectedRoute>
                  <TeammateDiscovery />
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/events/:id/my-requests"
              element={
                <ProtectedRoute>
                  <MyRequests />
                </ProtectedRoute>
              }
            />

            <Route
              path="/app/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            {/* Convenient aliases & redirects */}
            <Route path="/events/:id" element={<Navigate to="/app/events/:id/teams" replace />} />
            <Route path="/teams/:id" element={<Navigate to="/app/teams/:id" replace />} />

            {/* 404 Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HackathonProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
