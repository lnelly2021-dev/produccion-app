"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, Search, ShoppingCart, Send, LogOut, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";

interface Mesa    { _id: string; nombre: string; estado: string; mesero: string; pedidoActivo?: any; }
interface Producto { _id: string; nombre: string; categoria: string; precioPublico: number; }
interface Item     { productoId: string; nombre: string; precio: number; cantidad: number; subtotal: number; notas: string; }

type Vista = "mesas" | "pedido";

export default function WaiterPage() {
  const { branch, user, logout } = useAuth();
  const branchId = branch?.id || "";

  const [vista,     setVista]     = useState<Vista>("mesas");
  const [mesas,     setMesas]     = useState<Mesa[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [mesaActiva, setMesaActiva] = useState<Mesa | null>(null);
  const [items,     setItems]     = useState<Item[]>([]);
  const [filtro,    setFiltro]    = useState("");
  const [catSel,    setCatSel]    = useState("TODAS");
  const [cargando,  setCargando]  = useState(false);
  const [enviando,  setEnviando]  = useState(false);
  const [showCart,  setShowCart]  = useState(false);

  useEffect(() => {
    if (!branchId) return;
    cargarMesas();
    api.get(`/branches/${branchId}/products`)
      .then(({ data }) => setProductos(data.data || data || []))
      .catch(() => {});
  }, [branchId]);

  const cargarMesas = async () => {
    if (!branchId) return;
    setCargando(true);
    try {
      const { data } = await api.get(`/branches/${branchId}/mesas`);
      setMesas((data.data || []).map((m: any) => ({ ...m, _id: String(m._id || m.id) })));
    } catch { toast("error", "Error al cargar mesas"); }
    finally { setCargando(false); }
  };

  const abrirMesa = (mesa: Mesa) => {
    setMesaActiva(mesa);
    // Cargar pedido existente si lo hay
    const pedidoItems = mesa.pedidoActivo?.items || [];
    setItems(pedidoItems.map((i: any) => ({
      productoId: String(i.productoId || ""),
      nombre:     i.nombre,
      precio:     Number(i.precio || i.precioPublico) || 0,
      cantidad:   Number(i.cantidad) || 1,
      subtotal:   Number(i.subtotal) || 0,
      notas:      i.notas || "",
    })));
    setFiltro(""); setCatSel("TODAS"); setShowCart(false);
    setVista("pedido");
  };

  const agregarItem = (p: Producto) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.productoId === p._id);
      if (idx !== -1) {
        return prev.map((i, n) => n === idx ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio } : i);
      }
      return [...prev, { productoId: p._id, nombre: p.nombre, precio: p.precioPublico, cantidad: 1, subtotal: p.precioPublico, notas: "" }];
    });
  };

  const cambiarCantidad = (productoId: string, delta: number) => {
    setItems(prev =>
      prev.map(i => i.productoId === productoId
        ? { ...i, cantidad: Math.max(0, i.cantidad + delta), subtotal: Math.max(0, i.cantidad + delta) * i.precio }
        : i
      ).filter(i => i.cantidad > 0)
    );
  };

  const enviarPedido = async () => {
    if (!mesaActiva || items.length === 0 || !branchId) return;
    setEnviando(true);
    try {
      // Asignar mesero si no tiene
      if (!mesaActiva.mesero && user?.name) {
        await api.put(`/branches/${branchId}/mesas/${mesaActiva._id}/mesero`, { mesero: user.name });
      }
      // Guardar pedido → dispara evento socket en el backend
      await api.put(`/branches/${branchId}/mesas/${mesaActiva._id}/pedido`, { items });
      toast("success", `Pedido enviado — ${mesaActiva.nombre}`);
      setVista("mesas");
      cargarMesas();
    } catch { toast("error", "Error al enviar el pedido"); }
    finally { setEnviando(false); }
  };

  const categorias = ["TODAS", ...Array.from(new Set(productos.map(p => (p.categoria || "").toUpperCase()))).filter(Boolean).sort()];
  const filtrados  = productos
    .filter(p => (p.nombre || "").toLowerCase().includes(filtro.toLowerCase()))
    .filter(p => catSel === "TODAS" || (p.categoria || "").toUpperCase() === catSel)
    .sort((a, b) => (a.categoria || "").localeCompare(b.categoria || "") || a.nombre.localeCompare(b.nombre));

  const totalItems = items.reduce((a, i) => a + i.cantidad, 0);
  const totalMonto = items.reduce((a, i) => a + i.subtotal, 0);

  // ── VISTA MESAS ──────────────────────────────────────────────────────────
  if (vista === "mesas") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-[#1a2b3c] text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-base font-black tracking-tighter">SMART<span className="text-slate-400">POS</span> · Mesero</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{user?.name}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={cargarMesas} className="p-2 bg-white/10 rounded-xl text-white">
              <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
            </button>
            <button onClick={logout} className="p-2 bg-white/10 rounded-xl text-white">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Sucursal */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{branch?.name}</p>
          <p className="text-sm font-black text-gray-800 mt-0.5">Selecciona una mesa</p>
        </div>

        {/* Grid de mesas */}
        <div className="flex-1 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {mesas.map(m => {
              const libre = m.estado === "libre";
              const items = m.pedidoActivo?.items?.length || 0;
              return (
                <button key={m._id} onClick={() => abrirMesa(m)}
                  className={`rounded-2xl p-4 border-2 text-left active:scale-95 transition-all shadow-sm ${
                    libre ? "bg-white border-gray-200" : "bg-white border-gray-300"
                  }`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-base font-black text-gray-800 uppercase">{m.nombre}</span>
                    <span className={`w-3 h-3 rounded-full mt-1 shrink-0 ${libre ? "bg-emerald-500" : "bg-red-500"}`} />
                  </div>
                  {m.mesero ? (
                    <p className="text-[10px] font-bold text-gray-500 uppercase truncate">{m.mesero}</p>
                  ) : (
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Disponible</p>
                  )}
                  {items > 0 && (
                    <p className="text-xs font-black text-gray-700 mt-1">
                      {items} item{items !== 1 ? "s" : ""} · ${m.pedidoActivo.items.reduce((a: number, i: any) => a + (i.subtotal || 0), 0).toLocaleString("es-CO")}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── VISTA PEDIDO ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#1a2b3c] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setVista("mesas")} className="p-2 bg-white/10 rounded-xl">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Pedido</p>
          <h2 className="text-base font-black">{mesaActiva?.nombre}</h2>
        </div>
        <button onClick={() => setShowCart(v => !v)} className="relative p-2 bg-white/10 rounded-xl">
          <ShoppingCart size={18} />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[9px] font-black flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      {/* Búsqueda */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input value={filtro} onChange={e => setFiltro(e.target.value)}
            placeholder="Buscar producto..." className="flex-1 bg-transparent outline-none text-sm text-gray-800 font-medium" />
        </div>
      </div>

      {/* Categorías */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
        {categorias.map(c => (
          <button key={c} onClick={() => setCatSel(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${
              catSel === c ? "bg-[#1a2b3c] text-white" : "bg-white border border-gray-200 text-gray-600"
            }`}>
            {c}
          </button>
        ))}
      </div>

      {/* Lista de productos */}
      <div className="flex-1 px-4 pb-32 space-y-2">
        {filtrados.map(p => {
          const enCarrito = items.find(i => i.productoId === p._id);
          return (
            <div key={p._id} onClick={() => agregarItem(p)}
              className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between active:bg-gray-50 transition-all cursor-pointer">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-800 uppercase truncate">{p.nombre}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase">{p.categoria}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <span className="text-sm font-black text-gray-700">${p.precioPublico.toLocaleString("es-CO")}</span>
                {enCarrito ? (
                  <div onClick={e => e.stopPropagation()} className="flex items-center gap-1 bg-[#1a2b3c] rounded-lg px-2 py-1">
                    <button onClick={() => cambiarCantidad(p._id, -1)} className="text-white font-black text-xs w-5 text-center">−</button>
                    <span className="text-white font-black text-xs w-4 text-center">{enCarrito.cantidad}</span>
                    <button onClick={() => cambiarCantidad(p._id, 1)} className="text-white font-black text-xs w-5 text-center">+</button>
                  </div>
                ) : (
                  <div className="w-7 h-7 bg-[#1a2b3c] rounded-lg flex items-center justify-center text-white font-black text-base">+</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Panel carrito expandido */}
      {showCart && items.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end" onClick={() => setShowCart(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-2xl max-h-[70vh] overflow-y-auto">
            <div className="px-4 pt-4 pb-2 border-b border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase">Pedido — {mesaActiva?.nombre}</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {items.map(i => (
                <div key={i.productoId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => cambiarCantidad(i.productoId, -1)} className="w-7 h-7 border border-gray-200 rounded-lg text-gray-600 font-black text-base flex items-center justify-center">−</button>
                    <span className="text-xs font-black text-gray-700 w-5 text-center">{i.cantidad}</span>
                    <button onClick={() => cambiarCantidad(i.productoId, 1)} className="w-7 h-7 border border-gray-200 rounded-lg text-gray-600 font-black text-base flex items-center justify-center">+</button>
                  </div>
                  <span className="flex-1 mx-3 text-xs font-bold text-gray-700 uppercase truncate">{i.nombre}</span>
                  <span className="text-xs font-black text-gray-800">${i.subtotal.toLocaleString("es-CO")}</span>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              <div className="flex justify-between font-black text-sm mb-3">
                <span>Total</span><span>${totalMonto.toLocaleString("es-CO")}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botón enviar fijo abajo */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-30">
          <button onClick={enviarPedido} disabled={enviando}
            className="w-full bg-[#1a2b3c] text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-60">
            <Send size={18} />
            {enviando ? "Enviando..." : `Enviar Pedido · ${totalItems} item${totalItems !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
