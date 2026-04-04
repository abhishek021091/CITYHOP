import type { Coords, Route, ActiveRide } from "./types";
import { haversineDistance } from "./format";
import { fetchRoute } from "./mapplsApi";

export const DRIVER_MAX_DIST_FROM_PASSENGER_ROUTE_M = 2000;

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

/** Demo corridor when Directions API fails (still drawable on map). */
export function buildDemoRoute(origin: Coords, dest: Coords): Route {
  const dist = haversineDistance(origin, dest) || 1;
  const steps = 16;
  const coordinates: Coords[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    coordinates.push([
      origin[0] + (dest[0] - origin[0]) * t,
      origin[1] + (dest[1] - origin[1]) * t,
    ]);
  }
  const duration = Math.max(60, Math.round(dist / 7));
  return { distance: dist, duration, coordinates };
}

/** Static demo autos near pickup (testing). */
const DEMO_DRIVER_SPECS = [
  { id: "1", dLat: 0.002, dLng: 0.002, seats: 2, etaMin: 5, price: 80 },
  { id: "2", dLat: -0.003, dLng: 0.001, seats: 3, etaMin: 7, price: 70 },
] as const;

export function buildStaticDemoDriverRides(
  userLng: number,
  userLat: number,
  pickupName: string,
  dropName: string,
  pickup: Coords,
  drop: Coords,
  tripDistanceM: number
): ActiveRide[] {
  return DEMO_DRIVER_SPECS.map(s => {
    const lat = userLat + s.dLat;
    const lng = userLng + s.dLng;
    const driverMarker: Coords = [lng, lat];
    const pickupDistanceM = haversineDistance(pickup, driverMarker);
    const duration = s.etaMin * 60;
    const driverRoute: Coords[] = [driverMarker, drop];
    return {
      id: `demo_${s.id}`,
      driverUid: `demo_uid_${s.id}`,
      driverName: `Demo Driver ${s.id}`,
      autoNumber: `DEMO ${s.id}`,
      autoModel: "Tuk-tuk",
      phone: "00000 00000",
      origin: { name: pickupName, latitude: pickup[1], longitude: pickup[0] },
      destination: { name: dropName, latitude: drop[1], longitude: drop[0] },
      totalSeats: s.seats,
      bookedSeats: 0,
      farePerSeat: s.price,
      distance: tripDistanceM,
      duration,
      passengers: [],
      driverRoute,
      driverMarker,
      pickupDistanceM,
    };
  }).sort((a, b) => a.pickupDistanceM - b.pickupDistanceM);
}

/** Up to 3 attempts; on failure returns demo polyline + unavailable=true (UI never blocked). */
export async function resolvePassengerRoute(origin: Coords, dest: Coords): Promise<{ route: Route; unavailable: boolean }> {
  const attempts = 3;
  for (let a = 0; a < attempts; a++) {
    const api = await fetchRoute(origin, dest);
    if (api && api.coordinates.length > 1 && api.distance > 0) {
      return { route: api, unavailable: false };
    }
    if (a < attempts - 1) await sleep(450);
  }
  return { route: buildDemoRoute(origin, dest), unavailable: true };
}

function distPointToSegmentM(p: Coords, a: Coords, b: Coords): number {
  const ax = a[0],
    ay = a[1],
    bx = b[0],
    by = b[1];
  const px = p[0],
    py = p[1];
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return haversineDistance(p, a);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const q: Coords = [ax + t * dx, ay + t * dy];
  return haversineDistance(p, q);
}

export function minDistancePointToPolylineM(point: Coords, polyline: Coords[]): number {
  if (!polyline.length) return Infinity;
  if (polyline.length === 1) return haversineDistance(point, polyline[0]);
  let m = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    m = Math.min(m, distPointToSegmentM(point, polyline[i], polyline[i + 1]));
  }
  return m;
}

function nearestVertexToPoint(poly: Coords[], p: Coords): Coords {
  let best = poly[0];
  let bd = Infinity;
  for (const q of poly) {
    const d = haversineDistance(p, q);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

type DriverSeed = {
  name: string;
  num: string;
  model: string;
  seats: number;
  booked: number;
  phone: string;
  routeVariant: "full" | "trimEnd" | "trimStart" | "midCut" | "detour" | "weak";
};

const DRIVER_SEEDS: DriverSeed[] = [
  { name: "Raju Kumar", num: "UP 65 AB 1234", model: "Bajaj RE", seats: 3, booked: 1, phone: "98765 43210", routeVariant: "full" },
  { name: "Suresh Singh", num: "UP 65 CD 5678", model: "Piaggio Ape", seats: 2, booked: 0, phone: "97812 34567", routeVariant: "trimEnd" },
  { name: "Mohan Das", num: "UP 65 EF 9012", model: "Bajaj RE Compact", seats: 3, booked: 2, phone: "96543 21098", routeVariant: "trimStart" },
  { name: "Vikram Yadav", num: "UP 65 GH 3456", model: "Mahindra Treo", seats: 3, booked: 1, phone: "95432 10987", routeVariant: "midCut" },
  { name: "Deepak Mishra", num: "UP 65 IJ 7890", model: "Atul Shakti", seats: 2, booked: 0, phone: "94321 09876", routeVariant: "detour" },
  { name: "Ajay Tiwari", num: "UP 65 KL 2468", model: "TVS King", seats: 3, booked: 1, phone: "93210 98765", routeVariant: "weak" },
];

function buildDriverRoute(passenger: Coords[], variant: DriverSeed["routeVariant"], pickup: Coords, drop: Coords): Coords[] {
  const n = passenger.length;
  if (n < 2) return [];
  const copy = (arr: Coords[]) => arr.map(c => [c[0], c[1]] as Coords);
  switch (variant) {
    case "full":
      return copy(passenger);
    case "trimEnd":
      return copy(passenger.slice(0, Math.max(2, Math.floor(n * 0.92))));
    case "trimStart":
      return copy(passenger.slice(Math.floor(n * 0.06), n));
    case "midCut": {
      const a = Math.floor(n * 0.12);
      const b = Math.max(a + 2, Math.floor(n * 0.88));
      return copy(passenger.slice(a, b));
    }
    case "detour": {
      const out = copy(passenger);
      const mid = Math.floor(n / 2);
      const k = 0.004;
      out[mid] = [out[mid][0] + k, out[mid][1] + k];
      if (mid + 1 < out.length) out[mid + 1] = [out[mid + 1][0] + k * 0.5, out[mid + 1][1] + k * 0.5];
      return out;
    }
    case "weak": {
      const mid: Coords = [(pickup[0] + drop[0]) / 2 + 0.02, (pickup[1] + drop[1]) / 2 - 0.015];
      return [pickup, mid, drop];
    }
    default:
      return copy(passenger);
  }
}

export function buildMatchedRides(
  pickupName: string,
  dropName: string,
  pickup: Coords,
  drop: Coords,
  passengerPolyline: Coords[],
  tripDistanceM: number,
  tripDurationS: number
): ActiveRide[] {
  if (passengerPolyline.length < 2) return [];

  const base = Math.max(15, Math.round((tripDistanceM / 1000) * 8));
  const rows: ActiveRide[] = [];

  for (let i = 0; i < DRIVER_SEEDS.length; i++) {
    const d = DRIVER_SEEDS[i];
    const driverRoute = buildDriverRoute(passengerPolyline, d.routeVariant, pickup, drop);
    if (driverRoute.length < 2) continue;

    const driverMarker = nearestVertexToPoint(driverRoute, pickup);
    const distToPassengerRoute = minDistancePointToPolylineM(driverMarker, passengerPolyline);
    if (distToPassengerRoute > DRIVER_MAX_DIST_FROM_PASSENGER_ROUTE_M) continue;

    const pickupDistanceM = haversineDistance(pickup, driverMarker);
    const farePerSeat = Math.max(12, base - i + Math.round(pickupDistanceM / 800));
    const duration = Math.max(120, Math.round(tripDurationS * (0.9 + Math.min(pickupDistanceM, 2000) / 8000)));

    rows.push({
      id: `cityhop_${d.num.replace(/\s+/g, "_")}`,
      driverUid: `driver_uid_${i}`,
      driverName: d.name,
      autoNumber: d.num,
      autoModel: d.model,
      phone: d.phone,
      origin: { name: pickupName, latitude: pickup[1], longitude: pickup[0] },
      destination: { name: dropName, latitude: drop[1], longitude: drop[0] },
      totalSeats: d.seats,
      bookedSeats: d.booked,
      farePerSeat,
      distance: tripDistanceM,
      duration,
      passengers: Array(d.booked).fill("passenger_uid"),
      driverRoute,
      driverMarker,
      pickupDistanceM,
    });
  }

  rows.sort((a, b) => a.pickupDistanceM - b.pickupDistanceM);
  return rows;
}
