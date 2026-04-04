/** Simple seat fare band: base + per km × road distance (metres) */
const BASE_FARE = 25;
const PER_KM = 10;

export function fareRangeFromDistanceMeters(distanceM: number): { low: number; high: number } {
  const km = Math.max(0, distanceM / 1000);
  const mid = BASE_FARE + PER_KM * km;
  return { low: Math.max(15, Math.round(mid * 0.88)), high: Math.max(20, Math.round(mid * 1.12)) };
}

export function formatFareRange(distanceM: number): string {
  const { low, high } = fareRangeFromDistanceMeters(distanceM);
  return `₹${low} – ₹${high}`;
}
