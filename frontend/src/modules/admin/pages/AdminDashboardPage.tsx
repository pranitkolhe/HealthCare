import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { logout } from '../../auth/auth.api';
import { createDoctor, deactivateDoctor, DoctorRecord, listUsers, markDoctorLeave, updateDoctor, WorkingHour } from '../api';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const defaultHours: WorkingHour[] = [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }];

function requestError(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    return (error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? fallback;
  }
  return fallback;
}

function HoursEditor({ hours, onChange }: { hours: WorkingHour[]; onChange: (hours: WorkingHour[]) => void }) {
  return <div className="space-y-2">
    {hours.map((hour, index) => <div key={`${hour.dayOfWeek}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <select value={hour.dayOfWeek} onChange={(event) => onChange(hours.map((item, itemIndex) => itemIndex === index ? { ...item, dayOfWeek: Number(event.target.value) } : item))} className="rounded-xl border border-slate-200 px-3 py-2">{weekdays.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select>
      <input type="time" value={hour.startTime} onChange={(event) => onChange(hours.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: event.target.value } : item))} className="rounded-xl border border-slate-200 px-3 py-2" />
      <input type="time" value={hour.endTime} onChange={(event) => onChange(hours.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: event.target.value } : item))} className="rounded-xl border border-slate-200 px-3 py-2" />
      <button type="button" disabled={hours.length === 1} onClick={() => onChange(hours.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-40">Remove</button>
    </div>)}
    <button type="button" disabled={hours.length === 7} onClick={() => onChange([...hours, { dayOfWeek: 0, startTime: '09:00', endTime: '17:00' }])} className="rounded-xl border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 disabled:opacity-40">Add working day</button>
  </div>;
}

export default function AdminDashboardPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [specialization, setSpecialization] = useState('General Medicine');
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>(defaultHours);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorRecord | null>(null);
  const [editSpecialization, setEditSpecialization] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editDuration, setEditDuration] = useState(30);
  const [editHours, setEditHours] = useState<WorkingHour[]>(defaultHours);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { setUser, setToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSection = location.pathname.split('/')[2] || 'doctors';
  const queryClient = useQueryClient();
  const doctorsQuery = useQuery({ queryKey: ['adminDoctors'], queryFn: () => listUsers('DOCTOR', 1, 100) });

  function refreshDoctors() { return queryClient.invalidateQueries({ queryKey: ['adminDoctors'] }); }
  function openDoctor(doctor: DoctorRecord) {
    if (!doctor.doctorProfile) return;
    setSelectedDoctor(doctor);
    setEditSpecialization(doctor.doctorProfile.specialization);
    setEditBio(doctor.doctorProfile.bio ?? '');
    setEditDuration(doctor.doctorProfile.slotDurationMinutes);
    setEditHours(doctor.doctorProfile.workingHours);
    setLeaveDate('');
    setLeaveReason('');
  }

  async function handleLogout() { setUser(null); setToken(null); navigate('/login'); void logout(); }
  async function handleCreateDoctor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await createDoctor({ email, fullName, specialization, slotDurationMinutes, workingHours });
      setMessage("Doctor created. Temporary password send to the doctors email address");
      setEmail(''); setFullName(''); setSpecialization('General Medicine'); setSlotDurationMinutes(30); setWorkingHours(defaultHours);
      refreshDoctors();
    } catch (error) { setMessage(requestError(error, 'Unable to create doctor.')); }
  }
  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDoctor?.doctorProfile) return;
    try {
      await updateDoctor(selectedDoctor.doctorProfile.id, { specialization: editSpecialization, bio: editBio, slotDurationMinutes: editDuration, workingHours: editHours });
      setMessage('Doctor details and availability updated.');
      refreshDoctors();
    } catch (error) { setMessage(requestError(error, 'Unable to update doctor.')); }
  }
  async function handleLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDoctor?.doctorProfile) return;
    try {
      const result = await markDoctorLeave(selectedDoctor.doctorProfile.id, { leaveDate, reason: leaveReason });
      setMessage(`Leave saved. ${result.cancelledAppointments} patient appointment(s) were cancelled and notified.`);
      setLeaveDate(''); setLeaveReason(''); refreshDoctors();
    } catch (error) { setMessage(requestError(error, 'Unable to mark leave.')); }
  }
  async function handleDeactivate() {
    if (!selectedDoctor?.doctorProfile || !window.confirm(`Deactivate ${selectedDoctor.doctorProfile.fullName}?`)) return;
    try {
      const result = await deactivateDoctor(selectedDoctor.doctorProfile.id);
      setMessage(`Doctor deactivated. ${result.cancelledFutureAppointments} future appointment(s) cancelled.`);
      setSelectedDoctor(null); refreshDoctors();
    } catch (error) { setMessage(requestError(error, 'Unable to deactivate doctor.')); }
  }

  return <div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-slate-900 to-sky-900 p-8 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-sky-200">Healthcare operations</p><h1 className="mt-1 text-3xl font-semibold">Admin control center</h1><p className="mt-2 text-slate-200">Manage doctors, availability, leave, and patient-impacting schedule changes.</p></div><div className="flex flex-wrap items-center gap-2"><Link to="/admin/doctors" className={`rounded-xl px-4 py-2 text-sm font-medium ${activeSection === 'doctors' ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>Doctors</Link><Link to="/admin/create" className={`rounded-xl px-4 py-2 text-sm font-medium ${activeSection === 'create' ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>Create doctor</Link><button type="button" onClick={handleLogout} className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Logout</button></div></header>
    {message && <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">{message}</div>}
    <div className="grid gap-6">
      {activeSection === 'doctors' && <section className="rounded-3xl bg-white p-7 shadow-sm">
        <div className="flex items-center justify-between"><div><h2 className="text-2xl font-semibold">Doctors</h2><p className="text-sm text-slate-500">{doctorsQuery.data?.total ?? 0} doctor account(s)</p></div></div>
        <div className="mt-5 space-y-3">
          {doctorsQuery.isLoading ? <p>Loading doctors…</p> : doctorsQuery.data?.users.length ? doctorsQuery.data.users.map((doctor) => {
            if (!doctor.doctorProfile) return null;
            return <button key={doctor.id} type="button" onClick={() => openDoctor(doctor)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedDoctor?.id === doctor.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-sky-300'}`}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{doctor.doctorProfile.fullName}</p><p className="text-sm text-slate-600">{doctor.doctorProfile.specialization} · {doctor.email}</p><p className="mt-2 text-xs text-slate-500">{doctor.doctorProfile.workingHours.map((hour) => `${weekdays[hour.dayOfWeek]} ${hour.startTime}–${hour.endTime}`).join(' · ') || 'No availability set'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${doctor.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{doctor.isActive ? 'Active' : 'Inactive'}</span></div>
            </button>;
          }) : <p className="text-slate-500">No doctors found.</p>}
        </div>
      </section>}
      {activeSection === 'create' && <section className="rounded-3xl bg-white p-7 shadow-sm"><h2 className="text-2xl font-semibold">Create doctor</h2><p className="mt-1 text-sm text-slate-500">Set a complete weekly schedule so patients can book correctly.</p><form onSubmit={handleCreateDoctor} className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Full name" className="rounded-xl border border-slate-200 px-4 py-3" required /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="rounded-xl border border-slate-200 px-4 py-3" required /></div><div className="grid gap-4 sm:grid-cols-2"><input value={specialization} onChange={(event) => setSpecialization(event.target.value)} placeholder="Specialization" className="rounded-xl border border-slate-200 px-4 py-3" required /><select value={slotDurationMinutes} onChange={(event) => setSlotDurationMinutes(Number(event.target.value))} className="rounded-xl border border-slate-200 px-4 py-3">{[15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></div><HoursEditor hours={workingHours} onChange={setWorkingHours} /><button className="rounded-xl bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-700">Create doctor</button></form></section>}
    </div>
    {activeSection === 'doctors' && selectedDoctor?.doctorProfile && <section className="rounded-3xl bg-white p-7 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-sky-700">Managing doctor</p><h2 className="text-2xl font-semibold">{selectedDoctor.doctorProfile.fullName}</h2><p className="text-sm text-slate-500">{selectedDoctor.email}</p></div><button type="button" onClick={handleDeactivate} disabled={!selectedDoctor.isActive} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-40">Deactivate doctor</button></div><div className="mt-6 grid gap-8 lg:grid-cols-2"><form onSubmit={handleUpdate} className="space-y-4"><h3 className="font-semibold">Edit details & availability</h3><input value={editSpecialization} onChange={(event) => setEditSpecialization(event.target.value)} placeholder="Specialization" className="w-full rounded-xl border border-slate-200 px-4 py-3" required /><textarea value={editBio} onChange={(event) => setEditBio(event.target.value)} placeholder="Professional bio" rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3" /><select value={editDuration} onChange={(event) => setEditDuration(Number(event.target.value))} className="rounded-xl border border-slate-200 px-4 py-3">{[15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minute slots</option>)}</select><HoursEditor hours={editHours} onChange={setEditHours} /><button className="rounded-xl bg-sky-600 px-5 py-3 text-white">Save doctor changes</button></form><div><form onSubmit={handleLeave} className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-semibold text-amber-900">Mark doctor leave</h3><p className="mt-1 text-sm text-amber-800">Existing booked patients on this day are cancelled and notified.</p><div className="mt-4 grid gap-3"><input required type="date" value={leaveDate} onChange={(event) => setLeaveDate(event.target.value)} className="rounded-xl border border-amber-200 px-4 py-3" /><input required value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} placeholder="Reason for leave" className="rounded-xl border border-amber-200 px-4 py-3" /><button className="rounded-xl bg-amber-600 px-5 py-3 text-white">Save leave & notify patients</button></div></form><div className="mt-4"><h3 className="font-semibold">Upcoming leave</h3>{selectedDoctor.doctorProfile.leaves.length ? <ul className="mt-2 space-y-2">{selectedDoctor.doctorProfile.leaves.map((leave) => <li key={leave.id} className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{new Date(leave.leaveDate).toLocaleDateString()} — {leave.reason}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No upcoming leave dates.</p>}</div></div></div></section>}
  </div></div>;
}
