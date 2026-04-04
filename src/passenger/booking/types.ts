/** Shared types for passenger ride booking / map flow */

export type Coords = [number, number];

export type AppScreen = "home" | "matching" | "payment" | "confirmed" | "tracking";
export type ActiveInput = "pickup" | "drop" | null;
export type PayMethod = "upi" | "cash" | "card";

export interface Place {
  placeName: string;
  placeAddress?: string;
  longitude: string;
  latitude: string;
  eLoc?: string;
  type?: string;
  /** Metres from user when search sorted (optional) */
  distanceFromUserM?: number;
}

export interface Route {
  distance: number;
  duration: number;
  coordinates: Coords[];
}

export interface ActiveRide {
  id: string;
  driverUid: string;
  driverName: string;
  autoNumber: string;
  autoModel: string;
  origin: { name: string; latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number };
  totalSeats: number;
  bookedSeats: number;
  farePerSeat: number;
  distance: number;
  duration: number;
  passengers: string[];
  phone: string;
  /** Driver's live route polyline */
  driverRoute: Coords[];
  /** Nearest point on driver route to passenger pickup (map marker) */
  driverMarker: Coords;
  pickupDistanceM: number;
}
