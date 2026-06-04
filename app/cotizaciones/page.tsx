"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { X, Plus, Minus, FileText, Trash2, Eye, ChevronLeft, Search, Mail, MessageCircle, CalendarDays } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig, patchEmpresaConfig } from "../../lib/empresaStorage";
import { useConfirm } from "../../contexts/ConfirmContext";

interface Producto { id: string; nombre: string; precioPublico: number; categoria?: string; }
interface ItemCot  { nombre: string; cantidad: number; precioUnitario: number; subtotal: number; }
interface Cotizacion {
  _id: string; nro: string; fecha: string; vigencia: string;
  cliente: string; direccion: string; telefono: string; email: string;
  items: ItemCot[]; descuento: number; notas: string;
  subtotal: number; impuesto?: number; domicilio?: number; totalFinal: number;
  estado: "vigente" | "vencida" | "aceptada" | "cancelada";
}

const ESTADO_STYLE: Record<string, string> = {
  vigente:  "bg-emerald-100 text-emerald-700 border border-emerald-200",
  vencida:  "bg-gray-100 text-gray-500 border border-gray-200",
  aceptada: "bg-blue-100 text-blue-700 border border-blue-200",
  cancelada:"bg-red-100 text-red-500 border border-red-200",
};

const hoy = () => new Date().toISOString().split("T")[0];

const nroConsec = (lista: Cotizacion[]) => {
  const max = lista.reduce((m, c) => {
    const n = parseInt(c.nro.replace(/\D/g, "")) || 0;
    return n > m ? n : m;
  }, 0);
  return `COT-${String(max + 1).padStart(3, "0")}`;
};

const emptyForm = () => ({
  cliente: "", direccion: "", telefono: "", email: "",
  vigencia: "", notas: "", descuento: 0, domicilio: 0, aplicarImpuesto: false,
  items: [] as ItemCot[],
});

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">{label}</label>
    {children}
  </div>
);

const inp = "w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors bg-white";

/* ── WhatsApp / Email helpers ────────────────────────────────────────── */
function buildWA(cot: Cotizacion) {
  const lineas = cot.items.map(i => `  • ${i.nombre} x${i.cantidad} = $${i.subtotal.toLocaleString("es-CO")}`).join("\n");
  const msg = `*COTIZACIÓN ${cot.nro}*\nCliente: ${cot.cliente}\nFecha: ${cot.fecha} | Vigencia: ${cot.vigencia}\n\n${lineas}\n\n*TOTAL: $${cot.totalFinal.toLocaleString("es-CO")}*${cot.notas ? `\n\n_${cot.notas}_` : ""}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

function buildMail(cot: Cotizacion) {
  const lineas = cot.items.map(i => `  - ${i.nombre} x${i.cantidad}: $${i.subtotal.toLocaleString("es-CO")}`).join("\n");
  const body = `Estimado/a ${cot.cliente},\n\nAdjunto los detalles de la cotización ${cot.nro}:\n\n${lineas}\n\nSubtotal: $${cot.subtotal.toLocaleString("es-CO")}${cot.descuento > 0 ? `\nDescuento (${cot.descuento}%): -$${(cot.subtotal * cot.descuento / 100).toLocaleString("es-CO")}` : ""}\nTOTAL: $${cot.totalFinal.toLocaleString("es-CO")}\n\nVigente hasta: ${cot.vigencia}${cot.notas ? `\n\nNotas: ${cot.notas}` : ""}\n\nQuedamos atentos.`;
  return `mailto:${cot.email || ""}?subject=Cotización ${cot.nro} - ${cot.cliente}&body=${encodeURIComponent(body)}`;
}

export default function CotizacionesPage() {
  const { branch, company } = useAuth();
  const branchId = branch?.id ?? "";
  const confirm  = useConfirm();

  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [productos,    setProductos]    = useState<Producto[]>([]);
  const [vista,    setVista]    = useState<"lista" | "nueva" | "ver">("lista");
  const [form,     setForm]     = useState(emptyForm());
  const [verDoc,   setVerDoc]   = useState<Cotizacion | null>(null);
  const [guardando,setGuardando]= useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [catActiva,setCatActiva]= useState("TODAS");
  const [tipoRango, setTipoRango] = useState("Diario");
  const [fechaBase, setFechaBase] = useState(new Date().toLocaleDateString("en-CA"));
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [cfgEmpresa, setCfgEmpresa] = useState<any>(() => {
    try { return getEmpresaConfig(); } catch { return {}; }
  });
  const dateInputRef = useRef<HTMLInputElement>(null);
  const cliRef       = useRef<HTMLDivElement>(null);
  const [listaClientes, setListaClientes] = useState<any[]>([]);
  const [cliQuery,      setCliQuery]      = useState("");
  const [cliDropOpen,   setCliDropOpen]   = useState(false);

  useEffect(() => {
    if (!branchId) return;
    cargar();
    api.get(`/branches/${branchId}/products`)
      .then(r => {
        const lista = (r.data.data ?? r.data ?? []).map((p: any) => ({
          ...p, id: p._id?.toString() || p.id,
        }));
        setProductos(lista);
      })
      .catch(() => toast("error", "Error al cargar productos"));
    const cliKey = `clientes_${branchId}`;
    api.get(`/branches/${branchId}/contactos?tipo=CLIENTE`)
      .then(r => {
        const lista = (r.data.data ?? r.data ?? []).map((c: any) => ({
          nombre:   (c.nombre   || "").toUpperCase(),
          telefono:  c.telefono  || "",
          email:     c.email     || "",
          direccion: c.direccion || "",
        }));
        setListaClientes(lista);
        localStorage.setItem(cliKey, JSON.stringify(lista));
      })
      .catch(() => {
        const local = JSON.parse(localStorage.getItem(cliKey) || "[]");
        setListaClientes(local);
      });
    // Refrescar tributario desde MongoDB
    if (company?.id) {
      api.get(`/companies/${company.id}`)
        .then(({ data }) => {
          const c = data.data ?? data;
          const patch: any = {};
          if (c.propinas) patch.propinas = c.propinas;
          if (c.tributario?.tipoImpuesto && c.tributario.tipoImpuesto !== "NINGUNO")
            patch.tributario = c.tributario;
          if (Object.keys(patch).length > 0) {
            setCfgEmpresa((prev: any) => ({ ...prev, ...patch }));
            patchEmpresaConfig(patch);
          }
        })
        .catch(() => {});
    }
  }, [branchId]);

  const cargar = async () => {
    try {
      const r = await api.get(`/branches/${branchId}/cotizaciones`);
      setCotizaciones(r.data.data ?? r.data);
    } catch { toast("error", "Error al cargar cotizaciones"); }
  };

  const categorias = useMemo(() => {
    const cats = [...new Set(productos.map(p => (p.categoria || "").toUpperCase()).filter(Boolean))].sort();
    return ["TODAS", ...cats];
  }, [productos]);

  const productosFiltrados = useMemo(() => productos.filter(p => {
    const mc = catActiva === "TODAS" || (p.categoria || "").toUpperCase() === catActiva;
    const mb = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return mc && mb;
  }).sort((a, b) => a.nombre.localeCompare(b.nombre)), [productos, catActiva, busqueda]);

  const cfg        = cfgEmpresa;
  const tipoImp    = cfg.tributario?.tipoImpuesto ?? "NINGUNO";
  const taxRate    = tipoImp === "IVA_19" ? 0.19 : tipoImp === "IPC_8" ? 0.08 : 0;
  const subtotal    = form.items.reduce((s, i) => s + i.subtotal, 0);
  const descuentoVal = subtotal * (form.descuento / 100);
  const baseImp    = subtotal - descuentoVal;
  const impuesto   = form.aplicarImpuesto && taxRate > 0 ? Math.round(baseImp * taxRate / (1 + taxRate)) : 0;
  const totalFinal = baseImp + (form.domicilio || 0);

  const agregarProducto = (p: Producto) => {
    setForm(f => {
      const idx = f.items.findIndex(i => i.nombre === p.nombre);
      if (idx >= 0) {
        const items = [...f.items];
        items[idx] = { ...items[idx], cantidad: items[idx].cantidad + 1, subtotal: (items[idx].cantidad + 1) * items[idx].precioUnitario };
        return { ...f, items };
      }
      return { ...f, items: [...f.items, { nombre: p.nombre, cantidad: 1, precioUnitario: p.precioPublico, subtotal: p.precioPublico }] };
    });
  };

  const cambiarCantidad = (idx: number, delta: number) => {
    setForm(f => {
      const items = [...f.items];
      const n = Math.max(1, items[idx].cantidad + delta);
      items[idx] = { ...items[idx], cantidad: n, subtotal: n * items[idx].precioUnitario };
      return { ...f, items };
    });
  };

  const quitarItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  // Cerrar dropdown al click fuera
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (cliRef.current && !cliRef.current.contains(e.target as Node)) setCliDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const cliSuggestions = listaClientes.filter(c =>
    cliQuery.length > 0 && (c.nombre || "").toLowerCase().includes(cliQuery.toLowerCase())
  ).slice(0, 7);

  const seleccionarCliente = (c: any) => {
    setCliQuery(c.nombre);
    setForm(f => ({ ...f, cliente: c.nombre, direccion: c.direccion, telefono: c.telefono, email: c.email }));
    setCliDropOpen(false);
  };

  const crearCliente = async () => {
    if (!cliQuery.trim() || !branchId) return;
    try {
      await api.post(`/branches/${branchId}/contactos`, {
        nombre:   cliQuery.trim().toUpperCase(),
        tipo:     "CLIENTE",
        telefono: form.telefono,
        email:    form.email,
        direccion:form.direccion,
      });
      const r = await api.get(`/branches/${branchId}/contactos?tipo=CLIENTE`);
      const lista = (r.data.data ?? r.data ?? []).map((c: any) => ({
        nombre:   (c.nombre   || "").toUpperCase(),
        telefono:  c.telefono  || "",
        email:     c.email     || "",
        direccion: c.direccion || "",
      }));
      setListaClientes(lista);
      localStorage.setItem(`clientes_${branchId}`, JSON.stringify(lista));
      toast("success", `Cliente "${cliQuery.trim()}" creado`);
      setCliDropOpen(false);
    } catch { toast("error", "Error al crear el cliente"); }
  };

  const guardar = async () => {
    if (!form.cliente.trim())    return toast("warning", "Ingresa el nombre del cliente");
    if (!form.vigencia)          return toast("warning", "Selecciona la fecha de vigencia");
    if (form.items.length === 0) return toast("warning", "Agrega al menos un producto");
    setGuardando(true);
    try {
      await api.post(`/branches/${branchId}/cotizaciones`, {
        nro: nroConsec(cotizaciones), fecha: hoy(),
        vigencia: form.vigencia, cliente: form.cliente,
        direccion: form.direccion, telefono: form.telefono, email: form.email,
        items: form.items, descuento: form.descuento, notas: form.notas,
        subtotal, impuesto, domicilio: form.domicilio || 0, totalFinal,
      });
      toast("success", "Cotización guardada");
      setForm(emptyForm()); setVista("lista"); cargar();
    } catch (e: any) {
      toast("error", e?.response?.data?.error || e?.response?.data?.message || "Error al guardar la cotización");
    } finally { setGuardando(false); }
  };

  const cambiarEstado = async (cot: Cotizacion, estado: string) => {
    try {
      await api.put(`/branches/${branchId}/cotizaciones/${cot._id}`, { estado });
      cargar();
    } catch { toast("error", "Error al cambiar estado"); }
  };

  const eliminar = async (cot: Cotizacion) => {
    if (!await confirm("¿Eliminar esta cotización? Esta acción no se puede deshacer.", "Eliminar cotización")) return;
    try {
      await api.delete(`/branches/${branchId}/cotizaciones/${cot._id}`);
      toast("success", "Cotización eliminada");
      if (verDoc?._id === cot._id) setVista("lista");
      cargar();
    } catch { toast("error", "Error al eliminar"); }
  };

  /* ── Impresión térmica 80mm ─────────────────────────────────────────── */
  const imprimirTermico = (cot: Cotizacion) => {
    const emp = getEmpresaConfig();
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;width:80mm;max-width:80mm;padding:3mm 4mm;font-size:10px;color:#000}
.c{text-align:center}.b{font-weight:bold}.hr{border:none;border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between;margin:2px 0;font-size:10px}
.sub{padding-left:8px;font-size:9px;color:#555}
@media print{@page{margin:0;size:80mm auto}body{padding:2mm}}</style>
</head><body>
<div class="c b" style="font-size:12px">${emp.nombreEmpresa || "MI EMPRESA"}</div>
${emp.nit ? `<div class="c" style="font-size:9px">NIT: ${emp.nit}</div>` : ""}
${emp.telefono ? `<div class="c" style="font-size:9px">Tel: ${emp.telefono}</div>` : ""}
<div class="hr"></div>
<div class="c b">COTIZACIÓN ${cot.nro}</div>
<div class="c" style="font-size:9px">Fecha: ${cot.fecha} | Vigencia: ${cot.vigencia}</div>
<div class="hr"></div>
<div class="b" style="font-size:9px">${cot.cliente}</div>
${cot.direccion ? `<div style="font-size:9px">${cot.direccion}</div>` : ""}
${cot.telefono ? `<div style="font-size:9px">Tel: ${cot.telefono}</div>` : ""}
<div class="hr"></div>
${cot.items.map(it => `
<div class="row"><span class="b">${it.nombre}</span></div>
<div class="row"><span class="sub">x${it.cantidad} @ $${it.precioUnitario.toLocaleString("es-CO")}</span><span>$${it.subtotal.toLocaleString("es-CO")}</span></div>`).join("")}
<div class="hr"></div>
<div class="row"><span>Subtotal</span><span>$${cot.subtotal.toLocaleString("es-CO")}</span></div>
${(cot.descuento ?? 0) > 0 ? `<div class="row"><span>Descuento (${cot.descuento}%)</span><span>-$${Math.round(cot.subtotal * cot.descuento / 100).toLocaleString("es-CO")}</span></div>` : ""}
${(cot.impuesto ?? 0) > 0 ? `<div class="row"><span>Impuesto</span><span>$${(cot.impuesto!).toLocaleString("es-CO")}</span></div>` : ""}
${(cot.domicilio ?? 0) > 0 ? `<div class="row"><span>Domicilio/Envío</span><span>$${(cot.domicilio!).toLocaleString("es-CO")}</span></div>` : ""}
<div class="hr"></div>
<div class="row b" style="font-size:13px"><span>TOTAL</span><span>$${cot.totalFinal.toLocaleString("es-CO")}</span></div>
${cot.notas ? `<div class="hr"></div><div style="font-size:9px">${cot.notas}</div>` : ""}
<div class="hr"></div>
<div class="c" style="font-size:9px">Válida hasta: ${cot.vigencia}</div>
<script>window.print();window.close();</script>
</body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  /* ══════════════════════════════════════════════════════════════════════
     VISTA: DOCUMENTO (ver + imprimir + compartir)
  ══════════════════════════════════════════════════════════════════════ */
  if (vista === "ver" && verDoc) return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Acciones */}
      <div className="flex items-center gap-2 mb-5 no-print flex-wrap">
        <button onClick={() => setVista("lista")} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-800 mr-auto">
          <ChevronLeft size={16} /> Volver
        </button>
        <a href={buildWA(verDoc)} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          <MessageCircle size={13} /> WhatsApp
        </a>
        <a href={buildMail(verDoc)}
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          <Mail size={13} /> E-mail
        </a>
        <button onClick={() => window.print()}
          className="flex flex-col items-center bg-gray-900 hover:bg-black text-white px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          <FileText size={13} />
          <span className="text-[7px] mt-0.5">A4</span>
        </button>
        <button onClick={() => imprimirTermico(verDoc)}
          className="flex flex-col items-center bg-gray-700 hover:bg-gray-900 text-white px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          <FileText size={13} />
          <span className="text-[7px] mt-0.5">80mm</span>
        </button>
        <button onClick={() => eliminar(verDoc)}
          className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-500 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all border border-red-200">
          <Trash2 size={13} /> Eliminar
        </button>
      </div>

      {/* Estado */}
      <div className="flex items-center gap-3 mb-4 no-print">
        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Estado:</span>
        <select value={verDoc.estado} onChange={e => { cambiarEstado(verDoc, e.target.value); setVerDoc({ ...verDoc, estado: e.target.value as any }); }}
          className={`text-[10px] font-black px-3 py-1.5 rounded-full border-0 focus:outline-none cursor-pointer ${ESTADO_STYLE[verDoc.estado]}`}>
          <option value="vigente">Vigente</option>
          <option value="aceptada">Aceptada</option>
          <option value="vencida">Vencida</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      {/* Documento */}
      {(() => {
        const emp = getEmpresaConfig();
        return (
      <div id="area-cotizacion" className="bg-white p-8 rounded-3xl border-2 border-gray-200 shadow-lg">
        <div className="flex justify-between items-start pb-5 border-b-2 border-gray-900 mb-5">
          <div className="max-w-[55%]">
            {emp.logo && <img src={emp.logo} alt="logo" className="h-10 object-contain mb-1" />}
            <h1 className="text-base font-black tracking-tighter uppercase leading-tight">{emp.nombreEmpresa || "Mi Empresa"}</h1>
            <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Cotización Profesional</p>
            {emp.nit      && <p className="text-[9px] text-gray-400 mt-0.5">NIT: {emp.nit}</p>}
            {emp.telefono && <p className="text-[9px] text-gray-400">Tel: {emp.telefono}</p>}
            {emp.direccion && <p className="text-[9px] text-gray-400">{emp.direccion}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-blue-600">{verDoc.nro}</p>
            <p className="text-xs text-gray-500 mt-1">Fecha: <strong>{verDoc.fecha}</strong></p>
            <p className="text-xs text-gray-500">Vigencia: <strong>{verDoc.vigencia}</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8 p-5 bg-gray-50 rounded-2xl border border-gray-200">
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Cliente</p>
            <p className="text-base font-black text-gray-800 mt-0.5">{verDoc.cliente}</p>
            {verDoc.direccion && <p className="text-xs text-gray-500 mt-1">{verDoc.direccion}</p>}
          </div>
          <div className="text-right space-y-0.5">
            {verDoc.telefono && <p className="text-xs text-gray-600">Tel: <strong>{verDoc.telefono}</strong></p>}
            {verDoc.email    && <p className="text-xs text-gray-600">Email: <strong>{verDoc.email}</strong></p>}
          </div>
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="text-left py-2 px-2 font-black text-xs uppercase tracking-widest text-gray-500">Descripción</th>
              <th className="text-center py-2 font-black text-xs uppercase tracking-widest text-gray-500 w-16">Cant.</th>
              <th className="text-right py-2 font-black text-xs uppercase tracking-widest text-gray-500 w-28">Precio</th>
              <th className="text-right py-2 px-2 font-black text-xs uppercase tracking-widest text-gray-500 w-28">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {verDoc.items.map((it, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2.5 px-2 font-medium text-gray-800">{it.nombre}</td>
                <td className="py-2.5 text-center font-bold text-gray-600">{it.cantidad}</td>
                <td className="py-2.5 text-right text-gray-500">${it.precioUnitario.toLocaleString("es-CO")}</td>
                <td className="py-2.5 px-2 text-right font-bold text-gray-800">${it.subtotal.toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-200">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="font-bold text-gray-800">${verDoc.subtotal.toLocaleString("es-CO")}</span>
            </div>
            {verDoc.descuento > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Descuento ({verDoc.descuento}%)</span>
                <span className="font-bold text-red-500">-${(verDoc.subtotal * verDoc.descuento / 100).toLocaleString("es-CO")}</span>
              </div>
            )}
            {(verDoc.impuesto ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Impuesto</span>
                <span className="font-bold text-amber-600">${(verDoc.impuesto!).toLocaleString("es-CO")}</span>
              </div>
            )}
            {(verDoc.domicilio ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Domicilio / Envío</span>
                <span className="font-bold text-orange-500">${(verDoc.domicilio!).toLocaleString("es-CO")}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-black border-t-2 border-gray-900 pt-2">
              <span>TOTAL</span>
              <span className="text-green-600">${verDoc.totalFinal.toLocaleString("es-CO")}</span>
            </div>
          </div>
        </div>

        {verDoc.notas && (
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200">
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Notas / Condiciones</p>
            <p className="text-sm text-gray-700">{verDoc.notas}</p>
          </div>
        )}
      </div>
        );
      })()}

      <style jsx global>{`
        @media print {
          @page { margin: 0; size: A4; }
          body * { visibility: hidden; }
          #area-cotizacion, #area-cotizacion * { visibility: visible; }
          #area-cotizacion { position: absolute; left: 0; top: 0; width: 100%; min-height: 100vh; border: none !important; box-shadow: none !important; border-radius: 0 !important; padding: 24px 32px !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════
     VISTA: NUEVA COTIZACIÓN (3 columnas)
  ══════════════════════════════════════════════════════════════════════ */
  if (vista === "nueva") return (
    <div className="h-full flex flex-col">
      {/* Topbar */}
      <div className="flex items-center gap-4 px-5 py-3 bg-white border-b-2 border-gray-200 shrink-0">
        <button onClick={() => setVista("lista")} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800">
          <ChevronLeft size={16} /> Volver
        </button>
        <h1 className="text-base font-black text-gray-800 uppercase tracking-tighter">Nueva Cotización</h1>
        <button onClick={guardar} disabled={guardando}
          className="ml-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          {guardando ? "Guardando..." : "Guardar Cotización"}
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">

        {/* ── COL 1: Datos del cliente ─────────────────────────────── */}
        <div className="w-80 shrink-0 border-r-2 border-gray-200 bg-gray-50 flex flex-col overflow-y-auto p-4 space-y-3">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Datos del cliente</p>

          <Field label="Nombre *">
            <div className="relative" ref={cliRef}>
              <input
                value={cliQuery}
                onChange={e => {
                  setCliQuery(e.target.value);
                  setForm(f => ({ ...f, cliente: e.target.value.toUpperCase() }));
                  setCliDropOpen(true);
                }}
                onFocus={() => { if (cliQuery.length > 0) setCliDropOpen(true); }}
                placeholder="Buscar o escribir nombre…"
                className={inp}
              />
              {cliDropOpen && cliQuery.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {cliSuggestions.map((c, i) => (
                    <button key={i} type="button" onClick={() => seleccionarCliente(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-xs font-bold text-gray-700 border-b border-gray-50 last:border-0">
                      {c.nombre}
                      {c.telefono && <span className="text-gray-400 font-normal ml-2">{c.telefono}</span>}
                    </button>
                  ))}
                  {cliSuggestions.length === 0 && (
                    <div className="px-3 py-2.5">
                      <p className="text-[10px] text-gray-400 mb-2">No se encontró en clientes guardados</p>
                      <button type="button" onClick={crearCliente}
                        className="w-full text-left px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-black transition-colors">
                        + Crear "{cliQuery.trim()}" como cliente
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Field>
          <Field label="Dirección">
            <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
              placeholder="Dirección" className={inp} />
          </Field>
          <Field label="Teléfono">
            <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
              placeholder="300 000 0000" type="tel" className={inp} />
          </Field>
          <Field label="E-mail">
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="correo@ejemplo.com" type="email" className={inp} />
          </Field>
          <Field label="Vigencia *">
            <input type="date" value={form.vigencia} onChange={e => setForm(f => ({ ...f, vigencia: e.target.value }))}
              className={inp} />
          </Field>
          <Field label="Descuento (%)">
            <input type="number" min={0} max={100} value={form.descuento}
              onChange={e => setForm(f => ({ ...f, descuento: Number(e.target.value) }))}
              className={inp} />
          </Field>
          <Field label="Domicilio / Envío ($)">
            <input type="number" min={0} value={form.domicilio}
              onChange={e => setForm(f => ({ ...f, domicilio: Number(e.target.value) }))}
              className={inp} placeholder="0" />
          </Field>
          {taxRate > 0 && (
            <Field label={`Impuesto (${tipoImp === "IVA_19" ? "IVA 19%" : "IpoConsumo 8%"})`}>
              <div className="flex items-center gap-3 py-2">
                <button onClick={() => setForm(f => ({ ...f, aplicarImpuesto: !f.aplicarImpuesto }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.aplicarImpuesto ? "bg-blue-600" : "bg-gray-200"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.aplicarImpuesto ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <span className="text-sm font-bold text-gray-700">{form.aplicarImpuesto ? "Aplicar" : "No aplica"}</span>
              </div>
            </Field>
          )}
          <Field label="Notas / Condiciones">
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={4} placeholder="Condiciones de pago, tiempos de entrega..."
              className={`${inp} resize-none`} />
          </Field>
        </div>

        {/* ── COL 2: Catálogo de productos ─────────────────────────── */}
        <div className="w-96 shrink-0 border-r-2 border-gray-200 bg-white flex flex-col">
          <div className="p-3 space-y-2 border-b-2 border-gray-200 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full pl-8 pr-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-xl text-[11px] font-black uppercase outline-none focus:border-blue-400 transition-colors" />
            </div>
            <select value={catActiva} onChange={e => setCatActiva(e.target.value)}
              className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2 text-[11px] font-black uppercase outline-none focus:border-blue-400 transition-colors">
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {productosFiltrados.length === 0 && (
              <p className="text-xs text-gray-300 font-bold text-center pt-8">Sin productos</p>
            )}
            {productosFiltrados.map(p => (
              <button key={p.id} onClick={() => agregarProducto(p)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-blue-50 transition-all group text-left border border-transparent hover:border-blue-200">
                <span className="text-[11px] font-black uppercase text-gray-700 truncate flex-1 mr-2">{p.nombre}</span>
                <span className="text-[10px] font-black text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg shrink-0 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                  ${p.precioPublico.toLocaleString("es-CO")}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── COL 3: Productos seleccionados + totales ─────────────── */}
        <div className="flex-1 flex flex-col bg-gray-50">
          <div className="p-4 border-b-2 border-gray-200 bg-white shrink-0">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Productos seleccionados</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {form.items.length === 0 && (
              <p className="text-sm text-gray-300 font-bold text-center pt-16">← Selecciona productos del catálogo</p>
            )}
            {form.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-gray-800 truncate uppercase">{it.nombre}</p>
                  <p className="text-xs text-gray-400">${it.precioUnitario.toLocaleString("es-CO")} c/u</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => cambiarCantidad(i, -1)}
                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 flex items-center justify-center transition-colors">
                    <Minus size={11} />
                  </button>
                  <span className="w-8 text-center text-sm font-black">{it.cantidad}</span>
                  <button onClick={() => cambiarCantidad(i, 1)}
                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 flex items-center justify-center transition-colors">
                    <Plus size={11} />
                  </button>
                </div>
                <span className="text-sm font-black text-gray-800 w-24 text-right shrink-0">
                  ${it.subtotal.toLocaleString("es-CO")}
                </span>
                <button onClick={() => quitarItem(i)} className="text-red-400 hover:text-red-600 shrink-0 ml-1">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="p-4 bg-white border-t-2 border-gray-200 space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="font-bold text-gray-800">${subtotal.toLocaleString("es-CO")}</span>
            </div>
            {form.descuento > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Descuento ({form.descuento}%)</span>
                <span className="font-bold text-red-500">-${descuentoVal.toLocaleString("es-CO")}</span>
              </div>
            )}
            {impuesto > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{tipoImp === "IVA_19" ? "IVA 19%" : "IpoConsumo 8%"}</span>
                <span className="font-bold text-amber-600">${impuesto.toLocaleString("es-CO")}</span>
              </div>
            )}
            {(form.domicilio || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Domicilio / Envío</span>
                <span className="font-bold text-orange-500">${(form.domicilio || 0).toLocaleString("es-CO")}</span>
              </div>
            )}
            <div className="flex justify-between text-2xl font-black text-gray-900 border-t-2 border-gray-200 pt-2">
              <span>TOTAL</span>
              <span className="text-green-600">${totalFinal.toLocaleString("es-CO")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════
     VISTA: LISTA
  ══════════════════════════════════════════════════════════════════════ */
  const getRango = () => {
    const base = new Date(fechaBase + "T12:00:00");
    let ini = new Date(base); ini.setHours(0,0,0,0);
    let fin = new Date(base); fin.setHours(23,59,59,999);
    const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day:"2-digit", month:"short" });
    let label = base.toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" });
    if (tipoRango === "Semanal") {
      const d = base.getDay();
      ini.setDate(base.getDate() - (d === 0 ? 6 : d - 1));
      fin = new Date(ini); fin.setDate(ini.getDate() + 6); fin.setHours(23,59,59,999);
      label = `${fmt(ini)} – ${fmt(fin)}`;
    } else if (tipoRango === "Quincenal") {
      if (base.getDate() <= 15) { ini.setDate(1); fin = new Date(base); fin.setDate(15); fin.setHours(23,59,59,999); }
      else { ini.setDate(16); fin = new Date(base.getFullYear(), base.getMonth()+1, 0); fin.setHours(23,59,59,999); }
      label = `${fmt(ini)} – ${fmt(fin)}`;
    } else if (tipoRango === "Mensual") {
      ini.setDate(1); fin = new Date(base.getFullYear(), base.getMonth()+1, 0); fin.setHours(23,59,59,999);
      label = base.toLocaleDateString("es-CO", { month:"long", year:"numeric" }).toUpperCase();
    } else if (tipoRango === "Anual") {
      ini = new Date(base.getFullYear(), 0, 1); fin = new Date(base.getFullYear(), 11, 31); fin.setHours(23,59,59,999);
      label = `AÑO ${base.getFullYear()}`;
    }
    return { inicio: ini.getTime(), fin: fin.getTime(), label };
  };
  const { inicio, fin, label: etiquetaRango } = getRango();

  const cotsFiltradas = cotizaciones.filter(c => {
    const t = new Date(c.fecha + "T12:00:00").getTime();
    const enRango = t >= inicio && t <= fin;
    const enEstado = filtroEstado === "todos" || c.estado === filtroEstado;
    return enRango && enEstado;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Cotizaciones</h1>
        <button onClick={() => { setForm(emptyForm()); setBusqueda(""); setCatActiva("TODAS"); setVista("nueva"); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
          <Plus size={14} /> Nueva Cotización
        </button>
      </div>

      {/* Filtros de período */}
      <div className="flex gap-3 items-center flex-wrap mb-5">
        <select value={tipoRango} onChange={e => setTipoRango(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none shadow-sm">
          {["Diario","Semanal","Quincenal","Mensual","Anual"].map(o => <option key={o}>{o}</option>)}
        </select>

        <div onClick={() => dateInputRef.current?.showPicker()}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 cursor-pointer hover:border-blue-300 transition-all relative shadow-sm">
          <CalendarDays size={13} className="text-blue-500 shrink-0" />
          <span className="text-[10px] font-black text-blue-600 uppercase">{etiquetaRango}</span>
          <input ref={dateInputRef} type="date" value={fechaBase} onChange={e => setFechaBase(e.target.value)}
            className="absolute inset-0 opacity-0 pointer-events-none" />
        </div>

        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none shadow-sm">
          <option value="todos">Todos los estados</option>
          <option value="vigente">Vigente</option>
          <option value="aceptada">Aceptada</option>
          <option value="vencida">Vencida</option>
          <option value="cancelada">Cancelada</option>
        </select>

        <span className="ml-auto text-[10px] font-black text-gray-400 uppercase">
          {cotsFiltradas.length} cotización{cotsFiltradas.length !== 1 ? "es" : ""}
        </span>
      </div>

      {cotsFiltradas.length === 0 ? (
        <div className="text-center py-24 text-gray-300">
          <FileText size={44} className="mx-auto mb-3" />
          <p className="font-black text-sm uppercase">Sin cotizaciones</p>
          <p className="text-xs mt-1">
            {cotizaciones.length > 0 ? "No hay cotizaciones en este período" : "Crea la primera con el botón de arriba"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cotsFiltradas.map(cot => (
            <div key={cot._id} className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm hover:border-blue-200 transition-colors p-4 flex items-start gap-4">
              {/* Info principal */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <span className="text-sm font-black text-blue-600">{cot.nro}</span>
                  <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${ESTADO_STYLE[cot.estado]}`}>
                    {cot.estado}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{cot.fecha} → {cot.vigencia}</span>
                </div>
                <p className="text-base font-black text-gray-800">{cot.cliente}</p>
                {(cot.telefono || cot.email) && (
                  <p className="text-xs text-gray-400 mt-0.5">{[cot.telefono, cot.email].filter(Boolean).join(" · ")}</p>
                )}
                {/* Resumen productos */}
                <p className="text-xs text-gray-500 mt-1.5 truncate">
                  {cot.items.map(i => `${i.nombre} x${i.cantidad}`).join(", ")}
                </p>
              </div>

              {/* Total */}
              <div className="text-right shrink-0">
                <p className="text-xl font-black text-green-600">${cot.totalFinal.toLocaleString("es-CO")}</p>
                <p className="text-[10px] text-gray-400 font-bold">{cot.items.length} producto{cot.items.length !== 1 ? "s" : ""}</p>
              </div>

              {/* Acciones */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={() => { setVerDoc(cot); setVista("ver"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 font-black text-[10px] uppercase transition-all">
                  <Eye size={12} /> Ver / PDF
                </button>
                <select value={cot.estado} onChange={e => cambiarEstado(cot, e.target.value)}
                  className="text-[10px] font-black border-2 border-gray-200 rounded-xl px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white cursor-pointer">
                  <option value="vigente">Vigente</option>
                  <option value="aceptada">Aceptada</option>
                  <option value="vencida">Vencida</option>
                  <option value="cancelada">Cancelada</option>
                </select>
                <button onClick={() => eliminar(cot)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 font-black text-[10px] uppercase transition-all">
                  <Trash2 size={12} /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
