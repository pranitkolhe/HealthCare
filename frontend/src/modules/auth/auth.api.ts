import api from "../../shared/lib/api";

export async function login(email: string, password: string) {
  const response = await api.post("/auth/login", { email, password });
  return response.data;
}

export async function register(payload: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
}) {
  const response = await api.post("/auth/register", payload);
  return response.data;
}

export async function logout() {
  const response = await api.post("/auth/logout");
  return response.data;
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  await api.post("/auth/change-password", payload);
}
