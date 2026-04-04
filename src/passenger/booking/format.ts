import type { Coords } from "./types";

export const fmtDuration = (s: number) => {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export const fmtDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

export const isValid = (n: number) => !isNaN(n) && isFinite(n) && n !== 0;

/** Haversine metres — used only as fallback when directions API has no distance */
export const haversineDistance = (a: Coords, b: Coords): number => {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aCos =
    sinDLat * sinDLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(aCos), Math.sqrt(1 - aCos));
};
