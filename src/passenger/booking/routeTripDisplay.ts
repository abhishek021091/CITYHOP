import type { Route } from "./types";
import { fmtDistance, fmtDuration } from "./format";

export type RouteTripDisplay = { text: string; isError: boolean };

/** Never show "Route unavailable" when drivers exist; avoid error + driver list together. */
export function getRouteTripDisplay(
  route: Route | null,
  routeLoading: boolean,
  routeUnavailable: boolean,
  loadingRides: boolean,
  driverCount: number
): RouteTripDisplay {
  const routeMissing = !route || !route.coordinates || route.coordinates.length < 2;
  const badRoute = routeUnavailable || routeMissing;

  if (routeLoading) {
    return { text: "Loading route…", isError: false };
  }

  if (badRoute && driverCount > 0) {
    return { text: "Showing nearby autos", isError: false };
  }

  if (badRoute && driverCount === 0) {
    if (loadingRides) {
      return { text: "Finding drivers…", isError: false };
    }
    return { text: "Route unavailable", isError: true };
  }

  if (route && route.distance > 0) {
    return {
      text: `${fmtDuration(route.duration)} · ${fmtDistance(route.distance)}`,
      isError: false,
    };
  }

  return { text: "—", isError: false };
}
