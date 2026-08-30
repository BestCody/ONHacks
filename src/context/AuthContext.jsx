import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

async function authRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.fields = data.errors || {};
    throw error;
  }

  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    authRequest('/api/auth/me')
      .then((data) => {
        if (active) setUser(data.user || null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = async (credentials) => {
    const data = await authRequest('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    setUser(data.user);
    return data.user;
  };

  const signUp = async (credentials) => {
    const data = await authRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    setUser(data.user);
    return data.user;
  };

  const signOut = async () => {
    await authRequest('/api/auth/signout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
