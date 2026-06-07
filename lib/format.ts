export function formatINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function formatNum(n: number): string {
  return n.toLocaleString("en-IN");
}
