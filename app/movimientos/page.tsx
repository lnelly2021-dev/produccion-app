"use client";
import { useState, useEffect, useRef } from "react";
import { Plus, X, Printer, FileText, MessageCircle, CalendarDays, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toaster";
import { getEmpresaConfig, patchEmpresaConfig } from "../../lib/empresaStorage";

export default function MovimientosPage() {
  const { branch, company } = useAuth();
  const branchId   = branch?.id || "";
  const movKey     = branchId ? `movimientos_${branchId}` : "movimientos";
  const prodKey    = branchId ? `productos_${branchId}` : "productos";
  const provKey    = branchId ? `proveedores_${branchId}` : "proveedores";
  const emplKey    = branchId ? `empleados_${branchId}` : "empleados";

  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [filtroTab, setFiltroTab]       = useState("ingreso");
  const [filtroDetalle, setFiltroDetalle] = useState<"todos"|"subtotal"|"descuento"|"impuesto"|"propina"|"domicilio">("todos");
  const [showDrawerEgreso, setShowDrawerEgreso] = useState(false);
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState<any | null>(null);
  
  const [tipoEgreso, setTipoEgreso] = useState<'GASTO' | 'INVENTARIO' | 'PRESTAMO' | 'CAMBIO'>('GASTO');
  const [medioSale,  setMedioSale]  = useState("EFECTIVO");
  const [medioEntra, setMedioEntra] = useState("NEQUI");
  const [formEgreso, setFormEgreso] = useState({
    fecha: new Date().toLocaleDateString('en-CA'),
    proveedor: '',
    productoId: '',
    cantidad: '',
    valor: '',
    detalle: ''
  });

  const [itemsCompra, setItemsCompra]     = useState<{productoId: string, nombre: string, cantidad: number}[]>([]);
  const [productoTemp, setProductoTemp]   = useState('');
  const [cantidadTemp, setCantidadTemp]   = useState('');

  const [listaBusquedaTerceros, setListaBusquedaTerceros] = useState<any[]>([]);
  const [productosInventario, setProductosInventario] = useState<any[]>([]);
  const [tipoRango, setTipoRango] = useState("DIARIO");
  const [fechaBase, setFechaBase] = useState(new Date().toLocaleDateString('en-CA'));
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Anulación
  const [mostrarConfirmAnular, setMostrarConfirmAnular] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion]           = useState("");

  // Normalizar venta del API al formato de movimiento
  const normalizarVenta = (v: any) => ({
    id:          v._id || v.id,
    nroFactura:  v.nroFactura,
    fecha:       v.createdAt || v.fecha,
    categoria:   "ingreso",
    cliente:     v.cliente || "CONSUMIDOR FINAL",
    concepto:    v.concepto || `Venta ${v.nroFactura}`,
    subtotal:    Number(v.subtotal)  || 0,
    descuento:   Number(v.descuento) || 0,
    impuesto:    Number(v.impuesto)  || 0,
    propina:     Number(v.propina)   || 0,
    envio:       Number(v.envio)     || 0,
    valor:       Number(v.valor) || 0,
    medioPago:   v.medioPago,
    pagos:       v.pagos || [],
    tipoPago:    v.tipoPago,
    tipoVenta:   v.tipoPago,
    productos:   v.productos || [],
    estado:      v.estado || "CUADRADA",
    motivoAnulacion: v.motivoAnulacion,
    _id:         v._id,
  });

  // Refrescar config_empresa desde el API al cambiar de empresa
  useEffect(() => {
    if (!company?.id) return;
    api.get(`/companies/${company.id}`)
      .then(({ data }) => {
        const c = data.data ?? data;
        const cfg = {
          nombreEmpresa: c.name       || "",
          nit:           c.taxId      || "",
          telefono:      c.phone      || "",
          direccion:     c.address    || "",
          resolucion:    c.facturacion?.resolucion || "",
          propinas:      c.propinas,
          tributario:    c.tributario,
        };
        patchEmpresaConfig(cfg);
      })
      .catch(() => {});
  }, [company?.id]);

  useEffect(() => {
    // Terceros desde API con fallback a localStorage
    if (branchId) {
      Promise.all([
        api.get(`/branches/${branchId}/contactos?tipo=PROVEEDOR`),
        api.get(`/branches/${branchId}/contactos?tipo=EMPLEADO`),
      ]).then(([rProv, rEmp]) => {
        const proveedores = (rProv.data.data ?? rProv.data ?? []);
        const empleados   = (rEmp.data.data  ?? rEmp.data  ?? []);
        setListaBusquedaTerceros([
          ...proveedores.map((p: any) => ({ nombre: p.nombre, tipo: 'PROVEEDOR' })),
          ...empleados.map((e: any)   => ({ nombre: e.nombre, tipo: 'EMPLEADO'  })),
        ]);
      }).catch(() => {
        const prov = JSON.parse(localStorage.getItem(provKey) || "[]");
        const empl = JSON.parse(localStorage.getItem(emplKey)   || "[]");
        setListaBusquedaTerceros([
          ...prov.map((p: any) => ({ nombre: p.nombre, tipo: 'PROVEEDOR' })),
          ...empl.map((e: any) => ({ nombre: e.nombre, tipo: 'EMPLEADO'  })),
        ]);
      });
    } else {
      const prov = JSON.parse(localStorage.getItem(provKey) || "[]");
      const empl = JSON.parse(localStorage.getItem(emplKey)   || "[]");
      setListaBusquedaTerceros([
        ...prov.map((p: any) => ({ nombre: p.nombre, tipo: 'PROVEEDOR' })),
        ...empl.map((e: any) => ({ nombre: e.nombre, tipo: 'EMPLEADO'  })),
      ]);
    }
    setProductosInventario(JSON.parse(localStorage.getItem(prodKey) || "[]"));

    if (branchId) {
      // Cargar ventas y egresos desde la API en paralelo
      Promise.all([
        api.get(`/branches/${branchId}/ventas`),
        api.get(`/branches/${branchId}/egresos`),
      ]).then(([resVentas, resEgresos]) => {
        const ventas  = (resVentas.data.data  || []).map(normalizarVenta);
        const egresos = (resEgresos.data.data || []).map((e: any) => ({
          ...e, id: e._id || e.id, categoria: "egreso", nroFactura: e.nroDoc,
          fecha: e.createdAt || e.fechaISO || e.fecha,
        }));
        const todos = [...ventas, ...egresos].sort((a, b) =>
          new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        );
        setMovimientos(todos);
        localStorage.setItem(movKey, JSON.stringify(todos));
      }).catch(() => {
        setMovimientos(JSON.parse(localStorage.getItem(movKey) || "[]"));
      });
    } else {
      setMovimientos(JSON.parse(localStorage.getItem(movKey) || "[]"));
    }
  }, [branchId]);

  const obtenerRangoYEtiqueta = () => {
    const hoy = new Date(fechaBase + "T12:00:00");
    let inicio = new Date(hoy);
    let fin = new Date(hoy);
    let etiqueta = "";
    const opciones: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

    switch (tipoRango) {
      case "DIARIO":
        inicio.setHours(0,0,0,0); fin.setHours(23,59,59,999);
        etiqueta = hoy.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        break;
      case "SEMANAL":
        const Lunes = hoy.getDate() - (hoy.getDay() === 0 ? 6 : hoy.getDay() - 1);
        inicio.setDate(Lunes); fin.setDate(Lunes + 6);
        etiqueta = `${inicio.toLocaleDateString('es-ES', opciones)} - ${fin.toLocaleDateString('es-ES', opciones)}`;
        break;
      case "QUINCENAL":
        if (hoy.getDate() <= 15) { inicio.setDate(1); fin.setDate(15); }
        else { inicio.setDate(16); fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); }
        etiqueta = `${inicio.toLocaleDateString('es-ES', opciones)} - ${fin.toLocaleDateString('es-ES', opciones)}`;
        break;
      case "MENSUAL":
        inicio.setDate(1); fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        etiqueta = hoy.toLocaleDateString('es-ES', { month: 'long' }).toUpperCase();
        break;
      case "ANUAL":
        inicio = new Date(hoy.getFullYear(), 0, 1); fin = new Date(hoy.getFullYear(), 11, 31);
        etiqueta = `AÑO ${hoy.getFullYear()}`;
        break;
    }
    return { inicio: inicio.getTime(), fin: fin.getTime(), etiqueta };
  };

  const { inicio, fin, etiqueta } = obtenerRangoYEtiqueta();
  const movsPeriodo = movimientos.filter(m => {
    const t = new Date(m.fecha).getTime();
    return t >= inicio && t <= fin;
  });

  const ventasActivas = movsPeriodo.filter(m => m.categoria === 'ingreso' && m.estado !== 'ANULADA');
  const totalVentas    = ventasActivas.reduce((acc, m) => acc + m.valor, 0);
  const subtotalVentas = ventasActivas.reduce((acc, m) => acc + (Number(m.subtotal) || (m.valor - (Number(m.propina)||0) - (Number(m.impuesto)||0) - (Number(m.envio)||0))), 0);
  const totalImpuestos  = ventasActivas.reduce((acc, m) => acc + (Number(m.impuesto)  || 0), 0);
  const totalPropinas   = ventasActivas.reduce((acc, m) => acc + (Number(m.propina)   || 0), 0);
  const totalDomicilios = ventasActivas.reduce((acc, m) => acc + (Number(m.envio)     || 0), 0);
  const totalDescuentos = ventasActivas.reduce((acc, m) => acc + (Number(m.descuento) || 0), 0);
  const totalEgresos   = movsPeriodo.filter(m => m.categoria === 'egreso').reduce((acc, m) => acc + m.valor, 0);
  const filtrados      = movsPeriodo.filter(m => {
    if (m.categoria !== filtroTab) return false;
    if (filtroTab === 'ingreso') {
      if (filtroDetalle === 'descuento') return Number(m.descuento) > 0;
      if (filtroDetalle === 'impuesto')  return Number(m.impuesto)  > 0;
      if (filtroDetalle === 'propina')   return Number(m.propina)   > 0;
      if (filtroDetalle === 'domicilio') return Number(m.envio)     > 0;
      // subtotal: todas las ventas activas (mismo que todos, distinto export)
    }
    return true;
  });

  const tituloReporte = () => {
    const base = filtroTab === 'ingreso' ? 'Ventas' : 'Egresos';
    const det = filtroDetalle === 'subtotal'  ? ' — Subtotal Productos'
              : filtroDetalle === 'descuento' ? ' — Descuentos'
              : filtroDetalle === 'impuesto'  ? ' — Impuestos'
              : filtroDetalle === 'propina'   ? ' — Propinas'
              : filtroDetalle === 'domicilio' ? ' — Domicilios'
              : '';
    return `${base}${det}`;
  };

  const exportarExcel = () => {
    const filas = filtrados.map(m => {
      const base: any = {
        Fecha:        new Date(m.fecha).toLocaleDateString('es-CO'),
        Documento:    m.nroFactura,
        Tercero:      (m.cliente || m.proveedor || '').toUpperCase(),
        'Medio Pago': m.medioPago || 'EFECTIVO',
      };
      if (filtroDetalle === 'subtotal')
        return { ...base, 'Subtotal Productos': Number(m.subtotal) || 0, Estado: m.estado || '' };
      if (filtroDetalle === 'propina')
        return { ...base, Propina: Number(m.propina) || 0, Estado: m.estado || '' };
      if (filtroDetalle === 'domicilio')
        return { ...base, Domicilio: Number(m.envio) || 0, Estado: m.estado || '' };
      if (filtroDetalle === 'impuesto')
        return { ...base, Impuesto: Number(m.impuesto) || 0, Estado: m.estado || '' };
      // todos
      if (m.categoria === 'ingreso') {
        base['Subtotal'] = Number(m.subtotal) || 0;
        if (totalDescuentos > 0) base['Descuento'] = Number(m.descuento) || 0;
        if (totalImpuestos  > 0) base['Impuesto']  = Number(m.impuesto) || 0;
        if (totalPropinas   > 0) base['Propina']   = Number(m.propina)  || 0;
        if (totalDomicilios > 0) base['Domicilio'] = Number(m.envio)    || 0;
      }
      base['Total']  = Number(m.valor);
      base['Estado'] = m.estado || '';
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tituloReporte());
    XLSX.writeFile(wb, `${tituloReporte().replace(/\s/g,'-')}_${fechaBase}.xlsx`);
  };

  const exportarPDF = () => {
    const emp   = getEmpresaConfig();
    const titulo = tituloReporte();

    // Build column definitions based on active filter
    const cols: { label: string; align: string; val: (m: any) => string }[] = [
      { label: 'Fecha',     align: '',  val: m => new Date(m.fecha).toLocaleDateString('es-CO') },
      { label: 'Documento', align: '',  val: m => m.nroFactura },
      { label: 'Tercero',   align: '',  val: m => (m.cliente || m.proveedor || '').toUpperCase() },
      { label: 'Medio Pago',align: '',  val: m => m.medioPago || 'EFECTIVO' },
    ];

    let footerLabel = 'TOTAL';
    let footerValue = 0;

    if (filtroDetalle === 'subtotal') {
      cols.push({ label: 'Subtotal Productos', align: 'r', val: m => `$${Number(m.subtotal).toLocaleString('es-CO')}` });
      footerLabel = 'Total Subtotal Ventas';
      footerValue = filtrados.reduce((a, m) => a + Number(m.subtotal), 0);
    } else if (filtroDetalle === 'descuento') {
      cols.push({ label: 'Descuento', align: 'r', val: m => `-$${Number(m.descuento).toLocaleString('es-CO')}` });
      footerLabel = 'Total Descuentos';
      footerValue = filtrados.reduce((a, m) => a + Number(m.descuento), 0);
    } else if (filtroDetalle === 'propina') {
      cols.push({ label: 'Propina', align: 'r', val: m => `$${Number(m.propina).toLocaleString('es-CO')}` });
      footerLabel = 'Total Propinas';
      footerValue = filtrados.reduce((a, m) => a + Number(m.propina), 0);
    } else if (filtroDetalle === 'domicilio') {
      cols.push({ label: 'Domicilio', align: 'r', val: m => `$${Number(m.envio).toLocaleString('es-CO')}` });
      footerLabel = 'Total Domicilios';
      footerValue = filtrados.reduce((a, m) => a + Number(m.envio), 0);
    } else if (filtroDetalle === 'impuesto') {
      cols.push({ label: 'Impuesto', align: 'r', val: m => `$${Number(m.impuesto).toLocaleString('es-CO')}` });
      footerLabel = 'Total Impuestos';
      footerValue = filtrados.reduce((a, m) => a + Number(m.impuesto), 0);
    } else {
      if (filtroTab === 'ingreso') {
        cols.push({ label: 'Subtotal', align: 'r', val: m => m.categoria === 'ingreso' ? `$${Number(m.subtotal).toLocaleString('es-CO')}` : '' });
        if (totalDescuentos > 0) cols.push({ label: 'Descuento', align: 'r', val: m => Number(m.descuento) > 0 ? `-$${Number(m.descuento).toLocaleString('es-CO')}` : '—' });
        if (totalImpuestos  > 0) cols.push({ label: 'Impuesto',  align: 'r', val: m => Number(m.impuesto) > 0 ? `$${Number(m.impuesto).toLocaleString('es-CO')}` : '—' });
        if (totalPropinas   > 0) cols.push({ label: 'Propina',   align: 'r', val: m => Number(m.propina)  > 0 ? `$${Number(m.propina).toLocaleString('es-CO')}`  : '—' });
        if (totalDomicilios > 0) cols.push({ label: 'Domicilio', align: 'r', val: m => Number(m.envio)    > 0 ? `$${Number(m.envio).toLocaleString('es-CO')}`    : '—' });
      }
      cols.push({ label: 'Total', align: 'r', val: m => `$${Number(m.valor).toLocaleString('es-CO')}` });
      footerValue = filtrados.reduce((a, m) => a + Number(m.valor), 0);
    }

    const thCss = (c: {align:string}) => c.align === 'r' ? ' class="r"' : '';
    const tdCss = (c: {align:string}) => c.align === 'r' ? ' class="r"' : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:24px 32px;font-size:12px;color:#222}
h1{font-size:15px;font-weight:900;text-transform:uppercase;margin-bottom:2px}
.sub{font-size:10px;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#1e293b;color:#fff;padding:5px 8px;font-size:9px;text-transform:uppercase;text-align:left}
th.r,td.r{text-align:right}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:11px}
.tot td{font-weight:900;background:#f8fafc;font-size:12px}
@media print{@page{margin:10mm;size:A4}}</style></head><body>
<h1>${emp.nombreEmpresa || 'MI EMPRESA'} — ${titulo}</h1>
<div class="sub">Período: ${etiqueta} &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-CO')}</div>
<table><thead><tr>${cols.map(c => `<th${thCss(c)}>${c.label}</th>`).join('')}</tr></thead>
<tbody>${filtrados.map(m => `<tr>${cols.map(c => `<td${tdCss(c)}>${c.val(m)}</td>`).join('')}</tr>`).join('\n')}</tbody>
<tfoot><tr class="tot"><td colspan="${cols.length - 1}">${footerLabel}</td><td class="r">$${footerValue.toLocaleString('es-CO')}</td></tr></tfoot>
</table>
<script>window.print();window.close();</script></body></html>`;
    const w = window.open('', '_blank'); w?.document.write(html); w?.document.close();
  };

  const agregarItemCompra = () => {
    if (!productoTemp) return;
    const cant = parseFloat(cantidadTemp || "1");
    if (cant <= 0) return;
    const prod = productosInventario.find(p => p.id.toString() === productoTemp);
    if (!prod) return;
    setItemsCompra(prev => {
      const existe = prev.findIndex(i => i.productoId === productoTemp);
      if (existe !== -1) return prev.map((i, idx) => idx === existe ? { ...i, cantidad: i.cantidad + cant } : i);
      return [...prev, { productoId: productoTemp, nombre: prod.nombre, cantidad: cant }];
    });
    setProductoTemp('');
    setCantidadTemp('');
  };

  const reimprimir80mm = (mov: any) => {
    const emp = getEmpresaConfig();
    const productos = mov.productos || [];
    const pagos = (mov.pagos || []).filter((p: any) => Number(p.monto) > 0);
    const subtotal  = Number(mov.subtotal)  || 0;
    const descuento = Number(mov.descuento) || 0;
    const impuesto  = Number(mov.impuesto)  || 0;
    const propina   = Number(mov.propina)   || 0;
    const envio     = Number(mov.envio)     || 0;
    const total     = Number(mov.valor)     || 0;

    const html = `<html><head><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:5px;margin:0;font-size:11px}
      .c{text-align:center}.b{font-weight:bold}
      .hr{border-top:1px dashed #000;margin:7px 0}
      .row{display:flex;justify-content:space-between}
      table{width:100%;font-size:11px;border-collapse:collapse}
      td.r{text-align:right}
    </style></head><body>
      <div class="c b">${emp.nombreEmpresa || "MI EMPRESA"}</div>
      <div class="c">NIT: ${emp.nit || "—"} | Tel: ${emp.telefono || "—"}</div>
      <div class="c">${emp.direccion || ""}</div>
      <div class="hr"></div>
      <div class="c b" style="font-size:13px">FACTURA No: ${mov.nroFactura}</div>
      <div class="c" style="font-size:9px;color:#666">** REIMPRESIÓN **</div>
      <div class="hr"></div>
      <div>FECHA: ${new Date(mov.fecha).toLocaleString("es-CO")}</div>
      <div>CLIENTE: ${(mov.cliente || "CONSUMIDOR FINAL").toUpperCase()}</div>
      <div class="hr"></div>
      <table><thead><tr>
        <th align="left">CANT</th><th align="left">DESCRIPCIÓN</th><th align="right">TOTAL</th>
      </tr></thead><tbody>
        ${productos.map((i: any) => `<tr>
          <td>${i.cantidad}</td>
          <td>${(i.nombre || "").substring(0, 18).toUpperCase()}</td>
          <td align="right">$${(i.subtotal || (i.precio * i.cantidad) || 0).toLocaleString("es-CO")}</td>
        </tr>`).join("")}
      </tbody></table>
      <div class="hr"></div>
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        ${subtotal > 0 ? `<tr><td>SUBTOTAL</td><td class="r">$${subtotal.toLocaleString("es-CO")}</td></tr>` : ""}
        ${descuento > 0 ? `<tr><td>DESCUENTO</td><td class="r">-$${descuento.toLocaleString("es-CO")}</td></tr>` : ""}
        ${impuesto > 0 ? `<tr><td>IMPUESTO</td><td class="r">$${impuesto.toLocaleString("es-CO")}</td></tr>` : ""}
        ${propina > 0 ? `<tr><td>PROPINA</td><td class="r">$${propina.toLocaleString("es-CO")}</td></tr>` : ""}
        ${envio > 0 ? `<tr><td>DOMICILIO</td><td class="r">$${envio.toLocaleString("es-CO")}</td></tr>` : ""}
        <tr class="b" style="font-size:13px"><td>TOTAL</td><td class="r">$${total.toLocaleString("es-CO")}</td></tr>
      </table>
      <div class="hr"></div>
      ${pagos.length > 1
        ? pagos.map((p: any) => `<div class="row"><span>${p.medio}</span><span>$${parseFloat(p.monto).toLocaleString("es-CO")}</span></div>`).join("")
        : `<div class="row"><span>PAGO:</span><span>${mov.medioPago || "EFECTIVO"}</span></div>`
      }
      <div class="hr"></div>
      <div class="c" style="font-size:9px">${emp.resolucion || ""}</div>
      <div class="c b">¡GRACIAS!</div>
      <script>window.print();window.close();</script>
    </body></html>`;

    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
  };

  const imprimirEgreso = (mov: any) => {
    const emp = getEmpresaConfig();
    const itemsHtml = mov.items?.length > 0
      ? mov.items.map((it: any) => `<tr><td style="padding:4px 8px;font-size:11px">${it.nombre.toUpperCase()}</td><td style="padding:4px 8px;text-align:center;font-size:11px">${it.cantidad}</td></tr>`).join("")
      : `<tr><td colspan="2" style="padding:4px 8px;font-size:11px">${mov.concepto || "—"}</td></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${mov.nroFactura}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:20px 28px;max-width:680px;margin:auto;font-size:12px}
h1{font-size:15px;font-weight:900;text-align:center;text-transform:uppercase}
.sub{text-align:center;font-size:10px;color:#666;margin-bottom:10px}
.hr{border:none;border-top:1px dashed #bbb;margin:10px 0}
table{width:100%;border-collapse:collapse}
thead th{background:#f1f5f9;padding:6px 8px;font-size:10px;text-transform:uppercase;font-weight:900;text-align:left}
.total td{font-weight:900;font-size:14px;padding:8px;border-top:2px solid #ddd}
@media print{body{padding:10px 16px}@page{margin:12mm 10mm;size:A4}}</style></head><body>
<h1>${emp.nombreEmpresa || "MI EMPRESA"}</h1>
<div class="sub">NIT: ${emp.nit || "—"} | Tel: ${emp.telefono || "—"}<br>${emp.direccion || ""}</div>
<hr class="hr">
<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:10px">
  <div><strong>${mov.nroFactura}</strong><br><span style="color:#666">${new Date(mov.fecha).toLocaleString("es-CO")}</span></div>
  <div style="text-align:right"><strong>PROVEEDOR:</strong><br>${mov.proveedor || "—"}</div>
</div>
<div style="display:inline-block;background:${mov.tipo==="INVENTARIO"?"#dbeafe":"#fee2e2"};color:${mov.tipo==="INVENTARIO"?"#1d4ed8":"#b91c1c"};padding:2px 10px;border-radius:20px;font-size:10px;font-weight:900;margin-bottom:10px">
  ${mov.tipo || "GASTO"}
</div>
<hr class="hr">
<table><thead><tr><th>Concepto / Producto</th><th style="text-align:center">Cant.</th></tr></thead>
<tbody>${itemsHtml}</tbody></table>
<hr class="hr">
<table><tr class="total"><td>TOTAL</td><td style="text-align:right;color:#059669">$ ${(mov.valor||0).toLocaleString("es-CO")}</td></tr></table>
<script>window.print();window.close();</script></body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
  };

  const resetFormEgreso = () => {
    setShowDrawerEgreso(false);
    setItemsCompra([]);
    setProductoTemp('');
    setCantidadTemp('');
    setFormEgreso({ fecha: new Date().toLocaleDateString('en-CA'), proveedor: '', productoId: '', cantidad: '', valor: '', detalle: '' });
    setMedioSale("EFECTIVO"); setMedioEntra("NEQUI");
  };

  const guardarNuevoEgreso = async () => {
    if (!formEgreso.valor) return toast("warning", "Ingresa el valor");
    if (tipoEgreso !== 'CAMBIO' && !formEgreso.proveedor) return toast("warning", "Completa proveedor y valor");
    const valorNum = parseFloat(formEgreso.valor);

    if (tipoEgreso === 'INVENTARIO' && itemsCompra.length === 0)
      return toast("warning", "Agrega al menos un producto");

    const maxNum = movimientos.filter((m: any) =>
      m.categoria === "egreso" && /^EG-\d{1,5}$/.test(m.nroFactura || m.nroDoc || "")
    ).reduce((max: number, m: any) => {
      const n = parseInt((m.nroFactura || m.nroDoc || "").replace("EG-", "")) || 0;
      return n > max ? n : max;
    }, 0);
    const nroDoc = `EG-${String(maxNum + 1).padStart(4, "0")}`;
    const fechaISO = new Date().toISOString();
    const concepto = tipoEgreso === 'INVENTARIO'
      ? (itemsCompra.length === 1 ? `COMPRA: ${itemsCompra[0].nombre}` : `COMPRA MÚLTIPLE (${itemsCompra.length} productos)`)
      : tipoEgreso === 'CAMBIO'
      ? `CAMBIO ${medioSale} → ${medioEntra}`
      : formEgreso.detalle.toUpperCase();

    const payload = {
      nroDoc,
      fecha:        formEgreso.fecha || new Date().toLocaleDateString("en-CA"),
      fechaISO,
      tipo:         tipoEgreso,
      proveedor:    tipoEgreso === 'CAMBIO' ? '' : formEgreso.proveedor.toUpperCase(),
      concepto,
      valor:        valorNum,
      medioPago:    tipoEgreso === 'CAMBIO' ? medioSale : "EFECTIVO",
      items:        tipoEgreso === 'INVENTARIO' ? itemsCompra : [],
      estado:       "CUADRADA",
      esInventario: tipoEgreso === 'INVENTARIO',
    };

    // Actualizar stock local si es compra de inventario
    if (tipoEgreso === 'INVENTARIO') {
      const prods = JSON.parse(localStorage.getItem(prodKey) || "[]");
      const prodsNuevos = prods.map((p: any) => {
        const item = itemsCompra.find(i =>
          String(i.productoId) === String(p.id) ||
          (i.nombre || "").trim().toUpperCase() === (p.nombre || "").trim().toUpperCase()
        );
        if (!item) return p;
        return { ...p, stock: parseFloat(p.stock || "0") + Number(item.cantidad) };
      });
      localStorage.setItem(prodKey, JSON.stringify(prodsNuevos));
      setProductosInventario(prodsNuevos);
    }

    try {
      const { data } = await api.post(`/branches/${branchId}/egresos`, payload);
      const guardado = { ...payload, id: data.data._id, _id: data.data._id, categoria: "egreso", nroFactura: nroDoc, fecha: fechaISO };
      const nuevos = [guardado, ...movimientos];
      setMovimientos(nuevos);
      localStorage.setItem(movKey, JSON.stringify(nuevos));

      // Si es CAMBIO → crear también el ingreso en el medio que entra
      if (tipoEgreso === 'CAMBIO') {
        const recaudo = {
          id:        Date.now(),
          fecha:     payload.fecha,
          fechaISO:  fechaISO,
          nroRecibo: `CAM-${nroDoc}`,
          tercero:   `CAMBIO ${medioSale}`,
          concepto:  `CAMBIO ${medioSale} → ${medioEntra}`,
          valor:     payload.valor,
          medioPago: medioEntra,
          facturaRef: "",
        };
        // Guardar en API y en localStorage (merge para no perderlo)
        try {
          await api.post(`/branches/${branchId}/recaudos`, recaudo);
        } catch {
          toast("warning", "Cambio guardado pero el ingreso a banco falló — se guardó localmente");
        }
        const recaudosActuales = JSON.parse(localStorage.getItem("otros_recaudos") || "[]");
        const sinDuplicado = recaudosActuales.filter((r: any) => r.nroRecibo !== recaudo.nroRecibo);
        localStorage.setItem("otros_recaudos", JSON.stringify([recaudo, ...sinDuplicado]));
      }

      toast("success", "Egreso guardado");
    } catch {
      toast("error", "Error al guardar el egreso");
    }
    resetFormEgreso();
  };

  // ── Anular factura ────────────────────────────────────────────────────────
  const anularFactura = async () => {
    const mov = movimientoSeleccionado;
    if (!mov) return;

    const ventaId = String(mov._id || mov.id);
    const motivo  = motivoAnulacion.trim() || "Sin motivo";

    // 1. Anular en MongoDB via API (restaura stock automáticamente)
    if (branchId && mov._id) {
      try {
        await api.put(`/branches/${branchId}/ventas/${ventaId}/anular`, { motivo });
      } catch { /* continuar con la anulación local si el API falla */ }
    }

    // 2. Marcar como ANULADA en el estado local y localStorage
    const movsAct = movimientos.map(m =>
      (String(m._id || m.id) === ventaId)
        ? { ...m, estado: "ANULADA", motivoAnulacion: motivo, fechaAnulacion: new Date().toISOString() }
        : m
    );
    localStorage.setItem(movKey, JSON.stringify(movsAct));
    setMovimientos(movsAct);

    // 3. Restaurar stock en localStorage (bridge)
    if (mov.productos && mov.productos.length > 0) {
      const prods = JSON.parse(localStorage.getItem(prodKey) || "[]");
      const prodsAct = prods.map((p: any) => {
        const item = mov.productos.find((i: any) =>
          String(i.id || i.productoId) === String(p.id) ||
          (i.nombre || "").toUpperCase().trim() === (p.nombre || "").toUpperCase().trim()
        );
        if (!item) return p;
        return { ...p, stock: (parseFloat(p.stock) || 0) + (Number(item.cantidad) || 0) };
      });
      localStorage.setItem(prodKey, JSON.stringify(prodsAct));
      setProductosInventario(prodsAct);
    }

    // 4. Revertir CXC si era venta a crédito
    if (mov.tipoVenta === "CRÉDITO" || mov.tipoPago === "CRÉDITO") {
      const cxc = JSON.parse(localStorage.getItem("cxc") || "[]");
      localStorage.setItem("cxc", JSON.stringify([{
        id: Date.now(), fecha: new Date().toISOString(),
        tercero:    (mov.cliente || "").toUpperCase(),
        cliente:    (mov.cliente || "").toUpperCase(),
        nroFactura: mov.nroFactura,
        concepto:   `ANULACIÓN ${mov.nroFactura}`,
        tipoMov:    "ABONO",
        valor:      Number(mov.valor) || 0,
        debito:     0, credito: Number(mov.valor) || 0,
      }, ...cxc]));
    }

    setMostrarConfirmAnular(false);
    setMotivoAnulacion("");
    setMovimientoSeleccionado(null);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans select-none overflow-hidden text-[#1a2b3c]">
      
      {/* SECCIÓN FIJA (TITULO, TOTALES, FILTROS Y ENCABEZADOS) */}
      <div className="bg-white shrink-0 shadow-sm z-50">
        <div className="px-8 pt-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">{filtroTab === 'egreso' ? 'GESTION DE EGRESOS' : 'MOVIMIENTOS'}</h1>
            <div className="mt-4 flex gap-4">
              {filtroTab === 'egreso' ? (
                <div className="bg-gray-50 px-5 py-3 rounded-2xl border border-gray-100 min-w-[200px]">
                  <p className="text-[16px] font-black text-gray-400 uppercase">TOTAL EGRESOS</p>
                  <p className="text-xl font-black text-red-500">$ {totalEgresos.toLocaleString()}</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {/* Subtotal productos */}
                  <button onClick={() => setFiltroDetalle(filtroDetalle === "subtotal" ? "todos" : "subtotal")}
                    className={`cursor-pointer px-4 py-2.5 rounded-2xl border text-left transition-all ${filtroDetalle==="subtotal" ? "bg-white border-[#1a2b3c] ring-1 ring-[#1a2b3c]/20 shadow-sm" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subtotal Ventas ↗</p>
                    <p className="text-sm font-black text-gray-800">$ {subtotalVentas.toLocaleString()}</p>
                  </button>
                  {/* Descuentos */}
                  {totalDescuentos > 0 && (
                    <button onClick={() => setFiltroDetalle(filtroDetalle==="descuento" ? "todos" : "descuento")}
                      className={`cursor-pointer px-4 py-2.5 rounded-2xl border text-left transition-all ${filtroDetalle==="descuento" ? "bg-white border-[#1a2b3c] ring-1 ring-[#1a2b3c]/20 shadow-sm" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Descuentos ↘</p>
                      <p className="text-sm font-black text-red-500">- $ {totalDescuentos.toLocaleString()}</p>
                    </button>
                  )}
                  {/* Impuestos */}
                  {totalImpuestos > 0 && (
                    <button onClick={() => setFiltroDetalle(filtroDetalle==="impuesto" ? "todos" : "impuesto")}
                      className={`cursor-pointer px-4 py-2.5 rounded-2xl border text-left transition-all ${filtroDetalle==="impuesto" ? "bg-white border-[#1a2b3c] ring-1 ring-[#1a2b3c]/20 shadow-sm" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Impuestos ↗</p>
                      <p className="text-sm font-black text-gray-600">$ {totalImpuestos.toLocaleString()}</p>
                    </button>
                  )}
                  {/* Propinas */}
                  {totalPropinas > 0 && (
                    <button onClick={() => setFiltroDetalle(filtroDetalle==="propina" ? "todos" : "propina")}
                      className={`cursor-pointer px-4 py-2.5 rounded-2xl border text-left transition-all ${filtroDetalle==="propina" ? "bg-white border-[#1a2b3c] ring-1 ring-[#1a2b3c]/20 shadow-sm" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Propinas ↗</p>
                      <p className="text-sm font-black text-gray-600">$ {totalPropinas.toLocaleString()}</p>
                    </button>
                  )}
                  {/* Domicilios */}
                  {totalDomicilios > 0 && (
                    <button onClick={() => setFiltroDetalle(filtroDetalle==="domicilio" ? "todos" : "domicilio")}
                      className={`cursor-pointer px-4 py-2.5 rounded-2xl border text-left transition-all ${filtroDetalle==="domicilio" ? "bg-white border-[#1a2b3c] ring-1 ring-[#1a2b3c]/20 shadow-sm" : "bg-gray-50 border-gray-200 hover:border-gray-300"}`}>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Domicilios ↗</p>
                      <p className="text-sm font-black text-gray-600">$ {totalDomicilios.toLocaleString()}</p>
                    </button>
                  )}
                  {/* Total facturación */}
                  <div className="bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-200">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Facturación</p>
                    <p className="text-base font-black text-gray-900">$ {totalVentas.toLocaleString()}</p>
                  </div>
                  {/* Egresos y balance */}
                  <div className="bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-200">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Egresos</p>
                    <p className="text-sm font-black text-red-500">$ {totalEgresos.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-200">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Balance</p>
                    <p className="text-sm font-black text-[#1a2b3c]">$ {(totalVentas - totalEgresos).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          {filtroTab === 'egreso' && (
            <button onClick={() => setShowDrawerEgreso(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-blue-100 flex items-center gap-2"><Plus size={14} /> NUEVO REGISTRO</button>
          )}
        </div>

        <div className="px-8 mt-6 flex gap-3 items-center">
          <select value={tipoRango} onChange={(e) => setTipoRango(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none">
            <option>DIARIO</option><option>SEMANAL</option><option>QUINCENAL</option><option>MENSUAL</option><option>ANUAL</option>
          </select>
          <div onClick={() => dateInputRef.current?.showPicker()} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 cursor-pointer relative">
            <CalendarDays size={14} className="text-blue-500 shrink-0" />
            <span className="text-[10px] font-black text-blue-600 uppercase">{etiqueta}</span>
            <input ref={dateInputRef} type="date" value={fechaBase} onChange={(e) => setFechaBase(e.target.value)} className="absolute inset-0 opacity-0 pointer-events-none" />
          </div>
          <div className="flex gap-6 ml-8 border-b-2 border-transparent">
            {["ingreso", "egreso"].map((cat) => (
              <button key={cat} onClick={() => { setFiltroTab(cat); setFiltroDetalle("todos"); }} className={`pb-2 uppercase text-[10px] font-black tracking-widest transition-all ${filtroTab === cat ? "border-b-4 border-blue-600 text-blue-600" : "text-gray-300"}`}>
                {cat === 'ingreso' ? 'VENTAS' : cat === 'egreso' ? 'EGRESOS' : cat.toUpperCase()}
              </button>
            ))}
            {filtroDetalle !== "todos" && (
              <span className="flex items-center gap-1 text-[10px] font-black uppercase text-white bg-blue-500 px-3 py-1 rounded-full">
                {filtroDetalle === "subtotal"  ? "Subtotal"
                : filtroDetalle === "descuento" ? "Descuentos"
                : filtroDetalle === "impuesto" ? "Impuestos"
                : filtroDetalle === "propina"  ? "Propinas"
                : "Domicilios"}
                <button onClick={() => setFiltroDetalle("todos")} className="ml-1 hover:text-red-200">✕</button>
              </span>
            )}
          </div>
        </div>

      </div>

      {/* TABLA ÚNICA CON HEADER STICKY */}
      <div className="flex-1 overflow-y-auto px-8 pb-10 custom-scroll mt-4">
        <div className="flex justify-end gap-2 mb-2">
          <button onClick={exportarExcel}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-gray-50 transition-all shadow-sm">
            <FileDown size={12} /> Excel
          </button>
          <button onClick={exportarPDF}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-gray-50 transition-all shadow-sm">
            <FileText size={12} /> PDF
          </button>
        </div>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 border border-gray-200 text-gray-500 font-black text-[11px] uppercase tracking-wider">
              <th className="px-4 py-3 text-left border-r border-gray-200 w-32">Fecha / Doc.</th>
              <th className="px-4 py-3 text-left border-r border-gray-200 w-48">Tercero / Concepto</th>
              <th className="px-4 py-3 text-center border-r border-gray-200 w-24">Medio Pago</th>
              {filtroTab === 'ingreso' && <>
                <th className="px-4 py-3 text-right border-r border-gray-200 w-28">Subtotal</th>
                {totalDescuentos > 0 && <th className="px-4 py-3 text-right border-r border-gray-200 w-24">Descuento</th>}
                {totalImpuestos  > 0 && <th className="px-4 py-3 text-right border-r border-gray-200 w-24">Impuesto</th>}
                {totalPropinas   > 0 && <th className="px-4 py-3 text-right border-r border-gray-200 w-24">Propina</th>}
                {totalDomicilios > 0 && <th className="px-4 py-3 text-right border-r border-gray-200 w-24">Domicilio</th>}
              </>}
              <th className="px-4 py-3 text-right border-r border-gray-200 w-28">Total</th>
              <th className="px-4 py-3 text-center w-24">Estado</th>
            </tr>
          </thead>
          <tbody className="bg-white border-x border-b border-gray-200 divide-y divide-gray-100">
            {filtrados.map(m => (
              <tr key={m.id} onClick={() => setMovimientoSeleccionado(m)} className="hover:bg-blue-50/30 cursor-pointer transition-colors">
                <td className="px-4 py-4">
                  <p className="font-bold text-[12px] text-gray-400">{new Date(m.fecha).toLocaleDateString('es-ES')} · {new Date(m.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="text-[10px] text-blue-600 font-black">{m.nroFactura}</p>
                </td>
                <td className="px-4 py-4 uppercase w-48 max-w-[12rem]">
                  <p className="font-black text-sm text-gray-400 truncate">{m.cliente || m.proveedor}</p>
                  <p className="text-[10px] text-gray-400 font-medium truncate">{m.concepto}</p>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-[10px] font-black uppercase">
                    {m.medioPago || 'EFECTIVO'}
                  </span>
                </td>
                {filtroTab === 'ingreso' && <>
                  <td className="px-4 py-4 text-right text-[11px] font-bold text-gray-600">
                    ${Number(m.subtotal || (m.valor - (Number(m.propina)||0) - (Number(m.impuesto)||0) - (Number(m.envio)||0))).toLocaleString("es-CO")}
                  </td>
                  {totalDescuentos > 0 && <td className="px-4 py-4 text-right text-[11px] font-bold text-red-400">{Number(m.descuento)>0 ? `-$${Number(m.descuento).toLocaleString("es-CO")}` : "—"}</td>}
                  {totalImpuestos  > 0 && <td className="px-4 py-4 text-right text-[11px] font-bold text-gray-500">{Number(m.impuesto)>0 ? `$${Number(m.impuesto).toLocaleString("es-CO")}` : "—"}</td>}
                  {totalPropinas   > 0 && <td className="px-4 py-4 text-right text-[11px] font-bold text-gray-500">{Number(m.propina)>0 ? `$${Number(m.propina).toLocaleString("es-CO")}` : "—"}</td>}
                  {totalDomicilios> 0 && <td className="px-4 py-4 text-right text-[11px] font-bold text-gray-500">{Number(m.envio)>0 ? `$${Number(m.envio).toLocaleString("es-CO")}` : "—"}</td>}
                </>}
                <td className="px-4 py-4 font-black text-right text-base text-gray-800">$ {Number(m.valor).toLocaleString("es-CO")}</td>
                <td className="px-6 py-5 w-1/6 text-center">
                  {(() => {
                    if (m.estado === "ANULADA") return (
                      <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase bg-red-100 text-red-600">
                        Anulada
                      </span>
                    );
                    const isPendiente = (m.estado || "").toLowerCase() === "pendiente" || m.tipoVenta === "CRÉDITO";
                    return (
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${
                        isPendiente ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-600"
                      }`}>
                        {isPendiente ? "Pendiente" : "Pagada"}
                      </span>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && <div className="py-20 text-center font-black text-gray-200 uppercase text-xs">Sin registros</div>}
      </div>

      {/* DRAWER DEL FORMULARIO (RESTABLECIDO) */}
      {(showDrawerEgreso || movimientoSeleccionado) && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-[#1a2b3c]/20" onClick={() => { resetFormEgreso(); setMovimientoSeleccionado(null); }}></div>
          <div className="relative w-full max-w-md bg-white h-full px-5 pt-5 pb-[72px] flex flex-col shadow-2xl">
            {/* Botones esquina superior derecha */}
            <div className="absolute top-4 right-4 flex items-center gap-1">
              {movimientoSeleccionado?.categoria === "egreso" && (
                <button onClick={() => imprimirEgreso(movimientoSeleccionado)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors" title="Imprimir egreso">
                  <Printer size={16} />
                </button>
              )}
              <button onClick={() => { resetFormEgreso(); setMovimientoSeleccionado(null); }} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={16} />
              </button>
            </div>

            {showDrawerEgreso ? (
              <div className="flex-1 flex flex-col overflow-hidden pt-6">

                {/* Header: título + consecutivo + fecha */}
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-lg font-black uppercase tracking-tighter">Nuevo Egreso</h2>
                  <div className="text-right">
                    <p className="text-[12px] font-black text-blue-600">EG-{String(
                      movimientos.filter((m: any) =>
                        m.categoria === "egreso" && /^EG-\d{1,5}$/.test(m.nroFactura || "")
                      ).reduce((max: number, m: any) => {
                        const n = parseInt((m.nroFactura || "").replace("EG-", "")) || 0;
                        return n > max ? n : max;
                      }, 0) + 1
                    ).padStart(4, "0")}</p>
                    <p className="text-[10px] text-gray-400 font-bold">{new Date().toLocaleDateString('es-ES')}</p>
                  </div>
                </div>

                {/* Tabs tipo */}
                <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl">
                  {(['GASTO', 'INVENTARIO', 'PRESTAMO', 'CAMBIO'] as const).map(t => (
                    <button key={t} onClick={() => setTipoEgreso(t)} className={`flex-1 py-1.5 rounded-lg text-[8px] font-black transition-all ${tipoEgreso === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>{t}</button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">

                  {/* Tercero — oculto para CAMBIO */}
                  {tipoEgreso !== 'CAMBIO' && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Tercero / Proveedor</p>
                      <input type="text" list="terceros-list" value={formEgreso.proveedor} onChange={e => setFormEgreso({...formEgreso, proveedor: e.target.value})}
                        className="w-full bg-transparent font-black uppercase text-sm outline-none" placeholder="BUSCAR..." />
                      <datalist id="terceros-list">{listaBusquedaTerceros.map((t, i) => <option key={i} value={t.nombre}>{t.tipo}</option>)}</datalist>
                    </div>
                  )}

                  {/* Inventario: selector múltiple */}
                  {tipoEgreso === 'CAMBIO' ? (
                    /* Cambio de efectivo */
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-3">
                      <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Cambio de Efectivo</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Sale de caja (efectivo)</p>
                          <select value={medioSale} onChange={e => setMedioSale(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 font-black text-[10px] outline-none uppercase">
                            {["EFECTIVO", ...listaBusquedaTerceros.map(() => "").filter(Boolean)].length ? ["EFECTIVO","NEQUI","DAVIPLATA","TRANSFERENCIA",...JSON.parse(localStorage.getItem("lista_bancos")||"[]")].filter((v,i,a)=>a.indexOf(v)===i).map(m=><option key={m}>{m}</option>) : <option>EFECTIVO</option>}
                          </select>
                        </div>
                        <span className="text-gray-400 font-black mt-4">→</span>
                        <div className="flex-1">
                          <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Entra al banco</p>
                          <select value={medioEntra} onChange={e => setMedioEntra(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 font-black text-[10px] outline-none uppercase">
                            {["EFECTIVO","NEQUI","DAVIPLATA","TRANSFERENCIA",...JSON.parse(localStorage.getItem("lista_bancos")||"[]")].filter((v,i,a)=>a.indexOf(v)===i).map(m=><option key={m}>{m}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg px-3 py-2 border border-blue-100 text-center">
                        <p className="text-[9px] font-black text-blue-400 uppercase">Concepto generado</p>
                        <p className="text-xs font-black text-gray-700 mt-0.5">CAMBIO {medioSale} → {medioEntra}</p>
                      </div>
                    </div>
                  ) : tipoEgreso === 'INVENTARIO' ? (
                    <>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase mb-2">Agregar Producto</p>
                        <div className="flex gap-1 items-center">
                          <select
                            className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-2 py-1.5 font-black text-[10px] outline-none uppercase"
                            value={productoTemp}
                            onChange={e => setProductoTemp(e.target.value)}
                          >
                            <option value="">SELECCIONAR...</option>
                            {productosInventario.map(p => <option key={p.id} value={p.id.toString()}>{p.nombre.toUpperCase()}</option>)}
                          </select>
                          <input type="number" placeholder="Cant" value={cantidadTemp} onChange={e => setCantidadTemp(e.target.value)}
                            className="w-14 bg-white border border-gray-200 rounded-lg px-2 py-1.5 font-black text-[10px] outline-none text-center shrink-0" />
                          <button type="button" onClick={agregarItemCompra}
                            className="bg-blue-600 text-white w-8 h-8 rounded-lg font-black text-base flex items-center justify-center shrink-0 hover:bg-blue-700">+</button>
                        </div>
                      </div>

                      {itemsCompra.length > 0 && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                          <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Productos a ingresar</p>
                          {itemsCompra.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-100">
                              <p className="text-[10px] font-black uppercase text-gray-700 flex-1 truncate">{item.nombre}</p>
                              <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0">x{item.cantidad}</span>
                              <button type="button" onClick={() => setItemsCompra(prev => prev.filter((_, i) => i !== idx))}
                                className="text-red-400 hover:text-red-600 font-black text-base shrink-0 leading-none">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Gasto / Préstamo: detalle libre */
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Detalle / Concepto</p>
                      <textarea value={formEgreso.detalle} onChange={e => setFormEgreso({...formEgreso, detalle: e.target.value})}
                        className="w-full bg-transparent text-sm font-bold outline-none h-16 resize-none" placeholder="Descripción..." />
                    </div>
                  )}

                  {/* Valor total */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Valor Total</p>
                    <div className="flex items-center text-3xl font-black text-emerald-500 tracking-tighter">
                      $<input type="number" value={formEgreso.valor} onChange={e => setFormEgreso({...formEgreso, valor: e.target.value})}
                        className="bg-transparent outline-none w-full ml-1" placeholder="0" />
                    </div>
                  </div>

                </div>
                {/* botón fijo al fondo del drawer */}
                <div className="absolute bottom-0 left-0 right-0 px-5 py-4 bg-white border-t border-gray-100">
                  <button onClick={guardarNuevoEgreso} className="w-full bg-[#1a2b3c] text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Guardar Registro</button>
                </div>
              </div>
            ) : (
              /* AQUÍ VA EL DETALLE CON LAS VARIABLES QUE ACORDAMOS */
              <div className="flex-1 flex flex-col overflow-hidden">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-[#1a2b3c]">
                  {movimientoSeleccionado.nroFactura}
                </h2>
                <p className="text-[10px] font-bold text-gray-400 mb-4 border-b pb-2">
                  {new Date(movimientoSeleccionado.fecha).toLocaleString('es-ES')}
                </p>

                <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scroll">
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Tercero</p>
                    <p className="text-lg font-black text-[#1a2b3c] uppercase">
                      {movimientoSeleccionado.cliente || movimientoSeleccionado.proveedor}
                    </p>
                  </div>

                 {/* DETALLE */}
        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
          <p className="text-[9px] font-black text-blue-600 uppercase mb-3 tracking-widest">Detalle</p>

          {/* Egreso inventario con múltiples items */}
          {movimientoSeleccionado.items && movimientoSeleccionado.items.length > 0 ? (
            <div className="space-y-2">
              {movimientoSeleccionado.items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-2 border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-gray-700 flex-1 truncate">{item.nombre}</p>
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-lg shrink-0">x{item.cantidad}</span>
                </div>
              ))}
            </div>

          /* Venta con productos (factura rápida) */
          ) : movimientoSeleccionado.productos && movimientoSeleccionado.productos.length > 0 ? (
            <div className="space-y-2">
              {movimientoSeleccionado.productos.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-start gap-2 border-b border-gray-200/50 pb-1 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase text-gray-700 leading-tight">{item.nombre}</p>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">CANT: {item.cantidad}</p>
                  </div>
                  <p className="text-[11px] font-black text-[#1a2b3c] whitespace-nowrap">
                    $ {(item.subtotal || (item.precio * item.cantidad) || 0).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

          /* Egreso inventario antiguo (producto único) o gasto simple */
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-gray-700 uppercase leading-tight">
                {movimientoSeleccionado.concepto || "SIN DETALLE"}
              </p>
              {(movimientoSeleccionado.tipo === 'INVENTARIO' || movimientoSeleccionado.esInventario) &&
               Number(movimientoSeleccionado.cantidadKardex) > 0 && (
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase">
                  Cantidad: {movimientoSeleccionado.cantidadKardex} und
                </span>
              )}
            </div>
          )}
        </div>

                  {/* VARIABLES FINALES */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Medio Pago</p>
                      <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase">
                        {movimientoSeleccionado.medioPago || 'EFECTIVO'}
                      </span>
                      {(movimientoSeleccionado.medioPago === "MIXTO" || (movimientoSeleccionado.pagos?.length > 1)) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(movimientoSeleccionado.pagos || []).filter((p: any) => Number(p.monto) > 0).map((p: any, i: number) => (
                            <span key={i} className="text-[8px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {p.medio} ${Number(p.monto).toLocaleString("es-CO")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-right">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Estado</p>
                      {(() => {
                        const isPendiente = (movimientoSeleccionado.estado || "").toLowerCase() === "pendiente"
                          || movimientoSeleccionado.tipoVenta === "CRÉDITO";
                        return (
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                            isPendiente ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-600"
                          }`}>
                            {isPendiente ? "Pendiente" : "Pagada"}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 space-y-1.5">
                    {/* Subtotal si hay descuento, impuesto, propina o envío */}
                    {(Number(movimientoSeleccionado.descuento) > 0 || Number(movimientoSeleccionado.impuesto) > 0 || Number(movimientoSeleccionado.propina) > 0 || Number(movimientoSeleccionado.envio) > 0) && (
                      <div className="flex justify-between text-[10px] font-bold text-gray-400">
                        <span>Subtotal productos</span>
                        <span>${Number(movimientoSeleccionado.subtotal || 0).toLocaleString("es-CO")}</span>
                      </div>
                    )}
                    {Number(movimientoSeleccionado.descuento) > 0 && (
                      <div className="flex justify-between text-[10px] font-bold text-gray-500">
                        <span>Descuento</span>
                        <span>-${Number(movimientoSeleccionado.descuento).toLocaleString("es-CO")}</span>
                      </div>
                    )}
                    {Number(movimientoSeleccionado.impuesto) > 0 && (
                      <div className="flex justify-between text-[10px] font-bold text-gray-400">
                        <span>Impuesto</span>
                        <span>${Number(movimientoSeleccionado.impuesto).toLocaleString("es-CO")}</span>
                      </div>
                    )}
                    {Number(movimientoSeleccionado.propina) > 0 && (
                      <div className="flex justify-between text-[10px] font-bold text-gray-400">
                        <span>Propina</span>
                        <span>${Number(movimientoSeleccionado.propina).toLocaleString("es-CO")}</span>
                      </div>
                    )}
                    {Number(movimientoSeleccionado.envio) > 0 && (
                      <div className="flex justify-between text-[10px] font-bold text-gray-400">
                        <span>Domicilio</span>
                        <span>${Number(movimientoSeleccionado.envio).toLocaleString("es-CO")}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline pt-1 border-t border-gray-100">
                      <p className="text-[9px] font-black text-gray-400 uppercase">Total Movimiento</p>
                      <div className="text-3xl font-black text-gray-900 tracking-tighter">
                        ${Number(movimientoSeleccionado.valor).toLocaleString("es-CO")}
                      </div>
                    </div>
                  </div>
                {/* === PEGAR AQUÍ EL BLOQUE DE ACCIONES === */}
                  <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => movimientoSeleccionado.categoria === "egreso"
                        ? imprimirEgreso(movimientoSeleccionado)
                        : reimprimir80mm(movimientoSeleccionado)
                      }
                      className="flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 py-3 rounded-xl transition-colors border border-gray-100"
                    >
                      <Printer size={20} />
                      <span className="text-[8px] font-black uppercase mt-1 text-gray-600">80mm</span>
                    </button>
                    <button
                      className="flex flex-col items-center justify-center bg-red-50 hover:bg-red-100 py-3 rounded-xl transition-colors border border-red-100"
                      onClick={() => {
                        const mov = movimientoSeleccionado;
                        const emp = getEmpresaConfig();
                        const productos = mov.productos || [];
                        const subtotal  = Number(mov.subtotal)  || 0;
                        const descuento = Number(mov.descuento) || 0;
                        const impuesto  = Number(mov.impuesto)  || 0;
                        const propina   = Number(mov.propina)   || 0;
                        const envio     = Number(mov.envio)     || 0;
                        const total     = Number(mov.valor)     || 0;
                        const pagos     = (mov.pagos || []).filter((p: any) => Number(p.monto) > 0);

                        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${mov.nroFactura}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',sans-serif;padding:32px 40px;font-size:12px;color:#1a2b3c;max-width:680px;margin:auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
.empresa h1{font-size:18px;font-weight:900;text-transform:uppercase}
.empresa p{font-size:10px;color:#666;margin-top:2px}
.factura-tag{text-align:right}
.factura-tag .nro{font-size:22px;font-weight:900;color:#1a2b3c}
.factura-tag .fecha{font-size:10px;color:#888;margin-top:2px}
.hr{border:none;border-top:1px solid #e2e8f0;margin:14px 0}
.cliente{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:16px}
.cliente .label{font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
.cliente .valor{font-size:13px;font-weight:900;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:10px}
thead th{background:#1e293b;color:#fff;padding:6px 10px;font-size:9px;text-transform:uppercase;text-align:left}
thead th.r{text-align:right}
tbody td{padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px}
tbody td.r{text-align:right}
.totales{margin-left:auto;width:260px;margin-top:4px}
.totales .fila{display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#64748b}
.totales .total-final{display:flex;justify-content:space-between;font-size:16px;font-weight:900;color:#1a2b3c;padding:8px 0;border-top:2px solid #1e293b;margin-top:4px}
.pago{display:flex;gap:6px;align-items:center;margin-top:12px}
.pago .badge{background:#dbeafe;color:#1d4ed8;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:900;text-transform:uppercase}
.resolucion{margin-top:20px;font-size:9px;color:#94a3b8;text-align:center;border-top:1px dashed #e2e8f0;padding-top:10px}
.reimp{display:inline-block;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:8px;font-weight:900;text-transform:uppercase;margin-bottom:8px}
@media print{@page{margin:12mm 10mm;size:A4}}</style></head><body>
<div class="header">
  <div class="empresa">
    <h1>${emp.nombreEmpresa || "MI EMPRESA"}</h1>
    <p>NIT: ${emp.nit || "—"}</p>
    <p>${emp.direccion || ""}</p>
    <p>Tel: ${emp.telefono || "—"}</p>
  </div>
  <div class="factura-tag">
    <div class="reimp">Reimpresión</div>
    <div class="nro">${mov.nroFactura}</div>
    <div class="fecha">${new Date(mov.fecha).toLocaleString("es-CO")}</div>
  </div>
</div>
<hr class="hr">
<div class="cliente">
  <div class="label">Cliente</div>
  <div class="valor">${(mov.cliente || "CONSUMIDOR FINAL").toUpperCase()}</div>
</div>
<table>
  <thead><tr>
    <th>Descripción</th>
    <th class="r">Cant.</th>
    <th class="r">Total</th>
  </tr></thead>
  <tbody>
    ${productos.map((i: any) => `<tr>
      <td>${(i.nombre || "").toUpperCase()}</td>
      <td class="r">${i.cantidad}</td>
      <td class="r">$${(i.subtotal || (i.precio * i.cantidad) || 0).toLocaleString("es-CO")}</td>
    </tr>`).join("")}
  </tbody>
</table>
<div class="totales">
  ${subtotal > 0 ? `<div class="fila"><span>Subtotal</span><span>$${subtotal.toLocaleString("es-CO")}</span></div>` : ""}
  ${descuento > 0 ? `<div class="fila"><span>Descuento</span><span>-$${descuento.toLocaleString("es-CO")}</span></div>` : ""}
  ${impuesto > 0 ? `<div class="fila"><span>Impuesto</span><span>$${impuesto.toLocaleString("es-CO")}</span></div>` : ""}
  ${propina > 0 ? `<div class="fila"><span>Propina</span><span>$${propina.toLocaleString("es-CO")}</span></div>` : ""}
  ${envio > 0 ? `<div class="fila"><span>Domicilio</span><span>$${envio.toLocaleString("es-CO")}</span></div>` : ""}
  <div class="total-final"><span>TOTAL</span><span>$${total.toLocaleString("es-CO")}</span></div>
</div>
<div class="pago">
  <span style="font-size:10px;color:#64748b;font-weight:700">Medio de pago:</span>
  ${pagos.length > 1
    ? pagos.map((p: any) => `<span class="badge">${p.medio} $${parseFloat(p.monto).toLocaleString("es-CO")}</span>`).join("")
    : `<span class="badge">${mov.medioPago || "EFECTIVO"}</span>`
  }
</div>
${emp.resolucion ? `<div class="resolucion">${emp.resolucion}</div>` : ""}
<script>window.print();</script>
</body></html>`;
                        const w = window.open("", "_blank");
                        w?.document.write(html);
                        w?.document.close();
                      }}
                    >
                      <FileText size={20} />
                      <span className="text-[8px] font-black uppercase mt-1 text-red-600">Ver PDF</span>
                    </button>
                    <button
                      className="flex flex-col items-center justify-center bg-green-50 hover:bg-green-100 py-3 rounded-xl transition-colors border border-green-100"
                      onClick={() => {
                        const msj = `Hola, envío comprobante de ${movimientoSeleccionado.nroFactura} por valor de $${Number(movimientoSeleccionado.valor).toLocaleString("es-CO")}`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(msj)}`, '_blank');
                      }}
                    >
                      <MessageCircle size={20} />
                      <span className="text-[8px] font-black uppercase mt-1 text-green-600">WhatsApp</span>
                    </button>
                  </div>

                  {/* Botón anular — solo para ingresos no anulados */}
                  {movimientoSeleccionado.categoria === "ingreso" && movimientoSeleccionado.estado !== "ANULADA" && (
                    <button
                      onClick={() => setMostrarConfirmAnular(true)}
                      className="mt-3 w-full py-3 rounded-xl border-2 border-red-200 text-red-600 font-black text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all"
                    >
                      Anular Factura
                    </button>
                  )}

                  {/* Botón eliminar — solo para egresos */}
                  {movimientoSeleccionado.categoria === "egreso" && (
                    <button
                      onClick={async () => {
                        const id = movimientoSeleccionado._id || movimientoSeleccionado.id;
                        if (!id || !branchId) return;
                        if (!window.confirm(`¿Eliminar el egreso ${movimientoSeleccionado.nroFactura}? Esta acción no se puede deshacer.`)) return;
                        try {
                          await api.delete(`/branches/${branchId}/egresos/${id}`);
                          setMovimientos(prev => prev.filter(m => (m._id || m.id) !== id));
                          setMovimientoSeleccionado(null);
                        } catch {
                          alert("Error al eliminar el egreso");
                        }
                      }}
                      className="mt-3 w-full py-3 rounded-xl border-2 border-red-200 text-red-600 font-black text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all"
                    >
                      Eliminar Egreso
                    </button>
                  )}

                  {/* Aviso si ya está anulada */}
                  {movimientoSeleccionado.estado === "ANULADA" && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <p className="text-[9px] font-black text-red-600 uppercase tracking-widest">Factura Anulada</p>
                      <p className="text-[10px] text-red-400 font-bold mt-0.5">
                        {movimientoSeleccionado.motivoAnulacion || "Sin motivo registrado"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* MODAL CONFIRMACIÓN ANULACIÓN */}
      {mostrarConfirmAnular && movimientoSeleccionado && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMostrarConfirmAnular(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="mb-4">
              <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Confirmar Anulación</p>
              <h3 className="text-lg font-black text-[#1a2b3c] uppercase tracking-tighter">
                {movimientoSeleccionado.nroFactura}
              </h3>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                $ {Number(movimientoSeleccionado.valor).toLocaleString("es-CO")} · {movimientoSeleccionado.cliente || "—"}
              </p>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 space-y-1 text-[10px] text-red-600 font-bold">
              <p>✓ La factura quedará marcada como ANULADA</p>
              <p>✓ El stock de los productos se restaurará</p>
              {(movimientoSeleccionado.tipoVenta === "CRÉDITO" || movimientoSeleccionado.tipoPago === "CRÉDITO") && (
                <p>✓ Se revertirá el cargo en CXC</p>
              )}
              <p>✓ No contará en el total de ventas</p>
            </div>

            <div className="mb-4">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                Motivo de anulación
              </label>
              <input
                autoFocus
                value={motivoAnulacion}
                onChange={e => setMotivoAnulacion(e.target.value)}
                placeholder="Ej: Error en factura, devolución del cliente..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-red-300"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setMostrarConfirmAnular(false); setMotivoAnulacion(""); }}
                className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-xl font-black uppercase text-[10px]"
              >
                Cancelar
              </button>
              <button
                onClick={anularFactura}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black uppercase text-[10px] hover:bg-red-700 transition-all"
              >
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}