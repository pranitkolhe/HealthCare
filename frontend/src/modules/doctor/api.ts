import api from '../../shared/lib/api';

type DoctorAppointmentsParams = {
  status?: string;
  date?: string;
  page?: number;
  limit?: number;
};

export function getDoctorAppointments(params: DoctorAppointmentsParams) {
  return api.get('/doctors/me/appointments', { params }).then((res) => res.data);
}

export type MedicationInput = { medicineName: string; dosage: string; frequency: string; durationDays: number };
export function addDoctorNotes(appointmentId: string, payload: { doctorNotes: string; prescription: string; medications?: MedicationInput[] }) {
  return api.post(`/doctors/me/appointments/${appointmentId}/notes`, payload).then((res) => res.data);
}

export function retryPreVisitSummary(appointmentId: string) {
  return api.post(`/doctors/me/appointments/${appointmentId}/pre-visit-summary/retry`).then((res) => res.data);
}

export function retryPostVisitSummary(appointmentId: string) {
  return api.post(`/doctors/me/appointments/${appointmentId}/post-visit-summary/retry`).then((res) => res.data);
}

export type WorkingHour = { dayOfWeek: number; startTime: string; endTime: string };

export function getDoctorProfile() {
  return api.get('/doctors/me/profile').then((res) => res.data as { profile: { fullName: string; specialization: string; bio?: string | null; workingHours: WorkingHour[]; leaves: Array<{ id: string; leaveDate: string; reason: string }> } });
}

export function updateDoctorProfile(payload: { bio?: string; workingHours?: WorkingHour[] }) {
  return api.patch('/doctors/me/profile', payload).then((res) => res.data);
}

export function addDoctorLeave(payload: { leaveDate: string; reason: string }) {
  return api.post('/doctors/me/leaves', payload).then((res) => res.data);
}

export function saveManualPostVisitSummary(appointmentId: string, payload: { patientFriendlyExplanation: string; followUpInstructions: string }) {
  return api.put(`/doctors/me/appointments/${appointmentId}/post-visit-summary`, payload).then((res) => res.data);
}

export function connectGoogleCalendar() {
  return api.get('/calendar/oauth/connect').then((res) => res.data as { url: string });
}
