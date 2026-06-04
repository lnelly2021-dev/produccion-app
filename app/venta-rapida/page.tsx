"use client";
import { useState, useEffect } from "react";
import { ShoppingCart, ArrowLeft } from "lucide-react";
import SinTurno from "../components/SinTurno";
import QRPaymentModal from "../components/QRPaymentModal";
import { getNextConsecutivo } from "../../lib/consecutivo";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig, patchEmpresaConfig } from "../../lib/empresaStorage";

interface Item {
  id: string | number;
  nombre: string;
  precio: number;
  cantidad: number;
  categoria: string;
}

export default function VentaRapidaPage() {
  const { branch, company, user } = useAuth();
  const branchId   = branch?.id || "";
  const movKey     = branchId ? `movimientos_${branchId}` : "movimientos";
  const prodKey    = branchId ? `productos_${branchId}` : "productos";
  const cliKey     = branchId ? `clientes_${branchId}` : "clientes";
  const emplKey    = branchId ? `empleados_${branchId}` : "empleados";

  const [turnoActivo, setTurnoActivo] = useState<any>(() => {
    try {
      if (typeof window === "undefined") return null;
      // Leer con clave específica del branch activo
      const sel = JSON.parse(localStorage.getItem("smartpos_selection") || "{}");
      const bid = sel.branchId || "";
      if (bid) {
        const t = localStorage.getItem(`turno_actual_${bid}`);
        if (t) return JSON.parse(t);
      }
      return null;
    } catch { return null; }
  });

  // Actualizar cuando cambia de empresa
  useEffect(() => {
    if (!branchId) return;
    try {
      const t = localStorage.getItem(`turno_actual_${branchId}`);
      setTurnoActivo(t ? JSON.parse(t) : null);
    } catch { setTurnoActivo(null); }
  }, [branchId]);

  // ── Catálogo ────────────────────────────────────────────────────────────
  const [productos, setProductos] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem(prodKey) || "[]"); } catch { return []; }
  });
  const [filtro, setFiltro]                 = useState("");
  const [catSeleccionada, setCatSeleccionada] = useState("TODAS");
  const [preciosLibres, setPreciosLibres]   = useState<Record<string, string>>({});

  // ── Carrito — persiste en localStorage para sobrevivir navegación ──────────
  const [carrito, setCarritoRaw] = useState<Item[]>(() => {
    try { return JSON.parse(localStorage.getItem("carrito_activo") || "[]"); } catch { return []; }
  });
  const setCarrito = (val: Item[] | ((prev: Item[]) => Item[])) => {
    setCarritoRaw(prev => {
      const next = typeof val === "function" ? val(prev) : val;
      localStorage.setItem("carrito_activo", JSON.stringify(next));
      return next;
    });
  };
  const [vistaDrawer, setVistaDrawer]   = useState<"carrito" | "pago">("carrito");
  const [aplicarPropina, setAplicarPropina] = useState(true);
  const [propinaManual, setPropinaManual]   = useState<string>("");
  const [descuentoInput, setDescuentoInput] = useState<string>("");
  const [tipoImpConfig, setTipoImpConfig]  = useState<string>(() => {
    try { return getEmpresaConfig().tributario?.tipoImpuesto ?? "NINGUNO"; }
    catch { return "NINGUNO"; }
  });
  const [consecutivo, setConsecutivo]   = useState(1);

  // ── Pago ─────────────────────────────────────────────────────────────────
  const [tipoPago, setTipoPago]               = useState<"CONTADO" | "CRÉDITO">("CONTADO");
  const [pagos, setPagos]                     = useState<{medio:string; monto:string}[]>([{medio:"EFECTIVO",monto:""}]);
  const [clienteNombre, setClienteNombre]     = useState("");
  const [clienteContado, setClienteContado]   = useState("");
  const [listaBancos, setListaBancos]         = useState<string[]>([]);
  const [listaTerceros, setListaTerceros]     = useState<string[]>([]);
  const [mostrarFormNuevoCliente, setMostrarFormNuevoCliente] = useState(false);
  const [nuevoClienteForm, setNuevoClienteForm] = useState({ nombre: "", apellidos: "", identificacion: "", telefono: "", email: "", direccion: "" });
  const [showQRModal, setShowQRModal] = useState(false);

  // ── Empresa ───────────────────────────────────────────────────────────────
  const [empresa, setEmpresa] = useState<any>(() => {
    try { return getEmpresaConfig(); } catch { return {}; }
  });

  const cargarDatos = () => {
    const p = localStorage.getItem(prodKey);
    if (p) setProductos(JSON.parse(p));

    const ult = localStorage.getItem("ultimo_consecutivo");
    if (ult) setConsecutivo(parseInt(ult) + 1);

    const b = JSON.parse(localStorage.getItem("lista_bancos") || "null");
    if (b) setListaBancos(b);

    const cl = JSON.parse(localStorage.getItem(cliKey) || "[]");
    const em = JSON.parse(localStorage.getItem(emplKey) || "[]");
    const todosLocal = [...cl.map((c: any) => c.nombre || c.cliente), ...em.map((e: any) => e.nombre)].filter(Boolean);
    setListaTerceros([...new Set(todosLocal)] as string[]);

    setEmpresa(getEmpresaConfig());
  };

  useEffect(() => {
    cargarDatos();
    const onVisible = () => { if (document.visibilityState === "visible") cargarDatos(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Enriquecer lista de terceros desde API de contactos
  useEffect(() => {
    if (!branchId) return;
    Promise.all([
      api.get(`/branches/${branchId}/contactos?tipo=CLIENTE`).catch(() => ({ data: { data: [] } })),
      api.get(`/branches/${branchId}/contactos?tipo=EMPLEADO`).catch(() => ({ data: { data: [] } })),
    ]).then(([rCli, rEmp]) => {
      const apiClis = (rCli.data.data ?? rCli.data ?? []).map((c: any) => (c.nombre || "").toUpperCase()).filter(Boolean);
      const apiEmps = (rEmp.data.data ?? rEmp.data ?? []).map((e: any) => (e.nombre || "").toUpperCase()).filter(Boolean);
      setListaTerceros(prev => [...new Set([...prev, ...apiClis, ...apiEmps])] as string[]);
    });
  }, [branchId]);

  // Obtener impuesto desde MongoDB cada vez que se abre el drawer de pago
  useEffect(() => {
    if (vistaDrawer !== "pago") return;
    if (company?.id) {
      api.get(`/companies/${company.id}`)
        .then(({ data }) => {
          const tipo = (data.data ?? data)?.tributario?.tipoImpuesto;
          if (tipo) setTipoImpConfig(tipo);
        })
        .catch(() => {
          // Fallback a localStorage
          try {
            const tipo = getEmpresaConfig().tributario?.tipoImpuesto;
            if (tipo) setTipoImpConfig(tipo);
          } catch {}
        });
    } else {
      try {
        const tipo = getEmpresaConfig().tributario?.tipoImpuesto;
        if (tipo) setTipoImpConfig(tipo);
      } catch {}
    }
  }, [vistaDrawer, company?.id]);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/branches/${branchId}/products`)
      .then(({ data }) => {
        const lista = (data.data || data || []).map((p: any) => ({
          ...p, id: p._id?.toString() || p.id, precio: p.precioPublico ?? p.precio ?? 0,
        }));
        if (lista.length > 0) {
          setProductos(lista);
          localStorage.setItem(prodKey, JSON.stringify(lista));
        }
      })
      .catch(() => {});
    api.get(`/companies/${company?.id}/branches/${branchId}`)
      .then(r => {
        const bancos: string[] = r.data.data?.bancos ?? r.data?.bancos ?? [];
        if (bancos.length > 0) {
          setListaBancos(bancos);
          localStorage.setItem("lista_bancos", JSON.stringify(bancos));
        }
      })
      .catch(() => {});

    // Refrescar datos completos de empresa desde MongoDB
    if (company?.id) {
      api.get(`/companies/${company.id}`)
        .then(({ data }) => {
          const c = data.data ?? data;
          const patch: any = {};
          if (c.name)    patch.nombreEmpresa = c.name;
          if (c.taxId)   patch.nit           = c.taxId;
          if (c.phone)   patch.telefono      = c.phone;
          if (c.address) patch.direccion     = c.address;
          if (c.facturacion?.resolucion) patch.resolucion = c.facturacion.resolucion;
          if (c.propinas) patch.propinas = c.propinas;
          if (c.tributario?.tipoImpuesto && c.tributario.tipoImpuesto !== "NINGUNO") {
            patch.tributario = c.tributario;
          }
          setEmpresa((prev: any) => ({ ...prev, ...patch }));
          patchEmpresaConfig(patch);
        })
        .catch(() => {});
    }
  }, [branchId]);

  // Convierte cualquier formato de precio a número (maneja "5.000", "5,000", 5000)
  const fmt = (v: any): number => {
    if (typeof v === "number") return v;
    if (!v) return 0;
    return Number(String(v).replace(/\./g, "").replace(/,/g, "")) || 0;
  };

  // ── Lógica carrito ────────────────────────────────────────────────────────
  const agregarAlCarrito = (p: any, tipo: string, custom?: number) => {
    const precio = custom !== undefined ? custom : fmt(p[tipo]);
    if (precio <= 0) return;
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.id === p.id && i.precio === precio);
      if (idx !== -1) return prev.map((i, n) => n === idx ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { id: p.id, nombre: p.nombre, precio, cantidad: 1, categoria: p.categoria }];
    });
  };

  const cambiarCantidad = (id: string | number, precio: number, delta: number) =>
    setCarrito(prev =>
      prev.map(i => i.id === id && i.precio === precio ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
          .filter(i => i.cantidad > 0)
    );

  const totalVenta    = carrito.reduce((a, i) => a + i.precio * i.cantidad, 0);
  const descuento     = Math.max(0, parseInt(descuentoInput) || 0);
  const baseConDesc   = Math.max(0, totalVenta - descuento);
  const propCfgDrw    = (empresa as any).propinas ?? { activo: true, porcentaje: 10 };
  const propinaPct    = Math.round(totalVenta * (propCfgDrw.porcentaje ?? 10) / 100);
  const propinaDrw    = aplicarPropina ? (propinaManual !== "" ? (parseInt(propinaManual) || 0) : propinaPct) : 0;
  const taxRateDrw    = tipoImpConfig === "IVA_19" ? 0.19 : tipoImpConfig === "IPC_8" ? 0.08 : 0;
  const impuestoDrw   = Math.round(baseConDesc * taxRateDrw);
  const labelImpuesto = tipoImpConfig === "IVA_19" ? "IVA (19%)" : tipoImpConfig === "IPC_8" ? "IpoConsumo (8%)" : "";
  const totalConProp  = baseConDesc + impuestoDrw + propinaDrw;
  const totalPagado   = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const pendiente     = totalConProp - totalPagado;
  const vuelto        = totalPagado - totalConProp;
  const mediosPago    = ["EFECTIVO", ...Array.from(new Set([...listaBancos, "NEQUI", "DAVIPLATA", "TRANSFERENCIA"])), "QR"];
  const medioFinal    = tipoPago === "CRÉDITO" ? "CRÉDITO" : (pagos[0]?.medio || "EFECTIVO");

  const sinMontos  = pagos.every(p => !p.monto);
  const puedePagar =
    carrito.length > 0 &&
    (tipoPago === "CRÉDITO"
      ? clienteNombre.trim().length > 0
      : sinMontos || totalPagado >= totalConProp);

  // ── Facturación ───────────────────────────────────────────────────────────
  const emitirFactura = async () => {
    if (tipoPago === "CRÉDITO" && !clienteNombre.trim()) return;
    if (tipoPago === "CONTADO" && totalPagado < totalConProp) return;

    const w = window.open("", "_blank");
    w?.document.write(`<html><body style="font-family:'Courier New',monospace;width:80mm;padding:20px;text-align:center;color:#666">Generando factura...</body></html>`);

    const nroNum    = await getNextConsecutivo(branchId);
    const nroFact   = `FR-${nroNum}`;
    const cliente   = tipoPago === "CRÉDITO"
      ? clienteNombre.toUpperCase()
      : clienteContado.trim() ? clienteContado.toUpperCase() : "CONSUMIDOR FINAL";

    const pagosFinal = tipoPago === "CONTADO"
      ? (sinMontos
          ? [{ medio: pagos[0]?.medio || "EFECTIVO", monto: String(totalConProp) }]
          : pagos.filter(p => parseFloat(p.monto) > 0))
      : [];

    const tipoImpuestoVR = tipoImpConfig;
    const subtotalVR     = totalVenta;
    const descuentoVR    = descuento;
    const impuestoVR     = impuestoDrw;
    const propinaVR      = propinaDrw;
    const valorTotalVR   = baseConDesc + impuestoVR + propinaVR;

    // Registrar en el API
    try {
      await api.post(`/branches/${branchId}/ventas`, {
        nroFactura: nroFact,
        cliente,
        tipoPago,
        medioPago:  pagosFinal.length > 1 ? "MIXTO" : medioFinal,
        pagos:      pagosFinal.map(p => ({ medio: p.medio, monto: parseFloat(p.monto) || 0 })),
        productos:  carrito.map(i => ({
          productoId: String(i.id || ""),
          nombre:     i.nombre,
          cantidad:   i.cantidad,
          precio:     i.precio,
          subtotal:   i.precio * i.cantidad,
        })),
        subtotal:  subtotalVR,
        descuento: descuentoVR,
        impuesto:  impuestoVR,
        propina:   propinaVR,
        envio:     0,
        valor:     valorTotalVR,
      });
    } catch {
      toast("error", "Error al registrar la venta. Intenta de nuevo.");
      return;
    }

    // Puente localStorage para módulos aún no migrados
    const medioPuente = pagosFinal.length > 1 ? "MIXTO" : medioFinal;
    const mov = {
      id: Date.now(), nroFactura: nroFact, fecha: new Date().toISOString(),
      categoria: "ingreso", concepto: "Venta Rápida", valor: valorTotalVR,
      subtotal: subtotalVR, descuento: descuentoVR, impuesto: impuestoVR, propina: propinaVR,
      cliente, tipoVenta: tipoPago, medioPago: medioPuente,
      pagos: pagosFinal, productos: carrito,
      estado: tipoPago === "CONTADO" ? "Pagada" : "Pendiente",
    };
    const movs = JSON.parse(localStorage.getItem(movKey) || "[]");
    localStorage.setItem(movKey, JSON.stringify([mov, ...movs]));

    if (tipoPago === "CRÉDITO") {
      const cxc = JSON.parse(localStorage.getItem("cxc") || "[]");
      localStorage.setItem("cxc", JSON.stringify([
        { id: Date.now(), tercero: cliente, nroFactura: nroFact,
          fecha: new Date().toISOString(), valor: totalConProp, tipoMov: "DEUDA" },
        ...cxc,
      ]));
    }

    // Imprimir ticket
    w?.document.write(`<html><head><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:5px;margin:0;font-size:11px}
      .c{text-align:center}.b{font-weight:bold}
      .hr{border-top:1px dashed #000;margin:7px 0}
      .row{display:flex;justify-content:space-between}
      table{width:100%;font-size:11px;border-collapse:collapse}
      td.r{text-align:right}
    </style></head><body>
      <div class="c b">${empresa.nombreEmpresa}</div>
      <div class="c">NIT: ${empresa.nit} | Tel: ${empresa.telefono}</div>
      <div class="c">${empresa.direccion}</div>
      <div class="hr"></div>
      <div class="c b" style="font-size:13px">FACTURA No: ${nroFact}</div>
      <div class="hr"></div>
      <div>FECHA: ${new Date().toLocaleString("es-CO")}</div>
      <div>CAJERO: ${user?.name?.toUpperCase() || "—"}</div>
      <div>CLIENTE: ${cliente}</div>
      <div class="hr"></div>
      <table><thead><tr>
        <th align="left">CANT</th><th align="left">DESCRIPCIÓN</th><th align="right">TOTAL</th>
      </tr></thead><tbody>
        ${carrito.map(i => `<tr>
          <td>${i.cantidad}</td>
          <td>${i.nombre.substring(0,18).toUpperCase()}</td>
          <td align="right">$${(i.precio*i.cantidad).toLocaleString("es-CO")}</td>
        </tr>`).join("")}
      </tbody></table>
      <div class="hr"></div>
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        <tr><td>SUBTOTAL</td><td class="r">$${subtotalVR.toLocaleString("es-CO")}</td></tr>
        ${descuentoVR > 0 ? `<tr><td>DESCUENTO</td><td class="r">-$${descuentoVR.toLocaleString("es-CO")}</td></tr>` : ""}
        ${impuestoVR > 0 ? `<tr><td>${tipoImpuestoVR === "IVA_19" ? "IVA 19%" : "IpoConsumo 8%"}</td><td class="r">$${impuestoVR.toLocaleString("es-CO")}</td></tr>` : ""}
        ${propinaVR > 0 ? `<tr><td>PROPINA${propinaManual !== "" ? " (LIBRE)" : ` (${propCfgDrw.porcentaje}%)`}</td><td class="r">$${propinaVR.toLocaleString("es-CO")}</td></tr>` : ""}
        <tr class="b" style="font-size:13px"><td>TOTAL</td><td class="r">$${valorTotalVR.toLocaleString("es-CO")}</td></tr>
      </table>
      ${tipoPago !== "CRÉDITO" && (pagosFinal.length > 1 || vuelto > 0) ? `
        <div class="hr"></div>
        ${pagosFinal.length > 1 ? pagosFinal.map(p => `<div class="row"><span>${p.medio}</span><span>$${parseFloat(p.monto).toLocaleString("es-CO")}</span></div>`).join("") : `<div class="row"><span>${medioFinal}</span><span>$${totalPagado.toLocaleString("es-CO")}</span></div>`}
        ${vuelto > 0 ? `<div class="row b"><span>CAMBIO:</span><span>$${vuelto.toLocaleString("es-CO")}</span></div>` : ""}
      ` : `<div class="hr"></div><div class="row"><span>PAGO:</span><span>${pagosFinal.length > 1 ? "MIXTO" : medioFinal}</span></div>`}
      <div class="hr"></div>
      <div class="c" style="font-size:9px">${empresa.resolucion || ""}</div>
      <div class="c b">¡GRACIAS!</div>
      <script>window.print();window.close();</script>
    </body></html>`);
    w?.document.close();

    localStorage.removeItem("carrito_activo");
    setConsecutivo(nroNum + 1);
    setCarrito([]); setVistaDrawer("carrito");
    setTipoPago("CONTADO");
    setPagos([{medio:"EFECTIVO", monto:""}]);
    setClienteNombre(""); setClienteContado("");
    setDescuentoInput(""); setPropinaManual("");
  };

  // Guardar cliente completo desde la factura
  const guardarNuevoClienteCompleto = () => {
    if (!nuevoClienteForm.nombre.trim()) return;
    const clientes = JSON.parse(localStorage.getItem(cliKey) || "[]");
    const yaExiste = clientes.some((c: any) =>
      (c.nombre || c.cliente || "").toUpperCase() === nuevoClienteForm.nombre.toUpperCase()
    );
    if (!yaExiste) {
      const nuevo = {
        id: Date.now(),
        nombre:        nuevoClienteForm.nombre.toUpperCase(),
        apellidos:     nuevoClienteForm.apellidos.toUpperCase(),
        identificacion: nuevoClienteForm.identificacion,
        telefono:      nuevoClienteForm.telefono,
        email:         nuevoClienteForm.email,
        direccion:     nuevoClienteForm.direccion.toUpperCase(),
      };
      localStorage.setItem(cliKey, JSON.stringify([nuevo, ...clientes]));
      setListaTerceros(prev => [nuevo.nombre, ...prev]);
    }
    setClienteContado(nuevoClienteForm.nombre.toUpperCase());
    setNuevoClienteForm({ nombre: "", apellidos: "", identificacion: "", telefono: "", email: "", direccion: "" });
    setMostrarFormNuevoCliente(false);
  };

  const normCat = (c: any) => (c || "").trim().toUpperCase();
  const categorias = ["TODAS", ...Array.from(new Set(productos.map((p: any) => normCat(p.categoria)))).filter(Boolean)];
  const filtrados  = productos
    .filter(p =>
      (p.nombre || "").toLowerCase().includes(filtro.toLowerCase()) &&
      (catSeleccionada === "TODAS" || normCat(p.categoria) === catSeleccionada)
    )
    .sort((a, b) => {
      const cat = normCat(a.categoria).localeCompare(normCat(b.categoria));
      return cat !== 0 ? cat : (a.nombre || "").localeCompare(b.nombre || "");
    });

  // ── Guard: sin turno ──────────────────────────────────────────────────────
  if (!turnoActivo) {
    return <SinTurno onTurnoAbierto={t => setTurnoActivo(t)} branchId={branchId} />;
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-100 p-4 gap-4 overflow-hidden">

      {/* ── GRILLA PRODUCTOS ── */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        <div className="flex gap-3">
          <input
            className="flex-1 p-3.5 rounded-2xl shadow-sm border-0 font-bold uppercase text-sm outline-none bg-white"
            placeholder="Buscar producto..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
          />
          <select
            className="p-3.5 rounded-2xl shadow-sm border-0 font-black uppercase text-[10px] bg-white outline-none"
            value={catSeleccionada}
            onChange={e => setCatSeleccionada(e.target.value)}
          >
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-10 content-start">
          {filtrados.map((p: any) => {
            const tienePrecio = fmt(p.precioPublico || p.precio) > 0 || fmt(p.precioMayorista) > 0;
            return (
            <div key={p.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
              {p.foto && (
                <img src={p.foto} alt={p.nombre} className="w-full h-24 object-cover" onError={e => (e.currentTarget.style.display = "none")} />
              )}
              {/* Header */}
              <div className="bg-gray-50 px-5 pt-4 pb-3 border-b border-gray-100">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{p.categoria || "SIN CATEGORÍA"}</span>
                <p className="font-black text-[13px] text-gray-800 uppercase leading-tight mt-1 h-10 overflow-hidden">{p.nombre || "—"}</p>
              </div>

              <div className="p-4 flex flex-col gap-2">
                {/* Precio público */}
                {fmt(p.precioPublico || p.precio) > 0 && (
                  <button onClick={() => agregarAlCarrito(p, "precioPublico", fmt(p.precioPublico || p.precio))}
                    className="flex justify-between items-center w-full bg-white border border-gray-200 hover:bg-gray-50 px-3.5 py-2.5 rounded-xl transition-all">
                    <span className="text-[9px] font-black bg-amber-400 text-white px-2 py-0.5 rounded-md">PÚB</span>
                    <span className="text-[13px] font-black text-gray-900">${fmt(p.precioPublico || p.precio).toLocaleString("es-CO")}</span>
                  </button>
                )}
                {fmt(p.precioMayorista) > 0 && (
                  <button onClick={() => agregarAlCarrito(p, "precioMayorista", fmt(p.precioMayorista))}
                    className="flex justify-between items-center w-full bg-white border border-gray-200 hover:bg-gray-50 px-3.5 py-2.5 rounded-xl transition-all">
                    <span className="text-[9px] font-black bg-sky-500 text-white px-2 py-0.5 rounded-md">MAY</span>
                    <span className="text-[13px] font-black text-gray-900">${fmt(p.precioMayorista).toLocaleString("es-CO")}</span>
                  </button>
                )}

                {/* Precio libre — más visible cuando no hay precios fijos */}
                <div className={`flex gap-1.5 ${!tienePrecio ? "mt-1" : "mt-0.5"}`}>
                  <input
                    type="number"
                    placeholder={tienePrecio ? "Precio libre" : "$ Ingresar precio..."}
                    value={preciosLibres[p.id] || ""}
                    onChange={e => setPreciosLibres(prev => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const v = parseFloat(preciosLibres[p.id] || "0");
                        if (v > 0) { agregarAlCarrito(p, "", v); setPreciosLibres(prev => ({ ...prev, [p.id]: "" })); }
                      }
                    }}
                    className={`flex-1 min-w-0 border px-2 rounded-lg text-[9px] font-bold outline-none focus:border-gray-400 ${
                      tienePrecio
                        ? "bg-gray-50 border-gray-200 py-1.5"
                        : "bg-slate-800 border-slate-700 text-white placeholder-slate-400 py-2.5 text-[10px]"
                    }`}
                  />
                  <button
                    onClick={() => {
                      const v = parseFloat(preciosLibres[p.id] || "0");
                      if (v > 0) { agregarAlCarrito(p, "", v); setPreciosLibres(prev => ({ ...prev, [p.id]: "" })); }
                    }}
                    className={`text-white rounded-md font-black text-sm hover:bg-black transition-all shrink-0 flex items-center justify-center ${
                      tienePrecio ? "bg-gray-800 w-6 h-6" : "bg-slate-800 w-8 h-8 rounded-xl"
                    }`}
                  >+</button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* ── DRAWER DERECHO ── */}
      <div className="w-[380px] bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#1a2b3c] px-6 py-5 shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Venta Rápida</p>
              <p className="text-white font-black text-xl tracking-tighter">#FR-{consecutivo}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-white/40 uppercase">{carrito.length} ítem(s)</p>
              <p className="text-white font-black text-xl">${totalConProp.toLocaleString("es-CO")}</p>
            </div>
          </div>
        </div>

        {/* Volver al pedido */}
        {vistaDrawer === "pago" && (
          <button
            onClick={() => setVistaDrawer("carrito")}
            className="flex items-center gap-2 px-5 py-3 text-[10px] font-black text-blue-600 uppercase hover:bg-blue-50 transition-colors border-b border-gray-100 shrink-0"
          >
            <ArrowLeft size={13} /> Volver al pedido
          </button>
        )}

        {/* ── VISTA CARRITO ── */}
        {vistaDrawer === "carrito" && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {carrito.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-200 gap-3 py-16">
                  <ShoppingCart size={44} strokeWidth={1.2} />
                  <p className="font-black uppercase text-[10px] tracking-widest text-gray-300">Carrito vacío</p>
                </div>
              ) : carrito.map((item, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 px-3 py-2.5 rounded-2xl border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase text-gray-800 leading-tight truncate">{item.nombre}</p>
                    <p className="text-[9px] text-gray-400 font-bold mt-0.5">${item.precio.toLocaleString("es-CO")} c/u</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => cambiarCantidad(item.id, item.precio, -1)}
                      className="w-7 h-7 flex items-center justify-center bg-white rounded-lg shadow-sm border border-gray-100 text-red-500 font-black text-base">−</button>
                    <span className="font-black text-gray-900 text-sm w-5 text-center">{item.cantidad}</span>
                    <button onClick={() => cambiarCantidad(item.id, item.precio, 1)}
                      className="w-7 h-7 flex items-center justify-center bg-white rounded-lg shadow-sm border border-gray-100 text-green-500 font-black text-base">+</button>
                  </div>
                  <p className="font-black text-gray-900 text-sm shrink-0 w-[72px] text-right">
                    ${(item.precio * item.cantidad).toLocaleString("es-CO")}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-4 pb-5 pt-3 border-t border-gray-100 shrink-0">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black text-gray-400 uppercase">Subtotal productos</span>
                <span className="text-2xl font-black text-gray-900">${totalVenta.toLocaleString("es-CO")}</span>
              </div>
              <button
                disabled={carrito.length === 0}
                onClick={() => setVistaDrawer("pago")}
                className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black uppercase text-[11px] shadow-lg hover:bg-orange-700 active:scale-95 transition-all disabled:bg-gray-100 disabled:text-gray-300"
              >
                Cobrar / Facturar →
              </button>
            </div>
          </>
        )}

        {/* ── VISTA PAGO ── */}
        {vistaDrawer === "pago" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Total */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                {/* Subtotal siempre visible */}
                <div className="flex justify-between text-xs text-gray-400 font-bold mb-1">
                  <span>Subtotal</span><span>${totalVenta.toLocaleString("es-CO")}</span>
                </div>
                {/* Descuento */}
                <div className="flex justify-between items-center mb-2 gap-2">
                  <span className="text-[9px] font-black text-gray-400 uppercase">Descuento</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-gray-400">$</span>
                    <input
                      type="number"
                      min="0"
                      value={descuentoInput}
                      onChange={e => setDescuentoInput(e.target.value)}
                      className="w-24 text-right text-xs font-black text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-300"
                      placeholder="0"
                    />
                  </div>
                </div>
                {/* Propina — siempre visible */}
                <div className="flex justify-between items-center mb-2 gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-black text-gray-400 uppercase">
                      Propina ({propCfgDrw.porcentaje ?? 10}%)
                    </span>
                    <button onClick={() => { setAplicarPropina(v => !v); setPropinaManual(""); }}
                      className={`text-[9px] font-black px-2 py-0.5 rounded-full transition-all ${aplicarPropina ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-400"}`}>
                      {aplicarPropina ? "SÍ" : "NO"}
                    </button>
                  </div>
                  {aplicarPropina ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-gray-400">$</span>
                      <input
                        type="number"
                        value={propinaManual !== "" ? propinaManual : propinaPct}
                        onFocus={() => { if (propinaManual === "") setPropinaManual(String(propinaPct)); }}
                        onChange={e => setPropinaManual(e.target.value)}
                        className="w-24 text-right text-xs font-black text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-300"
                      />
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-gray-400">$0</span>
                  )}
                </div>
                {/* Impuesto según configuración */}
                {labelImpuesto && (
                  <div className="flex justify-between items-center mb-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-[9px] font-black text-gray-500 uppercase">{labelImpuesto}</span>
                    <span className="text-xs font-black text-gray-700">${impuestoDrw.toLocaleString("es-CO")}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 mt-1 pt-2" />
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Total a cobrar</p>
                <p className="text-3xl font-black text-gray-900 text-center">${totalConProp.toLocaleString("es-CO")}</p>
              </div>

              {/* Tab CONTADO / CRÉDITO */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl">
                {(["CONTADO", "CRÉDITO"] as const).map(t => (
                  <button key={t} onClick={() => setTipoPago(t)}
                    className={`flex-1 py-3 rounded-xl font-black uppercase text-[11px] transition-all ${tipoPago === t
                      ? (t === "CONTADO" ? "bg-white text-orange-600 shadow-sm" : "bg-white text-blue-600 shadow-sm")
                      : "text-gray-400"}`}>
                    {t}
                  </button>
                ))}
              </div>

              {tipoPago === "CRÉDITO" ? (
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Cliente / Deudor</label>
                  <input
                    list="terceros-list"
                    className="w-full p-4 bg-blue-50 rounded-2xl font-bold uppercase border-2 border-blue-200 outline-none"
                    placeholder="NOMBRE DEL CLIENTE..."
                    value={clienteNombre}
                    onChange={e => setClienteNombre(e.target.value.toUpperCase())}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Tercero opcional en contado */}
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Facturar a nombre de (opcional)</label>
                    <div className="flex gap-2">
                      <input
                        list="terceros-contado"
                        className="flex-1 p-3 bg-gray-50 rounded-2xl font-bold uppercase text-sm outline-none border border-gray-200 focus:border-gray-400"
                        placeholder="CONSUMIDOR FINAL"
                        value={clienteContado}
                        onChange={e => { setClienteContado(e.target.value.toUpperCase()); setMostrarFormNuevoCliente(false); }}
                      />
                      <datalist id="terceros-contado">
                        {listaTerceros.map((t, i) => <option key={i} value={t} />)}
                      </datalist>
                      {clienteContado.trim() && !listaTerceros.includes(clienteContado.trim()) && (
                        <button
                          onClick={() => { setMostrarFormNuevoCliente(v => !v); setNuevoClienteForm(f => ({ ...f, nombre: clienteContado.trim() })); }}
                          className="shrink-0 bg-emerald-600 text-white px-3 py-2 rounded-xl font-black text-[9px] uppercase hover:bg-emerald-700 transition-all"
                        >{mostrarFormNuevoCliente ? "✕" : "+ Crear"}</button>
                      )}
                    </div>
                    {mostrarFormNuevoCliente && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2 mt-2">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Nuevo Cliente</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="Nombre *" value={nuevoClienteForm.nombre}
                            onChange={e => setNuevoClienteForm(n => ({ ...n, nombre: e.target.value.toUpperCase() }))}
                            className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none uppercase" />
                          <input placeholder="Apellidos" value={nuevoClienteForm.apellidos}
                            onChange={e => setNuevoClienteForm(n => ({ ...n, apellidos: e.target.value.toUpperCase() }))}
                            className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none uppercase" />
                          <input placeholder="Identificación" value={nuevoClienteForm.identificacion}
                            onChange={e => setNuevoClienteForm(n => ({ ...n, identificacion: e.target.value }))}
                            className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none" />
                          <input placeholder="Teléfono" value={nuevoClienteForm.telefono}
                            onChange={e => setNuevoClienteForm(n => ({ ...n, telefono: e.target.value }))}
                            className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none" />
                          <input placeholder="E-mail" value={nuevoClienteForm.email}
                            onChange={e => setNuevoClienteForm(n => ({ ...n, email: e.target.value }))}
                            className="col-span-2 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none" />
                          <input placeholder="Dirección" value={nuevoClienteForm.direccion}
                            onChange={e => setNuevoClienteForm(n => ({ ...n, direccion: e.target.value.toUpperCase() }))}
                            className="col-span-2 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none uppercase" />
                        </div>
                        <button onClick={guardarNuevoClienteCompleto}
                          className="w-full bg-emerald-600 text-white py-2 rounded-lg font-black text-[9px] uppercase hover:bg-emerald-700 transition-all">
                          Guardar Cliente
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Pagos — uno o varios medios */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Medios de Pago</label>
                    {pagos.map((pago, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={pago.medio}
                          onChange={e => setPagos(prev => prev.map((p, i) => i === idx ? {...p, medio: e.target.value} : p))}
                          className="bg-gray-100 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase outline-none"
                        >
                          {mediosPago.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <div className="flex-1 flex items-center bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2 focus-within:border-orange-400 transition-colors">
                          <span className="text-gray-400 font-black mr-1">$</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={pago.monto}
                            data-pago-idx={idx}
                            onChange={e => setPagos(prev => prev.map((p, i) => i === idx ? {...p, monto: e.target.value} : p))}
                            onKeyDown={e => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              const next = document.querySelector<HTMLInputElement>(`input[data-pago-idx="${idx + 1}"]`);
                              if (next) { next.focus(); next.select(); }
                              else (document.querySelector<HTMLButtonElement>("[data-emitir-btn]"))?.focus();
                            }}
                            className="flex-1 bg-transparent outline-none font-black text-gray-900"
                          />
                        </div>
                        {pagos.length > 1 && (
                          <button onClick={() => setPagos(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 font-black text-lg px-1">×</button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setPagos(prev => [...prev, {medio: mediosPago.find(m => !prev.some(p => p.medio === m)) || "EFECTIVO", monto:""}])}
                      className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest"
                    >+ Agregar otro medio de pago</button>
                  </div>

                  {/* Resumen de pagos */}
                  {totalPagado > 0 && (
                    <div className="space-y-2">
                      {pagos.filter(p => parseFloat(p.monto) > 0).length > 1 && (
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 space-y-1">
                          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Detalle pago mixto</p>
                          {pagos.filter(p => parseFloat(p.monto) > 0).map((p, i) => (
                            <div key={i} className="flex justify-between text-xs font-black text-blue-700">
                              <span>{p.medio}</span>
                              <span>${parseFloat(p.monto).toLocaleString("es-CO")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={`flex justify-between items-center p-4 rounded-2xl font-black ${
                        pendiente <= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                       : "bg-red-50 text-red-600 border border-red-100"
                      }`}>
                        <span className="text-[11px] uppercase">{pendiente <= 0 ? "Cambio / Devolver" : "Falta"}</span>
                        <span className="text-2xl">${Math.abs(pendiente <= 0 ? vuelto : pendiente).toLocaleString("es-CO")}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Botón emitir */}
            <div className="px-6 pb-6 pt-4 border-t border-gray-100 shrink-0">
              <button
                data-emitir-btn
                onClick={() => {
                  if (medioFinal === "QR") { setShowQRModal(true); return; }
                  emitirFactura();
                }}
                disabled={!puedePagar}
                className="w-full bg-[#1a2b3c] text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl hover:bg-black transition-all disabled:bg-gray-100 disabled:text-gray-300 active:scale-95"
              >
                Emitir Factura
              </button>
            </div>

            {showQRModal && (
              <QRPaymentModal
                monto={totalConProp}
                onConfirm={() => { setShowQRModal(false); emitirFactura(); }}
                onCancel={() => setShowQRModal(false)}
              />
            )}
          </div>
        )}
      </div>

      <datalist id="terceros-list">{listaTerceros.map((t, i) => <option key={i} value={t} />)}</datalist>
    </div>
  );
}
