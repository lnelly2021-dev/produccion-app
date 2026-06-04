"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../lib/api";
import { saveAccessToken, clearAccessToken, getAccessToken, isTokenExpired } from "../lib/auth";
import { setActiveCompany, patchEmpresaConfig } from "../lib/empresaStorage";

interface User    { id: string; name: string; email: string; role: string; }
interface Company { id: string; name: string; logo?: string; }
interface Branch  { id: string; name: string; }

export interface AccessEntry {
  company: Company;
  branches: Branch[];
  accessRole: string;
}

interface AuthState {
  user: User | null;
  company: Company | null;
  branch: Branch | null;
  allAccess: AccessEntry[];
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface RegisterDto {
  name: string; email: string; password: string; companyName: string; taxId?: string;
}

interface AuthContextValue extends AuthState {
  login:        (email: string, password: string) => Promise<void>;
  register:     (dto: RegisterDto) => Promise<void>;
  logout:       () => Promise<void>;
  switchBranch: (company: Company, branch: Branch) => void;
}

const EMPTY: AuthState = {
  user: null, company: null, branch: null, allAccess: [], isLoading: false, isAuthenticated: false,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...EMPTY, isLoading: true });

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      const { user, companies } = data.data;

      const allAccess: AccessEntry[] = (companies || []).map((a: any) => ({
        company:    { id: a.company._id, name: a.company.name, logo: a.company.logo ?? "" },
        branches:   (a.branches || []).map((b: any) => ({ id: b._id, name: b.name })),
        accessRole: a.accessRole || "user",
      }));

      // Intentar restaurar la empresa/sucursal que el usuario tenía seleccionada
      let company = allAccess[0]?.company  ?? null;
      let branch  = allAccess[0]?.branches?.[0] ?? null;

      try {
        const saved = localStorage.getItem("smartpos_selection");
        if (saved) {
          const { companyId, branchId } = JSON.parse(saved);
          const savedEntry = allAccess.find(a => a.company.id === companyId);
          if (savedEntry) {
            company = savedEntry.company;
            branch  = savedEntry.branches.find(b => b.id === branchId) ?? savedEntry.branches[0] ?? branch;
          }
        }
      } catch { /* si localStorage falla, usar el primero */ }

      if (company?.id) {
        setActiveCompany(company.id);
        patchEmpresaConfig({ nombreEmpresa: company.name });
      }
      setState({
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
        company, branch, allAccess,
        isLoading: false, isAuthenticated: true,
      });
    } catch {
      setState({ ...EMPTY });
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || isTokenExpired(token)) {
      api.post("/auth/refresh")
        .then(({ data }) => { saveAccessToken(data.data.accessToken); return fetchProfile(); })
        .catch(() => setState({ ...EMPTY }));
    } else {
      fetchProfile();
    }
  }, [fetchProfile]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    saveAccessToken(data.data.accessToken);
    await fetchProfile();
  }, [fetchProfile]);

  const register = useCallback(async (dto: RegisterDto) => {
    const { data } = await api.post("/auth/register", dto);
    saveAccessToken(data.data.accessToken);
    const { user, company, branch } = data.data;
    if (company?.id) setActiveCompany(company.id);
    setState({
      user:    { id: user.id, name: user.name, email: user.email, role: user.role },
      company: company ? { id: company.id, name: company.name } : null,
      branch:  branch  ? { id: branch.id,  name: branch.name  } : null,
      allAccess: [],
      isLoading: false, isAuthenticated: true,
    });
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    finally { clearAccessToken(); setState({ ...EMPTY }); }
  }, []);

  const switchBranch = useCallback((company: Company, branch: Branch) => {
    // Guardar selección para restaurarla si el token se refresca
    try { localStorage.setItem("smartpos_selection", JSON.stringify({ companyId: company.id, branchId: branch.id })); } catch { }
    // Limpiar claves que varían por empresa
    ["historial_cierres", "cxc", "cxp", "lista_bancos"].forEach(k => {
      try { localStorage.removeItem(k); } catch { }
    });
    setActiveCompany(company.id);
    patchEmpresaConfig({ nombreEmpresa: company.name });
    setState(prev => ({ ...prev, company, branch }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, switchBranch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
