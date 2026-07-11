import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { register } from '../auth.api';

export default function RegisterPage() {
  const { setUser, setToken } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const result = await register({ email, password, fullName, phone, dateOfBirth });
      setUser(result.user);
      setToken(result.accessToken);
      if (result.user?.role === 'PATIENT') navigate('/patient');
      else if (result.user?.role === 'DOCTOR') navigate('/doctor');
      else if (result.user?.role === 'ADMIN') navigate('/admin');
    } catch (err) {
      setError('Registration failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 p-6">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl p-10 ring-1 ring-slate-200">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-sky-600 flex items-center justify-center text-xl text-white font-bold">H</div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Create patient account</h1>
            <p className="text-sm text-slate-500">Register as a patient and book appointments instantly.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Full name</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Phone</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                required
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Date of birth</span>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                required
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-sm transition hover:bg-sky-700">Register</button>
          <div className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <button type="button" onClick={() => navigate('/login')} className="font-medium text-sky-600 hover:text-sky-700">
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
