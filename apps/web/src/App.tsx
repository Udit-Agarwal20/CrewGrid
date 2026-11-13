import { Routes, Route, Navigate, useParams } from 'react-router';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { HackathonProvider, useHackathon } from './context/HackathonContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { isValidObjectId } from './utils/validation';

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

function EventRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/app/events/${id}/teams`} replace />;
}

function TeamRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/app/teams/${id}`} replace />;
}

function EventsIndexRedirect() {
  const { activeHackathon, hackathons, isLoading } = useHackathon();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0B1020] text-[#9BF5CC]">
        Loading hackathon...
      </div>
    );
  }
  const targetId = activeHackathon?.id || (hackathons.length > 0 ? hackathons[0].id : null);
  if (targetId && isValidObjectId(targetId)) {
    return <Navigate to={`/app/events/${targetId}/teams`} replace />;
  }
  return <Navigate to="/app" replace />;
}

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
              path="/app/events"
              element={
                <ProtectedRoute>
                  <EventsIndexRedirect />
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
            <Route path="/events" element={<EventsIndexRedirect />} />
            <Route path="/events/:id" element={<EventRedirect />} />
            <Route path="/teams/:id" element={<TeamRedirect />} />

            {/* 404 Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HackathonProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
