"use client";
import React, { useState, useRef } from "react";
import { Printer, Pencil, Trash2, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "../../contexts/AuthContext";
import { useContactos } from "../../lib/useContactos";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

export default function ClientesPage() {
  const { branch } = useAuth();
  const { contactos: clientes, guardar: guardarAPI, eliminar: eliminarAPI, importar, importarAPI, localPendientes, migrar, migrando } = useContactos("CLIENTE", branch?.id || "");
  const confirm = useConfirm();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const TIPO_ID_OPTS = [
    { value: "CC",  label: "Cédula de Ciudadanía" },
    { value: "NIT", label: "NIT" },
    { value: "CE",  label: "Cédula de Extranjería" },
    { value: "PA",  label: "Pasaporte" },
    { value: "PEP", label: "Permiso Especial Permanencia" },
    { value: "PPT", label: "Permiso por Protección Temporal" },
  ];

  const [nuevo, setNuevo] = useState({
    nombre: "", apellidos: "", tipoIdentificacion: "CC",
    identificacion: "", tipoPersona: "NATURAL",
    regimenTributario: "NO_RESPONSABLE_IVA",
    direccion: "", ciudad: "", telefono: "", email: "",
  });
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
          nombre:             find(row, ["NOMBRE"]),
          apellidos:          find(row, ["APELLIDO"]),
          tipoIdentificacion: find(row, ["TIPOID","TIPO_ID","TIPO ID"]) || "CC",
          identificacion:     find(row, ["IDENTIFICACION","CEDULA","CC","NIT","ID"]),
          tipoPersona:        find(row, ["TIPOPERSONA","TIPO_PERSONA","TIPO PERSONA"]) || "NATURAL",
          regimenTributario:  find(row, ["REGIMEN","RÉGIMEN"]) || "NO_RESPONSABLE_IVA",
          telefono:           find(row, ["TELEFONO","CEL","MOVIL"]),
          email:              find(row, ["EMAIL","CORREO"]),
          ciudad:             find(row, ["CIUDAD","MUNICIPIO"]),
          direccion:          find(row, ["DIRECCION","DIR"]),
        })).filter(c => c.nombre);
        if (!importados.length) { toast("warning", "No se encontraron registros con columna NOMBRE."); return; }
        const confirmacion = await confirm(`Se importarán ${importados.length} clientes a la base de datos.`);
        if (!confirmacion) return;
        toast("info", "Importando...");
        const n = await importarAPI(importados);
        toast("success", `${n} clientes importados correctamente.`);
      } catch { toast("error", "Error al leer el archivo Excel."); }
    };
    reader.readAsBinaryString(file);
  };

  // Manejo de teclado (Enter para saltar campos)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const form = formRef.current;
      if (form) {
        const inputs = Array.from(form.elements) as HTMLElement[];
        const index = inputs.indexOf(e.target as any);
        if (index > -1 && index < inputs.length - 1) {
          const nextElement = inputs[index + 1];
          // Si el siguiente no es el botón de guardar, le damos el foco
          if (nextElement.getAttribute('type') !== 'submit') {
            nextElement.focus();
          }
        }
      }
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await guardarAPI(editandoId ? { ...nuevo, _id: editandoId } : nuevo);
      cerrarModal();
    } catch { toast("error", "Error al guardar el cliente"); }
  };

  const eliminar = async (id: string) => {
    if (await confirm("¿Deseas eliminar este cliente?")) {
      try { await eliminarAPI(id); } catch { toast("error", "Error al eliminar"); }
    }
  };

  const prepararEdicion = (cliente: any) => {
    setNuevo(cliente);
    setEditandoId(String(cliente._id || cliente.id));
    setMostrarForm(true);
  };

  const cerrarModal = () => {
    setMostrarForm(false);
    setEditandoId(null);
    setNuevo({ nombre: "", apellidos: "", tipoIdentificacion: "CC", identificacion: "", tipoPersona: "NATURAL", regimenTributario: "NO_RESPONSABLE_IVA", direccion: "", ciudad: "", telefono: "", email: "" });
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
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">{localPendientes.length} clientes encontrados en este navegador</p>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">Estos registros aún no están en la base de datos. Mígralos para verlos desde cualquier computador.</p>
          </div>
          <button onClick={async () => { const n = await migrar(); if (n) toast("success", `${n} clientes migrados correctamente`); }}
            disabled={migrando}
            className="shrink-0 bg-amber-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all disabled:opacity-50">
            {migrando ? "Migrando..." : `Migrar ${localPendientes.length} clientes`}
          </button>
        </div>
      )}

      {/* CABECERA FIJA */}
      <div className="bg-white border-b border-gray-100 px-8 py-5 shrink-0 no-print">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Clientes</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">Control de Terceros</p>
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
              className="bg-[#1a2b3c] text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-black transition-all shadow-sm">
              + Nuevo Cliente
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
              <th className="px-5 py-4">Nombre / Apellidos</th>
              <th className="px-5 py-4">Identificación</th>
              <th className="px-5 py-4">Ciudad</th>
              <th className="px-5 py-4">Teléfono</th>
              <th className="px-5 py-4">E-mail</th>
              <th className="px-5 py-4 text-right no-print">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {clientes.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-300 font-bold uppercase text-xs">No hay clientes registrados</td>
              </tr>
            ) : (
              clientes.map((c) => (
                <tr key={c._id || c.id} className="text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <td className="p-5 uppercase text-slate-800 font-bold">{c.nombre} {c.apellidos}</td>
                  <td className="p-5 font-mono text-xs">{c.tipoIdentificacion ? `${c.tipoIdentificacion}: ` : ""}{c.identificacion || "---"}</td>
                  <td className="p-5 text-gray-500 text-xs">{c.ciudad || "---"}</td>
                  <td className="p-5 text-blue-900">{c.telefono || "---"}</td>
                  <td className="p-5 text-gray-400 lowercase text-xs">{c.email || "---"}</td>
                  <td className="p-5 text-right space-x-2 no-print">
                    <button onClick={() => prepararEdicion(c)} className="hover:scale-110 transition-transform text-blue-500"><Pencil size={15} /></button>
                    <button onClick={() => eliminar(String(c._id || c.id))} className="hover:scale-110 transition-transform text-red-400"><Trash2 size={15} /></button>
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
        {mostrarForm && <div className="absolute inset-y-0 -left-screen w-screen bg-black/20 -z-10" onClick={cerrarModal} />}
        <div className="p-10 h-full flex flex-col">
          <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                {editandoId ? "Editar" : "Nuevo"} Cliente
              </h2>
              <p className="text-[9px] font-bold text-blue-500 uppercase mt-0.5">Solo el nombre es obligatorio</p>
            </div>
            <button onClick={cerrarModal} className="p-2 bg-gray-50 text-gray-400 hover:text-red-500 rounded-full transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </header>

          <form ref={formRef} onSubmit={guardar} onKeyDown={handleKeyDown} className="space-y-4 flex-1 overflow-y-auto pr-1">

            {/* Nombre y Apellidos */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre *</label>
                <input placeholder="Nombre" value={nuevo.nombre} onChange={e => setNuevo({...nuevo, nombre: e.target.value})} required
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-400 mt-1" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Apellidos</label>
                <input placeholder="Apellidos" value={nuevo.apellidos} onChange={e => setNuevo({...nuevo, apellidos: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-400 mt-1" />
              </div>
            </div>

            {/* Tipo ID e Identificación */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo ID</label>
                <select value={nuevo.tipoIdentificacion} onChange={e => setNuevo({...nuevo, tipoIdentificacion: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-blue-400 mt-1">
                  {TIPO_ID_OPTS.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Número de identificación</label>
                <input placeholder="Ej. 900123456" value={nuevo.identificacion} onChange={e => setNuevo({...nuevo, identificacion: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-blue-400 mt-1" />
              </div>
            </div>

            {/* Tipo persona y Régimen */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de persona</label>
                <select value={nuevo.tipoPersona} onChange={e => setNuevo({...nuevo, tipoPersona: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-blue-400 mt-1">
                  <option value="NATURAL">Natural</option>
                  <option value="JURIDICA">Jurídica</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Régimen tributario</label>
                <select value={nuevo.regimenTributario} onChange={e => setNuevo({...nuevo, regimenTributario: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-blue-400 mt-1">
                  <option value="NO_RESPONSABLE_IVA">No responsable de IVA</option>
                  <option value="RESPONSABLE_IVA">Responsable de IVA</option>
                </select>
              </div>
            </div>

            {/* Teléfono y Email */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                <input placeholder="Teléfono" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-blue-400 mt-1" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                <input placeholder="correo@ejemplo.com" value={nuevo.email} onChange={e => setNuevo({...nuevo, email: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-blue-400 mt-1" />
              </div>
            </div>

            {/* Ciudad y Dirección */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Ciudad</label>
                <input placeholder="Ej. Medellín" value={nuevo.ciudad} onChange={e => setNuevo({...nuevo, ciudad: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-blue-400 mt-1" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección</label>
                <input placeholder="Dirección" value={nuevo.direccion} onChange={e => setNuevo({...nuevo, direccion: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm outline-none focus:border-blue-400 mt-1" />
              </div>
            </div>

            <button type="submit"
              className="w-full bg-[#1a2b3c] text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-2 mt-6 hover:bg-black transition-colors">
              {editandoId ? "Actualizar Cliente" : "Guardar Cliente"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}