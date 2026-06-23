function maskMobile(v: string): string { const c = v.replace(/\D/g, ''); return c.length < 7 ? v : c.slice(0, 3) + '****' + c.slice(-4); }
function maskName(v: string): string { return v.length <= 1 ? '*' : v[0] + '*'.repeat(v.length - 1); }
export function maskRecord(r: Record<string, any>): Record<string, any> { const m = { ...r }; if (m.displayName) m.displayName = maskName(String(m.displayName)); if (m.mobile) m.mobile = maskMobile(String(m.mobile)); return m; }
