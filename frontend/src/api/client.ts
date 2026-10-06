import axios from "axios";
import { supabase, supabaseEnabled } from "../lib/supabase";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// Attach Supabase JWT on every outgoing request (only when configured)
if (supabaseEnabled) {
  api.interceptors.request.use(async (config) => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      config.headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    return config;
  });
}

// Response interceptor — sign out on 401 so the UI shows the login screen
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!axios.isCancel(err)) {
      if (err?.response?.status === 401 && supabaseEnabled) {
        await supabase.auth.signOut();
      }
      console.error(
        "[API]",
        err?.config?.method?.toUpperCase(),
        err?.config?.url,
        "\u2192",
        err?.response?.status ?? "network error",
        err?.response?.data?.detail ?? err.message,
      );
    }
    return Promise.reject(err);
  },
);

export default api;
