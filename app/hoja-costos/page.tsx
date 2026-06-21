"use client";
import { useState, useEffect } from "react";
import { Printer, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";

interface LineaReceta {
  ingredienteId: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  costoLinea: number;
}

interface Receta {
  _id: string;
  nombre: string;
  rendimiento: number;
  unidad: string;
  lineas: LineaReceta[];
  costoTotal: number;
  costoPorcion: number;
  esProductoTerminado: boolean;
  pctVentas: number; pctAdmon: number;
  costoVentas: number; costoAdmon: number; costoTotalFinal: number;
}

const lsKey = (branchId: string) => `produccion_precios_${branchId}`;

export default function HojaCostosPage() {
  const { branch } = useAuth();
  const branchId = branch?.id || "";

  const [tab, setTab] = useState<"analisis" | "precios">("analisis");
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Tab Análisis ──
  const [recetaId,       setRecetaId]       = useState("");
  const [precioVenta,    setPrecioVenta]    = useState("");
  const [margenObjetivo, setMargenObjetivo] = useState("30");

  // ── Tab Lista de Precios ──
  const [precios,         setPrecios]         = useState<Record<string, string>>({});
  const [soloTerminados,  setSoloTerminados]  = useState(true);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/branches/${branchId}/recetas`)
      .then(({ data }) => {
        const lista: Receta[] = data.data ?? data;
        setRecetas(lista);
        if (lista.length > 0) setRecetaId(lista[0]._id);
        try {
          const saved = localStorage.getItem(lsKey(branchId));
          if (saved) setPrecios(JSON.parse(saved));
        } catch {}
      })
      .catch(() => toast("error", "Error al cargar recetas"))
      .finally(() => setLoading(false));
  }, [branchId]);

  const actualizarPrecio = (id: string, valor: string) => {
    const nuevo = { ...precios, [id]: valor };
    setPrecios(nuevo);
    try { localStorage.setItem(lsKey(branchId), JSON.stringify(nuevo)); } catch {}
  };

  // ── Cálculos Análisis ──
  const receta       = recetas.find(r => r._id === recetaId);
  const costoTotal   = receta ? (receta.esProductoTerminado ? (receta.costoTotalFinal || 0) : receta.costoTotal) : 0;
  const costoPorcion = receta && receta.rendimiento > 0 ? costoTotal / receta.rendimiento : 0;
  const pventa       = parseFloat(precioVenta) || 0;
  const margenPct    = pventa > 0 ? ((pventa - costoPorcion) / pventa) * 100 : 0;
  const markupPct    = costoPorcion > 0 ? ((pventa - costoPorcion) / costoPorcion) * 100 : 0;
  const margenObj    = parseFloat(margenObjetivo) || 0;
  const precioSugerido = margenObj > 0 && margenObj < 100 ? costoPorcion / (1 - margenObj / 100) : 0;

  // ── Cálculos Lista de Precios ──
  const listaPrecios = recetas
    .filter(r => !soloTerminados || r.esProductoTerminado)
    .map(r => {
      const costo   = r.esProductoTerminado ? (r.costoTotalFinal || 0) : (r.costoTotal || 0);
      const pv      = parseFloat(precios[r._id] || "") || 0;
      const margen  = pv > 0 ? ((pv - costo) / pv) * 100 : null;
      const markup  = costo > 0 && pv > 0 ? ((pv - costo) / costo) * 100 : null;
      const sugerido = margenObj > 0 && margenObj < 100 ? costo / (1 - margenObj / 100) : 0;
      return { ...r, costo, pv, margen, markup, sugerido };
    });

  const exportarExcel = () => {
    const filas = listaPrecios.map(r => ({
      "Producto":                               r.nombre,
      "Costo Total ($)":                        r.costo,
      "Precio de Venta ($)":                    r.pv || "",
      "Margen (%)":                             r.margen != null ? parseFloat(r.margen.toFixed(1)) : "",
      "Markup (%)":                             r.markup != null ? parseFloat(r.markup.toFixed(1)) : "",
      [`Precio Sugerido (${margenObj}%)`]:      Math.round(r.sugerido),
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lista de Precios");
    XLSX.writeFile(wb, `lista_precios_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Lista de Precios", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Margen objetivo: ${margenObj}% · ${new Date().toLocaleDateString("es-CO")}`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [["Producto", "Costo Total", "Precio Venta", "Margen %", "Markup %", `P. Sugerido (${margenObj}%)`]],
      body: listaPrecios.map(r => [
        r.nombre,
        `$${Math.round(r.costo).toLocaleString("es-CO")}`,
        r.pv > 0 ? `$${Math.round(r.pv).toLocaleString("es-CO")}` : "—",
        r.margen != null ? `${r.margen.toFixed(1)}%` : "—",
        r.markup != null ? `${r.markup.toFixed(1)}%` : "—",
        `$${Math.round(r.sugerido).toLocaleString("es-CO")}`,
      ]),
      styles:      { fontSize: 8, cellPadding: 3 },
      headStyles:  { fillColor: [15, 118, 110], fontStyle: "bold", fontSize: 7 },
      columnStyles:{ 0: { cellWidth: 70 } },
    });
    doc.save(`lista_precios_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const f   = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">

      {/* Fix impresión: oculta sidebar y barra móvil */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside     { display: none !important; }
          body      { background: white !important; padding-top: 0 !important; }
          main      { padding-top: 0 !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-8 pt-5 shrink-0 no-print">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Hoja de Costos</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">Análisis de rentabilidad por receta</p>
          </div>

          {tab === "analisis" && (
            <button onClick={() => window.print()}
              className="bg-slate-700 hover:bg-black text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-sm">
              <Printer size={14} /> Imprimir
            </button>
          )}

          {tab === "precios" && (
            <div className="flex gap-2">
              <button onClick={exportarExcel}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase bg-white border border-gray-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 transition-all">
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={exportarPDF}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase bg-white border border-gray-200 text-red-600 hover:border-red-300 hover:bg-red-50 transition-all">
                <FileText size={13} /> PDF
              </button>
            </div>
          )}
        </div>

        {/* Pestañas */}
        <div className="flex gap-1">
          {([["analisis", "Análisis"], ["precios", "Lista de Precios"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
                tab === t ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ════ PESTAÑA ANÁLISIS ════ */}
      {tab === "analisis" && (
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* Controles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 no-print">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Receta</label>
              <div className="relative mt-1">
                <select value={recetaId} onChange={e => { setRecetaId(e.target.value); setPrecioVenta(""); }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400 appearance-none pr-8">
                  {recetas.map(r => <option key={r._id} value={r._id}>{r.nombre}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Precio de Venta (x porción)</label>
              <input type="number" value={precioVenta} onChange={e => setPrecioVenta(e.target.value)}
                placeholder="0"
                className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Margen Objetivo (%)</label>
              <input type="number" value={margenObjetivo} onChange={e => setMargenObjetivo(e.target.value)}
                placeholder="30"
                className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && recetas.length === 0 && (
            <div className="flex items-center justify-center h-40 text-gray-300 text-xs font-black uppercase tracking-widest">
              Sin recetas. Crea una receta primero en el módulo Recetas.
            </div>
          )}

          {receta && (
            <div className="space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: receta.esProductoTerminado ? "Costo Total (Prod. + Ventas + Admón)" : "Costo Total Receta", value: f(costoTotal),     color: "text-gray-800",   sub: undefined },
                  { label: `Costo x Porción · ${receta.rendimiento} ${receta.unidad}`,                                  value: f(costoPorcion),   color: "text-gray-800",   sub: undefined },
                  { label: "Precio Sugerido",                                                                            value: f(precioSugerido), color: "text-blue-600",   sub: `con margen ${margenObjetivo}%` },
                  { label: "Margen Bruto",                                                                               value: pventa > 0 ? pct(margenPct) : "—", color: margenPct >= 0 ? "text-emerald-600" : "text-red-500", sub: pventa > 0 ? `markup ${pct(markupPct)}` : undefined },
                ].map(k => (
                  <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-tight">{k.label}</p>
                    <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.value}</p>
                    {k.sub && <p className="text-[9px] text-gray-400 mt-0.5">{k.sub}</p>}
                  </div>
                ))}
              </div>

              {/* Desglose */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-black text-gray-700 uppercase tracking-tighter">{receta.nombre}</h2>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">Rendimiento: {receta.rendimiento} {receta.unidad}</p>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Ingrediente</th>
                      <th className="px-6 py-3 text-center">Cantidad</th>
                      <th className="px-6 py-3 text-right">Costo Unit.</th>
                      <th className="px-6 py-3 text-right">Costo Total</th>
                      <th className="px-6 py-3 text-right">% Composición</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(receta.lineas || []).map((l, idx) => {
                      const porciento = costoTotal > 0 ? (l.costoLinea / costoTotal) * 100 : 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-bold text-gray-800 text-sm">{l.nombre}</td>
                          <td className="px-6 py-3 text-center text-sm text-gray-500">{l.cantidad} {l.unidad}</td>
                          <td className="px-6 py-3 text-right text-sm text-gray-500">{f(l.costoUnitario)}</td>
                          <td className="px-6 py-3 text-right font-bold text-gray-700">{f(l.costoLinea)}</td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${porciento}%` }} />
                              </div>
                              <span className="text-xs font-bold text-gray-500 w-10 text-right">{pct(porciento)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    {receta.esProductoTerminado && (
                      <>
                        <tr>
                          <td className="px-6 py-2 font-bold text-gray-500 text-xs uppercase" colSpan={3}>Costo de Producción</td>
                          <td className="px-6 py-2 text-right font-bold text-gray-700 text-sm">{f(receta.costoTotal)}</td>
                          <td />
                        </tr>
                        <tr>
                          <td className="px-6 py-2 font-bold text-violet-500 text-xs uppercase" colSpan={3}>+ Costo Ventas ({(receta.pctVentas || 0).toFixed(1)}%)</td>
                          <td className="px-6 py-2 text-right font-bold text-violet-600 text-sm">{f(receta.costoVentas || 0)}</td>
                          <td />
                        </tr>
                        <tr>
                          <td className="px-6 py-2 font-bold text-orange-500 text-xs uppercase" colSpan={3}>+ Costo Admón ({(receta.pctAdmon || 0).toFixed(1)}%)</td>
                          <td className="px-6 py-2 text-right font-bold text-orange-600 text-sm">{f(receta.costoAdmon || 0)}</td>
                          <td />
                        </tr>
                      </>
                    )}
                    <tr>
                      <td className="px-6 py-3 font-black text-gray-700 text-sm uppercase" colSpan={3}>Total</td>
                      <td className="px-6 py-3 text-right font-black text-gray-900">{f(costoTotal)}</td>
                      <td className="px-6 py-3 text-right font-black text-gray-500">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════ PESTAÑA LISTA DE PRECIOS ════ */}
      {tab === "precios" && (
        <div className="flex-1 overflow-y-auto px-8 py-6">

          {/* Controles superiores */}
          <div className="flex flex-wrap items-center gap-4 mb-5">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 flex items-center gap-3">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Margen objetivo</label>
              <input type="number" value={margenObjetivo} onChange={e => setMargenObjetivo(e.target.value)}
                className="w-16 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-center outline-none focus:border-emerald-400" />
              <span className="text-sm font-black text-gray-400">%</span>
            </div>
            <button onClick={() => setSoloTerminados(v => !v)}
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                soloTerminados
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-gray-400 border-gray-200 hover:border-emerald-400"
              }`}>
              {soloTerminados ? "Solo productos terminados" : "Todas las recetas"}
            </button>
            <p className="text-[10px] text-gray-400 font-bold ml-auto">
              {listaPrecios.length} productos · Los precios se guardan en este navegador
            </p>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Producto</th>
                  <th className="px-6 py-3 text-right">Costo Total</th>
                  <th className="px-6 py-3 text-right">Precio Sugerido<br/><span className="text-gray-300 font-medium normal-case">con {margenObj}% margen</span></th>
                  <th className="px-6 py-3 text-center">Precio de Venta</th>
                  <th className="px-6 py-3 text-right">Margen</th>
                  <th className="px-6 py-3 text-right">Markup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="p-10 text-center text-gray-300 text-xs">Cargando...</td></tr>
                ) : listaPrecios.length === 0 ? (
                  <tr><td colSpan={6} className="p-10 text-center text-gray-300 text-xs font-black uppercase tracking-widest">Sin productos</td></tr>
                ) : listaPrecios.map(r => {
                  const sinPrecio = r.pv <= 0;
                  const margenColor = sinPrecio ? "text-gray-300"
                    : r.margen! >= margenObj ? "text-emerald-600"
                    : r.margen! >= 0         ? "text-amber-500"
                    : "text-red-500";
                  return (
                    <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <p className="font-bold text-gray-800 text-sm leading-tight">{r.nombre}</p>
                        {r.esProductoTerminado && (
                          <span className="text-[9px] font-black text-emerald-500 uppercase">Producto terminado</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-gray-700">{f(r.costo)}</td>
                      <td className="px-6 py-3 text-right text-blue-500 font-bold text-sm">{f(r.sugerido)}</td>
                      <td className="px-6 py-3 text-center">
                        <input
                          type="number"
                          value={precios[r._id] ?? ""}
                          onChange={e => actualizarPrecio(r._id, e.target.value)}
                          placeholder="$ ingresa precio"
                          className="w-36 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-center outline-none focus:border-emerald-400 focus:bg-white transition-all"
                        />
                      </td>
                      <td className={`px-6 py-3 text-right font-black text-sm ${margenColor}`}>
                        {sinPrecio ? "—" : `${r.margen!.toFixed(1)}%`}
                      </td>
                      <td className={`px-6 py-3 text-right font-bold text-sm ${sinPrecio ? "text-gray-300" : "text-gray-500"}`}>
                        {sinPrecio ? "—" : `${r.markup!.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {listaPrecios.length > 0 && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest" colSpan={6}>
                      Verde = margen ≥ {margenObj}% · Amarillo = margen positivo pero bajo · Rojo = venta por debajo del costo
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
