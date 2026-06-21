"use client";
import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, FileSpreadsheet, FileText, GitBranch } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";

interface LineaReceta {
  tipo: "ingrediente" | "subreceta";
  ingredienteId?: string;
  recetaId?: string;
  nombre: string; unidad: string;
  cantidad: number; costoUnitario: number; costoLinea: number;
}

interface Receta {
  _id: string; nombre: string; rendimiento: number; unidad: string;
  lineas: LineaReceta[]; esProductoTerminado: boolean;
  costoTotal: number; costoTotalFinal: number;
}

interface NodoExplosion {
  path: string;
  tipo: "ingrediente" | "subreceta";
  nombre: string;
  unidad: string;
  cantidad: number;
  costo: number;
  hijos?: NodoExplosion[];
}

// Explota recursivamente una receta para una cantidad objetivo dada, bajando
// por cada sub-receta hasta llegar a materia prima. `visitados` evita ciclos
// si una receta llegara a referenciarse indirectamente a sí misma.
function explotarReceta(
  receta: Receta,
  cantidadObjetivo: number,
  recetasMap: Map<string, Receta>,
  pathPrefix: string,
  visitados: Set<string>
): NodoExplosion[] {
  const factor = receta.rendimiento > 0 ? cantidadObjetivo / receta.rendimiento : 0;
  return (receta.lineas || []).map((linea, idx) => {
    const path = `${pathPrefix}-${idx}`;
    const cantidadNecesaria = linea.cantidad * factor;
    // El $/unidad de cada línea ya viene calculado en la receta (igual que en Recetas
    // y Hoja de Costos), así que el costo escala linealmente con la cantidad necesaria.
    const costoNecesario = cantidadNecesaria * (linea.costoUnitario || 0);

    if (linea.tipo === "ingrediente") {
      return { path, tipo: "ingrediente" as const, nombre: linea.nombre, unidad: linea.unidad, cantidad: cantidadNecesaria, costo: costoNecesario };
    }

    const subId = linea.recetaId || "";
    const sub = recetasMap.get(subId);
    if (!sub || visitados.has(subId)) {
      return { path, tipo: "subreceta" as const, nombre: linea.nombre, unidad: linea.unidad, cantidad: cantidadNecesaria, costo: costoNecesario, hijos: [] };
    }
    const hijos = explotarReceta(sub, cantidadNecesaria, recetasMap, path, new Set([...visitados, subId]));
    return { path, tipo: "subreceta" as const, nombre: linea.nombre, unidad: linea.unidad, cantidad: cantidadNecesaria, costo: costoNecesario, hijos };
  });
}

function todosLosPaths(nodos: NodoExplosion[]): string[] {
  return nodos.flatMap(n => [n.path, ...(n.hijos ? todosLosPaths(n.hijos) : [])]);
}

// Aplana el árbol sumando ingredientes repetidos entre distintas ramas.
function aplanarIngredientes(nodos: NodoExplosion[], acc: Map<string, { nombre: string; unidad: string; cantidad: number; costo: number }>) {
  for (const n of nodos) {
    if (n.tipo === "ingrediente") {
      const key = `${n.nombre}__${n.unidad}`;
      const prev = acc.get(key);
      if (prev) { prev.cantidad += n.cantidad; prev.costo += n.costo; }
      else acc.set(key, { nombre: n.nombre, unidad: n.unidad, cantidad: n.cantidad, costo: n.costo });
    } else if (n.hijos) {
      aplanarIngredientes(n.hijos, acc);
    }
  }
}

function fmtCantidad(n: number) {
  return n >= 100 ? Math.round(n).toLocaleString("es-CO") : n.toFixed(2).replace(/\.00$/, "");
}

function fmtMoneda(n: number) {
  return `$${n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function NodoArbol({ nodo, nivel, expandidos, toggle }: {
  nodo: NodoExplosion; nivel: number;
  expandidos: Set<string>; toggle: (path: string) => void;
}) {
  const tieneHijos = nodo.tipo === "subreceta" && !!nodo.hijos?.length;
  const abierto = expandidos.has(nodo.path);
  return (
    <div>
      <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: nivel * 22 }}>
        {tieneHijos ? (
          <button onClick={() => toggle(nodo.path)} className="text-gray-400 hover:text-gray-600 shrink-0">
            {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : <span className="w-3.5 shrink-0" />}
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${nodo.tipo === "subreceta" ? "bg-violet-400" : "bg-emerald-400"}`} />
        <span className={`text-sm flex-1 truncate ${nodo.tipo === "subreceta" ? "font-bold text-gray-800" : "text-gray-600"}`}>
          {nodo.nombre}
          {nodo.tipo === "subreceta" && <span className="ml-2 text-[9px] font-black text-violet-400 uppercase">sub-receta</span>}
        </span>
        <span className="w-28 text-right text-sm font-black text-gray-700 shrink-0">{fmtCantidad(nodo.cantidad)} {nodo.unidad}</span>
        <span className="w-24 text-right text-sm font-black text-emerald-600 shrink-0">{fmtMoneda(nodo.costo)}</span>
      </div>
      {tieneHijos && abierto && nodo.hijos!.map(h => (
        <NodoArbol key={h.path} nodo={h} nivel={nivel + 1} expandidos={expandidos} toggle={toggle} />
      ))}
    </div>
  );
}

export default function PlanificadorProduccionPage() {
  const { branch } = useAuth();
  const branchId = branch?.id || "";

  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [recetaId, setRecetaId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!branchId) return;
    api.get(`/branches/${branchId}/recetas`)
      .then(({ data }) => {
        const lista: Receta[] = data.data ?? data;
        setRecetas(lista);
        const primerTerminado = lista.find(r => r.esProductoTerminado) ?? lista[0];
        if (primerTerminado) setRecetaId(primerTerminado._id);
      })
      .catch(() => toast("error", "Error al cargar recetas"))
      .finally(() => setLoading(false));
  }, [branchId]);

  const recetasMap = useMemo(() => new Map(recetas.map(r => [r._id, r])), [recetas]);
  const receta = recetas.find(r => r._id === recetaId);
  const cantidadObjetivo = parseFloat(cantidad) || 0;

  const arbol = useMemo(() => {
    if (!receta || cantidadObjetivo <= 0) return [];
    return explotarReceta(receta, cantidadObjetivo, recetasMap, "0", new Set([receta._id]));
  }, [receta, cantidadObjetivo, recetasMap]);

  // Al recalcular, expandir todo por defecto para ver el desglose completo de una vez.
  useEffect(() => {
    setExpandidos(new Set(todosLosPaths(arbol)));
  }, [arbol]);

  const toggle = (path: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const resumen = useMemo(() => {
    const acc = new Map<string, { nombre: string; unidad: string; cantidad: number; costo: number }>();
    aplanarIngredientes(arbol, acc);
    return [...acc.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [arbol]);

  // Costo de materia prima: suma de todo lo explotado en el árbol.
  const costoMateriaPrima = useMemo(() => resumen.reduce((s, r) => s + r.costo, 0), [resumen]);
  // Costo total de producción: usa el costo por unidad ya calculado en la receta
  // (incluye MO + CIF, y Ventas/Admón si es producto terminado), escalado a la cantidad pedida.
  const costoTotalProduccion = useMemo(() => {
    if (!receta || receta.rendimiento <= 0) return 0;
    const costoBase = receta.esProductoTerminado ? (receta.costoTotalFinal || 0) : (receta.costoTotal || 0);
    return (costoBase / receta.rendimiento) * cantidadObjetivo;
  }, [receta, cantidadObjetivo]);

  const exportarExcel = () => {
    if (!receta) return;
    const filas = resumen.map(r => ({ "Materia Prima": r.nombre, "Cantidad": parseFloat(r.cantidad.toFixed(2)), "Unidad": r.unidad, "Costo ($)": parseFloat(r.costo.toFixed(2)) }));
    filas.push({ "Materia Prima": "TOTAL MATERIA PRIMA", "Cantidad": "" as any, "Unidad": "", "Costo ($)": parseFloat(costoMateriaPrima.toFixed(2)) });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materia Prima");
    XLSX.writeFile(wb, `plan_produccion_${receta.nombre.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportarPDF = () => {
    if (!receta) return;
    const doc = new jsPDF();
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`Plan de Producción — ${receta.nombre}`, 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Cantidad a producir: ${fmtCantidad(cantidadObjetivo)} ${receta.unidad} · ${new Date().toLocaleDateString("es-CO")}`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [["Materia Prima", "Cantidad", "Unidad", "Costo"]],
      body: [
        ...resumen.map(r => [r.nombre, fmtCantidad(r.cantidad), r.unidad, fmtMoneda(r.costo)]),
        ["TOTAL MATERIA PRIMA", "", "", fmtMoneda(costoMateriaPrima)],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [109, 40, 217], fontStyle: "bold" },
      didParseCell: (data) => {
        if (data.row.index === resumen.length) data.cell.styles.fontStyle = "bold";
      },
    });
    doc.save(`plan_produccion_${receta.nombre.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">

      <div className="bg-white border-b border-gray-100 px-8 py-5 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-violet-500" />
          <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Planificador de Producción</h1>
        </div>
        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">
          Explosión de materiales · cuánto necesitas producir y de qué
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

        {/* Controles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 md:col-span-2">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Producto / Receta a producir</label>
            <div className="relative mt-1">
              <select value={recetaId} onChange={e => setRecetaId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-violet-400 appearance-none pr-8">
                {recetas.map(r => <option key={r._id} value={r._id}>{r.nombre}{r.esProductoTerminado ? " · Producto Terminado" : ""}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              Cantidad a producir {receta ? `(${receta.unidad})` : ""}
            </label>
            <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)}
              placeholder="0"
              className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-violet-400" />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && recetas.length === 0 && (
          <div className="flex items-center justify-center h-40 text-gray-300 text-xs font-black uppercase tracking-widest">
            Sin recetas. Crea una receta primero en el módulo Recetas.
          </div>
        )}

        {receta && cantidadObjetivo > 0 && (
          <>
            {/* KPIs de costo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Costo de Materia Prima</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{fmtMoneda(costoMateriaPrima)}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">Suma de todos los ingredientes explotados en el árbol</p>
              </div>
              <div className="bg-gray-300 rounded-2xl p-5">
                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Costo Total de Producción</p>
                <p className="text-2xl font-black text-gray-900 mt-1">{fmtMoneda(costoTotalProduccion)}</p>
                <p className="text-[9px] text-gray-600 mt-0.5">
                  Incluye mano de obra y CIF{receta.esProductoTerminado ? ", ventas y admón" : ""}
                </p>
              </div>
            </div>

            {/* Árbol de explosión */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-gray-700 uppercase tracking-tighter">Desglose de Producción</h2>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                    Para producir {fmtCantidad(cantidadObjetivo)} {receta.unidad} de {receta.nombre}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setExpandidos(new Set(todosLosPaths(arbol)))}
                    className="text-[9px] font-black text-gray-400 hover:text-violet-600 uppercase tracking-widest">Expandir todo</button>
                  <span className="text-gray-200">|</span>
                  <button onClick={() => setExpandidos(new Set())}
                    className="text-[9px] font-black text-gray-400 hover:text-violet-600 uppercase tracking-widest">Colapsar todo</button>
                </div>
              </div>
              <div className="px-6 py-3">
                {arbol.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-6">Esta receta no tiene ingredientes ni sub-recetas registradas.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3 pb-2 mb-1 border-b border-gray-100">
                      <span className="w-3.5 shrink-0" />
                      <span className="w-1.5 shrink-0" />
                      <span className="flex-1 text-[9px] font-black text-gray-400 uppercase tracking-widest">Ítem</span>
                      <span className="w-28 text-right text-[9px] font-black text-gray-400 uppercase tracking-widest">Cantidad</span>
                      <span className="w-24 text-right text-[9px] font-black text-gray-400 uppercase tracking-widest">Costo</span>
                    </div>
                    <div className="space-y-3">
                      {arbol.map(n => (
                        <div key={n.path} className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-1">
                          <NodoArbol nodo={n} nivel={0} expandidos={expandidos} toggle={toggle} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Resumen materia prima total */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-gray-700 uppercase tracking-tighter">Materia Prima Total</h2>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">Suma de cada ingrediente en todas las ramas del árbol</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={exportarExcel}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-white border border-gray-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 transition-all">
                    <FileSpreadsheet size={13} /> Excel
                  </button>
                  <button onClick={exportarPDF}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-white border border-gray-200 text-red-600 hover:border-red-300 hover:bg-red-50 transition-all">
                    <FileText size={13} /> PDF
                  </button>
                </div>
              </div>
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Materia Prima</th>
                    <th className="px-6 py-3 text-right">Cantidad Necesaria</th>
                    <th className="px-6 py-3 text-right">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {resumen.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-6 text-center text-gray-300 text-xs">Sin materia prima</td></tr>
                  ) : resumen.map(r => (
                    <tr key={`${r.nombre}-${r.unidad}`} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-bold text-gray-800 text-sm">{r.nombre}</td>
                      <td className="px-6 py-3 text-right font-black text-gray-700">{fmtCantidad(r.cantidad)} {r.unidad}</td>
                      <td className="px-6 py-3 text-right font-black text-emerald-600">{fmtMoneda(r.costo)}</td>
                    </tr>
                  ))}
                </tbody>
                {resumen.length > 0 && (
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td className="px-6 py-3 font-black text-gray-700 text-sm uppercase" colSpan={2}>Total Materia Prima</td>
                      <td className="px-6 py-3 text-right font-black text-emerald-700 text-base">{fmtMoneda(costoMateriaPrima)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
