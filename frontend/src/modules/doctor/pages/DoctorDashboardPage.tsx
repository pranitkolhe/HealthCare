import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { changePassword, logout } from '../../auth/auth.api';
import { addDoctorNotes, connectGoogleCalendar, getDoctorAppointments, getDoctorProfile, retryPreVisitSummary, retryPostVisitSummary, saveManualPostVisitSummary, updateDoctorProfile } from '../api';

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    return response?.data?.error?.message ?? fallback;
  }
  return fallback;
}

export default function DoctorDashboardPage() {
  const { user, setUser, setToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSection = location.pathname.split('/')[2] || 'appointments';
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('BOOKED');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [prescription, setPrescription] = useState('');
  const [medicineName, setMedicineName] = useState('');
  const [medicineDosage, setMedicineDosage] = useState('');
  const [medicineFrequency, setMedicineFrequency] = useState('Once daily');
  const [medicineDurationDays, setMedicineDurationDays] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [manualExplanation, setManualExplanation] = useState('');
  const [manualFollowUp, setManualFollowUp] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['doctorProfile'], queryFn: getDoctorProfile });

  useEffect(() => {
    const profile = profileQuery.data?.profile;
    if (!profile) return;
    setBio(profile.bio ?? '');
  }, [profileQuery.data]);

  useEffect(() => {
    async function loadAppointments() {
      try {
        const result = await getDoctorAppointments({ status, date });
        setAppointments(result.appointments);
      } catch (error) {
        setMessage('Unable to load appointments.');
      }
    }
    loadAppointments();
  }, [status, date]);

  async function handleLogout() {
    setUser(null); setToken(null); navigate('/login');
    void logout();
  }

  async function handleSubmitNotes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAppointment) return;

    try {
      const medications = medicineName || medicineDosage || medicineDurationDays ? [{ medicineName, dosage: medicineDosage, frequency: medicineFrequency, durationDays: Number(medicineDurationDays) }] : [];
      await addDoctorNotes(selectedAppointment.id, { doctorNotes: notes, prescription, medications });
      setMessage('Visit marked completed. Notes saved and post-visit summary generation started.');
      setNotes('');
      setPrescription('');
      setSelectedAppointment((current: any | null) => current ? { ...current, status: 'COMPLETED', doctorNotes: notes, prescription } : current);
      setAppointments((current) => current.map((appointment) => appointment.id === selectedAppointment.id ? { ...appointment, status: 'COMPLETED', doctorNotes: notes, prescription } : appointment));
    } catch (error) {
      setMessage(getRequestErrorMessage(error, 'Failed to save notes.'));
    }
  }

  async function handleSummaryRetry(kind: 'pre' | 'post') {
    if (!selectedAppointment) return;
    try {
      if (kind === 'pre') {
        await retryPreVisitSummary(selectedAppointment.id);
      } else {
        await retryPostVisitSummary(selectedAppointment.id);
      }
      setMessage(`${kind === 'pre' ? 'Pre-visit' : 'Post-visit'} summary generation has started. Refresh shortly to see the result.`);
    } catch {
      setMessage('Unable to start summary generation. Check the Gemini configuration and try again.');
    }
  }

  async function handleProfileSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateDoctorProfile({ bio });
      setMessage('Profile bio updated.');
      queryClient.invalidateQueries({ queryKey: ['doctorProfile'] });
    } catch (error) {
      setMessage(getRequestErrorMessage(error, 'Unable to update availability.'));
    }
  }

  async function handleManualSummary(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAppointment) return;
    try {
      const result = await saveManualPostVisitSummary(selectedAppointment.id, { patientFriendlyExplanation: manualExplanation, followUpInstructions: manualFollowUp });
      setSelectedAppointment((current: any | null) => current ? { ...current, postVisitSummary: result.summary } : current);
      setMessage('Manual patient summary published.');
    } catch (error) {
      setMessage(getRequestErrorMessage(error, 'Unable to save manual summary.'));
    }
  }

  async function handleCalendarConnect() {
    try {
      const { url } = await connectGoogleCalendar();
      window.location.assign(url);
    } catch (error) {
      setMessage(getRequestErrorMessage(error, 'Unable to start Google Calendar connection.'));
    }
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await changePassword({ currentPassword, newPassword });
      setMessage('Password updated. Please sign in again.');
      setUser(null); setToken(null); navigate('/login');
    } catch (error) {
      setMessage(getRequestErrorMessage(error, 'Unable to update password.'));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="rounded-3xl bg-white p-8 shadow-sm flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">HealthCare</h1>
            <p className="mt-2 text-gray-600">Your clinical workspace for appointments and follow-up care.</p>
          </div>
          <button type="button" aria-label="Toggle navigation" onClick={() => setMenuOpen((open) => !open)} className="rounded-xl border p-2 text-xl sm:hidden">☰</button><div className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center`}>
            <Link to="/doctor/appointments" className={`rounded-xl px-3 py-2 text-sm font-medium ${activeSection === 'appointments' ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>Appointments</Link>
            <Link to="/doctor/profile" className={`rounded-xl px-3 py-2 text-sm font-medium ${activeSection === 'profile' ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>Profile</Link>
            <button type="button" onClick={handleCalendarConnect} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">Connect Google Calendar</button>
            <Link aria-label="Open profile" title={user?.email} to="/doctor/profile" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 font-semibold text-white ring-2 ring-sky-100">{user?.email?.slice(0, 1).toUpperCase() ?? 'D'}</Link>
            <button type="button" onClick={handleLogout} className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">Logout</button>
          </div>
        </header>
        {activeSection === 'profile' && (
          <section className="rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold">Doctor profile</h2><p className="mt-1 text-sm text-slate-500">Signed in as {user?.email}</p>
            <p className="mt-1 text-sm text-slate-500">Your bio appears on the patient doctor directory.</p>
            <form onSubmit={handleProfileSave} className="mt-5 space-y-4">
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Professional bio" rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3" />
              <button type="submit" className="rounded-xl bg-sky-600 px-4 py-2 text-sm text-white">Save bio</button>
            </form>
            <form onSubmit={handlePasswordChange} className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="font-semibold">Security</h3>
              <p className="mt-1 text-sm text-slate-500">Change the temporary password sent by the administrator.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3"><input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className="rounded-xl border border-slate-200 px-3 py-2" /><input required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (8+ chars, number)" className="rounded-xl border border-slate-200 px-3 py-2" /><button className="rounded-xl bg-slate-700 px-4 py-2 text-white">Update password</button></div>
            </form>
          </section>
        )}

        {activeSection === 'appointments' && <section id="doctor-appointments" className="rounded-3xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-4 sm:grid-cols-2 flex-1">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Filter by status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <option value="">All statuses</option>
                  <option value="BOOKED">Booked</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="NO_SHOW">No show</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Filter by date</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
              </label>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {appointments.length === 0 ? (
              <p className="text-slate-500">No appointments found for the selected filter.</p>
            ) : (
              <div className="space-y-4">
                {appointments.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => {
                      setSelectedAppointment(appointment);
                      setNotes(appointment.doctorNotes || '');
                      setPrescription(appointment.prescription || '');
                    }}
                    className="w-full rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-sky-500 hover:bg-sky-50"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold">{appointment.patient?.fullName || 'Unknown patient'}</p>
                        <p className="text-sm text-slate-600">{new Date(appointment.slotStart).toLocaleString()}</p>
                      </div>
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-sm text-sky-700">{appointment.status}</span>
                    </div>
                    <p className="mt-2 text-slate-500">Symptoms: {appointment.symptoms}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>}

        {activeSection === 'appointments' && selectedAppointment && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Patient appointment details">
          <section className="mx-auto min-h-full max-w-5xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-sky-700">Patient consultation</p><h2 className="text-2xl font-semibold">Appointment details</h2></div><button type="button" onClick={() => setSelectedAppointment(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">← Back to appointments</button></div>
            <div className="grid gap-4 sm:grid-cols-2 mb-6">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Patient</p>
                <p className="mt-2 text-slate-500">{selectedAppointment.patient?.fullName}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Appointment</p>
                <p className="mt-2 text-slate-500">{new Date(selectedAppointment.slotStart).toLocaleString()}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Pre-visit summary</p>
                <p className="mt-2 text-sm text-slate-700">{selectedAppointment.preVisitSummary?.status ?? 'Missing'}</p>
                {selectedAppointment.preVisitSummary?.urgency && <p className="mt-1 text-sm text-amber-700">Urgency: {selectedAppointment.preVisitSummary.urgency}</p>}
                {selectedAppointment.preVisitSummary?.chiefComplaint && <p className="mt-1 text-sm text-slate-700">{selectedAppointment.preVisitSummary.chiefComplaint}</p>}
                {selectedAppointment.preVisitSummary?.suggestedQuestions && (
                  <div className="mt-2 text-xs text-slate-500">
                    {Array.isArray(selectedAppointment.preVisitSummary.suggestedQuestions)
                      ? selectedAppointment.preVisitSummary.suggestedQuestions.join(', ')
                      : String(selectedAppointment.preVisitSummary.suggestedQuestions)}
                  </div>
                )}
                {selectedAppointment.preVisitSummary?.status === 'FAILED' && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    AI intake summary is unavailable. Use the patient’s reported symptoms: {selectedAppointment.symptoms || 'No symptoms recorded.'}
                  </div>
                )}
                {selectedAppointment.preVisitSummary?.status === 'FAILED' && <button type="button" onClick={() => handleSummaryRetry('pre')} className="mt-3 rounded-lg border border-sky-200 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50">Retry AI intake summary</button>}
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Calendar sync</p>
                <p className="mt-2 text-slate-700">{selectedAppointment.calendarEvent?.syncStatus ?? 'Pending'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-700">Post-visit summary</p>
                  {selectedAppointment.doctorNotes ? <button type="button" onClick={() => handleSummaryRetry('post')} className="rounded-lg border border-sky-200 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50">Retry AI summary</button> : null}
                </div>
                <p className="mt-2 text-sm text-slate-700">{selectedAppointment.postVisitSummary?.status ?? (selectedAppointment.doctorNotes ? 'Ready to generate after notes are saved.' : 'Save visit notes first, then generate or publish a manual summary.')}</p>
                {selectedAppointment.postVisitSummary?.patientFriendlyExplanation && <p className="mt-2 text-sm text-slate-600">{selectedAppointment.postVisitSummary.patientFriendlyExplanation}</p>}
                {selectedAppointment.postVisitSummary?.status === 'FAILED' && <p className="mt-2 text-xs text-amber-700">AI is unavailable. Use the manual patient summary below after saving notes.</p>}
              </div>
            </div>
            {new Date(selectedAppointment.slotStart).getTime() > Date.now() ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                This appointment is scheduled for {new Date(selectedAppointment.slotStart).toLocaleString()}. You can review the intake summary now; notes, marking the visit completed, and the manual patient summary unlock at the scheduled time.
              </div>
            ) : null}
            <fieldset disabled={new Date(selectedAppointment.slotStart).getTime() > Date.now()} className="disabled:opacity-50">
            <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
              <p className="font-semibold">Visit workflow</p>
              <p className="mt-1">1. Record notes and prescription. 2. Save to mark the visit completed. 3. Review the AI summary or publish a manual patient summary.</p>
            </div>
            <h3 className="text-xl font-semibold mb-4">1. Record visit notes</h3>
            <form onSubmit={handleSubmitNotes} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Doctor notes</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Prescription</span>
                <textarea value={prescription} onChange={(event) => setPrescription(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
              </label>
              <fieldset className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><legend className="px-1 text-sm font-semibold text-emerald-900">Medication reminder (optional)</legend><p className="mb-3 text-xs text-emerald-800">Add this only when the patient needs a daily email reminder after the visit.</p><div className="grid gap-2 sm:grid-cols-4"><input value={medicineName} onChange={(event) => setMedicineName(event.target.value)} placeholder="Medicine name" className="rounded-xl border border-emerald-200 px-3 py-2" /><input value={medicineDosage} onChange={(event) => setMedicineDosage(event.target.value)} placeholder="Dosage" className="rounded-xl border border-emerald-200 px-3 py-2" /><select value={medicineFrequency} onChange={(event) => setMedicineFrequency(event.target.value)} className="rounded-xl border border-emerald-200 px-3 py-2"><option>Once daily</option><option>Twice daily</option><option>Three times daily</option></select><input type="number" min="1" value={medicineDurationDays} onChange={(event) => setMedicineDurationDays(event.target.value)} placeholder="Days" className="rounded-xl border border-emerald-200 px-3 py-2" /></div></fieldset>
              <div className="flex items-center gap-4">
                <button type="submit" className="rounded-2xl bg-sky-600 px-6 py-3 text-white hover:bg-sky-700">Save notes & mark visit completed</button>
                {message && <p className="text-sm text-slate-700">{message}</p>}
              </div>
            </form>
            {selectedAppointment.doctorNotes && <form onSubmit={handleManualSummary} className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold">3. Manual patient summary</h3>
              <p className="text-sm text-slate-500">Use this when AI generation is unavailable. This is published to the patient immediately.</p>
              <textarea required value={manualExplanation} onChange={(event) => setManualExplanation(event.target.value)} rows={3} placeholder="Plain-language explanation" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              <textarea required value={manualFollowUp} onChange={(event) => setManualFollowUp(event.target.value)} rows={2} placeholder="Follow-up instructions" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              <button className="rounded-xl bg-slate-700 px-4 py-2 text-sm text-white">Publish manual summary</button>
            </form>}
            </fieldset>
          </section></div>
        )}
      </div>
    </div>
  );
}
