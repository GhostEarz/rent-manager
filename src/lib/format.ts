const inr = new Intl.NumberFormat("en-IN");
export const rupees = (n: number | string | null | undefined) => `₹${inr.format(Number(n ?? 0))}`;

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

export const waLink = (phone: string | null | undefined, text: string) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const num = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
};
