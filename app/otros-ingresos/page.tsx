"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Printer, CalendarDays } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig } from "../../lib/empresaStorage";

export default function OtrosIngresosPage() {
  const router   = useRouter();
  const { branch } = useAuth();
  const branchId = branch?.id || "";

  const [recaudosHistorial, setRecaudosHistorial] = useState<any[]>([]);
  const [mostrarDrawer, setMostrarDrawer]         = useState(false);
  const [reciboViendo,  setReciboViendo]          = useState<any>(null);

  // ── Filtros de la tabla ─────────────────────────────────────────────────
  const [periodoTabla, setPeriodoTabla] = useState("Diario");
  const [fechaTabla, setFechaTabla]     = useState(new Date().toLocaleDateString("en-CA"));
  const dateInputRef    = useRef<HTMLInputElement>(null);
  const medioRef        = useRef<HTMLSelectElement>(null);
  const terceroRef      = useRef<HTMLInputElement>(null);
  const conceptoRef     = useRef<HTMLInputElement>(null);
  const montoRef        = useRef<HTMLInputElement>(null);
  const submitRef       = useRef<HTMLButtonElement>(null);

  // ── Estado del drawer ───────────────────────────────────────────────────
  const [bancos, setBancos]   = useState<string[]>(["NEQUI", "BANCOLOMBIA", "DAVIPLATA"]);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState({
    monto: "",
    medioPago: "EFECTIVO",
    conceptoLibre: "",
    fecha: new Date().toLocaleDateString("en-CA"),   // ← fecha local, sin bug UTC
  });

  // ── Carga inicial ───────────────────────────────────────────────────────
  useEffect(() => {
    const b = JSON.parse(localStorage.getItem("lista_bancos") || "null");
    if (b) setBancos(b);

    if (branchId) {
      api.get(`/branches/${branchId}/recaudos`)
        .then(({ data }) => {
          const lista = (data.data || []).map((r: any) => ({ ...r, id: r._id || r.id }));
          if (lista.length > 0) {
            setRecaudosHistorial(lista);
            localStorage.setItem("otros_recaudos", JSON.stringify(lista));
          } else {
            setRecaudosHistorial(JSON.parse(localStorage.getItem("otros_recaudos") || "[]"));
          }
        })
        .catch(() => setRecaudosHistorial(JSON.parse(localStorage.getItem("otros_recaudos") || "[]")));
    } else {
      setRecaudosHistorial(JSON.parse(localStorage.getItem("otros_recaudos") || "[]"));
    }
  }, [branchId]);

  // ── Rango de fechas para la tabla ───────────────────────────────────────
  const getTablaRange = () => {
    const d      = new Date(fechaTabla + "T12:00:00");
    const inicio = new Date(d); inicio.setHours(0, 0, 0, 0);
    const fin    = new Date(d); fin.setHours(23, 59, 59, 999);
    if (periodoTabla === "Semanal") {
      const day = d.getDay();
      inicio.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      fin.setTime(inicio.getTime());
      fin.setDate(inicio.getDate() + 6);
    } else if (periodoTabla === "Quincenal") {
      if (d.getDate() <= 15) { inicio.setDate(1);  fin.setDate(15); }
      else                   { inicio.setDate(16); fin.setMonth(d.getMonth() + 1, 0); }
    } else if (periodoTabla === "Mensual") {
      inicio.setDate(1); fin.setMonth(d.getMonth() + 1, 0);
    } else if (periodoTabla === "Anual") {
      inicio.setMonth(0, 1); fin.setMonth(11, 31);
    }
    fin.setHours(23, 59, 59, 999);
    return { inicio, fin };
  };

  const { inicio: tablaInicio, fin: tablaFin } = getTablaRange();
  const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  const tablaLabel =
    periodoTabla === "Diario" ? fechaTabla : `${fmt(tablaInicio)} – ${fmt(tablaFin)}`;

  const historialFiltrado = recaudosHistorial.filter(r => {
    if (!r.fecha) return false;
    const d = new Date(r.fecha + "T12:00:00");
    return d >= tablaInicio && d <= tablaFin;
  });

  // ── Guardar recibo ──────────────────────────────────────────────────────
  const guardarRecibo = async (imprimir: boolean) => {
    if (!form.monto || !form.conceptoLibre.trim()) {
      toast("warning", "Por favor completa el concepto y el valor.");
      return;
    }
    const valorNum = parseFloat(form.monto);

    // POST al API → backend asigna RC-XXXX (consecutivo unificado)
    const base = {
      fecha:      form.fecha,
      fechaISO:   new Date().toISOString(),
      nroRecibo:  "",
      tercero:    busqueda.toUpperCase().trim(),
      concepto:   form.conceptoLibre.toUpperCase(),
      valor:      valorNum,
      medioPago:  form.medioPago,
      facturaRef: "",
    };

    let nroRecibo = "";
    if (branchId) {
      try {
        const { data } = await api.post(`/branches/${branchId}/recaudos`, base);
        nroRecibo = data.data?.nroRecibo || "";
      } catch { /* continuar aunque falle el API */ }
    }
    // Fallback local si el API falló
    if (!nroRecibo) nroRecibo = `RC-${(recaudosHistorial.length + 1).toString().padStart(4, "0")}`;

    const nuevoRecaudo = { ...base, id: Date.now(), nroRecibo };

    const historialAct = [nuevoRecaudo, ...recaudosHistorial];
    localStorage.setItem("otros_recaudos", JSON.stringify(historialAct));
    setRecaudosHistorial(historialAct);

    // 3. Invalidar caché del router para que CXC recargue
    router.refresh();

    // 4. Imprimir si se pidió
    if (imprimir) imprimirRecibo(nuevoRecaudo);

    // 5. Reset drawer
    setMostrarDrawer(false);
    setBusqueda("");
    setForm({ ...form, monto: "", conceptoLibre: "" });
  };

  // ── Imprimir / PDF ──────────────────────────────────────────────────────
  const imprimirRecibo = (rec: any) => {
    const emp = getEmpresaConfig();
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    ventana.document.write(`
      <html>
        <head>
          <style>
            * { box-sizing: border-box; }
            body { font-family:'Courier New',monospace; width:80mm; margin:0; padding:8px; font-size:11px; }
            .c  { text-align:center; }
            .b  { font-weight:bold; }
            .hr { border-top:1px dashed #000; margin:7px 0; }
            .row{ display:flex; justify-content:space-between; margin:3px 0; }
          </style>
        </head>
        <body>
          <div class="c b">${emp.nombreEmpresa}</div>
          <div class="c">NIT: ${emp.nit} — Tel: ${emp.telefono}</div>
          <div class="c">${emp.direccion || ""}</div>
          <div class="hr"></div>
          <div class="c b" style="font-size:13px">RECIBO DE CAJA</div>
          <div class="c b">${rec.nroRecibo}</div>
          <div class="hr"></div>
          <div class="row"><span>Fecha:</span><span>${rec.fecha}</span></div>
          <div class="row"><span>Tercero:</span><span>${rec.tercero}</span></div>
          <div class="row"><span>Concepto:</span><span style="max-width:55%;text-align:right">${rec.concepto}</span></div>
          <div class="row"><span>Medio Pago:</span><span>${rec.medioPago}</span></div>
          <div class="hr"></div>
          <div class="row b" style="font-size:13px">
            <span>VALOR RECIBIDO</span>
            <span>$ ${rec.valor.toLocaleString()}</span>
          </div>
          <div class="hr"></div>
          <div class="c" style="font-size:9px;margin-top:8px">¡Gracias!</div>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    ventana.document.close();
  };

  // ── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-gray-50 flex flex-col font-sans text-[#1a2b3c] overflow-hidden text-left">

      {/* CABECERA */}
      <div className="bg-white px-8 pt-6 pb-4 border-b border-gray-200 shadow-sm shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">Otros Ingresos</h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">
              Historial de Recibos de Caja
            </p>
          </div>
          <button
            onClick={() => { setForm(f => ({ ...f, fecha: new Date().toLocaleDateString("en-CA") })); setMostrarDrawer(true); }}
            className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-blue-700 transition-all"
          >
            + Crear Recibo de Caja
          </button>
        </div>

        {/* FILTROS DE PERIODO + CALENDARIO */}
        <div className="flex gap-3 items-center">
          <select
            value={periodoTabla}
            onChange={e => setPeriodoTabla(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase outline-none shadow-sm"
          >
            <option value="Diario">Diario</option>
            <option value="Semanal">Semanal</option>
            <option value="Quincenal">Quincenal</option>
            <option value="Mensual">Mensual</option>
            <option value="Anual">Anual</option>
          </select>

          <div
            onClick={() => dateInputRef.current?.showPicker()}
            className="relative flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 cursor-pointer shadow-sm min-w-[190px]"
          >
            <CalendarDays size={14} className="text-blue-500 shrink-0" />
            <span className="text-[10px] font-black text-blue-600 uppercase">{tablaLabel}</span>
            <input
              ref={dateInputRef}
              type="date"
              value={fechaTabla}
              onChange={e => setFechaTabla(e.target.value)}
              className="absolute inset-0 opacity-0 pointer-events-none"
            />
          </div>
        </div>
      </div>

      {/* TABLA */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-100/80 text-[10px] font-black text-gray-500 uppercase">
                <th className="px-6 py-5">Fecha</th>
                <th className="px-6 py-5">Recibo</th>
                <th className="px-6 py-5">Tercero</th>
                <th className="px-6 py-5">Concepto</th>
                <th className="px-6 py-5">Medio Pago</th>
                <th className="px-6 py-5 text-right">Valor</th>
                <th className="px-6 py-5 text-center">PDF</th>
              </tr>
            </thead>
            <tbody className="text-[11px] font-bold uppercase">
              {historialFiltrado.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-16 text-center text-gray-300 text-xs tracking-widest">
                    Sin registros en este periodo
                  </td>
                </tr>
              ) : (
                historialFiltrado.map(r => (
                  <tr key={r.id}
                    onClick={() => setReciboViendo(r)}
                    className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors cursor-pointer">
                    <td className="px-6 py-4 text-gray-400">{r.fecha}</td>
                    <td className="px-6 py-4 text-blue-600 font-black">{r.nroRecibo}</td>
                    <td className="px-6 py-4">{r.tercero}</td>
                    <td className="px-6 py-4 text-gray-400 italic font-medium normal-case">{r.concepto}</td>
                    <td className="px-6 py-4 text-gray-500">{r.medioPago || "EFECTIVO"}</td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-black">
                      $ {Number(r.valor).toLocaleString("es-CO")}
                    </td>
                    <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => imprimirRecibo(r)}
                        title="Reimprimir recibo"
                        className="text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <Printer size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DRAWER VER RECIBO */}
      {reciboViendo && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setReciboViendo(null)} />
          <div className="relative w-[340px] bg-white h-full flex flex-col shadow-2xl border-l border-gray-100">

            {/* Header */}
            <div className="px-7 pt-7 pb-5 border-b border-gray-100 flex justify-between items-start shrink-0">
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Recibo de Caja</p>
                <h2 className="text-xl font-black text-blue-600 tracking-tighter">{reciboViendo.nroRecibo}</h2>
                <p className="text-[10px] text-gray-400 font-bold mt-0.5">{reciboViendo.fecha}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => imprimirRecibo(reciboViendo)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors" title="Imprimir">
                  <Printer size={15} />
                </button>
                <button onClick={() => setReciboViendo(null)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Contenido */}
            <div className="flex-1 px-7 py-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Tercero</p>
                <p className="font-black text-slate-800 uppercase text-sm">{reciboViendo.tercero}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Concepto</p>
                <p className="font-bold text-slate-700 text-sm">{reciboViendo.concepto}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Medio de Pago</p>
                  <p className="font-black text-slate-700 text-sm uppercase">{reciboViendo.medioPago || "EFECTIVO"}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Fecha</p>
                  <p className="font-black text-slate-700 text-sm">{reciboViendo.fecha}</p>
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-center">
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Valor Recibido</p>
                <p className="text-3xl font-black text-emerald-700 tracking-tighter">
                  ${Number(reciboViendo.valor).toLocaleString("es-CO")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER CREAR RECIBO */}
      {mostrarDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMostrarDrawer(false)}
          />
          <div className="relative w-[480px] bg-white h-screen shadow-2xl flex flex-col text-left">

            {/* Header */}
            <div className="px-8 pt-8 pb-5 border-b flex justify-between items-center shrink-0">
              <div>
                <p className="text-[11px] font-black text-blue-600 uppercase">
                  RC-{(recaudosHistorial.length + 1).toString().padStart(4, "0")}
                </p>
                <h2 className="text-2xl font-black uppercase tracking-tighter">Recibo de Caja</h2>
              </div>
              <button
                onClick={() => setMostrarDrawer(false)}
                className="text-gray-300 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

              {/* Fecha + medio de pago */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase">Fecha</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm({ ...form, fecha: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); medioRef.current?.focus(); }}}
                    className="w-full bg-gray-100 p-3 rounded-xl font-bold text-xs outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase">Caja / Banco</label>
                  <select
                    ref={medioRef}
                    value={form.medioPago}
                    onChange={e => setForm({ ...form, medioPago: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); terceroRef.current?.focus(); }}}
                    className="w-full bg-gray-100 p-3 rounded-xl font-black text-[10px] uppercase outline-none"
                  >
                    <option value="EFECTIVO">EFECTIVO</option>
                    {bancos.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Buscador tercero */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  Nombre del tercero
                </label>
                <input
                  ref={terceroRef}
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); conceptoRef.current?.focus(); }}}
                  className="w-full border-b-2 border-blue-500 py-2 font-black uppercase outline-none text-xl placeholder:text-gray-200"
                  placeholder="NOMBRE DE QUIEN PAGA..."
                />
              </div>

              {/* Concepto libre */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  Concepto Manual
                </label>
                <input
                  ref={conceptoRef}
                  type="text"
                  value={form.conceptoLibre}
                  onChange={e => setForm({ ...form, conceptoLibre: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); montoRef.current?.focus(); }}}
                  className="w-full bg-gray-50 p-4 rounded-xl font-bold uppercase text-[10px] outline-none"
                  placeholder="INGRESO LIBRE / OTRO CONCEPTO..."
                />
              </div>

              {/* Valor */}
              <div className="pt-2 border-t">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  Valor Recibido
                </label>
                <div className="flex items-center text-5xl font-black text-emerald-500 mt-2">
                  <span className="mr-3 opacity-20">$</span>
                  <input
                    ref={montoRef}
                    type="number"
                    value={form.monto}
                    onChange={e => setForm({ ...form, monto: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitRef.current?.click(); }}}
                    className="bg-transparent outline-none w-full"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Footer — un solo botón */}
            <div className="px-8 pb-8 pt-4 border-t shrink-0">
              <button
                ref={submitRef}
                onClick={() => guardarRecibo(false)}
                className="w-full bg-[#1a2b3c] text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-xl"
              >
                ✓ Registrar Ingreso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
