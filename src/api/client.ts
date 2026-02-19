const API_BASE = localStorage.getItem('apiUrl') || 'http://localhost:3001';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const response = await fetch(`${this.baseUrl}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  }

  // Health
  async healthCheck() {
    return this.request<{ status: string }>('GET', '/health');
  }

  async setupStatus() {
    return this.request<{ status: string; hasCompany: boolean; needsSetup: boolean }>('GET', '/health/setup-status');
  }

  // Company
  async setupCompany(data: unknown) {
    return this.request<{ success: boolean; data: unknown }>('POST', '/setup', data);
  }

  async listCompanies() {
    return this.request<{ success: boolean; data: unknown[] }>('GET', '/companies');
  }

  // Auth
  async login(username: string, password: string, companyId: string) {
    const result = await this.request<{ success: boolean; data: { token: string; user: unknown } }>(
      'POST', '/auth/login', { username, password, company_id: companyId }
    );
    if (result.data?.token) this.setToken(result.data.token);
    return result;
  }

  async verifyToken() {
    return this.request<{ success: boolean; data: unknown }>('POST', '/auth/verify');
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ success: boolean }>('POST', '/auth/change-password', {
      current_password: currentPassword, new_password: newPassword,
    });
  }
}

export const api = new ApiClient(API_BASE);
