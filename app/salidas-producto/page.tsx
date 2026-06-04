"use client";
import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { CalendarDays, FileDown, FileText } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { getEmpresaConfig } from "../../lib/empresaStorage";

const TIPOS = {
  REMISION:     { label: "Remisión",     prefijo: "REM" },
  AVERIA_FRITA: { label: "Avería Frita", prefijo: "AVF" },
  AVERIA:       { label: "Avería",       prefijo: "AVR" },
} as const;

type TipoSalida = keyof typeof TIPOS;

interface Salida {
  id: number;
  tipo: TipoSalida;
  nroDoc: string;
  fecha: string;
  fechaISO: string;
  producto: string;
  categoria: string;
  productoId: number | null;
  cantidad: number;
  precioPublico: number;
  porcentaje?: number;
  costoUnit: number;
  costoTotal: number;
}

export default function SalidasProductoPage() {
  const { branch } = useAuth();
  const branchId   = branch?.id || "";
  const prodKey    = branchId ? `productos_${branchId}` : "productos";

  const [salidas, setSalidas]     = useState<Salida[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [tabActiva, setTabActiva] = useState<TipoSalida>("REMISION");
  const [porcentajes, setPorcentajes] = useState<Record<TipoSalida, number>>({
    REMISION:     60,
    AVERIA_FRITA: 60,
    AVERIA:       60,
  });

  // Filtros de tabla (periodo)
  const [tipoRango, setTipoRango] = useState("Diario");
  const [fechaBase, setFechaBase] = useState(new Date().toLocaleDateString("en-CA"));
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Form
  const [formTipo, setFormTipo]         = useState<TipoSalida>("REMISION");
  const [formProducto, setFormProducto] = useState("");
  const [formCantidad, setFormCantidad] = useState("");
  const [catFormFiltro, setCatFormFiltro] = useState("TODAS"); // solo filtra el buscador

  useEffect(() => {
    const cfg = JSON.parse(localStorage.getItem("config_salidas") || "{}");
    setPorcentajes({
      REMISION:     cfg.porcentajeRemision     ?? 60,
      AVERIA_FRITA: cfg.porcentajeAveriaFrita  ?? 60,
      AVERIA:       cfg.porcentajeAveria       ?? 60,
    });

    if (branchId) {
      // Cargar productos desde API
      api.get(`/branches/${branchId}/products`)
        .then(({ data }) => {
          const lista = (data.data || []).map((p: any) => ({
            ...p, id: p._id?.toString() || p.id,
            precio: p.precioPublico ?? p.precio ?? 0,
          }));
          if (lista.length > 0) {
            setProductos(lista);
            localStorage.setItem(prodKey, JSON.stringify(lista));
          } else {
            setProductos(JSON.parse(localStorage.getItem(prodKey) || "[]"));
          }
        })
        .catch(() => setProductos(JSON.parse(localStorage.getItem(prodKey) || "[]")));

      // Cargar salidas desde API
      api.get(`/branches/${branchId}/salidas`)
        .then(({ data }) => {
          const lista = (data.data || []).map((s: any) => ({ ...s, id: s._id || s.id }));
          if (lista.length > 0) {
            setSalidas(lista as Salida[]);
            localStorage.setItem("salidas_producto", JSON.stringify(lista));
          } else {
            setSalidas(JSON.parse(localStorage.getItem("salidas_producto") || "[]"));
          }
        })
        .catch(() => setSalidas(JSON.parse(localStorage.getItem("salidas_producto") || "[]")));
    } else {
      setProductos(JSON.parse(localStorage.getItem(prodKey) || "[]"));
      setSalidas(JSON.parse(localStorage.getItem("salidas_producto") || "[]"));
    }
  }, [branchId]);

  const guardarPorcentaje = (tipo: TipoSalida, val: number) => {
    setPorcentajes(prev => ({ ...prev, [tipo]: val }));
    const claveMap: Record<TipoSalida, string> = {
      REMISION:     "porcentajeRemision",
      AVERIA_FRITA: "porcentajeAveriaFrita",
      AVERIA:       "porcentajeAveria",
    };
    const cfg = JSON.parse(localStorage.getItem("config_salidas") || "{}");
    localStorage.setItem("config_salidas", JSON.stringify({ ...cfg, [claveMap[tipo]]: val }));
  };

  // ── Rango de fechas ────────────────────────────────────────────────────────
  const getRango = () => {
    const base = new Date(fechaBase + "T12:00:00");
    let ini = new Date(base); ini.setHours(0, 0, 0, 0);
    let fin = new Date(base); fin.setHours(23, 59, 59, 999);
    const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
    let label = base.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
    if (tipoRango === "Semanal") {
      const d = base.getDay();
      ini.setDate(base.getDate() - (d === 0 ? 6 : d - 1));
      fin = new Date(ini); fin.setDate(ini.getDate() + 6); fin.setHours(23, 59, 59, 999);
      label = `${fmt(ini)} – ${fmt(fin)}`;
    } else if (tipoRango === "Quincenal") {
      if (base.getDate() <= 15) { ini.setDate(1); fin = new Date(base); fin.setDate(15); fin.setHours(23, 59, 59, 999); }
      else { ini.setDate(16); fin = new Date(base.getFullYear(), base.getMonth() + 1, 0); fin.setHours(23, 59, 59, 999); }
      label = `${fmt(ini)} – ${fmt(fin)}`;
    } else if (tipoRango === "Mensual") {
      ini.setDate(1);
      fin = new Date(base.getFullYear(), base.getMonth() + 1, 0); fin.setHours(23, 59, 59, 999);
      label = base.toLocaleDateString("es-CO", { month: "long", year: "numeric" }).toUpperCase();
    } else if (tipoRango === "Anual") {
      ini = new Date(base.getFullYear(), 0, 1);
      fin = new Date(base.getFullYear(), 11, 31); fin.setHours(23, 59, 59, 999);
      label = `AÑO ${base.getFullYear()}`;
    }
    return { inicio: ini.getTime(), fin: fin.getTime(), label };
  };

  const { inicio, fin, label: etiqueta } = getRango();

  // Categorías para el filtro del buscador
  const categorias = ["TODAS", ...Array.from(new Set(
    productos.map((p: any) => (p.categoria || "").toUpperCase())
  )).filter(Boolean).sort()];

  // Productos filtrados por categoría (solo para el datalist del formulario)
  const productosFiltrados = catFormFiltro === "TODAS"
    ? productos
    : productos.filter((p: any) => (p.categoria || "").toUpperCase() === catFormFiltro);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const productoSel = productos.find(
    (p: any) => (p.nombre || "").toUpperCase().trim() === formProducto.toUpperCase().trim()
  );
  const precioPublico = productoSel
    ? Number(productoSel.precioPublico) || Number(productoSel.precio) || 0 : 0;
  const cantidad   = parseFloat(formCantidad) || 0;
  const costoUnit  = precioPublico * (porcentajes[formTipo] / 100);
  const costoTotal = costoUnit * cantidad;

  // ── Registrar salida ───────────────────────────────────────────────────────
  const registrar = async () => {
    if (!formProducto.trim() || cantidad <= 0) return;
    const tipo = formTipo;
    const nroDoc = `${TIPOS[tipo].prefijo}-${(salidas.filter(s => s.tipo === tipo).length + 1).toString().padStart(4, "0")}`;

    const pct       = porcentajes[tipo];
    const cUnit     = precioPublico * (pct / 100);
    const cTotal    = cUnit * cantidad;

    const nueva: Salida = {
      id:           Date.now(),
      tipo,
      nroDoc,
      fecha:        new Date().toLocaleDateString("en-CA"),
      fechaISO:     new Date().toISOString(),
      producto:     formProducto.toUpperCase().trim(),
      categoria:    (productoSel?.categoria || "").toUpperCase(),
      productoId:   productoSel?.id ?? null,
      cantidad,
      precioPublico,
      porcentaje:   pct,
      costoUnit:    cUnit,
      costoTotal:   cTotal,
    };

    // Guardar en API
    if (branchId) {
      try { await api.post(`/branches/${branchId}/salidas`, nueva); } catch { /* continuar */ }
    }
    const nuevasSalidas = [nueva, ...salidas];
    localStorage.setItem("salidas_producto", JSON.stringify(nuevasSalidas));
    setSalidas(nuevasSalidas);

    // Descontar stock
    if (productoSel) {
      const prods = JSON.parse(localStorage.getItem(prodKey) || "[]");
      const act = prods.map((p: any) =>
        p.id === productoSel.id
          ? { ...p, stock: Math.max(0, (parseFloat(p.stock) || 0) - cantidad) }
          : p
      );
      localStorage.setItem(prodKey, JSON.stringify(act));
      setProductos(act);
    }

    setFormProducto(""); setFormCantidad("");
  };

  // ── Filtrado tabla ─────────────────────────────────────────────────────────
  const salidasTab = salidas.filter(s => {
    if (s.tipo !== tabActiva) return false;
    const t = new Date(s.fechaISO).getTime();
    return t >= inicio && t <= fin;
  });

  const esRemision = tabActiva === "REMISION";

  // ── Exportar Excel ─────────────────────────────────────────────────────────
  const exportarExcel = () => {
    const filas = salidasTab.map(s => ({
      Fecha:         s.fecha,
      Documento:     s.nroDoc,
      Producto:      s.producto,
      Cantidad:      s.cantidad,
      "P. Público":  s.precioPublico,
      ...(esRemision ? { "Costo Unit.": s.costoUnit, "Total": s.costoTotal } : { "Total": s.costoTotal }),
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, TIPOS[tabActiva].label);
    XLSX.writeFile(wb, `${TIPOS[tabActiva].prefijo}_${fechaBase}.xlsx`);
  };

  // ── Exportar PDF ───────────────────────────────────────────────────────────
  const exportarPDF = () => {
    const emp = getEmpresaConfig();
    const totalVal = salidasTab.reduce((a, s) => a + (s.costoTotal ?? 0), 0);
    const colsExtra = esRemision
      ? "<th class='r'>P. Público</th><th class='r'>Costo Unit.</th><th class='r'>Total</th>"
      : "<th class='r'>P. Público</th><th class='r'>Total</th>";
    const filaExtra = (s: Salida) => esRemision
      ? `<td class='r'>$${s.precioPublico.toLocaleString("es-CO")}</td><td class='r'>$${(s.costoUnit??0).toLocaleString("es-CO")}</td><td class='r'>$${(s.costoTotal??0).toLocaleString("es-CO")}</td>`
      : `<td class='r'>$${s.precioPublico.toLocaleString("es-CO")}</td><td class='r'>$${(s.costoTotal??0).toLocaleString("es-CO")}</td>`;
    const colSpanTotal = esRemision ? 6 : 5;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${TIPOS[tabActiva].label}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:20px 28px;font-size:11px}
h1{font-size:15px;font-weight:900;text-align:center;text-transform:uppercase}
.sub{text-align:center;font-size:10px;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#1e293b;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;text-align:left}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}
.r{text-align:right}.tot td{font-weight:900;background:#f8fafc;font-size:11px}
@media print{@page{margin:10mm;size:A4}}</style></head><body>
<h1>${emp.nombreEmpresa || "MI EMPRESA"}</h1>
<div class="sub">${TIPOS[tabActiva].label} &nbsp;|&nbsp; Período: ${etiqueta}</div>
<table><thead><tr>
  <th>Fecha</th><th>Documento</th><th>Producto</th><th class="r">Cantidad</th>${colsExtra}
</tr></thead><tbody>
${salidasTab.map(s => `<tr>
  <td>${s.fecha}</td><td>${s.nroDoc}</td><td>${s.producto}</td>
  <td class="r">${s.cantidad}</td>${filaExtra(s)}
</tr>`).join("")}
</tbody>${salidasTab.length > 0 ? `
<tfoot><tr class="tot">
  <td colspan="${colSpanTotal}" style="text-align:right">TOTAL</td>
  <td class="r">$${totalVal.toLocaleString("es-CO")}</td>
</tr></tfoot>` : ""}
</table><script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-gray-50 flex flex-col font-sans text-[#1a2b3c] overflow-hidden text-left">

      {/* ── CABECERA COMPACTA ── */}
      <div className="bg-white px-8 pt-4 pb-3 border-b border-gray-200 shadow-sm shrink-0">
        <h1 className="text-xl font-black uppercase tracking-tighter leading-none">Salidas de Producto</h1>
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
          Remisiones · Averías Fritas · Averías
        </p>
      </div>

      {/* ── FORMULARIO (fondo diferenciado) ── */}
      <div className="bg-slate-50 border-b-4 border-slate-200 px-8 py-3 shrink-0">
        <div className="flex gap-4 items-start overflow-x-auto">

          {/* Concepto — doble función: selecciona tipo Y filtra tabla */}
          <div className="space-y-1 shrink-0">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Concepto</label>
            <div className="flex gap-1.5">
              {(Object.keys(TIPOS) as TipoSalida[]).map(t => (
                <button key={t} onClick={() => { setFormTipo(t); setTabActiva(t); }}
                  className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wide transition-all whitespace-nowrap ${
                    formTipo === t ? "bg-[#1a2b3c] text-white shadow" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}>
                  {TIPOS[t].label}
                  <span className={`ml-1.5 text-[8px] px-1 py-0.5 rounded-full ${formTipo === t ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}>
                    {salidas.filter(s => s.tipo === t && (() => { const tm = new Date(s.fechaISO).getTime(); return tm >= inicio && tm <= fin; })()).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Categoría — filtra solo el buscador */}
          <div className="space-y-1 shrink-0">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Categoría</label>
            <select value={catFormFiltro} onChange={e => { setCatFormFiltro(e.target.value); setFormProducto(""); }}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase outline-none h-[34px]">
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Producto */}
          <div className="space-y-1 flex-1 min-w-[160px]">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Producto</label>
            <input list="productos-salida-list" value={formProducto}
              onChange={e => setFormProducto(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-blue-400 uppercase h-[34px]" />
            <datalist id="productos-salida-list">
              {productosFiltrados.map((p: any) => <option key={p.id} value={p.nombre} />)}
            </datalist>
          </div>

          {/* Cantidad */}
          <div className="space-y-1 w-24 shrink-0">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Cantidad</label>
            <input type="number" value={formCantidad} onChange={e => setFormCantidad(e.target.value)}
              placeholder="0" min="0"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-blue-400 text-right h-[34px]" />
          </div>

          {/* Vista previa costo */}
          {cantidad > 0 && precioPublico > 0 && (
            <div className="space-y-1">
              <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
                Costo ({porcentajes[formTipo]}%)
              </label>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-sm font-black text-emerald-700 h-[34px] flex items-center">
                $ {costoTotal.toLocaleString("es-CO")}
              </div>
            </div>
          )}

          <button onClick={registrar}
            className="bg-[#1a2b3c] text-white px-6 py-1.5 rounded-lg font-black uppercase text-[9px] tracking-widest hover:bg-black transition-all shadow h-[34px] self-end mt-auto">
            Registrar
          </button>
        </div>
      </div>

      {/* ── DIVISOR: INFORME + FILTROS ── */}
      <div className="bg-gray-100 border-y border-gray-200 px-8 py-2 shrink-0 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-black text-gray-700 uppercase tracking-widest">Informes</span>
        <div className="w-px h-5 bg-gray-400" />

        {/* Periodo */}
        <select value={tipoRango} onChange={e => setTipoRango(e.target.value)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-1 text-[9px] font-black uppercase outline-none">
          {["Diario","Semanal","Quincenal","Mensual","Anual"].map(o => <option key={o}>{o}</option>)}
        </select>

        {/* Calendario */}
        <div onClick={() => dateInputRef.current?.showPicker()}
          className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1 cursor-pointer hover:bg-blue-100 transition-all relative">
          <CalendarDays size={11} className="text-blue-500 shrink-0" />
          <span className="text-[9px] font-black text-blue-700 uppercase">{etiqueta}</span>
          <input ref={dateInputRef} type="date" value={fechaBase}
            onChange={e => setFechaBase(e.target.value)}
            className="absolute inset-0 opacity-0 pointer-events-none" />
        </div>

        {/* % Costo */}
        <div className="flex items-center gap-1.5 border-l border-gray-300 pl-3">
          <span className="text-[8px] font-black text-gray-500 uppercase">% Costo</span>
          <input type="number" value={porcentajes[tabActiva]}
            onChange={e => guardarPorcentaje(tabActiva, Number(e.target.value))}
            min="1" max="100"
            className="w-12 bg-white border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-black outline-none text-center focus:border-blue-400" />
          <span className="text-[9px] text-gray-400 font-bold">%</span>
        </div>

        {/* Exportar */}
        <div className="ml-auto flex gap-1.5">
          <button onClick={exportarExcel}
            className="flex items-center gap-1 bg-white border border-gray-200 text-slate-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-slate-50 transition-all">
            <FileDown size={11} /> Excel
          </button>
          <button onClick={exportarPDF}
            className="flex items-center gap-1 bg-white border border-gray-200 text-slate-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-slate-50 transition-all">
            <FileText size={11} /> PDF
          </button>
        </div>
      </div>


      {/* ── TABLA ── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-100 text-[11px] font-black text-gray-700 uppercase tracking-wide">
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Documento</th>
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3 text-right">Cantidad</th>
                <th className="px-5 py-3 text-right">P. Público</th>
                <th className="px-5 py-3 text-right">Costo Unit.</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="text-[11px] font-bold uppercase">
              {salidasTab.length === 0 ? (
                <tr>
                  <td colSpan={7}
                    className="px-8 py-14 text-center text-gray-300 text-[10px] tracking-widest font-black">
                    Sin registros · {TIPOS[tabActiva].label} · {etiqueta}
                  </td>
                </tr>
              ) : (
                salidasTab.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-3 text-gray-400">{s.fecha}</td>
                    <td className="px-5 py-3 text-blue-600 font-black">{s.nroDoc}</td>
                    <td className="px-5 py-3">{s.producto}</td>
                    <td className="px-5 py-3 text-right">{s.cantidad}</td>
                    <td className="px-5 py-3 text-right text-gray-400 font-medium normal-case">
                      $ {s.precioPublico.toLocaleString("es-CO")}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">
                      $ {(s.costoUnit ?? 0).toLocaleString("es-CO")}
                    </td>
                    <td className="px-5 py-3 text-right text-emerald-600 font-black">
                      $ {(s.costoTotal ?? 0).toLocaleString("es-CO")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {salidasTab.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={6}
                    className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">
                    Total {TIPOS[tabActiva].label}
                  </td>
                  <td className="px-5 py-3 text-right font-black text-emerald-700">
                    $ {salidasTab.reduce((a, s) => a + (s.costoTotal ?? 0), 0).toLocaleString("es-CO")}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
