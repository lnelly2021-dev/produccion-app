"use client";
import React, { useState, useEffect, useRef } from "react";
import { X, FileText, ChevronRight, CalendarDays, Printer } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

interface Pago  { fecha: string; monto: number; medioPago: string; }
interface Pasivo {
  _id: string; fecha: string; proveedor: string; nroFactura: string;
  concepto: string; valor: number; abono: number; saldo: number;
  estado: string; pagos: Pago[];
}
interface GrupoProveedor {
  proveedor: string;
  pasivos:   Pasivo[];
  valor:     number;
  abono:     number;
  saldo:     number;
}

export default function CXPPage() {
  const { branch, company } = useAuth();
  const branchId   = branch?.id || "";
  const confirm    = useConfirm();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [pasivos,      setPasivos]      = useState<Pasivo[]>([]);
  const [proveedores,  setProveedores]  = useState<any[]>([]);
  const [bancos,       setBancos]       = useState<string[]>([]);
  const [cargando,     setCargando]     = useState(true);
  const [mostrarForm,  setMostrarForm]  = useState(false);
  const [pagoActivo,   setPagoActivo]   = useState<Pasivo | null>(null);
  const [montoPago,    setMontoPago]    = useState("");
  const [medioPago,    setMedioPago]    = useState("EFECTIVO");
  const [drawerGrupo,  setDrawerGrupo]  = useState<GrupoProveedor | null>(null);
  const [guardando,    setGuardando]    = useState(false);
  const [tipoRango,    setTipoRango]    = useState("TODOS");
  const [fechaBase,    setFechaBase]    = useState(new Date().toLocaleDateString("en-CA"));

  const [nuevaDeuda, setNuevaDeuda] = useState({
    proveedor: "", nroFacturaProveedor: "", valorTotal: 0, concepto: "",
  });

  useEffect(() => {
    if (!branchId) return;
    cargar();
    api.get(`/branches/${branchId}/contactos?tipo=PROVEEDOR`)
      .then(r => setProveedores(r.data.data ?? r.data ?? []))
      .catch(() => setProveedores(JSON.parse(localStorage.getItem(branchId ? `proveedores_${branchId}` : "proveedores") || "[]")));
    const bid = company?.id || "";
    if (bid) {
      api.get(`/companies/${bid}/branches/${branchId}`)
        .then(r => { const b = r.data.data?.bancos ?? []; if (b.length) setBancos(b); })
        .catch(() => {});
    }
    const lb = JSON.parse(localStorage.getItem("lista_bancos") || "null");
    if (lb) setBancos(lb);
  }, [branchId]);

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await api.get(`/branches/${branchId}/pasivos`);
      setPasivos(r.data.data ?? r.data ?? []);
    } catch { toast("error", "Error al cargar CXP"); }
    finally { setCargando(false); }
  };

  // ── Filtro de periodo ─────────────────────────────────────────────────────
  const pasivosFiltrados = (() => {
    if (tipoRango === "TODOS") return pasivos;
    const base = new Date(fechaBase + "T12:00:00");
    let inicio: Date, fin: Date;
    switch (tipoRango) {
      case "DIARIO":
        inicio = new Date(base); inicio.setHours(0,0,0,0);
        fin    = new Date(base); fin.setHours(23,59,59,999);
        break;
      case "SEMANAL":
        inicio = new Date(base); inicio.setDate(base.getDate() - base.getDay());
        fin    = new Date(inicio); fin.setDate(inicio.getDate() + 6); fin.setHours(23,59,59,999);
        break;
      case "MENSUAL":
        inicio = new Date(base.getFullYear(), base.getMonth(), 1);
        fin    = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case "ANUAL":
        inicio = new Date(base.getFullYear(), 0, 1);
        fin    = new Date(base.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default: return pasivos;
    }
    return pasivos.filter(p => {
      const t = new Date(p.fecha).getTime();
      return t >= inicio.getTime() && t <= fin.getTime();
    });
  })();

  // ── Agrupar por proveedor ─────────────────────────────────────────────────
  const grupos: GrupoProveedor[] = Object.values(
    pasivosFiltrados.reduce((acc, p) => {
      if (!acc[p.proveedor]) acc[p.proveedor] = { proveedor: p.proveedor, pasivos: [], valor: 0, abono: 0, saldo: 0 };
      acc[p.proveedor].pasivos.push(p);
      acc[p.proveedor].valor += p.valor;
      acc[p.proveedor].abono += p.abono;
      acc[p.proveedor].saldo += p.saldo;
      return acc;
    }, {} as Record<string, GrupoProveedor>)
  ).sort((a, b) => b.saldo - a.saldo);

  const tituloRango = () => {
    if (tipoRango === "TODOS") return "Todas las deudas";
    const base = new Date(fechaBase + "T12:00:00");
    if (tipoRango === "DIARIO")  return base.toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" });
    if (tipoRango === "MENSUAL") return base.toLocaleDateString("es-CO", { month:"long", year:"numeric" });
    if (tipoRango === "ANUAL")   return `Año ${base.getFullYear()}`;
    return fechaBase;
  };

  const guardarDeuda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaDeuda.proveedor || nuevaDeuda.valorTotal <= 0) return;
    setGuardando(true);
    try {
      await api.post(`/branches/${branchId}/pasivos`, {
        fecha:      new Date().toISOString(),
        proveedor:  nuevaDeuda.proveedor.toUpperCase(),
        nroFactura: nuevaDeuda.nroFacturaProveedor || "S/N",
        concepto:   nuevaDeuda.concepto.toUpperCase(),
        valor:      nuevaDeuda.valorTotal,
        abono: 0, saldo: nuevaDeuda.valorTotal, pagos: [],
      });
      toast("success", "Deuda registrada");
      setMostrarForm(false);
      setNuevaDeuda({ proveedor: "", nroFacturaProveedor: "", valorTotal: 0, concepto: "" });
      cargar();
    } catch { toast("error", "Error al registrar la deuda"); }
    finally { setGuardando(false); }
  };

  const confirmarAbono = async () => {
    const monto = parseFloat(montoPago);
    if (!pagoActivo || monto <= 0) return;
    setGuardando(true);
    try {
      const r = await api.post(`/branches/${branchId}/pasivos/${pagoActivo._id}/abonos`, {
        monto, medioPago: medioPago || "EFECTIVO", fecha: new Date().toISOString(),
      });
      const actualizado = r.data.data ?? r.data;
      setPasivos(prev => prev.map(p => p._id === actualizado._id ? actualizado : p));
      // Actualizar drawer si está abierto
      if (drawerGrupo?.proveedor === actualizado.proveedor) {
        setDrawerGrupo(g => g ? {
          ...g,
          pasivos: g.pasivos.map(p => p._id === actualizado._id ? actualizado : p),
          abono: g.pasivos.reduce((a, p) => a + (p._id === actualizado._id ? actualizado.abono : p.abono), 0),
          saldo: g.pasivos.reduce((a, p) => a + (p._id === actualizado._id ? actualizado.saldo : p.saldo), 0),
        } : null);
      }
      // Registrar en Egresos
      const totalAbonos = pasivos
        .map(p => p._id === actualizado._id ? actualizado : p)
        .reduce((sum, p) => sum + (p.pagos?.length || 0), 0);
      const nroAbono = `CXP-CE${String(totalAbonos).padStart(3, "0")}`;
      await api.post(`/branches/${branchId}/egresos`, {
        nroDoc: nroAbono, fecha: new Date().toLocaleDateString("en-CA"),
        fechaISO: new Date().toISOString(), tipo: "GASTO",
        proveedor: pagoActivo.proveedor,
        concepto: `PAGO CXP: ${pagoActivo.concepto} (Fact: ${pagoActivo.nroFactura})`,
        valor: monto, medioPago: medioPago || "EFECTIVO",
        items: [], estado: "CUADRADA", esInventario: false,
      }).catch(() => {});
      toast("success", "Abono registrado");
      setPagoActivo(null); setMontoPago(""); setMedioPago("EFECTIVO");
    } catch { toast("error", "Error al registrar el abono"); }
    finally { setGuardando(false); }
  };

  const eliminarDeuda = async (p: Pasivo) => {
    if (!await confirm(`¿Eliminar la factura ${p.nroFactura} de ${p.proveedor}?`)) return;
    try {
      await api.delete(`/branches/${branchId}/pasivos/${p._id}`);
      toast("success", "Deuda eliminada");
      cargar();
      setDrawerGrupo(null);
    } catch { toast("error", "Error al eliminar"); }
  };

  // ── PDF individual proveedor ──────────────────────────────────────────────
  const imprimirProveedor = (g: GrupoProveedor) => {
    const rows: string[] = [];
    g.pasivos.forEach(d => {
      let s = 0;
      const movs = [
        { fecha: d.fecha, concepto: `Factura ${d.nroFactura}${d.concepto?" · "+d.concepto:""}`, debito: d.valor, credito: 0 },
        ...(d.pagos||[]).map(p => ({ fecha: p.fecha, concepto: `Abono · ${p.medioPago}`, debito: 0, credito: p.monto })),
      ];
      movs.forEach(m => {
        s += m.debito - m.credito;
        rows.push(`<tr>
          <td>${new Date(m.fecha).toLocaleDateString("es-CO")}</td>
          <td>${m.concepto}</td>
          <td class="r">${m.debito > 0 ? "$"+m.debito.toLocaleString("es-CO") : "—"}</td>
          <td class="r">${m.credito > 0 ? "$"+m.credito.toLocaleString("es-CO") : "—"}</td>
          <td class="r"><strong>$${s.toLocaleString("es-CO")}</strong></td>
        </tr>`);
      });
    });
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>CXP - ${g.proveedor}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;padding:28px 36px;font-size:12px;color:#1e293b}
  h1{font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;color:#0f172a}
  .sub{font-size:10px;color:#64748b;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin-top:14px}
  thead tr{border-bottom:2px solid #334155}
  th{background:#f8fafc;color:#334155;padding:7px 10px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;text-align:left}
  td{padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#334155}
  .r{text-align:right}
  .tot td{font-weight:900;background:#f8fafc;border-top:2px solid #334155;font-size:12px}
  @media print{@page{margin:12mm;size:A4}}
</style></head><body>
<h1>Estado de Cuenta — Proveedor</h1>
<div class="sub">${g.proveedor} &nbsp;|&nbsp; ${g.pasivos.length} factura${g.pasivos.length!==1?"s":""}</div>
<table>
  <thead><tr><th>Fecha</th><th>Concepto</th><th class="r">Débito</th><th class="r">Crédito</th><th class="r">Saldo</th></tr></thead>
  <tbody>${rows.join("")}</tbody>
  <tfoot><tr class="tot">
    <td colspan="4" style="text-align:right;padding-right:10px">SALDO TOTAL PENDIENTE</td>
    <td class="r">$${g.saldo.toLocaleString("es-CO")}</td>
  </tr></tfoot>
</table>
<script>window.print();window.close();</script>
</body></html>`;
    const w = window.open("","_blank"); w?.document.write(html); w?.document.close();
  };

  // ── PDF reporte general ───────────────────────────────────────────────────
  const imprimirReporte = () => {
    const totalDeuda  = grupos.reduce((a, g) => a + g.valor, 0);
    const totalAbonos = grupos.reduce((a, g) => a + g.abono, 0);
    const totalSaldo  = grupos.reduce((a, g) => a + g.saldo, 0);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>CXP — Reporte General</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;padding:28px 36px;font-size:12px;color:#1e293b}
  h1{font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
  .sub{font-size:10px;color:#64748b;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin-top:14px}
  thead tr{border-bottom:2px solid #334155}
  th{background:#f8fafc;color:#334155;padding:7px 10px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;text-align:left}
  td{padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#334155}
  .r{text-align:right}
  .tot td{font-weight:900;background:#f8fafc;border-top:2px solid #334155}
  @media print{@page{margin:12mm;size:A4}}
</style></head><body>
<h1>Cuentas por Pagar (CXP) — Reporte General</h1>
<div class="sub">${tituloRango()} &nbsp;|&nbsp; ${grupos.length} proveedor${grupos.length!==1?"es":""}</div>
<table>
  <thead><tr>
    <th>Proveedor</th><th>Facturas</th>
    <th class="r">Total Deuda</th><th class="r">Total Abonos</th><th class="r">Saldo Pendiente</th>
  </tr></thead>
  <tbody>
    ${grupos.map(g => `<tr>
      <td><strong>${g.proveedor}</strong></td>
      <td>${g.pasivos.length}</td>
      <td class="r">$${g.valor.toLocaleString("es-CO")}</td>
      <td class="r">$${g.abono.toLocaleString("es-CO")}</td>
      <td class="r"><strong>$${g.saldo.toLocaleString("es-CO")}</strong></td>
    </tr>`).join("")}
  </tbody>
  <tfoot><tr class="tot">
    <td colspan="2">TOTALES</td>
    <td class="r">$${totalDeuda.toLocaleString("es-CO")}</td>
    <td class="r">$${totalAbonos.toLocaleString("es-CO")}</td>
    <td class="r">$${totalSaldo.toLocaleString("es-CO")}</td>
  </tr></tfoot>
</table>
<script>window.print();window.close();</script>
</body></html>`;
    const w = window.open("","_blank"); w?.document.write(html); w?.document.close();
  };

  const deudaTotal = pasivos.reduce((acc, p) => acc + p.saldo, 0);
  const mediosPago = ["EFECTIVO","NEQUI","DAVIPLATA","TRANSFERENCIA",...bancos].filter((v,i,a)=>a.indexOf(v)===i);

  return (
    <div className="p-6 text-left">
      {/* CABECERA */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Cuentas por Pagar (CXP)</h1>
          <p className="text-gray-500 font-semibold text-sm mt-0.5">Deuda total pendiente: ${deudaTotal.toLocaleString("es-CO")}</p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={imprimirReporte}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-black text-xs uppercase hover:bg-gray-50 transition-all">
            <Printer size={14} /> Reporte
          </button>
          <button onClick={() => setMostrarForm(true)}
            className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase hover:bg-gray-700 transition-all">
            + Registrar Factura
          </button>
        </div>
      </div>

      {/* FILTRO DE PERIODO */}
      <div className="flex items-center gap-3 mb-5">
        <select value={tipoRango} onChange={e => setTipoRango(e.target.value)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none text-gray-700">
          <option value="TODOS">Todos</option>
          <option value="DIARIO">Diario</option>
          <option value="SEMANAL">Semanal</option>
          <option value="MENSUAL">Mensual</option>
          <option value="ANUAL">Anual</option>
        </select>
        {tipoRango !== "TODOS" && (
          <div onClick={() => dateInputRef.current?.showPicker()}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 cursor-pointer relative">
            <CalendarDays size={14} className="text-gray-500 shrink-0" />
            <span className="text-[10px] font-black text-gray-700 uppercase whitespace-nowrap">{tituloRango()}</span>
            <input ref={dateInputRef} type="date" value={fechaBase}
              onChange={e => setFechaBase(e.target.value)}
              className="absolute inset-0 opacity-0 pointer-events-none" />
          </div>
        )}
        <span className="text-[10px] text-gray-400 font-medium ml-1">
          {grupos.length} proveedor{grupos.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* TABLA — agrupada por proveedor */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b-2 border-gray-200">
            <tr className="text-xs font-black text-gray-600 uppercase tracking-widest">
              <th className="px-5 py-4">Proveedor</th>
              <th className="px-5 py-4 text-center">Facturas</th>
              <th className="px-5 py-4 text-right">Total Deuda</th>
              <th className="px-5 py-4 text-right">Total Abonos</th>
              <th className="px-5 py-4 text-right">Saldo</th>
              <th className="px-5 py-4 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan={6} className="p-10 text-center text-gray-300 font-bold text-xs">Cargando...</td></tr>
            ) : grupos.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center text-gray-300 font-bold uppercase text-xs">Sin deudas pendientes</td></tr>
            ) : grupos.map(g => (
              <tr key={g.proveedor} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-5 py-4">
                  <p className="text-gray-800 font-black text-xs uppercase">{g.proveedor}</p>
                  <p className="text-gray-400 text-[10px] mt-0.5">
                    {g.pasivos.filter(p => p.saldo > 0).length} pendiente{g.pasivos.filter(p=>p.saldo>0).length!==1?"s":""} de {g.pasivos.length}
                  </p>
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="bg-gray-100 text-gray-600 font-black text-xs px-2 py-1 rounded-lg">{g.pasivos.length}</span>
                </td>
                <td className="px-5 py-4 text-right text-gray-700 font-bold text-xs">${g.valor.toLocaleString("es-CO")}</td>
                <td className="px-5 py-4 text-right text-gray-500 font-bold text-xs">${g.abono.toLocaleString("es-CO")}</td>
                <td className="px-5 py-4 text-right">
                  <button onClick={() => setDrawerGrupo(g)}
                    className="cursor-pointer ml-auto flex items-center gap-1 text-gray-800 font-black text-xs
                      border-b border-transparent hover:border-gray-400 transition-all group">
                    ${g.saldo.toLocaleString("es-CO")}
                    <ChevronRight size={12} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
                  </button>
                </td>
                <td className="px-5 py-4 text-center">
                  {g.saldo > 0 && (
                    <button onClick={() => {
                      const primera = g.pasivos.find(p => p.saldo > 0);
                      if (primera) { setPagoActivo(primera); setMontoPago(String(primera.saldo)); setMedioPago("EFECTIVO"); }
                    }}
                      className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg text-[10px] uppercase font-black hover:bg-emerald-100 transition-all">
                      Pagar / Abonar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DRAWER — detalle por proveedor */}
      {drawerGrupo && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerGrupo(null)} />
          <div className="w-full max-w-xl bg-white h-full flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Estado de Cuenta — CXP</p>
                <h2 className="text-lg font-black text-gray-800 uppercase mt-0.5">{drawerGrupo.proveedor}</h2>
                <p className="text-xs text-gray-400 font-medium">
                  {drawerGrupo.pasivos.length} factura{drawerGrupo.pasivos.length!==1?"s":""} &nbsp;·&nbsp; Saldo: ${drawerGrupo.saldo.toLocaleString("es-CO")}
                </p>
              </div>
              <button onClick={() => setDrawerGrupo(null)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400">
                <X size={18} />
              </button>
            </div>

            {/* Lista de facturas */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {drawerGrupo.pasivos.map(p => (
                <div key={p._id} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="bg-gray-100 text-gray-600 font-black text-[10px] px-2 py-0.5 rounded">{p.nroFactura}</span>
                        {p.concepto && <span className="text-gray-500 text-[10px] font-medium">{p.concepto}</span>}
                      </div>
                      <p className="text-gray-400 text-[10px] mt-1">{new Date(p.fecha).toLocaleDateString("es-CO")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${p.estado==="Pagado" ? "bg-gray-50 text-gray-400 border-gray-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {p.estado}
                      </span>
                      <button onClick={() => eliminarDeuda(p)} className="text-gray-300 hover:text-gray-500 transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Montos */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                      <p className="text-[9px] text-gray-400 font-bold uppercase">Valor</p>
                      <p className="text-xs font-black text-gray-700">${p.valor.toLocaleString("es-CO")}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                      <p className="text-[9px] text-gray-400 font-bold uppercase">Abonos</p>
                      <p className="text-xs font-black text-gray-600">${p.abono.toLocaleString("es-CO")}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                      <p className="text-[9px] text-gray-400 font-bold uppercase">Saldo</p>
                      <p className="text-xs font-black text-gray-900">${p.saldo.toLocaleString("es-CO")}</p>
                    </div>
                  </div>

                  {/* Pagos realizados */}
                  {p.pagos && p.pagos.length > 0 && (
                    <div className="border-t border-gray-100 pt-2 mb-2 space-y-1">
                      {p.pagos.map((pg, i) => (
                        <div key={i} className="flex justify-between text-[10px] text-gray-500 font-medium">
                          <span>{new Date(pg.fecha).toLocaleDateString("es-CO")} · Abono {pg.medioPago}</span>
                          <span className="font-black text-gray-600">${Number(pg.monto).toLocaleString("es-CO")}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {p.saldo > 0 && (
                    <button onClick={() => { setDrawerGrupo(null); setPagoActivo(p); setMontoPago(String(p.saldo)); setMedioPago("EFECTIVO"); }}
                      className="w-full bg-emerald-50 text-emerald-700 border border-emerald-200 py-2 rounded-lg text-[10px] uppercase font-black hover:bg-emerald-100 transition-all mt-1">
                      Pagar / Abonar esta factura
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
              <div className="flex justify-between text-xs text-gray-500 font-medium mb-1">
                <span>Total deuda</span><span className="font-bold text-gray-700">${drawerGrupo.valor.toLocaleString("es-CO")}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 font-medium mb-2">
                <span>Total abonos</span><span className="font-bold text-gray-700">${drawerGrupo.abono.toLocaleString("es-CO")}</span>
              </div>
              <div className="flex justify-between text-sm font-black border-t border-gray-200 pt-2">
                <span className="text-gray-700">Saldo pendiente</span>
                <span className="text-gray-900">${drawerGrupo.saldo.toLocaleString("es-CO")}</span>
              </div>
            </div>

            <div className="px-6 pb-6 pt-3">
              <button onClick={() => imprimirProveedor(drawerGrupo)}
                className="w-full bg-gray-900 hover:bg-gray-700 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                <FileText size={14} /> Estado de Cuenta PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVA DEUDA */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-gray-800 uppercase">Nueva Deuda</h2>
              <button onClick={() => setMostrarForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={guardarDeuda} className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Proveedor *</label>
                <input list="lista-proveedores-cxp" placeholder="Buscar proveedor..."
                  className="w-full border-2 border-gray-100 p-3 rounded-xl font-bold outline-none text-gray-800 focus:border-gray-300 transition-colors"
                  value={nuevaDeuda.proveedor}
                  onChange={e => setNuevaDeuda({...nuevaDeuda, proveedor: e.target.value.toUpperCase()})} required />
                <datalist id="lista-proveedores-cxp">
                  {proveedores.map((p: any) => <option key={p._id || p.id} value={p.nombre} />)}
                </datalist>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">No. Factura del Proveedor</label>
                <input placeholder="S/N" className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none text-gray-800 font-medium focus:border-gray-300 transition-colors"
                  value={nuevaDeuda.nroFacturaProveedor}
                  onChange={e => setNuevaDeuda({...nuevaDeuda, nroFacturaProveedor: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Valor Total *</label>
                <input type="number" placeholder="0" className="w-full border-2 border-gray-100 p-3 rounded-xl font-black text-gray-900 outline-none focus:border-gray-300 transition-colors"
                  value={nuevaDeuda.valorTotal || ""}
                  onChange={e => setNuevaDeuda({...nuevaDeuda, valorTotal: parseFloat(e.target.value)})} required />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Concepto</label>
                <textarea placeholder="Pedido de carnes, arroz, etc." className="w-full border-2 border-gray-100 p-3 rounded-xl h-20 outline-none resize-none text-gray-700 focus:border-gray-300 transition-colors"
                  value={nuevaDeuda.concepto}
                  onChange={e => setNuevaDeuda({...nuevaDeuda, concepto: e.target.value})} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={guardando}
                  className="flex-1 bg-gray-900 text-white py-4 rounded-2xl font-black uppercase text-xs hover:bg-gray-700 transition-all disabled:opacity-60">
                  {guardando ? "Guardando..." : "Registrar Deuda"}
                </button>
                <button type="button" onClick={() => setMostrarForm(false)}
                  className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase text-xs hover:bg-gray-200 transition-all">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PAGO/ABONO */}
      {pagoActivo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-black text-gray-800 uppercase">Pago / Abono</h2>
              <button onClick={() => setPagoActivo(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-5">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{pagoActivo.proveedor}</p>
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">{pagoActivo.nroFactura}{pagoActivo.concepto ? " · "+pagoActivo.concepto : ""}</p>
              <p className="text-2xl font-black text-gray-900 mt-2">Saldo: ${pagoActivo.saldo.toLocaleString("es-CO")}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Medio de Pago</label>
                <select value={medioPago} onChange={e => setMedioPago(e.target.value)}
                  className="w-full border-2 border-gray-100 p-3 rounded-xl font-bold outline-none text-gray-800">
                  {mediosPago.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Monto a Pagar</label>
                <div className="flex items-center bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus-within:border-gray-400 transition-colors">
                  <span className="text-gray-400 font-black text-xl mr-2">$</span>
                  <input type="number" value={montoPago} onChange={e => setMontoPago(e.target.value)}
                    className="flex-1 bg-transparent outline-none font-black text-xl text-gray-900" placeholder="0" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setPagoActivo(null)}
                className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-gray-200 transition-all">
                Cancelar
              </button>
              <button onClick={confirmarAbono} disabled={!montoPago || parseFloat(montoPago) <= 0 || guardando}
                className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[10px] hover:bg-emerald-700 transition-all disabled:opacity-50">
                {guardando ? "Guardando..." : "Confirmar Pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
