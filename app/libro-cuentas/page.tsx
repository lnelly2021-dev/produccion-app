"use client";
import { useState, useEffect, useRef } from "react";
import { FileDown, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { getEmpresaConfig } from "../../lib/empresaStorage";

interface Asiento {
  fecha:   string;
  nroDoc:  string;
  tercero: string;
  detalle: string;
  debito:  number;
  credito: number;
}

export default function LibroCuentasPage() {
  const { branch, company } = useAuth();
  const branchId   = branch?.id || "";
  const movKey     = branchId ? `movimientos_${branchId}` : "movimientos";
  const [movimientos,  setMovimientos]  = useState<any[]>([]);
  const [recaudos,     setRecaudos]     = useState<any[]>([]);
  const [mediosPago,   setMediosPago]   = useState<string[]>(["EFECTIVO"]);
  const [libroActivo,  setLibroActivo]  = useState("EFECTIVO");
  const [tipoRango,    setTipoRango]    = useState("Diario");
  const [fechaBase,    setFechaBase]    = useState(new Date().toLocaleDateString("en-CA"));
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const bancosLocal: string[] = JSON.parse(localStorage.getItem("lista_bancos") || "[]");
    setMediosPago(["EFECTIVO", ...bancosLocal, "CRÉDITO"]);
    if (branchId && company?.id) {
      api.get(`/companies/${company.id}/branches/${branchId}`)
        .then(r => {
          const bancos: string[] = r.data.data?.bancos ?? r.data?.bancos ?? [];
          if (bancos.length > 0) setMediosPago(["EFECTIVO", ...bancos, "CRÉDITO"]);
        })
        .catch(() => {});
    }

    if (branchId) {
      Promise.all([
        api.get(`/branches/${branchId}/ventas`),
        api.get(`/branches/${branchId}/recaudos`),
        api.get(`/branches/${branchId}/egresos`),
        api.get(`/branches/${branchId}/pre-facturas`),   // todas: anticipo queda en su fecha original
      ]).then(([ventasRes, recaudosRes, egresosRes, pfRes]) => {
        const ventas = (ventasRes.data.data || []).map((v: any) => ({
          ...v, id: v._id, fecha: v.createdAt || v.fecha,
          categoria: "ingreso", valor: Number(v.valor) || 0,
        }));
        const egresos = (egresosRes.data.data || []).map((e: any) => ({
          ...e, id: e._id, categoria: "egreso", nroFactura: e.nroDoc,
          fecha: e.createdAt || e.fechaISO || e.fecha,
        }));
        // Pre-facturas: anticipo inicial + abonos intermedios en sus fechas reales.
        // Las ENTREGADAS también aparecen (el anticipo quedó en el día que se recibió).
        // El saldo de entrega aparece por separado en la FR correspondiente.
        const pfPendientes = (pfRes.data.data || []).flatMap((pf: any) => {
          const entradas: any[] = [];
          // Anticipo inicial
          (pf.pagos || []).filter((p: any) => (Number(p.monto) || 0) > 0).forEach((p: any) => {
            entradas.push({
              id: `${pf._id}_anticipo_${p.medio}`,
              fecha: pf.createdAt || pf.fecha,
              nroFactura: pf.nroDocumento,
              cliente: pf.tercero || "CONSUMIDOR FINAL",
              medioPago: p.medio,
              pagos: [{ medio: p.medio, monto: p.monto }],
              valor: Number(p.monto),
              categoria: "ingreso",
              concepto: "ANTICIPO",
            });
          });
          // Abonos parciales intermedios (solo los que NO son el saldo de entrega)
          if (pf.estado === "PENDIENTE") {
            (pf.abonos || []).filter((a: any) => (Number(a.monto) || 0) > 0).forEach((a: any, i: number) => {
              entradas.push({
                id: `${pf._id}_abono_${i}`,
                fecha: a.fecha || pf.createdAt,
                nroFactura: pf.nroDocumento,
                cliente: pf.tercero || "CONSUMIDOR FINAL",
                medioPago: a.medio,
                pagos: [{ medio: a.medio, monto: a.monto }],
                valor: Number(a.monto),
                categoria: "ingreso",
                concepto: "ABONO PF",
              });
            });
          }
          return entradas;
        });
        const todos = [...ventas, ...egresos, ...pfPendientes].sort((a, b) =>
          new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        );
        setMovimientos(todos);
        localStorage.setItem(movKey, JSON.stringify(todos));

        // Construir tabs desde ventas/egresos/pf Y también desde recaudos (para que NEQUI etc. aparezcan)
        const recaudosMedios = (recaudosRes.data.data || [])
          .filter((r: any) => r.medioPago && r.medioPago !== "DESCUENTO_NOMINA")
          .map((r: any) => (r.medioPago || "EFECTIVO").toUpperCase().trim());
        const mediosTx = Array.from(new Set([
          ...todos.flatMap((m: any) => {
            if (m.pagos && m.pagos.length > 0)
              return m.pagos.map((p: any) => (p.medio || "EFECTIVO").toUpperCase().trim());
            return [(m.medioPago || "EFECTIVO").toUpperCase().trim()];
          }),
          ...recaudosMedios,
        ])).filter((m: string) => m && m !== "MIXTO" && m !== "N/A") as string[];
        const todosLosMedios = ["EFECTIVO",
          ...Array.from(new Set([...mediosTx.filter(m => m !== "EFECTIVO" && m !== "CRÉDITO"), ...bancosLocal])),
          "CRÉDITO",
        ];
        setMediosPago(todosLosMedios);

        const recaudosAPI = (recaudosRes.data.data || []).map((r: any) => ({
          ...r,
          nroRecibo: r.nroRecibo,
          fechaISO:  r.fechaISO || r.createdAt,
          fecha:     r.fecha,
          tercero:   r.tercero,
          concepto:  r.concepto,
          valor:     Number(r.valor) || 0,
          medioPago: r.medioPago || "EFECTIVO",
        }));
        // Mantener entradas CAM- (cambios) que estén en localStorage pero no en la API
        const localRecaudos = JSON.parse(localStorage.getItem("otros_recaudos") || "[]");
        const camLocales = localRecaudos.filter((r: any) =>
          (r.nroRecibo || "").startsWith("CAM-") &&
          !recaudosAPI.some((ar: any) => ar.nroRecibo === r.nroRecibo)
        );
        const todosRecaudos = [...recaudosAPI, ...camLocales];
        setRecaudos(todosRecaudos);
        localStorage.setItem("otros_recaudos", JSON.stringify(todosRecaudos));
      }).catch(() => {
        setMovimientos(JSON.parse(localStorage.getItem(movKey) || "[]"));
        setRecaudos(JSON.parse(localStorage.getItem("otros_recaudos") || "[]"));
      });
    } else {
      setMovimientos(JSON.parse(localStorage.getItem(movKey) || "[]"));
      setRecaudos(JSON.parse(localStorage.getItem("otros_recaudos") || "[]"));
    }
  }, [branchId]);

  // ── Rango ─────────────────────────────────────────────────────────────────
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

  // ── Normalizar medio de pago ──────────────────────────────────────────────
  // Las ventas a crédito van siempre al libro CRÉDITO, sin importar medioPago
  const normMedio = (m: any) => {
    if ((m.tipoPago || "").toUpperCase().trim() === "CRÉDITO") return "CRÉDITO";
    return ((m.medioPago || m.formaPago || m.metodo || "EFECTIVO") + "").toUpperCase().trim();
  };

  // ── Construir asientos del libro activo ───────────────────────────────────
  const asientos: Asiento[] = [];

  movimientos.forEach(m => {
    const t = new Date(m.fecha).getTime();
    if (t < inicio || t > fin) return;

    if (m.categoria === "ingreso") {
      const esAnulada = m.estado === "ANULADA";
      const fechaAnul = esAnulada ? new Date(m.fechaAnulacion || m.updatedAt || m.fecha).getTime() : 0;
      const esMixto = m.medioPago === "MIXTO" || (m.pagos && m.pagos.length > 1);

      if (esMixto && m.pagos && m.pagos.length > 0) {
        // Pago mixto: sumar TODOS los entries del mismo medio (puede haber más de uno)
        const monto = m.pagos
          .filter((p: any) => (p.medio || "").toUpperCase().trim() === libroActivo)
          .reduce((s: number, p: any) => s + (parseFloat(p.monto) || 0), 0);
        if (!monto) return;
        // Entrada original (siempre visible si la fecha cae en el rango)
        asientos.push({
          fecha:   m.fecha,
          nroDoc:  m.nroFactura || "—",
          tercero: (m.cliente || "CONSUMIDOR FINAL").toUpperCase(),
          detalle: `${(m.concepto || "VENTA").toUpperCase()} (MIXTO)`,
          debito:  monto,
          credito: 0,
        });
        // Reversión si fue anulada y la anulación cae en el rango
        if (esAnulada && fechaAnul >= inicio && fechaAnul <= fin) {
          asientos.push({
            fecha:   m.fechaAnulacion || m.updatedAt || m.fecha,
            nroDoc:  m.nroFactura || "—",
            tercero: (m.cliente || "CONSUMIDOR FINAL").toUpperCase(),
            detalle: `ANULACIÓN - ${(m.concepto || "VENTA").toUpperCase()} (MIXTO)`,
            debito:  0,
            credito: monto,
          });
        }
      } else {
        if (normMedio(m) !== libroActivo) return;
        // Regla: si el pago > valor es un "billete con cambio" → usar valor (ingreso real)
        //        si el pago < valor es un saldo de PF → usar pagos (solo lo recibido hoy)
        //        si el pago = valor → da igual, ambos son iguales
        const pagosMedio = (m.pagos || [])
          .filter((p: any) => (p.medio || "").toUpperCase().trim() === libroActivo)
          .reduce((s: number, p: any) => s + (parseFloat(p.monto) || 0), 0);
        const valorFactura = Number(m.valor) || 0;
        const monto = pagosMedio > 0 && pagosMedio <= valorFactura
          ? pagosMedio    // pago ≤ factura: es el monto real recibido (incl. saldo PF)
          : valorFactura; // pago > factura: billete con cambio → usar valor de factura
        // Entrada original
        asientos.push({
          fecha:   m.fecha,
          nroDoc:  m.nroFactura || "—",
          tercero: (m.cliente || "CONSUMIDOR FINAL").toUpperCase(),
          detalle: (m.concepto || "VENTA").toUpperCase(),
          debito:  monto,
          credito: 0,
        });
        // Reversión si fue anulada y la anulación cae en el rango
        if (esAnulada && fechaAnul >= inicio && fechaAnul <= fin) {
          asientos.push({
            fecha:   m.fechaAnulacion || m.updatedAt || m.fecha,
            nroDoc:  m.nroFactura || "—",
            tercero: (m.cliente || "CONSUMIDOR FINAL").toUpperCase(),
            detalle: `ANULACIÓN - ${(m.concepto || "VENTA").toUpperCase()}`,
            debito:  0,
            credito: monto,
          });
        }
      }
    } else if (m.categoria === "egreso") {
      if (normMedio(m) !== libroActivo) return;
      asientos.push({
        fecha:   m.fecha,
        nroDoc:  m.nroFactura || "—",
        tercero: (m.proveedor || m.cliente || "—").toUpperCase(),
        detalle: (m.concepto || m.tipo || "EGRESO").toUpperCase(),
        debito:  0,
        credito: Number(m.valor) || 0,
      });
    }
  });

  recaudos.forEach(r => {
    const fechaStr = r.fechaISO || (r.fecha + "T12:00:00");
    const t = new Date(fechaStr).getTime();
    if (t < inicio || t > fin) return;
    if (normMedio(r) !== libroActivo) return;
    asientos.push({
      fecha:   fechaStr,
      nroDoc:  r.nroRecibo || "—",
      tercero: (r.tercero || "—").toUpperCase(),
      detalle: (r.concepto || "RECAUDO").toUpperCase(),
      debito:  Number(r.valor) || 0,
      credito: 0,
    });
  });

  // Ordenar por fecha ascendente
  asientos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  // Saldo acumulado
  let saldoAcum = 0;
  const asientosConSaldo = asientos.map(a => {
    saldoAcum += a.debito - a.credito;
    return { ...a, saldo: saldoAcum };
  });

  const totalDebito  = asientos.reduce((s, a) => s + a.debito,  0);
  const totalCredito = asientos.reduce((s, a) => s + a.credito, 0);
  const saldoFinal   = totalDebito - totalCredito;

  const $ = (v: number) => `$${v.toLocaleString("es-CO")}`;
  const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"2-digit" });
  const fmtHora  = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" });

  // ── Export Excel ──────────────────────────────────────────────────────────
  const exportarExcel = () => {
    const filas = asientosConSaldo.map(a => ({
      Fecha:   fmtFecha(a.fecha),
      Hora:    fmtHora(a.fecha),
      Nro:     a.nroDoc,
      Tercero: a.tercero,
      Detalle: a.detalle,
      Débito:  a.debito,
      Crédito: a.credito,
      Saldo:   a.saldo,
    }));
    filas.push({ Fecha:"", Hora:"", Nro:"", Tercero:"", Detalle:"TOTALES", Débito: totalDebito, Crédito: totalCredito, Saldo: saldoFinal });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Libro ${libroActivo}`);
    XLSX.writeFile(wb, `libro_${libroActivo.toLowerCase()}_${fechaBase}.xlsx`);
  };

  // ── Export PDF ────────────────────────────────────────────────────────────
  const exportarPDF = () => {
    const emp = getEmpresaConfig();
    const rows = asientosConSaldo.map(a => `<tr>
      <td>${fmtFecha(a.fecha)}<br><span style="font-size:8px;color:#999">${fmtHora(a.fecha)}</span></td>
      <td>${a.nroDoc}</td>
      <td>${a.tercero}</td>
      <td style="max-width:200px">${a.detalle}</td>
      <td style="text-align:right">${a.debito > 0 ? $(a.debito) : ""}</td>
      <td style="text-align:right">${a.credito > 0 ? $(a.credito) : ""}</td>
      <td style="text-align:right;font-weight:700">${$(a.saldo)}</td>
    </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Libro ${libroActivo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',sans-serif;padding:18px 22px;font-size:10px;color:#1a1a1a}
h1{font-size:15px;font-weight:800;text-align:center;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px}
.sub{text-align:center;font-size:9px;color:#666;margin-bottom:12px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#f1f3f5;color:#333;padding:7px 9px;font-size:10px;font-weight:700;text-transform:uppercase;text-align:left;border-bottom:2px solid #d1d5db}
td{padding:5px 9px;border-bottom:1px solid #e5e7eb;font-size:9.5px;vertical-align:top;color:#1a1a1a}
tr:last-child td{border-bottom:none}
.footer td{background:#f8f9fa;font-weight:700;border-top:2px solid #d1d5db;font-size:10px}
@media print{@page{margin:8mm 6mm;size:A4 landscape}}
</style></head><body>
<h1>${emp.nombreEmpresa || "MI EMPRESA"}</h1>
<div class="sub">LIBRO: ${libroActivo} &nbsp;|&nbsp; Período: ${etiqueta}</div>
<table>
  <thead><tr>
    <th>Fecha</th><th>Nro Doc</th><th>Tercero</th><th>Detalle</th>
    <th style="text-align:right">Débito (+)</th>
    <th style="text-align:right">Crédito (−)</th>
    <th style="text-align:right">Saldo</th>
  </tr></thead>
  <tbody>${rows || "<tr><td colspan='7' style='text-align:center;padding:20px;color:#aaa'>Sin movimientos</td></tr>"}</tbody>
  <tfoot class="footer"><tr>
    <td colspan="4" style="text-align:right;letter-spacing:0.08em">TOTALES</td>
    <td style="text-align:right">${$(totalDebito)}</td>
    <td style="text-align:right">${$(totalCredito)}</td>
    <td style="text-align:right">${$(saldoFinal)}</td>
  </tr></tfoot>
</table>
<script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-white font-sans overflow-hidden">

      {/* CABECERA */}
      <div className="bg-white border-b border-gray-100 px-8 pt-5 pb-4 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 uppercase tracking-tight">Libro de Cuentas</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">
              Libro: <span className="text-gray-700 font-semibold">{libroActivo}</span> &nbsp;·&nbsp; {etiqueta}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportarExcel} className="flex items-center gap-1.5 border border-gray-200 text-gray-500 px-4 py-2 rounded-lg text-[10px] font-semibold uppercase hover:bg-gray-50 transition-all">
              <FileDown size={12} /> Excel
            </button>
            <button onClick={exportarPDF} className="flex items-center gap-1.5 border border-gray-200 text-gray-500 px-4 py-2 rounded-lg text-[10px] font-semibold uppercase hover:bg-gray-50 transition-all">
              <FileText size={12} /> PDF
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 items-center flex-wrap">
          <select value={tipoRango} onChange={e => setTipoRango(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase outline-none text-gray-600 bg-white">
            {["Diario","Semanal","Quincenal","Mensual","Anual"].map(o => <option key={o}>{o}</option>)}
          </select>
          <div onClick={() => dateInputRef.current?.showPicker()}
            className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 transition-all relative min-w-[160px]">
            <span className="text-[10px] font-semibold text-gray-600 uppercase">{etiqueta}</span>
            <input ref={dateInputRef} type="date" value={fechaBase}
              onChange={e => setFechaBase(e.target.value)} className="absolute inset-0 opacity-0 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* TABS DE LIBROS */}
      <div className="bg-white border-b border-gray-200 px-8 py-3 shrink-0">
        <div className="flex gap-2 flex-wrap">
          {mediosPago.map(m => (
            <button key={m} onClick={() => setLibroActivo(m)}
              className={`px-4 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-all border ${
                libroActivo === m
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 hover:text-gray-700"
              }`}>
              {m === "EFECTIVO" ? "Caja" : m === "CRÉDITO" ? "Crédito" : m}
            </button>
          ))}
        </div>
      </div>

      {/* RESUMEN */}
      <div className="px-8 py-4 flex gap-3 shrink-0 border-b border-gray-100">
        <div className="border border-gray-200 rounded-xl px-5 py-3 bg-gray-50 min-w-[160px]">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Ingresos</p>
          <p className="text-base font-bold text-gray-800">${totalDebito.toLocaleString("es-CO")}</p>
        </div>
        <div className="border border-gray-200 rounded-xl px-5 py-3 bg-gray-50 min-w-[160px]">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Egresos</p>
          <p className="text-base font-bold text-gray-800">${totalCredito.toLocaleString("es-CO")}</p>
        </div>
        <div className="border border-gray-200 rounded-xl px-5 py-3 bg-gray-50 min-w-[160px]">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Saldo</p>
          <p className={`text-base font-bold ${saldoFinal >= 0 ? "text-gray-900" : "text-rose-600"}`}>
            ${saldoFinal.toLocaleString("es-CO")}
          </p>
        </div>
        <div className="border border-gray-200 rounded-xl px-5 py-3 bg-gray-50">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Movimientos</p>
          <p className="text-base font-bold text-gray-700">{asientos.length}</p>
        </div>
      </div>

      {/* TABLA LIBRO */}
      <div className="flex-1 overflow-hidden px-8 pb-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 h-full overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                <th className="px-5 py-3 text-left w-[130px]">Fecha</th>
                <th className="px-5 py-3 text-left w-[100px]">Documento</th>
                <th className="px-5 py-3 text-left w-[160px]">Tercero</th>
                <th className="px-5 py-3 text-left">Concepto</th>
                <th className="px-5 py-3 text-right w-[130px]">Débito (+)</th>
                <th className="px-5 py-3 text-right w-[130px]">Crédito (−)</th>
                <th className="px-5 py-3 text-right w-[140px]">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {asientosConSaldo.map((a, i) => {
                const esAnulacion = a.detalle.startsWith("ANULACIÓN");
                return (
                  <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${esAnulacion ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-700 text-[11px]">{fmtFecha(a.fecha)}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">{fmtHora(a.fecha)}</p>
                    </td>
                    <td className="px-5 py-3 font-semibold text-gray-700 text-[11px]">{a.nroDoc}</td>
                    <td className="px-5 py-3 font-medium text-gray-600 uppercase text-[10px] truncate max-w-[160px]">{a.tercero}</td>
                    <td className="px-5 py-3 text-gray-500 text-[10px] max-w-[250px] truncate">{a.detalle}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-800 text-[11px]">
                      {a.debito > 0 ? `$${a.debito.toLocaleString("es-CO")}` : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-500 text-[11px]">
                      {a.credito > 0 ? `$${a.credito.toLocaleString("es-CO")}` : <span className="text-gray-200">—</span>}
                    </td>
                    <td className={`px-5 py-3 text-right font-bold text-[12px] ${a.saldo >= 0 ? "text-gray-900" : "text-rose-600"}`}>
                      ${a.saldo.toLocaleString("es-CO")}
                    </td>
                  </tr>
                );
              })}
              {asientosConSaldo.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-gray-300 text-[10px] uppercase tracking-widest font-semibold">
                    Sin movimientos en este libro / período
                  </td>
                </tr>
              )}
            </tbody>
            {asientosConSaldo.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/50">
                  <td colSpan={4} className="px-5 py-4 font-semibold text-gray-500 uppercase text-[10px] tracking-widest">Totales del período</td>
                  <td className="px-5 py-4 text-right font-bold text-gray-800 text-[11px]">${totalDebito.toLocaleString("es-CO")}</td>
                  <td className="px-5 py-4 text-right font-bold text-gray-500 text-[11px]">${totalCredito.toLocaleString("es-CO")}</td>
                  <td className={`px-5 py-4 text-right font-bold text-[12px] ${saldoFinal >= 0 ? "text-gray-900" : "text-rose-600"}`}>
                    ${saldoFinal.toLocaleString("es-CO")}
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
