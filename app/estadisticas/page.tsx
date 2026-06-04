"use client";
import { useState, useEffect } from "react";
import { ChevronDown, CalendarDays, FileDown, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { getEmpresaConfig } from "../../lib/empresaStorage";

export default function EstadisticasPage() {
  const { branch } = useAuth();
  const branchId   = branch?.id || "";
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [tipoRango, setTipoRango] = useState("Diario");
  const [fechaBase, setFechaBase] = useState(new Date().toLocaleDateString("en-CA"));

  const movKey = branchId ? `movimientos_${branchId}` : "movimientos";

  useEffect(() => {
    const egresos = JSON.parse(localStorage.getItem(movKey) || "[]")
      .filter((m: any) => m.categoria === "egreso");

    if (branchId) {
      api.get(`/branches/${branchId}/ventas`)
        .then(({ data }) => {
          const ventas = (data.data || []).map((v: any) => ({
            ...v, id: v._id, fecha: v.createdAt || v.fecha,
            categoria: "ingreso", valor: Number(v.valor) || 0,
          }));
          const todos = [...ventas, ...egresos].sort((a, b) =>
            new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
          );
          setMovimientos(todos);
          localStorage.setItem(movKey, JSON.stringify(todos));
        })
        .catch(() => setMovimientos(JSON.parse(localStorage.getItem(movKey) || "[]")));
    } else {
      setMovimientos(JSON.parse(localStorage.getItem(movKey) || "[]"));
    }
  }, [branchId, movKey]);

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
    return { inicio, fin };
  };

  const { inicio, fin } = obtenerRango();

  const etiqueta = (() => {
    const base = new Date(fechaBase + "T12:00:00");
    const opc: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
    if (tipoRango === "Diario")   return base.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
    if (tipoRango === "Mensual")  return base.toLocaleDateString("es-CO", { month: "long", year: "numeric" }).toUpperCase();
    if (tipoRango === "Anual")    return `AÑO ${base.getFullYear()}`;
    return `${inicio.toLocaleDateString("es-CO", opc)} – ${fin.toLocaleDateString("es-CO", opc)}`;
  })();

  const datosFiltrados = movimientos.filter(m => {
    const t = new Date(m.fecha).getTime();
    return t >= inicio.getTime() && t <= fin.getTime();
  });

  const ventasActivas  = datosFiltrados.filter(m => m.categoria === "ingreso" && m.estado !== "ANULADA");
  const subtotalVentas = ventasActivas.reduce((acc, m) => acc + (Number(m.subtotal) || (m.valor - (Number(m.propina)||0) - (Number(m.impuesto)||0) - (Number(m.envio)||0))), 0);
  const totalPropinas  = ventasActivas.reduce((acc, m) => acc + (Number(m.propina) || 0), 0);
  const totalDomicilios= ventasActivas.reduce((acc, m) => acc + (Number(m.envio)   || 0), 0);
  const totalImpuestos = ventasActivas.reduce((acc, m) => acc + (Number(m.impuesto)|| 0), 0);
  const totalVentas    = ventasActivas.reduce((acc, m) => acc + m.valor, 0);

  const obtenerMasVendidos = () => {
    const conteo: Record<string, { cantidad: number; valor: number }> = {};
    ventasActivas.forEach(m => {
      if (m.productos) {
        m.productos.forEach((p: any) => {
          if (!conteo[p.nombre]) conteo[p.nombre] = { cantidad: 0, valor: 0 };
          conteo[p.nombre].cantidad += Number(p.cantidad) || 0;
          conteo[p.nombre].valor    += (Number(p.subtotal) || (Number(p.precio) * Number(p.cantidad))) || 0;
        });
      }
    });
    return Object.entries(conteo).sort((a, b) => b[1].cantidad - a[1].cantidad);
  };

  const masVendidos = obtenerMasVendidos();

  const exportarExcel = () => {
    const filas = masVendidos.map(([nombre, d]) => ({
      Producto:    nombre.toUpperCase(),
      Cantidad:    d.cantidad,
      "Valor Total": d.valor,
    }));
    filas.push({ Producto: "TOTAL VENTAS", Cantidad: 0, "Valor Total": totalVentas });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estadísticas");
    XLSX.writeFile(wb, `Estadisticas_${fechaBase}.xlsx`);
  };

  const exportarPDF = () => {
    const emp = getEmpresaConfig();
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Estadísticas</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:24px 32px;font-size:12px;color:#222}
h1{font-size:15px;font-weight:900;text-transform:uppercase;margin-bottom:2px}
.sub{font-size:10px;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#1e293b;color:#fff;padding:5px 8px;font-size:9px;text-transform:uppercase;text-align:left}
th.r,td.r{text-align:right}th.c,td.c{text-align:center}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:11px}
.tot td{font-weight:900;background:#f8fafc;font-size:12px}
@media print{@page{margin:10mm;size:A4}}</style></head><body>
<h1>${emp.nombreEmpresa || "MI EMPRESA"} — ESTADÍSTICAS DE VENTA</h1>
<div class="sub">Período: ${etiqueta} &nbsp;|&nbsp; Generado: ${new Date().toLocaleString("es-CO")}</div>
<table><thead><tr>
  <th>Producto</th><th class="c">Cant.</th><th class="r">Valor Total</th>
</tr></thead><tbody>
${masVendidos.map(([nombre, d]) => `<tr>
  <td>${nombre.toUpperCase()}</td>
  <td class="c">${d.cantidad}</td>
  <td class="r">$${d.valor.toLocaleString("es-CO")}</td>
</tr>`).join("")}
</tbody><tfoot>
  <tr class="tot"><td>TOTAL VENTAS</td><td></td><td class="r">$${totalVentas.toLocaleString("es-CO")}</td></tr>
</tfoot></table>
<script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">

      {/* SECCIÓN FIJA */}
      <div className="p-6 bg-gray-50 z-30">
        <div className="mb-6">
          <h1 className="text-lg font-black text-gray-800 uppercase tracking-tighter mb-4">Estadísticas de Venta</h1>

          <div className="flex flex-wrap gap-3">
            <div className="bg-white p-5 rounded-[2rem] shadow-sm border-l-4 border-green-500 min-w-[200px]">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Ventas Netas</p>
              <p className="text-2xl font-black text-green-600">${subtotalVentas.toLocaleString()}</p>
            </div>
            {totalPropinas > 0 && (
              <div className="bg-white p-5 rounded-[2rem] shadow-sm border-l-4 border-purple-400 min-w-[160px]">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Propinas</p>
                <p className="text-xl font-black text-purple-600">${totalPropinas.toLocaleString()}</p>
              </div>
            )}
            {totalDomicilios > 0 && (
              <div className="bg-white p-5 rounded-[2rem] shadow-sm border-l-4 border-orange-400 min-w-[160px]">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Domicilios</p>
                <p className="text-xl font-black text-orange-500">${totalDomicilios.toLocaleString()}</p>
              </div>
            )}
            {totalImpuestos > 0 && (
              <div className="bg-white p-5 rounded-[2rem] shadow-sm border-l-4 border-amber-400 min-w-[160px]">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Impuestos</p>
                <p className="text-xl font-black text-amber-600">${totalImpuestos.toLocaleString()}</p>
              </div>
            )}
            <div className="bg-white p-5 rounded-[2rem] shadow-sm border-l-4 border-gray-300 min-w-[200px]">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Facturación</p>
              <p className="text-xl font-black text-gray-700">${totalVentas.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* FILTROS + EXPORTAR */}
        <div className="flex gap-3 mb-2 items-center flex-wrap">
          <div className="relative">
            <select
              value={tipoRango}
              onChange={(e) => setTipoRango(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-5 py-3 pr-10 text-xs font-black uppercase shadow-sm outline-none appearance-none cursor-pointer"
            >
              <option>Diario</option>
              <option>Semanal</option>
              <option>Quincenal</option>
              <option>Mensual</option>
              <option>Anual</option>
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm relative min-w-[240px] justify-between group">
            <span className="text-xs font-black text-blue-600 uppercase pointer-events-none">
              {tipoRango === "Diario" ? fechaBase : `${inicio.toLocaleDateString("es-CO", { day:"2-digit", month:"short" })} | ${fin.toLocaleDateString("es-CO", { day:"2-digit", month:"short" })}`}
            </span>
            <input
              type="date"
              value={fechaBase}
              onChange={(e) => setFechaBase(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
              onClick={(e) => (e.target as any).showPicker?.()}
            />
            <CalendarDays size={16} className="text-gray-400 z-10" />
          </div>

          <button onClick={exportarExcel}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 px-4 py-3 rounded-xl text-[9px] font-black uppercase hover:bg-gray-50 shadow-sm transition-all">
            <FileDown size={13} /> Excel
          </button>
          <button onClick={exportarPDF}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 px-4 py-3 rounded-xl text-[9px] font-black uppercase hover:bg-gray-50 shadow-sm transition-all">
            <FileText size={13} /> PDF
          </button>
        </div>
      </div>

      {/* TABLA */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-40">
              <tr className="bg-gray-100/80 border-y border-gray-200">
                <th className="p-4 text-gray-600 uppercase text-[10px] font-black tracking-wider first:rounded-tl-2xl">Producto</th>
                <th className="p-4 text-gray-600 uppercase text-[10px] font-black tracking-wider text-center">Cant.</th>
                <th className="p-4 text-gray-600 uppercase text-[10px] font-black tracking-wider text-right last:rounded-tr-2xl">Valor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {masVendidos.length === 0 && (
                <tr><td colSpan={3} className="py-16 text-center text-[10px] font-black text-gray-200 uppercase">Sin datos para el período</td></tr>
              )}
              {masVendidos.map(([nombre, data]) => (
                <tr key={nombre} className="hover:bg-blue-50/30 transition-colors">
                  <td className="p-5 text-xs font-bold text-gray-700 uppercase">{nombre}</td>
                  <td className="p-5 text-center">
                    <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black">
                      {data.cantidad}
                    </span>
                  </td>
                  <td className="p-5 text-right text-xs font-black text-gray-900">
                    ${data.valor.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
