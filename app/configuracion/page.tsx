"use client";
import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";

interface Config {
  margenDefault: number;
  ivaDefault: number;
  moneda: string;
  unidadDefault: string;
}

const DEFAULT_CONFIG: Config = { margenDefault: 30, ivaDefault: 19, moneda: "COP", unidadDefault: "und" };

export default function ConfiguracionPage() {
  const { branch } = useAuth();
  const branchId = branch?.id || "";
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [guardando, setGuardando] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/branches/${branchId}/config`)
      .then(({ data }) => setConfig({ ...DEFAULT_CONFIG, ...(data.data ?? data) }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [branchId]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await api.put(`/branches/${branchId}/config`, config);
      toast("success", "Configuración guardada");
    } catch { toast("error", "Error al guardar"); }
    finally { setGuardando(false); }
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-8 py-5 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Configuración</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">Parámetros generales del sistema</p>
          </div>
          <button onClick={guardar} disabled={guardando}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-sm">
            <Save size={14} /> {guardando ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl space-y-4">

          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Costos y Precios</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Margen Objetivo (%)</label>
                <input type="number" value={config.margenDefault}
                  onChange={e => setConfig(c => ({ ...c, margenDefault: parseFloat(e.target.value) || 0 }))}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
                <p className="text-[9px] text-gray-400 mt-1">Usado en Hoja de Costos como referencia</p>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">IVA por Defecto (%)</label>
                <input type="number" value={config.ivaDefault}
                  onChange={e => setConfig(c => ({ ...c, ivaDefault: parseFloat(e.target.value) || 0 }))}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
            <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Unidades y Moneda</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Moneda</label>
                <select value={config.moneda}
                  onChange={e => setConfig(c => ({ ...c, moneda: e.target.value }))}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400">
                  <option value="COP">COP — Peso Colombiano</option>
                  <option value="USD">USD — Dólar Americano</option>
                  <option value="MXN">MXN — Peso Mexicano</option>
                  <option value="PEN">PEN — Sol Peruano</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Unidad por Defecto</label>
                <select value={config.unidadDefault}
                  onChange={e => setConfig(c => ({ ...c, unidadDefault: e.target.value }))}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400">
                  {["und", "kg", "gr", "lt", "ml", "oz", "lb"].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
