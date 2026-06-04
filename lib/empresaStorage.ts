/**
 * config_empresa namespaced by companyId to prevent cross-company data leaks.
 * All reads/writes go through these helpers instead of direct localStorage access.
 */

const ACTIVE_KEY = "smartpos_active_company";
const PREFIX     = "config_empresa";

export function setActiveCompany(companyId: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(ACTIVE_KEY, companyId); } catch {}
}

function configKey(): string {
  if (typeof window === "undefined") return `${PREFIX}__none`;
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    return id ? `${PREFIX}_${id}` : `${PREFIX}__none`;
  } catch { return `${PREFIX}__none`; }
}

export function getEmpresaConfig(): Record<string, any> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(configKey()) || "{}"); }
  catch { return {}; }
}

export function setEmpresaConfig(data: Record<string, any>): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(configKey(), JSON.stringify(data)); } catch {}
}

export function patchEmpresaConfig(patch: Record<string, any>): void {
  setEmpresaConfig({ ...getEmpresaConfig(), ...patch });
}
