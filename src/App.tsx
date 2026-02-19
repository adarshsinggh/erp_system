import React, { useEffect, useState } from 'react';

type AppState = 'connecting' | 'setup' | 'login' | 'app';

function App() {
  const [state, setState] = useState<AppState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [apiUrl] = useState(
    localStorage.getItem('apiUrl') || 'http://localhost:3001'
  );

  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    try {
      const res = await fetch(`${apiUrl}/api/health/setup-status`);
      const data = await res.json();
      if (data.needsSetup) {
        setState('setup');
      } else {
        setState('login');
      }
    } catch {
      setError('Cannot connect to server. Make sure the main machine is running.');
    }
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Manufacturing ERP</h1>
          <p style={styles.error}>{error}</p>
          <button style={styles.button} onClick={() => { setError(null); checkConnection(); }}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (state === 'connecting') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Manufacturing ERP</h1>
          <p>Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (state === 'setup') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Manufacturing ERP</h1>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Welcome! Let's set up your company.</h2>
          <p style={{ color: '#666' }}>Setup wizard coming in the next step.</p>
          <p style={{ color: '#999', fontSize: 14, marginTop: 8 }}>Server running at {apiUrl}</p>
        </div>
      </div>
    );
  }

  if (state === 'login') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Manufacturing ERP</h1>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Login</h2>
          <p style={{ color: '#666' }}>Login screen coming in the next step.</p>
          <p style={{ color: '#999', fontSize: 14, marginTop: 8 }}>Connected to {apiUrl}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1>Manufacturing ERP - Dashboard</h1>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f0f2f5',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 48,
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    textAlign: 'center',
    maxWidth: 480,
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 24,
  },
  error: {
    color: '#e74c3c',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1a1a2e',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '12px 32px',
    fontSize: 16,
    cursor: 'pointer',
    marginTop: 8,
  },
};

export default App;
