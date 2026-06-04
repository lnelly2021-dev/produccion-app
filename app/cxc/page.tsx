"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, FileText, Scissors } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig } from "../../lib/empresaStorage";

interface RegistroCxC {
  id: number;
  tercero: string;
  tipoTercero: string;
  nroFactura: string;
  concepto: string;
  fecha: string;
  valor: number;
  tipoMov: "DEUDA" | "ABONO";
}

export default function CarteraPage() {
  const { branch } = useAuth();
  const branchId   = branch?.id || "";

  const [registros, setRegistros]               = useState<RegistroCxC[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string | null>(null);

  // Historial completo del drawer
  const [verHistorial, setVerHistorial] = useState(false);

  // Cruce Nómina
  const [showCruceModal, setShowCruceModal] = useState(false);
  const [montoCruce,     setMontoCruce]     = useState("");
  const [conceptoCruce,  setConceptoCruce]  = useState("");
  const [registrando,    setRegistrando]    = useState(false);

  // Pago directo (efectivo/banco)
  const [showPagoModal,  setShowPagoModal]  = useState(false);
  const [montoPago,      setMontoPago]      = useState("");
  const [medioPagoDir,   setMedioPagoDir]   = useState("EFECTIVO");
  const [conceptoPago,   setConceptoPago]   = useState("");
  const [registrandoPago, setRegistrandoPago] = useState(false);
  const [listaBancosLocal, setListaBancosLocal] = useState<string[]>([]);

  // Refs para navegación con Enter
  const pagoMontoRef   = useRef<HTMLInputElement>(null);
  const pagoConceptoRef = useRef<HTMLInputElement>(null);
  const pagoSubmitRef  = useRef<HTMLButtonElement>(null);
  const cruceMontoRef  = useRef<HTMLInputElement>(null);
  const cruceConceptoRef = useRef<HTMLInputElement>(null);
  const cruceSubmitRef = useRef<HTMLButtonElement>(null);

  const hoy = new Date().toLocaleDateString("en-CA");
  const primeroDeMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toLocaleDateString("en-CA");
  const [filtroDesde, setFiltroDesde] = useState(primeroDeMes);
  const [filtroHasta, setFiltroHasta] = useState(hoy);
  const desdeRef = useRef<HTMLInputElement>(null);
  const hastaRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
      try {
        const cl = JSON.parse(localStorage.getItem(branchId ? `clientes_${branchId}` : "clientes")  || "[]");
        const em = JSON.parse(localStorage.getItem(branchId ? `empleados_${branchId}` : "empleados") || "[]");

        // ABONOs desde localStorage (fallback cuando no hay branchId)
        const localCxc: any[] = JSON.parse(localStorage.getItem("cxc") || "[]")
          .filter((r: any) => (r.tipoMov === "ABONO" || (!r.tipoMov && Number(r.credito) > 0)));

        // DEUDAs desde MongoDB (ventas a crédito + préstamos a empleados)
        let deudas: any[] = [];
        let abonosAPI: any[] = [];

        if (branchId) {
          try {
            const { data } = await api.get(`/branches/${branchId}/ventas`);
            deudas = (data.data || [])
              .filter((v: any) => v.tipoPago === "CRÉDITO")
              .flatMap((v: any) => {
                const base = {
                  id:         v._id,
                  tercero:    (v.cliente || "SIN NOMBRE").toUpperCase().trim(),
                  nroFactura: v.nroFactura,
                  concepto:   v.concepto || `VENTA ${v.nroFactura}`,
                  fecha:      v.createdAt || v.fecha,
                  valor:      Number(v.valor) || 0,
                  tipoMov:    "DEUDA" as const,
                };
                if (v.estado === "ANULADA") {
                  return [
                    base,
                    {
                      ...base,
                      id:         `${v._id}-anulacion`,
                      concepto:   `ANULACIÓN ${v.nroFactura}`,
                      fecha:      v.fechaAnulacion || v.updatedAt || v.createdAt || v.fecha,
                      tipoMov:    "ABONO" as const,
                    },
                  ];
                }
                return [base];
              });
          } catch { /* usar solo localStorage si falla */ }

          try {
            const { data: egData } = await api.get(`/branches/${branchId}/egresos`);
            const prestamos = (egData.data || [])
              .filter((e: any) => e.tipo === "PRESTAMO")
              .map((e: any) => ({
                id:         e._id,
                tercero:    (e.proveedor || "EMPLEADO").toUpperCase().trim(),
                nroFactura: e.nroDoc || "S/N",
                concepto:   `PRÉSTAMO: ${(e.concepto || e.detalle || "SIN DETALLE").toUpperCase()}`,
                fecha:      e.createdAt || e.fecha,
                valor:      Number(e.valor) || 0,
                tipoMov:    "DEUDA" as const,
              }));
            deudas = [...deudas, ...prestamos];
          } catch { /* ignorar si falla */ }

          // ABONOs desde el API de recaudos (fuente de verdad)
          try {
            const { data: recData } = await api.get(`/branches/${branchId}/recaudos`);
            abonosAPI = (recData.data || [])
              .filter((r: any) => !!r.facturaRef || r.medioPago === "DESCUENTO_NOMINA")
              .map((r: any) => ({
                id:         r._id || r.id,
                tercero:    (r.tercero || "SIN NOMBRE").toUpperCase().trim(),
                nroFactura: r.nroRecibo || r.facturaRef || "—",
                concepto:   r.concepto || `RECAUDO ${r.nroRecibo || ""}`,
                fecha:      r.fechaISO || r.createdAt || r.fecha,
                valor:      Number(r.valor) || 0,
                tipoMov:    "ABONO" as const,
              }));
          } catch { /* ignorar si falla, usar localCxc */ }
        }

        // Si no hay DEUDAs del API, usar las del localStorage como fallback
        if (deudas.length === 0) {
          const localDeudas = JSON.parse(localStorage.getItem("cxc") || "[]")
            .filter((r: any) => r.tipoMov === "DEUDA" || (!r.tipoMov && !(Number(r.credito) > 0)));
          deudas = localDeudas;
        }

        // Usar ABONOs del API si están disponibles; si no, usar localStorage
        const abonos = abonosAPI.length > 0 ? abonosAPI : localCxc;

        const datosCxC = [...deudas, ...abonos];
        const identificados = datosCxC.map((reg: any) => {
          const nombreNorm = (reg.tercero || reg.cliente || "SIN NOMBRE").toUpperCase().trim();
          let tipo = "CLIENTE";
          if (em.some((e: any) => e.nombre?.toUpperCase().trim() === nombreNorm)) tipo = "EMPLEADO";
          else if (cl.some((c: any) => (c.nombre || c.cliente)?.toUpperCase().trim() === nombreNorm)) tipo = "CLIENTE";

          // Normalizar tipoMov: si no existe, inferir por campos debito/credito (registros legacy)
          let tipoMov: "DEUDA" | "ABONO" = reg.tipoMov || "DEUDA";
          if (!reg.tipoMov) {
            const cred = Number(reg.credito) || 0;
            const deb  = Number(reg.debito)  || 0;
            if (cred > 0 && deb === 0) tipoMov = "ABONO";
          }

          return {
            id: reg.id || Math.random(),
            tercero: nombreNorm,
            tipoTercero: tipo,
            nroFactura: reg.nroFactura || "S/N",
            concepto: reg.concepto || (tipoMov === "DEUDA" ? "VENTA" : "ABONO"),
            fecha: reg.fecha || new Date().toISOString(),
            valor: Number(reg.valor) || 0,
            tipoMov,
          };
        });
        setRegistros(identificados);
      } catch (e) {
        console.error("Error al cargar datos");
      }
  }, [branchId]);

  useEffect(() => {
    cargar();
    window.addEventListener("focus", cargar);
    const bk = localStorage.getItem(`lista_bancos_${branchId}`) || localStorage.getItem("lista_bancos");
    if (bk) try { setListaBancosLocal(JSON.parse(bk)); } catch {}
    return () => window.removeEventListener("focus", cargar);
  }, [cargar, branchId]);

  const ini = new Date(filtroDesde + "T00:00:00").getTime();
  const fin = new Date(filtroHasta + "T23:59:59").getTime();

  const registrosFiltrados = registros.filter(r => {
    const t = new Date(r.fecha).getTime();
    return t >= ini && t <= fin;
  });

  const saldos = registrosFiltrados.reduce((acc: any, curr) => {
    acc[curr.tercero] = (acc[curr.tercero] || 0) + (curr.tipoMov === "DEUDA" ? curr.valor : -curr.valor);
    return acc;
  }, {});

  const terceros = Object.keys(saldos).filter(t => saldos[t] !== 0).sort();

  const getMovs = (nombre: string) => {
    const fuente = verHistorial ? registros : registrosFiltrados;
    let acum = 0;
    return fuente
      .filter(r => r.tercero === nombre)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
      .map(m => {
        acum += m.tipoMov === "DEUDA" ? m.valor : -m.valor;
        return { ...m, saldoAcum: acum };
      });
  };

  // ── Cruce Nómina ─────────────────────────────────────────────────────────
  const tipoSeleccionado = registros.find(r => r.tercero === clienteSeleccionado)?.tipoTercero;
  const esEmpleado       = tipoSeleccionado === "EMPLEADO";
  const saldoEmpleado    = clienteSeleccionado ? (saldos[clienteSeleccionado] ?? 0) : 0;

  const abrirCruceModal = () => {
    setMontoCruce(String(saldoEmpleado));
    setConceptoCruce("DESCUENTO POR NÓMINA");
    setShowCruceModal(true);
  };

  const registrarCruceNomina = async () => {
    const monto = Math.round(parseFloat(montoCruce) || 0);
    if (monto <= 0)           { toast("warning", "Ingresa un monto válido"); return; }
    if (monto > saldoEmpleado){ toast("warning", `El monto supera el saldo $${saldoEmpleado.toLocaleString()}`); return; }
    setRegistrando(true);
    try {
      const ahora = new Date();
      const { data } = await api.post(`/branches/${branchId}/recaudos`, {
        tercero:    clienteSeleccionado,
        valor:      monto,
        medioPago:  "DESCUENTO_NOMINA",
        concepto:   conceptoCruce || "DESCUENTO POR NÓMINA",
        facturaRef: "",
        nroRecibo:  "",           // el backend asigna CN-XXX automáticamente
        fecha:      ahora.toLocaleDateString("en-CA"),
        fechaISO:   ahora.toISOString(),
      });
      const nroAsignado = data.data?.nroRecibo || "CN";
      const saldoRestante = saldoEmpleado - monto;
      imprimirCruceRecibo(monto, saldoRestante, nroAsignado);
      toast("success", "Cruce de nómina registrado");
      setShowCruceModal(false);
      setMontoCruce("");
      setConceptoCruce("");
      await cargar();
    } catch {
      toast("error", "Error al registrar el cruce");
    } finally { setRegistrando(false); }
  };

  const imprimirCruceRecibo = (monto: number, saldoRestante: number, nroRecibo: string) => {
    const emp = getEmpresaConfig();
    const f   = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
    const html = `<html><head><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:8px;margin:0;font-size:11px}
      .c{text-align:center}.b{font-weight:bold}.hr{border-top:1px dashed #000;margin:6px 0}
      .row{display:flex;justify-content:space-between}
    </style></head><body>
    <div class="c b">${emp.nombreEmpresa || ""}</div>
    <div class="c" style="font-size:9px">NIT: ${emp.nit || ""} | Tel: ${emp.telefono || ""}</div>
    <div class="hr"></div>
    <div class="c b" style="font-size:13px">DESCUENTO DE NÓMINA</div>
    <div class="c" style="font-size:9px">${nroRecibo}</div>
    <div class="hr"></div>
    <div class="row"><span>Empleado:</span><span class="b">${clienteSeleccionado}</span></div>
    <div class="row"><span>Concepto:</span><span>${conceptoCruce || "DESCUENTO POR NÓMINA"}</span></div>
    <div class="row"><span>Fecha:</span><span>${new Date().toLocaleDateString("es-CO")}</span></div>
    <div class="hr"></div>
    <div class="row"><span class="b">Descuento nómina:</span><span class="b">${f(monto)}</span></div>
    <div class="row"><span>Saldo anterior:</span><span>${f(saldoEmpleado)}</span></div>
    <div class="row b" style="font-size:13px;margin-top:4px"><span>Saldo pendiente:</span><span>${f(saldoRestante)}</span></div>
    <div class="hr"></div>
    <div class="c" style="font-size:9px">Comprobante de descuento por nómina</div>
    <div class="c" style="font-size:9px">No es comprobante de pago en efectivo</div>
    </body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
    setTimeout(() => { w?.print(); }, 400);
  };

  // ── Pago directo (efectivo / banco) ──────────────────────────────────────
  const mediosPagoDisp = ["EFECTIVO", ...Array.from(new Set(listaBancosLocal)), "NEQUI", "DAVIPLATA", "TRANSFERENCIA"];

  const abrirPagoModal = () => {
    setMontoPago(String(saldoEmpleado));
    setMedioPagoDir("EFECTIVO");
    setConceptoPago(`ABONO ${clienteSeleccionado}`);
    setShowPagoModal(true);
  };

  const registrarPagoDirecto = async () => {
    const monto = Math.round(parseFloat(montoPago) || 0);
    if (monto <= 0)            { toast("warning", "Ingresa un monto válido"); return; }
    if (monto > saldoEmpleado) { toast("warning", `El monto supera el saldo $${saldoEmpleado.toLocaleString()}`); return; }
    setRegistrandoPago(true);
    try {
      const ahora = new Date();
      const { data } = await api.post(`/branches/${branchId}/recaudos`, {
        tercero:    clienteSeleccionado,
        valor:      monto,
        medioPago:  medioPagoDir,
        concepto:   conceptoPago || `ABONO ${clienteSeleccionado}`,
        facturaRef: "ABONO",   // no-vacío para que CXC lo detecte como abono
        nroRecibo:  "",
        fecha:      ahora.toLocaleDateString("en-CA"),
        fechaISO:   ahora.toISOString(),
      });
      const nroAsignado = data.data?.nroRecibo || "R";
      const saldoRestante = saldoEmpleado - monto;
      imprimirReciboDirecto(monto, saldoRestante, nroAsignado);
      toast("success", `Pago de ${f(monto)} registrado en ${medioPagoDir}`);
      setShowPagoModal(false);
      setMontoPago(""); setConceptoPago("");
      await cargar();
    } catch {
      toast("error", "Error al registrar el pago");
    } finally { setRegistrandoPago(false); }
  };

  const f = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

  const imprimirReciboDirecto = (monto: number, saldoRestante: number, nroRecibo: string) => {
    const emp = getEmpresaConfig();
    const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
    const html = `<html><head><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:8px;margin:0;font-size:11px}
      .c{text-align:center}.b{font-weight:bold}.hr{border-top:1px dashed #000;margin:6px 0}
      .row{display:flex;justify-content:space-between}
    </style></head><body>
    <div class="c b">${emp.nombreEmpresa || ""}</div>
    <div class="c" style="font-size:9px">NIT: ${emp.nit || ""} | Tel: ${emp.telefono || ""}</div>
    <div class="hr"></div>
    <div class="c b" style="font-size:13px">RECIBO DE ABONO</div>
    <div class="c" style="font-size:9px">${nroRecibo}</div>
    <div class="hr"></div>
    <div class="row"><span>Tercero:</span><span class="b">${clienteSeleccionado}</span></div>
    <div class="row"><span>Concepto:</span><span>${conceptoPago || "ABONO"}</span></div>
    <div class="row"><span>Medio de pago:</span><span>${medioPagoDir}</span></div>
    <div class="row"><span>Fecha:</span><span>${new Date().toLocaleDateString("es-CO")}</span></div>
    <div class="hr"></div>
    <div class="row b" style="font-size:13px"><span>Valor abono:</span><span>${fmt(monto)}</span></div>
    <div class="row"><span>Saldo anterior:</span><span>${fmt(saldoEmpleado)}</span></div>
    <div class="row b"><span>Saldo pendiente:</span><span>${fmt(saldoRestante)}</span></div>
    <div class="hr"></div>
    <div class="c" style="font-size:9px">Comprobante de pago</div>
    </body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
    setTimeout(() => { w?.print(); }, 400);
  };

  const manejarImpresion = (tipo: 'individual' | 'general') => {
    const ventana = window.open('', '_blank');
    if (!ventana) return;

    const tituloPrincipal = tipo === 'individual' ? 'INFORME INDIVIDUAL DE CUENTAS X COBRAR' : 'CARTERA CONSOLIDADA';
    const subTitulo = tipo === 'individual' ? `Nombre del tercero: ${clienteSeleccionado}` : 'Listado Maestro de Cuentas por Cobrar';
    
    let contenidoHtml = "";
    const listaTerceros = tipo === 'individual' ? [clienteSeleccionado!] : terceros;

    listaTerceros.forEach(t => {
      const movs = getMovs(t);
      contenidoHtml += `
        <div class="seccion-tercero">
          <div class="info-header">
            <h3>TERCERO: ${t}</h3>
            <p>SALDO TOTAL: $ ${saldos[t].toLocaleString()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>FECHA</th>
                <th>FACTURA / CONCEPTO</th>
                <th style="text-align:right">DEBITO</th>
                <th style="text-align:right">CREDITO</th>
                <th style="text-align:right">SALDO</th>
              </tr>
            </thead>
            <tbody>
              ${movs.map(m => `
                <tr>
                  <td>${new Date(m.fecha).toLocaleDateString()}</td>
                  <td>${m.nroFactura} - ${m.concepto}</td>
                  <td style="text-align:right">${m.tipoMov === 'DEUDA' ? m.valor.toLocaleString() : '-'}</td>
                  <td style="text-align:right">${m.tipoMov === 'ABONO' ? m.valor.toLocaleString() : '-'}</td>
                  <td style="text-align:right"><b>$ ${m.saldoAcum.toLocaleString()}</b></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    });

    ventana.document.write(`
      <html>
        <head>
          <title>${tituloPrincipal}</title>
          <style>
            @page { size: letter; margin: 1.5cm; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 10px; line-height: 1.4; }
            .header-print { border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
            h1 { color: #64748b; font-size: 18px; margin: 0; text-transform: uppercase; }
            h2 { color: #1e293b; font-size: 14px; margin: 5px 0; text-transform: uppercase; }
            .info-header { background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
            .info-header h3 { margin: 0; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th { background: #f1f5f9; color: #475569; padding: 8px; text-align: left; border: 1px solid #e2e8f0; font-size: 9px; }
            td { padding: 7px; border: 1px solid #e2e8f0; vertical-align: top; }
            .seccion-tercero { margin-bottom: 30px; page-break-inside: avoid; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header-print">
            <h1>${tituloPrincipal}</h1>
            <h2>${subTitulo}</h2>
            <p>Fecha de emisión: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
          </div>
          ${contenidoHtml}
        </body>
      </html>
    `);
    ventana.document.close();
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] p-10 text-slate-700">
      <div className="max-w-6xl mx-auto">
        {/* HEADER CONSOLIDADO */}
        <header className="mb-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h1 className="text-3xl text-slate-600 uppercase font-black tracking-tighter">Cartera Consolidada</h1>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Listado Maestro de Cuentas por Cobrar</p>
            </div>
            <button
              onClick={() => manejarImpresion('general')}
              className="bg-slate-200 text-slate-700 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all border border-slate-300"
            >
              Imprimir Reporte General
            </button>
          </div>
          {/* Filtro de período */}
          <div className="flex gap-3 items-center flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Período:</span>
            <div
              onClick={() => desdeRef.current?.showPicker()}
              className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 cursor-pointer hover:bg-blue-100 transition-all relative"
            >
              <span className="text-[10px] font-black text-blue-700 uppercase">
                Desde: {new Date(filtroDesde + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
              <input ref={desdeRef} type="date" value={filtroDesde}
                onChange={e => setFiltroDesde(e.target.value)}
                className="absolute inset-0 opacity-0 pointer-events-none" />
            </div>
            <div
              onClick={() => hastaRef.current?.showPicker()}
              className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 cursor-pointer hover:bg-blue-100 transition-all relative"
            >
              <span className="text-[10px] font-black text-blue-700 uppercase">
                Hasta: {new Date(filtroHasta + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
              <input ref={hastaRef} type="date" value={filtroHasta}
                onChange={e => setFiltroHasta(e.target.value)}
                className="absolute inset-0 opacity-0 pointer-events-none" />
            </div>
            <button
              onClick={() => { setFiltroDesde(primeroDeMes); setFiltroHasta(hoy); }}
              className="text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 transition-colors px-3 py-2"
            >
              Este mes
            </button>
          </div>
        </header>

        {/* TABLA PRINCIPAL */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b-2 border-slate-200">
              <tr className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <th className="px-8 py-5">Tercero / Razón Social</th>
                <th className="px-8 py-5">Relación</th>
                <th className="px-8 py-5 text-right">Saldo Pendiente</th>
                <th className="px-8 py-5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {terceros.map(t => (
                <tr key={t} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-6 text-slate-600 font-medium text-sm">{t}</td>
                  <td className="px-8 py-6">
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase border border-slate-200">
                      {registros.find(r => r.tercero === t)?.tipoTercero}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right text-slate-900 font-bold text-sm">
                    $ {saldos[t].toLocaleString()}
                  </td>
                  <td className="px-8 py-6 text-center">
                    <button
                      onClick={() => setClienteSeleccionado(t)}
                      className="text-blue-600 text-[10px] font-black uppercase hover:underline cursor-pointer"
                    >
                      Ver Detalles
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DRAWER LATERAL DERECHO */}
      {clienteSeleccionado && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/10" onClick={() => { setClienteSeleccionado(null); setVerHistorial(false); }} />
          <div className="relative w-full md:w-[540px] bg-white h-full flex flex-col shadow-xl">

            {/* Header */}
            <div className="px-8 pt-8 pb-6 shrink-0">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Cuentas por Cobrar</p>
                  <h2 className="text-xl font-bold text-gray-900 uppercase tracking-tight leading-none truncate">
                    {clienteSeleccionado}
                  </h2>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {new Date(filtroDesde + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"short" })}
                    {" – "}
                    {new Date(filtroHasta + "T12:00:00").toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-1">
                  <button
                    onClick={() => setVerHistorial(v => !v)}
                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all border ${
                      verHistorial
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                    }`}
                  >
                    {verHistorial ? "★ Historial" : "Historial"}
                  </button>
                  <button
                    onClick={() => manejarImpresion('individual')}
                    className="flex items-center gap-1.5 border border-gray-200 hover:border-gray-300 text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg text-[10px] font-medium transition-all"
                  >
                    <FileText size={12} /> PDF
                  </button>
                  <button
                    onClick={() => { setClienteSeleccionado(null); setVerHistorial(false); }}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors ml-1"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Cabecera de columnas */}
            <div className="mx-8 grid grid-cols-[1fr_120px_100px] border-y border-gray-200 bg-gray-100 py-3 px-4 rounded-lg shrink-0">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                Documento
                {verHistorial && <span className="ml-2 text-blue-500 font-black">· Todo el historial</span>}
              </p>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider text-right">Valor</p>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider text-right">Saldo</p>
            </div>

            {/* Movimientos */}
            <div className="flex-1 overflow-y-auto custom-scroll px-8 mt-1">
              {getMovs(clienteSeleccionado).map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_100px] items-center py-4 px-4 border-b border-gray-50 hover:bg-gray-50/70 transition-colors rounded-lg">
                  {/* Fecha + documento */}
                  <div className="min-w-0 pr-4">
                    <p className="text-[10px] text-gray-500 mb-0.5">
                      {new Date(m.fecha).toLocaleDateString("es-CO")}
                    </p>
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{m.nroFactura}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{m.concepto}</p>
                  </div>

                  {/* Valor */}
                  <div className="text-right">
                    <p className={`text-sm font-medium ${m.tipoMov === 'DEUDA' ? 'text-gray-700' : 'text-teal-700'}`}>
                      {m.tipoMov === 'ABONO' ? '−' : ''}${m.valor.toLocaleString("es-CO")}
                    </p>
                  </div>

                  {/* Saldo acumulado */}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">${m.saldoAcum.toLocaleString("es-CO")}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-gray-200 shrink-0">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Saldo pendiente</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {getMovs(clienteSeleccionado).length} movimiento{getMovs(clienteSeleccionado).length !== 1 ? "s" : ""}
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  ${saldos[clienteSeleccionado].toLocaleString("es-CO")}
                </p>
              </div>
              {saldoEmpleado > 0 && (
                <div className={`grid gap-2 ${esEmpleado ? "grid-cols-2" : "grid-cols-1"}`}>
                  <button onClick={abrirPagoModal}
                    className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors">
                    💵 Pago Directo
                  </button>
                  {esEmpleado && (
                    <button onClick={abrirCruceModal}
                      className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors">
                      <Scissors size={13} /> Cruce Nómina
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PAGO DIRECTO */}
      {showPagoModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowPagoModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter mb-1">Pago Directo</h3>
            <p className="text-[11px] text-emerald-600 font-bold uppercase tracking-widest mb-6">
              {clienteSeleccionado}
            </p>

            <div className="bg-gray-50 rounded-2xl px-5 py-3 mb-5 flex justify-between items-center">
              <span className="text-[11px] font-bold text-gray-500 uppercase">Saldo pendiente</span>
              <span className="text-lg font-black text-gray-800">${saldoEmpleado.toLocaleString("es-CO")}</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Medio de pago *</label>
                <select value={medioPagoDir} onChange={e => setMedioPagoDir(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); pagoMontoRef.current?.focus(); }}}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400">
                  {mediosPagoDisp.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Monto *</label>
                <input ref={pagoMontoRef} type="number" value={montoPago}
                  onChange={e => setMontoPago(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); pagoConceptoRef.current?.focus(); }}}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Concepto</label>
                <input ref={pagoConceptoRef} type="text" value={conceptoPago}
                  onChange={e => setConceptoPago(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); pagoSubmitRef.current?.click(); }}}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400" />
              </div>
            </div>

            {parseFloat(montoPago) > 0 && (
              <div className="mt-4 bg-emerald-50 rounded-xl px-4 py-2.5 flex justify-between text-sm">
                <span className="text-emerald-600 font-bold">Saldo restante:</span>
                <span className="font-black text-emerald-700">
                  ${Math.max(0, saldoEmpleado - (parseFloat(montoPago)||0)).toLocaleString("es-CO")}
                </span>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPagoModal(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-xl font-black text-[11px] uppercase transition-colors">
                Cancelar
              </button>
              <button ref={pagoSubmitRef} onClick={registrarPagoDirecto} disabled={registrandoPago}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3 rounded-xl font-black text-[11px] uppercase transition-colors">
                {registrandoPago ? "Registrando..." : "✓ Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CRUCE NÓMINA */}
      {showCruceModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowCruceModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter mb-1">Cruce de Nómina</h3>
            <p className="text-[11px] text-violet-600 font-bold uppercase tracking-widest mb-6">
              {clienteSeleccionado}
            </p>

            {/* Saldo actual */}
            <div className="bg-gray-50 rounded-2xl px-5 py-3 mb-5 flex justify-between items-center">
              <span className="text-[11px] font-bold text-gray-500 uppercase">Saldo a descontar</span>
              <span className="text-lg font-black text-gray-800">${saldoEmpleado.toLocaleString("es-CO")}</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Monto a descontar *</label>
                <input ref={cruceMontoRef} type="number" value={montoCruce}
                  onChange={e => setMontoCruce(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); cruceConceptoRef.current?.focus(); }}}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-violet-400" />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Concepto</label>
                <input ref={cruceConceptoRef} type="text" value={conceptoCruce}
                  onChange={e => setConceptoCruce(e.target.value)}
                  placeholder="Ej: Descuento nómina mayo 2026"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); cruceSubmitRef.current?.click(); }}}
                  className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-400" />
              </div>
            </div>

            {/* Preview saldo restante */}
            {parseFloat(montoCruce) > 0 && (
              <div className="mt-4 bg-violet-50 rounded-xl px-4 py-2.5 flex justify-between text-sm">
                <span className="text-violet-600 font-bold">Saldo restante:</span>
                <span className="font-black text-violet-700">
                  ${Math.max(0, saldoEmpleado - (parseFloat(montoCruce)||0)).toLocaleString("es-CO")}
                </span>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCruceModal(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-xl font-black text-[11px] uppercase transition-colors">
                Cancelar
              </button>
              <button ref={cruceSubmitRef} onClick={registrarCruceNomina} disabled={registrando}
                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-3 rounded-xl font-black text-[11px] uppercase transition-colors">
                {registrando ? "Registrando..." : "✓ Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

