import { useState, useCallback } from "react";
import type { Coords, Route } from "../booking/types";
import { resolvePassengerRoute } from "../booking/routeService";

export function useDirectionsRoute() {
  const [route, setRoute] = useState<Route | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeUnavailable, setRouteUnavailable] = useState(false);

  const loadRoute = useCallback(async (from: Coords, to: Coords) => {
    setRouteLoading(true);
    setRouteUnavailable(false);
    setRoute(null);
    try {
      const out = await resolvePassengerRoute(from, to);
      setRoute(out.route);
      setRouteUnavailable(out.unavailable);
      return out;
    } finally {
      setRouteLoading(false);
    }
  }, []);

  const clearRoute = useCallback(() => {
    setRoute(null);
    setRouteUnavailable(false);
  }, []);

  return { route, setRoute, routeLoading, routeUnavailable, loadRoute, clearRoute };
}
