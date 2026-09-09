import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "./api";

export interface User {
  id: number;
  name: string;
  email: string;
  phone_number?: string;
  avatar_path?: string;
  bio?: string;
  department?: string;
  year_of_study?: string;
  section_class?: string;
  graduation_year?: string;
  campus?: string;
  building?: string;
  floor?: string;
  classroom?: string;
  lab_room?: string;
  hostel?: string;
  show_email?: boolean;
  show_phone?: boolean;
  show_classroom?: boolean;
  show_hostel?: boolean;
  preferred_categories?: string[];
  preferred_locations?: string[];
  preference_notifications_enabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("findit_auth_token");
    if (storedToken) {
      setToken(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      refreshUser();
    }
  }, [token]);

  const refreshUser = async () => {
    try {
      setIsLoading(true);
      const userData = await api.get<User>("/api/auth/me");
      setUser(userData);
    } catch (error) {
      console.error("Failed to fetch user:", error);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const login = (newToken: string) => {
    localStorage.setItem("findit_auth_token", newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("findit_auth_token");
    setToken(null);
    setUser(null);
    // Optional: redirect to login
    window.location.href = "/login";
  };

  const value = {
    user,
    token,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
