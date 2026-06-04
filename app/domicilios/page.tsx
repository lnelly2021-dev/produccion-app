"use client";
import { useState, useEffect, useRef } from "react";
import { Plus, X, Printer, ChevronRight, FileText } from "lucide-react";
import { getNextConsecutivo } from "../../lib/consecutivo";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { getEmpresaConfig, patchEmpresaConfig } from "../../lib/empresaStorage";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

type Estado = "NUEVO" | "EN_PREPARACION" | "EN_CAMINO" | "ENTREGADO" | "CANCELADO";

interface ItemPedido { id: any; nombre: string; precio: number; cantidad: number; }
interface Domicilio {
  id: number; nro: string; fecha: string;
  cliente: string; telefono: string; direccion: string; barrio: string;
  productos: ItemPedido[];
  subtotal: number; descuento?: number; impuesto?: number; envio: number; total: number;
  medioPago: string; pagos?: {medio:string; monto:string}[];
  estado: Estado; notas: string; domiciliario: string;
  facturaId?: string;
}

const ESTADOS: { key: Estado; label: string; color: string; bg: string }[] = [
  { key: "NUEVO",          label: "Nuevo",          color: "text-blue-700",   bg: "bg-blue-100"   },
  { key: "EN_PREPARACION", label: "En Preparación", color: "text-amber-700",  bg: "bg-amber-100"  },
  { key: "EN_CAMINO",      label: "En Camino",      color: "text-violet-700", bg: "bg-violet-100" },
  { key: "ENTREGADO",      label: "Entregado",      color: "text-emerald-700",bg: "bg-emerald-100"},
  { key: "CANCELADO",      label: "Cancelado",      color: "text-red-700",    bg: "bg-red-100"    },
];

const siguienteEstado: Record<Estado, Estado | null> = {
  NUEVO: "EN_PREPARACION", EN_PREPARACION: "EN_CAMINO",
  EN_CAMINO: "ENTREGADO",  ENTREGADO: null, CANCELADO: null,
};

const accionLabel: Record<Estado, string> = {
  NUEVO: "Iniciar Preparación", EN_PREPARACION: "Salió a Entregar",
  EN_CAMINO: "Marcar Entregado", ENTREGADO: "", CANCELADO: "",
};

export default function DomiciliosPage() {
  const { branch, company } = useAuth();
  const branchId   = branch?.id || "";
  const movKey     = branchId ? `movimientos_${branchId}` : "movimientos";
  const prodKey    = branchId ? `productos_${branchId}` : "productos";
  const cliKey     = branchId ? `clientes_${branchId}` : "clientes";
  const confirm = useConfirm();
  const [domicilios, setDomicilios] = useState<Domicilio[]>(() => {
    try { return JSON.parse(localStorage.getItem("domicilios") || "[]"); } catch { return []; }
  });
  const [productos,  setProductos]  = useState<any[]>([]);
  const [listaBancos, setListaBancos] = useState<string[]>([]);
  const [empresa,    setEmpresa]    = useState<any>({});
  const [filtroEstado, setFiltroEstado] = useState<Estado | "TODOS">("TODOS");
  const [tipoRango,  setTipoRango]  = useState("Diario");
  const [fechaBase,  setFechaBase]  = useState(new Date().toLocaleDateString("en-CA"));
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [drawerNuevo, setDrawerNuevo] = useState(false);
  const [pedidoVer,  setPedidoVer]  = useState<Domicilio | null>(null);

  // ── Form nuevo pedido ────────────────────────────────────────────────────
  const [form, setForm] = useState({ cliente:"", telefono:"", direccion:"", barrio:"", notas:"", domiciliario:"", envio:"0" });
  const [pagos, setPagos] = useState<{medio:string; monto:string}[]>([{medio:"EFECTIVO", monto:""}]);
  const [carrito,      setCarrito]      = useState<ItemPedido[]>([]);
  const [filtro,       setFiltro]       = useState("");
  const [catSel,       setCatSel]       = useState("TODAS");
  const [preciosLibres, setPreciosLibres] = useState<Record<string, string>>({});
  const [descuentoRaw, setDescuentoRaw]   = useState("");
  const [descuentoTipo, setDescuentoTipo] = useState<"%"|"$">("%");

  // ── Cliente con autocompletar ─────────────────────────────────────────────
  const [listaClientes,   setListaClientes]   = useState<any[]>([]);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre:"", apellidos:"", identificacion:"", telefono:"", email:"", direccion:"" });
  // ── Mensajeros (empleados) ────────────────────────────────────────────────
  const [listaMensajeros, setListaMensajeros] = useState<string[]>([]);

  useEffect(() => {
    setProductos(JSON.parse(localStorage.getItem(prodKey) || "[]"));
    setEmpresa(getEmpresaConfig());
    const b = JSON.parse(localStorage.getItem("lista_bancos") || "null");
    if (b) setListaBancos(b);
    setListaClientes(JSON.parse(localStorage.getItem(cliKey) || "[]"));
    if (!branchId) return;
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
          if (c.tributario?.tipoImpuesto && c.tributario.tipoImpuesto !== "NINGUNO")
            patch.tributario = c.tributario;
          setEmpresa((prev: any) => ({ ...prev, ...patch }));
          patchEmpresaConfig(patch);
        })
        .catch(() => {});
      api.get(`/companies/${company.id}/branches/${branchId}`)
        .then(r => {
          const bancos: string[] = r.data.data?.bancos ?? r.data?.bancos ?? [];
          if (bancos.length > 0) { setListaBancos(bancos); localStorage.setItem("lista_bancos", JSON.stringify(bancos)); }
        }).catch(() => {});
    }
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
    api.get(`/branches/${branchId}/domicilios`)
      .then(({ data }) => {
        const lista: Domicilio[] = (data.data || []).map(normalizarDom);
        if (lista.length > 0) {
          setDomicilios(lista);
          localStorage.setItem("domicilios", JSON.stringify(lista));
        }
      })
      .catch(() => { /* mantener estado actual */ });
    // Cargar empleados como mensajeros
    api.get(`/branches/${branchId}/contactos?tipo=EMPLEADO`)
      .then(({ data }) => {
        const nombres = (data.data ?? data ?? []).map((e: any) => (e.nombre || "").toUpperCase()).filter(Boolean);
        if (nombres.length > 0) setListaMensajeros(nombres);
      }).catch(() => {});
    // Cargar clientes desde API para el buscador de terceros
    api.get(`/branches/${branchId}/contactos?tipo=CLIENTE`)
      .then(({ data }) => {
        const apiClis = (data.data ?? data ?? []);
        if (apiClis.length > 0) {
          setListaClientes(apiClis);
          localStorage.setItem(cliKey, JSON.stringify(apiClis));
        }
      }).catch(() => {});
  }, [branchId]);

  const normalizarDom = (d: any): Domicilio => ({
    ...d,
    id:       d._id       || d.id,
    fecha:    d.fecha     || d.createdAt || new Date().toISOString(),
    impuesto: Number(d.impuesto) || 0,
    descuento: Number(d.descuento) || 0,
  });
  const [cargandoDoms, setCargandoDoms] = useState(false);

  const cargarDomicilios = async () => {
    if (!branchId) {
      toast("warning", "Sin sesión activa (branchId vacío)");
      return;
    }
    setCargandoDoms(true);
    try {
      const { data } = await api.get(`/branches/${branchId}/domicilios`);
      const lista: Domicilio[] = (data.data || []).map(normalizarDom);
      if (lista.length > 0) {
        setDomicilios(lista);
        localStorage.setItem("domicilios", JSON.stringify(lista));
      } else {
        toast("info", `API respondió vacío. branchId: ${branchId}`);
      }
    } catch (e: any) {
      toast("error", "Error: " + (e?.response?.data?.message || e?.message || "sin detalle"));
    } finally {
      setCargandoDoms(false);
    }
  };

  const guardar = (d: Domicilio[]) => {
    setDomicilios(d);
    localStorage.setItem("domicilios", JSON.stringify(d));
  };

  // ── Catálogo ─────────────────────────────────────────────────────────────
  const fmt = (v: any): number => { if (typeof v === "number") return v; if (!v) return 0; return Number(String(v).replace(/\./g,"").replace(/,/g,"")) || 0; };
  const categorias = ["TODAS", ...Array.from(new Set(productos.map((p:any) => (p.categoria||"").toUpperCase()))).filter(Boolean)];
  const filtrados  = productos.filter(p =>
    (p.nombre||"").toLowerCase().includes(filtro.toLowerCase()) &&
    (catSel === "TODAS" || (p.categoria||"").toUpperCase() === catSel)
  ).sort((a,b) => (a.categoria||"").localeCompare(b.categoria||"") || (a.nombre||"").localeCompare(b.nombre||""));

  const agregarProducto = (p: any, precio: number) => {
    if (precio <= 0) return;
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.id === p.id && i.precio === precio);
      if (idx !== -1) return prev.map((i,n) => n === idx ? {...i, cantidad: i.cantidad+1} : i);
      return [...prev, { id: p.id, nombre: p.nombre, precio, cantidad: 1 }];
    });
  };
  const cambiarCant = (id: any, precio: number, delta: number) =>
    setCarrito(prev => prev.map(i => i.id===id && i.precio===precio ? {...i, cantidad: Math.max(0, i.cantidad+delta)} : i).filter(i => i.cantidad > 0));

  const subtotal  = carrito.reduce((a,i) => a + i.precio*i.cantidad, 0);
  const descuentoNum = parseFloat(descuentoRaw) || 0;
  const descuento = descuentoTipo === "%" ? Math.round(subtotal * descuentoNum / 100) : Math.min(descuentoNum, subtotal);
  const envioNum  = parseFloat(form.envio || "0") || 0;
  const tipoImp   = (empresa?.tributario?.tipoImpuesto ?? "NINGUNO") as string;
  const taxRate   = tipoImp === "IVA_19" ? 0.19 : tipoImp === "IPC_8" ? 0.08 : 0;
  const baseImp   = Math.max(subtotal - descuento, 0);
  const impuesto  = Math.round(baseImp * taxRate);
  const total     = subtotal - descuento + impuesto + envioNum;

  const mediosPago     = ["EFECTIVO", "NEQUI", "DAVIPLATA", "TRANSFERENCIA", ...listaBancos].filter((v, i, a) => a.indexOf(v) === i);
  const medioPrincipal = pagos[0]?.medio || "EFECTIVO";
  const totalPagado    = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const pendiente      = total - totalPagado;
  const vuelto         = totalPagado - total;

  // ── Guardar cliente nuevo ─────────────────────────────────────────────────
  const guardarNuevoCliente = () => {
    if (!nuevoCliente.nombre.trim()) return;
    const cl = JSON.parse(localStorage.getItem(cliKey) || "[]");
    const nuevo = { id: Date.now(), ...nuevoCliente, nombre: nuevoCliente.nombre.toUpperCase() };
    const actualizado = [nuevo, ...cl];
    localStorage.setItem(cliKey, JSON.stringify(actualizado));
    setListaClientes(actualizado);
    setForm(f => ({ ...f, cliente: nuevo.nombre, telefono: nuevoCliente.telefono, direccion: nuevoCliente.direccion, barrio: f.barrio }));
    setNuevoCliente({ nombre:"", apellidos:"", identificacion:"", telefono:"", email:"", direccion:"" });
    setMostrarNuevoCliente(false);
  };

  // ── Nombre de clientes para datalist ─────────────────────────────────────
  const nombresClientes = listaClientes.map(c => (c.nombre || "").toUpperCase()).filter(Boolean);
  const clienteExiste   = nombresClientes.includes(form.cliente.toUpperCase().trim());

  // ── Crear domicilio ───────────────────────────────────────────────────────
  const buildDomicilio = (): Domicilio => {
    const pagosFinal = pagos.filter(p => parseFloat(p.monto) > 0);
    const todos = JSON.parse(localStorage.getItem("domicilios") || "[]");
    const nro   = `DOM-${String(todos.length + 1).padStart(3, "0")}`;
    return {
      id: Date.now(), nro, fecha: new Date().toISOString(),
      cliente: form.cliente.toUpperCase(), telefono: form.telefono,
      direccion: form.direccion.toUpperCase(), barrio: form.barrio.toUpperCase(),
      productos: carrito, subtotal, descuento, envio: envioNum, total,
      medioPago: pagosFinal.length > 1 ? "MIXTO" : medioPrincipal,
      pagos: pagosFinal, estado: "NUEVO",
      notas: form.notas.toUpperCase(), domiciliario: form.domiciliario.toUpperCase(),
    };
  };

  const resetDrawer = () => {
    setDrawerNuevo(false);
    setCarrito([]); setFiltro(""); setCatSel("TODAS"); setPagos([{medio:"EFECTIVO", monto:""}]);
    setDescuentoRaw(""); setDescuentoTipo("%");
    setForm({ cliente:"", telefono:"", direccion:"", barrio:"", notas:"", domiciliario:"", envio:"0" });
    setMostrarNuevoCliente(false);
  };

  const crearConTicket = async () => {
    if (!form.cliente.trim()) { toast("warning", "Ingresa el nombre del cliente"); return; }
    if (!form.direccion.trim()) { toast("warning", "Ingresa la dirección"); return; }
    if (carrito.length === 0) { toast("warning", "Agrega al menos un producto"); return; }
    const printWin = window.open("", "_blank");
    printWin?.document.write(`<html><body style="font-family:'Courier New',monospace;padding:20px;text-align:center;color:#666">Generando ticket...</body></html>`);
    try {
      // Ticket NO lleva impuesto — solo subtotal - descuento + envío
      const totalTicket = subtotal - descuento + envioNum;
      const base = { ...buildDomicilio(), total: totalTicket, impuesto: 0 };
      const productosNorm = carrito.map(i => ({
        productoId: String((i as any)._id || i.id || ""),
        nombre: i.nombre, precio: i.precio, cantidad: i.cantidad,
      }));
      const { data } = await api.post(`/branches/${branchId}/domicilios`, {
        ...base, productos: productosNorm,
      });
      const nuevo = { ...base, ...data.data, id: data.data._id };
      const pagosFinal = pagos.filter(p => parseFloat(p.monto) > 0);
      const medioPagoFinal = pagosFinal.length > 1 ? "MIXTO" : (pagosFinal[0]?.medio || nuevo.medioPago);

      // Crear Venta sin impuesto (ticket)
      await api.post(`/branches/${branchId}/ventas`, {
        nroFactura: nuevo.nro,
        cliente:    nuevo.cliente,
        tipoPago:   "CONTADO",
        medioPago:  medioPagoFinal,
        pagos:      pagosFinal,
        productos:  productosNorm,
        subtotal:   nuevo.subtotal,
        descuento:  nuevo.descuento || 0,
        impuesto:   0,
        propina:    0,
        envio:      nuevo.envio || 0,
        valor:      totalTicket,
      });

      guardar([nuevo, ...domicilios]);
      resetDrawer();
      imprimirTicket(nuevo, printWin);
    } catch { printWin?.close(); toast("error", "Error al crear el domicilio"); }
  };

  const crearConFactura = async () => {
    if (!form.cliente.trim()) { toast("warning", "Ingresa el nombre del cliente"); return; }
    if (!form.direccion.trim()) { toast("warning", "Ingresa la dirección"); return; }
    if (carrito.length === 0) { toast("warning", "Agrega al menos un producto"); return; }
    const printWinF = window.open("", "_blank");
    printWinF?.document.write(`<html><body style="font-family:'Courier New',monospace;padding:20px;text-align:center;color:#666">Generando factura...</body></html>`);
    const nroNum  = await getNextConsecutivo(branchId);
    const nroFact = `FD-${nroNum}`;
    // Calcular impuesto antes del API call para incluirlo en el dto
    try {
      const productosNorm2 = carrito.map(i => ({
        productoId: String((i as any)._id || i.id || ""),
        nombre: i.nombre, precio: i.precio, cantidad: i.cantidad,
      }));
      const dto = { ...buildDomicilio(), facturaId: nroFact, productos: productosNorm2, impuesto: impuesto };
      const { data } = await api.post(`/branches/${branchId}/domicilios`, dto);
      const nuevo = { ...dto, ...data.data, id: data.data._id };
      const pagosFinal = pagos.filter(p => parseFloat(p.monto) > 0);
      const mov = {
        id: Date.now(), nroFactura: nroFact, fecha: new Date().toISOString(),
        categoria: "ingreso", concepto: `Domicilio ${nuevo.nro}`, valor: nuevo.total,
        subtotal: nuevo.subtotal,
        impuesto: impuesto,
        propina:  0,
        envio:    nuevo.envio || 0,
        cliente: nuevo.cliente, tipoVenta: "CONTADO",
        medioPago: pagosFinal.length > 1 ? "MIXTO" : (pagosFinal[0]?.medio || nuevo.medioPago),
        pagos: pagosFinal,
        productos: nuevo.productos, estado: "Pagada",
      };
      const movs = JSON.parse(localStorage.getItem(movKey) || "[]");
      localStorage.setItem(movKey, JSON.stringify([mov, ...movs]));
      guardar([nuevo, ...domicilios]);
    // Capturar valores ANTES del reset para la impresión
    const impuestoDom = impuesto;
      resetDrawer();
    const w = printWinF;
    w?.document.write(`<html><head><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:5px;margin:0;font-size:11px}
      .c{text-align:center}.b{font-weight:bold}.hr{border-top:1px dashed #000;margin:7px 0}
      .row{display:flex;justify-content:space-between}
      table{width:100%;font-size:11px;border-collapse:collapse}
    </style></head><body>
      <div class="c b">${empresa.nombreEmpresa}</div>
      <div class="c">NIT: ${empresa.nit} | Tel: ${empresa.telefono}</div>
      <div class="c">${empresa.direccion}</div>
      <div class="hr"></div>
      <div class="c b" style="font-size:13px">FACTURA No: ${nroFact}</div>
      <div class="c">(Domicilio ${nuevo.nro})</div>
      <div class="hr"></div>
      <div>FECHA: ${new Date().toLocaleString("es-CO")}</div>
      <div>CLIENTE: ${nuevo.cliente}</div>
      <div>DIR: ${nuevo.direccion}${nuevo.barrio ? " / "+nuevo.barrio : ""}</div>
      ${nuevo.domiciliario ? `<div>MENSAJERO: ${nuevo.domiciliario}</div>` : ""}
      <div class="hr"></div>
      <table><tbody>
        ${nuevo.productos.map((p: ItemPedido) => `<tr>
          <td>${p.cantidad}</td>
          <td>${p.nombre.substring(0,18).toUpperCase()}</td>
          <td align="right">$${(p.precio*p.cantidad).toLocaleString("es-CO")}</td>
        </tr>`).join("")}
      </tbody></table>
      <div class="hr"></div>
      <div class="row"><span>SUBTOTAL</span><span>$${nuevo.subtotal.toLocaleString("es-CO")}</span></div>
      ${descuento > 0 ? `<div class="row" style="color:#c00"><span>DESCUENTO</span><span>-$${descuento.toLocaleString("es-CO")}</span></div>` : ""}
      ${impuestoDom > 0 ? `<div class="row"><span>${tipoImp === "IVA_19" ? "IVA 19%" : "IpoConsumo 8%"}</span><span>$${impuestoDom.toLocaleString("es-CO")}</span></div>` : ""}
      ${nuevo.envio > 0 ? `<div class="row"><span>DOMICILIO</span><span>$${nuevo.envio.toLocaleString("es-CO")}</span></div>` : ""}
      <div class="row b" style="font-size:13px"><span>TOTAL</span><span>$${nuevo.total.toLocaleString("es-CO")}</span></div>
      <div class="hr"></div>
      ${pagosFinal.length > 1
        ? pagosFinal.map((p: {medio:string; monto:string}) => `<div class="row"><span>${p.medio}</span><span>$${parseFloat(p.monto).toLocaleString("es-CO")}</span></div>`).join("")
        : `<div>PAGO: ${nuevo.medioPago}</div>`}
      ${nuevo.notas ? `<div>NOTA: ${nuevo.notas}</div>` : ""}
      <div class="hr"></div>
      <div class="c" style="font-size:9px">${empresa.resolucion || ""}</div>
      <div class="c b">¡GRACIAS!</div>
      <script>window.print();window.close();</script>
    </body></html>`);
    w?.document.close();
    } catch { toast("error", "Error al crear el domicilio con factura"); }
  };

  // ── Cambiar estado ────────────────────────────────────────────────────────
  const avanzarEstado = async (dom: Domicilio) => {
    const sig = siguienteEstado[dom.estado];
    if (!sig) return;
    try {
      const id = String((dom as any)._id || dom.id);
      await api.put(`/branches/${branchId}/domicilios/${id}/estado`);
      const act = domicilios.map(d =>
        (String((d as any)._id || d.id) === id) ? {...d, estado: sig as Estado} : d
      );
      guardar(act);
      if (pedidoVer && String((pedidoVer as any)._id || pedidoVer.id) === id) {
        setPedidoVer({...pedidoVer, estado: sig} as Domicilio);
      }
      // Puente localStorage para movimientos al entregar sin factura
      if (sig === "ENTREGADO" && !dom.facturaId) {
        const movs = JSON.parse(localStorage.getItem(movKey) || "[]");
        localStorage.setItem(movKey, JSON.stringify([{
          id: Date.now(), fecha: new Date().toISOString(), nroFactura: dom.nro,
          categoria: "ingreso", concepto: `Domicilio ${dom.nro}`,
          cliente: dom.cliente, medioPago: dom.medioPago, pagos: dom.pagos,
          tipoVenta: "CONTADO", valor: dom.total, productos: dom.productos, estado: "Pagada",
        }, ...movs]));
      }
    } catch (e: any) {
      toast("error", "Error al cambiar el estado: " + (e?.response?.data?.message || e?.message || "sin detalle"));
    }
  };

  const cancelar = async (dom: Domicilio) => {
    if (!await confirm("¿Cancelar este domicilio?")) return;
    try {
      const id = String((dom as any)._id || dom.id);
      await api.put(`/branches/${branchId}/domicilios/${id}/cancelar`);
      const act = domicilios.map(d =>
        (String((d as any)._id || d.id) === id) ? {...d, estado: "CANCELADO" as Estado} : d
      );
      guardar(act);
      if (pedidoVer && String((pedidoVer as any)._id || pedidoVer.id) === id) setPedidoVer(null);
    } catch { toast("error", "Error al cancelar el domicilio"); }
  };

  // ── Imprimir ticket ───────────────────────────────────────────────────────
  const imprimirTicket = (dom: Domicilio, win?: Window | null) => {
    const w = win || window.open("", "_blank");
    w?.document.write(`<html><head><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:5px;margin:0;font-size:11px}
      .c{text-align:center}.b{font-weight:bold}.hr{border-top:1px dashed #000;margin:6px 0}
      .row{display:flex;justify-content:space-between}
      table{width:100%;border-collapse:collapse;font-size:11px}
    </style></head><body>
      <div class="c b">${empresa.nombreEmpresa || "MI EMPRESA"}</div>
      <div class="c">Tel: ${empresa.telefono || ""}</div>
      <div class="hr"></div>
      <div class="c b" style="font-size:13px">DOMICILIO ${dom.nro}</div>
      <div class="c">${new Date(dom.fecha).toLocaleString("es-CO")}</div>
      <div class="hr"></div>
      <div class="b">CLIENTE: ${dom.cliente}</div>
      <div>TEL: ${dom.telefono || "—"}</div>
      <div>DIR: ${dom.direccion}${dom.barrio ? " / " + dom.barrio : ""}</div>
      ${dom.domiciliario ? `<div>DOMICILIARIO: ${dom.domiciliario}</div>` : ""}
      <div class="hr"></div>
      <table><tbody>
        ${dom.productos.map((p: ItemPedido) => `<tr>
          <td>${p.cantidad}</td>
          <td>${p.nombre.substring(0,20).toUpperCase()}</td>
          <td align="right">$${(p.precio*p.cantidad).toLocaleString()}</td>
        </tr>`).join("")}
      </tbody></table>
      <div class="hr"></div>
      <div class="row"><span>Subtotal</span><span>$${dom.subtotal.toLocaleString()}</span></div>
      ${(dom.descuento||0) > 0 ? `<div class="row" style="color:#c00"><span>Descuento</span><span>-$${(dom.descuento||0).toLocaleString()}</span></div>` : ""}
      ${(dom as any).impuesto > 0 ? `<div class="row"><span>${empresa?.tributario?.tipoImpuesto === "IVA_19" ? "IVA 19%" : "IpoConsumo 8%"}</span><span>$${(dom as any).impuesto.toLocaleString()}</span></div>` : ""}
      <div class="row"><span>Envío</span><span>$${dom.envio.toLocaleString()}</span></div>
      <div class="row b" style="font-size:13px"><span>TOTAL</span><span>$${dom.total.toLocaleString()}</span></div>
      <div class="hr"></div>
      ${(dom.pagos ?? []).length > 1
        ? (dom.pagos as {medio:string;monto:string}[]).map(p => `<div>${p.medio}: $${parseFloat(p.monto).toLocaleString()}</div>`).join("")
        : `<div>PAGO: ${dom.medioPago}</div>`}
      ${dom.notas ? `<div>NOTA: ${dom.notas}</div>` : ""}
      <div class="hr"></div>
      <div class="c b">¡GRACIAS!</div>
      <script>window.print();window.close();</script>
    </body></html>`);
    w?.document.close();
  };

  // ── Rango de fechas ───────────────────────────────────────────────────────
  const getRango = () => {
    const base = new Date(fechaBase + "T12:00:00");
    let ini = new Date(base); ini.setHours(0, 0, 0, 0);
    let fin = new Date(base); fin.setHours(23, 59, 59, 999);
    let etiqueta = base.toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" });

    if (tipoRango === "Semanal") {
      const d = base.getDay();
      ini.setDate(base.getDate() - (d === 0 ? 6 : d - 1));
      fin = new Date(ini); fin.setDate(ini.getDate() + 6); fin.setHours(23,59,59,999);
      const f = (dt: Date) => dt.toLocaleDateString("es-CO", { day:"2-digit", month:"short" });
      etiqueta = `${f(ini)} – ${f(fin)}`;
    } else if (tipoRango === "Quincenal") {
      if (base.getDate() <= 15) { ini.setDate(1); fin.setDate(15); }
      else { ini.setDate(16); fin = new Date(base.getFullYear(), base.getMonth()+1, 0); fin.setHours(23,59,59,999); }
      const f = (dt: Date) => dt.toLocaleDateString("es-CO", { day:"2-digit", month:"short" });
      etiqueta = `${f(ini)} – ${f(fin)}`;
    } else if (tipoRango === "Mensual") {
      ini.setDate(1); fin = new Date(base.getFullYear(), base.getMonth()+1, 0); fin.setHours(23,59,59,999);
      etiqueta = base.toLocaleDateString("es-CO", { month:"long", year:"numeric" }).toUpperCase();
    } else if (tipoRango === "Anual") {
      ini = new Date(base.getFullYear(), 0, 1);
      fin = new Date(base.getFullYear(), 11, 31); fin.setHours(23,59,59,999);
      etiqueta = `AÑO ${base.getFullYear()}`;
    }
    return { inicio: ini.getTime(), fin: fin.getTime(), etiqueta };
  };

  const { inicio, fin, etiqueta } = getRango();

  // ── Reporte por mensajero ─────────────────────────────────────────────────
  const reporteMensajero = () => {
    const emp = getEmpresaConfig();
    const grupos: Record<string, { nombre: string; count: number; ventas: number; domicilio: number }> = {};
    domPeriodo.filter(d => d.estado !== "CANCELADO").forEach(d => {
      const key = (d.domiciliario || "SIN ASIGNAR").toUpperCase().trim();
      if (!grupos[key]) grupos[key] = { nombre: key, count: 0, ventas: 0, domicilio: 0 };
      grupos[key].count++;
      grupos[key].ventas   += (d.subtotal || (d.total - (d.envio || 0)));
      grupos[key].domicilio+= (d.envio || 0);
    });
    const filas = Object.values(grupos).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const totalVentas = filas.reduce((a, f) => a + f.ventas, 0);
    const totalEnvio  = filas.reduce((a, f) => a + f.domicilio, 0);
    const rows = filas.map(f => `<tr>
      <td style="padding:5px 8px">${f.nombre}</td>
      <td style="padding:5px 8px;text-align:center">${f.count}</td>
      <td style="padding:5px 8px;text-align:right">$${f.ventas.toLocaleString("es-CO")}</td>
      <td style="padding:5px 8px;text-align:right">$${f.domicilio.toLocaleString("es-CO")}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:bold">$${(f.ventas+f.domicilio).toLocaleString("es-CO")}</td>
    </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:24px 32px;font-size:12px}
      h1{font-size:15px;font-weight:900;text-transform:uppercase}
      .sub{font-size:10px;color:#666;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th{background:#1e293b;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;text-align:left}
      th:not(:first-child),td:not(:first-child){text-align:center}
      th:nth-child(3),th:nth-child(4),th:nth-child(5),td:nth-child(3),td:nth-child(4),td:nth-child(5){text-align:right}
      td{padding:5px 8px;border-bottom:1px solid #f1f5f9}
      .tot td{font-weight:900;background:#f8fafc}
      @media print{@page{margin:10mm;size:A4}}</style></head><body>
      <h1>${emp.nombreEmpresa || "MI EMPRESA"}</h1>
      <div class="sub">Reporte por Mensajero &nbsp;|&nbsp; Período: ${etiqueta} &nbsp;|&nbsp; ${new Date().toLocaleString("es-CO")}</div>
      <table><thead><tr><th>Mensajero</th><th># Dom.</th><th>Ventas</th><th>Domicilio</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tot"><td>TOTAL</td><td style="text-align:center">${filas.reduce((a,f)=>a+f.count,0)}</td><td style="text-align:right">$${totalVentas.toLocaleString("es-CO")}</td><td style="text-align:right">$${totalEnvio.toLocaleString("es-CO")}</td><td style="text-align:right">$${(totalVentas+totalEnvio).toLocaleString("es-CO")}</td></tr></tfoot>
      </table><script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  // ── Lista filtrada ────────────────────────────────────────────────────────
  const enPeriodo = (d: Domicilio) => {
    const t = new Date(d.fecha).getTime();
    return t >= inicio && t <= fin;
  };
  const domPeriodo = domicilios.filter(enPeriodo);
  const lista = domPeriodo.filter(d => filtroEstado === "TODOS" || d.estado === filtroEstado);
  const conteo = (e: Estado | "TODOS") => e === "TODOS" ? domPeriodo.length : domPeriodo.filter(d => d.estado === e).length;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans">

      {/* CABECERA */}
      <div className="bg-white border-b border-slate-100 px-8 pt-5 pb-4 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Domicilios</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              {domPeriodo.filter(d => d.estado !== "ENTREGADO" && d.estado !== "CANCELADO").length} activos &nbsp;·&nbsp; {etiqueta}
            </p>
          </div>
          <button onClick={async () => {
            const bid = branch?.id || "";
            if (!bid) { toast("warning", "Sin sesión (branchId vacío)"); return; }
            try {
              const { data } = await api.get(`/branches/${bid}/domicilios`);
              const lista = (data.data || []).map((d: any) => ({...d, id: d._id || d.id}));
              if (lista.length > 0) {
                setDomicilios(lista as Domicilio[]);
                localStorage.setItem("domicilios", JSON.stringify(lista));
              } else {
                toast("info", `API respondió vacío. branchId usado: ${bid}`);
              }
            } catch (e: any) {
              toast("error", "Error: " + (e?.response?.data?.message || e?.message || "sin detalle"));
            }
          }}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-gray-50 transition-all">
            ↻ Actualizar
          </button>
          <button onClick={reporteMensajero}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-gray-50 transition-all">
            <FileText size={13} /> Por Mensajero
          </button>
          <button onClick={() => setDrawerNuevo(true)}
            className="flex items-center gap-2 bg-[#1a2b3c] text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-black transition-all shadow-sm">
            <Plus size={14} /> Nuevo Domicilio
          </button>
        </div>

        {/* Filtros de período */}
        <div className="flex gap-3 items-center flex-wrap">
          <select value={tipoRango} onChange={e => setTipoRango(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none">
            {["Diario","Semanal","Quincenal","Mensual","Anual"].map(o => <option key={o}>{o}</option>)}
          </select>
          <div onClick={() => dateInputRef.current?.showPicker()}
            className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 cursor-pointer hover:bg-blue-100 transition-all relative min-w-[180px]">
            <span className="text-[10px] font-black text-blue-700 uppercase">{etiqueta}</span>
            <input ref={dateInputRef} type="date" value={fechaBase}
              onChange={e => setFechaBase(e.target.value)} className="absolute inset-0 opacity-0 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* TABS ESTADO */}
      <div className="px-8 py-3 flex gap-2 shrink-0 flex-wrap">
        {([{ key: "TODOS", label: "Todos" }, ...ESTADOS] as any[]).map(e => (
          <button key={e.key} onClick={() => setFiltroEstado(e.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
              filtroEstado === e.key ? "bg-[#1a2b3c] text-white" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
            }`}>
            {e.label}
            <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${filtroEstado === e.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
              {conteo(e.key)}
            </span>
          </button>
        ))}
      </div>

      {/* LISTA DOMICILIOS */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-200 gap-3">
            <p className="font-black uppercase text-[10px] tracking-widest">Sin domicilios</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {lista.map(dom => {
              const est = ESTADOS.find(e => e.key === dom.estado)!;
              const sig = siguienteEstado[dom.estado];
              return (
                <div key={dom.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {/* Header tarjeta */}
                  <div className="px-5 py-4 flex justify-between items-start border-b border-slate-50">
                    <div>
                      <p className="font-black text-slate-800 text-sm">{dom.nro}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{new Date(dom.fecha).toLocaleString("es-CO")}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${est.bg} ${est.color}`}>{est.label}</span>
                  </div>

                  {/* Datos cliente */}
                  <div className="px-5 py-3 space-y-1">
                    <p className="font-black text-slate-800 uppercase text-xs">{dom.cliente}</p>
                    <p className="text-[10px] text-slate-500 font-bold">{dom.telefono || "—"}</p>
                    <p className="text-[10px] text-slate-600 font-bold">{dom.direccion}{dom.barrio ? ` / ${dom.barrio}` : ""}</p>
                    <p className="text-[10px] text-slate-400">{dom.productos.length} ítem(s) — <span className="font-black text-slate-700">${dom.total.toLocaleString()}</span> — {dom.medioPago}</p>
                    {dom.notas && <p className="text-[10px] text-amber-600 font-bold italic">📝 {dom.notas}</p>}
                  </div>

                  {/* Acciones */}
                  <div className="px-5 pb-4 flex gap-2 flex-wrap">
                    {sig && (
                      <button onClick={() => avanzarEstado(dom)}
                        className="flex-1 bg-[#1a2b3c] text-white py-2 rounded-xl text-[9px] font-black uppercase hover:bg-black transition-all">
                        {accionLabel[dom.estado]}
                      </button>
                    )}
                    <button onClick={() => setPedidoVer(dom)}
                      className="px-3 py-2 bg-slate-100 rounded-xl text-[9px] font-black text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-1">
                      Ver <ChevronRight size={11} />
                    </button>
                    <button onClick={() => imprimirTicket(dom)}
                      className="px-3 py-2 bg-slate-100 rounded-xl text-[9px] font-black text-slate-600 hover:bg-slate-200 transition-all">
                      <Printer size={12} />
                    </button>
                    {dom.estado !== "CANCELADO" && dom.estado !== "ENTREGADO" && (
                      <button onClick={() => cancelar(dom)}
                        className="px-3 py-2 bg-red-50 rounded-xl text-[9px] font-black text-red-500 hover:bg-red-100 transition-all">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DRAWER NUEVO DOMICILIO ── */}
      {drawerNuevo && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20" onClick={() => setDrawerNuevo(false)} />
          <div className="relative w-full max-w-3xl bg-white h-full flex flex-col shadow-2xl">

            <div className="absolute top-4 right-4 z-10">
              <button onClick={() => setDrawerNuevo(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>

            <div className="px-6 pt-5 pb-3 border-b border-slate-100 shrink-0">
              <h2 className="text-base font-black uppercase tracking-tighter text-slate-800">Nuevo Domicilio</h2>
            </div>

            <div className="flex-1 flex overflow-hidden">

              {/* Catálogo izquierda */}
              <div className="w-[55%] border-r border-slate-100 flex flex-col overflow-hidden">
                <div className="px-4 pt-3 pb-2 shrink-0 space-y-2">
                  <input placeholder="Buscar producto..." value={filtro} onChange={e => setFiltro(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none" />
                  <select value={catSel} onChange={e => setCatSel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none">
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-1.5">
                  {filtrados.map(p => {
                    const precio = fmt(p.precioPublico || p.precio);
                    return (
                      <div key={p.id} className="bg-slate-50 rounded-xl px-3 py-2 border border-blue-200">
                        {/* Fila principal: nombre + precio público */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase text-slate-700 truncate">{p.nombre}</p>
                            <p className="text-[9px] text-slate-400">{p.categoria}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {precio > 0 ? (
                              <>
                                <span className="text-[10px] font-black text-slate-600">${precio.toLocaleString()}</span>
                                <button onClick={() => agregarProducto(p, precio)}
                                  className="bg-[#1a2b3c] text-white w-5 h-5 rounded-md font-black text-xs flex items-center justify-center hover:bg-black shrink-0">+</button>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {/* Fila secundaria: precio libre */}
                        <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-slate-200">
                          <input
                            type="number"
                            placeholder="$ precio libre"
                            value={preciosLibres[p.id] || ""}
                            onChange={e => setPreciosLibres(prev => ({...prev, [p.id]: e.target.value}))}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[9px] font-bold outline-none focus:border-slate-400"
                          />
                          <button
                            onClick={() => { const v = parseFloat(preciosLibres[p.id]||"0"); if(v>0){agregarProducto(p,v); setPreciosLibres(prev=>({...prev,[p.id]:""}));} }}
                            className="bg-slate-500 text-white w-5 h-5 rounded-md font-black text-xs flex items-center justify-center hover:bg-slate-700 shrink-0">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Formulario derecha */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 pt-3 space-y-3">

                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Cliente</p>
                    <div className="flex gap-2 items-center">
                      <input
                        list="clientes-dom"
                        value={form.cliente}
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          setForm(f => ({...f, cliente: val}));
                          // Autorellenar teléfono y dirección si coincide
                          const encontrado = listaClientes.find(c => (c.nombre||"").toUpperCase() === val);
                          if (encontrado) setForm(f => ({...f, cliente: val, telefono: encontrado.telefono || f.telefono, direccion: encontrado.direccion || f.direccion}));
                          setMostrarNuevoCliente(false);
                        }}
                        className="flex-1 bg-transparent font-black uppercase text-sm outline-none" placeholder="BUSCAR CLIENTE..." />
                      <datalist id="clientes-dom">
                        {nombresClientes.map((n, i) => <option key={i} value={n} />)}
                      </datalist>
                      {form.cliente.trim() && !clienteExiste && (
                        <button type="button"
                          onClick={() => { setNuevoCliente(nc => ({...nc, nombre: form.cliente})); setMostrarNuevoCliente(v => !v); }}
                          className="shrink-0 bg-emerald-600 text-white px-2 py-1 rounded-lg font-black text-[9px] uppercase hover:bg-emerald-700">
                          + Crear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mini-formulario crear cliente */}
                  {mostrarNuevoCliente && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Nuevo Cliente</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(n => ({...n, nombre: e.target.value.toUpperCase()}))}
                          className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none uppercase" />
                        <input placeholder="Apellidos" value={nuevoCliente.apellidos} onChange={e => setNuevoCliente(n => ({...n, apellidos: e.target.value.toUpperCase()}))}
                          className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none uppercase" />
                        <input placeholder="Identificación" value={nuevoCliente.identificacion} onChange={e => setNuevoCliente(n => ({...n, identificacion: e.target.value}))}
                          className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none" />
                        <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e => setNuevoCliente(n => ({...n, telefono: e.target.value}))}
                          className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none" />
                        <input placeholder="E-mail" value={nuevoCliente.email} onChange={e => setNuevoCliente(n => ({...n, email: e.target.value}))}
                          className="col-span-2 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none" />
                        <input placeholder="Dirección" value={nuevoCliente.direccion} onChange={e => setNuevoCliente(n => ({...n, direccion: e.target.value.toUpperCase()}))}
                          className="col-span-2 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none uppercase" />
                      </div>
                      <button onClick={guardarNuevoCliente}
                        className="w-full bg-emerald-600 text-white py-2 rounded-lg font-black text-[9px] uppercase hover:bg-emerald-700 transition-all">
                        Guardar Cliente
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Teléfono</p>
                      <input value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})}
                        className="w-full bg-transparent font-bold text-sm outline-none" placeholder="300..." />
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Barrio</p>
                      <input value={form.barrio} onChange={e => setForm({...form, barrio: e.target.value})}
                        className="w-full bg-transparent font-bold uppercase text-sm outline-none" placeholder="BARRIO..." />
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Dirección</p>
                    <input value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})}
                      className="w-full bg-transparent font-bold uppercase text-sm outline-none" placeholder="Calle..." />
                  </div>

                  {/* Pedido */}
                  {carrito.length > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1.5">
                      <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Pedido</p>
                      {carrito.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <p className="text-[10px] font-black text-slate-700 flex-1 truncate uppercase">{item.nombre}</p>
                          <button onClick={() => cambiarCant(item.id, item.precio, -1)} className="w-5 h-5 bg-white rounded text-red-500 font-black text-xs flex items-center justify-center border border-slate-200">−</button>
                          <span className="text-[10px] font-black w-4 text-center">{item.cantidad}</span>
                          <button onClick={() => cambiarCant(item.id, item.precio, 1)} className="w-5 h-5 bg-white rounded text-green-600 font-black text-xs flex items-center justify-center border border-slate-200">+</button>
                          <span className="text-[10px] font-black text-slate-600 w-16 text-right">${(item.precio*item.cantidad).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Costo Envío</p>
                      <input type="number" value={form.envio} onChange={e => setForm({...form, envio: e.target.value})}
                        className="w-full bg-transparent font-black text-sm outline-none" placeholder="0" />
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Descuento</p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDescuentoTipo(t => t === "%" ? "$" : "%")}
                          className="shrink-0 bg-blue-100 text-blue-700 font-black text-[10px] px-1.5 py-0.5 rounded w-6 text-center">
                          {descuentoTipo}
                        </button>
                        <input type="number" value={descuentoRaw} onChange={e => setDescuentoRaw(e.target.value)}
                          className="flex-1 bg-transparent font-black text-sm outline-none min-w-0" placeholder="0" />
                      </div>
                      {descuento > 0 && <p className="text-[9px] text-emerald-600 font-black mt-0.5">−${descuento.toLocaleString()}</p>}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Medios de Pago</p>
                    {pagos.map((pago, idx) => (
                      <div key={idx} className="flex gap-1.5 items-center">
                        <select value={pago.medio}
                          onChange={e => setPagos(prev => prev.map((p,i) => i===idx ? {...p, medio: e.target.value} : p))}
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase outline-none shrink-0">
                          {mediosPago.map(m => <option key={m}>{m}</option>)}
                        </select>
                        <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus-within:border-slate-400">
                          <span className="text-slate-400 font-black text-xs mr-1">$</span>
                          <input type="number" placeholder="0" value={pago.monto}
                            onChange={e => setPagos(prev => prev.map((p,i) => i===idx ? {...p, monto: e.target.value} : p))}
                            className="flex-1 bg-transparent outline-none font-black text-xs text-slate-800" />
                        </div>
                        {pagos.length > 1 && (
                          <button onClick={() => setPagos(prev => prev.filter((_,i) => i!==idx))}
                            className="text-red-400 font-black text-base px-0.5">×</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setPagos(prev => [...prev, {medio: mediosPago.find(m => !prev.some(p => p.medio===m)) || "EFECTIVO", monto:""}])}
                      className="text-[9px] font-black text-blue-600 uppercase tracking-widest">+ otro medio</button>
                    {totalPagado > 0 && (
                      <div className={`flex justify-between items-center px-3 py-2 rounded-xl font-black mt-1 ${
                        pendiente <= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                      }`}>
                        <span className="text-[10px] uppercase">{pendiente <= 0 ? "Cambio / Devolver" : "Falta"}</span>
                        <span className="text-base">${Math.abs(pendiente <= 0 ? vuelto : pendiente).toLocaleString("es-CO")}</span>
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Mensajero</p>
                    <div className="flex items-center gap-1.5">
                      <input list="mensajeros-list" value={form.domiciliario}
                        onChange={e => setForm({...form, domiciliario: e.target.value})}
                        className="flex-1 bg-transparent font-black uppercase text-sm outline-none"
                        placeholder="Buscar mensajero..." />
                      <datalist id="mensajeros-list">
                        {listaMensajeros.map((n, i) => <option key={i} value={n} />)}
                      </datalist>
                      {form.domiciliario && !listaMensajeros.includes(form.domiciliario.toUpperCase()) && (
                        <button
                          onClick={async () => {
                            const nombre = form.domiciliario.trim().toUpperCase();
                            if (!nombre) return;
                            try {
                              await api.post(`/branches/${branchId}/contactos`, {
                                nombre, tipo: "EMPLEADO", telefono: "", email: "", direccion: "",
                              });
                              setListaMensajeros(prev => [...prev, nombre]);
                              toast("success", `${nombre} agregado como mensajero`);
                            } catch { toast("error", "Error al crear mensajero"); }
                          }}
                          className="shrink-0 text-[8px] font-black text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 whitespace-nowrap"
                          title="Crear mensajero nuevo">
                          + Crear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Notas</p>
                    <input value={form.notas} onChange={e => setForm({...form, notas: e.target.value})}
                      className="w-full bg-transparent font-bold text-sm outline-none" placeholder="Sin cebolla, extra salsa..." />
                  </div>

                  {/* Total */}
                  <div className="bg-[#1a2b3c] rounded-xl px-4 py-3 text-white">
                    <div className="flex justify-between text-[10px] font-bold text-white/60 mb-1"><span>Subtotal</span><span>${subtotal.toLocaleString()}</span></div>
                    {descuento > 0 && <div className="flex justify-between text-[10px] font-bold text-emerald-400 mb-1"><span>Descuento</span><span>−${descuento.toLocaleString()}</span></div>}
                    {impuesto > 0 && <div className="flex justify-between text-[10px] font-bold text-white/60 mb-1"><span>{tipoImp === "IVA_19" ? "IVA 19%" : "IpoConsumo 8%"}</span><span>${impuesto.toLocaleString()}</span></div>}
                    {envioNum > 0 && <div className="flex justify-between text-[10px] font-bold text-white/60 mb-2"><span>Envío</span><span>${envioNum.toLocaleString()}</span></div>}
                    <div className="flex justify-between font-black text-lg"><span>TOTAL</span><span>${total.toLocaleString()}</span></div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-100 shrink-0 flex gap-2">
                  <button onClick={crearConTicket}
                    className="flex-1 bg-slate-600 text-white py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 active:scale-95 transition-all">
                    🧾 Ticket
                  </button>
                  <button onClick={crearConFactura}
                    className="flex-1 bg-[#1a2b3c] text-white py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black active:scale-95 transition-all">
                    🧾 Factura FD
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DRAWER DETALLE ── */}
      {pedidoVer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20" onClick={() => setPedidoVer(null)} />
          <div className="relative w-full max-w-sm bg-white h-full flex flex-col shadow-2xl px-6 py-5">
            <div className="absolute top-4 right-4 flex gap-1">
              <button onClick={() => imprimirTicket(pedidoVer)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><Printer size={15} /></button>
              <button onClick={() => setPedidoVer(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={15} /></button>
            </div>
            <div className="pt-8">
              <div className="flex items-center gap-3 mb-1">
                <p className="font-black text-slate-800 text-lg">{pedidoVer.nro}</p>
                {(() => { const est = ESTADOS.find(e => e.key === pedidoVer.estado)!; return <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${est.bg} ${est.color}`}>{est.label}</span>; })()}
              </div>
              <p className="text-[10px] text-slate-400 font-bold mb-4">{new Date(pedidoVer.fecha).toLocaleString("es-CO")}</p>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1">
                <p className="font-black text-slate-800 uppercase">{pedidoVer.cliente}</p>
                <p className="text-[10px] text-slate-500">{pedidoVer.telefono || "—"}</p>
                <p className="text-[10px] text-slate-600">{pedidoVer.direccion}{pedidoVer.barrio ? ` / ${pedidoVer.barrio}` : ""}</p>
                {pedidoVer.domiciliario && <p className="text-[10px] font-black text-slate-500">Domiciliario: {pedidoVer.domiciliario}</p>}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1.5">
                <p className="text-[9px] font-black text-blue-500 uppercase">Pedido</p>
                {pedidoVer.productos.map((p, i) => (
                  <div key={i} className="flex justify-between text-[10px] font-bold text-slate-700">
                    <span className="truncate flex-1">{p.cantidad}x {p.nombre}</span>
                    <span className="ml-2 shrink-0">${(p.precio*p.cantidad).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold"><span>Subtotal</span><span>${pedidoVer.subtotal.toLocaleString()}</span></div>
                {(pedidoVer.descuento||0) > 0 && <div className="flex justify-between text-[10px] font-bold text-red-500"><span>Descuento</span><span>-${(pedidoVer.descuento||0).toLocaleString()}</span></div>}
                {((pedidoVer as any).impuesto||0) > 0 && <div className="flex justify-between text-[10px] text-slate-500 font-bold"><span>{empresa?.tributario?.tipoImpuesto === "IVA_19" ? "IVA 19%" : "IpoConsumo 8%"}</span><span>${((pedidoVer as any).impuesto||0).toLocaleString()}</span></div>}
                <div className="flex justify-between text-[10px] text-slate-500 font-bold"><span>Envío</span><span>${pedidoVer.envio.toLocaleString()}</span></div>
                <div className="flex justify-between font-black text-slate-800"><span>Total</span><span>${pedidoVer.total.toLocaleString()}</span></div>
                <div className="text-[10px] text-slate-400 font-bold pt-1">Pago: {pedidoVer.medioPago}</div>
              </div>
              {pedidoVer.notas && <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-[10px] font-bold text-amber-700">📝 {pedidoVer.notas}</div>}
            </div>
            {siguienteEstado[pedidoVer.estado] && (
              <div className="pt-3 space-y-2 shrink-0">
                <button onClick={() => avanzarEstado(pedidoVer)}
                  className="w-full bg-[#1a2b3c] text-white py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all">
                  {accionLabel[pedidoVer.estado]}
                </button>
                {pedidoVer.estado !== "CANCELADO" && (
                  <button onClick={() => cancelar(pedidoVer)} className="w-full bg-red-50 text-red-600 py-2.5 rounded-xl font-black uppercase text-[10px] hover:bg-red-100 transition-all">
                    Cancelar Domicilio
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
