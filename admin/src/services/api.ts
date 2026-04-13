import axios from 'axios';

// In dev: Vite proxies /api → backend (see vite.config.ts proxy).
// In production (Vercel): set VITE_API_URL env var on Vercel dashboard to the backend URL.
// Fallback: Cloudflare tunnel URL (trusted HTTPS, no cert warnings).
const API_BASE = import.meta.env.VITE_API_URL ?? 'https://beats-blank-senators-bunny.trycloudflare.com';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;
