import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// ── Auth key (in-memory only — cleared on page refresh) ──────────────────────

let _authKey: string | null = null;

export function setAuthKey(key: string) {
  _authKey = key;
}

export function clearAuthKey() {
  _authKey = null;
}

// Attach X-SwingIQ-Key on every outgoing request when set
api.interceptors.request.use((config) => {
  if (_authKey) {
    config.headers["X-SwingIQ-Key"] = _authKey;
  }
  return config;
});

// Response interceptor — broadcast 401 so the UI can show the gate
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!axios.isCancel(err)) {
      if (err?.response?.status === 401) {
        clearAuthKey();
        window.dispatchEvent(new Event("swingiq:auth-required"));
      }
      console.error(
        "[API]",
        err?.config?.method?.toUpperCase(),
        err?.config?.url,
        "→",
        err?.response?.status ?? "network error",
        err?.response?.data?.detail ?? err.message,
      );
    }
    return Promise.reject(err);
  },
);

export default api;
