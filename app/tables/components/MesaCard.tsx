"use client";

import { Mesa } from "../interfaces";

interface Props {
  mesa: Mesa;
  onClick: (mesa: Mesa) => void;
  tieneAlerta?: boolean;
}

export default function MesaCard({ mesa, onClick, tieneAlerta }: Props) {
  const libre = mesa.estado === "libre";

  return (
    <div
      onClick={() => onClick(mesa)}
      className={`cursor-pointer rounded-2xl p-3 md:p-5 shadow-sm border-2 bg-white transition-all select-none active:scale-95 relative ${
        tieneAlerta
          ? "border-orange-400 shadow-orange-100 shadow-lg animate-pulse"
          : "border-[#c4bfbf] hover:shadow-md hover:border-[#a8a3a3]"
      }`}
    >
      {tieneAlerta && (
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-[9px] font-black">!</span>
      )}
      {/* Estado badge */}
      <div className="flex justify-between items-start mb-3">
        <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">
          {mesa.nombre}
        </h2>
        <span className={`w-3 h-3 rounded-full mt-1 shrink-0 ${libre ? "bg-emerald-500" : "bg-red-500"}`} />
      </div>

      {/* Mesero */}
      {mesa.mesero ? (
        <div className="bg-white/70 rounded-xl px-3 py-2 mb-2">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mesero</p>
          <p className="text-[11px] font-black text-slate-700 uppercase mt-0.5">{mesa.mesero}</p>
        </div>
      ) : (
        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">Disponible</p>
      )}

      {/* Total del pedido activo */}
      {mesa.pedidoActivo?.items?.length > 0 ? (
        <p className="text-sm font-black text-red-700 mt-1">
          $ {mesa.pedidoActivo.items
              .reduce((acc: number, i: any) => acc + (Number(i.subtotal) || 0), 0)
              .toLocaleString("es-CO")}
        </p>
      ) : mesa.mesero ? (
        <p className="text-[10px] font-bold text-red-400 uppercase">Sin pedido aún</p>
      ) : null}
    </div>
  );
}
