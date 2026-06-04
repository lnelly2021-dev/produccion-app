"use client";

import { X, CheckCircle, QrCode } from "lucide-react";
import { getEmpresaConfig } from "../../lib/empresaStorage";

interface Props {
  monto: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function QRPaymentModal({ monto, onConfirm, onCancel }: Props) {
  const qrUrl = (() => {
    try {
      const cfg = getEmpresaConfig();
      return cfg.qrPago || "";
    } catch { return ""; }
  })();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a2b3c] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <QrCode size={20} className="text-white" />
            <h2 className="text-base font-black text-white uppercase tracking-tight">Pago con QR</h2>
          </div>
          <button onClick={onCancel} className="text-white/60 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Monto */}
        <div className="px-6 pt-5 pb-3 text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total a pagar</p>
          <p className="text-4xl font-black text-gray-900">${monto.toLocaleString("es-CO")}</p>
        </div>

        {/* QR Image */}
        <div className="px-6 pb-5 flex flex-col items-center">
          {qrUrl ? (
            <>
              <div className="w-52 h-52 border-2 border-gray-200 rounded-2xl overflow-hidden flex items-center justify-center bg-gray-50 mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="QR de pago" className="w-full h-full object-contain" />
              </div>
              <p className="text-[10px] text-gray-400 font-bold text-center mb-5">
                El cliente escanea este código con Nequi o Bancolombia
              </p>
            </>
          ) : (
            <div className="w-52 h-52 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center mb-4 bg-gray-50">
              <QrCode size={40} className="text-gray-300 mb-2" />
              <p className="text-[10px] text-gray-400 font-bold text-center px-4">
                Configura la imagen QR en Configuración → POS
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 w-full">
            <button onClick={onCancel}
              className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-2xl font-black text-[10px] uppercase hover:bg-gray-200 transition-all">
              Cancelar
            </button>
            <button onClick={onConfirm}
              className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
              <CheckCircle size={14} /> Confirmar Pago
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
