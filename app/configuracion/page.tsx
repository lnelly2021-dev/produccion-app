"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  Settings, Building2, MapPin, Users, Cpu, Plus, Trash2,
  Pencil, Check, X, ChevronRight, Loader2, ShieldCheck,
  UserPlus, AlertTriangle, Globe, Lock,
} from "lucide-react";
import api from "../../lib/api";
import { AxiosError } from "axios";
import { patchEmpresaConfig } from "../../lib/empresaStorage";
import { toast } from "../../lib/toaster";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useAuth } from "../../contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  _id: string; name: string; taxId?: string;
  address?: string; phone?: string; email?: string;
  accessRole: string;
}
interface Branch {
  _id: string; name: string; address?: string; phone?: string; active: boolean;
}
interface Member {
  _id: string;
  user: { _id: string; name: string; email: string; role: string };
  role: "admin" | "manager" | "cashier";
  allBranches: boolean;
  branches: { _id: string; name: string }[];
}

type Tab = "company" | "branches" | "members" | "pos" | "tributario";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", manager: "Gerente", cashier: "Cajero",
};
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  cashier: "bg-green-100 text-green-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown, fallback = "Unexpected error"): string {
  return (e as AxiosError<{ error: string }>)?.response?.data?.error ?? fallback;
}

function Input({ label, value, onChange, placeholder, type = "text", disabled }: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</label>
      <input
        type={type} value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium text-gray-800 placeholder-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 transition-colors"
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const confirm = useConfirm();
  const { branch: activeBranch, company: activeCompany } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<Company | null>(null);
  const [tab, setTab] = useState<Tab>("company");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ── branches state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: "", address: "", phone: "" });
  const [editBranch, setEditBranch] = useState<Branch | null>(null);

  // ── members state
  const [members, setMembers] = useState<Member[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [newMember, setNewMember] = useState({
    email: "", role: "cashier" as Member["role"],
    allBranches: false, branchIds: [] as string[],
  });
  const [newMemberCreate, setNewMemberCreate] = useState({ name: "", email: "", password: "" });
  const [memberMode, setMemberMode] = useState<"existing"|"create">("existing");
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);

  // ── company form state
  const [companyForm, setCompanyForm] = useState({
    name: "", taxId: "", address: "", ciudad: "", phone: "", email: "", logo: "",
    facturacion: { resolucion: "", prefijo: "", rangoDesde: "", rangoHasta: "", fechaVigencia: "" },
    propinas: { activo: false, porcentaje: 10, aplicarAntes: false },
  });
  const [tributarioForm, setTributarioForm] = useState({
    tipoActividad: "RESTAURANTE",
    tipoImpuesto: "NINGUNO",
    regimenEmpresa: "NO_RESPONSABLE_IVA",
  });
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompanyForm, setNewCompanyForm] = useState({ name: "", taxId: "", address: "", phone: "", email: "" });

  // ── POS (localStorage)
  const [bancos, setBancos] = useState<string[]>(["NEQUI", "BANCOLOMBIA", "DAVIPLATA"]);
  const [baseCaja, setBaseCaja] = useState(0);
  const [nuevoBanco, setNuevoBanco] = useState("");
  const [qrPago, setQrPago] = useState("");

  // ── flash helpers
  const flash = (msg: string, isError = false) => {
    if (isError) { setError(msg); setSuccess(""); }
    else { setSuccess(msg); setError(""); }
    setTimeout(() => { setError(""); setSuccess(""); }, 3500);
  };

  // ── Load companies
  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/companies");
      const list: Company[] = data.data;
      setCompanies(list);
      if (list.length && !selected) setSelected(list[0]);
    } catch (e) { flash(errMsg(e, "Error loading companies"), true); }
    finally { setLoading(false); }
  }, [selected]);

  useEffect(() => { fetchCompanies(); }, []);

  // ── Sync company form when selection changes
  useEffect(() => {
    if (selected) {
      const s = selected as Company & {
        ciudad?: string; logo?: string;
        facturacion?: { resolucion: string; prefijo: string; rangoDesde: string; rangoHasta: string; fechaVigencia: string };
        propinas?: { activo: boolean; porcentaje: number; aplicarAntes: boolean };
        tributario?: { tipoActividad: string; tipoImpuesto: string; regimenEmpresa?: string };
      };
      setCompanyForm({
        name: s.name ?? "",
        taxId: s.taxId ?? "",
        address: s.address ?? "",
        ciudad: s.ciudad ?? "",
        phone: s.phone ?? "",
        email: s.email ?? "",
        logo: s.logo ?? "",
        facturacion: s.facturacion ?? { resolucion: "", prefijo: "", rangoDesde: "", rangoHasta: "", fechaVigencia: "" },
        propinas: s.propinas ?? { activo: false, porcentaje: 10, aplicarAntes: false },
      });
      setTributarioForm({
        tipoActividad:  s.tributario?.tipoActividad  ?? "RESTAURANTE",
        tipoImpuesto:   s.tributario?.tipoImpuesto   ?? "NINGUNO",
        regimenEmpresa: s.tributario?.regimenEmpresa ?? "NO_RESPONSABLE_IVA",
      });
      setTab("company");
    }
  }, [selected?._id]);

  // ── Load branches when tab changes
  useEffect(() => {
    if (tab === "branches" && selected) fetchBranches();
    if (tab === "members" && selected) fetchMembers();
  }, [tab, selected?._id]);

  // ── POS localStorage + API
  useEffect(() => {
    const b = localStorage.getItem("lista_bancos");
    if (b) setBancos(JSON.parse(b));
    const base = localStorage.getItem("base_caja");
    if (base) setBaseCaja(Number(base));
    const qr = localStorage.getItem("qr_pago");
    if (qr) setQrPago(qr);
    if (activeCompany?.id && activeBranch?.id) {
      api.get(`/companies/${activeCompany.id}/branches/${activeBranch.id}`)
        .then(r => {
          const apiBancos: string[] = r.data.data?.bancos ?? r.data?.bancos ?? [];
          if (apiBancos.length > 0) setBancos(apiBancos);
        })
        .catch(() => {});
    }
  }, [activeCompany?.id, activeBranch?.id]);

  const savePOS = () => {
    localStorage.setItem("lista_bancos", JSON.stringify(bancos));
    localStorage.setItem("base_caja", String(baseCaja));
    if (qrPago.trim()) localStorage.setItem("qr_pago", qrPago.trim());
    else localStorage.removeItem("qr_pago");
    // Actualizar config_empresa con el QR
    patchEmpresaConfig({ qrPago: qrPago.trim() });
    if (activeCompany?.id && activeBranch?.id) {
      api.put(`/companies/${activeCompany.id}/branches/${activeBranch.id}`, { bancos })
        .catch(() => {});
    }
    flash("POS settings saved");
  };

  // ── Branches
  const fetchBranches = async () => {
    if (!selected) return;
    setBranchLoading(true);
    try {
      const { data } = await api.get(`/companies/${selected._id}/branches`);
      setBranches(data.data);
    } catch (e) { flash(errMsg(e, "Error loading branches"), true); }
    finally { setBranchLoading(false); }
  };

  const createBranch = async () => {
    if (!newBranch.name.trim() || !selected) return;
    setSaving(true);
    try {
      await api.post(`/companies/${selected._id}/branches`, newBranch);
      setNewBranch({ name: "", address: "", phone: "" });
      await fetchBranches();
      flash("Branch created");
    } catch (e) { flash(errMsg(e, "Error creating branch"), true); }
    finally { setSaving(false); }
  };

  const saveBranch = async () => {
    if (!editBranch || !selected) return;
    setSaving(true);
    try {
      await api.put(`/companies/${selected._id}/branches/${editBranch._id}`, {
        name: editBranch.name, address: editBranch.address, phone: editBranch.phone,
      });
      setEditBranch(null);
      await fetchBranches();
      flash("Branch updated");
    } catch (e) { flash(errMsg(e, "Error updating branch"), true); }
    finally { setSaving(false); }
  };

  const deleteBranch = async (branchId: string) => {
    if (!selected || !await confirm("Delete this branch?")) return;
    try {
      await api.delete(`/companies/${selected._id}/branches/${branchId}`);
      await fetchBranches();
      flash("Branch deleted");
    } catch (e) { flash(errMsg(e, "Error deleting branch"), true); }
  };

  // ── Members
  const fetchMembers = async () => {
    if (!selected) return;
    setMemberLoading(true);
    try {
      const { data } = await api.get(`/companies/${selected._id}/members`);
      setMembers(data.data);
    } catch (e) { flash(errMsg(e, "Error loading members"), true); }
    finally { setMemberLoading(false); }
  };

  const addMember = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      if (memberMode === "create") {
        if (!newMemberCreate.name.trim() || !newMemberCreate.email.trim() || !newMemberCreate.password.trim())
          return flash("Completa nombre, correo y contraseña", true);
        await api.post(`/companies/${selected._id}/members/create`, {
          ...newMemberCreate, role: newMember.role,
          branchIds: newMember.branchIds, allBranches: newMember.allBranches,
        });
        setNewMemberCreate({ name: "", email: "", password: "" });
      } else {
        if (!newMember.email.trim()) return flash("Ingresa el correo del usuario", true);
        await api.post(`/companies/${selected._id}/members`, newMember);
      }
      setNewMember({ email: "", role: "cashier", allBranches: false, branchIds: [] });
      setShowMemberForm(false); setMemberMode("existing");
      await fetchMembers();
      flash("Miembro agregado correctamente");
    } catch (e) { flash(errMsg(e, "Error al agregar miembro"), true); }
    finally { setSaving(false); }
  };

  const saveMember = async () => {
    if (!editMember || !selected) return;
    setSaving(true);
    try {
      await api.put(`/companies/${selected._id}/members/${editMember.user._id}`, {
        role: editMember.role,
        allBranches: editMember.allBranches,
        branchIds: editMember.branches.map(b => b._id),
      });
      setEditMember(null);
      await fetchMembers();
      flash("Member updated");
    } catch (e) { flash(errMsg(e, "Error updating member"), true); }
    finally { setSaving(false); }
  };

  const removeMember = async (userId: string) => {
    if (!selected || !await confirm("Remove this member from the company?")) return;
    try {
      await api.delete(`/companies/${selected._id}/members/${userId}`);
      await fetchMembers();
      flash("Member removed");
    } catch (e) { flash(errMsg(e, "Error removing member"), true); }
  };

  // ── Company actions
  const saveCompany = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/companies/${selected._id}`, companyForm);
      await fetchCompanies();
      setSelected({ ...selected, ...data.data });
      patchEmpresaConfig({
        nombreEmpresa: companyForm.name,
        nit: companyForm.taxId,
        direccion: companyForm.address,
        ciudad: companyForm.ciudad,
        telefono: companyForm.phone,
        email: companyForm.email,
        logo: companyForm.logo || "",
        facturacion: companyForm.facturacion,
        propinas: companyForm.propinas,
      });
      flash("Company saved");
    } catch (e) { flash(errMsg(e, "Error saving company"), true); }
    finally { setSaving(false); }
  };

  const saveTributario = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/companies/${selected._id}`, { tributario: tributarioForm });
      patchEmpresaConfig({ tributario: tributarioForm });
      flash("Configuración tributaria guardada");
    } catch (e) { flash(errMsg(e, "Error saving tributario config"), true); }
    finally { setSaving(false); }
  };

  const createCompany = async () => {
    if (!newCompanyForm.name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post("/companies", newCompanyForm);
      setNewCompanyForm({ name: "", taxId: "", address: "", phone: "", email: "" });
      setShowNewCompany(false);
      await fetchCompanies();
      setSelected({ ...data.data, accessRole: "admin" });
      flash("Company created");
    } catch (e) { flash(errMsg(e, "Error creating company"), true); }
    finally { setSaving(false); }
  };

  // ── Branch toggle for member edit
  const toggleBranchOnMember = (branch: { _id: string; name: string }) => {
    if (!editMember) return;
    const already = editMember.branches.some(b => b._id === branch._id);
    setEditMember({
      ...editMember,
      branches: already
        ? editMember.branches.filter(b => b._id !== branch._id)
        : [...editMember.branches, branch],
    });
  };

  // ── Branch toggle for new member form
  const toggleNewMemberBranch = (branchId: string) => {
    setNewMember(prev => ({
      ...prev,
      branchIds: prev.branchIds.includes(branchId)
        ? prev.branchIds.filter(id => id !== branchId)
        : [...prev.branchIds, branchId],
    }));
  };

  // ─────────────────────────── RENDER ───────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <h1 className="text-lg font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2 mt-2">
          <Settings size={18} /> Configuración del Sistema
        </h1>

        {/* Flash messages */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium flex items-center gap-2">
            <X size={14} /> {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-600 font-medium flex items-center gap-2">
            <Check size={14} /> {success}
          </div>
        )}

        {/* ── Company Selector ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Mis Empresas</p>
          <div className="flex flex-wrap gap-2">
            {companies.map(c => (
              <button
                key={c._id}
                onClick={() => setSelected(c)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all flex items-center gap-2 ${
                  selected?._id === c._id
                    ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                <Building2 size={12} />
                {c.name}
                <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded-md ${
                  selected?._id === c._id ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
                }`}>{c.accessRole}</span>
              </button>
            ))}
            <button
              onClick={() => setShowNewCompany(v => !v)}
              className="px-4 py-2 rounded-xl text-xs font-bold border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-all flex items-center gap-1"
            >
              <Plus size={12} /> Nueva Empresa
            </button>
          </div>

          {/* New company inline form */}
          {showNewCompany && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Nueva Empresa</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Nombre Empresa *" value={newCompanyForm.name} onChange={v => setNewCompanyForm(p => ({ ...p, name: v }))} placeholder="Mi Empresa S.A.S" />
                <Input label="NIT / Tax ID" value={newCompanyForm.taxId} onChange={v => setNewCompanyForm(p => ({ ...p, taxId: v }))} placeholder="900.000.000-1" />
                <Input label="Dirección" value={newCompanyForm.address} onChange={v => setNewCompanyForm(p => ({ ...p, address: v }))} placeholder="Calle 13 #65-99" />
                <Input label="Teléfono" value={newCompanyForm.phone} onChange={v => setNewCompanyForm(p => ({ ...p, phone: v }))} placeholder="+57 300 000 0000" />
                <Input label="Correo Electrónico" type="email" value={newCompanyForm.email} onChange={v => setNewCompanyForm(p => ({ ...p, email: v }))} placeholder="empresa@correo.com" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={createCompany} disabled={saving || !newCompanyForm.name.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Crear
                </button>
                <button onClick={() => setShowNewCompany(false)} className="px-5 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-black hover:bg-gray-200">Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────── */}
        {selected && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Tab bar */}
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {([ ["company", Building2, "Empresa"], ["branches", MapPin, "Sucursales"],
                  ["members", Users, "Miembros"], ["pos", Cpu, "Config. POS"],
                  ["tributario", Globe, "Tributario"],
              ] as [Tab, React.ElementType, string][]).map(([key, Icon, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
                    tab === key
                      ? "border-blue-600 text-blue-600 bg-blue-50/50"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <div className="p-6">

              {/* ══ TAB: COMPANY INFO ══════════════════════════════ */}
              {tab === "company" && (
                <div className="space-y-6">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Edit — {selected.name}
                  </p>

                  {/* ── Sección 1: Datos Generales */}
                  <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Datos Generales</p>

                    {/* Logo upload */}
                    <div className="mb-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Logo de la empresa</label>
                      <div className="flex items-center gap-4">
                        {companyForm.logo && (
                          <img src={companyForm.logo} alt="Logo" className="w-16 h-16 object-contain rounded-xl border-2 border-gray-100 bg-gray-50" />
                        )}
                        <label className="cursor-pointer px-4 py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs font-black text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-all">
                          {companyForm.logo ? "Cambiar logo" : "Subir logo"}
                          <input type="file" accept="image/*" className="hidden" onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => setCompanyForm(p => ({ ...p, logo: ev.target?.result as string ?? "" }));
                            reader.readAsDataURL(file);
                          }} />
                        </label>
                        {companyForm.logo && (
                          <button onClick={() => setCompanyForm(p => ({ ...p, logo: "" }))} className="text-xs text-red-400 hover:text-red-600 font-black">Quitar</button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Nombre Empresa *" value={companyForm.name} onChange={v => setCompanyForm(p => ({ ...p, name: v }))} />
                      <Input label="NIT / Tax ID" value={companyForm.taxId} onChange={v => setCompanyForm(p => ({ ...p, taxId: v }))} placeholder="900.000.000-1" />
                      <Input label="Dirección" value={companyForm.address} onChange={v => setCompanyForm(p => ({ ...p, address: v }))} placeholder="Calle 13 #65-99" />
                      <Input label="Ciudad" value={companyForm.ciudad} onChange={v => setCompanyForm(p => ({ ...p, ciudad: v }))} placeholder="Cali" />
                      <Input label="Teléfono" value={companyForm.phone} onChange={v => setCompanyForm(p => ({ ...p, phone: v }))} placeholder="+57 300 000 0000" />
                      <Input label="Correo Electrónico" type="email" value={companyForm.email} onChange={v => setCompanyForm(p => ({ ...p, email: v }))} placeholder="empresa@correo.com" />
                    </div>
                  </div>

                  {/* ── Sección 2: Facturación */}
                  <div className="border-t border-gray-100 pt-6 mt-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Facturación</p>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Resolución" value={companyForm.facturacion.resolucion} onChange={v => setCompanyForm(p => ({ ...p, facturacion: { ...p.facturacion, resolucion: v } }))} placeholder="18764000001" />
                      <Input label="Prefijo" value={companyForm.facturacion.prefijo} onChange={v => setCompanyForm(p => ({ ...p, facturacion: { ...p.facturacion, prefijo: v } }))} placeholder="e.g. FE, FV" />
                      <Input label="Rango Desde" value={companyForm.facturacion.rangoDesde} onChange={v => setCompanyForm(p => ({ ...p, facturacion: { ...p.facturacion, rangoDesde: v } }))} placeholder="00001" />
                      <Input label="Rango Hasta" value={companyForm.facturacion.rangoHasta} onChange={v => setCompanyForm(p => ({ ...p, facturacion: { ...p.facturacion, rangoHasta: v } }))} placeholder="99999" />
                      <Input label="Fecha Vigencia" type="date" value={companyForm.facturacion.fechaVigencia} onChange={v => setCompanyForm(p => ({ ...p, facturacion: { ...p.facturacion, fechaVigencia: v } }))} />
                    </div>
                  </div>

                  {/* ── Sección 3: Propinas */}
                  <div className="border-t border-gray-100 pt-6 mt-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Propinas</p>
                    <div className="flex items-center gap-3 mb-4">
                      <button
                        onClick={() => setCompanyForm(p => ({ ...p, propinas: { ...p.propinas, activo: !p.propinas.activo } }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${companyForm.propinas.activo ? "bg-blue-600" : "bg-gray-200"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${companyForm.propinas.activo ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                      <span className="text-sm font-bold text-gray-700">Aplicar propina</span>
                    </div>
                    {companyForm.propinas.activo && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">% por defecto</label>
                          <input
                            type="number" min={0} max={100}
                            value={companyForm.propinas.porcentaje}
                            onChange={e => setCompanyForm(p => ({ ...p, propinas: { ...p.propinas, porcentaje: Number(e.target.value) } }))}
                            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium text-gray-800 focus:border-blue-500 focus:outline-none transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Calcular sobre...</label>
                          <select
                            value={String(companyForm.propinas.aplicarAntes)}
                            onChange={e => setCompanyForm(p => ({ ...p, propinas: { ...p.propinas, aplicarAntes: e.target.value === "true" } }))}
                            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium text-gray-800 focus:border-blue-500 focus:outline-none transition-colors"
                          >
                            <option value="true">Subtotal (antes de impuestos)</option>
                            <option value="false">Total (después de impuestos)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <button onClick={saveCompany} disabled={saving || selected.accessRole !== "admin"}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Guardar Cambios
                    </button>
                    {selected.accessRole !== "admin" && (
                      <p className="text-[10px] text-gray-400 mt-2">Solo los administradores pueden editar los datos de la empresa.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ══ TAB: BRANCHES ══════════════════════════════════ */}
              {tab === "branches" && (
                <div className="space-y-4">
                  {branchLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>
                  ) : (
                    <>
                      {/* Branch list */}
                      <div className="space-y-2">
                        {branches.length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-6">Sin sucursales. Agrega una abajo.</p>
                        )}
                        {branches.map(branch => (
                          <div key={branch._id} className="border border-gray-100 rounded-xl p-4">
                            {editBranch?._id === branch._id ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                  <Input label="Nombre" value={editBranch.name} onChange={v => setEditBranch({ ...editBranch, name: v })} />
                                  <Input label="Dirección" value={editBranch.address ?? ""} onChange={v => setEditBranch({ ...editBranch, address: v })} />
                                  <Input label="Teléfono" value={editBranch.phone ?? ""} onChange={v => setEditBranch({ ...editBranch, phone: v })} />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={saveBranch} disabled={saving} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-black flex items-center gap-1">
                                    {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Guardar
                                  </button>
                                  <button onClick={() => setEditBranch(null)} className="px-4 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-black">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <MapPin size={13} className="text-blue-500" /> {branch.name}
                                  </p>
                                  {branch.address && <p className="text-xs text-gray-400 ml-5">{branch.address}</p>}
                                  {branch.phone && <p className="text-xs text-gray-400 ml-5">{branch.phone}</p>}
                                </div>
                                {selected.accessRole === "admin" && (
                                  <div className="flex gap-2">
                                    <button onClick={() => setEditBranch(branch)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Pencil size={14} /></button>
                                    <button onClick={() => deleteBranch(branch._id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add branch form */}
                      {selected.accessRole === "admin" && (
                        <div className="border-t border-gray-100 pt-4 space-y-3">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Agregar Sucursal</p>
                          <div className="grid grid-cols-3 gap-3">
                            <Input label="Nombre *" value={newBranch.name} onChange={v => setNewBranch(p => ({ ...p, name: v }))} placeholder="Sede Norte" />
                            <Input label="Dirección" value={newBranch.address} onChange={v => setNewBranch(p => ({ ...p, address: v }))} placeholder="Calle 45 #12-30" />
                            <Input label="Teléfono" value={newBranch.phone} onChange={v => setNewBranch(p => ({ ...p, phone: v }))} placeholder="+57 300 111 2222" />
                          </div>
                          <button onClick={createBranch} disabled={saving || !newBranch.name.trim()}
                            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Agregar Sucursal
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ══ TAB: MEMBERS ══════════════════════════════════ */}
              {tab === "members" && (
                <div className="space-y-4">
                  {memberLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>
                  ) : (
                    <>
                      {/* Member list */}
                      <div className="space-y-2">
                        {members.length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-6">Sin miembros aún.</p>
                        )}
                        {members.map(m => (
                          <div key={m._id} className="border border-gray-100 rounded-xl p-4">
                            {editMember?._id === m._id ? (
                              <div className="space-y-3">
                                <p className="text-sm font-bold text-gray-700">{m.user.name} — {m.user.email}</p>
                                {/* Role */}
                                <div>
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rol</label>
                                  <div className="flex gap-2 mt-1">
                                    {(["admin","manager","cashier"] as Member["role"][]).map(r => (
                                      <button key={r} onClick={() => setEditMember({ ...editMember, role: r })}
                                        className={`px-3 py-1 rounded-lg text-xs font-black capitalize border-2 transition-all ${
                                          editMember.role === r ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"
                                        }`}>{ROLE_LABELS[r]}</button>
                                    ))}
                                  </div>
                                </div>
                                {/* Branch access */}
                                <div>
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Acceso a Sucursales</label>
                                  <div className="flex gap-2 mt-1 mb-2">
                                    <button onClick={() => setEditMember({ ...editMember, allBranches: true })}
                                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black border-2 transition-all ${editMember.allBranches ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                                      <Globe size={10} /> Todas las Sucursales
                                    </button>
                                    <button onClick={() => setEditMember({ ...editMember, allBranches: false })}
                                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black border-2 transition-all ${!editMember.allBranches ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                                      <Lock size={10} /> Sucursales Específicas
                                    </button>
                                  </div>
                                  {!editMember.allBranches && (
                                    <div className="flex flex-wrap gap-2">
                                      {branches.map(b => {
                                        const active = editMember.branches.some(eb => eb._id === b._id);
                                        return (
                                          <button key={b._id} onClick={() => toggleBranchOnMember(b)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-all ${active ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-500"}`}>
                                            {b.name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={saveMember} disabled={saving} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-black flex items-center gap-1">
                                    {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Guardar
                                  </button>
                                  <button onClick={() => setEditMember(null)} className="px-4 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-black">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                    <span className="text-[11px] font-black text-blue-600">{m.user.name.charAt(0).toUpperCase()}</span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-gray-800">{m.user.name}</p>
                                    <p className="text-xs text-gray-400">{m.user.email}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase ${ROLE_COLORS[m.role]}`}>{ROLE_LABELS[m.role]}</span>
                                      {m.allBranches ? (
                                        <span className="flex items-center gap-1 text-[9px] font-bold text-gray-400"><Globe size={9}/> Todas las sucursales</span>
                                      ) : (
                                        <span className="flex items-center gap-1 text-[9px] font-bold text-gray-400">
                                          <Lock size={9}/> {m.branches.map(b => b.name).join(", ") || "Sin sucursales"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {selected.accessRole === "admin" && (
                                  <div className="flex gap-2">
                                    <button onClick={() => setEditMember(m)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Pencil size={14} /></button>
                                    <button onClick={() => removeMember(m.user._id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add member form */}
                      {selected.accessRole === "admin" && (
                        <div className="border-t border-gray-100 pt-4">
                          {!showMemberForm ? (
                            <button onClick={() => setShowMemberForm(true)}
                              className="flex items-center gap-2 px-5 py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs font-black text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-all">
                              <UserPlus size={13} /> Agregar Miembro
                            </button>
                          ) : (
                            <div className="space-y-4 bg-gray-50 rounded-xl p-4">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Agregar Miembro</p>
                              {/* Toggle: usuario existente vs crear nuevo */}
                              <div className="flex gap-2">
                                <button onClick={() => setMemberMode("existing")}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all ${memberMode==="existing" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                                  Ya tiene cuenta
                                </button>
                                <button onClick={() => setMemberMode("create")}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all ${memberMode==="create" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                                  + Crear nuevo usuario
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                {memberMode === "create" ? (<>
                                  <Input label="Nombre Completo *" value={newMemberCreate.name} onChange={v => setNewMemberCreate(p => ({...p, name: v}))} placeholder="María García" />
                                  <Input label="Correo *" type="email" value={newMemberCreate.email} onChange={v => setNewMemberCreate(p => ({...p, email: v}))} placeholder="maria@correo.com" />
                                  <Input label="Contraseña *" type="password" value={newMemberCreate.password} onChange={v => setNewMemberCreate(p => ({...p, password: v}))} placeholder="Mínimo 6 caracteres" />
                                </>) : (
                                  <Input label="Correo del Usuario *" type="email" value={newMember.email} onChange={v => setNewMember(p => ({ ...p, email: v }))} placeholder="usuario@correo.com" />
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rol</label>
                                  <div className="flex gap-2 mt-1">
                                    {(["admin","manager","cashier"] as Member["role"][]).map(r => (
                                      <button key={r} onClick={() => setNewMember(p => ({ ...p, role: r }))}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all ${newMember.role === r ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                                        {ROLE_LABELS[r]}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              {/* Branch access */}
                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Acceso a Sucursales</label>
                                <div className="flex gap-2 mt-1 mb-2">
                                  <button onClick={() => setNewMember(p => ({ ...p, allBranches: true }))}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black border-2 transition-all ${newMember.allBranches ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                                    <Globe size={10} /> Todas las Sucursales
                                  </button>
                                  <button onClick={() => setNewMember(p => ({ ...p, allBranches: false }))}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black border-2 transition-all ${!newMember.allBranches ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                                    <Lock size={10} /> Sucursales Específicas
                                  </button>
                                </div>
                                {!newMember.allBranches && (
                                  <div className="flex flex-wrap gap-2">
                                    {branches.map(b => {
                                      const active = newMember.branchIds.includes(b._id);
                                      return (
                                        <button key={b._id} onClick={() => toggleNewMemberBranch(b._id)}
                                          className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-all ${active ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-500"}`}>
                                          {b.name}
                                        </button>
                                      );
                                    })}
                                    {branches.length === 0 && <p className="text-xs text-gray-400">Sin sucursales creadas aún.</p>}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={addMember} disabled={saving || !newMember.email.trim()}
                                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                                  {saving ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Agregar Miembro
                                </button>
                                <button onClick={() => setShowMemberForm(false)} className="px-5 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-black hover:bg-gray-200">Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ══ TAB: TRIBUTARIO ════════════════════════════════ */}
              {tab === "tributario" && (
                <div className="space-y-6">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Configuración Tributaria</p>

                  {/* Tipo de actividad */}
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tipo de Actividad Económica</label>
                    <select
                      value={tributarioForm.tipoActividad}
                      onChange={e => setTributarioForm(p => ({ ...p, tipoActividad: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium text-gray-800 focus:border-blue-500 focus:outline-none transition-colors"
                    >
                      <option value="RESTAURANTE">Restaurante / Comidas Rápidas</option>
                      <option value="MANUFACTURA">Manufactura</option>
                      <option value="SERVICIOS">Servicios</option>
                      <option value="COMERCIO">Comercio al por menor</option>
                      <option value="OTRO">Otro</option>
                    </select>
                  </div>

                  {/* Tipo de impuesto */}
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Régimen de Impuesto</label>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      {([
                        { value: "IVA_19", label: "IVA 19%", desc: "Impuesto al valor agregado" },
                        { value: "IPC_8", label: "IpoConsumo 8%", desc: "Impuesto al consumo" },
                        { value: "EXENTO", label: "Exento / Excluido", desc: "Sin cobro de impuesto" },
                        { value: "NINGUNO", label: "Ninguno", desc: "No aplica régimen especial" },
                      ] as { value: string; label: string; desc: string }[]).map(opt => (
                        <div
                          key={opt.value}
                          onClick={() => setTributarioForm(p => ({ ...p, tipoImpuesto: opt.value }))}
                          className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                            tributarioForm.tipoImpuesto === opt.value
                              ? "border-blue-600 bg-blue-50"
                              : "border-gray-100 hover:border-gray-200 bg-white"
                          }`}
                        >
                          <p className={`text-sm font-black ${tributarioForm.tipoImpuesto === opt.value ? "text-blue-700" : "text-gray-700"}`}>{opt.label}</p>
                          <p className={`text-[10px] mt-0.5 ${tributarioForm.tipoImpuesto === opt.value ? "text-blue-500" : "text-gray-400"}`}>{opt.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Régimen de la empresa */}
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Régimen de la Empresa</label>
                    <p className="text-[10px] text-gray-400 mb-3">Indica si la empresa es responsable de declarar y cobrar IVA. Requerido para factura electrónica.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { value: "NO_RESPONSABLE_IVA", label: "No Responsable de IVA", desc: "Régimen simple / pequeños negocios" },
                        { value: "RESPONSABLE_IVA",    label: "Responsable de IVA",    desc: "Declara y recauda IVA ante la DIAN" },
                      ] as { value: string; label: string; desc: string }[]).map(opt => (
                        <div key={opt.value}
                          onClick={() => setTributarioForm(p => ({ ...p, regimenEmpresa: opt.value }))}
                          className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                            tributarioForm.regimenEmpresa === opt.value
                              ? "border-blue-600 bg-blue-50"
                              : "border-gray-100 hover:border-gray-200 bg-white"
                          }`}>
                          <p className={`text-sm font-black ${tributarioForm.regimenEmpresa === opt.value ? "text-blue-700" : "text-gray-700"}`}>{opt.label}</p>
                          <p className={`text-[10px] mt-0.5 ${tributarioForm.regimenEmpresa === opt.value ? "text-blue-500" : "text-gray-400"}`}>{opt.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={saveTributario} disabled={saving || selected.accessRole !== "admin"}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Guardar Configuración Tributaria
                  </button>
                  {selected.accessRole !== "admin" && (
                    <p className="text-[10px] text-gray-400 mt-2">Only company admins can edit company data.</p>
                  )}
                </div>
              )}

              {/* ══ TAB: POS SETTINGS ══════════════════════════════ */}
              {tab === "pos" && (
                <div className="space-y-6">
                  {/* Base cash */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Default Opening Cash</label>
                    <div className="flex items-center bg-gray-50 border-2 border-gray-100 rounded-xl px-4 mt-1 max-w-xs focus-within:border-blue-500">
                      <span className="text-gray-400 font-black mr-2">$</span>
                      <input type="number" value={baseCaja || ""} onChange={e => setBaseCaja(parseFloat(e.target.value) || 0)}
                        className="flex-1 py-2.5 bg-transparent font-bold text-sm outline-none" placeholder="200000" />
                    </div>
                  </div>

                  {/* Banks */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Available Banks / Payment Methods</label>
                    <div className="flex gap-2 max-w-sm">
                      <input value={nuevoBanco} onChange={e => setNuevoBanco(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && nuevoBanco.trim()) { setBancos(b => [...b, nuevoBanco.toUpperCase()]); setNuevoBanco(""); }}}
                        className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium focus:border-blue-500 focus:outline-none"
                        placeholder="DAVIVIENDA" />
                      <button onClick={() => { if (nuevoBanco.trim()) { setBancos(b => [...b, nuevoBanco.toUpperCase()]); setNuevoBanco(""); }}}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700">
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {bancos.map((b, i) => (
                        <span key={i} className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-xs font-black uppercase border border-blue-100 flex items-center gap-2">
                          {b}
                          <button onClick={() => setBancos(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* QR de pago */}
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Pago con QR (Nequi / Bancolombia)</label>
                    <p className="text-[10px] text-gray-400 mb-2">Pega la URL de la imagen de tu código QR. Se mostrará al cliente durante el cobro.</p>
                    <input value={qrPago} onChange={e => setQrPago(e.target.value)}
                      placeholder="https://..." className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium focus:border-blue-500 focus:outline-none max-w-sm"
                    />
                    {qrPago && (
                      <div className="mt-3 w-32 h-32 border-2 border-gray-200 rounded-xl overflow-hidden flex items-center justify-center bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrPago} alt="QR Preview" className="w-full h-full object-contain" onError={e => (e.currentTarget.style.display = "none")} />
                      </div>
                    )}
                  </div>

                  <button onClick={savePOS} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 flex items-center gap-2">
                    <Check size={12} /> Save POS Settings
                  </button>

                  {/* Danger zone — Reset Operacional */}
                  <div className="mt-6 p-5 bg-red-50 rounded-2xl border border-red-100">
                    <div className="flex items-start gap-3">
                      <div className="bg-red-600 p-2 rounded-xl text-white"><AlertTriangle size={16} /></div>
                      <div className="flex-1">
                        <p className="text-red-800 font-black uppercase text-xs mb-1">Reset Operacional</p>
                        <p className="text-red-500 text-[10px] font-bold mb-1">
                          Borra ventas, egresos, domicilios, pedidos, cierres, recaudos, pasivos, cotizaciones y salidas.
                        </p>
                        <p className="text-emerald-700 text-[10px] font-bold mb-3">
                          ✓ Se conservan: productos (con recetas y fotos), contactos, configuración, usuarios y accesos.
                        </p>
                        <p className="text-slate-500 text-[10px] mb-3">
                          El stock se restaura al valor inicial de cada producto. El consecutivo vuelve a 1.
                        </p>
                        <button onClick={async () => {
                          if (!activeBranch?.id) { toast("error", "No hay sucursal activa"); return; }
                          if (!await confirm(
                            "¿Confirmar reset operacional? Se borrarán todas las ventas, egresos, cierres y movimientos. Productos, recetas y contactos NO se tocan.",
                            "Reset Operacional"
                          )) return;

                          try {
                            // 1. Limpiar MongoDB (ventas, egresos, pedidos, domicilios, cierres, etc.)
                            await api.post(`/branches/${activeBranch.id}/reset-operacional`);

                            // 2. Limpiar localStorage operacional
                            [
                              "movimientos","historial_mesas","pedidos","historial_cierres",
                              "turno_actual",`turno_actual_${activeBranch?.id}`,"otros_recaudos","cxc","cxp","domicilios",
                              "salidas_producto","carrito_activo",
                            ].forEach(k => localStorage.removeItem(k));
                            localStorage.setItem("ultimo_consecutivo", "0");

                            toast("success", "Reset completado. Próxima factura: #1");
                            setTimeout(() => window.location.reload(), 1500);
                          } catch {
                            toast("error", "Error al ejecutar el reset. Intenta de nuevo.");
                          }
                        }} className="px-5 py-2 bg-white text-red-600 border-2 border-red-200 rounded-xl text-xs font-black hover:bg-red-600 hover:text-white transition-all">
                          Ejecutar Reset Operacional
                        </button>
                        <button
                          onClick={async () => {
                            if (!activeBranch?.id) return;
                            try {
                              const { data } = await api.post(`/branches/${activeBranch.id}/products/restore-inactive`);
                              const r = data.data || data;
                              toast("success", `✓ ${r.reactivados} productos recuperados (${r.inactivosEncontrados} inactivos encontrados).`);
                            } catch {
                              toast("error", "Error al recuperar productos.");
                            }
                          }}
                          className="px-5 py-2 bg-white text-amber-600 border-2 border-amber-200 rounded-xl text-xs font-black hover:bg-amber-600 hover:text-white transition-all"
                        >
                          Recuperar Productos Eliminados
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Eliminar empresa */}
                  <div className="mt-4 p-5 bg-gray-900 rounded-2xl border border-gray-700">
                    <div className="flex items-start gap-3">
                      <div className="bg-gray-700 p-2 rounded-xl text-red-400"><AlertTriangle size={16} /></div>
                      <div className="flex-1">
                        <p className="text-gray-200 font-black uppercase text-xs mb-1">Eliminar Empresa</p>
                        <p className="text-gray-400 text-[10px] font-bold mb-3">
                          Desactiva la empresa. Los datos no se borran físicamente pero dejarán de ser accesibles.
                        </p>
                        <button onClick={async () => {
                          if (!selected?._id) return;
                          if (!await confirm(`¿Eliminar la empresa "${selected.name}"? Esta acción no se puede deshacer fácilmente.`, "Eliminar Empresa")) return;
                          try {
                            await api.delete(`/companies/${selected._id}`);
                            toast("success", "Empresa eliminada. Recargando...");
                            setTimeout(() => window.location.reload(), 1500);
                          } catch {
                            toast("error", "Error al eliminar la empresa.");
                          }
                        }} className="px-5 py-2 bg-transparent text-red-400 border-2 border-red-800 rounded-xl text-xs font-black hover:bg-red-900 hover:text-white transition-all">
                          Eliminar Esta Empresa
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>
        )}

        {!selected && !loading && (
          <div className="text-center py-12 text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold">No companies found. Create your first one above.</p>
          </div>
        )}

      </div>
    </div>
  );
}
