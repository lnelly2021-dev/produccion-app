"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig } from "../../lib/empresaStorage";
import { useConfirm } from "../../contexts/ConfirmContext";

interface Pago { medio: string; monto: string; }

export default function AnticiposPage() {
  const router   = useRouter();
  const { branch, company } = useAuth();
  const branchId = branch?.id || "";
  const confirm  = useConfirm();

  const [prefacturas,  setPrefacturas]  = useState<any[]>([]);
  const [filtro,       setFiltro]       = useState<"PENDIENTE"|"TODAS">("TODAS");
  const [seleccionada, setSeleccionada] = useState<any>(null);
  const [modo,         setModo]         = useState<"abonar"|"entregar">("abonar");
  const [pagosForm,    setPagosForm]    = useState<Pago[]>([{ medio: "EFECTIVO", monto: "" }]);
  const [procesando,   setProcesando]   = useState(false);
  const [listaBancos,  setListaBancos]  = useState<string[]>([]);

  const cargar = useCallback(async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get(`/branches/${branchId}/pre-facturas`);
      setPrefacturas(data.data ?? data);
    } catch { toast("error", "Error al cargar anticipos"); }
  }, [branchId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!branchId) return;
    const bk = localStorage.getItem(`lista_bancos_${branchId}`) || localStorage.getItem("lista_bancos");
    if (bk) setListaBancos(JSON.parse(bk));
  }, [branchId]);

  const mediosPago = ["EFECTIVO", ...Array.from(new Set([...listaBancos, "NEQUI", "DAVIPLATA", "TRANSFERENCIA"]))];

  const f      = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
  const fFecha = (d: string) => d ? new Date(d).toLocaleDateString("es-CO", { day:"2-digit", month:"2-digit", year:"2-digit" }) : "—";

  // Filtro visual
  const lista = filtro === "PENDIENTE"
    ? prefacturas.filter(p => p.estado === "PENDIENTE")
    : prefacturas;

  const totalPendiente = prefacturas
    .filter(p => p.estado === "PENDIENTE")
    .reduce((s, p) => s + (p.saldoPendiente || 0), 0);

  const totalPagado = pagosForm.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);

  const abrirDrawer = (pf: any) => {
    setSeleccionada(pf);
    const saldo = pf.saldoPendiente || 0;
    setModo(saldo > 0 ? "abonar" : "entregar");
    setPagosForm([{ medio: "EFECTIVO", monto: saldo > 0 ? String(saldo) : "" }]);
  };

  const cerrarDrawer = () => {
    setSeleccionada(null);
    setPagosForm([{ medio: "EFECTIVO", monto: "" }]);
  };

  // Actualiza el PF seleccionado en la lista en memoria sin recargar todo
  const refrescarPF = async () => {
    await cargar();
    // Re-seleccionar el mismo PF con datos frescos
    if (seleccionada) {
      const { data } = await api.get(`/branches/${branchId}/pre-facturas`).catch(() => ({ data: { data: [] } }));
      const lista = data.data ?? data;
      const actualizado = lista.find((p: any) => p._id === seleccionada._id);
      if (actualizado) {
        setSeleccionada(actualizado);
        const saldo = actualizado.saldoPendiente || 0;
        setModo(saldo > 0 ? "abonar" : "entregar");
        setPagosForm([{ medio: "EFECTIVO", monto: saldo > 0 ? String(saldo) : "" }]);
      }
    }
  };

  const abonar = async () => {
    if (!seleccionada) return;
    const pagosValidos = pagosForm.filter(p => parseFloat(p.monto) > 0)
      .map(p => ({ medio: p.medio, monto: parseFloat(p.monto) }));
    if (pagosValidos.length === 0) { toast("warning", "Ingresa un monto"); return; }
    if (totalPagado > seleccionada.saldoPendiente) {
      toast("warning", `El abono supera el saldo ${f(seleccionada.saldoPendiente)}`); return;
    }
    setProcesando(true);
    try {
      await api.post(`/branches/${branchId}/pre-facturas/${seleccionada._id}/abonar`, { pagos: pagosValidos });
      toast("success", `Abono de ${f(totalPagado)} registrado`);
      setFiltro("TODAS");
      await refrescarPF();
    } catch (err: any) {
      toast("error", err?.response?.data?.message || "Error al abonar");
    } finally { setProcesando(false); }
  };

  const entregar = async () => {
    if (!seleccionada) return;
    const saldo = seleccionada.saldoPendiente || 0;
    const pagosValidos = saldo > 0
      ? pagosForm.filter(p => parseFloat(p.monto) > 0).map(p => ({ medio: p.medio, monto: parseFloat(p.monto) }))
      : [];

    if (saldo > 0 && totalPagado < saldo) { toast("warning", `Saldo ${f(saldo)} no cubierto`); return; }

    const ok = await confirm(`¿Convertir ${seleccionada.nroDocumento} en factura y descontar inventario?`);
    if (!ok) return;
    setProcesando(true);
    try {
      const { data } = await api.post(`/branches/${branchId}/pre-facturas/${seleccionada._id}/entregar`, { pagos: pagosValidos });
      imprimirFactura(data.data.venta, data.data.preFactura);
      toast("success", `Factura ${data.data.venta.nroFactura} emitida`);
      setFiltro("TODAS");
      await refrescarPF();
    } catch (err: any) {
      toast("error", err?.response?.data?.message || "Error al entregar");
    } finally { setProcesando(false); }
  };

  const anular = async (pf: any) => {
    const ok = await confirm(`¿Anular ${pf.nroDocumento}? El anticipo recibido deberá devolverse manualmente.`);
    if (!ok) return;
    try {
      await api.post(`/branches/${branchId}/pre-facturas/${pf._id}/anular`);
      toast("success", `${pf.nroDocumento} anulada`);
      setFiltro("TODAS");
      await refrescarPF();
    } catch (err: any) { toast("error", err?.response?.data?.message || "Error al anular"); }
  };

  const imprimirFactura = (venta: any, pf: any) => {
    const emp  = getEmpresaConfig();
    const f2   = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
    const filas = (venta.productos || []).map((p: any) =>
      `<tr><td>${p.nombre}</td><td align="right">${p.cantidad}</td><td align="right">${f2(p.precio)}</td><td align="right">${f2(p.subtotal)}</td></tr>`
    ).join("");
    const pagosHtml = (venta.pagos || []).map((p: any) =>
      `<div style="display:flex;justify-content:space-between"><span>${p.medio}</span><span>${f2(p.monto)}</span></div>`
    ).join("");
    const html = `<html><head><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:5px;margin:0;font-size:11px}
      .c{text-align:center}.b{font-weight:bold}.hr{border-top:1px dashed #000;margin:5px 0}
      table{width:100%;font-size:10px}
    </style></head><body>
    <div class="c b">${emp.nombreEmpresa || company?.name || ""}</div>
    <div class="c">NIT: ${emp.nit || ""} | Tel: ${emp.telefono || ""}</div>
    <div class="hr"></div>
    <div class="c b" style="font-size:13px">FACTURA ${venta.nroFactura}</div>
    <div class="c" style="font-size:9px">Ref. anticipo: ${pf.nroDocumento}</div>
    <div class="hr"></div>
    <div>CLIENTE: ${venta.cliente}</div>
    <div>FECHA: ${new Date(venta.createdAt || Date.now()).toLocaleDateString("es-CO")}</div>
    <div class="hr"></div>
    <table><tr><th align="left">PRODUCTO</th><th>CANT</th><th align="right">P.U.</th><th align="right">TOTAL</th></tr>
    ${filas}</table>
    <div class="hr"></div>
    ${pf.descuento > 0 ? `<div style="display:flex;justify-content:space-between"><span>Descuento</span><span>-${f2(pf.descuento)}</span></div>` : ""}
    ${(pf.envio||0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Domicilio</span><span>+${f2(pf.envio)}</span></div>` : ""}
    <div style="display:flex;justify-content:space-between"><b>TOTAL</b><b>${f2(venta.valor)}</b></div>
    <div class="hr"></div>
    ${pagosHtml}
    <div class="hr"></div>
    <div class="c">¡GRACIAS POR SU COMPRA!</div>
    </body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
    setTimeout(() => { w?.print(); }, 400);
  };

  const estadoBadge = (e: string) =>
    e === "PENDIENTE" ? "bg-amber-100 text-amber-700" :
    e === "ENTREGADA" ? "bg-emerald-100 text-emerald-700" :
    "bg-red-100 text-red-500";

  // Suma de todos los pagos aplicados (abonos + pago al entregar)
  const debitoAplicado = (pf: any) =>
    (pf.abonos || []).reduce((s: number, a: any) => s + (Number(a.monto) || 0), 0);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-5 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Anticipos</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">Cuenta 2805 — Pre-facturas</p>
          </div>
          <button onClick={() => router.push("/pre-factura")}
            className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-sm shadow-amber-100">
            <Plus size={14} /> Nueva Pre-Factura
          </button>
        </div>
        <div className="flex items-center gap-4 mt-4">
          {(["PENDIENTE","TODAS"] as const).map(f2 => (
            <button key={f2} onClick={() => setFiltro(f2)}
              className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-lg transition-all ${filtro === f2 ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              {f2}
            </button>
          ))}
          {totalPendiente > 0 && (
            <span className="ml-auto text-[10px] font-black text-amber-600">
              Saldo total pendiente: {f(totalPendiente)}
            </span>
          )}
        </div>
      </div>

      {/* Libro de Anticipos */}
      <div className="flex-1 overflow-hidden px-8 py-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full overflow-auto">
          {/* Encabezados */}
          <div className="grid grid-cols-[90px_110px_1fr_100px_100px_90px_100px] border-b border-gray-200 bg-gray-50 px-5 py-3 sticky top-0 z-10">
            {["FECHA","DOCUMENTO","TERCERO","DÉBITO (Aplicado)","CRÉDITO (Recibido)","SALDO","ESTADO"].map(h => (
              <span key={h} className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{h}</span>
            ))}
          </div>

          {lista.length === 0 ? (
            <p className="text-center text-gray-300 text-xs py-12">Sin pre-facturas</p>
          ) : lista.map(pf => {
            const credito  = pf.anticipo || 0;          // CRÉDITO: anticipo recibido
            const debito   = debitoAplicado(pf);         // DÉBITO: suma de lo aplicado
            const saldoAct = pf.saldoPendiente || 0;
            return (
              <div key={pf._id}>
                {/* Fila principal */}
                <div onClick={() => abrirDrawer(pf)}
                  className={`grid grid-cols-[90px_110px_1fr_100px_100px_90px_100px] px-5 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer items-center ${seleccionada?._id === pf._id ? "bg-amber-50" : ""}`}>
                  <span className="text-xs text-gray-500">{fFecha(pf.createdAt)}</span>
                  <span className="text-xs font-black text-gray-800">{pf.nroDocumento}</span>
                  <span className="text-xs font-bold text-gray-700 truncate pr-4">{pf.tercero}</span>
                  {/* DÉBITO primero */}
                  <span className={`text-xs font-black ${debito > 0 ? "text-emerald-700" : "text-gray-300"}`}>{debito > 0 ? f(debito) : "—"}</span>
                  {/* CRÉDITO segundo */}
                  <span className="text-xs font-black text-amber-600">{f(credito)}</span>
                  <span className={`text-xs font-black ${saldoAct > 0 ? "text-gray-800" : "text-gray-400"}`}>{saldoAct > 0 ? f(saldoAct) : "—"}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${estadoBadge(pf.estado)}`}>{pf.estado}</span>
                </div>
                {/* Sub-filas de abonos: DÉBITO = monto aplicado */}
                {(pf.abonos || []).map((ab: any, i: number) => (
                  <div key={i} className="grid grid-cols-[90px_110px_1fr_100px_100px_90px_100px] px-5 py-1.5 bg-emerald-50/40 border-b border-gray-50 items-center">
                    <span className="text-[10px] text-gray-400">{fFecha(ab.fecha)}</span>
                    <span className="text-[10px] text-gray-400 pl-3">↳ Abono</span>
                    <span className="text-[10px] text-gray-500">{ab.medio}</span>
                    <span className="text-[10px] font-black text-emerald-700">{f(ab.monto)}</span>
                    <span className="text-[10px] text-gray-300">—</span>
                    <span></span><span></span>
                  </div>
                ))}
                {/* Sub-fila de entrega: solo referencia a la factura */}
                {pf.estado === "ENTREGADA" && pf.facturaRef && (
                  <div className="grid grid-cols-[90px_110px_1fr_100px_100px_90px_100px] px-5 py-1.5 bg-emerald-50 border-b border-gray-100 items-center">
                    <span className="text-[10px] text-gray-400">{fFecha(pf.updatedAt)}</span>
                    <span className="text-[10px] font-black text-emerald-700 pl-3">↳ {pf.facturaRef}</span>
                    <span className="text-[10px] text-gray-500">Entregado — saldo cancelado</span>
                    <span className="text-[10px] text-gray-300">—</span>
                    <span className="text-[10px] text-gray-300">—</span>
                    <span className="text-[10px] font-black text-emerald-600">✓</span>
                    <span></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Drawer lateral */}
      {seleccionada && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/10" onClick={cerrarDrawer} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
            {/* Header drawer */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{seleccionada.nroDocumento}</p>
                <p className="text-lg font-black text-gray-800">{seleccionada.tercero}</p>
                {seleccionada.facturaRef && (
                  <p className="text-[10px] text-emerald-600 font-bold mt-0.5">→ Factura: {seleccionada.facturaRef}</p>
                )}
              </div>
              <button onClick={cerrarDrawer} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Productos */}
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Detalle del pedido</p>
                <div className="space-y-1">
                  {(seleccionada.productos||[]).map((p: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-50">
                      <span className="text-gray-700 flex-1 truncate pr-3">{p.nombre}</span>
                      <span className="text-gray-400 w-8 text-center">×{p.cantidad}</span>
                      <span className="font-black text-gray-800 w-20 text-right">{f(p.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumen financiero */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{f(seleccionada.subtotal)}</span></div>
                {(seleccionada.descuento||0) > 0 && (
                  <div className="flex justify-between text-red-500"><span>Descuento</span><span>− {f(seleccionada.descuento)}</span></div>
                )}
                {(seleccionada.envio||0) > 0 && (
                  <div className="flex justify-between text-gray-500"><span>Domicilio</span><span>+ {f(seleccionada.envio)}</span></div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-1 font-black">
                  <span>Total pedido</span><span>{f(seleccionada.total)}</span>
                </div>
              </div>

              {/* Historial de pagos */}
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Historial de pagos</p>
                {/* Anticipo original */}
                <div className="bg-amber-50 rounded-lg px-3 py-2 mb-1">
                  <p className="text-[9px] font-black text-amber-600 uppercase mb-1">Anticipo inicial</p>
                  {(seleccionada.pagos||[]).map((p: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-500">{p.medio}</span>
                      <span className="font-bold text-amber-700">{f(p.monto)}</span>
                    </div>
                  ))}
                </div>
                {/* Abonos previos */}
                {(seleccionada.abonos||[]).map((ab: any, i: number) => (
                  <div key={i} className="bg-emerald-50 rounded-lg px-3 py-2 mb-1">
                    <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Abono {i+1} — {fFecha(ab.fecha)}</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">{ab.medio}</span>
                      <span className="font-bold text-emerald-700">{f(ab.monto)}</span>
                    </div>
                  </div>
                ))}
                {/* Saldo */}
                <div className={`rounded-lg px-3 py-2 flex justify-between text-xs font-black ${seleccionada.saldoPendiente > 0 ? "bg-gray-100 text-gray-800" : "bg-emerald-100 text-emerald-700"}`}>
                  <span>Saldo pendiente</span>
                  <span>{seleccionada.saldoPendiente > 0 ? f(seleccionada.saldoPendiente) : "✓ PAGADO"}</span>
                </div>
              </div>

              {/* Notas */}
              {seleccionada.notasEntrega && (
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
                  <span className="font-black">Notas: </span>{seleccionada.notasEntrega}
                </div>
              )}

              {/* Formulario de pago (solo si PENDIENTE) */}
              {seleccionada.estado === "PENDIENTE" && seleccionada.saldoPendiente > 0 && (
                <div>
                  {/* Tabs abonar / entregar */}
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => { setModo("abonar"); setPagosForm([{ medio: "EFECTIVO", monto: "" }]); }}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${modo === "abonar" ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      Abonar parcial
                    </button>
                    <button onClick={() => { setModo("entregar"); setPagosForm([{ medio: "EFECTIVO", monto: String(seleccionada.saldoPendiente) }]); }}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${modo === "entregar" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                      Entregar y facturar
                    </button>
                  </div>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    {modo === "abonar" ? "Monto del abono" : "Cobrar saldo pendiente"}
                  </p>
                  {pagosForm.map((p, i) => (
                    <div key={i} className="flex gap-2 mb-1.5">
                      <select value={p.medio} onChange={e => setPagosForm(prev => prev.map((x,j) => j===i ? {...x,medio:e.target.value} : x))}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none">
                        {mediosPago.map(m => <option key={m}>{m}</option>)}
                      </select>
                      <input type="number" value={p.monto}
                        onChange={e => setPagosForm(prev => prev.map((x,j) => j===i ? {...x,monto:e.target.value} : x))}
                        className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber-400" />
                      {pagosForm.length > 1 && (
                        <button onClick={() => setPagosForm(p => p.filter((_,j) => j!==i))} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setPagosForm(p => [...p, { medio:"EFECTIVO", monto:"" }])}
                    className="text-[9px] text-amber-500 font-black uppercase">+ Otro medio</button>
                </div>
              )}

              {/* Si saldo = 0 y PENDIENTE: solo entregar */}
              {seleccionada.estado === "PENDIENTE" && seleccionada.saldoPendiente === 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 text-xs text-emerald-700 font-black text-center">
                  ✓ Anticipo completo — listo para entregar
                </div>
              )}
            </div>

            {/* Botones de acción */}
            {seleccionada.estado === "PENDIENTE" && (
              <div className="px-6 py-4 border-t border-gray-100 space-y-2">
                {seleccionada.saldoPendiente > 0 && modo === "abonar" ? (
                  <button onClick={abonar} disabled={procesando}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors">
                    {procesando ? "Registrando..." : `✓ REGISTRAR ABONO ${totalPagado > 0 ? f(totalPagado) : ""}`}
                  </button>
                ) : (
                  <button onClick={entregar} disabled={procesando}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors shadow-lg">
                    {procesando ? "Procesando..." : "✓ ENTREGAR Y FACTURAR"}
                  </button>
                )}
                <button onClick={() => anular(seleccionada)}
                  className="w-full bg-gray-100 hover:bg-red-50 text-gray-400 hover:text-red-500 py-2.5 rounded-xl font-black text-xs uppercase transition-colors">
                  Anular pre-factura
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
