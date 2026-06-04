"use client";
import { useState, useEffect, useRef } from "react";
import { Search, X, FileDown, FileText, Plus, Package } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig } from "../../lib/empresaStorage";

export default function InventariosPage() {
  const { branch } = useAuth();
  const branchId   = branch?.id || "";

  const [productos, setProductos]     = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [salidasProd, setSalidasProd] = useState<any[]>([]);
  const [busqueda, setBusqueda]       = useState("");
  const [catFiltro, setCatFiltro]     = useState("TODAS");
  const [tipoRango, setTipoRango]     = useState("Diario");
  const [fechaBase, setFechaBase]     = useState(new Date().toLocaleDateString("en-CA"));
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [catFiltroDrawer, setCatFiltroDrawer] = useState("TODAS");

  // Producción drawer state
  const [itemsProd, setItemsProd]       = useState<{productoId:string,nombre:string,cantidad:number}[]>([]);
  const [prodTemp, setProdTemp]         = useState("");
  const [cantProdTemp, setCantProdTemp] = useState("");
  const [notasProd, setNotasProd]       = useState("");

  const dateInputRef = useRef<HTMLInputElement>(null);
  const movKey  = branchId ? `movimientos_${branchId}` : "movimientos";
  const prodKey = branchId ? `productos_${branchId}` : "productos";

  useEffect(() => {
    setSalidasProd(JSON.parse(localStorage.getItem("salidas_producto") || "[]"));

    // Movimientos locales: solo conservar entradas de producción (no ventas)
    // Las ventas se cargan siempre desde la API para evitar datos obsoletos
    const localMov = JSON.parse(localStorage.getItem(movKey) || "[]");
    const soloProduccion = localMov.filter((m: any) =>
      (m.categoria === "egreso" && m.esInventario) || m.esProduccion
    );

    if (branchId) {
      Promise.all([
        api.get(`/branches/${branchId}/products`),
        api.get(`/branches/${branchId}/ventas`),
      ]).then(([pRes, vRes]) => {
        // Productos
        const lista = (pRes.data.data || []).map((p: any) => ({
          ...p, id: p._id || p.id, precio: Number(p.precioPublico) || 0,
        }));
        if (lista.length > 0) {
          setProductos(lista);
          localStorage.setItem(prodKey, JSON.stringify(lista));
        } else {
          setProductos(JSON.parse(localStorage.getItem(prodKey) || "[]"));
        }

        // Ventas frescas desde MongoDB + entradas de producción locales
        const ventas = (vRes.data.data || []).map((v: any) => ({
          ...v, id: v._id, fecha: v.createdAt || v.fecha,
          categoria: "ingreso",
        }));
        const todos = [...ventas, ...soloProduccion].sort((a, b) =>
          new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        );
        setMovimientos(todos);
        localStorage.setItem(movKey, JSON.stringify(todos));
      }).catch(() => {
        setProductos(JSON.parse(localStorage.getItem(prodKey) || "[]"));
        setMovimientos(localMov);
      });
    } else {
      setProductos(JSON.parse(localStorage.getItem(prodKey) || "[]"));
      setMovimientos(localMov);
    }
  }, [branchId, movKey]);

  // ── Rango ───────────────────────────────────────────────────────────────
  const getRango = () => {
    const base = new Date(fechaBase + "T12:00:00");
    let ini = new Date(base); ini.setHours(0,0,0,0);
    let fin = new Date(base); fin.setHours(23,59,59,999);
    let etiqueta = base.toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" });

    if (tipoRango === "Semanal") {
      const d = base.getDay();
      ini.setDate(base.getDate() - (d === 0 ? 6 : d - 1));
      fin = new Date(ini); fin.setDate(ini.getDate() + 6); fin.setHours(23,59,59,999);
      const fmt = (dt: Date) => dt.toLocaleDateString("es-CO", { day:"2-digit", month:"short" });
      etiqueta = `${fmt(ini)} – ${fmt(fin)}`;
    } else if (tipoRango === "Quincenal") {
      if (base.getDate() <= 15) { ini.setDate(1); fin.setDate(15); }
      else { ini.setDate(16); fin = new Date(base.getFullYear(), base.getMonth()+1, 0); fin.setHours(23,59,59,999); }
      const fmt = (dt: Date) => dt.toLocaleDateString("es-CO", { day:"2-digit", month:"short" });
      etiqueta = `${fmt(ini)} – ${fmt(fin)}`;
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

  // ── Helpers de matching ─────────────────────────────────────────────────
  const matchProd = (mov: any, prod: any) => {
    const pId   = String(prod.id);
    const pNom  = (prod.nombre || "").trim().toUpperCase();
    // multi-item (new format)
    if (mov.items) return mov.items.some((i: any) =>
      String(i.productoId) === pId || (i.nombre||"").trim().toUpperCase() === pNom
    );
    // single item (old format)
    if (mov.productoId !== undefined) return String(mov.productoId) === pId;
    return false;
  };

  const getCantEntrada = (mov: any, prod: any) => {
    const pId  = String(prod.id);
    const pNom = (prod.nombre || "").trim().toUpperCase();
    if (mov.items) {
      const it = mov.items.find((i: any) => String(i.productoId) === pId || (i.nombre||"").trim().toUpperCase() === pNom);
      return it ? Number(it.cantidad) : 0;
    }
    return Number(mov.cantidadKardex) || 0;
  };

  const getCantSalida = (mov: any, prod: any) => {
    if (!mov.productos) return 0;
    const pId  = String(prod.id);
    const pNom = (prod.nombre || "").trim().toUpperCase();
    return mov.productos
      .filter((p: any) => String(p.id) === pId || (p.nombre||"").trim().toUpperCase() === pNom)
      .reduce((s: number, p: any) => s + (Number(p.cantidad) || 0), 0);
  };

  // ── Salidas por tipo (Remisión / Avería Frita / Avería) ─────────────────
  const getSalidasTipo = (prod: any, tipo: string) => {
    const nombre = (prod.nombre || "").trim().toUpperCase();
    return salidasProd
      .filter((s: any) => {
        if (s.tipo !== tipo) return false;
        const t = new Date(s.fechaISO || s.fecha).getTime();
        if (t < inicio || t > fin) return false;
        return String(s.productoId) === String(prod.id) || (s.producto || "").toUpperCase() === nombre;
      })
      .reduce((acc: number, s: any) => acc + (Number(s.cantidad) || 0), 0);
  };

  // ── Kardex ──────────────────────────────────────────────────────────────
  const kardex = (prod: any) => {
    const esEntrada = (m: any) => (m.categoria === "egreso" && m.esInventario) || m.esProduccion;
    const esSalida  = (m: any) => m.categoria === "ingreso" && m.productos && m.estado !== "ANULADA";

    // --- totales all-time ---
    const entTot = movimientos.filter(m => esEntrada(m) && matchProd(m, prod))
      .reduce((a, m) => a + getCantEntrada(m, prod), 0);
    const salTot = movimientos.filter(m => esSalida(m))
      .reduce((a, m) => a + getCantSalida(m, prod), 0);

    // Anclar al stock real de MongoDB (siempre correcto) para derivar
    // el stock inicial real: evita que stockInicial incorrecto afecte el kardex
    const stockActual   = Number(prod.stock ?? prod.stockInicial ?? 0);
    const stockIniReal  = stockActual - entTot + salTot;

    // --- antes del periodo ---
    const entAnt = movimientos.filter(m => esEntrada(m) && matchProd(m, prod) && new Date(m.fecha).getTime() < inicio)
      .reduce((a, m) => a + getCantEntrada(m, prod), 0);
    const salAnt = movimientos.filter(m => esSalida(m) && new Date(m.fecha).getTime() < inicio)
      .reduce((a, m) => a + getCantSalida(m, prod), 0);

    const saldoIni = stockIniReal + entAnt - salAnt;

    // --- en el periodo ---
    const inPer = (m: any) => { const t = new Date(m.fecha).getTime(); return t >= inicio && t <= fin; };
    const entPer = movimientos.filter(m => esEntrada(m) && matchProd(m, prod) && inPer(m))
      .reduce((a, m) => a + getCantEntrada(m, prod), 0);
    const salPer = movimientos.filter(m => esSalida(m) && inPer(m))
      .reduce((a, m) => a + getCantSalida(m, prod), 0);

    const remision    = getSalidasTipo(prod, "REMISION");
    const averiaFrita = getSalidasTipo(prod, "AVERIA_FRITA");
    const averia      = getSalidasTipo(prod, "AVERIA");

    return {
      saldoInicio:  saldoIni,
      entradas:     entPer,
      salidas:      salPer,
      remision,
      averiaFrita,
      averia,
      saldoFinal:   saldoIni + entPer - salPer - remision - averiaFrita - averia,
      saldoReal:    stockActual,
    };
  };

  // ── Categorías y filtrado ───────────────────────────────────────────────
  const categorias = ["TODAS", ...Array.from(new Set(productos.map((p: any) => (p.categoria||"").toUpperCase()))).filter(Boolean)];
  const filtrados  = productos.filter(p =>
    ((p.nombre||"").toLowerCase().includes(busqueda.toLowerCase()) || String(p.id).includes(busqueda)) &&
    (catFiltro === "TODAS" || (p.categoria||"").toUpperCase() === catFiltro)
  );

  // ── Producción ──────────────────────────────────────────────────────────
  const agregarItemProd = () => {
    if (!prodTemp) return;
    const cant = parseFloat(cantProdTemp || "0");
    if (cant <= 0) return;
    const prod = productos.find(p => String(p.id) === prodTemp);
    if (!prod) return;
    setItemsProd(prev => {
      const ex = prev.findIndex(i => i.productoId === prodTemp);
      if (ex !== -1) return prev.map((i, idx) => idx === ex ? { ...i, cantidad: i.cantidad + cant } : i);
      return [...prev, { productoId: prodTemp, nombre: prod.nombre, cantidad: cant }];
    });
    setProdTemp(""); setCantProdTemp("");
  };

  const guardarProduccion = async () => {
    if (itemsProd.length === 0) return toast("warning", "Agrega al menos un producto");

    // Actualizar stock en MongoDB via API (delta positivo = entrada)
    if (branchId) {
      for (const item of itemsProd) {
        try {
          await api.patch(`/branches/${branchId}/products/${item.productoId}/stock`, {
            delta: Number(item.cantidad),
          });
        } catch { /* continuar aunque falle uno */ }
      }
    }

    // Actualizar productos en localStorage (bridge)
    const prods = JSON.parse(localStorage.getItem(prodKey) || "[]");
    const prodsNuevos = prods.map((p: any) => {
      const it = itemsProd.find(i => String(i.productoId) === String(p.id) || (i.nombre||"").trim().toUpperCase() === (p.nombre||"").trim().toUpperCase());
      if (!it) return p;
      return { ...p, stock: parseFloat(p.stock || "0") + Number(it.cantidad) };
    });
    localStorage.setItem(prodKey, JSON.stringify(prodsNuevos));

    // Registrar movimiento en localStorage (kardex aún usa localStorage)
    const mov = {
      id: Date.now(), fecha: new Date().toISOString(),
      nroFactura: `PROD-${Date.now()}`,
      categoria: "egreso", tipo: "PRODUCCION",
      esInventario: true, esProduccion: true,
      items: itemsProd,
      concepto: `PRODUCCIÓN (${itemsProd.length} productos)${notasProd ? " – " + notasProd : ""}`,
      valor: 0, estado: "CUADRADA", medioPago: "N/A"
    };
    const movs = JSON.parse(localStorage.getItem(movKey) || "[]");
    localStorage.setItem(movKey, JSON.stringify([mov, ...movs]));

    setProductos(prodsNuevos);
    setMovimientos([mov, ...movimientos]);
    setItemsProd([]); setProdTemp(""); setCantProdTemp(""); setNotasProd(""); setDrawerOpen(false);
  };

  // ── Export Excel ────────────────────────────────────────────────────────
  const exportarExcel = () => {
    const filas = filtrados.map(p => {
      const k = kardex(p);
      return {
        Producto:    p.nombre,
        Categoría:   p.categoria || "",
        "S. Inicio": k.saldoInicio,
        "Entradas":  k.entradas,
        "Ventas":    k.salidas,
        "Remisión":  k.remision,
        "Av. Frita": k.averiaFrita,
        "Avería":    k.averia,
        "S. Final":  k.saldoFinal,
      };
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kardex");
    XLSX.writeFile(wb, `inventario_${fechaBase}.xlsx`);
  };

  // ── Export PDF ──────────────────────────────────────────────────────────
  const exportarPDF = () => {
    const emp = getEmpresaConfig();
    const filas = filtrados.map(p => { const k = kardex(p); return { ...p, k }; });
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Inventario</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:20px 28px;font-size:11px}
h1{font-size:15px;font-weight:900;text-align:center;text-transform:uppercase}
.sub{text-align:center;font-size:10px;color:#666;margin-bottom:12px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th{background:#1e293b;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;text-align:left}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}
.num{text-align:right}.low{color:#dc2626;font-weight:900}
@media print{@page{margin:10mm;size:A4 landscape}}</style></head><body>
<h1>${emp.nombreEmpresa || "MI EMPRESA"}</h1>
<div class="sub">Informe de Inventario – Kardex &nbsp;|&nbsp; Período: ${etiqueta}</div>
<table><thead><tr>
  <th>Producto</th><th>Categoría</th>
  <th class="num">S. Inicio</th><th class="num">Entradas (+)</th><th class="num">Ventas (−)</th>
  <th class="num">Remisión</th><th class="num">Av. Frita</th><th class="num">Avería</th>
  <th class="num">S. Final</th>
</tr></thead>
<tbody>${filas.map(p => `<tr>
  <td>${p.nombre}</td><td>${p.categoria||""}</td>
  <td class="num">${p.k.saldoInicio}</td>
  <td class="num">${p.k.entradas}</td>
  <td class="num">${p.k.salidas}</td>
  <td class="num">${p.k.remision||0}</td>
  <td class="num">${p.k.averiaFrita||0}</td>
  <td class="num">${p.k.averia||0}</td>
  <td class="num ${p.k.saldoFinal <= 0 ? "low" : ""}">${p.k.saldoFinal}</td>
</tr>`).join("")}</tbody></table>
<script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  // ── Import Excel ────────────────────────────────────────────────────────
  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" });
        const findKey = (n: string[]) => Object.keys(data[0]||{}).find(k => n.some(o => k.trim().toUpperCase().includes(o)));
        const importados = data.map((row, idx) => ({
          id: Date.now() + idx,
          nombre: String(row[findKey(["PRODUCTO","NOMBRE"]) || ""] || "").trim().toUpperCase(),
          categoria: String(row[findKey(["CATEGORIA","LINEA"]) || ""] || "GENERAL").trim().toUpperCase(),
          presentacion: String(row[findKey(["PRESENTACION","UNIDAD"]) || ""] || "UND").trim().toUpperCase(),
          precioPublico: Number(String(row[findKey(["PUBLICO","PRECIO"]) || ""] || "0").replace(/[^0-9]/g,"")) || 0,
          precioMayorista: Number(String(row[findKey(["MAYORISTA"]) || ""] || "0").replace(/[^0-9]/g,"")) || 0,
          stock: Number(String(row[findKey(["STOCK","CANTIDAD","SALDO"]) || ""] || "0").replace(/[^0-9]/g,"")) || 0,
          stockInicial: Number(String(row[findKey(["STOCK","CANTIDAD","SALDO"]) || ""] || "0").replace(/[^0-9]/g,"")) || 0,
        })).filter(p => p.nombre);
        const existentes = JSON.parse(localStorage.getItem(prodKey) || "[]");
        const merged = [...importados, ...existentes.filter((e: any) => !importados.some(i => i.nombre === e.nombre))];
        localStorage.setItem(prodKey, JSON.stringify(merged));
        setProductos(merged);
        toast("success", `Importados ${importados.length} productos.`);
      } catch { toast("error", "Error al leer el Excel."); }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans overflow-hidden">

      {/* ── CABECERA ── */}
      <div className="bg-white border-b border-slate-100 px-8 pt-6 pb-4 shrink-0">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
              Inventarios <span className="text-blue-500 font-black">/ Kardex</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{etiqueta}</p>
          </div>

          {/* Botones acción */}
          <div className="flex gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 bg-slate-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase cursor-pointer hover:bg-slate-800 transition-all shadow-sm">
              <FileDown size={13} /> Importar Excel
              <input type="file" accept=".xlsx,.xls" onChange={importarExcel} className="hidden" />
            </label>
            <button onClick={exportarExcel} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all">
              <FileDown size={13} /> Excel
            </button>
            <button onClick={exportarPDF} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all">
              <FileText size={13} /> PDF
            </button>
            <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all shadow-sm">
              <Package size={13} /> Producción
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 items-center flex-wrap">
          <select value={tipoRango} onChange={e => setTipoRango(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none">
            {["Diario","Semanal","Quincenal","Mensual","Anual"].map(o => <option key={o}>{o}</option>)}
          </select>

          <div onClick={() => dateInputRef.current?.showPicker()}
            className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 cursor-pointer hover:bg-blue-100 transition-all relative min-w-[200px]">
            <span className="text-[10px] font-black text-blue-700 uppercase">{etiqueta}</span>
            <input ref={dateInputRef} type="date" value={fechaBase}
              onChange={e => setFechaBase(e.target.value)} className="absolute inset-0 opacity-0 pointer-events-none" />
          </div>

          <select value={catFiltro} onChange={e => { setCatFiltro(e.target.value); setBusqueda(""); }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none">
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Buscar producto..." value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none w-52 focus:ring-2 ring-blue-300" />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── TABLA ── */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest border-b-2 border-slate-200">
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4 text-center">S. Inicio</th>
                <th className="px-6 py-4 text-center">Entradas (+)</th>
                <th className="px-6 py-4 text-center">Ventas (–)</th>
                <th className="px-6 py-4 text-center">Combos (–)</th>
                <th className="px-6 py-4 text-center">Remisión</th>
                <th className="px-6 py-4 text-center">Av. Frita</th>
                <th className="px-6 py-4 text-center">Avería</th>
                <th className="px-6 py-4 text-center">Saldo Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtrados.map(prod => {
                const k = kardex(prod);
                const badge =
                  k.saldoFinal <= 0    ? "bg-slate-300 text-slate-800" :
                  k.saldoFinal <= 5    ? "bg-slate-200 text-slate-700" :
                                         "bg-slate-50 text-slate-600";
                return (
                  <tr key={prod.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-black text-slate-800 uppercase text-xs">{prod.nombre}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5">{prod.presentacion || "UND"}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase">{prod.categoria || "—"}</span>
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-500 text-xs">{k.saldoInicio}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-lg font-black text-xs ${k.entradas > 0 ? "bg-slate-100 text-slate-600" : "text-slate-300"}`}>
                        {k.entradas > 0 ? `+${k.entradas}` : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-lg font-black text-xs ${k.salidas > 0 ? "bg-slate-100 text-slate-600" : "text-slate-300"}`}>
                        {k.salidas > 0 ? `-${k.salidas}` : "—"}
                      </span>
                    </td>
                    {/* COMBOS — unidades consumidas como ingrediente de combos/cajas/picadas */}
                    <td className="px-6 py-4 text-center">
                      {(() => {
                        const combo = Number(prod.stockCombo) || 0;
                        return combo > 0
                          ? <span className="inline-block px-3 py-1 rounded-lg font-black text-xs bg-blue-50 text-blue-600">-{combo}</span>
                          : <span className="text-slate-300 text-xs font-black">—</span>;
                      })()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-lg font-black text-xs ${k.remision > 0 ? "bg-slate-100 text-slate-600" : "text-slate-300"}`}>
                        {k.remision > 0 ? `-${k.remision}` : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-lg font-black text-xs ${k.averiaFrita > 0 ? "bg-slate-100 text-slate-600" : "text-slate-300"}`}>
                        {k.averiaFrita > 0 ? `-${k.averiaFrita}` : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-3 py-1 rounded-lg font-black text-xs ${k.averia > 0 ? "bg-slate-100 text-slate-600" : "text-slate-300"}`}>
                        {k.averia > 0 ? `-${k.averia}` : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-block px-4 py-1.5 rounded-xl font-black text-sm ${badge}`}>
                        {k.saldoFinal}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={9} className="py-16 text-center text-slate-300 font-black text-[10px] uppercase tracking-widest">Sin productos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── DRAWER PRODUCCIÓN ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-sm bg-white h-full px-6 py-5 flex flex-col shadow-2xl">

            {/* Header drawer */}
            <div className="absolute top-4 right-4">
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="pt-8 mb-5">
              <div className="flex items-center gap-2 mb-1">
                <Package size={16} className="text-blue-500" />
                <h2 className="text-base font-black uppercase tracking-tighter text-slate-800">Nueva Producción</h2>
              </div>
              <p className="text-[10px] text-slate-400 font-bold">{new Date().toLocaleDateString("es-ES")} — Entrada por fabricación propia</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">

              {/* Agregar producto */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Agregar Producto</p>
                <select value={catFiltroDrawer} onChange={e => { setCatFiltroDrawer(e.target.value); setProdTemp(""); }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-black outline-none uppercase mb-2">
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-1 items-center">
                  <select value={prodTemp} onChange={e => setProdTemp(e.target.value)}
                    className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-black outline-none uppercase">
                    <option value="">SELECCIONAR...</option>
                    {(catFiltroDrawer === "TODAS" ? productos : productos.filter(p => (p.categoria || "").toUpperCase() === catFiltroDrawer))
                      .map(p => <option key={p.id} value={String(p.id)}>{p.nombre.toUpperCase()}</option>)}
                  </select>
                  <input type="number" placeholder="Cant" value={cantProdTemp}
                    onChange={e => setCantProdTemp(e.target.value)}
                    className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-black outline-none text-center shrink-0" />
                  <button onClick={agregarItemProd}
                    className="bg-blue-600 text-white w-8 h-8 rounded-lg font-black text-base flex items-center justify-center shrink-0 hover:bg-blue-700">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Lista ítems */}
              {itemsProd.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                  <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Productos producidos</p>
                  {itemsProd.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-100">
                      <p className="text-[10px] font-black uppercase text-slate-700 flex-1 truncate">{item.nombre}</p>
                      <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0">x{item.cantidad}</span>
                      <button onClick={() => setItemsProd(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 font-black text-base shrink-0">×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Notas */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Notas (opcional)</p>
                <textarea value={notasProd} onChange={e => setNotasProd(e.target.value)}
                  className="w-full bg-transparent text-sm font-bold outline-none h-16 resize-none" placeholder="Lote, observaciones..." />
              </div>
            </div>

            <button onClick={guardarProduccion}
              className="mt-4 w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 active:scale-95 transition-all shrink-0">
              Guardar Producción
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
