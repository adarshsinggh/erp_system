import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_BASE = localStorage.getItem('apiUrl') || 'http://localhost:3001';

// ─── Axios Instance ──────────────────────────────────────────────
const http: AxiosInstance = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request Interceptor: Attach JWT ─────────────────────────────
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response Interceptor: Handle 401 & Errors ───────────────────
http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; message?: string }>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    }
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

// ─── Typed API Helpers ───────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  [key: string]: unknown;
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await http.get<T>(url, { params });
  return data;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.post<T>(url, body);
  return data;
}

async function put<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.put<T>(url, body);
  return data;
}

async function patch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.patch<T>(url, body);
  return data;
}

async function del<T>(url: string): Promise<T> {
  const { data } = await http.delete<T>(url);
  return data;
}

export const apiClient = { get, post, put, patch, del, http };
export default apiClient;
