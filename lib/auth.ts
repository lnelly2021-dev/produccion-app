const TOKEN_KEY = "sp_access_token";
// 15 minutes in seconds (matches API JWT_EXPIRES_IN)
const TOKEN_MAX_AGE = 15 * 60;

export function saveAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  // Also store in a cookie so Next.js middleware can read it (non-httpOnly)
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${TOKEN_MAX_AGE}; SameSite=Lax`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
