import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { changePassword, logout } from '../../auth/auth.api';
import { searchDoctors, getDoctorAvailability, getDoctorSchedule, bookAppointment, cancelAppointment, rescheduleAppointment, connectGoogleCalendar, getPatientProfile, listMyNotifications, listPatientAppointments, updatePatientProfile } from '../api';

type Doctor = { id: string; email: string; doctorProfile: { id: string; fullName: string; specialization: string; bio?: string } };

type Slot = { start: string; end: string };
type PatientAppointment = {
  id: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  prescription?: string | null;
  doctor: { id: string; fullName: string };
  postVisitSummary?: { status: string; patientFriendlyExplanation: string; followUpInstructions: string } | null;
  calendarEvent?: { syncStatus: string } | null;
};

const specialityCards = [
  { name: 'General Medicine', hint: 'Fever, cough, fatigue and everyday health concerns', icon: '🩺' },
  { name: 'Cardiology', hint: 'Heart health, chest discomfort and blood pressure', icon: '❤️' },
  { name: 'Dermatology', hint: 'Skin, hair and nail concerns', icon: '✨' },
  { name: 'Pediatrics', hint: 'Care for infants, children and teens', icon: '🧸' },
  { name: 'Orthopedics', hint: 'Bones, joints, movement and injuries', icon: '🦴' },
  { name: 'Neurology', hint: 'Headache, nerves and neurological care', icon: '🧠' },
];

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    return response?.data?.error?.message ?? fallback;
  }
  return fallback;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function PatientDashboardPage() {
  const [search, setSearch] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [searchParams, setSearchParams] = useState({ search: '', specialization: '' });
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [symptoms, setSymptoms] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileDateOfBirth, setProfileDateOfBirth] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSection = location.pathname.split('/')[2] || 'discover';
  const { setUser, setToken } = useAuth();

  const doctorsQuery = useQuery<{ doctors: Doctor[]; total: number; page: number; limit: number }>({
    queryKey: ['doctors', searchParams.specialization, searchParams.search],
    queryFn: () => searchDoctors({ specialization: searchParams.specialization, search: searchParams.search, limit: 10 }),
    enabled: true,
  });

  const availabilityQuery = useQuery<{ slots: Slot[] }>({
    queryKey: ['availability', selectedDoctor?.doctorProfile.id, selectedDate],
    queryFn: () => getDoctorAvailability(selectedDoctor!.doctorProfile.id, selectedDate),
    enabled: Boolean(selectedDoctor && selectedDate),
  });

  const scheduleQuery = useQuery({
    queryKey: ['doctorSchedule', selectedDoctor?.doctorProfile.id],
    queryFn: () => getDoctorSchedule(selectedDoctor!.doctorProfile.id),
    enabled: Boolean(selectedDoctor),
  });
  const appointmentsQuery = useQuery<{ appointments: PatientAppointment[] }>({
    queryKey: ['patientAppointments'],
    queryFn: () => listPatientAppointments({ status: 'BOOKED', limit: 10 }),
    // Avoid repeatedly issuing the same failing request and obscuring the
    // actual API error in the browser console.
    retry: false,
  });
  const rescheduleAppointmentData = appointmentsQuery.data?.appointments.find((appointment) => appointment.id === reschedulingId);
  const rescheduleSlotsQuery = useQuery<{ slots: Slot[] }>({
    queryKey: ['rescheduleAvailability', rescheduleAppointmentData?.doctor.id, rescheduleDate],
    queryFn: () => getDoctorAvailability(rescheduleAppointmentData!.doctor.id, rescheduleDate),
    enabled: Boolean(rescheduleAppointmentData && rescheduleDate),
  });

  const historyQuery = useQuery<{ appointments: PatientAppointment[] }>({
    queryKey: ['patientAppointmentHistory'],
    queryFn: () => listPatientAppointments({ limit: 50 }),
  });

  const profileQuery = useQuery({ queryKey: ['patientProfile'], queryFn: getPatientProfile });
  const notificationsQuery = useQuery({ queryKey: ['notifications'], queryFn: listMyNotifications });

  useEffect(() => {
    setMessage(null);
  }, [search, specialization, selectedDoctor, selectedDate]);

  useEffect(() => {
    const profile = profileQuery.data?.profile;
    if (!profile) return;
    setProfileName(profile.fullName);
    setProfilePhone(profile.phone);
    setProfileDateOfBirth(profile.dateOfBirth.slice(0, 10));
  }, [profileQuery.data]);

  async function handleLogout() {
    setUser(null); setToken(null); navigate('/login');
    void logout();
  }

  async function handleBook() {
    if (!selectedDoctor || !selectedSlot || !symptoms) {
      setMessage('Choose a doctor, slot, and enter your symptoms.');
      return;
    }

    try {
      await bookAppointment({ doctorId: selectedDoctor.doctorProfile.id, slotStart: selectedSlot.start, symptoms });
      setMessage('Appointment booked successfully.');
      queryClient.invalidateQueries({ queryKey: ['availability', selectedDoctor.doctorProfile.id, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['patientAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['patientAppointmentHistory'] });
      setSelectedSlot(null);
      setSymptoms('');
    } catch (error) {
      setMessage(getRequestErrorMessage(error, 'Booking failed. Please try again.'));
    }
  }

  async function handleCancel(appointmentId: string) {
    try {
      await cancelAppointment(appointmentId, 'Cancelled by patient');
      setMessage('Appointment cancelled.');
      queryClient.invalidateQueries({ queryKey: ['patientAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['patientAppointmentHistory'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    } catch (error) {
      setMessage(getRequestErrorMessage(error, 'Unable to cancel this appointment.'));
    }
  }

  async function handleReschedule(slotStart: string) {
    if (!reschedulingId) return;
    try {
      await rescheduleAppointment(reschedulingId, slotStart);
      setMessage('Appointment rescheduled. Your calendar will update automatically if it is connected.');
      setReschedulingId(null); setRescheduleDate('');
      queryClient.invalidateQueries({ queryKey: ['patientAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['patientAppointmentHistory'] });
    } catch (error) { setMessage(getRequestErrorMessage(error, 'Unable to reschedule this appointment.')); }
  }

  async function handleProfileSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updatePatientProfile({ fullName: profileName, phone: profilePhone, dateOfBirth: profileDateOfBirth });
      setMessage('Profile updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['patientProfile'] });
    } catch (error) {
      setMessage(getRequestErrorMessage(error, 'Unable to update profile.'));
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
      <header className="max-w-7xl mx-auto mb-6 rounded-3xl bg-white/95 p-4 shadow-sm ring-1 ring-slate-200 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-sky-600 flex items-center justify-center text-white font-bold">H</div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">HealthCare</h1>
            <p className="text-sm text-gray-500">Find doctors, manage appointments, and stay informed.</p>
          </div>
        </div>
        <button type="button" aria-label="Toggle navigation" onClick={() => setMenuOpen((open) => !open)} className="rounded-xl border p-2 text-xl lg:hidden">☰</button><div className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-2 lg:flex lg:w-auto lg:flex-row lg:items-center`}>
          {[['discover', 'Find doctors'], ['appointments', 'Appointments'], ['history', 'History'], ['notifications', 'Notifications']].map(([section, label]) => <Link key={section} to={`/patient/${section}`} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${activeSection === section ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</Link>)}
          <button type="button" onClick={handleCalendarConnect} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">Connect Calendar</button>
          <Link aria-label="Open profile" to="/patient/profile" className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold ${activeSection === 'profile' ? 'bg-sky-700 text-white ring-2 ring-sky-200' : 'bg-sky-100 text-sky-700'}`}>{profileName.slice(0, 1).toUpperCase() || 'P'}</Link>
          <button type="button" onClick={handleLogout} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Logout</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto space-y-6">
      {activeSection === 'notifications' && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">Notifications</h2>
          <div className="mt-2 space-y-1 text-sm text-amber-800">
            {notificationsQuery.data?.notifications.length ? notificationsQuery.data.notifications.map((notification) => <p key={notification.id}>{notification.type.replace(/_/g, ' ')}{notification.appointment ? ` — ${notification.appointment.doctor.fullName}, ${new Date(notification.appointment.slotStart).toLocaleString()}` : ''}</p>) : <p>No notifications yet.</p>}
          </div>
        </section>
      )}
      {activeSection === 'profile' && <section className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-xl font-semibold">Your profile</h2>
        <p className="mt-1 text-sm text-gray-500">Keep your contact details current for appointment updates.</p>
        <form onSubmit={handleProfileSave} className="mt-4 grid gap-4 sm:grid-cols-4">
          <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Full name" className="rounded-md border border-gray-200 px-4 py-3" required />
          <input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder="Phone" className="rounded-md border border-gray-200 px-4 py-3" required />
          <input type="date" value={profileDateOfBirth} onChange={(event) => setProfileDateOfBirth(event.target.value)} className="rounded-md border border-gray-200 px-4 py-3" required />
          <button type="submit" disabled={profileQuery.isLoading} className="rounded-md bg-slate-700 px-4 py-3 text-white hover:bg-slate-800 disabled:opacity-50">Save profile</button>
        </form>
        <form onSubmit={handlePasswordChange} className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="font-semibold">Password & security</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3"><input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className="rounded-md border border-gray-200 px-4 py-3" /><input required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (8+ chars, number)" className="rounded-md border border-gray-200 px-4 py-3" /><button className="rounded-md bg-sky-600 px-4 py-3 text-white hover:bg-sky-700">Update password</button></div>
        </form>
      </section>}
      {activeSection === 'discover' && <section id="discover-care" className="mb-8 bg-white rounded-2xl shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Find a doctor</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type a doctor name" className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm" />
          <select value="" onChange={(event) => setSearch(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm"><option value="">Choose a registered doctor</option>{doctorsQuery.data?.doctors.map((doctor) => <option key={doctor.id} value={doctor.doctorProfile.fullName}>Dr. {doctor.doctorProfile.fullName} — {doctor.doctorProfile.specialization}</option>)}</select>
          <select value={specialization} onChange={(event) => setSpecialization(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm"><option value="">All specializations</option>{Array.from(new Set(doctorsQuery.data?.doctors.map((doctor) => doctor.doctorProfile.specialization) ?? [])).map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <div className="flex items-center">
            <button
              onClick={() => setSearchParams({ search, specialization })}
              className="ml-auto rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-700"
            >
              Search
            </button>
          </div>
        </div>
        <div className="mt-6">
          {doctorsQuery.isLoading && <p>Loading doctors…</p>}
          {doctorsQuery.data?.doctors.length ? (
            <ul className="space-y-3">
              {doctorsQuery.data.doctors.map((doctor) => (
                <li key={doctor.id}>
                  <button
                    className={`w-full text-left cursor-pointer rounded-xl border p-4 flex items-center gap-4 ${selectedDoctor?.id === doctor.id ? 'border-sky-600 bg-sky-50' : 'border-gray-200'}`}
                    onClick={() => {
                      setSelectedDoctor(doctor);
                      setSelectedDate('');
                      setSelectedSlot(null);
                    }}
                  >
                    <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">Dr</div>
                    <div className="flex-1">
                      <div className="font-semibold">{doctor.doctorProfile.fullName}</div>
                      <div className="text-sm text-gray-600">{doctor.doctorProfile.specialization}</div>
                      <div className="text-sm text-gray-500">{doctor.doctorProfile.bio || 'No bio yet'}</div>
                    </div>
                    <div className="text-sm text-gray-400">View</div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">Enter a name or specialization to search.</p>
          )}
        </div>
      </section>}

      {activeSection === 'discover' && <section className="overflow-hidden rounded-2xl bg-slate-900 p-6 text-white shadow">
        <div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">Explore care by speciality</h2><p className="mt-1 text-sm text-slate-300">Select a card to see registered doctors for that speciality.</p></div><span className="text-xs text-sky-300">Swipe or use the moving cards</span></div>
        <div className="speciality-track mt-5 flex gap-4">
          {[...specialityCards, ...specialityCards].map((card, index) => <button key={`${card.name}-${index}`} type="button" onClick={() => { setSpecialization(card.name); setSearchParams({ search: '', specialization: card.name }); setSelectedDoctor(null); }} className="w-64 shrink-0 rounded-2xl bg-white/10 p-4 text-left transition hover:bg-white/20"><span className="text-2xl">{card.icon}</span><p className="mt-3 font-semibold">{card.name}</p><p className="mt-1 text-xs leading-5 text-slate-300">{card.hint}</p></button>)}
        </div>
      </section>}

      {activeSection === 'appointments' && <section id="upcoming-appointments" className="bg-white rounded-2xl shadow p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Your upcoming appointments</h2>
            <p className="text-sm text-gray-500">See booked appointments, calendar sync status, and summary progress.</p>
          </div>
        </div>
        <div className="mt-4">
          {appointmentsQuery.isLoading ? (
            <p>Loading your appointments…</p>
          ) : appointmentsQuery.isError ? (
            <p className="text-rose-600">{getRequestErrorMessage(appointmentsQuery.error, 'Unable to load your appointments. Please refresh the page.')}</p>
          ) : appointmentsQuery.data?.appointments.length ? (
            <div className="space-y-3">
              {appointmentsQuery.data.appointments.map((appointment) => (
                <div key={appointment.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{appointment.doctor.fullName}</p>
                      <p className="text-sm text-gray-500">{new Date(appointment.slotStart).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">{appointment.status}</span>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">{appointment.calendarEvent?.syncStatus ?? 'UNSYNCED'}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Post-visit summary</p>
                      <p className="mt-2 text-sm text-slate-700">{appointment.postVisitSummary ? `${appointment.postVisitSummary.status}` : 'Not generated yet'}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Details</p>
                      <p className="mt-2 text-sm text-slate-700">{appointment.postVisitSummary?.patientFriendlyExplanation ?? 'Waiting for visit'}</p>
                    </div>
                  </div>
                  {appointment.status === 'BOOKED' && (
                    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setReschedulingId(appointment.id); setRescheduleDate(''); }} className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50">Reschedule</button><button type="button" onClick={() => handleCancel(appointment.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Cancel appointment</button></div>
                  )}
                  {reschedulingId === appointment.id && <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="font-medium text-sky-950">Choose a new available slot</p><input type="date" min={today} value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} className="mt-3 rounded-lg border border-sky-200 px-3 py-2" />{rescheduleSlotsQuery.isLoading && <p className="mt-2 text-sm">Loading slots…</p>}<div className="mt-3 flex flex-wrap gap-2">{rescheduleSlotsQuery.data?.slots.map((slot) => <button key={slot.start} type="button" onClick={() => handleReschedule(slot.start)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700">{new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</button>)}</div><button type="button" onClick={() => setReschedulingId(null)} className="mt-3 text-sm text-slate-600 underline">Cancel</button></div>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No upcoming appointments found.</p>
          )}
        </div>
      </section>}

      {activeSection === 'history' && <section id="appointment-history" className="bg-white rounded-2xl shadow p-6">
        <div>
          <h2 className="text-xl font-semibold">Appointment history</h2>
          <p className="text-sm text-gray-500">Completed visits, patient-friendly summaries, prescriptions, and follow-up instructions.</p>
        </div>
        <div className="mt-4 space-y-4">
          {historyQuery.isLoading ? <p>Loading appointment history…</p> : historyQuery.data?.appointments.filter((appointment) => appointment.status !== 'BOOKED').length ? historyQuery.data.appointments.filter((appointment) => appointment.status !== 'BOOKED').map((appointment) => (
            <article key={appointment.id} className="rounded-2xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{appointment.doctor.fullName}</p><p className="text-sm text-gray-500">{new Date(appointment.slotStart).toLocaleString()}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{appointment.status}</span></div>
              {appointment.status === 'COMPLETED' ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visit summary</p><p className="mt-2 text-sm text-slate-700">{appointment.postVisitSummary?.patientFriendlyExplanation ?? 'Your doctor is preparing your summary.'}</p><p className="mt-2 text-xs text-slate-500">{appointment.postVisitSummary?.status === 'FAILED' ? 'AI summary unavailable — showing your doctor’s fallback instructions.' : appointment.postVisitSummary?.status ?? 'PENDING'}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prescription & follow-up</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{appointment.prescription || 'No prescription recorded.'}</p><p className="mt-2 text-sm text-slate-600">{appointment.postVisitSummary?.followUpInstructions ?? 'Follow your doctor’s instructions.'}</p></div></div> : <p className="mt-3 text-sm text-slate-600">This appointment was cancelled. No visit summary is available.</p>}
            </article>
          )) : <p className="text-gray-500">No completed or cancelled appointments yet.</p>}
        </div>
      </section>}

      {activeSection === 'discover' && selectedDoctor && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Book appointment"><section className="mx-auto min-h-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Select a slot for {selectedDoctor.doctorProfile.fullName}</h2><button type="button" onClick={() => { setSelectedDoctor(null); setSelectedSlot(null); }} className="rounded-lg border px-3 py-2 text-sm">Close</button></div>
          <div className="mb-6 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg border px-3 py-1">Previous</button>
              <h3 className="font-semibold">{calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3>
              <button type="button" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg border px-3 py-1">Next</button>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-slate-500">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }).map((_, index) => <span key={`empty-${index}`} />)}
              {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }).map((_, index) => {
                const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1);
                const value = toDateInputValue(date);
                const onLeave = scheduleQuery.data?.leaves.some((leave) => leave.leaveDate === value);
                const available = scheduleQuery.data?.workingHours.some((hour) => hour.dayOfWeek === date.getDay());
                const past = value < today;
                return <button key={value} type="button" disabled={!available || onLeave || past} onClick={() => { setSelectedDate(value); setSelectedSlot(null); }} className={`rounded-lg p-2 text-sm ${onLeave ? 'bg-rose-500 text-white' : available && !past ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-slate-100 text-slate-400'} ${selectedDate === value ? 'ring-2 ring-slate-800' : ''}`}>{index + 1}</button>;
              })}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-600"><span><i className="mr-1 inline-block h-3 w-3 rounded bg-sky-600" />Available</span><span><i className="mr-1 inline-block h-3 w-3 rounded bg-rose-500" />Doctor on leave</span></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              min={today}
              className="rounded-md border border-gray-200 px-4 py-3 shadow-sm"
            />
            <div />
            <div />
          </div>
          {availabilityQuery.isLoading && <p className="mt-4">Loading availability…</p>}
          {availabilityQuery.isError && <p className="mt-4 text-rose-600">{getRequestErrorMessage(availabilityQuery.error, 'Unable to load availability. Please choose another date.')}</p>}
          {availabilityQuery.data?.slots.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {availabilityQuery.data.slots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-xl border px-4 py-3 text-left ${selectedSlot?.start === slot.start ? 'border-sky-600 bg-sky-50' : 'border-gray-200'}`}
                >
                  <div className="font-medium">{new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="text-sm text-gray-500">{new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </button>
              ))}
            </div>
          ) : selectedDate ? (
            <p className="mt-4 text-gray-500">No available slots for this date. Choose a future date within this doctor’s working schedule.</p>
          ) : (
            <p className="mt-4 text-gray-500">Pick a date to see available slots.</p>
          )}

          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Confirm booking</h3>
            <textarea
              value={symptoms}
              onChange={(event) => setSymptoms(event.target.value)}
              placeholder="Describe your symptoms"
              className="w-full min-h-[120px] rounded-md border border-gray-200 px-3 py-2 shadow-sm"
            />
            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                onClick={handleBook}
                className="rounded-md bg-sky-600 px-5 py-3 text-white hover:bg-sky-700"
              >
                Book appointment
              </button>
              {message && <p className="text-sm text-gray-700">{message}</p>}
            </div>
          </div>
        </section></div>
      )}
      </div>
    </div>
  );
}
