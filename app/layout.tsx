"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./globals.css";
import {
  Monitor, FlaskConical, BookOpen, GitBranch, BarChart2,
  Settings, LogOut, ChevronDown, Menu, X, Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { Toaster } from "../components/ui/toaster";

const AUTH_PATHS = ["/login", "/register"];

// Colores suaves para avatares de empresa (se asigna por hash del nombre)
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];

function CompanyAvatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" | "md" }) {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  const color = AVATAR_COLORS[idx];
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  const cls =
    size === "xs" ? `w-5 h-5 rounded-full text-[8px] font-black flex items-center justify-center shrink-0 ${color}` :
    size === "md" ? `w-10 h-10 rounded-full text-sm font-black flex items-center justify-center shrink-0 ${color}` :
                   `w-7 h-7 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${color}`;
  return <span className={cls}>{initials}</span>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { isAuthenticated, isLoading, user, company, branch, allAccess, logout, switchBranch } = useAuth();

  // Logo y nombre vienen directamente del contexto (por empresa, no de localStorage)
  const empresaNombre = company?.name ?? "";
  const empresaLogo   = company?.logo ?? "";

  const [openOps,      setOpenOps]      = useState(true);
  const [openContable, setOpenContable] = useState(true);
  const [openTerceros, setOpenTerceros] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [switching,    setSwitching]    = useState(false);

  // Cerrar sidebar al cambiar de ruta en móvil
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const handleSwitchBranch = (co: any, br: any) => {
    setSwitching(true);
    switchBranch(co, br);
    setShowSelector(false);
    setTimeout(() => setSwitching(false), 600);
  };

  // Auth pages o vista de mesero: sin sidebar
  if (AUTH_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/waiter")) {
    return <body className="bg-gray-50">{children}</body>;
  }

  // Mientras carga el estado de auth, spinner centrado
  if (isLoading) {
    return (
      <body className="bg-gray-50 flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </body>
    );
  }

  // Sin sesión → redirigir al login
  if (!isAuthenticated) {
    router.replace("/login");
    return (
      <body className="bg-gray-50 flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </body>
    );
  }

  const linkCls = (href: string) => {
    const isActive = pathname === href;
    return `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
      isActive ? "font-black text-gray-900 bg-[#eff6ff]" : "font-medium text-gray-900 hover:bg-gray-50"
    }`;
  };

  return (
    <body className="bg-gray-50 flex h-screen overflow-hidden">

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Flash de transición al cambiar de empresa */}
      {switching && (
        <div className="fixed inset-0 z-[9999] bg-white/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-3 bg-white rounded-2xl shadow-xl px-6 py-4 border border-gray-100">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-gray-700">Cambiando empresa…</span>
          </div>
        </div>
      )}

      {/* Barra superior móvil */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3 shadow-sm">
        <button onClick={() => setSidebarOpen(v => !v)} className="p-1 text-gray-600">
          <Menu size={22} />
        </button>
        <div className="flex flex-col leading-none">
          <h2 className="text-base font-black text-gray-900 tracking-tighter">PRODUC<span className="text-emerald-500">CIÓN</span></h2>
          <span className="text-[8px] font-black text-emerald-500 tracking-[0.3em] mt-0.5">COSTOS</span>
        </div>
        <div className="w-8" /> {/* Spacer */}
      </div>

      <aside className={`
        fixed md:static top-0 left-0 h-full z-50
        w-72 md:w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>

        {/* Header sidebar móvil */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex flex-col leading-none">
            <h2 className="text-base font-black text-gray-900 tracking-tighter">PRODUC<span className="text-emerald-500">CIÓN</span></h2>
            <span className="text-[8px] font-black text-emerald-500 tracking-[0.3em] mt-0.5">COSTOS</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-gray-400">
            <X size={20} />
          </button>
        </div>

        {/* Identity — Logo SmartPOS (branding del programa) */}
        <div className="p-6 border-b border-gray-100 bg-gray-50/30">
          <div className="flex items-center gap-3 mb-4">
            {/* Ícono SmartPOS — reemplaza por <img src="/tu-logo.png" className="w-8 h-8 rounded-lg" /> cuando tengas logo propio */}
            <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shadow-blue-100">
              <Monitor size={16} className="text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <h2 className="text-[15px] font-black text-gray-900 tracking-tighter leading-none">PRODUC<span className="text-emerald-500">CIÓN</span></h2>
              <span className="text-[9px] font-black text-emerald-500 tracking-[0.3em] mt-0.5">COSTOS</span>
            </div>
          </div>

          {/* Company + Branch selector */}
          {isAuthenticated && company && (
            <div className="relative">
              <button
                onClick={() => setShowSelector(v => !v)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-left hover:border-blue-300 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  {/* Logo de la empresa activa o avatar con iniciales */}
                  {empresaLogo
                    ? <img src={empresaLogo} alt="Logo" className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" />
                    : <CompanyAvatar name={empresaNombre || company.name} size="md" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Empresa · Sucursal</p>
                    <p className="text-xs font-black text-gray-700 truncate mt-0.5">{empresaNombre || company.name}</p>
                    <p className="text-[10px] font-medium text-gray-400 truncate">{branch?.name || "—"}</p>
                  </div>
                  <ChevronDown size={13} className={`text-gray-400 shrink-0 transition-transform ${showSelector ? "rotate-180" : ""}`} />
                </div>
              </button>

              {showSelector && allAccess.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto">
                  {allAccess.map((entry) => (
                    <div key={entry.company.id}>
                      {/* Encabezado de empresa con logo o avatar */}
                      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 bg-gray-50 border-b border-gray-100">
                        {entry.company.logo
                          ? <img src={entry.company.logo} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 border border-gray-200" />
                          : <CompanyAvatar name={entry.company.name} size="xs" />}
                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest truncate">
                          {entry.company.name}
                        </p>
                      </div>
                      {entry.branches.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => handleSwitchBranch(entry.company, b)}
                          className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center gap-2 ${
                            branch?.id === b.id ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${branch?.id === b.id ? "bg-blue-500" : "bg-gray-300"}`} />
                          <span className="truncate">{b.name}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">

          {/* PRODUCCIÓN */}
          <div>
            <button onClick={() => setOpenOps(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-all group">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-gray-600">Producción</p>
              <ChevronDown size={13} className={`text-gray-400 transition-transform duration-200 ${openOps ? "" : "-rotate-90"}`} />
            </button>
            {openOps && (
              <div className="space-y-1 mt-1 mb-3">
                <Link href="/ingredientes"   className={linkCls("/ingredientes")}><FlaskConical size={16} /> Ingredientes</Link>
                <Link href="/recetas"        className={linkCls("/recetas")}><BookOpen size={16} /> Recetas</Link>
                <Link href="/centros-costo"  className={linkCls("/centros-costo")}><GitBranch size={16} /> Planificador de Producción</Link>
                <Link href="/hoja-costos"    className={linkCls("/hoja-costos")}><BarChart2 size={16} className="text-emerald-500 shrink-0" /> Hoja de Costos</Link>
              </div>
            )}
          </div>

          {/* ADMINISTRACIÓN */}
          <div>
            <button onClick={() => setOpenContable(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-all group">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-gray-600">Administración</p>
              <ChevronDown size={13} className={`text-gray-400 transition-transform duration-200 ${openContable ? "" : "-rotate-90"}`} />
            </button>
            {openContable && (
              <div className="space-y-1 mt-1 mb-3">
                <Link href="/proveedores"    className={linkCls("/proveedores")}><Users size={16} /> Proveedores</Link>
                <Link href="/configuracion"  className={linkCls("/configuracion")}><Settings size={16} /> Configuración</Link>
              </div>
            )}
          </div>

        </nav>

        {/* Footer: user info + logout */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-2">
          {isAuthenticated && user && (
            <div className="flex items-center gap-2 px-1">
              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-black text-blue-600">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-700 truncate">{user.name}</p>
                <p className="text-[9px] text-gray-400 uppercase font-bold tracking-widest">{user.role}</p>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="ml-auto text-gray-400 hover:text-red-500 transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
          <div className="bg-white p-2 rounded-xl border border-gray-200 flex items-center justify-between px-3">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Version</p>
            <p className="text-[11px] font-bold text-blue-600">v1.0.26</p>
          </div>
        </div>
      </aside>

      <main key={branch?.id ?? "no-branch"} className="flex-1 overflow-y-auto bg-gray-50 relative pt-12 md:pt-0">
        {children}
      </main>
    </body>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <AuthProvider>
        <ConfirmProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </ConfirmProvider>
      </AuthProvider>
    </html>
  );
}
