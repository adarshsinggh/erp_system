import apiClient, { ApiResponse } from '../client';

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    full_name: string;
    email: string;
    role_id: string;
    role_name: string;
    company_id: string;
    company_name: string;
    branch_id: string;
    branch_name: string;
    permissions?: string[];
  };
}

export interface Company {
  id: string;
  name: string;
  display_name: string;
  license_tier: string;
}

export const authApi = {
  login: (username: string, password: string, company_id: string) =>
    apiClient.post<ApiResponse<LoginResponse>>('/auth/login', { username, password, company_id }),

  verify: () =>
    apiClient.post<ApiResponse<unknown>>('/auth/verify'),

  changePassword: (current_password: string, new_password: string) =>
    apiClient.post<ApiResponse<unknown>>('/auth/change-password', { current_password, new_password }),

  listCompanies: () =>
    apiClient.get<ApiResponse<Company[]>>('/companies'),

  setupStatus: () =>
    apiClient.get<{ status: string; hasCompany: boolean; needsSetup: boolean }>('/health/setup-status'),
};
