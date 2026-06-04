"use client";
import { useState, useEffect, useRef } from "react";
import {
  FiUnlock, FiCalendar, FiPlusCircle,
  FiMinusCircle, FiX, FiPrinter, FiLock
} from "react-icons/fi";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig } from "../../lib/empresaStorage";

export default function CierreCajaPage() {
  const { branch } = useAuth();
  const branchId   = branch?.id || "";

  const [mounted, setMounted]           = useState(false);
  const [isResumenOpen, setIsResumenOpen] = useState(false);
  const [cierreViendo, setCierreViendo]  = useState<any>(null);
  const [periodoTabla, setPeriodoTabla]  = useState("Diario");
  const [fechaBase, setFechaBase]        = useState(new Date().toLocaleDateString("en-CA"));
  const [periodoResumen, setPeriodoResumen] = useState("Diario");
  const [efectivoFisico, setEfectivoFisico] = useState("");
  const [turnoActivo, setTurnoActivo]    = useState<any>(null);
  const [historial, setHistorial]        = useState<any[]>([]);
  const [cxpPasivos, setCxpPasivos]      = useState<any[]>([]);
  const [movimientos, setMovimientos]    = useState<any[]>([]);
  const [egresosAPI,  setEgresosAPI]     = useState<any[]>([]);
  const [otrosRecaudos, setOtrosRecaudos] = useState<any[]>([]);
  const [preFacturas,   setPreFacturas]   = useState<any[]>([]);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Modal apertura turno
  const [modalApertura, setModalApertura] = useState(false);
  const [aperResponsable, setAperResponsable] = useState("");
  const [aperBase, setAperBase]           = useState("0");

  useEffect(() => {
    setMounted(true);
    const turnoKey = `turno_actual_${branchId}`;
    // Migración única: si existe la clave genérica y no la específica, migrar y limpiar
    const legacy = localStorage.getItem("turno_actual");
    const especifico = localStorage.getItem(turnoKey);
    if (legacy && !especifico) {
      localStorage.setItem(turnoKey, legacy);
      localStorage.removeItem("turno_actual");
    }
    const sesion = localStorage.getItem(turnoKey);
    if (sesion) setTurnoActivo(JSON.parse(sesion));
    const cfg = getEmpresaConfig();
    if (cfg.baseCaja) setAperBase(String(cfg.baseCaja));

    // Cargar pasivos CXP desde API
    if (branchId) {
      api.get(`/branches/${branchId}/pasivos`)
        .then(({ data }) => setCxpPasivos(data.data || []))
        .catch(() => setCxpPasivos(JSON.parse(localStorage.getItem("cxp_datos") || "[]")));
    }

    // Cargar historial desde API si hay sesión, sino desde localStorage
    if (branchId) {
      api.get(`/branches/${branchId}/cierres`)
        .then(({ data }) => {
          const lista = data.data || [];
          if (lista.length > 0) {
            setHistorial(lista);
            localStorage.setItem("historial_cierres", JSON.stringify(lista));
          } else {
            const h = localStorage.getItem("historial_cierres");
            if (h) setHistorial(JSON.parse(h));
          }
        })
        .catch(() => {
          const h = localStorage.getItem("historial_cierres");
          if (h) setHistorial(JSON.parse(h));
        });
    } else {
      const h = localStorage.getItem("historial_cierres");
      if (h) setHistorial(JSON.parse(h));
    }

    // Ventas siempre desde API — localStorage es compartido entre empresas
    if (branchId) {
      api.get(`/branches/${branchId}/ventas`)
        .then(({ data }) => {
          const ventas = (data.data || []).map((v: any) => ({
            ...v, id: v._id, fecha: v.createdAt || v.fecha, categoria: "ingreso",
          }));
          setMovimientos(ventas);
        })
        .catch(() => setMovimientos([]));

      api.get(`/branches/${branchId}/recaudos`)
        .then(({ data }) => setOtrosRecaudos(data.data || []))
        .catch(() => setOtrosRecaudos([]));

      api.get(`/branches/${branchId}/pre-facturas`)
        .then(({ data }) => setPreFacturas(data.data || []))
        .catch(() => setPreFacturas([]));

      api.get(`/branches/${branchId}/egresos`)
        .then(({ data }) => {
          const lista = (data.data || []).map((e: any) => ({
            ...e, id: e._id, categoria: "egreso", nroFactura: e.nroDoc,
            fecha: e.createdAt || e.fechaISO || e.fecha,
          }));
          setEgresosAPI(lista);
        })
        .catch(() => setEgresosAPI([]));
    }
  }, [branchId]);

  if (!mounted) return null;

  // ─── RANGO PARA TABLA DE HISTORIAL ───────────────────────────────────────
  const getTablaRange = () => {
    const d = new Date(fechaBase + "T12:00:00");
    const inicio = new Date(d); inicio.setHours(0, 0, 0, 0);
    const fin    = new Date(d); fin.setHours(23, 59, 59, 999);
    if (periodoTabla === "Semanal") {
      const day = d.getDay();
      inicio.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      fin.setTime(inicio.getTime()); fin.setDate(inicio.getDate() + 6);
    } else if (periodoTabla === "Quincenal") {
      if (d.getDate() <= 15) { inicio.setDate(1); fin.setDate(15); }
      else { inicio.setDate(16); fin.setMonth(d.getMonth() + 1, 0); }
    } else if (periodoTabla === "Mensual") {
      inicio.setDate(1); fin.setMonth(d.getMonth() + 1, 0);
    } else if (periodoTabla === "Anual") {
      inicio.setMonth(0, 1); fin.setMonth(11, 31);
    }
    fin.setHours(23, 59, 59, 999);
    return { inicio, fin };
  };

  const { inicio: tablaInicio, fin: tablaFin } = getTablaRange();
  const tablaLabel =
    periodoTabla === "Diario"
      ? fechaBase
      : `${tablaInicio.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })} – ${tablaFin.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}`;

  const historialFiltrado = historial.filter(reg => {
    if (!reg.fechaCierre) return false;
    const f = new Date(reg.fechaCierre);
    return f >= tablaInicio && f <= tablaFin;
  });

  // ─── CÁLCULO DE RESUMEN PARA TURNO ACTIVO ────────────────────────────────
  const getPeriodoInicio = (p: string): Date => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (p === "Semanal") {
      const dia = hoy.getDay();
      hoy.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
    } else if (p === "Quincenal") {
      hoy.setDate(hoy.getDate() <= 15 ? 1 : 16);
    } else if (p === "Mensual") {
      hoy.setDate(1);
    } else if (p === "Anual") {
      hoy.setMonth(0, 1);
    }
    return hoy;
  };

  const computarRangoFacturas = (nros: string[]) => {
    const todos = nros.filter(Boolean);
    if (!todos.length) return null;
    const getNum = (n: string) => parseInt(n.replace(/\D/g, "")) || 0;
    const getPref = (n: string) => n.match(/^[A-Z]+-?/)?.[0]?.replace(/-$/, "") || "?";
    const sorted = [...todos].sort((a, b) => getNum(a) - getNum(b));
    const grupos: Record<string, number> = {};
    todos.forEach(n => { const p = getPref(n); grupos[p] = (grupos[p] || 0) + 1; });
    const prefijos = Object.keys(grupos);
    let rangoStr: string;
    if (prefijos.length === 1) {
      rangoStr = sorted[0] === sorted[sorted.length - 1] ? sorted[0] : `${sorted[0]} → ${sorted[sorted.length - 1]}`;
    } else {
      const min = getNum(sorted[0]); const max = getNum(sorted[sorted.length - 1]);
      rangoStr = min === max ? `#${min}` : `#${min} → #${max}`;
    }
    const desglose = prefijos.length > 1 ? Object.entries(grupos).map(([p, c]) => `${p}: ${c}`).join(" · ") : "";
    return { total: todos.length, rangoStr, desglose };
  };

  const sum = (arr: any[], campo: string) =>
    arr.reduce((acc: number, x: any) => acc + (Number(x[campo]) || 0), 0);
  const esMedioPago = (m: any, pago: string) =>
    (m.medioPago || "").toUpperCase() === pago.toUpperCase();

  const bancos: string[] = JSON.parse(
    localStorage.getItem("lista_bancos") || '["NEQUI","BANCOLOMBIA","DAVIPLATA"]'
  );
  const todosMovs   = [...movimientos, ...egresosAPI];
  const otrosRecaud = otrosRecaudos;

  // Filtrar estrictamente desde la apertura del turno activo
  const inicioTurno: Date = (() => {
    const tryParse = (s: string | undefined) => {
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };
    // Si hay turno activo pero la fecha no parsea, incluir todo (new Date(0))
    // así las ventas de días anteriores no se pierden
    return tryParse(turnoActivo?.fechaAperturaISO)
        ?? tryParse(turnoActivo?.fechaApertura)
        ?? (turnoActivo ? new Date(0) : getPeriodoInicio("Diario"));
  })();
  const enPeriodo = (fecha: string) => { const d = new Date(fecha); return !isNaN(d.getTime()) && d >= inicioTurno; };

  const ventasHoy       = todosMovs.filter((m: any) => m.categoria === "ingreso" && enPeriodo(m.fecha));
  const egresosHoyLista = todosMovs.filter((m: any) =>
    m.categoria === "egreso" &&
    m.tipo !== "CXP" &&
    !String(m.nroFactura || m.nroDoc || "").startsWith("CXP-") && // excluir abonos CXP ya contados en cxpTotal
    enPeriodo(m.fecha)
  );
  // Excluir DESCUENTO_NOMINA: no representa efectivo real, solo cruce contable
  const ingresosHoy = otrosRecaud.filter((r: any) =>
    enPeriodo(r.fechaISO || (r.fecha + "T00:00:00")) &&
    r.medioPago !== "DESCUENTO_NOMINA"
  );

  // Pagos CXP del turno — agrupados por proveedor + medio de pago
  const cxpRaw: { proveedor: string; monto: number; medioPago: string }[] = [];
  cxpPasivos.forEach((deuda: any) => {
    (deuda.pagos || []).forEach((pg: any) => {
      if (enPeriodo(pg.fecha))
        cxpRaw.push({ proveedor: deuda.proveedor, monto: pg.monto, medioPago: pg.medioPago || "EFECTIVO" });
    });
  });
  const cxpPagosTurno = Object.values(
    cxpRaw.reduce((acc: any, p) => {
      const key = `${p.proveedor}|${p.medioPago}`;
      if (!acc[key]) acc[key] = { proveedor: p.proveedor, medioPago: p.medioPago, monto: 0 };
      acc[key].monto += p.monto;
      return acc;
    }, {})
  ) as { proveedor: string; monto: number; medioPago: string }[];
  const cxpTotal = cxpPagosTurno.reduce((a: number, p: any) => a + p.monto, 0);

  // Suma por medio: si pagos > valor es billete con cambio → usar valor (ingreso real)
  //                 si pagos ≤ valor → usar pagos (ej: saldo PF $200 de una factura $410k)
  const sumPorMedio = (movs: any[], medio: string): number =>
    movs.reduce((acc, m) => {
      if (m.pagos && m.pagos.length > 0) {
        const pagosMedio = m.pagos
          .filter((p: any) => (p.medio || "").toUpperCase() === medio.toUpperCase())
          .reduce((s: number, p: any) => s + (parseFloat(p.monto) || 0), 0);
        if (pagosMedio <= 0) return acc;
        const valorFactura = Number(m.valor) || 0;
        const efectivo = pagosMedio <= valorFactura ? pagosMedio : valorFactura;
        return acc + efectivo;
      }
      return esMedioPago(m, medio) ? acc + (Number(m.valor) || 0) : acc;
    }, 0);

  // ── Pre-Facturas del período: solo las PENDIENTES (las ya entregadas pasan a ventas como FR) ──
  const anticiposHoy = preFacturas.filter((pf: any) =>
    enPeriodo(pf.createdAt || pf.fecha) && pf.estado === "PENDIENTE"
  );
  const pfPorMedio   = (medio: string) =>
    anticiposHoy.reduce((s: number, pf: any) =>
      s + (pf.pagos || []).filter((p: any) => p.medio === medio)
                          .reduce((a: number, p: any) => a + (Number(p.monto) || 0), 0), 0);
  const pfAbonosPorMedio = (medio: string) =>
    anticiposHoy.reduce((s: number, pf: any) =>
      s + (pf.abonos || []).filter((a: any) => a.medio === medio && enPeriodo(a.fecha))
                           .reduce((a: number, ab: any) => a + (Number(ab.monto) || 0), 0), 0);
  const pfEfectivo = pfPorMedio("EFECTIVO") + pfAbonosPorMedio("EFECTIVO");
  const pfBancos   = bancos
    .map(b => ({ banco: b, total: pfPorMedio(b) + pfAbonosPorMedio(b) }))
    .filter(b => b.total > 0);
  const pfTotal    = pfEfectivo + pfBancos.reduce((s, b) => s + b.total, 0);

  const baseTurno  = Number(turnoActivo?.baseCaja) || 0;
  // Efectivo y bancos = solo facturas FR (PF se muestra por separado)
  const vEfectivo = sumPorMedio(ventasHoy, "EFECTIVO");
  const vCredito  = sum(ventasHoy.filter((v: any) => esMedioPago(v, "CRÉDITO")), "valor");
  const oEfectivo = sum(ingresosHoy.filter((i: any) => esMedioPago(i, "EFECTIVO")), "valor");
  const eTotal    = sum(egresosHoyLista, "valor") + cxpTotal;

  const ventasPorBanco = bancos
    .map(b => ({ banco: b, total: sumPorMedio(ventasHoy, b) }))
    .filter(b => b.total > 0);

  const otroPorBanco = bancos
    .map(b => ({ banco: b, total: sum(ingresosHoy.filter((i: any) => esMedioPago(i, b)), "valor") }))
    .filter(b => b.total > 0);

  const gastosTotal    = sum(egresosHoyLista.filter((e: any) => (e.tipo || "GASTO") === "GASTO"), "valor");
  const comprasTotal   = sum(egresosHoyLista.filter((e: any) => e.tipo === "INVENTARIO" || e.esInventario), "valor");
  const prestamosTotal = sum(egresosHoyLista.filter((e: any) => e.tipo === "PRESTAMO"), "valor");
  const cambiosTotal   = sum(egresosHoyLista.filter((e: any) => e.tipo === "CAMBIO"), "valor");

  const ventasActivas  = ventasHoy.filter((m: any) => m.estado !== "ANULADA");
  // Ventas Netas = subtotal - descuento (lo que realmente se vendió sin recargos)
  const vSubtotal   = ventasActivas.reduce((a: number, m: any) => {
    const sub  = Number(m.subtotal)  || (m.valor - (Number(m.propina)||0) - (Number(m.impuesto)||0) - (Number(m.envio)||0));
    const desc = Number(m.descuento) || 0;
    return a + sub - desc;
  }, 0);
  const vImpuestos  = ventasActivas.reduce((a: number, m: any) => a + (Number(m.impuesto) || 0), 0);
  const vPropinas   = ventasActivas.reduce((a: number, m: any) => a + (Number(m.propina)  || 0), 0);
  const vDomicilios = ventasActivas.reduce((a: number, m: any) => a + (Number(m.envio)    || 0), 0);

  const resumenActivo = {
    base:    baseTurno,
    anticiposPF: { total: pfTotal, efectivo: pfEfectivo, porBanco: pfBancos },
    ventas:  { total: sum(ventasHoy, "valor"), efectivo: vEfectivo, credito: vCredito, porBanco: ventasPorBanco,
               subtotal: vSubtotal, impuestos: vImpuestos, propinas: vPropinas, domicilios: vDomicilios },
    otros:   {
      total:    sum(ingresosHoy, "valor"),
      efectivo: oEfectivo,
      porBanco: otroPorBanco,
      detalle:  ingresosHoy.map((i: any) => ({
        tercero:   (i.tercero  || "SIN NOMBRE").toUpperCase().trim(),
        valor:     Number(i.valor) || 0,
        medioPago: (i.medioPago || "EFECTIVO").toUpperCase().trim(),
      })),
    },
    egresos: { total: eTotal, gastos: gastosTotal, compras: comprasTotal, prestamos: prestamosTotal, cambios: cambiosTotal, cxp: cxpTotal, cxpDetalle: cxpPagosTurno, lista: egresosHoyLista },
    esperado: baseTurno + (vEfectivo + pfEfectivo + oEfectivo) - eTotal,
  };

  const diferencia = (parseFloat(efectivoFisico) || 0) - resumenActivo.esperado;

  // ─── IMPRESIÓN ───────────────────────────────────────────────────────────
  const imprimirCierre = (reg: any) => {
    const emp = getEmpresaConfig();
    const snap = reg.snapshot;
    const cuadrada = reg.estado === "CUADRADA";
    const fila = (label: string, valor: number, color = "#333", indent = false) =>
      `<tr><td style="padding:4px 8px;color:#666;font-size:11px;${indent ? "padding-left:20px" : ""}">${label}</td>
       <td style="padding:4px 8px;text-align:right;font-size:11px;color:${color};font-weight:bold">$${valor.toLocaleString("es-CO")}</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Cierre de Caja</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;padding:20px 28px;color:#222;font-size:12px;max-width:780px;margin:auto}
  h1{font-size:16px;font-weight:900;text-align:center;text-transform:uppercase;letter-spacing:2px;margin-bottom:2px}
  .sub{text-align:center;font-size:10px;color:#666;margin-bottom:12px}
  .divider{border:none;border-top:1px dashed #bbb;margin:10px 0}
  .section{margin-bottom:14px}
  .section-title{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eee}
  table{width:100%;border-collapse:collapse}
  .total-row td{font-weight:900;font-size:13px;padding:6px 8px;border-top:2px solid #ddd}
  .estado{display:inline-block;padding:4px 14px;border-radius:20px;font-weight:900;font-size:11px;
          background:${cuadrada ? "#d1fae5" : "#fee2e2"};color:${cuadrada ? "#065f46" : "#991b1b"}}
  .arqueo{background:#1e293b;color:#fff;border-radius:12px;padding:14px 16px;margin-top:14px}
  .arqueo td{color:#fff;font-size:12px;padding:4px 8px}
  .arqueo .lbl{color:#94a3b8;font-size:10px}
  @media print{body{padding:10px 16px}@page{margin:12mm 10mm;size:A4}}
</style></head><body>
<h1>${emp.nombreEmpresa || "MI EMPRESA"}</h1>
<div class="sub">NIT: ${emp.nit || "—"} &nbsp;|&nbsp; Tel: ${emp.telefono || "—"}<br>${emp.direccion || ""}</div>
<hr class="divider">
<div style="text-align:center;margin-bottom:12px">
  <div style="font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:1px">Cierre de Caja</div>
  <div style="font-size:10px;color:#666;margin-top:4px">
    Responsable: <strong>${reg.responsable || "—"}</strong>
  </div>
  <div style="font-size:10px;color:#666">Apertura: ${reg.fechaApertura || "—"}</div>
  <div style="font-size:10px;color:#666">Cierre: ${new Date(reg.fechaCierre).toLocaleString("es-CO")}</div>
  <div style="margin-top:8px"><span class="estado">${reg.estado}</span></div>
</div>
<hr class="divider">

${(snap?.base ?? 0) > 0 ? `
<div class="section">
  <div class="section-title">Base de Caja (Apertura)</div>
  <table>
    <tr><td style="padding:4px 8px;font-size:11px;color:#666">Base inicial del turno</td>
        <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:bold">$${(snap.base).toLocaleString("es-CO")}</td></tr>
  </table>
</div>` : ""}

<div class="section">
  <div class="section-title">Ingresos por Ventas</div>
  <table>
    ${(() => {
      const vEf = snap?.ventas?.efectivo ?? 0;
      const pfEf = snap?.anticiposPF?.efectivo ?? 0;
      const tot = vEf + pfEf;
      const nota = pfEf > 0 ? ` (+$${pfEf.toLocaleString("es-CO")} anticipos)` : "";
      return tot > 0 ? `<tr><td style="padding:4px 8px;font-size:11px;color:#666">Efectivo${nota}</td>
        <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:bold">$${tot.toLocaleString("es-CO")}</td></tr>` : "";
    })()}
    ${(() => {
      const bancosFR = snap?.ventas?.porBanco ?? [];
      const bancosPF = snap?.anticiposPF?.porBanco ?? [];
      const todos = [...new Set([...bancosFR.map((b:any)=>b.banco), ...bancosPF.map((b:any)=>b.banco)])];
      return todos.map(banco => {
        const fr  = bancosFR.find((b:any)=>b.banco===banco)?.total ?? 0;
        const pf  = bancosPF.find((b:any)=>b.banco===banco)?.total ?? 0;
        const tot = fr + pf;
        const nota = pf > 0 ? ` (+$${pf.toLocaleString("es-CO")} anticipos)` : "";
        return tot > 0 ? `<tr><td style="padding:4px 8px;font-size:11px;color:#666">${banco}${nota}</td>
         <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:bold">$${tot.toLocaleString("es-CO")}</td></tr>` : "";
      }).join("");
    })()}
    ${(snap?.ventas?.credito ?? 0) > 0
      ? `<tr><td style="padding:4px 8px;font-size:11px;color:#d97706">Crédito (pendiente cobro)</td>
         <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:bold;color:#d97706">$${(snap.ventas.credito).toLocaleString("es-CO")}</td></tr>`
      : ""}
    <tr class="total-row"><td>Total Facturación</td><td style="text-align:right;color:#16a34a">$${(snap?.ventas?.total ?? 0).toLocaleString("es-CO")}</td></tr>
  </table>
  ${(snap?.ventas?.total ?? 0) > 0 ? `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-top:6px">
    <div style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Composición</div>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:1px 0;font-size:10px;color:#475569">Ventas Netas</td><td style="text-align:right;font-size:10px;font-weight:bold;color:#475569">$${(snap?.ventas?.subtotal ?? 0).toLocaleString("es-CO")}</td></tr>
      ${(snap?.ventas?.domicilios ?? 0) > 0 ? `<tr><td style="padding:1px 0;font-size:10px;color:#475569">Domicilios</td><td style="text-align:right;font-size:10px;font-weight:bold;color:#475569">$${snap.ventas.domicilios.toLocaleString("es-CO")}</td></tr>` : ""}
      ${(snap?.ventas?.propinas   ?? 0) > 0 ? `<tr><td style="padding:1px 0;font-size:10px;color:#475569">Propinas</td><td style="text-align:right;font-size:10px;font-weight:bold;color:#475569">$${snap.ventas.propinas.toLocaleString("es-CO")}</td></tr>` : ""}
      ${(snap?.ventas?.impuestos  ?? 0) > 0 ? `<tr><td style="padding:1px 0;font-size:10px;color:#475569">Impuestos</td><td style="text-align:right;font-size:10px;font-weight:bold;color:#475569">$${snap.ventas.impuestos.toLocaleString("es-CO")}</td></tr>` : ""}
    </table>
  </div>` : ""}
</div>

${(snap?.otros?.total ?? 0) > 0 ? `
<div class="section">
  <div class="section-title">Otros Ingresos (Recaudos)</div>
  <table>
    <tr><td style="padding:4px 8px;font-size:11px;color:#666">Efectivo</td>
        <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:bold">$${(snap?.otros?.efectivo ?? 0).toLocaleString("es-CO")}</td></tr>
    ${(snap?.otros?.detalle ?? []).filter((d: any) => d.medioPago === "EFECTIVO").map((d: any) =>
      `<tr><td style="padding:2px 8px 2px 22px;font-size:10px;color:#999">↳ ${d.tercero}</td>
       <td style="padding:2px 8px;text-align:right;font-size:10px;color:#999">$${Number(d.valor).toLocaleString("es-CO")}</td></tr>`
    ).join("")}
    ${(snap?.otros?.porBanco ?? []).map((b: any) =>
      `<tr><td style="padding:4px 8px;font-size:11px;color:#666">${b.banco}</td>
       <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:bold">$${b.total.toLocaleString("es-CO")}</td></tr>
       ${(snap?.otros?.detalle ?? []).filter((d: any) => d.medioPago === b.banco).map((d: any) =>
         `<tr><td style="padding:2px 8px 2px 22px;font-size:10px;color:#999">↳ ${d.tercero}</td>
          <td style="padding:2px 8px;text-align:right;font-size:10px;color:#999">$${Number(d.valor).toLocaleString("es-CO")}</td></tr>`
       ).join("")}`
    ).join("")}
    <tr class="total-row"><td>Total Recaudos</td><td style="text-align:right;color:#2563eb">$${(snap?.otros?.total ?? 0).toLocaleString("es-CO")}</td></tr>
  </table>
</div>` : ""}

${(snap?.egresos?.total ?? 0) > 0 ? `
<div class="section">
  <div class="section-title">Egresos</div>
  <table>
    ${(snap?.egresos?.gastos ?? 0) > 0 ? `
      ${fila("Gastos Operativos", snap.egresos.gastos, "#dc2626")}
      ${(snap?.egresos?.lista ?? []).filter((e: any) => (e.tipo || "GASTO") === "GASTO").map((e: any) =>
        `<tr><td style="padding:2px 8px 2px 22px;font-size:10px;color:#999">↳ ${e.proveedor || "—"}${e.concepto ? " · " + e.concepto : ""}</td>
         <td style="padding:2px 8px;text-align:right;font-size:10px;color:#999">$${Number(e.valor).toLocaleString("es-CO")}</td></tr>`
      ).join("")}` : ""}
    ${(snap?.egresos?.compras ?? 0) > 0 ? `
      ${fila("Compras / Inventario", snap.egresos.compras, "#dc2626")}
      ${(snap?.egresos?.lista ?? []).filter((e: any) => e.tipo === "INVENTARIO" || e.esInventario).map((e: any) =>
        `<tr><td style="padding:2px 8px 2px 22px;font-size:10px;color:#999">↳ ${e.proveedor || "—"}</td>
         <td style="padding:2px 8px;text-align:right;font-size:10px;color:#999">$${Number(e.valor).toLocaleString("es-CO")}</td></tr>`
      ).join("")}` : ""}
    ${(snap?.egresos?.prestamos ?? 0) > 0 ? `
      ${fila("Préstamos / Anticipos", snap.egresos.prestamos, "#dc2626")}
      ${(snap?.egresos?.lista ?? []).filter((e: any) => e.tipo === "PRESTAMO").map((e: any) =>
        `<tr><td style="padding:2px 8px 2px 22px;font-size:10px;color:#999">↳ ${e.proveedor || "—"}${e.concepto ? " · " + e.concepto : ""}</td>
         <td style="padding:2px 8px;text-align:right;font-size:10px;color:#999">$${Number(e.valor).toLocaleString("es-CO")}</td></tr>`
      ).join("")}` : ""}
    ${(snap?.egresos?.cambios ?? 0) > 0 ? `
      ${fila("Cambios de Efectivo", snap.egresos.cambios, "#6b7280")}
      ${(snap?.egresos?.lista ?? []).filter((e: any) => e.tipo === "CAMBIO").map((e: any) =>
        `<tr><td style="padding:2px 8px 2px 22px;font-size:10px;color:#999">↳ ${e.concepto}</td>
         <td style="padding:2px 8px;text-align:right;font-size:10px;color:#999">$${Number(e.valor).toLocaleString("es-CO")}</td></tr>`
      ).join("")}` : ""}
    ${(snap?.egresos?.cxp ?? 0) > 0 ? `
      ${fila("Pagos Proveedores (CXP)", snap.egresos.cxp, "#dc2626")}
      ${(snap?.egresos?.cxpDetalle ?? []).map((d: any) =>
        `<tr><td style="padding:2px 8px 2px 22px;font-size:10px;color:#999">↳ ${d.proveedor} · ${d.medioPago}</td>
         <td style="padding:2px 8px;text-align:right;font-size:10px;color:#999">$${Number(d.monto).toLocaleString("es-CO")}</td></tr>`
      ).join("")}` : ""}
    <tr class="total-row"><td>Total Egresos</td><td style="text-align:right;color:#dc2626">$${(snap?.egresos?.total ?? 0).toLocaleString("es-CO")}</td></tr>
  </table>
</div>` : ""}

<div class="arqueo">
  <table>
    <tr><td class="lbl">Efectivo esperado en caja</td>
        <td style="text-align:right;font-size:14px;font-weight:900">$${(snap?.esperado ?? 0).toLocaleString("es-CO")}</td></tr>
    <tr><td class="lbl">Efectivo físico contado</td>
        <td style="text-align:right;font-size:14px;font-weight:900">$${(snap?.efectivoFisico ?? 0).toLocaleString("es-CO")}</td></tr>
    <tr style="border-top:1px solid #334155">
      <td class="lbl" style="padding-top:8px">Diferencia</td>
      <td style="text-align:right;font-size:16px;font-weight:900;padding-top:8px;color:${(snap?.diferencia ?? 0) === 0 ? "#4ade80" : "#f87171"}">
        $${(snap?.diferencia ?? 0).toLocaleString("es-CO")}
      </td>
    </tr>
  </table>
</div>
<script>window.print();window.close();</script>
</body></html>`;

    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
  };

  // ─── IMPRESIÓN TÉRMICA 80mm ───────────────────────────────────────────────
  const imprimirCierreTermico = (reg: any) => {
    const emp  = getEmpresaConfig();
    const snap = reg.snapshot;
    const dif  = snap?.diferencia ?? 0;
    const row  = (lbl: string, val: number, bold = false) =>
      `<div class="row${bold ? " bold" : ""}"><span>${lbl}</span><span>$${val.toLocaleString("es-CO")}</span></div>`;
    const sub  = (lbl: string, val: number) =>
      `<div class="row sub"><span>↳ ${lbl}</span><span>$${val.toLocaleString("es-CO")}</span></div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;width:80mm;max-width:80mm;padding:3mm 4mm;font-size:10px;color:#000}
  .c{text-align:center}.bold{font-weight:bold}.big{font-size:13px;font-weight:bold}
  .hr{border:none;border-top:1px dashed #000;margin:5px 0}
  .row{display:flex;justify-content:space-between;margin:2px 0;font-size:10px}
  .row.bold{font-weight:bold;font-size:11px}
  .sub{padding-left:8px;font-size:9px;color:#555}
  .sec{font-weight:bold;text-transform:uppercase;margin:4px 0 2px;font-size:9px;letter-spacing:1px}
  .box{border:1px solid #000;padding:5px 6px;margin-top:6px}
  @media print{@page{margin:0;size:80mm auto}body{padding:2mm}}
</style></head><body>
<div class="c bold" style="font-size:13px">${emp.nombreEmpresa || "MI EMPRESA"}</div>
${emp.nit ? `<div class="c" style="font-size:9px">NIT: ${emp.nit}</div>` : ""}
${emp.telefono ? `<div class="c" style="font-size:9px">Tel: ${emp.telefono}</div>` : ""}
${emp.direccion ? `<div class="c" style="font-size:9px">${emp.direccion}</div>` : ""}
<div class="hr"></div>
<div class="c bold">CIERRE DE CAJA</div>
<div class="c" style="font-size:9px">Responsable: ${reg.responsable || "—"}</div>
<div class="c" style="font-size:9px">Apertura: ${reg.fechaApertura || "—"}</div>
<div class="c" style="font-size:9px">Cierre: ${new Date(reg.fechaCierre).toLocaleString("es-CO")}</div>
<div class="hr"></div>

${(snap?.base ?? 0) > 0 ? `
<div class="sec">Base Inicial</div>
${row("Base apertura", snap.base)}
<div class="hr"></div>` : ""}

<div class="sec">Ingresos por Ventas</div>
${(() => {
  const vEf  = snap?.ventas?.efectivo ?? 0;
  const pfEf = snap?.anticiposPF?.efectivo ?? 0;
  const tot  = vEf + pfEf;
  const nota = pfEf > 0 ? ` (+$${pfEf.toLocaleString("es-CO")} anticipos)` : "";
  return tot > 0 ? row(`Efectivo${nota}`, tot) : "";
})()}
${(() => {
  const bancosFR = snap?.ventas?.porBanco ?? [];
  const bancosPF = snap?.anticiposPF?.porBanco ?? [];
  const todos = [...new Set([...bancosFR.map((b:any)=>b.banco), ...bancosPF.map((b:any)=>b.banco)])];
  return todos.map(banco => {
    const fr  = bancosFR.find((b:any)=>b.banco===banco)?.total ?? 0;
    const pf  = bancosPF.find((b:any)=>b.banco===banco)?.total ?? 0;
    const tot = fr + pf;
    const nota = pf > 0 ? ` (+$${pf.toLocaleString("es-CO")} anticipos)` : "";
    return tot > 0 ? row(`${banco}${nota}`, tot) : "";
  }).join("");
})()}
${(snap?.ventas?.credito ?? 0) > 0 ? row("Crédito (x cobrar)", snap.ventas.credito) : ""}
${row("TOTAL FACTURACIÓN", snap?.ventas?.total ?? 0, true)}
${(snap?.ventas?.total ?? 0) > 0 ? `<div style="border:1px dashed #ccc;padding:3px 5px;margin:3px 0;font-size:9px">
  <div style="font-weight:bold;margin-bottom:2px">COMPOSICIÓN:</div>
  ${sub("Ventas Netas", snap?.ventas?.subtotal ?? 0)}
  ${(snap?.ventas?.domicilios ?? 0) > 0 ? sub("Domicilios", snap.ventas.domicilios) : ""}
  ${(snap?.ventas?.propinas   ?? 0) > 0 ? sub("Propinas",   snap.ventas.propinas)   : ""}
  ${(snap?.ventas?.impuestos  ?? 0) > 0 ? sub("Impuestos",  snap.ventas.impuestos)  : ""}
</div>` : ""}

${(snap?.otros?.total ?? 0) > 0 ? `
<div class="hr"></div>
<div class="sec">Otros Ingresos</div>
${row("Efectivo", snap?.otros?.efectivo ?? 0)}
${(snap?.otros?.detalle ?? []).filter((d: any) => d.medioPago === "EFECTIVO").map((d: any) => sub(d.tercero, d.valor)).join("")}
${(snap?.otros?.porBanco ?? []).map((b: any) =>
  row(b.banco, b.total) +
  (snap?.otros?.detalle ?? []).filter((d: any) => d.medioPago === b.banco).map((d: any) => sub(d.tercero, d.valor)).join("")
).join("")}
${row("TOTAL RECAUDOS", snap?.otros?.total ?? 0, true)}` : ""}

${(snap?.egresos?.total ?? 0) > 0 ? `
<div class="hr"></div>
<div class="sec">Egresos</div>
${(snap?.egresos?.gastos ?? 0) > 0 ? row("Gastos Operativos", snap.egresos.gastos) +
  (snap?.egresos?.lista ?? []).filter((e: any) => (e.tipo||"GASTO")==="GASTO").map((e: any) => sub((e.proveedor||"—") + (e.concepto?" · "+e.concepto:""), e.valor)).join("") : ""}
${(snap?.egresos?.compras ?? 0) > 0 ? row("Compras/Inventario", snap.egresos.compras) +
  (snap?.egresos?.lista ?? []).filter((e: any) => e.tipo==="INVENTARIO"||e.esInventario).map((e: any) => sub(e.proveedor||"—", e.valor)).join("") : ""}
${(snap?.egresos?.prestamos ?? 0) > 0 ? row("Préstamos", snap.egresos.prestamos) +
  (snap?.egresos?.lista ?? []).filter((e: any) => e.tipo==="PRESTAMO").map((e: any) => sub(e.proveedor||"—", e.valor)).join("") : ""}
${(snap?.egresos?.cambios ?? 0) > 0 ? row("Cambios Efectivo", snap.egresos.cambios) +
  (snap?.egresos?.lista ?? []).filter((e: any) => e.tipo==="CAMBIO").map((e: any) => sub(e.concepto, e.valor)).join("") : ""}
${(snap?.egresos?.cxp ?? 0) > 0 ? row("Pagos Proveedores", snap.egresos.cxp) +
  (snap?.egresos?.cxpDetalle ?? []).map((d: any) => sub(d.proveedor+" · "+d.medioPago, d.monto)).join("") : ""}
${row("TOTAL EGRESOS", snap?.egresos?.total ?? 0, true)}` : ""}

<div class="hr"></div>
<div class="box">
  ${row("Efectivo esperado", snap?.esperado ?? 0)}
  ${row("Efectivo contado", snap?.efectivoFisico ?? 0)}
  <div class="hr"></div>
  <div class="row big" style="color:${dif === 0 ? "#000" : dif > 0 ? "#000" : "#000"}">
    <span>DIFERENCIA</span><span>${dif >= 0 ? "+" : ""}$${dif.toLocaleString("es-CO")}</span>
  </div>
</div>
<div class="hr"></div>
<div class="c" style="font-size:9px;margin-top:4px">*** ${reg.estado} ***</div>
<script>window.print();window.close();</script>
</body></html>`;

    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
  };

  // ─── ACCIONES ────────────────────────────────────────────────────────────
  const finalizarCierre = async () => {
    if (!efectivoFisico) return toast("warning", "Ingrese el efectivo físico");
    const ef = parseFloat(efectivoFisico);
    const nuevoRegistro = {
      fechaApertura:    turnoActivo?.fechaApertura,
      fechaAperturaISO: turnoActivo?.fechaAperturaISO,
      responsable:      turnoActivo?.responsable,
      fechaCierre:      new Date().toISOString(),
      baseCaja:         turnoActivo?.baseCaja || 0,
      valor:            ef,
      estado:           diferencia === 0 ? "CUADRADA" : "DESCUADRADA",
      snapshot:         { ...resumenActivo, diferencia, efectivoFisico: ef,
                          facturaInfo: computarRangoFacturas(ventasHoy.map((v: any) => v.nroFactura)) },
    };

    // Guardar en MongoDB
    if (branchId) {
      try {
        await api.post(`/branches/${branchId}/cierres`, nuevoRegistro);
      } catch { /* continuar aunque falle el API */ }
    }

    // Puente localStorage
    const hPrevio = JSON.parse(localStorage.getItem("historial_cierres") || "[]");
    const nuevoHistorial = [nuevoRegistro, ...hPrevio];
    localStorage.setItem("historial_cierres", JSON.stringify(nuevoHistorial));
    localStorage.removeItem(`turno_actual_${branchId}`);
    localStorage.removeItem("turno_actual"); // limpiar clave legacy
    setTurnoActivo(null);
    setHistorial(nuevoHistorial);
    setIsResumenOpen(false);
    setCierreViendo(null);
    setEfectivoFisico("");
    imprimirCierre(nuevoRegistro);
  };

  const abrirDrawer = (reg: any | null) => {
    setCierreViendo(reg);
    setIsResumenOpen(true);
    // Refrescar preFacturas al abrir el resumen activo para capturar anticipos recientes
    if (!reg && branchId) {
      api.get(`/branches/${branchId}/pre-facturas`)
        .then(({ data }) => setPreFacturas(data.data || []))
        .catch(() => {});
    }
  };

  const manejarTurno = () => {
    if (!turnoActivo) {
      // Pre-cargar base configurada
      const cfg = getEmpresaConfig();
      setAperBase(String(cfg.baseCaja || 0));
      setAperResponsable("");
      setModalApertura(true);
    } else {
      abrirDrawer(null);
    }
  };

  const confirmarAperturaTurno = () => {
    if (!aperResponsable.trim()) return toast("warning", "Ingresa el nombre del responsable");
    const ahora = new Date();
    const nuevo = {
      responsable:    aperResponsable.toUpperCase(),
      fechaApertura:  ahora.toLocaleString(),
      fechaAperturaISO: ahora.toISOString(),
      baseCaja:       parseFloat(aperBase) || 0,
    };
    localStorage.setItem(`turno_actual_${branchId}`, JSON.stringify(nuevo));
    setTurnoActivo(nuevo);
    setModalApertura(false);
  };

  const cerrarDrawer = () => { setIsResumenOpen(false); setCierreViendo(null); };

  // Qué mostrar en el drawer
  const esActivo      = cierreViendo === null;
  const snap          = cierreViendo?.snapshot;
  const resumenVer    = esActivo ? resumenActivo : snap;
  const responsableVer = esActivo ? turnoActivo?.responsable  : cierreViendo?.responsable;
  const aperturaVer    = esActivo ? turnoActivo?.fechaApertura : cierreViendo?.fechaApertura;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f9fa] p-8 md:p-12 text-left uppercase">

      {/* CABECERA */}
      <header className="flex justify-between items-center mb-10 flex-wrap gap-4">
        <h1 className="text-2xl font-black italic">Cierre de Caja</h1>
        <div className="flex items-center gap-3 flex-wrap">

          {/* Selector periodo tabla */}
          <select
            value={periodoTabla}
            onChange={e => setPeriodoTabla(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase outline-none shadow-sm"
          >
            <option value="Diario">Diario</option>
            <option value="Semanal">Semanal</option>
            <option value="Quincenal">Quincenal</option>
            <option value="Mensual">Mensual</option>
            <option value="Anual">Anual</option>
          </select>

          {/* Calendario inteligente */}
          <div
            onClick={() => dateInputRef.current?.showPicker()}
            className="relative flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 cursor-pointer shadow-sm min-w-[180px]"
          >
            <FiCalendar className="text-blue-500 shrink-0" />
            <span className="text-[10px] font-black text-blue-600 uppercase">{tablaLabel}</span>
            <input
              ref={dateInputRef}
              type="date"
              value={fechaBase}
              onChange={e => setFechaBase(e.target.value)}
              className="absolute inset-0 opacity-0 pointer-events-none"
            />
          </div>

          {/* Botón turno */}
          <button
            onClick={manejarTurno}
            className={`${turnoActivo ? "bg-red-600" : "bg-blue-600"} text-white px-8 py-2.5 rounded-xl font-black flex items-center gap-2`}
          >
            {turnoActivo ? <><FiLock /> Cerrar Turno</> : <><FiUnlock /> Abrir Turno</>}
          </button>
        </div>
      </header>

      {/* TABLA HISTORIAL */}
      <div className="bg-white rounded-[35px] shadow-sm overflow-hidden border">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr className="text-xs text-slate-600 font-black uppercase">
              <th className="p-6 text-left">Apertura</th>
              <th className="p-6 text-left">Responsable</th>
              <th className="p-6 text-left">Cierre</th>
              <th className="p-6 text-left">Caja</th>
              <th className="p-6 text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {turnoActivo && (
              <tr className="bg-blue-50/50 border-b font-bold">
                <td className="p-6 text-xs">{turnoActivo.fechaApertura}</td>
                <td className="p-6 text-sm">{turnoActivo.responsable}</td>
                <td className="p-6 text-blue-500 italic text-xs">ACTIVO</td>
                <td className="p-6 text-slate-300 text-sm">--</td>
                <td className="p-6 text-center">
                  <button
                    onClick={() => abrirDrawer(null)}
                    className="bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-[9px] font-black hover:bg-blue-200 transition-all"
                  >
                    EN PROCESO
                  </button>
                </td>
              </tr>
            )}

            {historialFiltrado.map((reg, i) => (
              <tr key={i} className="border-b text-slate-600 hover:bg-slate-50 transition-colors">
                <td className="p-6 text-xs">{reg.fechaApertura}</td>
                <td className="p-6 text-sm font-black">{reg.responsable}</td>
                <td className="p-6 text-xs italic">
                  {reg.fechaCierre ? new Date(reg.fechaCierre).toLocaleString("es-CO") : "—"}
                </td>
                <td className="p-6 text-sm font-mono font-black">$ {reg.valor?.toLocaleString()}</td>
                <td className="p-6 text-center">
                  <button
                    onClick={() => abrirDrawer(reg)}
                    className={`px-4 py-1.5 rounded-full text-[9px] font-black hover:opacity-75 transition-all ${
                      reg.estado === "CUADRADA"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {reg.estado}
                  </button>
                </td>
              </tr>
            ))}

            {historialFiltrado.length === 0 && !turnoActivo && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-300 font-black text-[10px] tracking-widest">
                  Sin cierres en este periodo
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── DRAWER ─────────────────────────────────────────────────────────── */}
      {isResumenOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={cerrarDrawer}
          />
          <div className="relative w-full md:w-[520px] bg-white h-full flex flex-col shadow-2xl">

            {/* Header del drawer */}
            <div className="px-10 pt-6 pb-4 border-b shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    {responsableVer}
                  </p>
                  <h2 className="text-xl font-black italic">Resumen de Operación</h2>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">
                    Apertura: {aperturaVer}
                  </p>
                  {!esActivo && cierreViendo?.fechaCierre && (
                    <p className="text-[10px] font-bold text-slate-500">
                      Cierre: {new Date(cierreViendo.fechaCierre).toLocaleString("es-CO")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {/* Botón PDF A4 */}
                  <button
                    onClick={() => {
                      const reg = esActivo
                        ? { ...resumenActivo, fechaApertura: turnoActivo?.fechaApertura, responsable: turnoActivo?.responsable,
                            fechaCierre: new Date().toISOString(), estado: "EN PROCESO",
                            snapshot: { ...resumenActivo, diferencia, efectivoFisico: parseFloat(efectivoFisico) || 0 } }
                        : cierreViendo;
                      imprimirCierre(reg);
                    }}
                    title="Imprimir PDF A4"
                    className="flex flex-col items-center bg-slate-100 px-2.5 py-1.5 rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    <FiPrinter size={15} />
                    <span className="text-[7px] font-black uppercase mt-0.5 text-slate-500">A4</span>
                  </button>
                  {/* Botón Térmica 80mm */}
                  <button
                    onClick={() => {
                      const reg = esActivo
                        ? { ...resumenActivo, fechaApertura: turnoActivo?.fechaApertura, responsable: turnoActivo?.responsable,
                            fechaCierre: new Date().toISOString(), estado: "EN PROCESO",
                            snapshot: { ...resumenActivo, diferencia, efectivoFisico: parseFloat(efectivoFisico) || 0 } }
                        : cierreViendo;
                      imprimirCierreTermico(reg);
                    }}
                    title="Imprimir Térmica 80mm"
                    className="flex flex-col items-center bg-slate-100 px-2.5 py-1.5 rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    <FiPrinter size={15} />
                    <span className="text-[7px] font-black uppercase mt-0.5 text-slate-500">80mm</span>
                  </button>
                  <button onClick={cerrarDrawer} className="p-2.5 rounded-xl hover:bg-slate-100 transition-colors">
                    <FiX size={20} />
                  </button>
                </div>
              </div>

              {/* Indicador de inicio de turno — activo */}
              {esActivo && turnoActivo && (() => {
                const info = computarRangoFacturas(ventasHoy.map((v: any) => v.nroFactura));
                return (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Ventas desde apertura del turno · {info?.total ?? 0} doc.
                    </p>
                    {info && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{info.rangoStr}</p>}
                    {info?.desglose && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{info.desglose}</p>}
                  </div>
                );
              })()}

              {/* Indicador de facturas — cierre histórico */}
              {!esActivo && (() => {
                const info = cierreViendo?.snapshot?.facturaInfo;
                if (!info) return null;
                return (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {info.total} documento{info.total !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{info.rangoStr}</p>
                    {info.desglose && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{info.desglose}</p>}
                  </div>
                );
              })()}
            </div>

            {/* Cuerpo scrollable */}
            <div className="flex-1 overflow-y-auto px-10 py-6 space-y-5">

              {/* BASE DE CAJA */}
              {(resumenVer?.base ?? 0) > 0 && (
                <div className="bg-slate-100 px-6 py-4 rounded-2xl flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Base de Caja (apertura)</span>
                  <span className="font-black text-slate-700">$ {(resumenVer.base).toLocaleString()}</span>
                </div>
              )}

              {/* VENTAS */}
              <div className="bg-slate-50 p-6 rounded-3xl">
                <h3 className="text-xs font-black text-slate-600 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <FiPlusCircle className="text-green-500" /> Ventas
                </h3>
                <div className="flex justify-between font-black text-sm mb-3">
                  <span>Total Facturación</span>
                  <span className="text-green-600">$ {(resumenVer?.ventas?.total ?? 0).toLocaleString()}</span>
                </div>
                {/* COMPOSICIÓN informativa */}
                {(resumenVer?.ventas?.total ?? 0) > 0 && (
                  <div className="bg-slate-100 rounded-xl px-4 py-2.5 mb-3 space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Composición</p>
                    <div className="flex justify-between text-[9px] font-bold text-slate-600">
                      <span>Ventas Netas</span>
                      <span>$ {(resumenVer?.ventas?.subtotal ?? 0).toLocaleString()}</span>
                    </div>
                    {(resumenVer?.ventas?.domicilios ?? 0) > 0 && (
                      <div className="flex justify-between text-[9px] font-bold text-slate-500">
                        <span>Domicilios</span>
                        <span>$ {(resumenVer.ventas.domicilios).toLocaleString()}</span>
                      </div>
                    )}
                    {(resumenVer?.ventas?.propinas ?? 0) > 0 && (
                      <div className="flex justify-between text-[9px] font-bold text-slate-500">
                        <span>Propinas</span>
                        <span>$ {(resumenVer.ventas.propinas).toLocaleString()}</span>
                      </div>
                    )}
                    {(resumenVer?.ventas?.impuestos ?? 0) > 0 && (
                      <div className="flex justify-between text-[9px] font-bold text-slate-500">
                        <span>Impuestos</span>
                        <span>$ {(resumenVer.ventas.impuestos).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="text-[10px] space-y-2 text-slate-500 font-bold border-t pt-3">
                  {/* Efectivo = ventas FR + anticipos PF en efectivo */}
                  {(() => {
                    const vEf = resumenVer?.ventas?.efectivo ?? 0;
                    const pfEf = resumenVer?.anticiposPF?.efectivo ?? 0;
                    const total = vEf + pfEf;
                    return total > 0 ? (
                      <div className="flex justify-between">
                        <span>Efectivo{pfEf > 0 ? <span className="text-amber-500"> (+${pfEf.toLocaleString()} anticipos)</span> : ""}</span>
                        <span>$ {total.toLocaleString()}</span>
                      </div>
                    ) : null;
                  })()}
                  {/* Bancos = ventas FR + anticipos PF por banco */}
                  {(() => {
                    const bancosFR  = resumenVer?.ventas?.porBanco ?? [];
                    const bancosPF  = resumenVer?.anticiposPF?.porBanco ?? [];
                    const allBancos = [...new Set([...bancosFR.map((b:any)=>b.banco), ...bancosPF.map((b:any)=>b.banco)])];
                    return allBancos.map(banco => {
                      const fr  = bancosFR.find((b:any) => b.banco === banco)?.total ?? 0;
                      const pf  = bancosPF.find((b:any) => b.banco === banco)?.total ?? 0;
                      const tot = fr + pf;
                      if (tot <= 0) return null;
                      return (
                        <div key={banco} className="flex justify-between">
                          <span>{banco}{pf > 0 ? <span className="text-amber-500"> (+${pf.toLocaleString()} anticipos)</span> : ""}</span>
                          <span>$ {tot.toLocaleString()}</span>
                        </div>
                      );
                    });
                  })()}
                  {(resumenVer?.ventas?.credito ?? 0) > 0 && (
                    <div className="flex justify-between text-orange-500">
                      <span>Crédito (pendiente cobro)</span>
                      <span>$ {(resumenVer.ventas.credito).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* OTROS INGRESOS */}
              <div className="bg-slate-50 p-6 rounded-3xl border-l-4 border-blue-500">
                <h3 className="text-xs font-black text-slate-600 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <FiPlusCircle className="text-blue-500" /> Otros Ingresos (Recaudos)
                </h3>
                <div className="flex justify-between font-black text-sm mb-3">
                  <span>Total Recaudos</span>
                  <span className="text-blue-600">$ {(resumenVer?.otros?.total ?? 0).toLocaleString()}</span>
                </div>
                <div className="text-[10px] space-y-2 text-slate-500 font-bold border-t pt-3">
                  {/* Efectivo + pagadores */}
                  <div>
                    <div className="flex justify-between">
                      <span>Efectivo</span>
                      <span>$ {(resumenVer?.otros?.efectivo ?? 0).toLocaleString()}</span>
                    </div>
                    {(resumenVer?.otros?.detalle ?? [])
                      .filter((d: any) => d.medioPago === "EFECTIVO")
                      .map((d: any, idx: number) => (
                        <div key={idx} className="flex justify-between pl-3 text-[9px] text-slate-400 font-medium mt-0.5">
                          <span>↳ {d.tercero}</span>
                          <span>$ {Number(d.valor).toLocaleString()}</span>
                        </div>
                      ))}
                  </div>
                  {/* Bancos + pagadores */}
                  {(resumenVer?.otros?.porBanco ?? []).map((b: any) => (
                    <div key={b.banco}>
                      <div className="flex justify-between">
                        <span>{b.banco}</span>
                        <span>$ {b.total.toLocaleString()}</span>
                      </div>
                      {(resumenVer?.otros?.detalle ?? [])
                        .filter((d: any) => d.medioPago === b.banco)
                        .map((d: any, idx: number) => (
                          <div key={idx} className="flex justify-between pl-3 text-[9px] text-slate-400 font-medium mt-0.5">
                            <span>↳ {d.tercero}</span>
                            <span>$ {Number(d.valor).toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* EGRESOS */}
              <div className="bg-red-50 p-6 rounded-3xl border-l-4 border-red-400">
                <h3 className="text-xs font-black text-slate-600 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <FiMinusCircle className="text-red-500" /> Egresos
                </h3>
                <div className="text-[10px] space-y-2 font-bold mb-4">
                  {(resumenVer?.egresos?.gastos ?? 0) > 0 && (
                    <div>
                      <div className="flex justify-between text-slate-600">
                        <span>Gastos Operativos</span>
                        <span className="text-red-400">-$ {(resumenVer.egresos.gastos).toLocaleString()}</span>
                      </div>
                      {(resumenVer.egresos.lista ?? []).filter((e: any) => (e.tipo || "GASTO") === "GASTO").map((e: any, i: number) => (
                        <div key={i} className="flex justify-between text-slate-400 pl-3 mt-0.5">
                          <span>↳ {e.proveedor || "—"}{e.concepto ? ` · ${e.concepto}` : ""}</span>
                          <span>-$ {Number(e.valor).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(resumenVer?.egresos?.compras ?? 0) > 0 && (
                    <div>
                      <div className="flex justify-between text-slate-600">
                        <span>Compras / Inventario</span>
                        <span className="text-red-400">-$ {(resumenVer.egresos.compras).toLocaleString()}</span>
                      </div>
                      {(resumenVer.egresos.lista ?? []).filter((e: any) => e.tipo === "INVENTARIO" || e.esInventario).map((e: any, i: number) => (
                        <div key={i} className="flex justify-between text-slate-400 pl-3 mt-0.5">
                          <span>↳ {e.proveedor || "—"}</span>
                          <span>-$ {Number(e.valor).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(resumenVer?.egresos?.prestamos ?? 0) > 0 && (
                    <div>
                      <div className="flex justify-between text-slate-600">
                        <span>Préstamos / Anticipos</span>
                        <span className="text-red-400">-$ {(resumenVer.egresos.prestamos).toLocaleString()}</span>
                      </div>
                      {(resumenVer.egresos.lista ?? []).filter((e: any) => e.tipo === "PRESTAMO").map((e: any, i: number) => (
                        <div key={i} className="flex justify-between text-slate-400 pl-3 mt-0.5">
                          <span>↳ {e.proveedor || "—"}{e.concepto ? ` · ${e.concepto}` : ""}</span>
                          <span>-$ {Number(e.valor).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(resumenVer?.egresos?.cambios ?? 0) > 0 && (
                    <div>
                      <div className="flex justify-between text-slate-500">
                        <span>Cambios de Efectivo</span>
                        <span className="text-gray-400">-$ {(resumenVer.egresos.cambios).toLocaleString()}</span>
                      </div>
                      {(resumenVer.egresos.lista ?? []).filter((e: any) => e.tipo === "CAMBIO").map((e: any, i: number) => (
                        <div key={i} className="flex justify-between text-slate-400 pl-3 mt-0.5">
                          <span>↳ {e.concepto}</span>
                          <span>-$ {Number(e.valor).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(resumenVer?.egresos?.cxp ?? 0) > 0 && (
                    <div>
                      <div className="flex justify-between text-slate-600 font-black">
                        <span>Pagos Proveedores (CXP)</span>
                        <span className="text-red-400">-$ {(resumenVer.egresos.cxp).toLocaleString()}</span>
                      </div>
                      {(resumenVer.egresos.cxpDetalle || []).map((d: any, i: number) => (
                        <div key={i} className="flex justify-between text-slate-400 pl-3 mt-1">
                          <span>{d.proveedor} · {d.medioPago}</span>
                          <span>-$ {d.monto.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-between font-black text-red-600 text-sm mt-3 border-t border-red-200 pt-3">
                  <span>Total Egresos</span>
                  <span>$ {(resumenVer?.egresos?.total ?? 0).toLocaleString()}</span>
                </div>
              </div>

              {/* ARQUEO — turno activo */}
              {esActivo && (
                <div className="bg-slate-900 p-5 rounded-2xl text-white">
                  <div className="flex justify-between text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest">
                    <span>Esperado en Caja</span>
                    <span className="text-lg text-white font-mono">$ {resumenActivo.esperado.toLocaleString()}</span>
                  </div>
                  <label className="text-[10px] font-black text-blue-400 block mb-1.5">Efectivo Físico</label>
                  <input
                    type="number"
                    value={efectivoFisico}
                    onChange={e => setEfectivoFisico(e.target.value)}
                    className="w-full bg-slate-800 p-3 rounded-xl text-xl text-right font-black outline-none border border-slate-700"
                  />
                  <div className="flex justify-between mt-4">
                    <span className="text-[10px] font-black text-red-400 uppercase">Diferencia</span>
                    <span className={`text-xl font-black ${diferencia === 0 ? "text-green-400" : "text-red-400"}`}>
                      $ {diferencia.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* ARQUEO — cierre histórico */}
              {!esActivo && snap && (
                <div className={`p-8 rounded-[35px] text-white ${cierreViendo.estado === "CUADRADA" ? "bg-emerald-700" : "bg-red-700"}`}>
                  <div className="flex justify-between text-[10px] font-black text-white/60 mb-2 uppercase">
                    <span>Esperado en Caja</span>
                    <span className="text-white text-base font-mono">$ {(snap.esperado ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-black text-white/60 mb-2 uppercase">
                    <span>Efectivo Físico Contado</span>
                    <span className="text-white text-base font-mono">$ {(snap.efectivoFisico ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/20 pt-4 mt-4">
                    <span className="text-[10px] font-black text-white/60 uppercase">Diferencia</span>
                    <span className="text-2xl font-black text-white">$ {(snap.diferencia ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer con botón finalizar (sólo turno activo) */}
            {esActivo && (
              <div className="px-10 pb-10 shrink-0">
                <button
                  onClick={finalizarCierre}
                  className="w-full bg-blue-600 text-white py-5 rounded-[25px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 hover:bg-black transition-all"
                >
                  <FiPrinter size={18} /> Finalizar y Cerrar Caja
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL APERTURA DE TURNO */}
      {modalApertura && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl">
            <h2 className="text-lg font-black uppercase tracking-tighter text-slate-800 mb-1">Abrir Turno</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">Confirma los datos de apertura</p>

            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Responsable *</p>
                <input
                  autoFocus
                  value={aperResponsable}
                  onChange={e => setAperResponsable(e.target.value.toUpperCase())}
                  placeholder="NOMBRE DEL CAJERO..."
                  className="w-full bg-transparent font-black uppercase text-sm outline-none"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Base de Caja</p>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-black">$</span>
                  <input
                    type="number"
                    value={aperBase}
                    onChange={e => setAperBase(e.target.value)}
                    className="flex-1 bg-transparent font-black text-lg outline-none"
                  />
                </div>
                <p className="text-[9px] text-slate-400 mt-1">Efectivo físico con que abre la caja</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalApertura(false)}
                className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-xl font-black uppercase text-[10px]">
                Cancelar
              </button>
              <button onClick={confirmarAperturaTurno}
                className="flex-1 bg-[#1a2b3c] text-white py-4 rounded-xl font-black uppercase text-[10px] hover:bg-black transition-all">
                Abrir Turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
