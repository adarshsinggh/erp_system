import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  permissions?: string[];
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;

  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
  updateBranch: (branchId: string, branchName: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token, user) =>
        set({ token, user, isAuthenticated: true }),

      clearAuth: () =>
        set({ token: null, user: null, isAuthenticated: false }),

      updateBranch: (branchId, branchName) =>
        set((state) => ({
          user: state.user ? { ...state.user, branchId, branchName } : null,
        })),
    }),
    {
      name: 'erp-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
