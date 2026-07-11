import { RouterProvider } from 'react-router-dom';
import { router } from './shared/lib/router';
import { AuthProvider } from './modules/auth/hooks/useAuth';

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
