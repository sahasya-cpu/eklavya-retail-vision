import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('eklavya_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('eklavya_token');
      localStorage.removeItem('eklavya_user');
    }
    return Promise.reject(err);
  }
);

export function getErrorMessage(err) {
  return err?.response?.data?.error || err?.message || 'Something went wrong. Please try again.';
}
