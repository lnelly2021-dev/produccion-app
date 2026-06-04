"use client";
import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { FileDown, FileText, Pencil, Trash2, Plus, X, Package } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig } from "../../lib/empresaStorage";
import { useConfirm } from "../../contexts/ConfirmContext";

export default function MenuPage() {
  const { branch } = useAuth();
  const branchId   = branch?.id;
  const prodKey    = branchId ? `productos_${branchId}` : "productos";
  const confirm = useConfirm();

  const [productos,   setProductos]   = useState<any[]>([]);
  const [cargando,    setCargando]    = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId,  setEditandoId]  = useState<string | null>(null);
  const [catFiltro,   setCatFiltro]   = useState("TODAS");
  const [busqueda,    setBusqueda]    = useState("");
  const [guardando,   setGuardando]   = useState(false);
  const [migrando,    setMigrando]    = useState(false);
  const [localPendientes, setLocalPendientes] = useState<any[]>([]);
  const [mostrarNuevaCat, setMostrarNuevaCat] = useState(false);
  const [inputNuevaCat,   setInputNuevaCat]   = useState("");

  const [nuevo, setNuevo] = useState({
    nombre: "", categoria: "", presentacion: "UND",
    precioPublico: "", precioMayorista: "", tarifaIVA: 0, foto: "",
  });

  // ── Receta / BOM ──────────────────────────────────────────────────────────
  const [esCompuesto,   setEsCompuesto]   = useState(false);
  const [componentes,   setComponentes]   = useState<{productoId:string; nombre:string; cantidad:number}[]>([]);
  const [compSearch,    setCompSearch]    = useState("");
  const [compCantidad,  setCompCantidad]  = useState("1");

  const categoriasFiltro   = ["TODAS", ...Array.from(new Set(productos.map(p => p.categoria))).filter(Boolean) as string[]];
  const productosFiltrados = productos
    .filter(p =>
      (catFiltro === "TODAS" || (p.categoria || "").toUpperCase() === catFiltro) &&
      (p.nombre  || "").toLowerCase().includes(busqueda.toLowerCase())
    )
    .sort((a, b) => {
      const cat = (a.categoria || "").localeCompare(b.categoria || "");
      return cat !== 0 ? cat : (a.nombre || "").localeCompare(b.nombre || "");
    });

  // ── Normalizar producto de API al formato que usa el resto del app ──────────
  const normalizar = (p: any) => ({
    ...p,
    id:     p._id || p.id,
    precio: Number(p.precioPublico) || 0,
  });

  // ── Sincronizar con localStorage para módulos aún no migrados ──────────────
  const sincronizarLS = (lista: any[]) => {
    localStorage.setItem(prodKey, JSON.stringify(lista));
  };

  // ── Cargar desde API ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!branchId) return;
    setCargando(true);
    api.get(`/branches/${branchId}/products`)
      .then(({ data }) => {
        const lista = (data.data || []).map(normalizar);
        setProductos(lista);
        // Solo sincronizar LS si hay datos en el API (no sobreescribir con vacío)
        if (lista.length > 0) sincronizarLS(lista);

        // Si el API está vacío, detectar si hay productos en localStorage para migrar
        if (lista.length === 0) {
          const local = JSON.parse(localStorage.getItem(prodKey) || "[]");
          if (local.length > 0) setLocalPendientes(local);
        }
      })
      .catch(() => {
        // Fallback: cargar desde localStorage si el API falla
        const local = JSON.parse(localStorage.getItem(prodKey) || "[]");
        setProductos(local);
      })
      .finally(() => setCargando(false));
  }, [branchId]);

  // ── Migrar productos desde localStorage al API ─────────────────────────────
  const migrarDesdeLocal = async () => {
    if (!branchId || localPendientes.length === 0) return;
    setMigrando(true);

    // Obtener lista actualizada desde API para evitar duplicados
    let enDB: any[] = [];
    try {
      const { data } = await api.get(`/branches/${branchId}/products`);
      enDB = (data.data || []).map((p: any) => (p.nombre || "").toUpperCase().trim());
    } catch { /* continuar igual */ }

    let creados = 0;
    let omitidos = 0;
    for (const p of localPendientes) {
      const nombre = (p.nombre || "").toUpperCase().trim();
      if (!nombre) continue;
      // Saltar si ya existe en el branch (evita duplicados en re-migraciones)
      if (enDB.includes(nombre)) { omitidos++; continue; }
      try {
        const dto = {
          nombre,
          categoria:       (p.categoria || "GENERAL").toUpperCase().trim(),
          presentacion:    (p.presentacion || "UND").toUpperCase().trim(),
          precioPublico:   Number(p.precioPublico || p.precio) || 0,
          precioMayorista: Number(p.precioMayorista) || 0,
          stock:           Number(p.stock) || 0,
          stockInicial:    Number(p.stockInicial || p.stock) || 0,
        };
        await api.post(`/branches/${branchId}/products`, dto);
        enDB.push(nombre);
        creados++;
      } catch { /* omitir errores individuales */ }
    }

    // Recargar TODOS los productos desde la API (no solo los recién creados)
    try {
      const { data } = await api.get(`/branches/${branchId}/products`);
      const total = (data.data || []).map(normalizar);
      setProductos(total);
      sincronizarLS(total);
    } catch { /* mantener estado actual */ }

    setLocalPendientes([]);
    setMigrando(false);
    toast("success", `✓ ${creados} productos nuevos migrados. ${omitidos > 0 ? `${omitidos} ya existían.` : ""} Total en DB: ${enDB.length}`);
  };

  // ── Importar Excel ──────────────────────────────────────────────────────────
  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!branchId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb   = XLSX.read(evt.target?.result, { type: "binary" });
        const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" });
        const importados = data.map((item) => {
          const fk = (n: string[]) => Object.keys(item).find(k =>
            n.some(o => k.trim().toUpperCase().replace(/\./g, "").includes(o))
          );
          const ex = (n: string[]) => {
            const k = fk(n);
            return k && item[k] ? parseInt(String(item[k]).replace(/[^0-9]/g, ""), 10) || 0 : 0;
          };
          return {
            nombre:          String(item[fk(["PRODUCTO","NOMBRE"])     || ""] || "").trim().toUpperCase(),
            categoria:       String(item[fk(["CATEGORIA","LINEA"])     || ""] || "GENERAL").trim().toUpperCase(),
            presentacion:    String(item[fk(["PRESENTACION","UNIDAD"]) || ""] || "UND").trim().toUpperCase(),
            precioPublico:   ex(["PUBLICO","P.PUB","PRECIO"]),
            precioMayorista: ex(["MAYORISTA","P.MAY"]),
            stock:           ex(["STOCK","CANTIDAD"]) || 0,
            stockInicial:    ex(["STOCK","CANTIDAD"]) || 0,
          };
        }).filter(p => p.nombre);

        // Crear cada producto en el API
        const creados: any[] = [];
        for (const dto of importados) {
          try {
            const { data: res } = await api.post(`/branches/${branchId}/products`, dto);
            creados.push(normalizar(res.data));
          } catch { /* omitir el que falle */ }
        }

        // Recargar desde API para mostrar todos (incluyendo los ya existentes)
        try {
          const { data: fresh } = await api.get(`/branches/${branchId}/products`);
          const total = (fresh.data || []).map(normalizar);
          setProductos(total);
          sincronizarLS(total);
        } catch {
          const nuevaLista = [...creados, ...productos];
          setProductos(nuevaLista);
          sincronizarLS(nuevaLista);
        }
        toast("success", `¡Importados ${creados.length} de ${importados.length} productos!`);
      } catch { toast("error", "Error al leer el Excel."); }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // ── Exportar Excel ──────────────────────────────────────────────────────────
  const exportarExcel = () => {
    const filas = productosFiltrados.map(p => ({
      Producto:       p.nombre,
      Categoría:      p.categoria || "",
      Presentación:   p.presentacion || "UND",
      "P. Público":   Number(p.precioPublico)   || 0,
      "P. Mayorista": Number(p.precioMayorista) || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lista de Precios");
    XLSX.writeFile(wb, `lista_precios_${catFiltro}.xlsx`);
  };

  // ── Exportar PDF ────────────────────────────────────────────────────────────
  const exportarPDF = () => {
    const emp = getEmpresaConfig();
    const fmt = (v: any) => new Intl.NumberFormat("es-CO", { style:"currency", currency:"COP", minimumFractionDigits:0 }).format(Number(v)||0);
    const rows = productosFiltrados.map(p => `
      <tr>
        <td>${p.nombre}</td><td>${p.categoria||""}</td><td>${p.presentacion||"UND"}</td>
        <td style="text-align:right">${fmt(p.precioPublico)}</td>
        <td style="text-align:right">${fmt(p.precioMayorista)}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lista de Precios</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:20px 28px;font-size:11px}
h1{font-size:15px;font-weight:900;text-align:center;text-transform:uppercase}
.sub{text-align:center;font-size:10px;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#1e293b;color:#fff;padding:7px 10px;font-size:9px;text-transform:uppercase;text-align:left}
td{padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:10px}
@media print{@page{margin:12mm 10mm;size:A4}}</style></head><body>
<h1>${emp.nombreEmpresa||"MI EMPRESA"}</h1>
<div class="sub">Lista de Precios — ${catFiltro} (${productosFiltrados.length} productos)</div>
<table><thead><tr><th>Producto</th><th>Categoría</th><th>Presentación</th><th style="text-align:right">P. Público</th><th style="text-align:right">P. Mayorista</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank"); w?.document.write(html); w?.document.close();
  };

  // ── Guardar (crear o editar) ─────────────────────────────────────────────────
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) return;
    setGuardando(true);
    try {
      const dto: any = {
        nombre:          nuevo.nombre.trim().toUpperCase(),
        categoria:       nuevo.categoria.trim().toUpperCase(),
        presentacion:    nuevo.presentacion.trim().toUpperCase(),
        precioPublico:   Number(nuevo.precioPublico)   || 0,
        precioMayorista: Number(nuevo.precioMayorista) || 0,
        tarifaIVA:       Number(nuevo.tarifaIVA)       || 0,
        foto:            nuevo.foto || "",
        componentes:     esCompuesto
          ? componentes.map(c => ({ productoId: c.productoId, cantidad: c.cantidad }))
          : [],
      };

      let lista: any[];
      if (editandoId) {
        const { data } = await api.put(`/branches/${branchId}/products/${editandoId}`, dto);
        const actualizado = normalizar(data.data);
        lista = productos.map(p => p.id === editandoId ? actualizado : p);
      } else {
        const { data } = await api.post(`/branches/${branchId}/products`, dto);
        lista = [normalizar(data.data), ...productos];
      }

      setProductos(lista);
      sincronizarLS(lista);
      cerrarDrawer();
    } catch {
      toast("error", "Error al guardar el producto.");
    } finally {
      setGuardando(false);
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────────────────────
  const eliminar = async (p: any) => {
    if (!branchId || !await confirm("¿Eliminar este producto?")) return;
    try {
      await api.delete(`/branches/${branchId}/products/${p.id}`);
      const lista = productos.filter(x => x.id !== p.id);
      setProductos(lista);
      sincronizarLS(lista);
    } catch {
      toast("error", "Error al eliminar el producto.");
    }
  };

  const cerrarDrawer = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setNuevo({ nombre: "", categoria: "", presentacion: "UND", precioPublico: "", precioMayorista: "", tarifaIVA: 0, foto: "" });
    setMostrarNuevaCat(false);
    setInputNuevaCat("");
    setEsCompuesto(false);
    setComponentes([]);
    setCompSearch(""); setCompCantidad("1");
  };

  const abrirEditar = (p: any) => {
    setNuevo({
      nombre:          p.nombre          || "",
      categoria:       p.categoria       || "",
      presentacion:    p.presentacion    || "UND",
      precioPublico:   String(p.precioPublico   || ""),
      precioMayorista: String(p.precioMayorista || ""),
      tarifaIVA:       Number(p.tarifaIVA)      || 0,
      foto:            p.foto || "",
    });
    // Cargar componentes si es producto compuesto
    if (p.componentes && p.componentes.length > 0) {
      setEsCompuesto(true);
      setComponentes(p.componentes.map((c: any) => ({
        productoId: String(c.productoId || c._id || ""),
        nombre:     productos.find(pr => pr.id === String(c.productoId || c._id))?.nombre || String(c.productoId),
        cantidad:   Number(c.cantidad) || 1,
      })));
    } else {
      setEsCompuesto(false);
      setComponentes([]);
    }
    setEditandoId(p.id);
    setMostrarForm(true);
  };

  const fmt = (v: any) => new Intl.NumberFormat("es-CO", { style:"currency", currency:"COP", minimumFractionDigits:0 }).format(Number(v)||0);

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-full">

      {/* ENCABEZADO */}
      <div className="flex flex-col lg:flex-row justify-between items-start mb-6 gap-4">
        <div>
          <h1 className="text-lg font-black text-gray-800 uppercase tracking-tighter mt-6 ml-2 mb-1">Menú / Productos</h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Lista de Precios</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full lg:w-auto mt-6">
          <label className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase cursor-pointer hover:bg-emerald-700 transition-all shadow-sm">
            <FileDown size={13} /> Importar Excel
            <input type="file" accept=".xlsx,.xls" onChange={importarExcel} className="hidden" />
          </label>
          <button onClick={exportarExcel} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all">
            <FileDown size={13} /> Excel
          </button>
          <button onClick={exportarPDF} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all">
            <FileText size={13} /> PDF
          </button>
          <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1.5 bg-[#1a2b3c] text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-black transition-all shadow-sm">
            <Plus size={13} /> Nuevo Producto
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase outline-none shadow-sm">
          {categoriasFiltro.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" placeholder="Buscar producto..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase outline-none shadow-sm min-w-[200px]" />
        <span className="text-[10px] font-black text-gray-400 uppercase ml-auto">
          {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* BANNER MIGRACIÓN */}
      {localPendientes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
              {localPendientes.length} productos encontrados en este navegador
            </p>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">
              Estos productos aún no están en la base de datos. Migralos para que estén disponibles desde cualquier computador.
            </p>
          </div>
          <button
            onClick={migrarDesdeLocal}
            disabled={migrando}
            className="shrink-0 bg-amber-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all disabled:opacity-50"
          >
            {migrando ? "Migrando..." : `Migrar ${localPendientes.length} productos`}
          </button>
        </div>
      )}

      {/* TABLA */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="py-20 text-center text-gray-300 font-black text-[10px] uppercase tracking-widest">
            Cargando productos...
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 w-[28%]">Producto</th>
                <th className="px-6 py-4 w-[14%] text-center">Categoría</th>
                <th className="px-6 py-4 w-[19%] text-right">P. Público</th>
                <th className="px-6 py-4 w-[19%] text-right text-blue-600">P. Mayorista</th>
                <th className="px-6 py-4 w-[9%] text-center">IVA</th>
                <th className="px-6 py-4 w-[11%] text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {productosFiltrados.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {p.foto
                        ? <img src={p.foto} alt={p.nombre} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-gray-100" />
                        : <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center"><Package size={14} className="text-gray-400" /></div>}
                      <div>
                        <p className="font-black text-slate-800 uppercase text-xs truncate max-w-[180px]" title={p.nombre}>{p.nombre}</p>
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase">{p.presentacion}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-slate-100 px-3 py-1 rounded-lg text-[9px] uppercase font-black text-slate-500">{p.categoria}</span>
                  </td>
                  <td className="px-6 py-4 text-right font-black text-slate-800 text-xs">{fmt(p.precioPublico)}</td>
                  <td className="px-6 py-4 text-right font-black text-blue-600 text-xs">{fmt(p.precioMayorista)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${
                      Number(p.tarifaIVA) > 0
                        ? "bg-amber-50 text-amber-600 border border-amber-200"
                        : "bg-gray-100 text-gray-400"
                    }`}>
                      {Number(p.tarifaIVA) || 0}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center space-x-3">
                    <button onClick={() => abrirEditar(p)} className="hover:scale-125 transition-transform text-blue-500"><Pencil size={14} /></button>
                    <button onClick={() => eliminar(p)}    className="hover:scale-125 transition-transform text-red-400"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {productosFiltrados.length === 0 && !cargando && (
                <tr><td colSpan={5} className="py-16 text-center text-slate-300 font-black text-[10px] uppercase tracking-widest">Sin productos</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* DRAWER FORMULARIO */}
      {mostrarForm && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={cerrarDrawer} />
          <div className="relative w-full max-w-sm bg-white h-full flex flex-col shadow-2xl px-6 py-5">
            <div className="absolute top-4 right-4">
              <button onClick={cerrarDrawer} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <h2 className="text-lg font-black uppercase tracking-tighter text-slate-800 mb-5 pt-6">
              {editandoId ? "Editar Producto" : "Nuevo Producto"}
            </h2>

            <form onSubmit={guardar} className="flex-1 overflow-y-auto space-y-3 pr-1">

              {/* Foto del producto */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-2">Foto del producto</p>
                <div className="flex gap-3 items-start">
                  {/* Preview */}
                  <div className="w-16 h-16 shrink-0 rounded-xl border-2 border-gray-200 bg-white overflow-hidden flex items-center justify-center">
                    {nuevo.foto
                      ? <img src={nuevo.foto} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
                      : <Package size={24} className="text-gray-300" />}
                  </div>
                  <div className="flex-1 space-y-2">
                    {/* Subir archivo */}
                    <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-400 transition-colors">
                      <span className="text-[9px] font-black text-gray-500 uppercase">Subir imagen</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => setNuevo(n => ({ ...n, foto: ev.target?.result as string ?? "" }));
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                    {/* O URL */}
                    <input value={nuevo.foto} onChange={e => setNuevo(n => ({ ...n, foto: e.target.value }))}
                      placeholder="O pega una URL..."
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-[9px] font-medium outline-none focus:border-blue-400 transition-colors" />
                    {nuevo.foto && (
                      <button type="button" onClick={() => setNuevo(n => ({ ...n, foto: "" }))}
                        className="text-[9px] text-red-400 hover:text-red-600 font-black">✕ Quitar foto</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Nombre */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Nombre *</p>
                <input required value={nuevo.nombre}
                  onChange={e => setNuevo({ ...nuevo, nombre: e.target.value.toUpperCase() })}
                  className="w-full bg-transparent font-black uppercase text-sm outline-none" placeholder="Nombre" />
              </div>

              {/* Categoría con selector + botón nueva */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Categoría</p>
                {mostrarNuevaCat ? (
                  <div className="flex gap-2 items-center">
                    <input autoFocus value={inputNuevaCat}
                      onChange={e => setInputNuevaCat(e.target.value.toUpperCase())}
                      className="flex-1 bg-transparent font-black uppercase text-sm outline-none" placeholder="Nueva categoría..." />
                    <button type="button" onClick={() => { setNuevo({ ...nuevo, categoria: inputNuevaCat }); setMostrarNuevaCat(false); setInputNuevaCat(""); }}
                      className="text-emerald-600 font-black text-xs px-2 py-1 bg-emerald-50 rounded-lg">✓ OK</button>
                    <button type="button" onClick={() => { setMostrarNuevaCat(false); setInputNuevaCat(""); }}
                      className="text-gray-400 font-black text-xs px-2 py-1 bg-gray-100 rounded-lg">✕</button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <select value={nuevo.categoria} onChange={e => setNuevo({ ...nuevo, categoria: e.target.value })}
                      className="flex-1 bg-transparent font-black uppercase text-sm outline-none">
                      <option value="">— SELECCIONAR —</option>
                      {categoriasFiltro.filter(c => c !== "TODAS").map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button type="button" onClick={() => setMostrarNuevaCat(true)}
                      className="shrink-0 text-blue-600 font-black text-[10px] px-2 py-1 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">+ Nueva</button>
                  </div>
                )}
              </div>

              {/* Tarifa de IVA */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-2">Tarifa de IVA</p>
                <div className="flex gap-2 mb-2">
                  {[0, 5, 19].map(pct => (
                    <button key={pct} type="button"
                      onClick={() => setNuevo({ ...nuevo, tarifaIVA: pct })}
                      className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-black transition-all ${
                        nuevo.tarifaIVA === pct
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}>
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-gray-400 font-bold">Otro %:</span>
                  <input type="number" min={0} max={100}
                    value={nuevo.tarifaIVA}
                    onChange={e => setNuevo({ ...nuevo, tarifaIVA: Number(e.target.value) || 0 })}
                    className="w-20 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-black outline-none focus:border-blue-400 text-center" />
                  <span className="text-[9px] text-gray-400 font-bold">%</span>
                </div>
              </div>

              {/* Presentación */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Presentación</p>
                <input value={nuevo.presentacion}
                  onChange={e => setNuevo({ ...nuevo, presentacion: e.target.value.toUpperCase() })}
                  className="w-full bg-transparent font-black uppercase text-sm outline-none" placeholder="Presentación" />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Precio Público</p>
                <div className="flex items-center gap-1 text-2xl font-black text-emerald-500">
                  $<input type="number" value={nuevo.precioPublico}
                    onChange={e => setNuevo({ ...nuevo, precioPublico: e.target.value })}
                    className="bg-transparent outline-none w-full" placeholder="0" />
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Precio Mayorista</p>
                <div className="flex items-center gap-1 text-2xl font-black text-blue-500">
                  $<input type="number" value={nuevo.precioMayorista}
                    onChange={e => setNuevo({ ...nuevo, precioMayorista: e.target.value })}
                    className="bg-transparent outline-none w-full" placeholder="0" />
                </div>
              </div>

              {/* ── RECETA / BOM ────────────────────────────────────── */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black text-gray-400 uppercase">Producto Compuesto</p>
                  <button type="button" onClick={() => { setEsCompuesto(v => !v); setComponentes([]); }}
                    className={`w-10 h-5 rounded-full transition-all relative ${esCompuesto ? "bg-blue-600" : "bg-gray-300"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${esCompuesto ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
                <p className="text-[9px] text-gray-400 mt-1">Activa si este producto es un combo, caja o picada</p>

                {esCompuesto && (
                  <div className="mt-3 space-y-2">
                    {/* Lista de ingredientes */}
                    {componentes.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                        <span className="flex-1 text-[10px] font-black text-gray-700 uppercase truncate">{c.nombre}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => setComponentes(prev => prev.map((x,j) => j===i ? {...x, cantidad: Math.max(1, x.cantidad-1)} : x))}
                            className="w-5 h-5 bg-gray-100 rounded text-gray-600 font-black text-xs flex items-center justify-center hover:bg-gray-200">−</button>
                          <span className="text-[10px] font-black text-gray-800 w-6 text-center">{c.cantidad}</span>
                          <button type="button" onClick={() => setComponentes(prev => prev.map((x,j) => j===i ? {...x, cantidad: x.cantidad+1} : x))}
                            className="w-5 h-5 bg-gray-100 rounded text-gray-600 font-black text-xs flex items-center justify-center hover:bg-gray-200">+</button>
                        </div>
                        <button type="button" onClick={() => setComponentes(prev => prev.filter((_,j) => j!==i))}
                          className="text-red-400 hover:text-red-600 ml-1">
                          <X size={13} />
                        </button>
                      </div>
                    ))}

                    {/* Agregar ingrediente */}
                    <div className="flex gap-2 mt-2">
                      <input
                        list="productos-receta"
                        value={compSearch}
                        onChange={e => setCompSearch(e.target.value)}
                        placeholder="Buscar ingrediente..."
                        className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase outline-none focus:border-blue-400 min-w-0"
                      />
                      <datalist id="productos-receta">
                        {productos
                          .filter(p => !p.componentes?.length && p.id !== editandoId)
                          .map(p => <option key={p.id} value={p.nombre} />)}
                      </datalist>
                      <input type="number" min="1" value={compCantidad} onChange={e => setCompCantidad(e.target.value)}
                        className="w-14 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] font-black text-center outline-none focus:border-blue-400" />
                      <button type="button"
                        onClick={() => {
                          const prod = productos.find(p => p.nombre.toUpperCase() === compSearch.toUpperCase().trim());
                          if (!prod) { toast("warning", "Selecciona un producto válido de la lista"); return; }
                          if (componentes.some(c => c.productoId === prod.id)) {
                            setComponentes(prev => prev.map(c => c.productoId === prod.id ? {...c, cantidad: c.cantidad + (parseInt(compCantidad)||1)} : c));
                          } else {
                            setComponentes(prev => [...prev, { productoId: prod.id, nombre: prod.nombre, cantidad: parseInt(compCantidad) || 1 }]);
                          }
                          setCompSearch(""); setCompCantidad("1");
                        }}
                        className="shrink-0 bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black text-[10px] hover:bg-blue-700 transition-all">
                        <Plus size={13} />
                      </button>
                    </div>
                    {componentes.length === 0 && (
                      <p className="text-[9px] text-gray-400 text-center py-1">Agrega al menos un ingrediente</p>
                    )}
                  </div>
                )}
              </div>

              <button type="submit" disabled={guardando || (esCompuesto && componentes.length === 0)}
                className="mt-4 w-full bg-[#1a2b3c] text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all disabled:opacity-50">
                {guardando ? "Guardando..." : editandoId ? "Actualizar" : "Guardar Producto"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
