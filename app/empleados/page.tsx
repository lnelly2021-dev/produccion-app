"use client";
import React, { useState } from "react";
import { FiUserPlus, FiEdit3, FiTrash2, FiSearch, FiPrinter, FiX, FiSave } from "react-icons/fi";
import * as XLSX from "xlsx";
import { useAuth } from "../../contexts/AuthContext";
import { useContactos } from "../../lib/useContactos";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

interface Empleado {
  id: string;
  identificacion: string;
  nombre: string;
  cargo: string;
  direccion: string;
  telefono: string;
  email: string;
}

export default function EmpleadosPage() {
  const { branch } = useAuth();
  const { contactos: empleados, guardar: guardarAPI, eliminar: eliminarAPI, importar, importarAPI, localPendientes, migrar, migrando } = useContactos("EMPLEADO", branch?.id || "");
  const confirm = useConfirm();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [nuevoEmp, setNuevoEmp] = useState<Omit<Empleado, 'id'>>({
    identificacion: "", nombre: "", cargo: "", direccion: "", telefono: "", email: ""
  });
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Función para formatear identificación con puntos de miles
  const formatID = (val: string) => {
    if (!val) return "---";
    return val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const handleImprimir = () => { window.print(); };

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
        const importados: Empleado[] = rows.map((row, i) => ({
          id:             String(Date.now() + i),
          nombre:         find(row, ["NOMBRE"]),
          identificacion: find(row, ["IDENTIFICACION","CEDULA","CC","ID"]),
          cargo:          find(row, ["CARGO","PUESTO","ROL"]),
          direccion:      find(row, ["DIRECCION","DIR"]),
          telefono:       find(row, ["TELEFONO","CEL","MOVIL"]),
          email:          find(row, ["EMAIL","CORREO"]),
        })).filter(emp => emp.nombre);
        if (!importados.length) { toast("warning", "No se encontraron registros con columna NOMBRE."); return; }
        const ok = await confirm(`Se importarán ${importados.length} empleados a la base de datos.`);
        if (!ok) return;
        toast("info", "Importando...");
        const n = await importarAPI(importados);
        toast("success", `${n} empleados importados correctamente.`);
      } catch { toast("error", "Error al leer el archivo Excel."); }
    };
    reader.readAsBinaryString(file);
  };

  const handleGuardarEmpleado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEmp.nombre.trim()) { toast("warning", "Por favor, ingrese al menos el nombre."); return; }
    try {
      await guardarAPI(editandoId ? { ...nuevoEmp, _id: editandoId } : nuevoEmp);
      setIsDrawerOpen(false);
      setEditandoId(null);
      setNuevoEmp({ identificacion: "", nombre: "", cargo: "", direccion: "", telefono: "", email: "" });
    } catch { toast("error", "Error al guardar el empleado"); }
  };

  const prepararEdicion = (emp: any) => {
    setNuevoEmp({ identificacion: emp.identificacion, nombre: emp.nombre, cargo: emp.cargo || "", direccion: emp.direccion, telefono: emp.telefono, email: emp.email });
    setEditandoId(String(emp._id || emp.id));
    setIsDrawerOpen(true);
  };

  const eliminar = async (id: string) => {
    if (!await confirm("¿Eliminar este colaborador?")) return;
    try { await eliminarAPI(id); } catch { toast("error", "Error al eliminar"); }
  };

  const filteredEmpleados = empleados.filter(emp =>
    emp.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.identificacion.includes(searchTerm)
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8f9fa] font-sans text-slate-800">

      <style jsx global>{`
        @media print {
          nav, aside, .no-print, button { display: none !important; }
          body { background: white !important; }
        }
        .input-contable {
          background-color: #f1f5f9;
          border: 1px solid #e2e8f0;
          box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.05);
        }
      `}</style>

      {/* BANNER MIGRACIÓN */}
      {localPendientes.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex items-center justify-between gap-4 shrink-0 no-print">
          <div>
            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">{localPendientes.length} empleados encontrados en este navegador</p>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">Estos registros aún no están en la base de datos. Mígralos para verlos desde cualquier computador.</p>
          </div>
          <button onClick={async () => { const n = await migrar(); if (n) toast("success", `${n} empleados migrados correctamente`); }}
            disabled={migrando}
            className="shrink-0 bg-amber-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all disabled:opacity-50">
            {migrando ? "Migrando..." : `Migrar ${localPendientes.length} empleados`}
          </button>
        </div>
      )}

      {/* CABECERA FIJA */}
      <div className="bg-white border-b border-gray-100 px-8 py-5 shrink-0 no-print">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Gestión de Personal</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Directorio de colaboradores</p>
          </div>
          <div className="flex gap-3">
            <label className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-emerald-700 transition-all cursor-pointer shadow-sm">
              <FiSave size={14} /> Importar Excel
              <input type="file" accept=".xlsx,.xls" onChange={importarExcel} className="hidden" />
            </label>
            <button onClick={handleImprimir} className="bg-slate-700 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-black transition-all shadow-sm">
              <FiPrinter size={14} /> Imprimir
            </button>
            <button onClick={() => setIsDrawerOpen(true)} className="bg-[#1a2b3c] text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-black transition-all shadow-sm">
              <FiUserPlus size={14} /> Nuevo Empleado
            </button>
          </div>
        </div>
        {/* Buscador */}
        <div className="relative max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input type="text" placeholder="Buscar colaborador..."
            className="w-full bg-slate-50 border border-slate-200 py-2 pl-9 pr-4 rounded-xl text-[10px] font-bold outline-none"
            onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* TABLA CON SCROLL */}
      <div className="flex-1 overflow-hidden px-8 py-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full overflow-auto print-container">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 text-[11px] font-black text-slate-600 uppercase tracking-wide shadow-sm">
                <th className="px-6 py-4">Nombre Completo</th>
                <th className="px-6 py-4">Identificación</th>
                <th className="px-6 py-4">Cargo</th>
                <th className="px-6 py-4">Dirección</th>
                <th className="px-6 py-4">Teléfono</th>
                <th className="px-6 py-4">E-mail</th>
                <th className="px-6 py-4 text-right no-print">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmpleados.map((emp) => (
                <tr key={emp.id} className="border-b border-gray-50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-6 text-sm font-bold text-slate-800">{emp.nombre}</td>
                  <td className="p-6 text-xs font-bold text-blue-600 tracking-wider">
                    {formatID(emp.identificacion)}
                  </td>
                  <td className="p-6 text-xs font-medium text-gray-500 uppercase">{emp.cargo || "---"}</td>
                  <td className="p-6 text-xs text-gray-500">{emp.direccion || "---"}</td>
                  <td className="p-6 text-xs font-bold text-slate-600">{emp.telefono || "---"}</td>
                  <td className="p-6 text-xs text-gray-400 lowercase">{emp.email || "---"}</td>
                  <td className="p-6 text-right no-print">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => prepararEdicion(emp)} className="p-2 hover:bg-blue-50 text-blue-400 rounded-lg"><FiEdit3 size={15} /></button>
                      <button onClick={() => eliminar(String((emp as any)._id || emp.id))} className="p-2 hover:bg-red-50 text-red-400 rounded-lg"><FiTrash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cajón Lateral */}
      <div className={`fixed top-0 right-0 h-full w-full md:w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-gray-100 no-print ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-10 h-full flex flex-col">
          <header className="flex justify-between items-center mb-8 pb-4 border-b">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">{editandoId ? "Editar" : "Nuevo"} Colaborador</h2>
              <p className="text-[9px] font-bold text-blue-500 uppercase">Solo el nombre es obligatorio</p>
            </div>
            <button onClick={() => { setIsDrawerOpen(false); setEditandoId(null); setNuevoEmp({ identificacion:"", nombre:"", cargo:"", direccion:"", telefono:"", email:"" }); }} className="p-2 bg-gray-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"><FiX size={20} /></button>
          </header>

          <form onSubmit={handleGuardarEmpleado} className="space-y-6 flex-1 overflow-y-auto pr-2">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Nombre Completo *</label>
              <input 
                value={nuevoEmp.nombre} 
                onChange={e => setNuevoEmp({...nuevoEmp, nombre: e.target.value})} 
                className="input-contable w-full p-4 rounded-2xl text-sm mt-1 outline-none font-bold text-slate-700" 
                placeholder="Obligatorio"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Identificación</label>
                <input 
                  type="text" 
                  value={nuevoEmp.identificacion} 
                  onChange={e => setNuevoEmp({...nuevoEmp, identificacion: e.target.value})} 
                  className="input-contable w-full p-4 rounded-2xl text-sm mt-1 outline-none" 
                  placeholder="Sin puntos"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Cargo</label>
                <input value={nuevoEmp.cargo} onChange={e => setNuevoEmp({...nuevoEmp, cargo: e.target.value})} className="input-contable w-full p-4 rounded-2xl text-sm mt-1 outline-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Dirección Residencial</label>
              <input value={nuevoEmp.direccion} onChange={e => setNuevoEmp({...nuevoEmp, direccion: e.target.value})} className="input-contable w-full p-4 rounded-2xl text-sm mt-1 outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Teléfono</label>
                <input value={nuevoEmp.telefono} onChange={e => setNuevoEmp({...nuevoEmp, telefono: e.target.value})} className="input-contable w-full p-4 rounded-2xl text-sm mt-1 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">E-mail</label>
                <input type="email" value={nuevoEmp.email} onChange={e => setNuevoEmp({...nuevoEmp, email: e.target.value})} className="input-contable w-full p-4 rounded-2xl text-sm mt-1 outline-none" />
              </div>
            </div>
            
            <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-[25px] font-black text-xs uppercase tracking-[3px] shadow-xl shadow-blue-100 flex items-center justify-center gap-2 mt-8 hover:bg-blue-700 transition-colors">
              <FiSave size={18} /> Guardar Colaborador
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}