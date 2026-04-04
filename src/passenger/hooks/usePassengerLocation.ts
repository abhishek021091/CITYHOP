import { useState, useEffect, useCallback } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import Geolocation from "@react-native-community/geolocation";
import type { Coords } from "../booking/types";

const DEFAULT: Coords = [78.1746, 26.2485];

/**
 * GPS; flies map to first fix. Optional `onLocated` e.g. set pickup to current place.
 */
export function usePassengerLocation(mapCameraRef: React.RefObject<any>, onLocated?: (c: Coords) => void) {
  const [currentLocation, setCurrentLocation] = useState<Coords>(DEFAULT);
  const [userLoc, setUserLoc] = useState<Coords | undefined>(undefined);

  const refresh = useCallback(() => {
    Geolocation.getCurrentPosition(
      pos => {
        const c: Coords = [pos.coords.longitude, pos.coords.latitude];
        setCurrentLocation(c);
        setUserLoc(c);
        onLocated?.(c);
        mapCameraRef.current?.setCamera({ centerCoordinate: c, zoomLevel: 14, animationDuration: 1000 });
      },
      err => console.warn("GPS:", err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, [mapCameraRef, onLocated]);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "android") {
        const g = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          { title: "Location", message: "CityHop needs your location", buttonPositive: "Allow", buttonNegative: "Deny" }
        );
        if (g !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      refresh();
    })();
  }, [refresh]);

  return { currentLocation, setCurrentLocation, userLoc, setUserLoc, refresh, DEFAULT };
}
