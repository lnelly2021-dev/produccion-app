"use client";
import { useState, useEffect, useRef } from "react";
import { FileDown, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { getEmpresaConfig } from "../../lib/empresaStorage";

type Vista = "producto" | "tercero" | "pago" | "domicilio" | "credito" | "canal";

const PALETTE = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];

// ── SVG Donut ──────────────────────────────────────────────────────────────
function DonutChart({ data, size = 150 }: {
  data: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return (
    <div style={{ width: size, height: size }} className="rounded-full bg-gray-100 flex items-center justify-center shrink-0">
      <span className="text-[9px] text-gray-400">Sin datos</span>
    </div>
  );
  // viewBox fija en 150×150, escala con width/height
  const r = 54, cx = 75, cy = 75, sw = 20, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
      {data.map((d, i) => {
        const pct = d.value / total;
        const dash = pct * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={d.color} strokeWidth={sw}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-(acc * circ)}
            transform={`rotate(-90 ${cx} ${cy})`} />
        );
        acc += pct;
        return el;
      })}
    </svg>
  );
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────
function BarChart({ bars }: { bars: { label: string; value: number }[] }) {
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map(b => b.value), 1);
  return (
    <div className="flex items-end gap-1 w-full px-1" style={{ height: "100px" }}>
      {bars.map((b, i) => (
        <div key={i} className="flex flex-col items-center flex-1 min-w-0" style={{ height: "100px" }}>
          <div className="w-full flex flex-col justify-end" style={{ height: "78px" }}>
            {b.value > 0 && (
              <span className="text-[8px] text-gray-600 font-medium text-center leading-none mb-0.5 truncate">
                {b.value >= 1000000 ? `${(b.value/1000000).toFixed(1)}M` :
                 b.value >= 1000    ? `${Math.round(b.value/1000)}k` : String(b.value)}
              </span>
            )}
            <div className="w-full rounded-t-sm" style={{
              height: `${Math.max((b.value / max) * 64, b.value > 0 ? 3 : 0)}px`,
              backgroundColor: b.value > 0 ? "#3b82f6" : "#f3f4f6",
            }} />
          </div>
          <span className="text-[8px] text-gray-600 font-medium truncate w-full text-center mt-1 leading-none">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportesPage() {
  const { branch } = useAuth();
  const branchId = branch?.id || "";
  const [allVentas,      setAllVentas]      = useState<any[]>([]);
  const [catMap,         setCatMap]         = useState<Record<string, string>>({});
  const [tipoRango,      setTipoRango]      = useState("Mensual");
  const [fechaBase,      setFechaBase]      = useState(new Date().toLocaleDateString("en-CA"));
  const [vista,          setVista]          = useState<Vista>("producto");
  const [showCatDrawer,  setShowCatDrawer]  = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!branchId) return;

    // Llamadas independientes: si una falla, la otra no se ve afectada
    api.get(`/branches/${branchId}/ventas`)
      .then(({ data }) => {
        setAllVentas((data.data || []).map((v: any) => ({
          ...v,
          fecha:     v.createdAt || v.fecha,
          subtotal:  Number(v.subtotal)  || 0,
          descuento: Number(v.descuento) || 0,
          impuesto:  Number(v.impuesto)  || 0,
          propina:   Number(v.propina)   || 0,
          envio:     Number(v.envio)     || 0,
          valor:     Number(v.valor)     || 0,
        })));
      })
      .catch(() => {});

    api.get(`/branches/${branchId}/products`)
      .then(({ data }) => {
        const prods = data.data || data || [];
        const m: Record<string, string> = {};
        prods.forEach((p: any) => {
          const cat = (p.categoria || "").toUpperCase().trim() || "GENERAL";
          if (p._id)    m[String(p._id)] = cat;
          if (p.nombre) m[`n:${(p.nombre || "").toUpperCase().trim()}`] = cat;
        });
        setCatMap(m);
      })
      .catch(() => {});

  }, [branchId]);

  // ── Rango ─────────────────────────────────────────────────────────────────
  const getRango = () => {
    const base = new Date(fechaBase + "T12:00:00");
    let ini = new Date(base); ini.setHours(0,0,0,0);
    let fin = new Date(base); fin.setHours(23,59,59,999);
    let etiqueta = base.toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" });
    if (tipoRango === "Semanal") {
      const d = base.getDay();
      ini.setDate(base.getDate() - (d===0?6:d-1));
      fin = new Date(ini); fin.setDate(ini.getDate()+6); fin.setHours(23,59,59,999);
      const f = (dt: Date) => dt.toLocaleDateString("es-CO", { day:"2-digit", month:"short" });
      etiqueta = `${f(ini)} – ${f(fin)}`;
    } else if (tipoRango === "Quincenal") {
      if (base.getDate()<=15) { ini.setDate(1); fin.setDate(15); }
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

  const ventasPeriodo  = allVentas.filter(v => { const t = new Date(v.fecha).getTime(); return t>=inicio && t<=fin; });
  const ventasActivas  = ventasPeriodo.filter(v => v.estado !== "ANULADA");
  const neto           = (v: any) => Math.max((Number(v.subtotal)||0)-(Number(v.descuento)||0), 0);
  const totalNeto      = ventasActivas.reduce((s,v) => s+neto(v), 0);
  const totalFacturas  = ventasActivas.length;
  const ticketProm     = totalFacturas > 0 ? Math.round(totalNeto/totalFacturas) : 0;

  // ── Bar chart tendencia ───────────────────────────────────────────────────
  const barsData = (() => {
    if (tipoRango === "Diario") {
      const h: Record<number,number> = {};
      ventasActivas.forEach(v => { const hr=new Date(v.fecha).getHours(); h[hr]=(h[hr]||0)+neto(v); });
      return [6,8,10,12,14,16,18,20,22].map(hr => ({ label:`${hr}h`, value:h[hr]||0 }));
    }
    if (tipoRango === "Semanal") {
      const dias=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]; const vals=Array(7).fill(0);
      ventasActivas.forEach(v => { const d=new Date(v.fecha).getDay(); vals[d===0?6:d-1]+=neto(v); });
      return dias.map((label,i) => ({ label, value:vals[i] }));
    }
    if (tipoRango === "Mensual") {
      const s=[0,0,0,0,0];
      ventasActivas.forEach(v => { const d=new Date(v.fecha).getDate(); s[Math.min(Math.ceil(d/7)-1,4)]+=neto(v); });
      return s.map((value,i) => ({ label:`S${i+1}`, value }));
    }
    if (tipoRango === "Quincenal") {
      const m=[0,0,0];
      ventasActivas.forEach(v => { const d=new Date(v.fecha).getDate(); m[d<=5?0:d<=10?1:2]+=neto(v); });
      return [{ label:"1-5",value:m[0]},{ label:"6-10",value:m[1]},{ label:"11+",value:m[2]}];
    }
    const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]; const vals=Array(12).fill(0);
    ventasActivas.forEach(v => { vals[new Date(v.fecha).getMonth()]+=neto(v); });
    return meses.map((label,i) => ({ label, value:vals[i] }));
  })();

  // ── Donut: SIEMPRE por categoría de producto ──────────────────────────────
  const porCategoria = (() => {
    const m: Record<string,number> = {};
    ventasActivas.forEach(v => {
      const items = v.productos || [];
      // Subtotal bruto de los ítems para distribuir el descuento proporcionalmente
      const bruto = items.reduce((s: number, p: any) =>
        s + (Number(p.precio)||0) * (Number(p.cantidad)||1), 0);
      const descRatio = bruto > 0 ? Math.min((Number(v.descuento)||0) / bruto, 1) : 0;

      items.forEach((p: any) => {
        const pid  = String(p.productoId || "");
        const pnom = `n:${(p.nombre || "").toUpperCase().trim()}`;
        const cat  = catMap[pid] || catMap[pnom] || "SIN CATEGORÍA";
        // Usar p.subtotal (valor de línea guardado) para evitar recalcular precio×cantidad
        // que puede dar doble en módulos que almacenan el precio de línea en lugar del unitario
        const lineaSubtotal = Number(p.subtotal) || (Number(p.precio)||0) * (Number(p.cantidad)||1);
        const valorNeto = lineaSubtotal * (1 - descRatio);
        m[cat] = (m[cat]||0) + valorNeto;
      });
      if (!items.length) m["VENTA DIRECTA"] = (m["VENTA DIRECTA"]||0) + neto(v);
    });
    return Object.entries(m)
      .map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a,b) => b.value - a.value);
  })();
  const totalCat = porCategoria.reduce((s,r) => s+r.value, 0);
  const donutData = porCategoria.slice(0,8).map((r,i) => ({ ...r, color: PALETTE[i] }));

  // ── Por Producto ──────────────────────────────────────────────────────────
  const porProducto = (() => {
    const m: Record<string,{nombre:string;cantidad:number;total:number}> = {};
    ventasActivas.forEach(v => {
      if (v.productos?.length > 0) {
        v.productos.forEach((p: any) => {
          const k=(p.nombre||"SIN NOMBRE").toUpperCase();
          if (!m[k]) m[k]={nombre:k,cantidad:0,total:0};
          const qty=Number(p.cantidad)||1;
          const linea = Number(p.subtotal) || (Number(p.precio)||0)*qty;
          m[k].cantidad+=qty; m[k].total+=linea;
        });
      } else {
        const k=(v.concepto||"VENTA").toUpperCase();
        if (!m[k]) m[k]={nombre:k,cantidad:0,total:0};
        m[k].cantidad+=1; m[k].total+=neto(v);
      }
    });
    return Object.values(m).sort((a,b) => b.total-a.total);
  })();

  // ── Por Tercero ───────────────────────────────────────────────────────────
  const porTercero = (() => {
    const m: Record<string,{nombre:string;facturas:number;total:number}> = {};
    ventasActivas.forEach(v => {
      const k=(v.cliente||"CONSUMIDOR FINAL").toUpperCase();
      if (!m[k]) m[k]={nombre:k,facturas:0,total:0};
      m[k].facturas+=1; m[k].total+=neto(v);
    });
    return Object.values(m).sort((a,b) => b.total-a.total);
  })();

  // ── Por Pago ──────────────────────────────────────────────────────────────
  const porPago = (() => {
    const m: Record<string,{medio:string;facturas:number;total:number}> = {};
    ventasActivas.forEach(v => {
      if (v.pagos && v.pagos.length>1) {
        v.pagos.forEach((p: any) => {
          const k=(p.medio||"EFECTIVO").toUpperCase();
          if (!m[k]) m[k]={medio:k,facturas:0,total:0};
          m[k].facturas+=1; m[k].total+=Number(p.monto)||0;
        });
      } else {
        const k=(v.medioPago||"EFECTIVO").toUpperCase();
        if (!m[k]) m[k]={medio:k,facturas:0,total:0};
        m[k].facturas+=1; m[k].total+=neto(v);
      }
    });
    return Object.values(m).sort((a,b) => b.total-a.total);
  })();

  // ── Por Domicilio ─────────────────────────────────────────────────────────
  const porDomicilio = ventasActivas
    .filter(v => (v.nroFactura||"").startsWith("DOM-") || Number(v.envio)>0)
    .map(v => ({
      nro:(v.nroFactura||"—"), cliente:(v.cliente||"—").toUpperCase(),
      medio:(v.medioPago||"EFECTIVO").toUpperCase(),
      subtotal:neto(v), envio:Number(v.envio)||0,
      fecha:new Date(v.fecha).toLocaleDateString("es-CO"),
    })).sort((a,b) => b.subtotal-a.subtotal);

  // ── Por Crédito ───────────────────────────────────────────────────────────
  const porCredito = ventasPeriodo
    .filter(v => (v.tipoPago||"").toUpperCase()==="CRÉDITO")
    .map(v => ({
      nro:(v.nroFactura||"—"), cliente:(v.cliente||"—").toUpperCase(),
      subtotal:neto(v), estado:(v.estado||"PENDIENTE").toUpperCase(),
      fecha:new Date(v.fecha).toLocaleDateString("es-CO"),
    })).sort((a,b) => b.subtotal-a.subtotal);

  const totalProductosUnd  = porProducto.reduce((s,r) => s+r.cantidad, 0);
  const totalDomicilio     = porDomicilio.reduce((s,r) => s+r.subtotal, 0);
  const totalEnvios        = porDomicilio.reduce((s,r) => s+r.envio, 0);
  const ticketDom          = porDomicilio.length > 0 ? Math.round(totalDomicilio/porDomicilio.length) : 0;
  const totalCreditoPend   = porCredito.filter(r=>r.estado==="PENDIENTE").reduce((s,r)=>s+r.subtotal,0);
  const totalCreditoCuad   = porCredito.filter(r=>r.estado==="CUADRADA").reduce((s,r)=>s+r.subtotal,0);
  const totalCreditoAnul   = porCredito.filter(r=>r.estado==="ANULADA").reduce((s,r)=>s+r.subtotal,0);
  const totalCreditoTotal  = porCredito.reduce((s,r)=>s+r.subtotal,0);

  // ── Por Canal de venta ────────────────────────────────────────────────────
  const CANAL_COLOR: Record<string,string> = { "MESAS":"#8b5cf6", "VENTA RÁPIDA":"#3b82f6", "DOMICILIOS":"#10b981" };
  const porCanal = (() => {
    const m: Record<string,{canal:string;facturas:number;total:number}> = {};
    ventasActivas.forEach(v => {
      const nro = (v.nroFactura || "").toUpperCase();
      const con = (v.concepto  || "").toUpperCase();
      let canal = "VENTA RÁPIDA";
      if (nro.startsWith("DOM-") || Number(v.envio) > 0)          canal = "DOMICILIOS";
      else if (nro.startsWith("FV-") || con.includes("MESA"))     canal = "MESAS";
      if (!m[canal]) m[canal] = { canal, facturas:0, total:0 };
      m[canal].facturas += 1;
      m[canal].total    += neto(v);
    });
    return Object.values(m).sort((a,b) => b.total - a.total);
  })();
  const totalCanal = porCanal.reduce((s,r) => s + r.total, 0);

  const fmt  = (v: number) => `$${v.toLocaleString("es-CO")}`;
  const pct  = (v: number, t: number) => t>0 ? `${((v/t)*100).toFixed(1)}%` : "0%";
  const fmtN = (v: number) => v.toLocaleString("es-CO");

  // ── KPI cards según pestaña activa ────────────────────────────────────────
  const kpiCards = (() => {
    if (vista === "domicilio") return [
      { label:"Total domicilios",   value: fmt(totalDomicilio) },
      { label:"# domicilios",       value: fmtN(porDomicilio.length) },
      { label:"Ticket promedio",    value: fmt(ticketDom) },
      { label:"Total envíos",       value: fmt(totalEnvios) },
    ];
    if (vista === "credito") return [
      { label:"Total a crédito",    value: fmt(totalCreditoTotal) },
      { label:"Pendiente cobro",    value: fmt(totalCreditoPend) },
      { label:"Cuadradas",          value: fmt(totalCreditoCuad) },
      { label:"Anuladas",           value: fmt(totalCreditoAnul) },
    ];
    if (vista === "canal") return [
      { label:"Mesas",              value: fmt(porCanal.find(r=>r.canal==="MESAS")?.total        || 0) },
      { label:"Venta Rápida",       value: fmt(porCanal.find(r=>r.canal==="VENTA RÁPIDA")?.total || 0) },
      { label:"Domicilios",         value: fmt(porCanal.find(r=>r.canal==="DOMICILIOS")?.total   || 0) },
      { label:"Total General",      value: fmt(totalCanal) },
    ];
    // producto | tercero | pago → KPIs generales
    return [
      { label:"Subtotal Neto",      value: fmt(totalNeto) },
      { label:"Facturas emitidas",  value: fmtN(totalFacturas) },
      { label:"Ticket promedio",    value: fmt(ticketProm) },
      { label:"Unidades vendidas",  value: fmtN(totalProductosUnd) },
    ];
  })();

  // ── Gráfica derecha según pestaña activa ─────────────────────────────────
  // Producto → categorías; demás → distribución contextual
  const rightChart = (() => {
    if (vista === "producto") {
      return {
        title: "Ventas por categoría",
        data:  donutData,
        total: totalCat,
      };
    }
    if (vista === "tercero") {
      const top = porTercero.slice(0,7);
      const otros = porTercero.slice(7).reduce((s,r)=>s+r.total,0);
      const data = top.map((r,i) => ({ label:r.nombre, value:r.total, color:PALETTE[i] }));
      if (otros>0) data.push({ label:"Otros", value:otros, color:"#d1d5db" });
      return { title:"Distribución por cliente", data, total:totalNeto };
    }
    if (vista === "pago") {
      return {
        title: "Distribución por pago",
        data:  porPago.map((r,i) => ({ label:r.medio, value:r.total, color:PALETTE[i] })),
        total: totalNeto,
      };
    }
    if (vista === "domicilio") {
      // Agrupar por cliente (top 8)
      const m: Record<string,number> = {};
      porDomicilio.forEach(r => { m[r.cliente]=(m[r.cliente]||0)+r.subtotal; });
      const sorted = Object.entries(m).sort((a,b)=>b[1]-a[1]);
      const top = sorted.slice(0,8).map(([label,value],i)=>({ label,value,color:PALETTE[i] }));
      const otros = sorted.slice(8).reduce((s,[,v])=>s+v,0);
      if (otros>0) top.push({ label:"Otros", value:otros, color:"#d1d5db" });
      return { title:"Distribución por cliente", data:top, total:totalDomicilio };
    }
    if (vista === "canal") {
      return {
        title: "Distribución por canal",
        data:  porCanal.map(r => ({ label:r.canal, value:r.total, color: CANAL_COLOR[r.canal] || "#6366f1" })),
        total: totalCanal,
      };
    }
    // credito — agrupar por cliente (misma lógica que la tabla)
    const mc: Record<string,number> = {};
    porCredito.forEach(r => { mc[r.cliente]=(mc[r.cliente]||0)+r.subtotal; });
    const sortedC = Object.entries(mc).sort((a,b)=>b[1]-a[1]);
    const topC = sortedC.slice(0,8).map(([label,value],i)=>({ label,value,color:PALETTE[i] }));
    const otrosC = sortedC.slice(8).reduce((s,[,v])=>s+v,0);
    if (otrosC>0) topC.push({ label:"Otros", value:otrosC, color:"#d1d5db" });
    return { title:"Distribución por cliente", data:topC, total:totalCreditoTotal };
  })();

  // ── Export Excel ──────────────────────────────────────────────────────────
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      porProducto.map(r => ({ Producto:r.nombre, Cantidad:r.cantidad, "Subtotal Neto":r.total, "%":pct(r.total,totalNeto) }))
    ), "Por Producto");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      porTercero.map(r => ({ Tercero:r.nombre, Facturas:r.facturas, "Subtotal Neto":r.total, "%":pct(r.total,totalNeto) }))
    ), "Por Tercero");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      porPago.map(r => ({ "Medio Pago":r.medio, Facturas:r.facturas, "Subtotal Neto":r.total, "%":pct(r.total,totalNeto) }))
    ), "Por Medio Pago");
    if (porDomicilio.length>0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      porDomicilio.map(r => ({ Domicilio:r.nro, Cliente:r.cliente, Fecha:r.fecha, "Medio Pago":r.medio, Subtotal:r.subtotal, Envío:r.envio }))
    ), "Domicilios");
    if (porCredito.length>0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      porCredito.map(r => ({ Factura:r.nro, Cliente:r.cliente, Fecha:r.fecha, Subtotal:r.subtotal, Estado:r.estado }))
    ), "Crédito");
    if (porCanal.length>0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      porCanal.map(r => ({ Canal:r.canal, Facturas:r.facturas, "Subtotal Neto":r.total, "%":pct(r.total,totalCanal) }))
    ), "Por Canal");
    XLSX.writeFile(wb, `reporte_${fechaBase}.xlsx`);
  };

  // ── Export PDF ────────────────────────────────────────────────────────────
  const exportarPDF = () => {
    const emp = getEmpresaConfig();
    const th = (cols: string[]) => `<tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr>`;
    const tr = (cols: string[]) => `<tr>${cols.map((c,i)=>`<td style="${i>0?"text-align:right":""}">${c}</td>`).join("")}</tr>`;
    const tbl = (title: string, headers: string[], rows: string[][]) => !rows.length ? "" : `
      <h3>${title}</h3><table><thead>${th(headers)}</thead><tbody>${rows.map(r=>tr(r)).join("")}</tbody></table>`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:20px 28px;font-size:10px;color:#1a1a1a}
h1{font-size:15px;font-weight:800;text-align:center;text-transform:uppercase;margin-bottom:3px}
.sub{text-align:center;font-size:9px;color:#666;margin-bottom:16px}
.kpis{display:flex;gap:12px;margin-bottom:16px}
.kpi{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px}
.kpi-label{font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em}
.kpi-val{font-size:14px;font-weight:800;color:#111}
h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 6px;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
th{background:#f9fafb;color:#374151;padding:6px 8px;font-size:9px;font-weight:700;text-transform:uppercase;text-align:left;border-bottom:2px solid #e5e7eb}
td{padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:9px}
@media print{@page{margin:10mm 8mm;size:A4}}</style></head><body>
<h1>${emp.nombreEmpresa||"MI EMPRESA"}</h1>
<div class="sub">Reporte de Ventas · Período: ${etiqueta}</div>
<div class="kpis">
  <div class="kpi"><div class="kpi-label">Subtotal Neto</div><div class="kpi-val">${fmt(totalNeto)}</div></div>
  <div class="kpi"><div class="kpi-label">Facturas</div><div class="kpi-val">${fmtN(totalFacturas)}</div></div>
  <div class="kpi"><div class="kpi-label">Ticket Promedio</div><div class="kpi-val">${fmt(ticketProm)}</div></div>
  <div class="kpi"><div class="kpi-label">Unidades Vendidas</div><div class="kpi-val">${fmtN(totalProductosUnd)}</div></div>
</div>
${tbl("Ventas por Categoría",["Categoría","Subtotal","% del total"],
  porCategoria.map(r=>[r.label,fmt(r.value),pct(r.value,totalCat)]))}
${tbl("Ventas por Producto",["Producto","Cant.","Subtotal Neto","%"],
  porProducto.map(r=>[r.nombre,fmtN(r.cantidad),fmt(r.total),pct(r.total,totalNeto)]))}
${tbl("Ventas por Tercero",["Tercero","Facturas","Subtotal Neto","%"],
  porTercero.map(r=>[r.nombre,fmtN(r.facturas),fmt(r.total),pct(r.total,totalNeto)]))}
${tbl("Ventas por Medio de Pago",["Medio","Facturas","Subtotal Neto","%"],
  porPago.map(r=>[r.medio,fmtN(r.facturas),fmt(r.total),pct(r.total,totalNeto)]))}
${tbl("Domicilios",["Domicilio","Cliente","Fecha","Pago","Subtotal","Envío"],
  porDomicilio.map(r=>[r.nro,r.cliente,r.fecha,r.medio,fmt(r.subtotal),fmt(r.envio)]))}
${tbl("Ventas a Crédito",["Factura","Cliente","Fecha","Subtotal","Estado"],
  porCredito.map(r=>[r.nro,r.cliente,r.fecha,fmt(r.subtotal),r.estado]))}
${tbl("Distribución por Canal",["Canal","Facturas","Subtotal Neto","%"],
  porCanal.map(r=>[r.canal,fmtN(r.facturas),fmt(r.total),pct(r.total,totalCanal)]))}
<script>window.print();window.close();</script></body></html>`;
    const w = window.open("","_blank"); w?.document.write(html); w?.document.close();
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  const TABS: { key: Vista; label: string; count?: number }[] = [
    { key:"producto",  label:"Por Producto" },
    { key:"tercero",   label:"Por Tercero" },
    { key:"pago",      label:"Por Pago" },
    { key:"domicilio", label:"Domicilios", count:porDomicilio.length },
    { key:"credito",   label:"Crédito",    count:porCredito.length },
    { key:"canal",     label:"Por Canal" },
  ];

  return (
    <div className="h-screen flex flex-col bg-white font-sans overflow-hidden">

      {/* ═══ MITAD SUPERIOR — fija ═══════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-gray-200">

        {/* Cabecera */}
        <div className="bg-white border-b border-gray-100 px-8 pt-4 pb-3">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900 uppercase tracking-tight">Reportes de Ventas</h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">{etiqueta}</p>
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
          <div className="flex gap-2 items-center">
            <select value={tipoRango} onChange={e => setTipoRango(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase outline-none text-gray-600 bg-white">
              {["Diario","Semanal","Quincenal","Mensual","Anual"].map(o => <option key={o}>{o}</option>)}
            </select>
            <div onClick={() => dateInputRef.current?.showPicker()}
              className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 transition-all relative">
              <span className="text-[10px] font-semibold text-gray-600 uppercase">{etiqueta}</span>
              <input ref={dateInputRef} type="date" value={fechaBase}
                onChange={e => setFechaBase(e.target.value)} className="absolute inset-0 opacity-0 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* KPI cards — cambian según pestaña activa */}
        <div className="px-8 py-2 grid grid-cols-4 gap-3 border-b border-gray-100">
          {kpiCards.map((k,i) => (
            <div key={i} className="border border-gray-200 rounded-lg px-4 py-2 bg-gray-50">
              <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest">{k.label}</p>
              <p className="text-base font-bold text-gray-900 leading-tight mt-0.5">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Gráficas */}
        <div className="px-8 py-3 grid grid-cols-3 gap-4">

          {/* Bar chart tendencia — ocupa 2/3 */}
          <div className="col-span-2 border border-gray-200 rounded-xl px-5 pt-3 pb-2 bg-white">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">Tendencia del período</p>
            <BarChart bars={barsData} />
          </div>

          {/* Gráfica derecha — cambia según pestaña */}
          <div
            className={`border border-gray-200 rounded-xl px-4 pt-3 pb-3 bg-white flex flex-col transition-all ${vista === "producto" ? "cursor-pointer hover:border-gray-400 hover:shadow-sm" : ""}`}
            onClick={() => vista === "producto" && setShowCatDrawer(true)}
            title={vista === "producto" ? "Click para ver detalle en $" : undefined}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{rightChart.title}</p>
              {vista === "producto" && (
                <span className="text-[8px] text-gray-400 font-medium border border-gray-200 rounded px-1.5 py-0.5">ver $</span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-1">
              <DonutChart data={rightChart.data} />
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {rightChart.data.map((d,i) => (
                  <div key={i} className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-[9px] text-gray-600 truncate flex-1 capitalize">{d.label.toLowerCase()}</span>
                    <span className="text-[9px] font-bold text-gray-700 shrink-0">{pct(d.value, rightChart.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MITAD INFERIOR — scrollable ════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Tabs */}
        <div className="px-8 bg-white border-b border-gray-200 shrink-0">
          <div className="flex gap-0">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setVista(t.key)}
                className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide transition-all border-b-2 flex items-center gap-1.5 ${
                  vista === t.key ? "border-gray-800 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}>
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                    vista===t.key ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500"
                  }`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla scrollable */}
        <div className="flex-1 overflow-auto px-8 py-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-semibold text-gray-600 uppercase tracking-widest bg-gray-50">
                  {vista==="producto" && <><th className="px-5 py-3 text-left">Producto / Concepto</th><th className="px-5 py-3 text-right">Cant.</th><th className="px-5 py-3 text-right">Subtotal Neto</th><th className="px-5 py-3 text-right w-[140px]">Distribución</th></>}
                  {vista==="tercero"  && <><th className="px-5 py-3 text-left">Tercero / Cliente</th><th className="px-5 py-3 text-right">Facturas</th><th className="px-5 py-3 text-right">Subtotal Neto</th><th className="px-5 py-3 text-right w-[140px]">Distribución</th></>}
                  {vista==="pago"     && <><th className="px-5 py-3 text-left">Medio de Pago</th><th className="px-5 py-3 text-right">Facturas</th><th className="px-5 py-3 text-right">Subtotal Neto</th><th className="px-5 py-3 text-right w-[140px]">Distribución</th></>}
                  {vista==="domicilio"&& <><th className="px-5 py-3 text-left">Domicilio</th><th className="px-5 py-3 text-left">Cliente</th><th className="px-5 py-3 text-left">Fecha</th><th className="px-5 py-3 text-right">Subtotal</th><th className="px-5 py-3 text-right">Envío</th><th className="px-5 py-3 text-left">Pago</th><th className="px-5 py-3 text-right w-[140px]">Distribución</th></>}
                  {vista==="credito"  && <><th className="px-5 py-3 text-left">Factura</th><th className="px-5 py-3 text-left">Cliente</th><th className="px-5 py-3 text-left">Fecha</th><th className="px-5 py-3 text-right">Subtotal Neto</th><th className="px-5 py-3 text-right w-[140px]">Distribución</th></>}
                  {vista==="canal"   && <><th className="px-5 py-3 text-left">Canal de Venta</th><th className="px-5 py-3 text-right">Facturas</th><th className="px-5 py-3 text-right">Subtotal Neto</th><th className="px-5 py-3 text-right w-[140px]">Distribución</th></>}
                </tr>
              </thead>
              <tbody>
                {vista==="producto" && porProducto.map((r,i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-800 uppercase text-[11px]">{r.nombre}</td>
                    <td className="px-5 py-3 text-right text-gray-600 font-medium">{fmtN(r.cantidad)}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                    <td className="px-5 py-3 text-right"><div className="flex items-center justify-end gap-2">
                      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{width:totalNeto>0?`${(r.total/totalNeto)*100}%`:"0%"}}/></div>
                      <span className="text-[10px] text-gray-500 w-10 text-right font-medium">{pct(r.total,totalNeto)}</span>
                    </div></td>
                  </tr>
                ))}
                {vista==="tercero" && porTercero.map((r,i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-800 uppercase text-[11px]">{r.nombre}</td>
                    <td className="px-5 py-3 text-right text-gray-600 font-medium">{fmtN(r.facturas)}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                    <td className="px-5 py-3 text-right"><div className="flex items-center justify-end gap-2">
                      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{width:totalNeto>0?`${(r.total/totalNeto)*100}%`:"0%"}}/></div>
                      <span className="text-[10px] text-gray-500 w-10 text-right font-medium">{pct(r.total,totalNeto)}</span>
                    </div></td>
                  </tr>
                ))}
                {vista==="pago" && porPago.map((r,i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-800 uppercase text-[11px]">{r.medio}</td>
                    <td className="px-5 py-3 text-right text-gray-600 font-medium">{fmtN(r.facturas)}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                    <td className="px-5 py-3 text-right"><div className="flex items-center justify-end gap-2">
                      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{width:totalNeto>0?`${(r.total/totalNeto)*100}%`:"0%"}}/></div>
                      <span className="text-[10px] text-gray-500 w-10 text-right font-medium">{pct(r.total,totalNeto)}</span>
                    </div></td>
                  </tr>
                ))}
                {vista==="domicilio" && porDomicilio.map((r,i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-semibold text-gray-700 text-[11px]">{r.nro}</td>
                    <td className="px-5 py-3 font-medium text-gray-700 uppercase text-[10px]">{r.cliente}</td>
                    <td className="px-5 py-3 text-gray-500 text-[10px]">{r.fecha}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(r.subtotal)}</td>
                    <td className="px-5 py-3 text-right text-gray-500 font-medium">{r.envio>0?fmt(r.envio):"—"}</td>
                    <td className="px-5 py-3"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[9px] font-semibold uppercase">{r.medio}</span></td>
                    <td className="px-5 py-3 text-right"><div className="flex items-center justify-end gap-2">
                      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{width:totalDomicilio>0?`${(r.subtotal/totalDomicilio)*100}%`:"0%"}}/></div>
                      <span className="text-[10px] text-gray-500 w-10 text-right font-medium">{pct(r.subtotal,totalDomicilio)}</span>
                    </div></td>
                  </tr>
                ))}
                {vista==="credito" && porCredito.map((r,i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-[11px]">
                      <span className="font-semibold text-gray-700">{r.nro}</span>
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase ${
                        r.estado==="PENDIENTE"?"bg-amber-50 text-amber-600":r.estado==="ANULADA"?"bg-gray-100 text-gray-400":"bg-emerald-50 text-emerald-600"
                      }`}>{r.estado}</span>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-700 uppercase text-[10px]">{r.cliente}</td>
                    <td className="px-5 py-3 text-gray-500 text-[10px]">{r.fecha}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(r.subtotal)}</td>
                    <td className="px-5 py-3 text-right"><div className="flex items-center justify-end gap-2">
                      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{width:totalCreditoTotal>0?`${(r.subtotal/totalCreditoTotal)*100}%`:"0%"}}/></div>
                      <span className="text-[10px] text-gray-500 w-10 text-right font-medium">{pct(r.subtotal,totalCreditoTotal)}</span>
                    </div></td>
                  </tr>
                ))}
                {vista==="canal" && porCanal.map((r,i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CANAL_COLOR[r.canal] || "#6366f1" }} />
                        <span className="font-semibold text-gray-800">{r.canal}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600 font-medium">{fmtN(r.facturas)}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                    <td className="px-5 py-3 text-right"><div className="flex items-center justify-end gap-2">
                      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width:totalCanal>0?`${(r.total/totalCanal)*100}%`:"0%", backgroundColor: CANAL_COLOR[r.canal] || "#6366f1" }} />
                      </div>
                      <span className="text-[10px] text-gray-500 w-10 text-right font-medium">{pct(r.total,totalCanal)}</span>
                    </div></td>
                  </tr>
                ))}
                {((vista==="producto"&&!porProducto.length)||(vista==="tercero"&&!porTercero.length)||
                  (vista==="pago"&&!porPago.length)||(vista==="domicilio"&&!porDomicilio.length)||
                  (vista==="credito"&&!porCredito.length)||(vista==="canal"&&!porCanal.length)) && (
                  <tr><td colSpan={6} className="py-12 text-center text-gray-300 text-[10px] uppercase tracking-widest font-semibold">Sin datos en este período</td></tr>
                )}
              </tbody>
              {/* Footer totales */}
              {vista==="producto"&&porProducto.length>0&&<tfoot><tr className="border-t border-gray-200 bg-gray-50/50">
                <td className="px-5 py-3 font-semibold text-gray-500 uppercase text-[10px] tracking-widest">Total</td>
                <td className="px-5 py-3 text-right font-bold text-gray-700">{fmtN(totalProductosUnd)}</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(porProducto.reduce((s,r)=>s+r.total,0))}</td>
                <td className="px-5 py-3 text-right text-[10px] text-gray-400 font-medium">100%</td>
              </tr></tfoot>}
              {vista==="tercero"&&porTercero.length>0&&<tfoot><tr className="border-t border-gray-200 bg-gray-50/50">
                <td className="px-5 py-3 font-semibold text-gray-500 uppercase text-[10px] tracking-widest">Total</td>
                <td className="px-5 py-3 text-right font-bold text-gray-700">{fmtN(totalFacturas)}</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(totalNeto)}</td>
                <td className="px-5 py-3 text-right text-[10px] text-gray-400 font-medium">100%</td>
              </tr></tfoot>}
              {vista==="pago"&&porPago.length>0&&<tfoot><tr className="border-t border-gray-200 bg-gray-50/50">
                <td className="px-5 py-3 font-semibold text-gray-500 uppercase text-[10px] tracking-widest">Total</td>
                <td className="px-5 py-3 text-right font-bold text-gray-700">{fmtN(totalFacturas)}</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(totalNeto)}</td>
                <td className="px-5 py-3 text-right text-[10px] text-gray-400 font-medium">100%</td>
              </tr></tfoot>}
              {vista==="domicilio"&&porDomicilio.length>0&&<tfoot><tr className="border-t border-gray-200 bg-gray-50/50">
                <td colSpan={3} className="px-5 py-3 font-semibold text-gray-500 uppercase text-[10px] tracking-widest">Total ({porDomicilio.length} domicilios)</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(totalDomicilio)}</td>
                <td className="px-5 py-3 text-right font-bold text-gray-700">{fmt(totalEnvios)}</td>
                <td/><td className="px-5 py-3 text-right text-[10px] text-gray-400 font-medium">100%</td>
              </tr></tfoot>}
              {vista==="credito"&&porCredito.length>0&&<tfoot><tr className="border-t border-gray-200 bg-gray-50/50">
                <td colSpan={3} className="px-5 py-3 font-semibold text-gray-500 uppercase text-[10px] tracking-widest">Pendiente: {fmt(totalCreditoPend)}</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(totalCreditoTotal)}</td>
                <td className="px-5 py-3 text-right text-[10px] text-gray-400 font-medium">100%</td>
              </tr></tfoot>}
              {vista==="canal"&&porCanal.length>0&&<tfoot><tr className="border-t border-gray-200 bg-gray-50/50">
                <td className="px-5 py-3 font-semibold text-gray-500 uppercase text-[10px] tracking-widest">Total</td>
                <td className="px-5 py-3 text-right font-bold text-gray-700">{fmtN(totalFacturas)}</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(totalCanal)}</td>
                <td className="px-5 py-3 text-right text-[10px] text-gray-400 font-medium">100%</td>
              </tr></tfoot>}
            </table>
          </div>
        </div>
      </div>

      {/* ── DRAWER: Ventas por Categoría en $ ──────────────────────────────── */}
      {showCatDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowCatDrawer(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-sm bg-white h-full flex flex-col shadow-2xl border-l border-gray-200">

            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Reportes · {etiqueta}</p>
                  <h2 className="text-base font-bold text-gray-900 uppercase tracking-tight">Ventas por Categoría</h2>
                </div>
                <button
                  onClick={() => setShowCatDrawer(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Donut ampliado */}
            <div className="px-6 py-5 flex flex-col items-center border-b border-gray-100 shrink-0">
              <DonutChart data={donutData} size={200} />
              <p className="text-[10px] text-gray-400 font-medium mt-2">
                Total: <span className="text-gray-700 font-bold">{fmt(totalCat)}</span>
              </p>
            </div>

            {/* Lista con valores en $ */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Detalle por categoría</p>
              <div className="space-y-3">
                {porCategoria.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PALETTE[i] ?? "#d1d5db" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-gray-700 truncate capitalize">
                          {r.label.toLowerCase()}
                        </span>
                        <span className="text-[11px] font-bold text-gray-900 shrink-0 ml-2">{fmt(r.value)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: totalCat > 0 ? `${(r.value / totalCat) * 100}%` : "0%",
                              backgroundColor: PALETTE[i] ?? "#d1d5db",
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-400 font-medium shrink-0 w-10 text-right">
                          {pct(r.value, totalCat)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
