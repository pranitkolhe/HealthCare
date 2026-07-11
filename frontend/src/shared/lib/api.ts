import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

let accessToken: string | null = null;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/**
 * The access token is deliberately kept outside React so Axios can renew it
 * before any protected request is retried.
 */
function clearExpiredSession() {
  accessToken = null;
  delete api.defaults.headers.common.Authorization;
  window.dispatchEvent(new Event('auth:expired'));
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequestConfig | undefined;
    const isRefreshRequest = request?.url?.includes('/auth/refresh');

    if (error.response?.status !== 401 || !request || request._retry || isRefreshRequest) {
      return Promise.reject(error);
    }

    request._retry = true;
    try {
      const response = await api.post('/auth/refresh');
      const token = response.data.accessToken as string;
      setAccessToken(token);
      request.headers = request.headers ?? {};
      request.headers.Authorization = `Bearer ${token}`;
      return api(request);
    } catch (refreshError) {
      clearExpiredSession();
      return Promise.reject(refreshError);
    }
  }
);

export default api;
