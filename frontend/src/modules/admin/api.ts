import api from '../../shared/lib/api';

export type CreateDoctorPayload = {
  email: string;
  fullName: string;
  specialization: string;
  slotDurationMinutes: number;
  workingHours: { dayOfWeek: number; startTime: string; endTime: string }[];
};

export type WorkingHour = { dayOfWeek: number; startTime: string; endTime: string };
export type DoctorRecord = {
  id: string;
  email: string;
  isActive: boolean;
  doctorProfile: { id: string; fullName: string; specialization: string; bio?: string | null; slotDurationMinutes: number; workingHours: WorkingHour[]; leaves: Array<{ id: string; leaveDate: string; reason: string }> } | null;
};

export async function createDoctor(payload: CreateDoctorPayload) {
  const response = await api.post('/admin/doctors', payload);
  return response.data;
}

export async function listUsers(role?: string, page = 1, limit = 20) {
  const response = await api.get('/admin/users', { params: { role, page, limit } });
  return response.data as { users: DoctorRecord[]; total: number; page: number; limit: number };
}

export function updateDoctor(doctorId: string, payload: { specialization?: string; bio?: string; slotDurationMinutes?: number; workingHours?: WorkingHour[] }) {
  return api.patch(`/admin/doctors/${doctorId}`, payload).then((res) => res.data);
}

export function markDoctorLeave(doctorId: string, payload: { leaveDate: string; reason: string }) {
  return api.post(`/admin/doctors/${doctorId}/leave`, payload).then((res) => res.data as { cancelledAppointments: number });
}

export function deactivateDoctor(doctorId: string) {
  return api.delete(`/admin/doctors/${doctorId}`).then((res) => res.data as { cancelledFutureAppointments: number });
}
