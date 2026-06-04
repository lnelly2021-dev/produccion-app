"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mesa } from "./interfaces";
import Tables from "./components/Tables";
import { X, UserCheck, Unlock, ClipboardList, RefreshCw, Trash2 } from "lucide-react";
import api from "../../lib/api";
import { getSocket, disconnectSocket } from "../../lib/socket";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

export default function Page() {
  const router   = useRouter();
  const { branch } = useAuth();
  const branchId = branch?.id;
  const confirm = useConfirm();

  const [mesas,          setMesas]          = useState<Mesa[]>([]);
  const [listaEmpleados, setListaEmpleados] = useState<string[]>([]);
  const [mesaActiva,     setMesaActiva]     = useState<Mesa | null>(null);
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [meseroInput,    setMeseroInput]    = useState("");
  const [showMeseroDD,   setShowMeseroDD]   = useState(false);
  const meseroRef = useRef<HTMLDivElement>(null);
  const [modo,           setModo]           = useState<"asignar" | "opciones">("asignar");
  const [cargando,       setCargando]       = useState(false);
  const [alertaMesa,     setAlertaMesa]     = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Normalizar mesa del API ──────────────────────────────────────────────
  const normalizar = (m: any): Mesa => ({
    ...m,
    _id:    String(m._id || m.id),
    id:     String(m._id || m.id),
    mesero: m.mesero || "",
  });

  // ── Cargar mesas desde API ───────────────────────────────────────────────
  const mesasKey = branchId ? `mesas_${branchId}` : "mesas";

  const cargarMesas = useCallback(async () => {
    if (!branchId) return;
    setCargando(true);
    try {
      const { data } = await api.get(`/branches/${branchId}/mesas`);
      let lista = (data.data || []).map(normalizar);

      // Si no hay mesas, inicializar con 4 por defecto
      if (lista.length === 0) {
        const { data: init } = await api.post(`/branches/${branchId}/mesas/init`, { cantidad: 4 });
        lista = (init.data || []).map(normalizar);
      }

      setMesas(lista);
      localStorage.setItem(mesasKey, JSON.stringify(lista));
    } catch {
      const local = JSON.parse(localStorage.getItem(mesasKey) || "[]");
      setMesas(local);
    } finally {
      setCargando(false);
    }
  }, [branchId, mesasKey]);

  // ── Alarma de sonido con Web Audio API ──────────────────────────────────
  const playAlarm = useCallback(() => {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const beeps = [0, 200, 400];
      beeps.forEach(delay => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, ctx.currentTime + delay / 1000);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.3);
        osc.start(ctx.currentTime + delay / 1000);
        osc.stop(ctx.currentTime + delay / 1000 + 0.3);
      });
    } catch { /* navegadores sin AudioContext */ }
  }, []);

  // ── Conexión Socket.IO ───────────────────────────────────────────────────
  useEffect(() => {
    if (!branchId) return;
    const socket = getSocket();
    socket.on("pedido_nuevo", (data: { mesaId: string; mesaNombre: string; mesero: string; total: number }) => {
      playAlarm();
      setAlertaMesa(data.mesaId);
      toast("success", `🔔 Nuevo pedido — ${data.mesaNombre} · ${data.mesero || "Mesero"}`);
      cargarMesas();
      // Quitar badge después de 10 segundos
      setTimeout(() => setAlertaMesa(null), 10000);
    });
    return () => { socket.off("pedido_nuevo"); disconnectSocket(); };
  }, [branchId, playAlarm]);

  useEffect(() => {
    cargarMesas();
    if (branchId) {
      api.get(`/branches/${branchId}/contactos?tipo=EMPLEADO`)
        .then(r => {
          const lista = (r.data.data ?? r.data ?? []).map((e: any) => e.nombre).filter(Boolean);
          if (lista.length > 0) setListaEmpleados(lista);
          else {
            const local = JSON.parse(localStorage.getItem(branchId ? `empleados_${branchId}` : "empleados") || "[]");
            setListaEmpleados(local.map((e: any) => e.nombre).filter(Boolean));
          }
        })
        .catch(() => {
          const local = JSON.parse(localStorage.getItem(branchId ? `empleados_${branchId}` : "empleados") || "[]");
          setListaEmpleados(local.map((e: any) => e.nombre).filter(Boolean));
        });
    }
  }, [cargarMesas, branchId]);

  // ── Click en una mesa ────────────────────────────────────────────────────
  const handleSelectMesa = (mesa: Mesa) => {
    setMesaActiva(mesa);
    setMeseroInput(mesa.mesero || "");
    setModo(mesa.mesero ? "opciones" : "asignar");
    setDrawerOpen(true);
  };

  // Cerrar dropdown de mesero al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (meseroRef.current && !meseroRef.current.contains(e.target as Node))
        setShowMeseroDD(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const empleadosFiltrados = listaEmpleados.filter(m =>
    m.toLowerCase().includes(meseroInput.toLowerCase())
  );

  const puedeCrear = meseroInput.trim().length > 1
    && !listaEmpleados.some(m => m.toLowerCase() === meseroInput.trim().toLowerCase());

  const crearEmpleadoRapido = async () => {
    const nombre = meseroInput.trim().toUpperCase();
    if (!nombre || !branchId) return;
    try {
      await api.post(`/branches/${branchId}/contactos`, { tipo: "EMPLEADO", nombre, cargo: "MESERO" });
      setListaEmpleados(prev => [...prev, nombre].sort());
      setMeseroInput(nombre);
      setShowMeseroDD(false);
      toast("success", `${nombre} creado como empleado`);
    } catch { toast("error", "Error al crear el empleado"); }
  };

  // ── Asignar mesero ───────────────────────────────────────────────────────
  const asignarMesero = async () => {
    if (!mesaActiva || !meseroInput.trim() || !branchId) return;
    try {
      await api.put(`/branches/${branchId}/mesas/${mesaActiva._id}/mesero`, { mesero: meseroInput.trim() });
      await cargarMesas();
      setDrawerOpen(false);
      if (modo === "asignar") router.push(`/orders/${mesaActiva._id}`);
    } catch { toast("error", "Error al asignar mesero"); }
  };

  // ── Liberar mesa ─────────────────────────────────────────────────────────
  const liberarMesa = async () => {
    if (!mesaActiva || !branchId) return;
    if (mesaActiva.pedidoActivo?.items?.length > 0) {
      if (!await confirm("Esta mesa tiene un pedido activo. ¿Seguro que quieres liberarla?")) return;
    }
    try {
      await api.put(`/branches/${branchId}/mesas/${mesaActiva._id}/liberar`);
      await cargarMesas();
      setDrawerOpen(false);
    } catch { toast("error", "Error al liberar la mesa"); }
  };

  const agregarMesa = async () => {
    if (!branchId) return;
    try {
      await api.post(`/branches/${branchId}/mesas`);
      await cargarMesas();
    } catch { toast("error", "Error al agregar mesa"); }
  };

  const eliminarMesa = async () => {
    if (!mesaActiva || !branchId) return;
    if (!await confirm("¿Eliminar esta mesa permanentemente?", "Eliminar mesa")) return;
    try {
      await api.delete(`/branches/${branchId}/mesas/${mesaActiva._id}`);
      await cargarMesas();
      setDrawerOpen(false);
      toast("success", "Mesa eliminada");
    } catch (e: any) { toast("error", e?.response?.data?.error || e?.message || "Error al eliminar la mesa"); }
  };

  const cerrarDrawer = () => { setDrawerOpen(false); setMeseroInput(""); setShowMeseroDD(false); };
  const tienePedido  = (mesaActiva?.pedidoActivo?.items?.length || 0) > 0;

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans">

      {/* CABECERA */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-8 py-4 md:py-5 shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Mesas</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
            {mesas.filter(m => m.estado === "ocupada").length} ocupadas &nbsp;·&nbsp;
            {mesas.filter(m => m.estado === "libre").length} libres
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargarMesas} disabled={cargando}
            className="bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-gray-50 transition-all">
            {cargando ? "..." : "↻"}
          </button>
          <button onClick={agregarMesa} disabled={cargando}
            className="bg-[#1a2b3c] text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-black transition-all shadow-sm">
            + Agregar Mesa
          </button>
        </div>
      </div>

      {/* LEYENDA */}
      <div className="px-4 md:px-8 py-3 flex gap-4 shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Libre
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Ocupada
        </div>
      </div>

      {/* PEDIDOS EN CURSO — solo aparece si hay mesas con pedido activo */}
      {(() => {
        const conPedido = mesas.filter(m => (m.pedidoActivo?.items?.length || 0) > 0);
        if (conPedido.length === 0) return null;
        return (
          <div className="shrink-0 border-t border-b border-orange-100 bg-orange-50/60 px-4 md:px-8 py-2">
            <div className="flex items-center gap-3 overflow-x-auto">
              <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest shrink-0">
                Pedidos
              </p>
              {conPedido.map(m => {
                const items  = m.pedidoActivo.items as any[];
                const total  = items.reduce((a: number, i: any) => a + (Number(i.subtotal) || 0), 0);
                const count  = items.reduce((a: number, i: any) => a + (Number(i.cantidad) || 0), 0);
                const alerta = alertaMesa === m._id || alertaMesa === m.id;
                return (
                  <button key={m._id}
                    onClick={() => router.push(`/orders/${m._id}`)}
                    className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border text-left transition-all active:scale-95 ${
                      alerta
                        ? "bg-orange-500 border-orange-500 text-white animate-pulse"
                        : "bg-white border-orange-200 text-slate-700 hover:border-orange-400"
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase">{m.nombre}</span>
                    {m.mesero && (
                      <span className={`text-[9px] font-bold ${alerta ? "text-orange-100" : "text-slate-400"}`}>
                        · {m.mesero}
                      </span>
                    )}
                    <span className={`text-[9px] font-black ${alerta ? "text-white" : "text-orange-500"}`}>
                      {count} item{count !== 1 ? "s" : ""} · ${total.toLocaleString("es-CO")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* GRID */}
      <div className="flex-1 overflow-auto px-4 md:px-8 pb-8">
        {cargando && mesas.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-300 font-black text-[10px] uppercase tracking-widest">
            Cargando mesas...
          </div>
        ) : (
          <Tables mesas={mesas} onSelectMesa={handleSelectMesa} alertaMesaId={alertaMesa} />
        )}
      </div>

      {/* DRAWER */}
      <div className={`fixed top-0 right-0 h-full w-full md:w-[400px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}>
        {drawerOpen && (
          <div className="absolute inset-y-0 right-full w-screen bg-black/20" onClick={cerrarDrawer} />
        )}
        <div className="h-full flex flex-col p-8">
          <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-100">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {modo === "asignar" ? "Asignar mesero" : "Mesa ocupada"}
              </p>
              <h2 className="text-xl font-black text-slate-800 tracking-tighter mt-0.5">{mesaActiva?.nombre}</h2>
              {mesaActiva?.mesero && (
                <p className="text-[11px] font-bold text-slate-500 mt-1">
                  Mesero: <span className="text-slate-800">{mesaActiva.mesero}</span>
                </p>
              )}
            </div>
            <button onClick={cerrarDrawer} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-3 overflow-y-auto">

            {/* Asignar */}
            {modo === "asignar" && (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Seleccionar Mesero</p>
                  <div ref={meseroRef} className="relative">
                    <input
                      type="text"
                      value={meseroInput}
                      onChange={e => { setMeseroInput(e.target.value); setShowMeseroDD(true); }}
                      onFocus={() => setShowMeseroDD(true)}
                      placeholder="Buscar o seleccionar..."
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-sm outline-none uppercase placeholder:normal-case placeholder:text-slate-400"
                    />
                    {showMeseroDD && (empleadosFiltrados.length > 0 || puedeCrear) && (
                      <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
                        {empleadosFiltrados.map((m, i) => (
                          <li key={i}
                            onMouseDown={() => { setMeseroInput(m); setShowMeseroDD(false); }}
                            className="px-3 py-2.5 text-sm font-bold uppercase cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          >{m}</li>
                        ))}
                        {puedeCrear && (
                          <li onMouseDown={crearEmpleadoRapido}
                            className="px-3 py-2.5 text-sm font-bold cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-t border-slate-100 transition-colors flex items-center gap-2">
                            <span className="text-base leading-none">+</span>
                            Crear "{meseroInput.trim().toUpperCase()}"
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
                <button onClick={asignarMesero} disabled={!meseroInput}
                  className="w-full bg-[#1a2b3c] text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center gap-2">
                  <UserCheck size={15} /> Asignar y Abrir Mesa
                </button>
                <div className="mt-auto border-t border-slate-100 pt-4">
                  <button onClick={eliminarMesa}
                    className="w-full border-2 border-gray-200 text-gray-400 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-50 hover:border-red-200 hover:text-red-400 transition-all flex items-center justify-center gap-2">
                    <Trash2 size={13} /> Eliminar Mesa
                  </button>
                </div>
              </>
            )}

            {/* Opciones */}
            {modo === "opciones" && (
              <>
                <button onClick={() => { setDrawerOpen(false); router.push(`/orders/${mesaActiva?._id}`); }}
                  className="w-full bg-[#1a2b3c] text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2">
                  <ClipboardList size={15} />
                  {tienePedido ? "Ver / Editar Pedido" : "Abrir Pedido"}
                </button>

                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center gap-1">
                    <RefreshCw size={10} /> Cambiar Mesero
                  </p>
                  <div className="flex gap-2">
                    <div ref={meseroRef} className="relative flex-1">
                      <input
                        type="text"
                        value={meseroInput}
                        onChange={e => { setMeseroInput(e.target.value); setShowMeseroDD(true); }}
                        onFocus={() => setShowMeseroDD(true)}
                        placeholder="Buscar o seleccionar..."
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-sm outline-none uppercase placeholder:normal-case placeholder:text-slate-400"
                      />
                      {showMeseroDD && (empleadosFiltrados.length > 0 || puedeCrear) && (
                        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {empleadosFiltrados.map((m, i) => (
                            <li key={i}
                              onMouseDown={() => { setMeseroInput(m); setShowMeseroDD(false); }}
                              className="px-3 py-2.5 text-sm font-bold uppercase cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            >{m}</li>
                          ))}
                          {puedeCrear && (
                            <li onMouseDown={crearEmpleadoRapido}
                              className="px-3 py-2.5 text-sm font-bold cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-t border-slate-100 transition-colors flex items-center gap-2">
                              <span className="text-base leading-none">+</span>
                              Crear "{meseroInput.trim().toUpperCase()}"
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                    <button onClick={asignarMesero} disabled={!meseroInput || meseroInput === mesaActiva?.mesero}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-black text-[10px] uppercase hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all">
                      OK
                    </button>
                  </div>
                </div>

                <div className="mt-auto border-t border-slate-100 pt-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">
                    {tienePedido ? "⚠️ Tiene pedido activo" : "Cliente se fue sin pedir"}
                  </p>
                  <button onClick={liberarMesa}
                    className="w-full border-2 border-red-200 text-red-600 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-50 transition-all flex items-center justify-center gap-2">
                    <Unlock size={14} /> Liberar Mesa
                  </button>
                  <button onClick={eliminarMesa}
                    className="w-full border-2 border-gray-200 text-gray-400 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-50 hover:border-red-200 hover:text-red-400 transition-all flex items-center justify-center gap-2 mt-2">
                    <Trash2 size={13} /> Eliminar Mesa
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
