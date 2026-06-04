"use client";
import { useState, useEffect } from "react";
import api from "./api";

type Tipo = "CLIENTE" | "PROVEEDOR" | "EMPLEADO";
const BASE_KEY: Record<Tipo, string> = {
  CLIENTE:   "clientes",
  PROVEEDOR: "proveedores",
  EMPLEADO:  "empleados",
};

function lsKey(tipo: Tipo, branchId: string) {
  return branchId ? `${BASE_KEY[tipo]}_${branchId}` : BASE_KEY[tipo];
}

function readLS(tipo: Tipo, branchId: string): any[] {
  try { return JSON.parse(localStorage.getItem(lsKey(tipo, branchId)) || "[]"); } catch { return []; }
}

export function useContactos(tipo: Tipo, branchId: string) {
  const [contactos, setContactos] = useState<any[]>([]);
  const [localPendientes, setLocalPendientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrando, setMigrando] = useState(false);

  // Normaliza: agrega alias nit → identificacion para que el form lo lea
  const normalizar = (c: any) => ({
    ...c,
    id:  c._id || c.id,
    nit: c.identificacion || c.nit || "",
  });

  useEffect(() => {
    // Show cached data immediately while API loads
    const cached = readLS(tipo, branchId);
    setContactos(cached);
    setLoading(true);

    if (!branchId) { setLoading(false); return; }

    api.get(`/branches/${branchId}/contactos?tipo=${tipo}`)
      .then(({ data }) => {
        const lista = (data.data || []).map(normalizar);
        setContactos(lista);
        if (lista.length > 0) {
          localStorage.setItem(lsKey(tipo, branchId), JSON.stringify(lista));
          setLocalPendientes([]);
        } else {
          // API returned empty — check if there are local items to migrate
          const local = readLS(tipo, branchId);
          if (local.length > 0) setLocalPendientes(local);
        }
      })
      .catch(() => {
        // On error, keep cached data (already set above)
      })
      .finally(() => setLoading(false));
  }, [branchId, tipo]);

  const migrar = async () => {
    if (!branchId || localPendientes.length === 0) return;
    setMigrando(true);
    const migrados: any[] = [];
    for (const c of localPendientes) {
      try {
        const { data } = await api.post(`/branches/${branchId}/contactos`, {
          nombre:         (c.nombre  || "").trim(),
          apellidos:      (c.apellidos || "").trim(),
          identificacion: (c.identificacion || c.nit || c.cedula || "").trim(),
          telefono:       (c.telefono || c.cel || "").trim(),
          email:          (c.email || "").trim(),
          direccion:      (c.direccion || "").trim(),
          cargo:          (c.cargo || "").trim(),
          salario:        Number(c.salario) || 0,
          tipo,
        });
        migrados.push(normalizar(data.data));
      } catch { /* continuar con el siguiente */ }
    }
    if (migrados.length > 0) {
      setContactos(migrados);
      localStorage.setItem(lsKey(tipo, branchId), JSON.stringify(migrados));
    }
    setLocalPendientes([]);
    setMigrando(false);
    return migrados.length;
  };

  const guardar = async (dto: any) => {
    const esEdicion = !!(dto.id || dto._id);
    const id = String(dto._id || dto.id || "");
    let nuevo: any;
    if (esEdicion && id) {
      const payload = { ...dto, identificacion: dto.nit ?? dto.identificacion ?? "" };
      const { data } = await api.put(`/branches/${branchId}/contactos/${id}`, payload);
      nuevo = normalizar(data.data);
      setContactos(prev => prev.map(c => String(c._id || c.id) === id ? nuevo : c));
    } else {
      const payload = { ...dto, identificacion: dto.nit ?? dto.identificacion ?? "", tipo };
      const { data } = await api.post(`/branches/${branchId}/contactos`, payload);
      nuevo = normalizar(data.data);
      setContactos(prev => [nuevo, ...prev]);
    }
    setContactos(prev => {
      localStorage.setItem(lsKey(tipo, branchId), JSON.stringify(prev));
      return prev;
    });
    return nuevo;
  };

  const eliminar = async (id: string) => {
    await api.delete(`/branches/${branchId}/contactos/${id}`);
    setContactos(prev => {
      const act = prev.filter(c => String(c._id || c.id) !== id);
      localStorage.setItem(lsKey(tipo, branchId), JSON.stringify(act));
      return act;
    });
  };

  const importar = (lista: any[]) => {
    setContactos(lista);
    localStorage.setItem(lsKey(tipo, branchId), JSON.stringify(lista));
  };

  const importarAPI = async (lista: any[]): Promise<number> => {
    if (!branchId || lista.length === 0) return 0;
    const creados: any[] = [];
    for (const c of lista) {
      try {
        const { data } = await api.post(`/branches/${branchId}/contactos`, {
          nombre:         (c.nombre  || "").trim(),
          apellidos:      (c.apellidos || "").trim(),
          identificacion: (c.identificacion || c.nit || c.cedula || "").trim(),
          telefono:       (c.telefono || c.cel || "").trim(),
          email:          (c.email || "").trim(),
          direccion:      (c.direccion || "").trim(),
          cargo:          (c.cargo || "").trim(),
          salario:        Number(c.salario) || 0,
          tipo,
        });
        creados.push(normalizar(data.data));
      } catch { /* continuar */ }
    }
    if (creados.length > 0) {
      setContactos(creados);
      localStorage.setItem(lsKey(tipo, branchId), JSON.stringify(creados));
    }
    return creados.length;
  };

  return { contactos, setContactos, loading, guardar, eliminar, importar, importarAPI, localPendientes, migrar, migrando };
}
