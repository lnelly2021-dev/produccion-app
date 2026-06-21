"use client";
import React, { useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, X, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

const UNIDADES = ["kg", "gr", "lt", "ml", "und", "oz", "lb", "m", "cm"];

function calcularCostoGr(costo: number, unidad: string): number {
  const u = unidad.toLowerCase();
  if (["kg", "kl", "kilo", "kilos"].includes(u)) return costo / 1000;
  if (["gr", "g"].includes(u)) return costo;
  if (["lt", "l", "litro", "litros"].includes(u)) return costo / 1000;
  if (u === "ml") return costo;
  return 0;
}

function parsearCosto(valor: any): number {
  if (typeof valor === "number") return valor;
  const s = String(valor).trim();
  return parseFloat(s.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

interface Ingrediente {
  _id: string;
  codigo: string;
  familia: string;
  nombre: string;
  unidad: string;
  costoUnitario: number;
  costoGr: number;
}

export default function IngredientesPage() {
  const { branch } = useAuth();
  const branchId = branch?.id || "";
  const confirm  = useConfirm();

  const [lista,           setLista]          = useState<Ingrediente[]>([]);
  const [loading,         setLoading]        = useState(true);
  const [showDrawer,      setShowDrawer]     = useState(false);
  const [editando,        setEditando]       = useState<string | null>(null);
  const [form,            setForm]           = useState({ familia: "", codigo: "", nombre: "", unidad: "kg", costoUnitario: "" });
  const [guardando,       setGuardando]      = useState(false);
  const [busqueda,        setBusqueda]       = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [nuevaCatNombre,  setNuevaCatNombre] = useState("");
  const [showNuevaCat,    setShowNuevaCat]   = useState(false);

  const nombreRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const cargar = async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get(`/branches/${branchId}/ingredientes`);
      setLista(data.data ?? data);
    } catch { toast("error", "Error al cargar ingredientes"); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, [branchId]);

  // Categorías únicas con su código base (inferido del primer dígito de los códigos)
  const categorias = Array.from(
    lista.reduce((m, i) => {
      if (!i.familia) return m;
      if (!m.has(i.familia)) {
        const base = i.codigo ? Math.floor(parseInt(i.codigo) / 1000) : 0;
        m.set(i.familia, base);
      }
      return m;
    }, new Map<string, number>())
  )
    .map(([nombre, base]) => ({ nombre, base }))
    .sort((a, b) => a.base - b.base);

  // Siguiente código base disponible para nueva categoría
  const siguienteBase = categorias.length
    ? Math.max(...categorias.map(c => c.base)) + 1
    : 1;

  // Siguiente código de ingrediente para una categoría dada
  const siguienteCodigo = (familia: string): string => {
    const cat = categorias.find(c => c.nombre === familia);
    if (!cat?.base) return "";
    const max = lista
      .filter(i => i.familia === familia && /^\d+$/.test(i.codigo || ""))
      .map(i => parseInt(i.codigo))
      .reduce((m, v) => Math.max(m, v), cat.base * 1000);
    return String(max + 1);
  };

  const costoGrPreview = calcularCostoGr(parseFloat(form.costoUnitario) || 0, form.unidad);

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ familia: "", codigo: "", nombre: "", unidad: "kg", costoUnitario: "" });
    setShowNuevaCat(false);
    setNuevaCatNombre("");
    setShowDrawer(true);
    setTimeout(() => nombreRef.current?.focus(), 100);
  };

  const abrirEdicion = (i: Ingrediente) => {
    setEditando(i._id);
    setForm({ familia: i.familia || "", codigo: i.codigo || "", nombre: i.nombre, unidad: i.unidad, costoUnitario: String(i.costoUnitario) });
    setShowNuevaCat(false);
    setShowDrawer(true);
    setTimeout(() => nombreRef.current?.focus(), 100);
  };

  const seleccionarCategoria = (nombre: string) => {
    const codigo = siguienteCodigo(nombre);
    setForm(f => ({ ...f, familia: nombre, codigo }));
    setShowNuevaCat(false);
    setTimeout(() => nombreRef.current?.focus(), 50);
  };

  const confirmarNuevaCat = () => {
    const nombre = nuevaCatNombre.trim().toUpperCase();
    if (!nombre) { toast("warning", "Escribe el nombre de la categoría"); return; }
    if (categorias.find(c => c.nombre === nombre)) { toast("warning", "Esa categoría ya existe"); return; }
    const primerCodigo = `${siguienteBase}001`;
    setForm(f => ({ ...f, familia: nombre, codigo: primerCodigo }));
    setShowNuevaCat(false);
    setNuevaCatNombre("");
    setTimeout(() => nombreRef.current?.focus(), 50);
  };

  const guardar = async () => {
    if (!form.nombre.trim())                                        { toast("warning", "El nombre es obligatorio"); return; }
    if (!form.costoUnitario || parseFloat(form.costoUnitario) < 0) { toast("warning", "Ingresa un costo válido");  return; }
    setGuardando(true);
    try {
      const costoUnitario = parseFloat(form.costoUnitario) || 0;
      const existente = lista.find(i => i._id === editando);
      const body = {
        codigo:        form.codigo.trim(),
        familia:       editando ? (existente?.familia || form.familia) : form.familia,
        nombre:        form.nombre.toUpperCase().trim(),
        unidad:        form.unidad,
        costoUnitario,
        costoGr:       calcularCostoGr(costoUnitario, form.unidad),
      };
      if (editando) {
        await api.put(`/branches/${branchId}/ingredientes/${editando}`, body);
        toast("success", "Ingrediente actualizado");
      } else {
        await api.post(`/branches/${branchId}/ingredientes`, body);
        toast("success", "Ingrediente creado");
      }
      setShowDrawer(false);
      cargar();
    } catch { toast("error", "Error al guardar"); }
    finally { setGuardando(false); }
  };

  const eliminar = async (id: string, nombre: string) => {
    if (!await confirm(`¿Eliminar "${nombre}"?`)) return;
    try {
      await api.delete(`/branches/${branchId}/ingredientes/${id}`);
      toast("success", "Eliminado");
      cargar();
    } catch { toast("error", "Error al eliminar"); }
  };

  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (allRows.length < 2) { toast("warning", "Archivo vacío"); return; }

        // Tu Excel tiene SIEMPRE este orden: CODIGO(0) CATEGORIA(1) PRODUCTO(2) UNM(3) COSTO PROMEDIO(4)
        // Buscamos la fila de encabezados para saber desde dónde empiezan los datos
        let dataStart = 1;
        for (let i = 0; i < Math.min(5, allRows.length); i++) {
          const vals = allRows[i].map((c: any) => String(c).toUpperCase());
          if (vals.some(v => v.includes("PRODUCTO") || v.includes("CODIGO"))) {
            dataStart = i + 1;
            break;
          }
        }

        const importados: Omit<Ingrediente, "_id">[] = [];

        for (let r = dataStart; r < allRows.length; r++) {
          const row = allRows[r];
          // Col 0=CODIGO, 1=CATEGORIA, 2=PRODUCTO, 3=UNM, 4=COSTO PROMEDIO
          const nombre = String(row[2] ?? "").trim().toUpperCase();
          if (!nombre) continue;

          const codigoRaw = row[0] ?? "";
          const codigo    = typeof codigoRaw === "number" ? String(Math.round(codigoRaw)) : String(codigoRaw).trim();
          const familia   = String(row[1] ?? "").trim().toUpperCase();
          const unmRaw    = String(row[3] ?? "").trim().toLowerCase();
          const unidad    = ["kl", "kilo", "kilos"].includes(unmRaw) ? "kg" : (unmRaw || "und");
          const costoNum  = parsearCosto(row[4] ?? 0);

          importados.push({ codigo, familia, nombre, unidad, costoUnitario: costoNum, costoGr: calcularCostoGr(costoNum, unidad) });
        }

        if (!importados.length) { toast("warning", "No se encontraron datos"); return; }

        // Detectar categorías únicas en el archivo para informar al usuario
        const categorias = [...new Set(importados.map(i => i.familia).filter(Boolean))].join(", ");
        const muestra = importados.slice(0, 2).map(i => `${i.codigo}/${i.familia}/${i.nombre}`).join(", ");

        // Preguntar modo: reemplazar todo vs agregar/actualizar sin borrar
        const reemplazar = await confirm(
          `Se encontraron ${importados.length} ingredientes en el archivo.\n` +
          `Categorías: ${categorias || "sin categoría"}\n` +
          `Ejemplo: ${muestra}\n\n` +
          `¿REEMPLAZAR TODO (borra los ${lista.length} actuales)?\n` +
          `— Acepta → Reemplaza todo\n` +
          `— Cancela → Solo agrega/actualiza sin borrar existentes`
        );

        if (reemplazar) {
          toast("info", "Borrando datos anteriores...");
          await api.delete(`/branches/${branchId}/ingredientes`);
        }

        toast("info", reemplazar ? "Guardando nuevos ingredientes..." : "Agregando ingredientes sin borrar existentes...");
        const { data } = await api.post(`/branches/${branchId}/ingredientes/bulk`, importados);
        const nuevos      = data.data?.inserted ?? 0;
        const actualizados = data.data?.updated  ?? 0;
        toast("success", reemplazar
          ? `✓ ${nuevos + actualizados} ingredientes importados`
          : `✓ ${nuevos} nuevos · ${actualizados} actualizados · existentes conservados`
        );
        cargar();
      } catch (err) {
        console.error(err);
        toast("error", "Error al leer el archivo");
      }
    };
    reader.readAsBinaryString(file);
  };

  const f   = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
  const fGr = (n: number) => n > 0 ? `$${n.toFixed(2)}` : "—";

  const filtrada = lista.filter(i => {
    const matchTexto = i.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
                       (i.codigo || "").includes(busqueda);
    const matchCat = !categoriaActiva || i.familia === categoriaActiva;
    return matchTexto && matchCat;
  });

  // Agrupar por categoría, ordenar ingredientes por código
  const grupos = filtrada.reduce<Record<string, Ingrediente[]>>((acc, i) => {
    const key = i.familia?.trim() || "";
    if (!acc[key]) acc[key] = [];
    acc[key].push(i);
    return acc;
  }, {});
  Object.values(grupos).forEach(arr =>
    arr.sort((a, b) => (parseInt(a.codigo) || 0) - (parseInt(b.codigo) || 0))
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-5 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Ingredientes</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">Materias primas · precios de costo</p>
          </div>
          <div className="flex gap-3">
            <label className="bg-slate-700 hover:bg-black text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all cursor-pointer shadow-sm">
              <FileDown size={14} /> Importar Excel
              <input type="file" accept=".xlsx,.xls" onChange={importarExcel} className="hidden" />
            </label>
            <button onClick={abrirNuevo}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-sm">
              <Plus size={14} /> Nuevo Ingrediente
            </button>
          </div>
        </div>

        {/* Búsqueda + chips de categoría */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input placeholder="Buscar ingrediente o código..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full max-w-xs bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400" />

          {categorias.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setCategoriaActiva(null)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                  !categoriaActiva ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                }`}>
                Todas
              </button>
              {categorias.map(cat => (
                <button key={cat.nombre} onClick={() => setCategoriaActiva(p => p === cat.nombre ? null : cat.nombre)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                    categoriaActiva === cat.nombre ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                  }`}>
                  {cat.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-hidden px-8 py-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-4 w-20">Código</th>
                <th className="px-4 py-4">Categoría</th>
                <th className="px-4 py-4">Nombre</th>
                <th className="px-4 py-4">Unidad</th>
                <th className="px-4 py-4 text-right">Costo Unitario</th>
                <th className="px-4 py-4 text-right">Costo gr / ml</th>
                <th className="px-4 py-4 text-center">Acciones</th>
              </tr>
            </thead>

            {loading ? (
              <tbody><tr><td colSpan={7} className="p-10 text-center text-gray-300 text-xs">Cargando...</td></tr></tbody>
            ) : filtrada.length === 0 ? (
              <tbody><tr><td colSpan={7} className="p-10 text-center text-gray-300 text-xs">Sin resultados</td></tr></tbody>
            ) : Object.entries(grupos).map(([categoria, items]) => (
              <tbody key={categoria || "__sin__"}>
                {items.map(i => {
                  const gr = calcularCostoGr(i.costoUnitario, i.unidad);
                  return (
                    <tr key={i._id} className="hover:bg-gray-50 transition-colors border-b border-gray-50">
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-black text-gray-400 font-mono">{i.codigo || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {i.familia
                          ? <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-1 rounded-full uppercase">{i.familia}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-800 text-sm">{i.nombre}</td>
                      <td className="px-4 py-3">
                        <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">{i.unidad}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-emerald-600">{f(i.costoUnitario)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-400 text-xs">{fGr(gr)}</td>
                      <td className="px-4 py-3 text-center space-x-2">
                        <button onClick={() => abrirEdicion(i)} className="text-blue-400 hover:text-blue-600"><Pencil size={14} /></button>
                        <button onClick={() => eliminar(i._id, i.nombre)} className="text-red-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </div>

      {/* Drawer — solo nombre, código, unidad, costo */}
      {showDrawer && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/10" onClick={() => setShowDrawer(false)} />
          <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-800">{editando ? "Editar" : "Nuevo"} Ingrediente</h3>
              <button onClick={() => setShowDrawer(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Nombre *</label>
                <input ref={nombreRef} type="text" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: CARNE DE RES"
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:border-emerald-400" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Unidad *</label>
                  <select value={form.unidad}
                    onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
                    className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400">
                    {UNIDADES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Costo Unitario *</label>
                  <input type="number" value={form.costoUnitario}
                    onChange={e => setForm(f => ({ ...f, costoUnitario: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitRef.current?.click(); }}}
                    placeholder="0"
                    className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
                </div>
              </div>

              {/* ── NUEVO: selector de categoría ── */}
              {!editando && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Categoría *</label>
                    <button type="button" onClick={() => { setShowNuevaCat(v => !v); setNuevaCatNombre(""); }}
                      className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest">
                      + Nueva categoría
                    </button>
                  </div>

                  {/* Mini-form nueva categoría */}
                  {showNuevaCat && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-2 space-y-2">
                      <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">
                        Código: <span className="font-mono">{siguienteBase}</span> · Primer producto: <span className="font-mono">{siguienteBase}001</span>
                      </p>
                      <div className="flex gap-2">
                        <input type="text" value={nuevaCatNombre}
                          onChange={e => setNuevaCatNombre(e.target.value.toUpperCase())}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmarNuevaCat(); }}}
                          placeholder="Ej: LÁCTEOS"
                          className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold uppercase outline-none focus:border-emerald-400" />
                        <button type="button" onClick={confirmarNuevaCat}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg font-black text-[10px] uppercase transition-all">
                          OK
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Categoría seleccionada o chips */}
                  {form.familia ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex justify-between">
                        <span className="text-sm font-black text-blue-700">{form.familia}</span>
                        <span className="text-xs font-mono text-blue-400">{form.codigo}</span>
                      </div>
                      <button type="button" onClick={() => setForm(f => ({ ...f, familia: "", codigo: "" }))}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {categorias.map(c => (
                        <button key={c.nombre} type="button" onClick={() => seleccionarCategoria(c.nombre)}
                          className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase border border-gray-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all text-gray-600">
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── EDITAR: código + categoría solo lectura ── */}
              {editando && (() => {
                const ing = lista.find(i => i._id === editando);
                return (ing?.codigo || ing?.familia) ? (
                  <div className="grid grid-cols-2 gap-3">
                    {ing?.codigo && (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Código</p>
                        <p className="text-sm font-black text-gray-700 font-mono mt-0.5">{ing.codigo}</p>
                      </div>
                    )}
                    {ing?.familia && (
                      <div className={`bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 ${!ing?.codigo ? "col-span-2" : ""}`}>
                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Categoría</p>
                        <p className="text-sm font-black text-blue-700 mt-0.5">{ing.familia}</p>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              {costoGrPreview > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex justify-between items-center">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Costo por gr / ml</p>
                  <p className="font-black text-emerald-700">${costoGrPreview.toFixed(2)}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <button ref={submitRef} onClick={guardar} disabled={guardando}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors">
                {guardando ? "Guardando..." : editando ? "✓ Actualizar" : "✓ Crear Ingrediente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
