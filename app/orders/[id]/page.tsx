"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Utensils } from "lucide-react";
import SinTurno from "../../components/SinTurno";
import QRPaymentModal from "../../components/QRPaymentModal";
import { getNextConsecutivo } from "../../../lib/consecutivo";
import api from "../../../lib/api";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "../../../lib/toaster";
import { getEmpresaConfig, patchEmpresaConfig } from "../../../lib/empresaStorage";

export default function OrderPage() {
  const params   = useParams();
  const router   = useRouter();
  const { branch, company } = useAuth();
  const branchId  = branch?.id || "";
  const movKey    = branchId ? `movimientos_${branchId}` : "movimientos";
  const prodKey   = branchId ? `productos_${branchId}` : "productos";
  const mesasKey  = branchId ? `mesas_${branchId}` : "mesas";
  const cliKey    = branchId ? `clientes_${branchId}` : "clientes";
  const emplKey   = branchId ? `empleados_${branchId}` : "empleados";
  const mesaId   = typeof params.id === "string" ? params.id
    : Array.isArray(params.id) ? params.id[0] : "";
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Catálogo ─────────────────────────────────────────────────────────────
  const [productosTotales, setProductosTotales] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem(prodKey) || "[]"); } catch { return []; }
  });
  const [filtro, setFiltro]                     = useState("");
  const [catSeleccionada, setCatSeleccionada]   = useState("TODAS");
  const [preciosLibres, setPreciosLibres]       = useState<Record<string, string>>({});
  const [cargando, setCargando]                 = useState(true);

  // ── Pedido ───────────────────────────────────────────────────────────────
  const [pedido, setPedido]           = useState<any[]>([]);
  const [vistaDrawer, setVistaDrawer] = useState<"pedido" | "pago">("pedido");

  // ── Info mesa ────────────────────────────────────────────────────────────
  const [mesero,     setMesero]     = useState("");
  const [mesaNombre, setMesaNombre] = useState("Mesa");

  // ── Pago ─────────────────────────────────────────────────────────────────
  const [aplicarPropina, setAplicarPropina]    = useState(true);
  const [propinaManual, setPropinaManual]      = useState<string>("");
  const [descuentoInput, setDescuentoInput]    = useState<string>("");
  const [tipoImpConfig, setTipoImpConfig]     = useState<string>(() => {
    try { return getEmpresaConfig().tributario?.tipoImpuesto ?? "NINGUNO"; }
    catch { return "NINGUNO"; }
  });
  const [tipoPago, setTipoPago]               = useState<"CONTADO" | "CRÉDITO">("CONTADO");
  const [pagos, setPagos]                     = useState<{medio:string; monto:string}[]>([{medio:"EFECTIVO", monto:""}]);
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

  useEffect(() => {
    if (!branchId || !mesaId) return;

    // Productos: API primero, localStorage como fallback
    api.get(`/branches/${branchId}/products`)
      .then(({ data }) => {
        const lista = (data.data || data || []).map((p: any) => ({
          ...p, id: p._id?.toString() || p.id, precio: p.precioPublico ?? p.precio ?? 0,
        }));
        if (lista.length > 0) {
          setProductosTotales(lista);
          localStorage.setItem(prodKey, JSON.stringify(lista));
        } else {
          const prods = localStorage.getItem(prodKey);
          if (prods) setProductosTotales(JSON.parse(prods));
        }
      })
      .catch(() => {
        const prods = localStorage.getItem(prodKey);
        if (prods) setProductosTotales(JSON.parse(prods));
      });

    // Bancos: API primero, localStorage como fallback
    api.get(`/companies/${company?.id}/branches/${branchId}`)
      .then(r => {
        const bancos: string[] = r.data.data?.bancos ?? r.data?.bancos ?? [];
        if (bancos.length > 0) setListaBancos(bancos);
        else {
          const b = JSON.parse(localStorage.getItem("lista_bancos") || "null");
          if (b?.length > 0) setListaBancos(b);
        }
      })
      .catch(() => {
        const b = JSON.parse(localStorage.getItem("lista_bancos") || "null");
        if (b?.length > 0) setListaBancos(b);
      });

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

    // Cargar terceros desde localStorage como base
    const emps = JSON.parse(localStorage.getItem(emplKey) || "[]");
    const clis = JSON.parse(localStorage.getItem(cliKey)  || "[]");
    const todosLocal = [...clis.map((c: any) => c.nombre || c.cliente), ...emps.map((e: any) => e.nombre)].filter(Boolean);
    setListaTerceros([...new Set(todosLocal)] as string[]);

    // Enriquecer con la API de contactos (clientes + empleados)
    if (branchId) {
      Promise.all([
        api.get(`/branches/${branchId}/contactos?tipo=CLIENTE`).catch(() => ({ data: { data: [] } })),
        api.get(`/branches/${branchId}/contactos?tipo=EMPLEADO`).catch(() => ({ data: { data: [] } })),
      ]).then(([rCli, rEmp]) => {
        const apiClis = (rCli.data.data ?? rCli.data ?? []).map((c: any) => (c.nombre || "").toUpperCase()).filter(Boolean);
        const apiEmps = (rEmp.data.data ?? rEmp.data ?? []).map((e: any) => (e.nombre || "").toUpperCase()).filter(Boolean);
        setListaTerceros(prev => [...new Set([...prev, ...apiClis, ...apiEmps])] as string[]);
      });
    }
    setEmpresa(getEmpresaConfig());

    // Mesero y nombre de mesa desde localStorage (sincronizado por tables/page)
    const mesas = JSON.parse(localStorage.getItem(mesasKey) || "[]");
    const mesaActual = mesas.find((m: any) => String(m._id || m.id) === mesaId);
    setMesero(mesaActual?.mesero || "");
    setMesaNombre(mesaActual?.nombre || "Mesa");

    // Pedido activo: cargar desde API
    api.get(`/branches/${branchId}/mesas/${mesaId}/pedido`)
      .then(({ data }) => {
        const items = data.data?.items || [];
        // Convertir formato API → formato local
        const itemsLocal = items.map((i: any) => ({
          ...i,
          id:       i.productoId,
          precio:   Number(i.precio) || 0,
          cantidad: Number(i.cantidad) || 0,
        }));
        setPedido(itemsLocal);
      })
      .catch(() => {
        // Fallback localStorage
        const peds = localStorage.getItem("pedidos");
        if (peds) setPedido(JSON.parse(peds)[mesaId] || []);
      })
      .finally(() => setCargando(false));
  }, [branchId, mesaId]);

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

  // ── Lógica productos ──────────────────────────────────────────────────────
  const fmt = (v: any) => {
    if (typeof v === "number") return v;
    if (!v) return 0;
    return Number(v.toString().replace(/\./g, "").replace(/,/g, "")) || 0;
  };

  // Guarda el pedido al API con debounce de 800ms
  const programarGuardadoAPI = (items: any[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!branchId || !mesaId) return;
      const itemsAPI = items.map(i => ({
        productoId: String(i._id || i.id || ""),
        nombre:     i.nombre,
        cantidad:   i.cantidad,
        precio:     i.precio,
        subtotal:   i.precio * i.cantidad,
      }));
      api.put(`/branches/${branchId}/mesas/${mesaId}/pedido`, { items: itemsAPI }).catch(() => {});
    }, 800);
  };

  const gestionarProducto = (p: any, accion: "sumar" | "restar", precioCustom?: number) => {
    const precio = precioCustom !== undefined ? precioCustom : fmt(p.precioPublico || p.precio);
    if (accion === "sumar" && precio <= 0) return;

    setPedido(prev => {
      const idx = prev.findIndex(i => i.id === p.id && i.precio === precio);
      let nuevo = [...prev];
      if (idx !== -1) {
        nuevo[idx] = { ...nuevo[idx], cantidad: nuevo[idx].cantidad + (accion === "sumar" ? 1 : -1) };
        if (nuevo[idx].cantidad <= 0) nuevo.splice(idx, 1);
      } else if (accion === "sumar") {
        nuevo.push({ ...p, precio, cantidad: 1 });
      }
      // Puente localStorage
      const globales = JSON.parse(localStorage.getItem("pedidos") || "{}");
      globales[mesaId] = nuevo;
      localStorage.setItem("pedidos", JSON.stringify(globales));
      // Guardar en API con debounce
      programarGuardadoAPI(nuevo);
      return nuevo;
    });
  };

  const totalFinal      = pedido.reduce((a, i) => a + i.precio * i.cantidad, 0);
  const descuento       = Math.max(0, parseInt(descuentoInput) || 0);
  const baseConDesc     = Math.max(0, totalFinal - descuento);
  const propCfgOrd      = (empresa as any).propinas ?? { activo: true, porcentaje: 10 };
  const propinaPctOrd   = Math.round(totalFinal * (propCfgOrd.porcentaje ?? 10) / 100);
  const propinaDrwOrd   = aplicarPropina ? (propinaManual !== "" ? (parseInt(propinaManual) || 0) : propinaPctOrd) : 0;
  const taxRateDrwOrd   = tipoImpConfig === "IVA_19" ? 0.19 : tipoImpConfig === "IPC_8" ? 0.08 : 0;
  const impuestoDrwOrd  = Math.round(baseConDesc * taxRateDrwOrd);
  const labelImpuestoOrd = tipoImpConfig === "IVA_19" ? "IVA (19%)" : tipoImpConfig === "IPC_8" ? "IpoConsumo (8%)" : "";
  const totalConPropOrd = baseConDesc + impuestoDrwOrd + propinaDrwOrd;
  const totalPagado  = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const pendiente    = totalConPropOrd - totalPagado;
  const vuelto       = totalPagado - totalConPropOrd;
  const mediosPago   = ["EFECTIVO", "NEQUI", "DAVIPLATA", "TRANSFERENCIA", ...listaBancos, "QR"]
    .filter((v, i, a) => a.indexOf(v) === i);
  // Si no ingresaron montos, asumir pago exacto con el primer medio seleccionado
  const sinMontos    = pagos.every(p => !p.monto);
  const pagosFinal   = tipoPago === "CONTADO"
    ? (sinMontos
        ? [{ medio: pagos[0]?.medio || "EFECTIVO", monto: String(totalConPropOrd) }]
        : pagos.filter(p => parseFloat(p.monto) > 0))
    : [];
  const medioFinal   = tipoPago === "CRÉDITO" ? "CRÉDITO"
    : pagosFinal.length > 1 ? "MIXTO" : (pagosFinal[0]?.medio || "EFECTIVO");

  const puedePagar =
    pedido.length > 0 &&
    (tipoPago === "CRÉDITO"
      ? clienteNombre.trim().length > 0
      : sinMontos || totalPagado >= totalConPropOrd);

  // ── Facturación ───────────────────────────────────────────────────────────
  const emitirFactura = async () => {
    if (tipoPago === "CRÉDITO" && !clienteNombre.trim()) return;
    if (tipoPago === "CONTADO" && !sinMontos && totalPagado < totalConPropOrd) return;

    const w = window.open("", "_blank");
    w?.document.write(`<html><body style="font-family:'Courier New',monospace;width:80mm;padding:20px;text-align:center;color:#666">Generando factura...</body></html>`);

    const nroNum  = await getNextConsecutivo(branchId);
    const nroFact = `FV-${nroNum}`;
    const cliente = tipoPago === "CRÉDITO"
      ? clienteNombre.toUpperCase()
      : clienteContado.trim() ? clienteContado.toUpperCase() : "CONSUMIDOR FINAL";

    const tipoImpuestoOrd = tipoImpConfig;
    const subtotalOrd     = totalFinal;
    const descuentoOrd    = descuento;
    const impuestoOrd     = impuestoDrwOrd;
    const propinaOrd      = propinaDrwOrd;
    const valorTotalOrd   = baseConDesc + impuestoOrd + propinaOrd;

    try {
      // Facturar en el API (libera mesa, actualiza stock, marca pedido como facturado)
      await api.post(`/branches/${branchId}/mesas/${mesaId}/facturar`, {
        nroFactura: nroFact,
        cliente,
        tipoPago,
        medioPago:  medioFinal,
        pagos:      pagosFinal.map(p => ({ medio: p.medio, monto: parseFloat(p.monto) || 0 })),
        mesero,
        productos: pedido.map(i => ({
          productoId: String(i._id || i.id || ""),
          nombre:     i.nombre,
          cantidad:   i.cantidad,
          precio:     i.precio,
          subtotal:   i.precio * i.cantidad,
        })),
        subtotal:  subtotalOrd,
        descuento: descuentoOrd,
        impuesto:  impuestoOrd,
        propina:   propinaOrd,
        envio:     0,
        valor:     valorTotalOrd,
      });
    } catch {
      toast("error", "Error al registrar la factura. Intenta de nuevo.");
      return;
    }

    // localStorage ya fue actualizado por getNextConsecutivo como puente de respaldo
    const mov = {
      mesaId, id: Date.now(), nroFactura: nroFact, fecha: new Date().toISOString(),
      categoria: "ingreso", concepto: `Venta Mesa`, valor: valorTotalOrd,
      subtotal: subtotalOrd, descuento: descuentoOrd, impuesto: impuestoOrd, propina: propinaOrd,
      cliente, tipoVenta: tipoPago, medioPago: medioFinal,
      productos: pedido, mesero, estado: tipoPago === "CONTADO" ? "Pagada" : "Pendiente",
    };
    const movs = JSON.parse(localStorage.getItem(movKey) || "[]");
    localStorage.setItem(movKey, JSON.stringify([mov, ...movs]));

    // Puente historial_mesas para el módulo de Historial Mesas
    const hist = JSON.parse(localStorage.getItem("historial_mesas") || "[]");
    localStorage.setItem("historial_mesas", JSON.stringify([{ ...mov, mesaId, mesaNombre }, ...hist]));

    if (tipoPago === "CRÉDITO") {
      const cxc = JSON.parse(localStorage.getItem("cxc") || "[]");
      localStorage.setItem("cxc", JSON.stringify([
        { id: Date.now(), tercero: cliente, tipoTercero: "CLIENTE",
          nroFactura: nroFact, concepto: `VENTA MESA`, fecha: new Date().toISOString(),
          valor: totalConPropOrd, tipoMov: "DEUDA" },
        ...cxc,
      ]));
    }

    // Limpiar pedido y mesa en localStorage
    const d = JSON.parse(localStorage.getItem("pedidos") || "{}");
    delete d[mesaId];
    localStorage.setItem("pedidos", JSON.stringify(d));
    const mesas = JSON.parse(localStorage.getItem(mesasKey) || "[]");
    localStorage.setItem(mesasKey, JSON.stringify(
      mesas.map((m: any) => String(m._id || m.id) === mesaId ? { ...m, mesero: "", estado: "libre" } : m)
    ));

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
      <div>MESERO: ${mesero}</div>
      <div>FECHA: ${new Date().toLocaleString("es-CO")}</div>
      <div>CLIENTE: ${cliente}</div>
      <div class="hr"></div>
      <table><thead><tr>
        <th align="left">CANT</th><th align="left">DESCRIPCIÓN</th><th align="right">TOTAL</th>
      </tr></thead><tbody>
        ${pedido.map(i => `<tr>
          <td>${i.cantidad}</td>
          <td>${i.nombre.substring(0,18).toUpperCase()}</td>
          <td align="right">$${(i.precio*i.cantidad).toLocaleString("es-CO")}</td>
        </tr>`).join("")}
      </tbody></table>
      <div class="hr"></div>
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        <tr><td>SUBTOTAL</td><td class="r">$${subtotalOrd.toLocaleString("es-CO")}</td></tr>
        ${descuentoOrd > 0 ? `<tr><td>DESCUENTO</td><td class="r">-$${descuentoOrd.toLocaleString("es-CO")}</td></tr>` : ""}
        ${impuestoOrd > 0 ? `<tr><td>${tipoImpuestoOrd === "IVA_19" ? "IVA 19%" : "IpoConsumo 8%"}</td><td class="r">$${impuestoOrd.toLocaleString("es-CO")}</td></tr>` : ""}
        ${propinaOrd > 0 ? `<tr><td>PROPINA${propinaManual !== "" ? " (LIBRE)" : ` (${propCfgOrd.porcentaje}%)`}</td><td class="r">$${propinaOrd.toLocaleString("es-CO")}</td></tr>` : ""}
        <tr class="b" style="font-size:13px"><td>TOTAL</td><td class="r">$${valorTotalOrd.toLocaleString("es-CO")}</td></tr>
      </table>
      ${tipoPago !== "CRÉDITO" && (pagosFinal.length > 1 || vuelto > 0) ? `
        <div class="hr"></div>
        ${pagosFinal.length > 1 ? pagosFinal.map(p => `<div class="row"><span>${p.medio}</span><span>$${parseFloat(p.monto).toLocaleString("es-CO")}</span></div>`).join("") : `<div class="row"><span>${medioFinal}</span><span>$${totalPagado.toLocaleString("es-CO")}</span></div>`}
        ${vuelto > 0 ? `<div class="row b"><span>CAMBIO:</span><span>$${vuelto.toLocaleString("es-CO")}</span></div>` : ""}
      ` : `<div class="hr"></div><div class="row"><span>PAGO:</span><span>${pagosFinal.length > 1 ? "MIXTO" : medioFinal}</span></div>`}
      <div class="hr"></div>
      <div class="c" style="font-size:9px">${empresa.resolucion || ""}</div>
      <div class="c b">¡GRACIAS POR SU VISITA!</div>
      <script>window.print();window.close();</script>
    </body></html>`);
    w?.document.close();

    router.push("/tables");
  };

  if (cargando) return <p className="p-10 text-center font-black">Cargando...</p>;

  const turnoActivo = (() => {
    try {
      const key = branch?.id ? `turno_actual_${branch.id}` : "turno_actual";
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch { return null; }
  })();
  if (!turnoActivo) return <SinTurno onTurnoAbierto={() => window.location.reload()} branchId={branch?.id} />;

  const guardarNuevoClienteCompleto = () => {
    if (!nuevoClienteForm.nombre.trim()) return;
    const clientes = JSON.parse(localStorage.getItem(cliKey) || "[]");
    const yaExiste = clientes.some((c: any) =>
      (c.nombre || c.cliente || "").toUpperCase() === nuevoClienteForm.nombre.toUpperCase()
    );
    if (!yaExiste) {
      const nuevo = {
        id: Date.now(),
        nombre:         nuevoClienteForm.nombre.toUpperCase(),
        apellidos:      nuevoClienteForm.apellidos.toUpperCase(),
        identificacion: nuevoClienteForm.identificacion,
        telefono:       nuevoClienteForm.telefono,
        email:          nuevoClienteForm.email,
        direccion:      nuevoClienteForm.direccion.toUpperCase(),
      };
      localStorage.setItem(cliKey, JSON.stringify([nuevo, ...clientes]));
      setListaTerceros(prev => [nuevo.nombre, ...prev]);
    }
    setClienteContado(nuevoClienteForm.nombre.toUpperCase());
    setNuevoClienteForm({ nombre: "", apellidos: "", identificacion: "", telefono: "", email: "", direccion: "" });
    setMostrarFormNuevoCliente(false);
  };

  const categorias = ["TODAS", ...Array.from(new Set(productosTotales.map(p => p.categoria))).filter(Boolean)];
  const filtrados  = productosTotales.filter(p =>
    (p.nombre || "").toLowerCase().includes(filtro.toLowerCase()) &&
    (catSeleccionada === "TODAS" || p.categoria === catSeleccionada)
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans text-[10px]">

      {/* ── GRILLA DE PRODUCTOS ── */}
      <div className="flex-1 p-4 flex flex-col gap-3 overflow-hidden">

        {/* Topbar */}
        <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl shadow-sm border-b-4 border-orange-500">
          <button onClick={() => router.push("/tables")}
            className="bg-gray-100 px-3 py-2 rounded-xl text-gray-500 font-black uppercase text-[8px] flex items-center gap-1 hover:bg-gray-200 transition-all">
            <ArrowLeft size={13} /> Mesas
          </button>
          <span className="font-black text-gray-700 text-sm flex-1 text-center">{mesaNombre}</span>
          {mesero && (
            <span className="text-[9px] font-black text-orange-600 bg-orange-50 px-3 py-1.5 rounded-xl uppercase">
              {mesero}
            </span>
          )}
        </div>

        {/* Buscador */}
        <div className="flex gap-2">
          <input
            className="flex-1 p-3.5 rounded-2xl border-0 font-bold uppercase outline-none focus:ring-2 ring-orange-500 shadow-sm bg-white"
            placeholder="Buscar..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
          />
          <select
            className="p-3.5 rounded-2xl font-black uppercase bg-white outline-none shadow-sm"
            value={catSeleccionada}
            onChange={e => setCatSeleccionada(e.target.value)}
          >
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Tarjetas */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-10 content-start">
          {filtrados.map((p: any) => (
            <div key={p.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
              {p.foto && (
                <img src={p.foto} alt={p.nombre} className="w-full h-20 object-cover" onError={e => (e.currentTarget.style.display = "none")} />
              )}
              <div className="bg-gray-50 px-4 pt-3 pb-2 border-b border-gray-100">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{p.categoria}</span>
                <p className="font-black text-[11px] text-gray-800 uppercase leading-tight mt-0.5 h-8 overflow-hidden">{p.nombre}</p>
              </div>
              <div className="p-3 flex flex-col gap-1.5">
                {fmt(p.precioPublico || p.precio) > 0 && (
                  <button onClick={() => gestionarProducto(p, "sumar", fmt(p.precioPublico || p.precio))}
                    className="flex justify-between items-center w-full bg-white border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl transition-all">
                    <span className="text-[8px] font-black bg-amber-400 text-white px-1.5 py-0.5 rounded-md">PÚB</span>
                    <span className="text-[11px] font-black text-gray-900">${fmt(p.precioPublico || p.precio).toLocaleString("es-CO")}</span>
                  </button>
                )}
                {fmt(p.precioMayorista) > 0 && (
                  <button onClick={() => gestionarProducto(p, "sumar", fmt(p.precioMayorista))}
                    className="flex justify-between items-center w-full bg-white border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl transition-all">
                    <span className="text-[8px] font-black bg-sky-500 text-white px-1.5 py-0.5 rounded-md">MAY</span>
                    <span className="text-[11px] font-black text-gray-900">${fmt(p.precioMayorista).toLocaleString("es-CO")}</span>
                  </button>
                )}
                <div className="flex gap-1.5 mt-0.5">
                  <input
                    type="number" placeholder="Precio libre"
                    value={preciosLibres[p.id] || ""}
                    onChange={e => setPreciosLibres(prev => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const v = parseFloat(preciosLibres[p.id] || "0");
                        if (v > 0) { gestionarProducto(p, "sumar", v); setPreciosLibres(prev => ({ ...prev, [p.id]: "" })); }
                      }
                    }}
                    className="flex-1 min-w-0 bg-gray-50 border border-gray-200 px-2 py-1.5 rounded-lg text-[9px] font-bold outline-none focus:border-gray-400"
                  />
                  <button
                    onClick={() => {
                      const v = parseFloat(preciosLibres[p.id] || "0");
                      if (v > 0) { gestionarProducto(p, "sumar", v); setPreciosLibres(prev => ({ ...prev, [p.id]: "" })); }
                    }}
                    className="bg-gray-800 text-white w-6 h-6 rounded-md font-black text-sm hover:bg-black transition-all shrink-0 flex items-center justify-center"
                  >+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* ── DRAWER PEDIDO ── */}
      <div className="w-[370px] bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header con mesa y mesero */}
        <div className="bg-[#1a2b3c] px-6 py-5 shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Pedido Activo</p>
              <p className="text-white font-black text-2xl tracking-tighter">{mesaNombre}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-white/40 uppercase">{pedido.length} ítem(s)</p>
              <p className="text-white font-black text-xl">${totalFinal.toLocaleString("es-CO")}</p>
            </div>
          </div>
          {mesero && (
            <div className="mt-3 flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl">
              <Utensils size={12} className="text-white/60" />
              <span className="text-[10px] font-black text-white/80 uppercase">{mesero}</span>
            </div>
          )}
        </div>

        {/* Volver al pedido */}
        {vistaDrawer === "pago" && (
          <button
            onClick={() => setVistaDrawer("pedido")}
            className="flex items-center gap-2 px-5 py-3 text-[10px] font-black text-blue-600 uppercase hover:bg-blue-50 transition-colors border-b border-gray-100 shrink-0"
          >
            <ArrowLeft size={13} /> Volver al pedido
          </button>
        )}

        {/* ── VISTA PEDIDO ── */}
        {vistaDrawer === "pedido" && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {pedido.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-200 gap-3 py-16">
                  <Utensils size={44} strokeWidth={1.2} />
                  <p className="font-black uppercase text-[10px] tracking-widest text-gray-300">Sin productos</p>
                </div>
              ) : pedido.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 px-3 py-2.5 rounded-2xl border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase text-gray-800 leading-tight truncate">{item.nombre}</p>
                    <p className="text-[9px] text-gray-400 font-bold mt-0.5">${item.precio.toLocaleString("es-CO")} c/u</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => gestionarProducto(item, "restar", item.precio)}
                      className="w-7 h-7 flex items-center justify-center bg-white rounded-lg shadow-sm border border-gray-100 text-red-500 font-black text-base">−</button>
                    <span className="font-black text-gray-900 text-sm w-5 text-center">{item.cantidad}</span>
                    <button onClick={() => gestionarProducto(item, "sumar", item.precio)}
                      className="w-7 h-7 flex items-center justify-center bg-white rounded-lg shadow-sm border border-gray-100 text-green-500 font-black text-base">+</button>
                  </div>
                  <p className="font-black text-gray-900 text-sm shrink-0 w-[70px] text-right">
                    ${(item.precio * item.cantidad).toLocaleString("es-CO")}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-4 pb-5 pt-3 border-t border-gray-100 shrink-0">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black text-gray-400 uppercase">Subtotal productos</span>
                <span className="text-2xl font-black text-gray-900">${totalFinal.toLocaleString("es-CO")}</span>
              </div>
              <button
                disabled={pedido.length === 0}
                onClick={() => setVistaDrawer("pago")}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[11px] shadow-lg hover:bg-blue-700 active:scale-95 transition-all disabled:bg-gray-100 disabled:text-gray-300"
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
                <div className="flex justify-between text-xs text-gray-400 font-bold mb-1">
                  <span>Subtotal</span><span>${totalFinal.toLocaleString("es-CO")}</span>
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
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-black text-gray-400 uppercase">
                      Propina ({propCfgOrd.porcentaje ?? 10}%)
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
                        value={propinaManual !== "" ? propinaManual : propinaPctOrd}
                        onFocus={() => { if (propinaManual === "") setPropinaManual(String(propinaPctOrd)); }}
                        onChange={e => setPropinaManual(e.target.value)}
                        className="w-24 text-right text-xs font-black text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-300"
                      />
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-gray-400">$0</span>
                  )}
                </div>
                {/* Impuesto según configuración */}
                {labelImpuestoOrd && (
                  <div className="flex justify-between items-center mb-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-[9px] font-black text-gray-500 uppercase">{labelImpuestoOrd}</span>
                    <span className="text-xs font-black text-gray-700">${impuestoDrwOrd.toLocaleString("es-CO")}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 mt-1 pt-2" />
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">Total a cobrar — {mesaNombre}</p>
                <p className="text-3xl font-black text-gray-900 text-center">${totalConPropOrd.toLocaleString("es-CO")}</p>
              </div>

              {/* Tab */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl">
                {(["CONTADO", "CRÉDITO"] as const).map(t => (
                  <button key={t} onClick={() => setTipoPago(t)}
                    className={`flex-1 py-3 rounded-xl font-black uppercase text-[11px] transition-all ${tipoPago === t
                      ? (t === "CONTADO" ? "bg-white text-orange-600 shadow-sm" : "bg-white text-blue-600 shadow-sm")
                      : "text-gray-400"}`}
                  >{t}</button>
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
                        list="terceros-contado-mesa"
                        className="flex-1 p-3 bg-gray-50 rounded-2xl font-bold uppercase text-sm outline-none border border-gray-200 focus:border-gray-400"
                        placeholder="CONSUMIDOR FINAL"
                        value={clienteContado}
                        onChange={e => { setClienteContado(e.target.value.toUpperCase()); setMostrarFormNuevoCliente(false); }}
                      />
                      <datalist id="terceros-contado-mesa">
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
                        <select value={pago.medio}
                          onChange={e => setPagos(prev => prev.map((p, i) => i === idx ? {...p, medio: e.target.value} : p))}
                          className="bg-gray-100 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase outline-none">
                          {mediosPago.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <div className="flex-1 flex items-center bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2 focus-within:border-orange-400 transition-colors">
                          <span className="text-gray-400 font-black mr-1">$</span>
                          <input type="number" placeholder="0" value={pago.monto}
                            data-pago-idx={idx}
                            onChange={e => setPagos(prev => prev.map((p, i) => i === idx ? {...p, monto: e.target.value} : p))}
                            onKeyDown={e => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              const next = document.querySelector<HTMLInputElement>(`input[data-pago-idx="${idx + 1}"]`);
                              if (next) { next.focus(); next.select(); }
                              else (document.querySelector<HTMLButtonElement>("[data-emitir-btn]"))?.focus();
                            }}
                            className="flex-1 bg-transparent outline-none font-black text-gray-900" />
                        </div>
                        {pagos.length > 1 && (
                          <button onClick={() => setPagos(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 font-black text-lg px-1">×</button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setPagos(prev => [...prev, {medio: mediosPago.find(m => !prev.some(p => p.medio === m)) || "EFECTIVO", monto:""}])}
                      className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest">
                      + Agregar otro medio de pago
                    </button>
                  </div>

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
                monto={totalConPropOrd}
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
