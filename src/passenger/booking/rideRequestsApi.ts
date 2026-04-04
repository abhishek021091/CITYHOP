import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "@react-native-firebase/firestore";
import type { ActiveRide } from "./types";

export const RIDE_REQUESTS = "rideRequests";

export type RideRequestStatus = "pending" | "accepted" | "rejected" | "countered";

export function createRideRequest(
  db: ReturnType<typeof getFirestore>,
  params: {
    driverId: string;
    passengerId: string;
    pickup: { name: string; latitude: number; longitude: number };
    drop: { name: string; latitude: number; longitude: number };
    rideType: "shared" | "private";
    driverPrice: number;
    priceMode: "per_seat" | "total";
    offeredPrice: number | null;
  }
) {
  return addDoc(collection(db, RIDE_REQUESTS), {
    ...params,
    status: "pending" as RideRequestStatus,
    finalPrice: null,
    driverCounterPrice: null,
    createdAt: serverTimestamp(),
  });
}

export function subscribeRideRequest(
  db: ReturnType<typeof getFirestore>,
  requestId: string,
  onData: (data: Record<string, unknown> | null) => void
) {
  return onSnapshot(doc(db, RIDE_REQUESTS, requestId), snap => {
    onData(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
  });
}

export function driverListedPrice(ride: ActiveRide, rideType: "shared" | "private"): number {
  return ride.pricePerSeat;
}

export function updateRideRequest(
  db: ReturnType<typeof getFirestore>,
  requestId: string,
  patch: Record<string, unknown>
) {
  return updateDoc(doc(db, RIDE_REQUESTS, requestId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
