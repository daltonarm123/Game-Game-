import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "gg:auth";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  emailVerified?: boolean;
  isAdmin?: boolean;
};

export type AuthKingdom = {
  id: number;
  name: string;
};

export type AuthState = {
  token: string;
  user: AuthUser;
  kingdom: AuthKingdom | null;
  expiresAt?: string;
};

type AuthCtx = {
  auth: AuthState | null;
  setAuth: (a: AuthState | null) => void;
  loading: boolean;
};

const AuthContext = createContext<AuthCtx>({
  auth: null,
  setAuth: () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as AuthState;
            // Check expiry
            if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
              AsyncStorage.removeItem(STORAGE_KEY);
            } else {
              setAuthState(parsed);
            }
          } catch {
            AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function setAuth(a: AuthState | null) {
    setAuthState(a);
    if (a) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    } else {
      AsyncStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <AuthContext.Provider value={{ auth, setAuth, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
