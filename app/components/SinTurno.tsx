"use client";
import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { getEmpresaConfig } from "../../lib/empresaStorage";

interface Props {
  onTurnoAbierto: (turno: any) => void;
  branchId?: string;
}

export default function SinTurno({ onTurnoAbierto, branchId }: Props) {
  const turnoKey = branchId ? `turno_actual_${branchId}` : "turno_actual";
  const [mostrarModal, setMostrarModal] = useState(false);
  const [responsable, setResponsable]   = useState("");
  const [base, setBase]                 = useState(() => {
    try {
      const cfg = getEmpresaConfig();
      return String(cfg.baseCaja || 0);
    } catch { return "0"; }
  });

  const abrir = () => {
    if (!responsable.trim()) return;
    const ahora = new Date();
    const turno = {
      responsable:      responsable.toUpperCase(),
      fechaApertura:    ahora.toLocaleString(),
      fechaAperturaISO: ahora.toISOString(),
      baseCaja:         parseFloat(base) || 0,
    };
    localStorage.setItem(turnoKey, JSON.stringify(turno));
    onTurnoAbierto(turno);
    setMostrarModal(false);
  };

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-50 gap-6 p-8">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-10 flex flex-col items-center gap-4 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
          <Lock size={28} className="text-slate-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Sin Turno Abierto</h2>
          <p className="text-[11px] text-slate-400 font-bold mt-1">
            Debes abrir turno antes de comenzar a operar
          </p>
        </div>
        <button
          onClick={() => setMostrarModal(true)}
          className="w-full bg-[#1a2b3c] text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <Unlock size={14} /> Abrir Turno Ahora
        </button>
      </div>

      {/* Modal apertura */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl">
            <h2 className="text-lg font-black uppercase tracking-tighter text-slate-800 mb-1">Abrir Turno</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">
              Confirma los datos de apertura
            </p>

            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Responsable *</p>
                <input
                  autoFocus
                  value={responsable}
                  onChange={e => setResponsable(e.target.value.toUpperCase())}
                  placeholder="NOMBRE DEL CAJERO..."
                  className="w-full bg-transparent font-black uppercase text-sm outline-none"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget.closest("form, div")?.querySelector("input[type='number']") as HTMLInputElement)?.focus();
                    }
                  }}
                />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Base de Caja</p>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-black">$</span>
                  <input
                    type="number"
                    value={base}
                    onChange={e => setBase(e.target.value)}
                    className="flex-1 bg-transparent font-black text-lg outline-none"
                  />
                </div>
                <p className="text-[9px] text-slate-400 mt-1">Efectivo con que abre la caja</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setMostrarModal(false)}
                className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-xl font-black uppercase text-[10px]"
              >
                Cancelar
              </button>
              <button
                onClick={abrir}
                disabled={!responsable.trim()}
                className="flex-1 bg-[#1a2b3c] text-white py-4 rounded-xl font-black uppercase text-[10px] hover:bg-black transition-all disabled:bg-slate-200 disabled:text-slate-400"
              >
                Abrir Turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
