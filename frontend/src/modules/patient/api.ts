import api from '../../shared/lib/api';

export type PatientProfile = { fullName: string; phone: string; dateOfBirth: string; gender?: string | null };

export function getPatientProfile() {
  return api.get('/patients/me').then((res) => res.data as { profile: PatientProfile });
}

export function updatePatientProfile(payload: Partial<Pick<PatientProfile, 'fullName' | 'phone' | 'dateOfBirth'>>) {
  return api.patch('/patients/me', payload).then((res) => res.data as { profile: PatientProfile });
}

export function listMyNotifications() {
  return api.get('/notifications/me').then((res) => res.data as { notifications: Array<{ id: string; type: string; status: string; createdAt: string; appointment?: { slotStart: string; doctor: { fullName: string } } | null }> });
}

export function connectGoogleCalendar() {
  return api.get('/calendar/oauth/connect').then((res) => res.data as { url: string });
}

export function searchDoctors(params: { specialization?: string; search?: string; page?: number; limit?: number }) {
  return api.get('/doctors', { params }).then((res) => res.data);
}

export function getDoctorAvailability(doctorId: string, date: string) {
  return api.get(`/doctors/${doctorId}/availability`, { params: { date } }).then((res) => res.data);
}

export function getDoctorSchedule(doctorId: string) {
  return api.get(`/doctors/${doctorId}/schedule`).then((res) => res.data as { workingHours: Array<{ dayOfWeek: number; startTime: string; endTime: string }>; leaves: Array<{ leaveDate: string; reason: string }> });
}

export function bookAppointment(payload: { doctorId: string; slotStart: string; symptoms: string }) {
  return api.post('/appointments', payload).then((res) => res.data);
}

export function cancelAppointment(appointmentId: string, reason?: string) {
  return api.delete(`/appointments/${appointmentId}`, { data: { reason } }).then((res) => res.data);
}

export function rescheduleAppointment(appointmentId: string, slotStart: string) {
  return api.patch(`/appointments/${appointmentId}/reschedule`, { slotStart }).then((res) => res.data);
}

export function listPatientAppointments(params: { status?: string; page?: number; limit?: number } = {}) {
  return api.get('/patients/me/appointments', { params }).then((res) => res.data);
}
