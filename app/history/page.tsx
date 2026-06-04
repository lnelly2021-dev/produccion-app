"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, FileDown, FileText, ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { getEmpresaConfig } from "../../lib/empresaStorage";

export default function HistoryPage() {
  const { branch } = useAuth();
  const branchId   = branch?.id || "";
  const [historial, setHistorial] = useState<any[]>([]);
  const [tipoRango, setTipoRango] = useState("Diario");
  const [fechaBase, setFechaBase] = useState(new Date().toLocaleDateString("en-CA"));
  const [menuOpen,  setMenuOpen]  = useState(false);
  const menuRef   = useRef<HTMLDivElement>(null);
  const dateRef   = useRef<HTMLInputElement>(null);

  const histKey = branchId ? `historial_mesas_${branchId}` : "historial_mesas";

  useEffect(() => {
    const local: any[] = JSON.parse(localStorage.getItem(histKey) || "[]");
    if (branchId) {
      Promise.all([
        api.get(`/branches/${branchId}/mesas`),
        api.get(`/branches/${branchId}/ventas`),
      ]).then(([mesasRes, ventasRes]) => {
        const mesasMap: Record<string, string> = {};
        (mesasRes.data.data ?? mesasRes.data ?? []).forEach((m: any) => {
          mesasMap[String(m._id)] = m.nombre || `Mesa ${m.numero}`;
        });
        const ventasMesas = (ventasRes.data.data || [])
          .filter((v: any) => v.mesa)
          .map((v: any) => ({
            ...v, id: v._id, fecha: v.createdAt || v.fecha,
            mesaId: String(v.mesa),
            mesaNombre: mesasMap[String(v.mesa)] || "Mesa",
            nroFactura: v.nroFactura,
            valor:    Number(v.valor)     || 0,
            subtotal: Number(v.subtotal)  || 0,
            descuento:Number(v.descuento) || 0,
            propina:  Number(v.propina)   || 0,
            envio:    Number(v.envio)     || 0,
            productos: v.productos || [],
          }))
          .sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        setHistorial(ventasMesas);
        localStorage.setItem(histKey, JSON.stringify(ventasMesas));
      }).catch(() => setHistorial(local));
    } else {
      setHistorial(local);
    }
  }, [branchId, histKey]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const obtenerRango = () => {
    const inicio = new Date(fechaBase + "T00:00:00");
    const fin    = new Date(fechaBase + "T23:59:59");
    if (tipoRango === "Semanal") {
      const d = inicio.getDay();
      inicio.setDate(inicio.getDate() - (d === 0 ? 6 : d - 1));
      fin.setDate(inicio.getDate() + 6);
    } else if (tipoRango === "Quincenal") {
      if (inicio.getDate() <= 15) { inicio.setDate(1); fin.setDate(15); }
      else { inicio.setDate(16); fin.setMonth(inicio.getMonth() + 1, 0); }
    } else if (tipoRango === "Mensual") {
      inicio.setDate(1); fin.setMonth(inicio.getMonth() + 1, 0);
    } else if (tipoRango === "Anual") {
      inicio.setMonth(0, 1); fin.setMonth(11, 31);
    }
    fin.setHours(23, 59, 59);
    const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
    const label = tipoRango === "Diario"
      ? new Date(fechaBase + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })
      : tipoRango === "Mensual"
      ? new Date(fechaBase + "T12:00:00").toLocaleDateString("es-CO", { month: "long", year: "numeric" }).toUpperCase()
      : tipoRango === "Anual"
      ? `AÑO ${new Date(fechaBase + "T12:00:00").getFullYear()}`
      : `${fmt(inicio)} – ${fmt(fin)}`;
    return { inicio, fin, label };
  };

  const { inicio, fin, label: etiqueta } = obtenerRango();

  const enRango = historial.filter(v => {
    if (!v.fecha) return false;
    const f = new Date(v.fecha);
    return f >= inicio && f <= fin;
  });

  // Acumulados
  const totalDescuentos = enRango.reduce((a, v) => a + (Number(v.descuento) || 0), 0);
  const totalVentas     = enRango.reduce((a, v) => a + (Number(v.subtotal) || (v.valor - (Number(v.propina)||0))), 0) - totalDescuentos;
  const totalPropinas   = enRango.reduce((a, v) => a + (Number(v.propina) || 0), 0);

  // Agrupar por mesa
  const resumenMesas = () => {
    const g: any = {};
    enRango.forEach(v => {
      const key = v.mesaNombre || v.mesaId || "S/N";
      if (!g[key]) g[key] = { mesaNombre: key, total: 0, descuento: 0, propina: 0, servicios: 0, productos: {} };
      g[key].total     += (Number(v.subtotal) || (v.valor - (Number(v.propina)||0)));
      g[key].descuento += (Number(v.descuento) || 0);
      g[key].propina   += (Number(v.propina) || 0);
      g[key].servicios += 1;
      (v.productos || []).forEach((p: any) => {
        if (!g[key].productos[p.nombre]) g[key].productos[p.nombre] = { cantidad: 0, precio: p.precio || 0 };
        g[key].productos[p.nombre].cantidad += (p.cantidad || 1);
      });
    });
    return Object.values(g).sort((a: any, b: any) => a.mesaNombre.localeCompare(b.mesaNombre));
  };

  // Agrupar por mesero
  const resumenMeseros = () => {
    const g: any = {};
    enRango.forEach(v => {
      const key = (v.mesero || "SIN ASIGNAR").toUpperCase().trim();
      if (!g[key]) g[key] = { mesero: key, servicios: 0, ventas: 0, propinas: 0 };
      g[key].servicios++;
      g[key].ventas   += (Number(v.subtotal) || (v.valor - (Number(v.propina)||0)));
      g[key].propinas += (Number(v.propina) || 0);
    });
    return Object.values(g).sort((a: any, b: any) => a.mesero.localeCompare(b.mesero));
  };

  // Agrupar por producto (global)
  const resumenProductos = () => {
    const g: any = {};
    enRango.forEach(v => {
      (v.productos || []).forEach((p: any) => {
        if (!g[p.nombre]) g[p.nombre] = { nombre: p.nombre, precio: p.precio || 0, cantidad: 0, total: 0 };
        g[p.nombre].cantidad += (p.cantidad || 1);
        g[p.nombre].total    += (p.precio || 0) * (p.cantidad || 1);
      });
    });
    return Object.values(g).sort((a: any, b: any) => (a as any).nombre.localeCompare((b as any).nombre));
  };

  const emp = getEmpresaConfig();

  // ── Exports ────────────────────────────────────────────────────────────
  const exportPdfMesero = () => {
    const rows = (resumenMeseros() as any[]).map(m =>
      `<tr>
        <td style="padding:5px 8px">${m.mesero}</td>
        <td style="padding:5px 8px;text-align:center">${m.servicios}</td>
        <td style="padding:5px 8px;text-align:right">$${m.ventas.toLocaleString("es-CO")}</td>
        <td style="padding:5px 8px;text-align:right;color:#059669">${m.propinas > 0 ? "$"+m.propinas.toLocaleString("es-CO") : "—"}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:bold">$${(m.ventas+m.propinas).toLocaleString("es-CO")}</td>
      </tr>`
    ).join("");
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
      <div class="sub">Reporte por Mesero &nbsp;|&nbsp; Período: ${etiqueta} &nbsp;|&nbsp; ${new Date().toLocaleString("es-CO")}</div>
      <table><thead><tr><th>Mesero</th><th># Servicios</th><th>Ventas</th><th>Propinas</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tot"><td>TOTAL</td><td style="text-align:center">${(resumenMeseros() as any[]).reduce((a,m)=>a+m.servicios,0)}</td><td style="text-align:right">$${totalVentas.toLocaleString("es-CO")}</td><td style="text-align:right">$${totalPropinas.toLocaleString("es-CO")}</td><td style="text-align:right">$${(totalVentas+totalPropinas).toLocaleString("es-CO")}</td></tr></tfoot>
      </table><script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  const exportExcelMesa = () => {
    const filas = resumenMesas().map((m: any) => ({
      "Mesa":       m.mesaNombre,
      "Subtotal":   m.total,
      "Descuento":  m.descuento > 0 ? -m.descuento : 0,
      "Propina":    m.propina,
      "Total":      m.total - m.descuento + m.propina,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Por Mesa");
    XLSX.writeFile(wb, `HistorialMesas_${fechaBase}.xlsx`);
  };

  const exportExcelProducto = () => {
    const filas = (resumenProductos() as any[]).map(p => ({
      "Producto": p.nombre,
      "P. Unidad": p.precio,
      "Cant. Total": p.cantidad,
      "Total": p.total,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Por Producto");
    XLSX.writeFile(wb, `HistorialProductos_${fechaBase}.xlsx`);
  };

  const pdfHeader = `<h1 style="font-size:15px;font-weight:900;text-transform:uppercase;margin:0">${emp.nombreEmpresa || "MI EMPRESA"}</h1>
    <div style="font-size:10px;color:#666;margin-bottom:12px">Período: ${etiqueta} &nbsp;|&nbsp; Generado: ${new Date().toLocaleString("es-CO")}</div>`;

  const exportPdfMesa = () => {
    const rows = (resumenMesas() as any[]).map(m =>
      `<tr>
        <td style="padding:5px 8px">${m.mesaNombre}</td>
        <td style="padding:5px 8px;text-align:right">$${m.total.toLocaleString("es-CO")}</td>
        <td style="padding:5px 8px;text-align:right;color:#ef4444">${m.descuento > 0 ? "-$" + m.descuento.toLocaleString("es-CO") : "—"}</td>
        <td style="padding:5px 8px;text-align:right;color:#059669">${m.propina > 0 ? "$" + m.propina.toLocaleString("es-CO") : "—"}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:bold">$${(m.total - m.descuento + m.propina).toLocaleString("es-CO")}</td>
      </tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:24px 32px;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th{background:#1e293b;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;text-align:left}
      th:not(:first-child),td:not(:first-child){text-align:right}
      td{padding:5px 8px;border-bottom:1px solid #f1f5f9}
      .tot td{font-weight:900;background:#f8fafc}
      @media print{@page{margin:10mm;size:A4}}</style></head><body>
      ${pdfHeader}
      <div style="font-size:13px;font-weight:900;margin-bottom:8px">HISTORIAL POR MESA</div>
      <table><thead><tr><th>Mesa</th><th>Subtotal</th><th>Descuento</th><th>Propina</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tot"><td>TOTAL</td><td style="text-align:right">$${(totalVentas + totalDescuentos).toLocaleString("es-CO")}</td><td style="text-align:right;color:#ef4444">${totalDescuentos > 0 ? "-$"+totalDescuentos.toLocaleString("es-CO") : "—"}</td><td style="text-align:right">$${totalPropinas.toLocaleString("es-CO")}</td><td style="text-align:right">$${(totalVentas+totalPropinas).toLocaleString("es-CO")}</td></tr></tfoot>
      </table><script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  const exportPdfProducto = () => {
    const rows = (resumenProductos() as any[]).map(p =>
      `<tr>
        <td style="padding:5px 8px">${p.nombre}</td>
        <td style="padding:5px 8px;text-align:right">$${p.precio.toLocaleString("es-CO")}</td>
        <td style="padding:5px 8px;text-align:center">${p.cantidad}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:bold">$${p.total.toLocaleString("es-CO")}</td>
      </tr>`
    ).join("");
    const grandTotal = (resumenProductos() as any[]).reduce((a, p) => a + p.total, 0);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:24px 32px;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th{background:#1e293b;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;text-align:left}
      th:nth-child(2),th:last-child,td:nth-child(2),td:last-child{text-align:right}
      th:nth-child(3),td:nth-child(3){text-align:center}
      td{padding:5px 8px;border-bottom:1px solid #f1f5f9}
      .tot td{font-weight:900;background:#f8fafc}
      @media print{@page{margin:10mm;size:A4}}</style></head><body>
      ${pdfHeader}
      <div style="font-size:13px;font-weight:900;margin-bottom:8px">HISTORIAL POR PRODUCTO</div>
      <table><thead><tr><th>Producto</th><th>P. Unidad</th><th>Cant.</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="tot"><td colspan="3">TOTAL</td><td style="text-align:right">$${grandTotal.toLocaleString("es-CO")}</td></tr></tfoot>
      </table><script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">

      {/* CABECERA FIJA */}
      <div className="p-6 bg-gray-50 z-30 shrink-0">
        <h1 className="text-lg font-black text-gray-800 uppercase tracking-tighter mb-4">Historial de Mesas</h1>

        {/* Recuadros */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="bg-white px-5 py-3.5 rounded-2xl shadow-sm border-l-4 border-gray-700 min-w-[180px]">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Ventas Netas Mesas</p>
            <p className="text-2xl font-black text-gray-800">${totalVentas.toLocaleString()}</p>
            {totalDescuentos > 0 && <p className="text-[8px] text-gray-400 mt-0.5">Subtotal − desc.</p>}
          </div>
          {totalDescuentos > 0 && (
            <div className="bg-white px-5 py-3.5 rounded-2xl shadow-sm border-l-4 border-red-400 min-w-[150px]">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Descuentos</p>
              <p className="text-2xl font-black text-red-500">-${totalDescuentos.toLocaleString()}</p>
            </div>
          )}
          {totalPropinas > 0 && (
            <div className="bg-white px-5 py-3.5 rounded-2xl shadow-sm border-l-4 border-emerald-500 min-w-[150px]">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Propinas</p>
              <p className="text-2xl font-black text-emerald-600">${totalPropinas.toLocaleString()}</p>
            </div>
          )}
          <div className="bg-white px-5 py-3.5 rounded-2xl shadow-sm border-l-4 border-blue-400 min-w-[180px]">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Recibido</p>
            <p className="text-2xl font-black text-blue-600">${(totalVentas + totalPropinas).toLocaleString()}</p>
          </div>
        </div>

        {/* Filtros + Exportar */}
        <div className="flex gap-3 items-center flex-wrap">
          <select value={tipoRango} onChange={e => setTipoRango(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none shadow-sm">
            {["Diario","Semanal","Quincenal","Mensual","Anual"].map(o => <option key={o}>{o}</option>)}
          </select>

          <div onClick={() => dateRef.current?.showPicker()}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 cursor-pointer shadow-sm min-w-[200px] relative">
            <CalendarDays size={13} className="text-blue-500 shrink-0" />
            <span className="text-[10px] font-black text-blue-600 uppercase">{etiqueta}</span>
            <input ref={dateRef} type="date" value={fechaBase} onChange={e => setFechaBase(e.target.value)}
              className="absolute inset-0 opacity-0 pointer-events-none" />
          </div>

          {/* Dropdown exportar */}
          <div className="relative ml-auto" ref={menuRef}>
            <button onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm">
              <FileDown size={13} /> Exportar <ChevronDown size={11} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden w-52">
                <p className="px-4 pt-3 pb-1 text-[8px] font-black text-gray-400 uppercase tracking-widest">Excel</p>
                <button onClick={() => { exportExcelMesa(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileDown size={12} className="text-emerald-500" /> Por Mesa
                </button>
                <button onClick={() => { exportExcelProducto(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileDown size={12} className="text-emerald-500" /> Por Producto
                </button>
                <div className="border-t border-gray-100 my-1" />
                <p className="px-4 pt-1 pb-1 text-[8px] font-black text-gray-400 uppercase tracking-widest">PDF</p>
                <button onClick={() => { exportPdfMesa(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileText size={12} className="text-gray-500" /> Por Mesa
                </button>
                <button onClick={() => { exportPdfProducto(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileText size={12} className="text-gray-500" /> Por Producto
                </button>
                <button onClick={() => { exportPdfMesero(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileText size={12} className="text-emerald-500" /> Por Mesero
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TARJETAS */}
      <div className="flex-1 overflow-auto px-6 pb-10">
        <div className="max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5">
          {resumenMesas().length === 0 ? (
            <div className="col-span-full text-center p-20 bg-white rounded-3xl border-2 border-dashed border-gray-200">
              <p className="text-gray-400 font-black uppercase text-xs tracking-widest">Sin actividad en este periodo</p>
            </div>
          ) : (
            resumenMesas().map((mesa: any) => (
              <div key={mesa.mesaNombre} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center text-white font-black text-sm">
                      {mesa.mesaNombre.replace(/[^0-9]/g, "") || "?"}
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Mesa</p>
                      <p className="text-[9px] font-bold text-gray-500">{mesa.servicios} servicio{mesa.servicios !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-gray-900">${mesa.total.toLocaleString()}</p>
                    {mesa.descuento > 0 && (
                      <p className="text-[9px] font-bold text-red-500">Desc: -${mesa.descuento.toLocaleString()}</p>
                    )}
                    {mesa.propina > 0 && (
                      <p className="text-[9px] font-bold text-emerald-500">Propina: +${mesa.propina.toLocaleString()}</p>
                    )}
                  </div>
                </div>

                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-gray-100 text-gray-600 font-black uppercase">
                      <tr>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2 text-center">Cant</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Object.entries(mesa.productos).map(([nombre, data]: any, i) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-700 font-bold uppercase">{nombre}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-black">{data.cantidad}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-500">${data.precio?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
