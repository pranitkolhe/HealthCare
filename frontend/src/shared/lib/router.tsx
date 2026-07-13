import { createBrowserRouter, Navigate } from 'react-router-dom';
import LoginPage from '../../modules/auth/pages/LoginPage';
import RegisterPage from '../../modules/auth/pages/RegisterPage';
import PatientDashboardPage from '../../modules/patient/pages/PatientDashboardPage';
import DoctorDashboardPage from '../../modules/doctor/pages/DoctorDashboardPage';
import AdminDashboardPage from '../../modules/admin/pages/AdminDashboardPage';
import { useAuth } from '../../modules/auth/hooks/useAuth';

function ProtectedRoute({ roles, element }: { roles: string[]; element: JSX.Element }) {
  const { user, restoring } = useAuth();
  if (restoring) return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-medium text-slate-600">Restoring your secure session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return element;
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/patient', element: <Navigate to="/patient/discover" replace /> },
  { path: '/patient/:section', element: <ProtectedRoute roles={['PATIENT']} element={<PatientDashboardPage />} /> },
  { path: '/doctor', element: <Navigate to="/doctor/appointments" replace /> },
  { path: '/doctor/:section', element: <ProtectedRoute roles={['DOCTOR']} element={<DoctorDashboardPage />} /> },
  { path: '/admin', element: <Navigate to="/admin/doctors" replace /> },
  { path: '/admin/:section', element: <ProtectedRoute roles={['ADMIN']} element={<AdminDashboardPage />} /> },
]);
