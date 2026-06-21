"use client";
import { useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, X, Save, Printer, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

const UNIDADES = ["und", "porciones", "kg", "gr", "lt", "ml"];

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface Ingrediente {
  _id: string; nombre: string; unidad: string;
  costoUnitario: number; costoGr: number;
}

interface LineaReceta {
  tipo: "ingrediente" | "subreceta";
  ingredienteId?: string;
  recetaId?: string;
  nombre: string; unidad: string;
  cantidad: number; costoUnitario: number; costoLinea: number;
}

interface Receta {
  _id: string; nombre: string; rendimiento: number; unidad: string;
  lineas: LineaReceta[]; minutosMO: number; minutosCIF: number;
  moExterna: boolean; moExternaPorUnidad: number;
  costoMP: number; costoMO: number; costoCIF: number;
  costoTotal: number; costoPorcion: number;
  esProductoTerminado: boolean; pctPersonalizado: boolean;
  pctVentas: number; pctAdmon: number;
  costoAdmon: number; costoVentas: number; costoTotalFinal: number;
}

interface Empleado  { nombre: string; salario: number; prestaciones: number; }
interface CIFItem   { concepto: string; valorMes: number; }
interface CostosProd {
  diasLaborales: number; horasDia: number;
  empleados: Empleado[]; cif: CIFItem[];
  personalVentas: Empleado[]; gastosVentas: CIFItem[];
  personalAdmon: Empleado[]; gastosAdmon: CIFItem[];
  ventasMensual: number; admonMensual: number; baseMensual: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const f  = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const f2 = (n: number) => `$${n.toFixed(0)}`;

const totalPersonal = (lista: Empleado[]) => lista.reduce((s, e) => s + e.salario * (1 + e.prestaciones / 100), 0);

function calcTarifas(cp: CostosProd) {
  const totalVentas = totalPersonal(cp.personalVentas) + cp.gastosVentas.reduce((s, g) => s + g.valorMes, 0);
  const totalAdmon  = totalPersonal(cp.personalAdmon)  + cp.gastosAdmon.reduce((s, g) => s + g.valorMes, 0);
  const pctVentas = cp.baseMensual > 0 ? (totalVentas / cp.baseMensual) * 100 : 0;
  const pctAdmon  = cp.baseMensual > 0 ? (totalAdmon  / cp.baseMensual) * 100 : 0;
  const minMes = cp.diasLaborales * cp.horasDia * 60;
  if (!minMes) return { moMin: 0, cifMin: 0, ventasMin: 0, admonMin: 0, totalMin: 0, minMes: 0, totalVentas, totalAdmon, pctVentas, pctAdmon };
  const totalMO  = totalPersonal(cp.empleados);
  const totalCIF = cp.cif.reduce((s, c) => s + c.valorMes, 0);
  return {
    moMin:    totalMO  / minMes,
    cifMin:   totalCIF / minMes,
    ventasMin: totalVentas / minMes,
    admonMin:  totalAdmon  / minMes,
    totalMin: (totalMO + totalCIF) / minMes,
    minMes,
    totalVentas, totalAdmon,
    pctVentas, pctAdmon,
  };
}

function focusNextField(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const focusables = Array.from(
    document.querySelectorAll<HTMLElement>("input, select, textarea, button")
  ).filter(el => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);
  const idx = focusables.indexOf(e.currentTarget as HTMLElement);
  if (idx > -1 && idx < focusables.length - 1) focusables[idx + 1].focus();
}

// ─── Componente ────────────────────────────────────────────────────────────────

export default function RecetasPage() {
  const { branch } = useAuth();
  const branchId   = branch?.id || "";
  const confirm    = useConfirm();

  // Pestañas
  const [tab, setTab] = useState<"internas" | "terminados" | "costos">("internas");
  const [subfiltro, setSubfiltro] = useState<"todos" | "precocidos" | "fritos">("todos");

  // ── Recetas ──
  const [lista,       setLista]       = useState<Receta[]>([]);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showDrawer,  setShowDrawer]  = useState(false);
  const [editando,    setEditando]    = useState<string | null>(null);
  const [busqueda,    setBusqueda]    = useState("");
  const [guardando,   setGuardando]   = useState(false);

  const [form,    setForm]    = useState({ nombre: "", rendimiento: "1", unidad: "porciones", minutosMO: "0", minutosCIF: "0", moExterna: false, moExternaPorUnidad: "0", esProductoTerminado: false, pctPersonalizado: false, pctVentas: "0", pctAdmon: "0" });
  const [lineas,  setLineas]  = useState<LineaReceta[]>([]);
  const [busqIng, setBusqIng] = useState("");
  const [selId,   setSelId]   = useState("");
  const [selTipo, setSelTipo] = useState<"ingrediente"|"subreceta">("ingrediente");
  const [cantidad, setCantidad] = useState("");
  const [showDD,  setShowDD]  = useState(false);

  // ── Costos de producción ──
  const [cp, setCp] = useState<CostosProd>({ diasLaborales: 26, horasDia: 8, empleados: [], cif: [], personalVentas: [], gastosVentas: [], personalAdmon: [], gastosAdmon: [], ventasMensual: 0, admonMensual: 0, baseMensual: 0 });
  const [savingCp, setSavingCp] = useState(false);

  const nombreRef = useRef<HTMLInputElement>(null);
  const cantRef   = useRef<HTMLInputElement>(null);

  // ── Carga ──
  const cargar = async () => {
    if (!branchId) return;
    try {
      const [r1, r2, r3] = await Promise.all([
        api.get(`/branches/${branchId}/recetas`),
        api.get(`/branches/${branchId}/ingredientes`),
        api.get(`/branches/${branchId}/costos-produccion`),
      ]);
      setLista(r1.data.data ?? r1.data);
      setIngredientes(r2.data.data ?? r2.data);

      // Migración: la config anterior guardaba "$ Ventas/mes" y "$ Admón/mes" como un solo
      // valor; ahora se desglosan en listas de conceptos (igual que CIF). Si vienen vacías
      // pero existe el valor antiguo, se siembra un concepto "General" para no perder el dato.
      const cpData = r3.data.data ?? r3.data;
      const gastosVentas = (cpData.gastosVentas?.length ? cpData.gastosVentas
        : cpData.ventasMensual > 0 ? [{ concepto: "General", valorMes: cpData.ventasMensual }] : []);
      const gastosAdmon = (cpData.gastosAdmon?.length ? cpData.gastosAdmon
        : cpData.admonMensual > 0 ? [{ concepto: "General", valorMes: cpData.admonMensual }] : []);
      setCp({ ...cpData, personalVentas: cpData.personalVentas ?? [], gastosVentas, personalAdmon: cpData.personalAdmon ?? [], gastosAdmon });
    } catch { toast("error", "Error al cargar datos"); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, [branchId]);

  // Recarga al volver a esta pestaña/ventana: si se editó un ingrediente u otra
  // receta en otra página, la cascada ya actualizó los costos en el servidor,
  // pero la lista cargada aquí queda desactualizada hasta refrescar.
  useEffect(() => {
    const onFocus = () => { if (!showDrawer && document.visibilityState !== "hidden") cargar(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [branchId, showDrawer]);

  // ── Tarifas calculadas ──
  const tarifas = calcTarifas(cp);

  // ── Costos de la receta actual ──
  const rendimiento = parseFloat(form.rendimiento) || 1;
  const minutosMO  = parseFloat(form.minutosMO)  || 0;
  const minutosCIF = parseFloat(form.minutosCIF) || 0;
  const costoMP  = lineas.reduce((s, l) => s + l.costoLinea, 0);
  const costoMO  = form.moExterna
    ? (parseFloat(form.moExternaPorUnidad) || 0) * rendimiento
    : minutosMO * tarifas.moMin;
  const costoCIF = form.moExterna ? 0 : minutosCIF * tarifas.cifMin;
  const costoTotal = costoMP + costoMO + costoCIF;
  const costoPorcion = costoTotal / rendimiento;
  const pctVentasEf = form.pctPersonalizado ? (parseFloat(form.pctVentas) || 0) : tarifas.pctVentas;
  const pctAdmonEf  = form.pctPersonalizado ? (parseFloat(form.pctAdmon)  || 0) : tarifas.pctAdmon;
  const costoAdmon  = form.esProductoTerminado ? costoTotal * (pctAdmonEf  / 100) : 0;
  const costoVentas = form.esProductoTerminado ? costoTotal * (pctVentasEf / 100) : 0;
  const costoTotalFinal = costoTotal + costoAdmon + costoVentas;

  // ── Lista filtrada para el dropdown ──
  const opciones = selTipo === "ingrediente"
    ? ingredientes.filter(i => i.nombre.toLowerCase().includes(busqIng.toLowerCase())).slice(0, 8)
    : lista.filter(r => r._id !== editando && r.nombre.toLowerCase().includes(busqIng.toLowerCase())).slice(0, 8);

  // ── Receta drawer ──
  const abrirNuevo = () => {
    setEditando(null);
    setForm({ nombre: "", rendimiento: "1", unidad: "porciones", minutosMO: "0", minutosCIF: "0", moExterna: false, moExternaPorUnidad: "0", esProductoTerminado: false, pctPersonalizado: false, pctVentas: "0", pctAdmon: "0" });
    setLineas([]); setBusqIng(""); setSelId(""); setCantidad("");
    setShowDrawer(true);
    setTimeout(() => nombreRef.current?.focus(), 100);
  };

  // Refresca costoUnitario/costoLinea de cada línea con el costo VIGENTE del ingrediente/sub-receta,
  // para que un cambio posterior en su receta no deje costos desactualizados (snapshot viejo).
  const recalcularLineas = (lineas: LineaReceta[]): LineaReceta[] =>
    lineas.map(l => {
      if (l.tipo === "ingrediente") {
        const ing = ingredientes.find(i => i._id === l.ingredienteId);
        if (!ing) return l;
        const esGramo   = ["kg","kl","kilo","kilos","gr","g"].includes(ing.unidad.toLowerCase());
        const esLiquido = ["lt","l","litro","ml"].includes(ing.unidad.toLowerCase());
        const cu = (esGramo || esLiquido) ? (ing.costoGr > 0 ? ing.costoGr : ing.costoUnitario / 1000) : ing.costoUnitario;
        return { ...l, costoUnitario: cu, costoLinea: l.cantidad * cu };
      } else {
        const rec = lista.find(r => r._id === l.recetaId);
        if (!rec) return l;
        const cu = rec.rendimiento > 0 ? rec.costoTotal / rec.rendimiento : 0;
        return { ...l, costoUnitario: cu, costoLinea: l.cantidad * cu };
      }
    });

  const abrirEdicion = (r: Receta) => {
    setEditando(r._id);
    setForm({ nombre: r.nombre, rendimiento: String(r.rendimiento), unidad: r.unidad, minutosMO: String(r.minutosMO || 0), minutosCIF: String(r.minutosCIF || 0), moExterna: r.moExterna || false, moExternaPorUnidad: String(r.moExternaPorUnidad || 0), esProductoTerminado: r.esProductoTerminado || false, pctPersonalizado: r.pctPersonalizado || false, pctVentas: String(r.pctVentas || 0), pctAdmon: String(r.pctAdmon || 0) });
    setLineas(recalcularLineas(r.lineas || []));
    setBusqIng(""); setSelId(""); setCantidad("");
    setShowDrawer(true);
    setTimeout(() => nombreRef.current?.focus(), 100);
  };

  const agregarLinea = () => {
    if (!selId) { toast("warning", selTipo === "ingrediente" ? "Selecciona un ingrediente" : "Selecciona una sub-receta"); return; }
    const cant = parseFloat(cantidad);
    if (!cant || cant <= 0) { toast("warning", "Ingresa una cantidad válida"); return; }

    if (selTipo === "ingrediente") {
      const ing = ingredientes.find(i => i._id === selId);
      if (!ing) return;
      // Ingredientes por peso/volumen → usar costoGr ($/gr o $/ml)
      // Ingredientes por unidad (und, oz, lb...) → usar costoUnitario ($/und)
      const esGramo   = ["kg","kl","kilo","kilos","gr","g"].includes(ing.unidad.toLowerCase());
      const esLiquido = ["lt","l","litro","ml"].includes(ing.unidad.toLowerCase());
      const cu        = (esGramo || esLiquido) ? (ing.costoGr > 0 ? ing.costoGr : ing.costoUnitario / 1000) : ing.costoUnitario;
      const unidad    = esGramo ? "gr" : esLiquido ? "ml" : ing.unidad;
      setLineas(p => [...p, {
        tipo: "ingrediente", ingredienteId: ing._id,
        nombre: ing.nombre, unidad,
        cantidad: cant, costoUnitario: cu, costoLinea: cant * cu,
      }]);
    } else {
      const rec = lista.find(r => r._id === selId);
      if (!rec) return;
      const cu = rec.rendimiento > 0 ? rec.costoTotal / rec.rendimiento : 0;
      setLineas(p => [...p, {
        tipo: "subreceta", recetaId: rec._id,
        nombre: rec.nombre, unidad: rec.unidad,
        cantidad: cant, costoUnitario: cu, costoLinea: cant * cu,
      }]);
    }
    setBusqIng(""); setSelId(""); setCantidad("");
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { toast("warning", "El nombre es obligatorio"); return; }
    if (!lineas.length)       { toast("warning", "Agrega al menos un ingrediente"); return; }
    setGuardando(true);
    try {
      const body = {
        nombre: form.nombre.toUpperCase().trim(),
        rendimiento, unidad: form.unidad,
        lineas, minutosMO, minutosCIF,
        moExterna: form.moExterna, moExternaPorUnidad: parseFloat(form.moExternaPorUnidad) || 0,
        costoMP, costoMO, costoCIF, costoTotal, costoPorcion,
        esProductoTerminado: form.esProductoTerminado, pctPersonalizado: form.pctPersonalizado,
        pctVentas: pctVentasEf, pctAdmon: pctAdmonEf,
        costoAdmon, costoVentas, costoTotalFinal,
      };
      if (editando) {
        await api.put(`/branches/${branchId}/recetas/${editando}`, body);
        toast("success", "Receta actualizada");
      } else {
        await api.post(`/branches/${branchId}/recetas`, body);
        toast("success", "Receta creada");
      }
      setShowDrawer(false);
      cargar();
    } catch { toast("error", "Error al guardar"); }
    finally { setGuardando(false); }
  };

  const eliminar = async (id: string, nombre: string) => {
    if (!await confirm(`¿Eliminar "${nombre}"?`)) return;
    try {
      await api.delete(`/branches/${branchId}/recetas/${id}`);
      toast("success", "Eliminada");
      cargar();
    } catch { toast("error", "Error al eliminar"); }
  };

  // ── Guardar costos de producción ──
  const guardarCostos = async () => {
    setSavingCp(true);
    try {
      await api.put(`/branches/${branchId}/costos-produccion`, cp);
      toast("success", "Costos de producción guardados");
    } catch { toast("error", "Error al guardar"); }
    finally { setSavingCp(false); }
  };

  const filtrada = lista
    .filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .filter(r => tab === "terminados" ? r.esProductoTerminado : tab === "internas" ? !r.esProductoTerminado : true)
    .filter(r => {
      if (tab !== "terminados" || subfiltro === "todos") return true;
      if (subfiltro === "precocidos") return r.nombre.toLowerCase().includes("precoci");
      return r.nombre.toLowerCase().includes("frit");
    });

  const imprimirReceta = (r: Receta) => {
    const filas = r.lineas.map(l => `
      <tr>
        <td>${l.nombre}</td>
        <td class="center">${l.tipo === "subreceta" ? "Sub-receta" : "Ingrediente"}</td>
        <td class="right">${l.cantidad} ${l.unidad}</td>
        <td class="right">${f(l.costoUnitario)}</td>
        <td class="right">${f(l.costoLinea)}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${r.nombre}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111}
      h1{font-size:22px;font-weight:900;text-transform:uppercase;margin:0 0 4px}
      .meta{font-size:11px;color:#666;margin-bottom:28px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}
      th{background:#f4f4f4;text-transform:uppercase;font-size:9px;letter-spacing:.06em;padding:8px 12px;border-bottom:2px solid #ddd}
      td{padding:7px 12px;border-bottom:1px solid #f0f0f0}
      .right{text-align:right} .center{text-align:center}
      .box{background:#f9f9f9;border-radius:8px;padding:16px;font-size:12px}
      .row{display:flex;justify-content:space-between;padding:3px 0}
      .sep{border-top:1px solid #ddd;margin:8px 0;padding-top:8px}
      .total{font-weight:900;font-size:15px}
      .green{color:#059669;font-weight:900;font-size:18px}
      .blue{color:#3b82f6} .amber{color:#d97706} .violet{color:#7c3aed} .orange{color:#ea580c}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>${r.nombre}</h1>
    <div class="meta">Rendimiento: ${r.rendimiento} ${r.unidad}&nbsp;·&nbsp;Min MO: ${r.minutosMO || 0}'&nbsp;·&nbsp;Min proceso: ${r.minutosCIF || 0}'</div>
    <table>
      <thead><tr><th>Ítem</th><th class="center">Tipo</th><th class="right">Cantidad</th><th class="right">$/Unidad</th><th class="right">Costo</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="box">
      <div class="row"><span>Materia Prima</span><span>${f(r.costoMP || 0)}</span></div>
      <div class="row blue"><span>Mano de Obra (${r.minutosMO || 0} min)</span><span>${f(r.costoMO || 0)}</span></div>
      <div class="row amber"><span>CIF (${r.minutosCIF || 0} min)</span><span>${f(r.costoCIF || 0)}</span></div>
      ${r.esProductoTerminado ? `
      <div class="row sep total"><span>Costo Producción · ${r.rendimiento} ${r.unidad}</span><span>${f(r.costoTotal || 0)}</span></div>
      <div class="row violet"><span>Costo Ventas (${r.pctVentas || 0}%)</span><span>${f(r.costoVentas || 0)}</span></div>
      <div class="row orange"><span>Costo Admón (${r.pctAdmon || 0}%)</span><span>${f(r.costoAdmon || 0)}</span></div>
      <div class="row sep green"><span>Costo Total · ${r.rendimiento} ${r.unidad}</span><span>${f(r.costoTotalFinal || 0)}</span></div>
      ` : `
      <div class="row sep total"><span>Total · ${r.rendimiento} ${r.unidad}</span><span>${f(r.costoTotal || 0)}</span></div>
      <div class="row green"><span>Costo / porción</span><span>${f(r.costoPorcion || 0)}</span></div>
      `}
    </div>
    </body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank", "width=750,height=950");
    if (!win) { URL.revokeObjectURL(url); return; }
    win.addEventListener("load", () => { win.print(); URL.revokeObjectURL(url); });
  };

  const exportarExcel = () => {
    const titulo = subfiltro === "precocidos" ? "Precocidos" : subfiltro === "fritos" ? "Fritos" : "Productos Terminados";
    const filas = filtrada.map(r => ({
      "Nombre":          r.nombre,
      "Rendimiento":     r.rendimiento,
      "Unidad":          r.unidad,
      "Costo MP ($)":    r.costoMP || 0,
      "MO ($)":          r.costoMO || 0,
      "CIF ($)":         r.costoCIF || 0,
      "Costo Prod ($)":  r.costoTotal || 0,
      "Ventas ($)":      r.costoVentas || 0,
      "Admón ($)":       r.costoAdmon || 0,
      "Costo Total ($)": r.costoTotalFinal || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, titulo);
    XLSX.writeFile(wb, `recetas_${titulo.toLowerCase()}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportarPDF = () => {
    const titulo = subfiltro === "precocidos" ? "Precocidos" : subfiltro === "fritos" ? "Fritos" : "Productos Terminados";
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Productos Terminados — ${titulo}`, 14, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleDateString("es-CO"), 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [["Nombre", "Rend.", "Unid.", "Costo MP", "MO", "CIF", "Costo Prod", "Ventas", "Admón", "Costo Total"]],
      body: filtrada.map(r => [
        r.nombre,
        r.rendimiento,
        r.unidad,
        `$${Math.round(r.costoMP || 0).toLocaleString("es-CO")}`,
        `$${Math.round(r.costoMO || 0).toLocaleString("es-CO")}`,
        `$${Math.round(r.costoCIF || 0).toLocaleString("es-CO")}`,
        `$${Math.round(r.costoTotal || 0).toLocaleString("es-CO")}`,
        `$${Math.round(r.costoVentas || 0).toLocaleString("es-CO")}`,
        `$${Math.round(r.costoAdmon || 0).toLocaleString("es-CO")}`,
        `$${Math.round(r.costoTotalFinal || 0).toLocaleString("es-CO")}`,
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 118, 110], fontStyle: "bold", fontSize: 7 },
      columnStyles: { 0: { cellWidth: 50 } },
    });
    doc.save(`recetas_${titulo.toLowerCase()}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // ──────────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">

      {/* Header con pestañas */}
      <div className="bg-white border-b border-gray-100 px-8 pt-5 shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Recetas</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">
              Formulaciones · costos de producción
            </p>
          </div>
          {(tab === "internas" || tab === "terminados") && (
            <button onClick={abrirNuevo}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-sm">
              <Plus size={14} /> Nueva Receta
            </button>
          )}
          {tab === "costos" && (
            <button onClick={guardarCostos} disabled={savingCp}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-sm">
              <Save size={14} /> {savingCp ? "Guardando..." : "Guardar"}
            </button>
          )}
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 mt-4">
          {(["internas", "terminados", "costos"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
                tab === t
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}>
              {t === "internas" ? "Recetas Internas" : t === "terminados" ? "Productos Terminados" : "Costos de Producción"}
            </button>
          ))}
        </div>
      </div>

      {/* ════ PESTAÑA RECETAS ════ */}
      {(tab === "internas" || tab === "terminados") && (
        <>
          <div className="px-8 pt-4 shrink-0 flex flex-wrap items-center gap-3">
            <input placeholder="Buscar receta..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="w-full max-w-xs bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400" />

            {tab === "terminados" && (
              <>
                <div className="flex gap-1">
                  {(["todos", "precocidos", "fritos"] as const).map(sf => (
                    <button key={sf} onClick={() => setSubfiltro(sf)}
                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                        subfiltro === sf
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-gray-400 border-gray-200 hover:border-emerald-400 hover:text-emerald-600"
                      }`}>
                      {sf === "todos" ? "Todos" : sf === "precocidos" ? "Precocidos" : "Fritos"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 ml-auto">
                  <button onClick={exportarExcel}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-white border border-gray-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 transition-all">
                    <FileSpreadsheet size={13} /> Excel
                  </button>
                  <button onClick={exportarPDF}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-white border border-gray-200 text-red-600 hover:border-red-300 hover:bg-red-50 transition-all">
                    <FileText size={13} /> PDF
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="flex-1 overflow-hidden px-8 py-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full overflow-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-4">Nombre</th>
                    <th className="px-5 py-4 text-center">Ítems</th>
                    <th className="px-5 py-4 text-center">Min MO</th>
                    <th className="px-5 py-4 text-center">Min Proc</th>
                    <th className="px-5 py-4 text-right">Costo MP</th>
                    <th className="px-5 py-4 text-right">MO</th>
                    <th className="px-5 py-4 text-right">CIF</th>
                    {tab === "internas" ? (
                      <>
                        <th className="px-5 py-4 text-right">Total</th>
                        <th className="px-5 py-4 text-right">/ Porción</th>
                        <th className="px-5 py-4 text-center">U. Medida</th>
                      </>
                    ) : (
                      <>
                        <th className="px-5 py-4 text-right">Costo Prod</th>
                        <th className="px-5 py-4 text-right">Ventas</th>
                        <th className="px-5 py-4 text-right">Admón</th>
                        <th className="px-5 py-4 text-right">Costo Total</th>
                      </>
                    )}
                    <th className="px-5 py-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={11} className="p-10 text-center text-gray-300 text-xs">Cargando...</td></tr>
                  ) : filtrada.length === 0 ? (
                    <tr><td colSpan={11} className="p-10 text-center text-gray-300 text-xs">Sin recetas registradas</td></tr>
                  ) : filtrada.map(r => (
                    <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-bold text-gray-800 text-sm leading-tight">{r.nombre}</p>
                        <p className="text-[10px] text-gray-400 font-medium leading-none mt-0.5">{r.rendimiento} {r.unidad}</p>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="bg-violet-50 text-violet-600 text-[10px] font-black px-2 py-0.5 rounded-full">{r.lineas?.length ?? 0}</span>
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-gray-400 font-bold">{r.minutosMO || 0}'</td>
                      <td className="px-5 py-3 text-center text-xs text-gray-400 font-bold">{r.minutosCIF || 0}'</td>
                      <td className="px-5 py-3 text-right text-xs text-gray-500">{f(r.costoMP || 0)}</td>
                      <td className="px-5 py-3 text-right text-xs text-blue-500">{f(r.costoMO || 0)}</td>
                      <td className="px-5 py-3 text-right text-xs text-amber-500">{f(r.costoCIF || 0)}</td>
                      {tab === "internas" ? (
                        <>
                          <td className="px-5 py-3 text-right text-sm font-bold text-gray-500">{f(r.costoTotal || 0)}</td>
                          <td className="px-5 py-3 text-right font-black text-emerald-600">{f(r.costoPorcion || 0)}</td>
                          <td className="px-5 py-3 text-center text-xs text-gray-400 font-bold">{r.unidad || ""}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-5 py-3 text-right text-sm font-bold text-gray-500">{f(r.costoTotal || 0)}</td>
                          <td className="px-5 py-3 text-right text-xs text-violet-500">{f(r.costoVentas || 0)}</td>
                          <td className="px-5 py-3 text-right text-xs text-orange-500">{f(r.costoAdmon || 0)}</td>
                          <td className="px-5 py-3 text-right font-black text-emerald-600">{f(r.costoTotalFinal || 0)}</td>
                        </>
                      )}
                      <td className="px-5 py-3 text-center space-x-2">
                        <button onClick={() => imprimirReceta(r)} className="text-gray-300 hover:text-gray-500"><Printer size={14} /></button>
                        <button onClick={() => abrirEdicion(r)} className="text-blue-400 hover:text-blue-600"><Pencil size={14} /></button>
                        <button onClick={() => eliminar(r._id, r.nombre)} className="text-red-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ════ PESTAÑA COSTOS DE PRODUCCIÓN ════ */}
      {tab === "costos" && (
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

          {/* Sección 1: Tiempo */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Tiempo Productivo</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Días laborales / mes</label>
                <input type="number" value={cp.diasLaborales}
                  onChange={e => setCp(c => ({ ...c, diasLaborales: +e.target.value }))}
                  onKeyDown={focusNextField}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Horas por día</label>
                <input type="number" value={cp.horasDia}
                  onChange={e => setCp(c => ({ ...c, horasDia: +e.target.value }))}
                  onKeyDown={focusNextField}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex flex-col justify-center">
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Total min / mes</p>
                <p className="text-2xl font-black text-emerald-700">{tarifas.minMes.toLocaleString("es-CO")}</p>
              </div>
            </div>
          </div>

          {/* Sección 2: Mano de Obra */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Mano de Obra</h2>
              <button onClick={() => setCp(c => ({ ...c, empleados: [...c.empleados, { nombre: "", salario: 0, prestaciones: 52 }] }))}
                className="flex items-center gap-1 text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase">
                <Plus size={11} /> Agregar
              </button>
            </div>
            <div className="space-y-2">
              {cp.empleados.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-4">Sin empleados registrados</p>
              )}
              {cp.empleados.map((emp, idx) => {
                const costoReal = emp.salario * (1 + emp.prestaciones / 100);
                const porMin    = tarifas.minMes > 0 ? costoReal / tarifas.minMes : 0;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input value={emp.nombre} placeholder="Nombre / Cargo"
                      onChange={e => setCp(c => { const em = [...c.empleados]; em[idx] = { ...em[idx], nombre: e.target.value }; return { ...c, empleados: em }; })}
                      onKeyDown={focusNextField}
                      className="col-span-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <input type="number" value={emp.salario} placeholder="Salario/mes"
                      onChange={e => setCp(c => { const em = [...c.empleados]; em[idx] = { ...em[idx], salario: +e.target.value }; return { ...c, empleados: em }; })}
                      onKeyDown={focusNextField}
                      className="col-span-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <div className="col-span-2 flex items-center gap-1">
                      <input type="number" value={emp.prestaciones} placeholder="52"
                        onChange={e => setCp(c => { const em = [...c.empleados]; em[idx] = { ...em[idx], prestaciones: +e.target.value }; return { ...c, empleados: em }; })}
                        onKeyDown={focusNextField}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                      <span className="text-[9px] text-gray-400 font-black">%</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-[9px] text-gray-400">Total/mes</p>
                      <p className="text-xs font-black text-gray-700">{f(costoReal)}</p>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-[9px] text-gray-400">$/min</p>
                      <p className="text-xs font-black text-blue-600">{f2(porMin)}</p>
                    </div>
                    <button onClick={() => setCp(c => ({ ...c, empleados: c.empleados.filter((_, i) => i !== idx) }))}
                      className="col-span-1 text-red-300 hover:text-red-500 flex justify-center"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
            {cp.empleados.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase">Total MO / min</span>
                <span className="text-sm font-black text-blue-600">{f2(tarifas.moMin)}</span>
              </div>
            )}
          </div>

          {/* Sección 3: CIF */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Costos Indirectos (CIF)</h2>
              <button onClick={() => setCp(c => ({ ...c, cif: [...c.cif, { concepto: "", valorMes: 0 }] }))}
                className="flex items-center gap-1 text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase">
                <Plus size={11} /> Agregar
              </button>
            </div>
            <div className="space-y-2">
              {cp.cif.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-4">Sin costos indirectos registrados</p>
              )}
              {cp.cif.map((item, idx) => {
                const porMin = tarifas.minMes > 0 ? item.valorMes / tarifas.minMes : 0;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input value={item.concepto} placeholder="Concepto (arriendo, gas...)"
                      onChange={e => setCp(c => { const ci = [...c.cif]; ci[idx] = { ...ci[idx], concepto: e.target.value }; return { ...c, cif: ci }; })}
                      onKeyDown={focusNextField}
                      className="col-span-6 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <input type="number" value={item.valorMes} placeholder="Valor/mes"
                      onChange={e => setCp(c => { const ci = [...c.cif]; ci[idx] = { ...ci[idx], valorMes: +e.target.value }; return { ...c, cif: ci }; })}
                      onKeyDown={focusNextField}
                      className="col-span-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <div className="col-span-1 text-right">
                      <p className="text-[9px] text-gray-400">$/min</p>
                      <p className="text-xs font-black text-amber-600">{f2(porMin)}</p>
                    </div>
                    <button onClick={() => setCp(c => ({ ...c, cif: c.cif.filter((_, i) => i !== idx) }))}
                      className="col-span-1 text-red-300 hover:text-red-500 flex justify-center"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
            {cp.cif.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase">Total CIF / min</span>
                <span className="text-sm font-black text-amber-600">{f2(tarifas.cifMin)}</span>
              </div>
            )}
          </div>

          {/* Resumen */}
          {(cp.empleados.length > 0 || cp.cif.length > 0) && (
            <div className="bg-gray-800 rounded-2xl p-4">
              <h2 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Resumen — Costo por minuto de producción</h2>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Mano de Obra", val: tarifas.moMin,    color: "text-blue-400" },
                  { label: "CIF",          val: tarifas.cifMin,   color: "text-amber-400" },
                  { label: "Total",        val: tarifas.totalMin, color: "text-emerald-400" },
                ].map(k => (
                  <div key={k.label}>
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{k.label}</p>
                    <p className={`text-xl font-black mt-0.5 ${k.color}`}>{f2(k.val)}<span className="text-xs font-bold">/min</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sección 4: Base mensual */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Base de Cálculo Mensual</h2>
            <p className="text-[10px] text-gray-400 mb-4">Costo de producción total estimado del mes (suma de costo de producción × unidades de todos los productos terminados). Se usa para calcular automáticamente los % de Ventas y Admón.</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">$ Costo de producción / mes</label>
                <input type="number" value={cp.baseMensual}
                  onChange={e => setCp(c => ({ ...c, baseMensual: +e.target.value }))}
                  onKeyDown={focusNextField}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
              </div>
            </div>
          </div>

          {/* Sección 5: Costo de Ventas */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Costo de Ventas</h2>
            <p className="text-[10px] text-gray-400 mb-4">Personal y otros gastos de ventas (comisiones, empaque, transporte, mercadeo...). El sistema calcula el % a aplicar sobre cada producto.</p>

            {/* Personal de Ventas */}
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Personal de Ventas</h3>
              <button onClick={() => setCp(c => ({ ...c, personalVentas: [...c.personalVentas, { nombre: "", salario: 0, prestaciones: 0 }] }))}
                className="flex items-center gap-1 text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase">
                <Plus size={11} /> Agregar
              </button>
            </div>
            <div className="space-y-2 mb-4">
              {cp.personalVentas.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-3">Sin personal registrado</p>
              )}
              {cp.personalVentas.map((emp, idx) => {
                const costoReal = emp.salario * (1 + emp.prestaciones / 100);
                const porMin    = tarifas.minMes > 0 ? costoReal / tarifas.minMes : 0;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input value={emp.nombre} placeholder="Nombre / Cargo"
                      onChange={e => setCp(c => { const pv = [...c.personalVentas]; pv[idx] = { ...pv[idx], nombre: e.target.value }; return { ...c, personalVentas: pv }; })}
                      onKeyDown={focusNextField}
                      className="col-span-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <input type="number" value={emp.salario} placeholder="Salario/mes"
                      onChange={e => setCp(c => { const pv = [...c.personalVentas]; pv[idx] = { ...pv[idx], salario: +e.target.value }; return { ...c, personalVentas: pv }; })}
                      onKeyDown={focusNextField}
                      className="col-span-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <div className="col-span-2 flex items-center gap-1">
                      <input type="number" value={emp.prestaciones} placeholder="0"
                        onChange={e => setCp(c => { const pv = [...c.personalVentas]; pv[idx] = { ...pv[idx], prestaciones: +e.target.value }; return { ...c, personalVentas: pv }; })}
                        onKeyDown={focusNextField}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                      <span className="text-[9px] text-gray-400 font-black">%</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-[9px] text-gray-400">Total/mes</p>
                      <p className="text-xs font-black text-gray-700">{f(costoReal)}</p>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-[9px] text-gray-400">$/min</p>
                      <p className="text-xs font-black text-violet-600">{f2(porMin)}</p>
                    </div>
                    <button onClick={() => setCp(c => ({ ...c, personalVentas: c.personalVentas.filter((_, i) => i !== idx) }))}
                      className="col-span-1 text-red-300 hover:text-red-500 flex justify-center"><X size={14} /></button>
                  </div>
                );
              })}
            </div>

            {/* Otros costos de ventas */}
            <div className="flex justify-between items-center mb-3 pt-3 border-t border-gray-100">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Otros Costos de Ventas</h3>
              <button onClick={() => setCp(c => ({ ...c, gastosVentas: [...c.gastosVentas, { concepto: "", valorMes: 0 }] }))}
                className="flex items-center gap-1 text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase">
                <Plus size={11} /> Agregar
              </button>
            </div>
            <div className="space-y-2">
              {cp.gastosVentas.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-3">Sin conceptos registrados</p>
              )}
              {cp.gastosVentas.map((item, idx) => {
                const porMin = tarifas.minMes > 0 ? item.valorMes / tarifas.minMes : 0;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input value={item.concepto} placeholder="Concepto (comisiones, empaque...)"
                      onChange={e => setCp(c => { const gv = [...c.gastosVentas]; gv[idx] = { ...gv[idx], concepto: e.target.value }; return { ...c, gastosVentas: gv }; })}
                      onKeyDown={focusNextField}
                      className="col-span-6 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <input type="number" value={item.valorMes} placeholder="Valor/mes"
                      onChange={e => setCp(c => { const gv = [...c.gastosVentas]; gv[idx] = { ...gv[idx], valorMes: +e.target.value }; return { ...c, gastosVentas: gv }; })}
                      onKeyDown={focusNextField}
                      className="col-span-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <div className="col-span-1 text-right">
                      <p className="text-[9px] text-gray-400">$/min</p>
                      <p className="text-xs font-black text-violet-600">{f2(porMin)}</p>
                    </div>
                    <button onClick={() => setCp(c => ({ ...c, gastosVentas: c.gastosVentas.filter((_, i) => i !== idx) }))}
                      className="col-span-1 text-red-300 hover:text-red-500 flex justify-center"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-4">
              <span className="text-[9px] font-black text-gray-400 uppercase">Total Ventas / mes</span>
              <span className="text-sm font-black text-gray-700">{f(tarifas.totalVentas)}</span>
              <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-2 flex flex-col items-end">
                <p className="text-[9px] font-black text-violet-500 uppercase tracking-widest">% Ventas resultante</p>
                <p className="text-xl font-black text-violet-600">{tarifas.pctVentas.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Sección 6: Costo Administrativo */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Costo Administrativo</h2>
            <p className="text-[10px] text-gray-400 mb-4">Personal y otros gastos administrativos (arriendo oficina, contador, servicios...). El sistema calcula el % a aplicar sobre cada producto.</p>

            {/* Personal Administrativo */}
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Personal Administrativo</h3>
              <button onClick={() => setCp(c => ({ ...c, personalAdmon: [...c.personalAdmon, { nombre: "", salario: 0, prestaciones: 0 }] }))}
                className="flex items-center gap-1 text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase">
                <Plus size={11} /> Agregar
              </button>
            </div>
            <div className="space-y-2 mb-4">
              {cp.personalAdmon.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-3">Sin personal registrado</p>
              )}
              {cp.personalAdmon.map((emp, idx) => {
                const costoReal = emp.salario * (1 + emp.prestaciones / 100);
                const porMin    = tarifas.minMes > 0 ? costoReal / tarifas.minMes : 0;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input value={emp.nombre} placeholder="Nombre / Cargo"
                      onChange={e => setCp(c => { const pa = [...c.personalAdmon]; pa[idx] = { ...pa[idx], nombre: e.target.value }; return { ...c, personalAdmon: pa }; })}
                      onKeyDown={focusNextField}
                      className="col-span-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <input type="number" value={emp.salario} placeholder="Salario/mes"
                      onChange={e => setCp(c => { const pa = [...c.personalAdmon]; pa[idx] = { ...pa[idx], salario: +e.target.value }; return { ...c, personalAdmon: pa }; })}
                      onKeyDown={focusNextField}
                      className="col-span-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <div className="col-span-2 flex items-center gap-1">
                      <input type="number" value={emp.prestaciones} placeholder="0"
                        onChange={e => setCp(c => { const pa = [...c.personalAdmon]; pa[idx] = { ...pa[idx], prestaciones: +e.target.value }; return { ...c, personalAdmon: pa }; })}
                        onKeyDown={focusNextField}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                      <span className="text-[9px] text-gray-400 font-black">%</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-[9px] text-gray-400">Total/mes</p>
                      <p className="text-xs font-black text-gray-700">{f(costoReal)}</p>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-[9px] text-gray-400">$/min</p>
                      <p className="text-xs font-black text-orange-600">{f2(porMin)}</p>
                    </div>
                    <button onClick={() => setCp(c => ({ ...c, personalAdmon: c.personalAdmon.filter((_, i) => i !== idx) }))}
                      className="col-span-1 text-red-300 hover:text-red-500 flex justify-center"><X size={14} /></button>
                  </div>
                );
              })}
            </div>

            {/* Otros costos administrativos */}
            <div className="flex justify-between items-center mb-3 pt-3 border-t border-gray-100">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Otros Costos Administrativos</h3>
              <button onClick={() => setCp(c => ({ ...c, gastosAdmon: [...c.gastosAdmon, { concepto: "", valorMes: 0 }] }))}
                className="flex items-center gap-1 text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase">
                <Plus size={11} /> Agregar
              </button>
            </div>
            <div className="space-y-2">
              {cp.gastosAdmon.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-3">Sin conceptos registrados</p>
              )}
              {cp.gastosAdmon.map((item, idx) => {
                const porMin = tarifas.minMes > 0 ? item.valorMes / tarifas.minMes : 0;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input value={item.concepto} placeholder="Concepto (arriendo, nómina admon...)"
                      onChange={e => setCp(c => { const ga = [...c.gastosAdmon]; ga[idx] = { ...ga[idx], concepto: e.target.value }; return { ...c, gastosAdmon: ga }; })}
                      onKeyDown={focusNextField}
                      className="col-span-6 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <input type="number" value={item.valorMes} placeholder="Valor/mes"
                      onChange={e => setCp(c => { const ga = [...c.gastosAdmon]; ga[idx] = { ...ga[idx], valorMes: +e.target.value }; return { ...c, gastosAdmon: ga }; })}
                      onKeyDown={focusNextField}
                      className="col-span-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400" />
                    <div className="col-span-1 text-right">
                      <p className="text-[9px] text-gray-400">$/min</p>
                      <p className="text-xs font-black text-orange-600">{f2(porMin)}</p>
                    </div>
                    <button onClick={() => setCp(c => ({ ...c, gastosAdmon: c.gastosAdmon.filter((_, i) => i !== idx) }))}
                      className="col-span-1 text-red-300 hover:text-red-500 flex justify-center"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-4">
              <span className="text-[9px] font-black text-gray-400 uppercase">Total Admón / mes</span>
              <span className="text-sm font-black text-gray-700">{f(tarifas.totalAdmon)}</span>
              <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-2 flex flex-col items-end">
                <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">% Admón resultante</p>
                <p className="text-xl font-black text-orange-600">{tarifas.pctAdmon.toFixed(1)}%</p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ════ DRAWER RECETA ════ */}
      {showDrawer && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/10" onClick={() => setShowDrawer(false)} />
          <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-800">{editando ? "Editar" : "Nueva"} Receta</h3>
              <button onClick={() => setShowDrawer(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Nombre + Rendimiento + Unidad */}
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Nombre *</label>
                <input ref={nombreRef} type="text" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: GUISO DE CARNE"
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:border-emerald-400" />
              </div>

              {/* Toggle Receta interna / Producto terminado */}
              <div className="flex gap-2">
                {(["interna", "terminado"] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, esProductoTerminado: t === "terminado" }))}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase border transition-all ${
                      (t === "terminado") === form.esProductoTerminado
                        ? "bg-violet-600 text-white border-violet-600"
                        : "text-gray-500 border-gray-200 hover:border-violet-400"
                    }`}>
                    {t === "interna" ? "Receta Interna" : "Producto Terminado"}
                  </button>
                ))}
              </div>

              {form.esProductoTerminado && (
                <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ventas / Admón</span>
                    <div className="flex gap-2">
                      {(["global", "personalizado"] as const).map(t => (
                        <button key={t} type="button"
                          onClick={() => setForm(f => ({ ...f, pctPersonalizado: t === "personalizado" }))}
                          className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase border transition-all ${
                            (t === "personalizado") === form.pctPersonalizado
                              ? "bg-violet-600 text-white border-violet-600"
                              : "text-gray-500 border-gray-200 hover:border-violet-400"
                          }`}>
                          {t === "global" ? "% Global" : "% Personalizado"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!form.pctPersonalizado ? (
                    <p className="text-[10px] text-gray-400">
                      Usando los % calculados en "Costos de Producción": Ventas <span className="font-black text-violet-600">{tarifas.pctVentas.toFixed(1)}%</span> · Admón <span className="font-black text-orange-600">{tarifas.pctAdmon.toFixed(1)}%</span>
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">% Ventas</label>
                        <input type="number" value={form.pctVentas}
                          onChange={e => setForm(f => ({ ...f, pctVentas: e.target.value }))}
                          placeholder="0"
                          className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">% Admón</label>
                        <input type="number" value={form.pctAdmon}
                          onChange={e => setForm(f => ({ ...f, pctAdmon: e.target.value }))}
                          placeholder="0"
                          className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
                      </div>
                      <p className="col-span-2 text-[9px] text-gray-400">% propios de este producto — sustituyen a los % globales (útil cuando se vende por un canal con comisión distinta, etc).</p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Rendimiento</label>
                  <input type="number" value={form.rendimiento}
                    onChange={e => setForm(f => ({ ...f, rendimiento: e.target.value }))}
                    className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Unidad</label>
                  <select value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
                    className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400">
                    {UNIDADES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Toggle MO planta / MO externa */}
              <div className="flex gap-2">
                {(["planta", "externa"] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, moExterna: t === "externa" }))}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase border transition-all ${
                      (t === "externa") === form.moExterna
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "text-gray-500 border-gray-200 hover:border-emerald-400"
                    }`}>
                    {t === "planta" ? "MO Planta" : "MO Externa"}
                  </button>
                ))}
              </div>

              {!form.moExterna ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Min. MO</label>
                    <input type="number" value={form.minutosMO}
                      onChange={e => setForm(f => ({ ...f, minutosMO: e.target.value }))}
                      placeholder="0"
                      className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Min. proceso</label>
                    <input type="number" value={form.minutosCIF}
                      onChange={e => setForm(f => ({ ...f, minutosCIF: e.target.value }))}
                      placeholder="0"
                      className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">$ MO por unidad</label>
                  <input type="number" value={form.moExternaPorUnidad}
                    onChange={e => setForm(f => ({ ...f, moExternaPorUnidad: e.target.value }))}
                    placeholder="0"
                    className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
                </div>
              )}

              {/* Añadir línea */}
              <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
                {/* Selector tipo */}
                <div className="flex gap-2">
                  {(["ingrediente", "subreceta"] as const).map(t => (
                    <button key={t} type="button" onClick={() => { setSelTipo(t); setBusqIng(""); setSelId(""); }}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase border transition-all ${
                        selTipo === t ? "bg-emerald-600 text-white border-emerald-600" : "text-gray-500 border-gray-200 hover:border-emerald-400"
                      }`}>
                      {t === "ingrediente" ? "Ingrediente" : "Sub-receta"}
                    </button>
                  ))}
                </div>

                {/* Búsqueda */}
                <div className="relative">
                  <input type="text" value={busqIng}
                    onChange={e => { setBusqIng(e.target.value); setShowDD(true); setSelId(""); }}
                    onFocus={() => setShowDD(true)}
                    onBlur={() => setTimeout(() => setShowDD(false), 150)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && opciones.length > 0) {
                        e.preventDefault();
                        const op = opciones[0];
                        setSelId(op._id); setBusqIng(op.nombre); setShowDD(false);
                        setTimeout(() => cantRef.current?.focus(), 50);
                      }
                    }}
                    placeholder={selTipo === "ingrediente" ? "Buscar ingrediente..." : "Buscar sub-receta..."}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400" />
                  {showDD && opciones.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                      {selTipo === "ingrediente"
                        ? (opciones as Ingrediente[]).map(i => (
                          <button key={i._id} type="button"
                            onMouseDown={() => { setSelId(i._id); setBusqIng(i.nombre); setShowDD(false); setTimeout(() => cantRef.current?.focus(), 50); }}
                            className="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-emerald-50 flex justify-between">
                            <span>{i.nombre}</span>
                            <span className="text-gray-400">{f(i.costoUnitario)}/{i.unidad}</span>
                          </button>
                        ))
                        : (opciones as Receta[]).map(r => (
                          <button key={r._id} type="button"
                            onMouseDown={() => { setSelId(r._id); setBusqIng(r.nombre); setShowDD(false); setTimeout(() => cantRef.current?.focus(), 50); }}
                            className="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-violet-50 flex justify-between">
                            <span>{r.nombre}</span>
                            <span className="text-gray-400">{f(r.costoPorcion)}/porción</span>
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input ref={cantRef} type="number" value={cantidad}
                    onChange={e => setCantidad(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); agregarLinea(); }}}
                    placeholder={(() => {
                      if (selTipo === "subreceta") {
                        const rec = lista.find(r => r._id === selId);
                        return rec ? `Cantidad (${rec.unidad})` : "Cantidad";
                      }
                      const ing = ingredientes.find(i => i._id === selId);
                      if (!ing) return "Cantidad";
                      const esGramo   = ["kg","kl","kilo","kilos","gr","g"].includes(ing.unidad.toLowerCase());
                      const esLiquido = ["lt","l","litro","ml"].includes(ing.unidad.toLowerCase());
                      if (esGramo)   return "Cantidad (gr)";
                      if (esLiquido) return "Cantidad (ml)";
                      return `Cantidad (${ing.unidad})`;
                    })()}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400" />
                  <button type="button" onClick={agregarLinea}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase transition-all">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Tabla de líneas */}
              {lineas.length > 0 && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr className="text-[9px] font-black text-gray-400 uppercase">
                        <th className="px-3 py-2 text-left">Ítem</th>
                        <th className="px-3 py-2 text-center">Tipo</th>
                        <th className="px-3 py-2 text-center">Cant.</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lineas.map((l, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-bold text-gray-700">{l.nombre}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                              l.tipo === "subreceta" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"
                            }`}>{l.tipo === "subreceta" ? "sub" : "ing"}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number"
                              value={l.cantidad}
                              onChange={e => {
                                const c = parseFloat(e.target.value) || 0;
                                setLineas(p => p.map((item, i) => i !== idx ? item : { ...item, cantidad: c, costoLinea: c * item.costoUnitario }));
                              }}
                              className="w-16 text-center text-xs font-bold text-gray-600 bg-transparent border-b border-gray-200 focus:border-emerald-400 outline-none"
                            />
                            <span className="text-[10px] text-gray-400 ml-1">{l.unidad}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-600">{f(l.costoLinea)}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => setLineas(p => p.filter((_, i) => i !== idx))} className="text-red-300 hover:text-red-500"><X size={12} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Resumen de costos */}
              {(lineas.length > 0 || minutosMO > 0 || minutosCIF > 0) && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                  {[
                    { label: "Materia Prima",  val: costoMP,  color: "text-gray-700" },
                    form.moExterna
                      ? { label: `MO externa (${rendimiento} und × ${f(parseFloat(form.moExternaPorUnidad)||0)})`, val: costoMO, color: "text-blue-600" }
                      : { label: `MO (${minutosMO} min × ${f2(tarifas.moMin)})`, val: costoMO, color: "text-blue-600" },
                    ...(!form.moExterna ? [{ label: `CIF (${minutosCIF} min × ${f2(tarifas.cifMin)})`, val: costoCIF, color: "text-amber-600" }] : []),
                  ].map(k => (
                    <div key={k.label} className="flex justify-between text-xs">
                      <span className="text-gray-400 font-bold">{k.label}</span>
                      <span className={`font-black ${k.color}`}>{f(k.val)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-1.5 flex justify-between">
                    <span className="text-[9px] font-black text-gray-500 uppercase">{form.esProductoTerminado ? "Costo Producción" : "Total"} · {rendimiento} {form.unidad}</span>
                    <span className="font-black text-gray-900">{f(costoTotal)}</span>
                  </div>

                  {form.esProductoTerminado ? (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 font-bold">Costo Ventas ({pctVentasEf.toFixed(1)}% × {f(costoTotal)})</span>
                        <span className="font-black text-violet-600">{f(costoVentas)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 font-bold">Costo Admón ({pctAdmonEf.toFixed(1)}% × {f(costoTotal)})</span>
                        <span className="font-black text-orange-600">{f(costoAdmon)}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-1.5 flex justify-between">
                        <span className="text-[9px] font-black text-gray-500 uppercase">Costo Total · {rendimiento} {form.unidad}</span>
                        <span className="font-black text-emerald-600 text-base">{f(costoTotalFinal)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-[9px] font-black text-gray-400 uppercase">Costo / porción</span>
                      <span className="font-black text-emerald-600 text-base">{f(costoPorcion)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <button onClick={guardar} disabled={guardando}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors">
                {guardando ? "Guardando..." : editando ? "✓ Actualizar Receta" : "✓ Crear Receta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
