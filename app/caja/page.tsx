"use client";

import { useEffect, useState } from "react";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";

export default function CajaPage() {
  const [caja, setCaja] = useState(0);
  const [ventasHoy, setVentasHoy] = useState<any[]>([]);

  useEffect(() => {
    // Cargar total de caja
    const totalCaja = localStorage.getItem("caja");
    if (totalCaja) setCaja(parseFloat(totalCaja));

    // Filtrar ventas de hoy para el consolidado
    const data = localStorage.getItem("historial");
    if (data) {
      const historial = JSON.parse(data);
      const hoy = new Date().toDateString();
      const filtradas = historial.filter((v: any) => new Date(v.fecha).toDateString() === hoy);
      setVentasHoy(filtradas);
    }
  }, []);

  const totalVentasHoy = ventasHoy.reduce((acc, v) => acc + v.total, 0);

  const confirm = useConfirm();
  const realizarCierreDiario = async () => {
    if (!await confirm("¿Deseas realizar el cierre? Esto reiniciará la caja a $0.")) return;

    // Aquí podrías guardar el cierre en un historial de cierres si quisieras
    localStorage.setItem("caja", "0");
    setCaja(0);
    toast("success", "Cierre realizado con éxito. Caja en ceros.");
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      
      <h1 className="text-3xl font-bold mb-8 text-center">Control de Caja</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-green-100 p-6 rounded-2xl border border-green-200 shadow-sm text-center">
          <p className="text-green-800 font-medium">Dinero en Caja (Total)</p>
          <h2 className="text-4xl font-bold text-green-900">${caja.toLocaleString()}</h2>
        </div>
        
        <div className="bg-blue-100 p-6 rounded-2xl border border-blue-200 shadow-sm text-center">
          <p className="text-blue-800 font-medium">Ventas de Hoy</p>
          <h2 className="text-4xl font-bold text-blue-900">${totalVentasHoy.toLocaleString()}</h2>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h3 className="font-bold text-xl mb-4 text-gray-800">Resumen del Día</h3>
        <p className="flex justify-between mb-2"><span>Cantidad de pedidos:</span> <strong>{ventasHoy.length}</strong></p>
        <p className="flex justify-between border-t pt-2 mb-6"><span>Promedio por mesa:</span> <strong>${ventasHoy.length > 0 ? (totalVentasHoy / ventasHoy.length).toLocaleString() : 0}</strong></p>
        
        <button 
          onClick={realizarCierreDiario}
          className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors"
        >
          Realizar Cierre Diario (Z)
        </button>
      </div>
    </div>
  );
}