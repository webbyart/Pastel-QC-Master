
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { loginUser as loginService, logoutUser as logoutService } from '../services/db';

interface AuthContextType {
  user: User | null;
  login: (username: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => false,
  logout: () => {},
  isLoading: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('qc_current_user');
    if (stored) setUser(JSON.parse(stored));
    setIsLoading(false);
  }, []);

  const login = async (username: string) => {
    try {
        const foundUser = await loginService(username);
        if (foundUser) {
          setUser(foundUser);
          localStorage.setItem('qc_current_user', JSON.stringify(foundUser));
          return true;
        }
    } catch (e: any) {
        throw new Error(e.message);
    }
    return false;
  };

  const logout = async () => {
    if (user) await logoutService(user.id);
    setUser(null);
    localStorage.removeItem('qc_current_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
