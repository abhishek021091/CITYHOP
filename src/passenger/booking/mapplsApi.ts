import MapplsGL from "mappls-map-react-native";
import type { Coords, Place, Route } from "./types";
import { isValid, haversineDistance } from "./format";

const RestApi = () => (MapplsGL as any).RestApi;

/** Resolve lat/lng via placeDetail (eLoc) or geocode (address) when suggest omits coordinates */
export async function ensurePlaceWithCoordinates(place: Place): Promise<Place | null> {
  const lng0 = parseFloat(place.longitude);
  const lat0 = parseFloat(place.latitude);
  if (isValid(lng0) && isValid(lat0)) {
    const normalized = { ...place, longitude: String(lng0), latitude: String(lat0) };
    console.log("[CityHop] ensurePlace: using suggest lat/lng", normalized);
    return normalized;
  }

  const pin = (place.eLoc || "").trim();
  if (pin) {
    try {
      console.log("[CityHop] ensurePlace: placeDetail", pin);
      const d = await RestApi().placeDetail({ mapplsPin: pin });
      console.log("[CityHop] placeDetail response:", d);
      if (d != null && d.latitude != null && d.longitude != null) {
        const lat = Number(d.latitude);
        const lng = Number(d.longitude);
        if (isValid(lng) && isValid(lat)) {
          return {
            ...place,
            placeName: d.placeName || place.placeName,
            latitude: String(lat),
            longitude: String(lng),
          };
        }
      }
    } catch (e) {
      console.warn("[CityHop] placeDetail error", e);
    }
  }

  const addr = [place.placeName, place.placeAddress].filter(Boolean).join(", ").trim();
  if (addr.length > 2) {
    try {
      console.log("[CityHop] ensurePlace: geocode", addr);
      const g = await RestApi().geocode({ address: addr });
      console.log("[CityHop] geocode response:", g);
      const r = g?.results?.[0];
      if (r != null && r.latitude != null && r.longitude != null) {
        const lat = Number(r.latitude);
        const lng = Number(r.longitude);
        if (isValid(lng) && isValid(lat)) {
          return {
            ...place,
            latitude: String(lat),
            longitude: String(lng),
          };
        }
      }
    } catch (e) {
      console.warn("[CityHop] geocode error", e);
    }
  }

  console.log("[CityHop] ensurePlace: could not resolve coordinates", place);
  return null;
}

export async function searchPlaces(q: string, userLoc?: Coords): Promise<Place[]> {
  try {
    const { autoSuggest } = RestApi();
    const params: Record<string, unknown> = { query: q };
    if (userLoc) params.location = { latitude: userLoc[1], longitude: userLoc[0] };
    const result = await autoSuggest(params);
    const list: any[] = result?.suggestedLocations || [];
    console.log("[CityHop] autoSuggest raw count:", list.length);
    const mapped = list
      .map((item: any) => ({
        placeName: item.placeName || item.alternateName || "Unknown",
        placeAddress: item.placeAddress || item.addressTokens?.city || "",
        longitude: String(item.longitude ?? item.lng ?? ""),
        latitude: String(item.latitude ?? item.lat ?? ""),
        eLoc: item.mapplsPin || item.eLoc,
        type: item.type,
      }))
      .filter(p => {
        const lng = parseFloat(p.longitude);
        const lat = parseFloat(p.latitude);
        const hasLL = p.longitude !== "" && p.latitude !== "" && isValid(lng) && isValid(lat);
        const hasPin = !!(p.eLoc && String(p.eLoc).trim().length > 0);
        return hasLL || hasPin;
      });
    if (!userLoc) return mapped as Place[];
    const withDist: Place[] = mapped.map(p => {
      const lng = parseFloat(p.longitude);
      const lat = parseFloat(p.latitude);
      if (!isValid(lng) || !isValid(lat)) return { ...p };
      const d = haversineDistance(userLoc, [lng, lat]);
      return { ...p, distanceFromUserM: d };
    });
    return withDist.sort((a, b) => (a.distanceFromUserM ?? 1e15) - (b.distanceFromUserM ?? 1e15));
  } catch (e) {
    console.warn("[search]", e);
    return [];
  }
}

export async function reverseGeocode(coords: Coords): Promise<string> {
  try {
    const { reverseGeocode: fn } = RestApi();
    const r = await fn({ lat: coords[1], lng: coords[0] });
    return r?.results?.[0]?.formattedAddress || "Selected location";
  } catch {
    return "Selected location";
  }
}

/** Google-encoded polyline → [lng, lat][] */
export function decodePolyline(enc: string): Coords[] {
  const out: Coords[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < enc.length) {
    let b: number;
    let s = 0;
    let r = 0;
    do {
      b = enc.charCodeAt(i++) - 63;
      r |= (b & 0x1f) << s;
      s += 5;
    } while (b >= 0x20);
    lat += r & 1 ? ~(r >> 1) : r >> 1;
    s = 0;
    r = 0;
    do {
      b = enc.charCodeAt(i++) - 63;
      r |= (b & 0x1f) << s;
      s += 5;
    } while (b >= 0x20);
    lng += r & 1 ? ~(r >> 1) : r >> 1;
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

function extractRouteGeometry(route: any): Coords[] {
  let coords: Coords[] = [];
  const g: unknown = route.geometry;
  if (typeof g === "string" && g.length > 0) {
    coords = decodePolyline(g);
  } else if (g && typeof g === "object" && Array.isArray((g as { coordinates?: unknown }).coordinates)) {
    coords = (g as { coordinates: Coords[] }).coordinates;
  } else if (route.legs?.[0]?.steps) {
    for (const st of route.legs[0].steps) {
      if (typeof st.geometry === "string" && st.geometry.length) {
        coords.push(...decodePolyline(st.geometry));
      } else if (st.geometry && typeof st.geometry === "object" && Array.isArray((st.geometry as any).coordinates)) {
        coords.push(...(st.geometry as { coordinates: Coords[] }).coordinates);
      }
    }
  }
  return coords;
}

async function fetchRouteOnce(origin: Coords, dest: Coords, geometries: "geojson" | "polyline"): Promise<Route | null> {
  try {
    const { direction } = RestApi();
    const res = await direction({
      origin: { latitude: origin[1], longitude: origin[0] },
      destination: { latitude: dest[1], longitude: dest[0] },
      alternatives: false,
      geometries,
      overview: "full",
      steps: false,
    });
    const route = res?.routes?.[0];
    if (!route) return null;
    const coords = extractRouteGeometry(route);
    if (coords.length < 2) return null;
    return {
      distance: route.distance ?? 0,
      duration: route.duration ?? 0,
      coordinates: coords,
    };
  } catch (e) {
    console.warn("[CityHop] fetchRouteOnce error", geometries, e);
    return null;
  }
}

/** Directions API only — decoded polyline / GeoJSON coords; no straight-line fallback. */
export async function fetchRoute(origin: Coords, dest: Coords): Promise<Route | null> {
  console.log("[CityHop] fetchRoute request origin/dest", { origin, dest });
  const geo = await fetchRouteOnce(origin, dest, "geojson");
  if (geo) {
    console.log("[CityHop] fetchRoute geojson ok, points:", geo.coordinates.length);
    return geo;
  }
  const poly = await fetchRouteOnce(origin, dest, "polyline");
  if (poly) {
    console.log("[CityHop] fetchRoute polyline ok, points:", poly.coordinates.length);
    return poly;
  }
  return null;
}

/** NE / SW corners for fitting camera to full path */
export function boundsFromRoute(coords: Coords[]): { ne: Coords; sw: Coords } | null {
  if (!coords.length) return null;
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)],
    sw: [Math.min(...lngs), Math.min(...lats)],
  };
}
