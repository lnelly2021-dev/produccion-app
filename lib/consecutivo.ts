import api from "./api";

/**
 * Obtiene el siguiente número consecutivo de facturación desde el backend.
 * El contador vive en MongoDB (Branch.consecutivo) y se incrementa atómicamente.
 * Si el servidor no responde, cae en el localStorage como último recurso.
 */
export async function getNextConsecutivo(branchId: string): Promise<number> {
  try {
    const { data } = await api.get(`/branches/${branchId}/ventas/consecutivo`);
    const num = data?.data?.consecutivo;
    if (num && num > 0) {
      // Sincronizar localStorage para que el fallback esté al día
      localStorage.setItem("ultimo_consecutivo", String(num));
      return num;
    }
  } catch { /* fallback a localStorage */ }

  // Fallback offline
  const local = parseInt(localStorage.getItem("ultimo_consecutivo") || "0") + 1;
  localStorage.setItem("ultimo_consecutivo", String(local));
  return local;
}
