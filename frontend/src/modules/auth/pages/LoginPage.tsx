import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { login } from '../auth.api';

export default function LoginPage() {
  const { setUser, setToken } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const result = await login(email, password);
      setUser(result.user);
      setToken(result.accessToken);
      // Navigate based on role
      if (result.user?.role === 'PATIENT') navigate('/patient');
      else if (result.user?.role === 'DOCTOR') navigate('/doctor');
      else if (result.user?.role === 'ADMIN') navigate('/admin');
    } catch (err) {
      setError('Login failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-slate-100 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-10 ring-1 ring-slate-200">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-sky-600 flex items-center justify-center text-xl text-white font-bold">H</div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-slate-500">Login to your healthcare dashboard.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-sm transition hover:bg-sky-700">
            Sign in
          </button>
          <div className="text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <button type="button" onClick={() => navigate('/register')} className="font-medium text-sky-600 hover:text-sky-700">
              Create one
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
