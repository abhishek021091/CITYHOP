import type { Coords } from "../passenger/booking/types";

export type PredefinedRoute = {
  id: string;
  name: string;
  startName: string;
  endName: string;
  start: Coords;
  end: Coords;
  /** Drawable corridor */
  polyline: Coords[];
};

function lineBetween(a: Coords, b: Coords, steps = 22): Coords[] {
  const out: Coords[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Moradabad-area style demo corridors — lng, lat */
const A: Coords = [78.1746, 26.2485];
const B: Coords = [78.192, 26.255];
const C: Coords = [78.165, 26.24];
const D: Coords = [78.21, 26.26];

export const PREDEFINED_ROUTES: PredefinedRoute[] = [
  {
    id: "rt_station_gida",
    name: "Railway Station → GIDA",
    startName: "Railway Station",
    endName: "GIDA",
    start: A,
    end: B,
    polyline: lineBetween(A, B),
  },
  {
    id: "rt_mall_bus",
    name: "Civil Lines → Bus Stand",
    startName: "Civil Lines",
    endName: "Bus Stand",
    start: C,
    end: A,
    polyline: lineBetween(C, A),
  },
  {
    id: "rt_ring_road",
    name: "Kanth Road → Delhi Road",
    startName: "Kanth Road",
    endName: "Delhi Road",
    start: B,
    end: D,
    polyline: lineBetween(B, D),
  },
];
