"use client";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig, patchEmpresaConfig } from "../../lib/empresaStorage";
import SinTurno from "../components/SinTurno";

interface Item { id: string|number; nombre: string; precio: number; cantidad: number; }
interface Pago { medio: string; monto: string; }

export default function PreFacturaPage() {
  const router    = useRouter();
  const { branch, company } = useAuth();
  const branchId  = branch?.id || "";

  const [turno,       setTurno]       = useState<any>(null);
  const [productos,   setProductos]   = useState<any[]>([]);
  const [busqueda,    setBusqueda]    = useState("");
  const [carrito,     setCarrito]     = useState<Item[]>([]);
  const [preciosLibres, setPreciosLibres] = useState<Record<string|number, string>>({});

  // Cliente con autocompletar
  const [clienteInput,  setClienteInput]  = useState("");
  const [showClienteDD, setShowClienteDD] = useState(false);
  const [listaClientes, setListaClientes] = useState<string[]>([]);
  const clienteRef = useRef<HTMLDivElement>(null);

  // Extras
  const [catSeleccionada, setCatSeleccionada] = useState("TODAS");
  const [descuentoInput, setDescuentoInput] = useState("");
  const [domicilioInput, setDomicilioInput] = useState("");
  const [notas,          setNotas]          = useState("");
  const [pagos,          setPagos]          = useState<Pago[]>([{ medio: "EFECTIVO", monto: "" }]);
  const [listaBancos,    setListaBancos]    = useState<string[]>([]);
  const [enviando,       setEnviando]       = useState(false);
  const [empresa,        setEmpresa]        = useState<any>({});

  // Verificar turno
  useEffect(() => {
    if (!branchId) return;
    const t = localStorage.getItem(`turno_actual_${branchId}`);
    if (t) { try { setTurno(JSON.parse(t)); } catch { setTurno(null); } }
  }, [branchId]);

  // Cargar datos
  useEffect(() => {
    if (!branchId) return;
    setEmpresa(getEmpresaConfig());

    api.get(`/branches/${branchId}/products`)
      .then(({ data }) => setProductos((data.data ?? data).filter((p: any) => p.active !== false)))
      .catch(() => {});

    api.get(`/branches/${branchId}/contactos?tipo=CLIENTE`)
      .then(({ data }) => {
        const nombres = (data.data || []).map((c: any) => (c.nombre || "").toUpperCase()).filter(Boolean);
        setListaClientes(nombres.sort());
      }).catch(() => {});

    const bk = localStorage.getItem(`lista_bancos_${branchId}`) || localStorage.getItem("lista_bancos");
    if (bk) setListaBancos(JSON.parse(bk));

    if (company?.id) {
      api.get(`/companies/${company.id}`)
        .then(({ data }) => {
          const c = data.data ?? data;
          const patch: any = {};
          if (c.name)    patch.nombreEmpresa = c.name;
          if (c.taxId)   patch.nit           = c.taxId;
          if (c.phone)   patch.telefono      = c.phone;
          if (c.address) patch.direccion     = c.address;
          setEmpresa((prev: any) => ({ ...prev, ...patch }));
          patchEmpresaConfig(patch);
        }).catch(() => {});
    }
  }, [branchId, company?.id]);

  // Cerrar dropdown cliente al click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node))
        setShowClienteDD(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const mediosPago = ["EFECTIVO", ...Array.from(new Set([...listaBancos, "NEQUI", "DAVIPLATA", "TRANSFERENCIA"]))];

  const fmt = (v: any): number => {
    if (typeof v === "number") return v;
    if (!v) return 0;
    return Number(String(v).replace(/\./g, "").replace(/,/g, "")) || 0;
  };

  const clientesFiltrados = listaClientes.filter(c =>
    c.includes(clienteInput.toUpperCase().trim())
  );
  const puedeCrearCliente = clienteInput.trim().length > 1 &&
    !listaClientes.some(c => c === clienteInput.toUpperCase().trim());

  const crearClienteRapido = async () => {
    const nombre = clienteInput.trim().toUpperCase();
    if (!nombre || !branchId) return;
    try {
      await api.post(`/branches/${branchId}/contactos`, { tipo: "CLIENTE", nombre, identificacion: "" });
      setListaClientes(prev => [...prev, nombre].sort());
      setClienteInput(nombre);
      setShowClienteDD(false);
      toast("success", `${nombre} creado como cliente`);
    } catch { toast("error", "Error al crear el cliente"); }
  };

  const agregarAlCarrito = (p: any, precio: number) => {
    if (precio <= 0) return;
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.id === (p._id || p.id) && i.precio === precio);
      if (idx >= 0) { const n = [...prev]; n[idx].cantidad += 1; return n; }
      return [...prev, { id: p._id || p.id, nombre: p.nombre, precio, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (id: string|number, precio: number, delta: number) => {
    setCarrito(prev =>
      prev.map(i => i.id === id && i.precio === precio ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
          .filter(i => i.cantidad > 0)
    );
  };

  const subtotal   = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const descuento  = Math.max(0, parseInt(descuentoInput) || 0);
  const domicilio  = Math.max(0, parseInt(domicilioInput) || 0);
  const total      = Math.max(0, subtotal - descuento) + domicilio;
  const totalPagado = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const saldoPendiente = Math.max(total - totalPagado, 0);

  const emitirPreFactura = async () => {
    if (carrito.length === 0)       { toast("warning", "Agrega al menos un producto"); return; }
    if (!clienteInput.trim())       { toast("warning", "Escribe el nombre del cliente"); return; }
    if (totalPagado === 0)          { toast("warning", "Registra al menos un anticipo"); return; }
    setEnviando(true);
    try {
      const pagosValidos = pagos.filter(p => parseFloat(p.monto) > 0)
        .map(p => ({ medio: p.medio, monto: parseFloat(p.monto) }));

      const { data } = await api.post(`/branches/${branchId}/pre-facturas`, {
        tercero:  clienteInput.trim().toUpperCase(),
        productos: carrito.map(i => ({
          productoId: String(i.id),
          nombre:     i.nombre,
          cantidad:   i.cantidad,
          precio:     i.precio,
          subtotal:   i.precio * i.cantidad,
        })),
        subtotal,
        descuento,
        impuesto: 0,
        propina:  0,
        envio:    domicilio,
        total,
        pagos:    pagosValidos,
        notasEntrega: notas.trim(),
      });

      imprimirTicket(data.data);
      toast("success", `${data.data.nroDocumento} registrada`);
      router.push("/anticipos");
    } catch (err: any) {
      toast("error", err?.response?.data?.message || "Error al registrar");
    } finally { setEnviando(false); }
  };

  const imprimirTicket = (pf: any) => {
    const emp   = getEmpresaConfig();
    const f     = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
    const filas = pf.productos.map((p: any) =>
      `<tr><td>${p.nombre}</td><td align="right">${p.cantidad}</td><td align="right">${f(p.precio)}</td><td align="right">${f(p.subtotal)}</td></tr>`
    ).join("");
    const pagosHtml = (pf.pagos || []).map((p: any) =>
      `<div style="display:flex;justify-content:space-between"><span>${p.medio}</span><span>${f(p.monto)}</span></div>`
    ).join("");
    const html = `<html><head><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:5px;margin:0;font-size:11px}
      .c{text-align:center}.b{font-weight:bold}.hr{border-top:1px dashed #000;margin:5px 0}
      table{width:100%;font-size:10px;border-collapse:collapse}
    </style></head><body>
    <div class="c b">${emp.nombreEmpresa || company?.name || ""}</div>
    <div class="c">NIT: ${emp.nit || ""} | Tel: ${emp.telefono || ""}</div>
    <div class="hr"></div>
    <div class="c b" style="font-size:13px">${pf.nroDocumento}</div>
    <div class="c" style="font-size:9px;color:#666">PRE-FACTURA / ANTICIPO</div>
    <div class="hr"></div>
    <div>CLIENTE: ${pf.tercero}</div>
    <div>FECHA: ${new Date(pf.fecha || pf.createdAt).toLocaleDateString("es-CO")}</div>
    <div class="hr"></div>
    <table><thead><tr><th align="left">PRODUCTO</th><th>CANT</th><th align="right">P.U.</th><th align="right">TOTAL</th></tr></thead>
    <tbody>${filas}</tbody></table>
    <div class="hr"></div>
    ${pf.descuento > 0 ? `<div style="display:flex;justify-content:space-between"><span>Descuento</span><span>-${f(pf.descuento)}</span></div>` : ""}
    ${(pf.envio || 0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Domicilio</span><span>${f(pf.envio)}</span></div>` : ""}
    <div style="display:flex;justify-content:space-between"><b>TOTAL PEDIDO</b><b>${f(pf.total)}</b></div>
    <div class="hr"></div>
    <div class="b" style="font-size:10px">ANTICIPO RECIBIDO:</div>
    ${pagosHtml}
    <div style="display:flex;justify-content:space-between"><b>SALDO PENDIENTE</b><b>${f(pf.saldoPendiente)}</b></div>
    <div class="hr"></div>
    ${pf.notasEntrega ? `<div>Notas: ${pf.notasEntrega}</div><div class="hr"></div>` : ""}
    <div class="c" style="font-size:9px">Documento no es factura de venta</div>
    </body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
    setTimeout(() => { w?.print(); }, 400);
  };

  const normCat = (c: any) => (c || "").trim().toUpperCase();
  const categorias = ["TODAS", ...Array.from(new Set(productos.map((p: any) => normCat(p.categoria)))).filter(Boolean)] as string[];
  const productosFiltrados = productos
    .filter(p =>
      p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) &&
      (catSeleccionada === "TODAS" || normCat(p.categoria) === catSeleccionada)
    )
    .sort((a: any, b: any) => {
      const cat = normCat(a.categoria).localeCompare(normCat(b.categoria));
      return cat !== 0 ? cat : (a.nombre || "").localeCompare(b.nombre || "");
    });

  if (!turno) return <SinTurno branchId={branchId} onTurnoAbierto={setTurno} />;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4 shrink-0">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-black text-gray-800 tracking-tighter">PRE-FACTURA</h1>
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Anticipo de pedido — no mueve inventario</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── PANEL IZQUIERDO: productos ── */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-100 bg-white">
          <div className="p-4 border-b border-gray-100 flex gap-2">
            <input placeholder="Buscar producto..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-400" />
            <select value={catSeleccionada} onChange={e => setCatSeleccionada(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase outline-none focus:border-amber-400 text-gray-700">
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 xl:grid-cols-3 gap-3 content-start items-start">
            {productosFiltrados.map(p => {
              const pubPrice = fmt(p.precioPublico ?? p.precio);
              const mayPrice = fmt(p.precioMayorista);
              const tienePrecios = pubPrice > 0 || mayPrice > 0;
              return (
                <div key={p._id || p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  {p.foto && (
                    <div className="overflow-hidden rounded-t-2xl">
                      <img src={p.foto} alt={p.nombre} className="w-full h-20 object-cover"
                        onError={e => (e.currentTarget.parentElement!.style.display = "none")} />
                    </div>
                  )}
                  <div className="p-2.5 space-y-1.5">
                    <p className="text-[11px] font-bold text-gray-800 leading-snug line-clamp-3">{p.nombre}</p>
                    {/* Precio Público */}
                    {pubPrice > 0 && (
                      <button onClick={() => agregarAlCarrito(p, pubPrice)}
                        className="flex justify-between items-center w-full bg-amber-50 border border-amber-100 hover:bg-amber-100 px-2.5 py-2 rounded-xl transition-all">
                        <span className="text-[8px] font-black bg-amber-400 text-white px-1.5 py-0.5 rounded">PÚB</span>
                        <span className="text-xs font-black text-gray-900">${pubPrice.toLocaleString("es-CO")}</span>
                      </button>
                    )}
                    {/* Precio Mayorista */}
                    {mayPrice > 0 && (
                      <button onClick={() => agregarAlCarrito(p, mayPrice)}
                        className="flex justify-between items-center w-full bg-sky-50 border border-sky-100 hover:bg-sky-100 px-2.5 py-2 rounded-xl transition-all">
                        <span className="text-[8px] font-black bg-sky-500 text-white px-1.5 py-0.5 rounded">MAY</span>
                        <span className="text-xs font-black text-gray-900">${mayPrice.toLocaleString("es-CO")}</span>
                      </button>
                    )}
                    {/* Precio Libre */}
                    <div className="flex gap-1">
                      <input type="number" placeholder={tienePrecios ? "Precio libre" : "$ Precio..."}
                        value={preciosLibres[p._id || p.id] || ""}
                        onChange={e => setPreciosLibres(prev => ({ ...prev, [p._id || p.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            const v = parseFloat(preciosLibres[p._id || p.id] || "0");
                            if (v > 0) { agregarAlCarrito(p, v); setPreciosLibres(prev => ({ ...prev, [p._id || p.id]: "" })); }
                          }
                        }}
                        className={`flex-1 min-w-0 border rounded-lg text-[9px] font-bold outline-none px-2 focus:border-gray-400 ${
                          tienePrecios ? "bg-gray-50 border-gray-200 py-1.5" : "bg-slate-800 border-slate-700 text-white placeholder-slate-400 py-2"
                        }`} />
                      <button onClick={() => {
                        const v = parseFloat(preciosLibres[p._id || p.id] || "0");
                        if (v > 0) { agregarAlCarrito(p, v); setPreciosLibres(prev => ({ ...prev, [p._id || p.id]: "" })); }
                      }} className={`text-white rounded-lg font-black text-sm shrink-0 flex items-center justify-center ${
                        tienePrecios ? "bg-gray-700 w-6 h-6" : "bg-slate-700 w-8 h-8"
                      }`}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── PANEL DERECHO: carrito + datos ── */}
        <div className="w-80 md:w-96 flex flex-col bg-white overflow-hidden">
          {/* Carrito */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart size={13} className="text-gray-400" />
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Detalle del pedido</span>
            </div>
            {carrito.length === 0 ? (
              <p className="text-center text-gray-300 text-xs py-6">Sin productos</p>
            ) : carrito.map((i, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-700 truncate">{i.nombre}</p>
                  <p className="text-[10px] text-gray-400">${i.precio.toLocaleString("es-CO")}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => cambiarCantidad(i.id, i.precio, -1)} className="w-5 h-5 rounded-md bg-gray-200 text-xs font-black flex items-center justify-center">−</button>
                  <span className="w-5 text-center text-xs font-black">{i.cantidad}</span>
                  <button onClick={() => cambiarCantidad(i.id, i.precio, 1)} className="w-5 h-5 rounded-md bg-amber-100 text-amber-700 text-xs font-black flex items-center justify-center">+</button>
                </div>
                <p className="text-xs font-black text-gray-800 w-16 text-right shrink-0">${(i.precio * i.cantidad).toLocaleString("es-CO")}</p>
                <button onClick={() => setCarrito(prev => prev.filter((_, j) => j !== idx))} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>

          {/* Datos + pago */}
          <div className="p-4 border-t border-gray-100 space-y-2.5 shrink-0">

            {/* Cliente — combobox */}
            <div ref={clienteRef} className="relative">
              <input placeholder="Nombre del cliente *"
                value={clienteInput}
                onChange={e => { setClienteInput(e.target.value); setShowClienteDD(true); }}
                onFocus={() => setShowClienteDD(true)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
              {showClienteDD && clienteInput.trim().length > 0 && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                  {clientesFiltrados.slice(0, 8).map(c => (
                    <button key={c} onMouseDown={() => { setClienteInput(c); setShowClienteDD(false); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 font-medium text-gray-700">{c}</button>
                  ))}
                  {puedeCrearCliente && (
                    <button onMouseDown={crearClienteRapido}
                      className="w-full text-left px-3 py-2 text-xs font-black text-emerald-600 hover:bg-emerald-50 border-t border-gray-100">
                      + Crear "{clienteInput.trim().toUpperCase()}"
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Descuento + Domicilio */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Descuento $</label>
                <input type="number" placeholder="0" value={descuentoInput}
                  onChange={e => setDescuentoInput(e.target.value)}
                  className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Domicilio $</label>
                <input type="number" placeholder="0" value={domicilioInput}
                  onChange={e => setDomicilioInput(e.target.value)}
                  className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
              </div>
            </div>

            {/* Notas */}
            <input placeholder="Notas de entrega (opcional)" value={notas}
              onChange={e => setNotas(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-400" />

            {/* Subtotales */}
            <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-0.5 text-xs">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span><span>${subtotal.toLocaleString("es-CO")}</span>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Descuento</span><span>− ${descuento.toLocaleString("es-CO")}</span>
                </div>
              )}
              {(descuento > 0 || domicilio > 0) && (
                <div className="flex justify-between text-gray-700 font-bold border-t border-dashed border-gray-200 pt-0.5">
                  <span>Base</span><span>${Math.max(0, subtotal - descuento).toLocaleString("es-CO")}</span>
                </div>
              )}
              {domicilio > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Domicilio</span><span>+ ${domicilio.toLocaleString("es-CO")}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-gray-800 border-t border-gray-200 pt-0.5">
                <span>TOTAL PEDIDO</span><span>${total.toLocaleString("es-CO")}</span>
              </div>
            </div>

            {/* Anticipo */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Anticipo recibido</p>
                <button onClick={() => setPagos(prev => [...prev, { medio: "EFECTIVO", monto: "" }])}
                  className="text-[9px] text-amber-500 font-black">+ Agregar medio</button>
              </div>
              {pagos.map((p, i) => (
                <div key={i} className="flex gap-1.5 mb-1">
                  <select value={p.medio} onChange={e => setPagos(prev => prev.map((x, j) => j === i ? { ...x, medio: e.target.value } : x))}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none">
                    {mediosPago.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <input type="number" placeholder="Monto" value={p.monto}
                    onChange={e => setPagos(prev => prev.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                    className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber-400" />
                  {pagos.length > 1 && (
                    <button onClick={() => setPagos(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 text-xs px-1">✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* Saldo */}
            <div className="bg-amber-50 rounded-xl px-3 py-2 flex justify-between text-xs">
              <span className="font-black text-gray-700">Saldo pendiente</span>
              <span className="font-black text-amber-600">${saldoPendiente.toLocaleString("es-CO")}</span>
            </div>

            <button onClick={emitirPreFactura} disabled={enviando}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors shadow-lg shadow-amber-100">
              {enviando ? "Registrando..." : "✓ REGISTRAR PRE-FACTURA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
