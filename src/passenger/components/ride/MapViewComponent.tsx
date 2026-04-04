import React, { forwardRef } from "react";
import { StyleSheet } from "react-native";
import MapplsGL from "mappls-map-react-native";
import type { Coords, Route } from "../../booking/types";
import { PulsingPickupMarker, DropPinMarker, DriverTukMarker } from "./RideMarkers";
import { RIDE_THEME as C } from "./theme";

type MapScreen = "home" | "matching" | "payment" | "confirmed" | "tracking";

export type FleetMarker = { id: string; coordinate: Coords };

interface Props {
  currentLocation: Coords;
  pickupCoords: Coords;
  dropCoords: Coords | null;
  route: Route | null;
  screen: MapScreen;
  driverCoord: Coords | null;
  fleetMarkers?: FleetMarker[];
  onLongPress: (e: { geometry?: { coordinates?: Coords } }) => void;
}

/** Map + route polyline (blue) + custom markers */
const MapViewComponent = forwardRef<any, Props>(function MapViewComponent(
  { currentLocation, pickupCoords, dropCoords, route, screen, driverCoord, fleetMarkers, onLongPress },
  ref
) {
  return (
    <MapplsGL.MapView style={StyleSheet.absoluteFill} logoEnabled={false} compassEnabled onLongPress={onLongPress as any}>
      <MapplsGL.Camera ref={ref} zoomLevel={13} centerCoordinate={currentLocation} />

      {route && route.coordinates.length >= 2 && (
        <MapplsGL.ShapeSource
          id="routeSource"
          shape={{
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: route.coordinates },
          }}
        >
          <MapplsGL.LineLayer
            id="routeCasing"
            style={{ lineColor: "#ffffff", lineWidth: 9, lineCap: "round", lineJoin: "round" }}
            layerIndex={10}
          />
          <MapplsGL.LineLayer
            id="routeLine"
            style={{ lineColor: C.blue, lineWidth: 5.5, lineCap: "round", lineJoin: "round" }}
            layerIndex={11}
          />
        </MapplsGL.ShapeSource>
      )}

      <MapplsGL.PointAnnotation id="pickup" coordinate={pickupCoords}>
        <PulsingPickupMarker />
      </MapplsGL.PointAnnotation>

      {dropCoords && (
        <MapplsGL.PointAnnotation id="drop" coordinate={dropCoords}>
          <DropPinMarker />
        </MapplsGL.PointAnnotation>
      )}

      {fleetMarkers &&
        fleetMarkers.length > 0 &&
        (screen === "matching" || screen === "home") &&
        fleetMarkers.map(m => (
          <MapplsGL.PointAnnotation key={m.id} id={m.id} coordinate={m.coordinate}>
            <DriverTukMarker />
          </MapplsGL.PointAnnotation>
        ))}

      {screen === "tracking" && driverCoord && (
        <MapplsGL.PointAnnotation id="driverLive" coordinate={driverCoord}>
          <DriverTukMarker />
        </MapplsGL.PointAnnotation>
      )}
    </MapplsGL.MapView>
  );
});

export default MapViewComponent;
