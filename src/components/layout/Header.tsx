import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useClickOutside } from '../../hooks';

export function Header() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const { setCommandPaletteOpen } = useUIStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setUserMenuOpen(false));

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      {/* Breadcrumb / Context */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">
          {user?.branchName || 'Main Branch'}
        </span>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Command Palette Trigger */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search
          <kbd>⌘K</kbd>
        </button>

        {/* Notifications Bell */}
        <button
          onClick={() => navigate('/system/notifications')}
          className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {/* Notification dot */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
              {user?.fullName?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-medium text-gray-900">{user?.fullName || 'User'}</div>
              <div className="text-2xs text-gray-500">{user?.roleName || 'Role'}</div>
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 animate-fade-in">
              <div className="px-4 py-2 border-b border-gray-100">
                <div className="text-sm font-medium text-gray-900">{user?.fullName}</div>
                <div className="text-xs text-gray-500">{user?.email}</div>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
              >
                Settings
              </button>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/system/shortcuts'); }}
                className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
              >
                Keyboard Shortcuts
              </button>
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50"
                >
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
