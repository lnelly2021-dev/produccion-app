"use client";
import React, { useState, useRef } from "react";
import { Printer, Pencil, Trash2, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "../../contexts/AuthContext";
import { useContactos } from "../../lib/useContactos";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

export default function ProveedoresPage() {
  const { branch } = useAuth();
  const { contactos: proveedores, guardar: guardarAPI, eliminar: eliminarAPI, importar, importarAPI, localPendientes, migrar, migrando } = useContactos("PROVEEDOR", branch?.id || "");
  const confirm = useConfirm();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: "", nit: "", direccion: "", telefono: "", email: "" });
  const formRef = useRef<HTMLFormElement>(null);

  const imprimirListado = () => { window.print(); };

  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });
        const find = (row: any, keys: string[]) => {
          const k = Object.keys(row).find(k =>
            keys.some(p => k.trim().toUpperCase().includes(p))
          );
          return k ? String(row[k]).trim() : "";
        };
        const importados = rows.map((row, i) => ({
          id: Date.now() + i,
          nombre:    find(row, ["NOMBRE","RAZON","EMPRESA","PROVEEDOR"]),
          nit:       find(row, ["NIT","RUT","CEDULA","ID"]),
          telefono:  find(row, ["TELEFONO","CEL","MOVIL"]),
          email:     find(row, ["EMAIL","CORREO"]),
          direccion: find(row, ["DIRECCION","DIR"]),
        })).filter(p => p.nombre);
        if (!importados.length) { toast("warning", "No se encontraron registros con columna NOMBRE."); return; }
        const ok = await confirm(`Se importarán ${importados.length} proveedores a la base de datos.`);
        if (!ok) return;
        toast("info", "Importando...");
        const n = await importarAPI(importados);
        toast("success", `${n} proveedores importados correctamente.`);
      } catch { toast("error", "Error al leer el archivo Excel."); }
    };
    reader.readAsBinaryString(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const form = formRef.current;
      if (form) {
        const inputs = Array.from(form.elements) as HTMLElement[];
        const index = inputs.indexOf(e.target as any);
        if (index > -1 && index < inputs.length - 1) {
          const nextElement = inputs[index + 1];
          if (nextElement.getAttribute('type') !== 'submit') nextElement.focus();
        }
      }
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await guardarAPI(editandoId ? { ...nuevo, _id: editandoId } : nuevo);
      cerrarModal();
    } catch { toast("error", "Error al guardar el proveedor"); }
  };

  const eliminar = async (id: string) => {
    if (await confirm("¿Deseas eliminar este proveedor?")) {
      try { await eliminarAPI(id); } catch { toast("error", "Error al eliminar"); }
    }
  };

  const prepararEdicion = (p: any) => {
    setNuevo(p);
    setEditandoId(String(p._id || p.id));
    setMostrarForm(true);
  };

  const cerrarModal = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setNuevo({ nombre: "", nit: "", direccion: "", telefono: "", email: "" });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      <style jsx global>{`
        @media print {
          .no-print, button, nav, aside { display: none !important; }
          body { background: white !important; }
          .tabla-contenedor { border: none !important; box-shadow: none !important; }
        }
      `}</style>

      {/* BANNER MIGRACIÓN */}
      {localPendientes.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex items-center justify-between gap-4 shrink-0 no-print">
          <div>
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">{localPendientes.length} proveedores encontrados en este navegador</p>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">Estos registros aún no están en la base de datos. Mígralos para verlos desde cualquier computador.</p>
          </div>
          <button onClick={async () => { const n = await migrar(); if (n) toast("success", `${n} proveedores migrados correctamente`); }}
            disabled={migrando}
            className="shrink-0 bg-amber-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all disabled:opacity-50">
            {migrando ? "Migrando..." : `Migrar ${localPendientes.length} proveedores`}
          </button>
        </div>
      )}

      {/* CABECERA FIJA */}
      <div className="bg-white border-b border-gray-100 px-8 py-5 shrink-0 no-print">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Proveedores</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">Suministros y Compras</p>
          </div>
          <div className="flex gap-3">
            <label className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 hover:bg-emerald-700 transition-all cursor-pointer shadow-sm">
              <FileDown size={14} /> Importar Excel
              <input type="file" accept=".xlsx,.xls" onChange={importarExcel} className="hidden" />
            </label>
            <button onClick={imprimirListado}
              className="bg-slate-700 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 hover:bg-black transition-all shadow-sm">
              <Printer size={14} /> Imprimir
            </button>
            <button onClick={() => setMostrarForm(true)}
              className="bg-[#1a2b3c] text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 hover:bg-black transition-all shadow-sm">
              + Nuevo Proveedor
            </button>
          </div>
        </div>
      </div>

      {/* TABLA CON SCROLL */}
      <div className="flex-1 overflow-hidden px-8 py-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full overflow-auto tabla-contenedor">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 text-[11px] font-black text-slate-600 uppercase tracking-wide shadow-sm">
              <th className="px-5 py-4 w-1/4">Razón Social</th>
              <th className="px-5 py-4">NIT</th>
              <th className="px-5 py-4 w-1/4">Dirección</th>
              <th className="px-5 py-4">Teléfono</th>
              <th className="px-5 py-4">E-mail</th>
              <th className="px-5 py-4 text-right no-print">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {proveedores.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-300 font-bold uppercase text-xs">Sin proveedores</td>
              </tr>
            ) : (
              proveedores.map((p) => (
                <tr key={p.id} className="text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <td className="p-5 uppercase text-slate-800 font-bold truncate max-w-[200px]">{p.nombre}</td>
                  <td className="p-5 font-mono text-xs">{p.nit || "---"}</td>
                  <td className="p-5 text-gray-500 text-xs truncate max-w-[200px]">{p.direccion || "---"}</td>
                  <td className="p-5 text-gray-900 whitespace-nowrap">{p.telefono || "---"}</td>
                  <td className="p-5 text-gray-400 lowercase text-xs">{p.email || "---"}</td>
                  <td className="p-5 text-right space-x-2 no-print whitespace-nowrap">
                    <button onClick={() => prepararEdicion(p)} className="text-blue-500"><Pencil size={15} /></button>
                    <button onClick={() => eliminar(String(p._id || p.id))} className="text-red-400"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* DRAWER LATERAL */}
      <div className={`fixed top-0 right-0 h-full w-full md:w-[480px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-gray-100 no-print ${mostrarForm ? "translate-x-0" : "translate-x-full"}`}>
        <div className="p-10 h-full flex flex-col">
          <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                {editandoId ? "Editar" : "Nuevo"} Proveedor
              </h2>
              <p className="text-[9px] font-bold text-emerald-500 uppercase mt-0.5">La razón social es obligatoria</p>
            </div>
            <button onClick={cerrarModal} className="p-2 bg-gray-50 text-gray-400 hover:text-red-500 rounded-full transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </header>

          <form ref={formRef} onSubmit={guardar} onKeyDown={handleKeyDown} className="space-y-4 flex-1 overflow-y-auto pr-1">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Razón Social *</label>
              <input placeholder="Nombre o Razón Social" value={nuevo.nombre} onChange={e => setNuevo({...nuevo, nombre: e.target.value})} required
                className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-emerald-400 mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NIT</label>
                <input placeholder="NIT" value={nuevo.nit} onChange={e => setNuevo({...nuevo, nit: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-emerald-400 mt-1" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                <input placeholder="Teléfono" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-emerald-400 mt-1" />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
              <input placeholder="correo@ejemplo.com" value={nuevo.email} onChange={e => setNuevo({...nuevo, email: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-emerald-400 mt-1" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección</label>
              <input placeholder="Dirección" value={nuevo.direccion} onChange={e => setNuevo({...nuevo, direccion: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-emerald-400 mt-1" />
            </div>

            <button type="submit"
              className="w-full bg-[#1a2b3c] text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg mt-6 hover:bg-black transition-colors">
              {editandoId ? "Actualizar Proveedor" : "Guardar Proveedor"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}