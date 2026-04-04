import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, StyleSheet, TextInput, FlatList, TouchableOpacity,
  Text, Animated, ActivityIndicator, Alert,
  Platform, Keyboard, StatusBar, PermissionsAndroid, Dimensions, ScrollView,
} from "react-native";
import MapplsGL from "mappls-map-react-native";
import Geolocation from "@react-native-community/geolocation";
import { getAuth } from "@react-native-firebase/auth";
import {
  getFirestore, collection, addDoc, serverTimestamp,
  doc, onSnapshot,
} from "@react-native-firebase/firestore";

const { width: SW, height: SH } = Dimensions.get("window");

const C = {
  bg: "#F4F4F4",
  white: "#FFFFFF",
  border: "#E5E5E5",
  borderMid: "#CCCCCC",
  accent: "#1C1C1E",
  green: "#1A8F5C",
  greenBg: "#EAF7F1",
  red: "#D93025",
  redBg: "#FEF0EF",
  blue: "#1A6BCC",
  gold: "#E69A00",
  goldBg: "#FEF8EE",
  text1: "#111111",
  text2: "#444444",
  text3: "#888888",
  text4: "#BBBBBB",
  inputBg: "#FAFAFA",
};

type Coords = [number, number];
type AppScreen = "home" | "matching" | "payment" | "confirmed" | "tracking";
type ActiveInput = "pickup" | "drop" | null;
type PayMethod = "upi" | "cash" | "card";

interface Place {
  placeName: string; placeAddress?: string;
  longitude: string; latitude: string;
  eLoc?: string; type?: string;
}
interface Route { distance: number; duration: number; coordinates: Coords[]; }
interface ActiveRide {
  id: string; driverUid: string; driverName: string;
  autoNumber: string; autoModel: string;
  origin: { name: string; latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number };
  totalSeats: number; bookedSeats: number; farePerSeat: number;
  distance: number; duration: number; passengers: string[];
  phone: string;
}

const fmtDuration = (s: number) => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const fmtDistance = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const isValid = (n: number) => !isNaN(n) && isFinite(n) && n !== 0;

// ── Haversine distance (metres) ───────────────────────────────────────────────
const haversineDistance = (a: Coords, b: Coords): number => {
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

// ── Generate fake rides ───────────────────────────────────────────────────────
const generateRides = (
  pickupName: string, dropName: string,
  pickup: Coords, drop: Coords, distance: number
): ActiveRide[] => {
  const drivers = [
    { name: "Raju Kumar", num: "UP 65 AB 1234", model: "Bajaj RE", seats: 3, booked: 1, phone: "98765 43210" },
    { name: "Suresh Singh", num: "UP 65 CD 5678", model: "Piaggio Ape", seats: 2, booked: 0, phone: "97812 34567" },
    { name: "Mohan Das", num: "UP 65 EF 9012", model: "Bajaj RE Compact", seats: 3, booked: 2, phone: "96543 21098" },
    { name: "Vikram Yadav", num: "UP 65 GH 3456", model: "Mahindra Treo", seats: 3, booked: 1, phone: "95432 10987" },
    { name: "Deepak Mishra", num: "UP 65 IJ 7890", model: "Atul Shakti", seats: 2, booked: 0, phone: "94321 09876" },
  ];
  const baseFare = Math.max(15, Math.round((distance / 1000) * 8));
  return drivers.map((d, i) => ({
    id: `ride_${i}_${Date.now()}`,
    driverUid: `driver_uid_${i}`,
    driverName: d.name, autoNumber: d.num, autoModel: d.model, phone: d.phone,
    origin: { name: pickupName, latitude: pickup[1], longitude: pickup[0] },
    destination: { name: dropName, latitude: drop[1], longitude: drop[0] },
    totalSeats: d.seats, bookedSeats: d.booked,
    farePerSeat: baseFare - (i * 2),
    distance, duration: Math.round(distance / 8),
    passengers: Array(d.booked).fill("passenger_uid"),
  }));
};

// ── Search ────────────────────────────────────────────────────────────────────
const searchPlaces = async (q: string, userLoc?: Coords): Promise<Place[]> => {
  try {
    const { autoSuggest } = (MapplsGL as any).RestApi;
    const params: any = { query: q };
    if (userLoc) params.location = { latitude: userLoc[1], longitude: userLoc[0] };
    const result = await autoSuggest(params);
    const list: any[] = result?.suggestedLocations || [];
    return list
      .map((item: any) => ({
        placeName: item.placeName || item.alternateName || "Unknown",
        placeAddress: item.placeAddress || item.addressTokens?.city || "",
        longitude: String(item.longitude ?? item.lng ?? ""),
        latitude: String(item.latitude ?? item.lat ?? ""),
        eLoc: item.mapplsPin || item.eLoc, type: item.type,
      }))
      .filter(p => isValid(parseFloat(p.longitude)) && isValid(parseFloat(p.latitude)));
  } catch (e) { console.warn("[search]", e); return []; }
};

const reverseGeocode = async (coords: Coords): Promise<string> => {
  try {
    const { reverseGeocode: fn } = (MapplsGL as any).RestApi;
    const r = await fn({ lat: coords[1], lng: coords[0] });
    return r?.results?.[0]?.formattedAddress || "Selected location";
  } catch { return "Selected location"; }
};

const decodePolyline = (enc: string): Coords[] => {
  const out: Coords[] = []; let i = 0, lat = 0, lng = 0;
  while (i < enc.length) {
    let b, s = 0, r = 0;
    do { b = enc.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lat += (r & 1) ? ~(r >> 1) : (r >> 1); s = 0; r = 0;
    do { b = enc.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lng += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
};

const fetchRoute = async (o: Coords, d: Coords): Promise<Route | null> => {
  try {
    const { direction } = (MapplsGL as any).RestApi;
    const res = await direction({
      origin: { latitude: o[1], longitude: o[0] },
      destination: { latitude: d[1], longitude: d[0] },
      alternatives: false, geometries: "geojson", overview: "full", steps: false,
    });
    const route = res?.routes?.[0]; if (!route) return null;
    let coords: Coords[] = [];
    if (route.geometry?.coordinates?.length) coords = route.geometry.coordinates;
    else if (typeof route.geometry === "string") coords = decodePolyline(route.geometry);
    else if (route.legs?.[0]?.steps) for (const st of route.legs[0].steps) if (st.geometry?.coordinates) coords.push(...st.geometry.coordinates);
    return { distance: route.distance ?? 0, duration: route.duration ?? 0, coordinates: coords };
  } catch (e) { console.warn("[route]", e); return null; }
};

// ── Markers — larger and more visible ────────────────────────────────────────
const PickupMarker = () => (
  <View style={{ alignItems: "center" }}>
    {/* Outer ring */}
    <View style={{
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: C.green + "33",
      justifyContent: "center", alignItems: "center",
    }}>
      {/* Inner dot */}
      <View style={{
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: C.green,
        borderWidth: 2.5, borderColor: "#fff",
        elevation: 6,
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
      }} />
    </View>
  </View>
);

const DropMarker = () => (
  <View style={{ alignItems: "center" }}>
    {/* Pin head */}
    <View style={{
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: C.red,
      borderWidth: 3, borderColor: "#fff",
      justifyContent: "center", alignItems: "center",
      elevation: 8,
      shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 4,
    }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
    </View>
    {/* Pin tail */}
    <View style={{
      width: 13, height: 10,
      backgroundColor: C.red,
      borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
    }} />
    {/* Shadow dot at base */}
    <View style={{
      width: 8, height: 3, borderRadius: 4,
      backgroundColor: "#147ce430", marginTop: 1,
    }} />
  </View>
);

const DriverMarker = () => (
  <View style={{ alignItems: "center" }}>
    <View style={{
      backgroundColor: C.white,
      borderWidth: 4, borderColor: C.red,
      paddingHorizontal: 8, paddingVertical: 10,
      borderRadius: 6,
      elevation: 18,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
    }}>
      <Text style={{ fontSize: 22 }}>🛺</Text>
    </View>
    {/* Pointer */}
    <View style={{
      width: 0, height: 0,
      borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7,
      borderLeftColor: "transparent", borderRightColor: "transparent",
      borderTopColor: C.green,
      marginTop: -1,
    }} />
  </View>
);

interface Props { navigation?: any; }

export default function PassengerHome({ navigation }: Props) {
  const mapCamera = useRef<any>(null);
  const panelY = useRef(new Animated.Value(400)).current;
  const sheetY = useRef(new Animated.Value(SH)).current;
  const payScaleAnim = useRef(new Animated.Value(0.95)).current;
  const payFadeAnim = useRef(new Animated.Value(0)).current;
  const trackingPanelY = useRef(new Animated.Value(300)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const auth = getAuth();
  const db = getFirestore();
  const currentUser = auth.currentUser;

  const [screen, setScreen] = useState<AppScreen>("home");
  const [activeInput, setActiveInput] = useState<ActiveInput>(null);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [pickupQuery, setPickupQuery] = useState("Current Location");
  const [dropQuery, setDropQuery] = useState("");
  const [currentLocation, setCurrentLocation] = useState<Coords>([78.1746, 26.2485]);

  const [userLoc, setUserLoc] = useState<Coords | undefined>(undefined);
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [matchingRides, setMatchingRides] = useState<ActiveRide[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [selectedRide, setSelectedRide] = useState<ActiveRide | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("upi");
  const [upiId, setUpiId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const [activeRideId, setActiveRideId] = useState<string | null>(null);

  // ── Straight-line distance between pickup & drop ──────────────────────────
  const straightLineDistance: number | null = (() => {
    if (!pickup || !drop) return null;
    const pLng = parseFloat(pickup.longitude), pLat = parseFloat(pickup.latitude);
    const dLng = parseFloat(drop.longitude), dLat = parseFloat(drop.latitude);
    if (!isValid(pLng) || !isValid(pLat) || !isValid(dLng) || !isValid(dLat)) return null;
    return haversineDistance([pLng, pLat], [dLng, dLat]);
  })();

  // ── Tracking state ────────────────────────────────────────────────────────
  const [driverCoord, setDriverCoord] = useState<Coords | null>(null);
  const [etaMin, setEtaMin] = useState(4);
  const [trackPhase, setTrackPhase] = useState<"arriving" | "onway" | "arrived">("arriving");
  const fakeIntervalRef = useRef<any>(null);

  // ── Pulse animation for LIVE dot ─────────────────────────────────────────
  useEffect(() => {
    if (screen !== "tracking") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [screen]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (Platform.OS === "android") {
        const g = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          { title: "Location", message: "CityHop needs your location", buttonPositive: "Allow", buttonNegative: "Deny" }
        );
        if (g !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      Geolocation.getCurrentPosition(
        pos => {
          const c: Coords = [pos.coords.longitude, pos.coords.latitude];
          setCurrentLocation(c); setUserLoc(c);
          setPickup({ placeName: "Current Location", longitude: String(c[0]), latitude: String(c[1]) });
          mapCamera.current?.setCamera({ centerCoordinate: c, zoomLevel: 14, animationDuration: 1000 });
        },
        err => console.warn("GPS:", err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    })();
  }, []);

  // ── Panel slide-in ────────────────────────────────────────────────────────
  useEffect(() => {
    panelY.setValue(400);
    Animated.spring(panelY, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }).start();
  }, [screen]);

  const showSheet = () => Animated.spring(sheetY, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }).start();
  const hideSheet = () => Animated.timing(sheetY, { toValue: SH, duration: 250, useNativeDriver: true }).start();

  // ── Real Firestore listener for driver location ───────────────────────────
  useEffect(() => {
    if (!activeRideId || screen !== "tracking") return;
    const unsub = onSnapshot(doc(db, "rides", activeRideId), (snap: any) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data?.driverLocation) {
        const c: Coords = [data.driverLocation.longitude, data.driverLocation.latitude];
        setDriverCoord(c);
      }
    });
    return () => unsub();
  }, [activeRideId, screen]);

  // ── Fake driver movement along route coords (fallback) ────────────────────
  const startFakeTracking = (coords: Coords[]) => {
    if (!coords || coords.length < 2) return;
    let idx = 0;
    const step = Math.max(1, Math.floor(coords.length / 30));
    setDriverCoord(coords[0]);

    fakeIntervalRef.current = setInterval(() => {
      idx = Math.min(idx + step, coords.length - 1);
      setDriverCoord(coords[idx]);
      mapCamera.current?.setCamera({
        centerCoordinate: coords[idx],
        zoomLevel: 15,
        animationDuration: 800,
      });
      if (idx >= coords.length - 1) {
        clearInterval(fakeIntervalRef.current);
        setTrackPhase("arrived");
      }
    }, 4000);
  };

  // ── ETA countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "tracking") return;
    if (trackPhase === "arriving") {
      if (etaMin <= 0) { setTrackPhase("onway"); return; }
      const t = setTimeout(() => setEtaMin(p => Math.max(0, p - 1)), 60000);
      return () => clearTimeout(t);
    }
  }, [screen, trackPhase, etaMin]);

  // ── Cleanup fake interval ─────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (fakeIntervalRef.current) clearInterval(fakeIntervalRef.current); };
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (text: string, field: ActiveInput) => {
    if (field === "pickup") setPickupQuery(text); else setDropQuery(text);
    if (text.length < 3) { setSearchResults([]); return; }
    setSearching(true);
    try { setSearchResults(await searchPlaces(text, userLoc)); }
    finally { setSearching(false); }
  }, [userLoc]);

  const handleSelectPlace = useCallback(async (item: Place) => {
    const lng = parseFloat(item.longitude), lat = parseFloat(item.latitude);
    const coords: Coords = isValid(lng) && isValid(lat) ? [lng, lat] : currentLocation;
    const updated = { ...item, longitude: String(coords[0]), latitude: String(coords[1]) };
    Keyboard.dismiss(); setSearchResults([]);
    if (activeInput === "pickup") { setPickup(updated); setPickupQuery(item.placeName); }
    else { setDrop(updated); setDropQuery(item.placeName); }
    mapCamera.current?.setCamera({ centerCoordinate: coords, zoomLevel: 14, animationDuration: 800 });
    setActiveInput(null);

    const np = activeInput === "pickup" ? updated : pickup;
    const nd = activeInput === "drop" ? updated : drop;

    if (np && nd) {
      const pCoords: Coords = [parseFloat(np.longitude), parseFloat(np.latitude)];
      const dCoords: Coords = [parseFloat(nd.longitude), parseFloat(nd.latitude)];
      if (!isValid(pCoords[0]) || !isValid(pCoords[1]) || !isValid(dCoords[0]) || !isValid(dCoords[1])) {
        Alert.alert("Invalid location", "Try a more specific search."); return;
      }
      setRouteLoading(true);
      const r = await fetchRoute(pCoords, dCoords);
      setRoute(r); setRouteLoading(false);
      mapCamera.current?.fitBounds(pCoords, dCoords, [100, 50, 260, 50], 1000);

      setLoadingRides(true);
      const dist = r?.distance || haversineDistance(pCoords, dCoords) || 5000;
      setTimeout(() => {
        setMatchingRides(generateRides(np.placeName, nd.placeName, pCoords, dCoords, dist));
        setLoadingRides(false);
      }, 1200);
      setScreen("matching");
      showSheet();
    }
  }, [activeInput, pickup, drop, currentLocation]);

  // ── Book ──────────────────────────────────────────────────────────────────
  const handleBook = (ride: ActiveRide) => {
    setSelectedRide(ride);
    hideSheet();
    setTimeout(() => {
      setScreen("payment");
      Animated.parallel([
        Animated.spring(payScaleAnim, { toValue: 1, tension: 70, friction: 12, useNativeDriver: true }),
        Animated.timing(payFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 300);
  };

  // ── Pay ───────────────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!selectedRide || !currentUser) return;
    if (payMethod === "upi" && !upiId.trim()) {
      Alert.alert("Enter UPI ID", "Please enter your UPI ID to proceed."); return;
    }
    setProcessing(true);
    try {
      const ref = await addDoc(collection(db, "bookings"), {
        passengerId: currentUser.uid,
        rideId: selectedRide.id,
        driverName: selectedRide.driverName,
        autoNumber: selectedRide.autoNumber,
        farePerSeat: selectedRide.farePerSeat,
        paymentMethod: payMethod,
        origin: selectedRide.origin,
        destination: selectedRide.destination,
        status: "confirmed",
        createdAt: serverTimestamp(),
      });
      setBookingRef(`RS${ref.id.slice(0, 6).toUpperCase()}`);
      setActiveRideId(selectedRide.id);
      setScreen("confirmed");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setProcessing(false);
    }
  };

  // ── Start tracking ────────────────────────────────────────────────────────
  const handleStartTracking = () => {
    if (!selectedRide || !route) return;

    trackingPanelY.setValue(300);
    Animated.spring(trackingPanelY, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }).start();

    setEtaMin(4);
    setTrackPhase("arriving");
    setScreen("tracking");

    const pCoords: Coords = [selectedRide.origin.longitude, selectedRide.origin.latitude];
    const dCoords: Coords = [selectedRide.destination.longitude, selectedRide.destination.latitude];
    mapCamera.current?.fitBounds(pCoords, dCoords, [120, 60, 260, 60], 1000);

    startFakeTracking(route.coordinates);
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    if (fakeIntervalRef.current) clearInterval(fakeIntervalRef.current);
    setPickup(null); setDrop(null);
    setPickupQuery("Current Location"); setDropQuery("");
    setRoute(null); setMatchingRides([]);
    setSelectedRide(null); setUpiId("");
    setPayMethod("upi"); setBookingRef("");
    setActiveRideId(null); setDriverCoord(null);
    setTrackPhase("arriving"); setEtaMin(4);
    payScaleAnim.setValue(0.95); payFadeAnim.setValue(0);
    setScreen("home"); hideSheet();
  };

  const pickupCoords: Coords = (() => {
    if (!pickup) return currentLocation;
    const lng = parseFloat(pickup.longitude), lat = parseFloat(pickup.latitude);
    return isValid(lng) && isValid(lat) ? [lng, lat] : currentLocation;
  })();
  const dropCoords: Coords | null = (() => {
    if (!drop) return null;
    const lng = parseFloat(drop.longitude), lat = parseFloat(drop.latitude);
    return isValid(lng) && isValid(lat) ? [lng, lat] : null;
  })();

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── MAP ── */}
      <View style={s.map}>
        <MapplsGL.MapView
          style={StyleSheet.absoluteFill} logoEnabled={false} compassEnabled
          onLongPress={async (e: any) => {
            if (screen === "tracking") return;
            const coords: Coords = e.geometry?.coordinates; if (!coords) return;
            const address = await reverseGeocode(coords);
            const place: Place = { placeName: address, longitude: String(coords[0]), latitude: String(coords[1]) };
            setDrop(place); setDropQuery(address);
            if (pickup) {
              const pCoords: Coords = [parseFloat(pickup.longitude), parseFloat(pickup.latitude)];
              setRouteLoading(true);
              const r = await fetchRoute(pCoords, coords);
              setRoute(r); setRouteLoading(false);
              mapCamera.current?.fitBounds(pCoords, coords, [100, 50, 260, 50], 1000);
              const dist = r?.distance || haversineDistance(pCoords, coords) || 5000;
              setLoadingRides(true);
              setTimeout(() => {
                setMatchingRides(generateRides(pickup.placeName, address, pCoords, coords, dist));
                setLoadingRides(false);
              }, 1200);
              setScreen("matching"); showSheet();
            }
          }}
        >
          <MapplsGL.Camera ref={mapCamera} zoomLevel={13} centerCoordinate={currentLocation} />

          {/* Route line */}
          {route && route.coordinates.length > 1 && (
            <MapplsGL.ShapeSource id="routeSource" shape={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coordinates } }}>
              <MapplsGL.LineLayer id="routeCasing" style={{ lineColor: "#fff", lineWidth: 8, lineCap: "round", lineJoin: "round" }} layerIndex={10} />
              <MapplsGL.LineLayer id="routeLine" style={{ lineColor: C.blue, lineWidth: 4, lineCap: "round", lineJoin: "round" }} layerIndex={11} />
            </MapplsGL.ShapeSource>
          )}

          {/* Pickup marker — larger */}
          <MapplsGL.PointAnnotation id="pickup" coordinate={pickupCoords}>
            <PickupMarker />
          </MapplsGL.PointAnnotation>

          {/* Drop marker — larger */}
          {dropCoords && (
            <MapplsGL.PointAnnotation id="drop" coordinate={dropCoords}>
              <DropMarker />
            </MapplsGL.PointAnnotation>
          )}

          {/* 🛺 Live driver marker */}
          {screen === "tracking" && driverCoord && (
            <MapplsGL.PointAnnotation id="driverLive" coordinate={driverCoord}>
              <DriverMarker />
            </MapplsGL.PointAnnotation>
          )}
        </MapplsGL.MapView>

        {/* ── Top bar — FIXED: no raw JSX comment text, clean pill styles ── */}
        <View style={s.topBar} pointerEvents="box-none">
          <View style={s.topBarInner}>
            {/* App name pill */}
            <View style={s.appNameWrap}>
              <Text style={s.appName}>🛺 CityHop</Text>
            </View>
            {/* Profile button */}
            <TouchableOpacity
              style={s.profileBtn}
              onPress={() => navigation && navigation.navigate("PassengerProfile")}
              activeOpacity={0.8}
            >
              <Text style={s.profileBtnTxt}>👤  Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Route pill — shows road distance + haversine if API didn't give one */}
        {(route || straightLineDistance) && screen !== "confirmed" && screen !== "tracking" && (
          <View style={s.routePill}>
            {route ? (
              <Text style={s.routePillTxt}>
                {fmtDuration(route.duration)}  ·  {fmtDistance(route.distance)}
              </Text>
            ) : (
              <Text style={s.routePillTxt}>
                {fmtDistance(straightLineDistance!)}  straight line
              </Text>
            )}
          </View>
        )}

        {/* LIVE badge */}
        {screen === "tracking" && (
          <View style={s.liveBadge}>
            <Animated.View style={[s.liveBadgeDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={s.liveBadgeTxt}>LIVE TRACKING</Text>
          </View>
        )}

        {/* Route loading spinner */}
        {routeLoading && (
          <View style={s.routeLoadingOverlay}>
            <ActivityIndicator size="small" color={C.blue} />
            <Text style={s.routeLoadingTxt}>Fetching route…</Text>
          </View>
        )}
      </View>

      {/* ── SEARCH PANEL ── */}
      {(screen === "home" || screen === "matching") && (
        <Animated.View style={[s.panel, { transform: [{ translateY: panelY }] }]}>
          <View style={s.handle} />
          <Text style={s.heading}>Where to?</Text>

          {/* Distance chip — shown when both points are set */}
          {straightLineDistance !== null && (
            <View style={s.distChip}>
              <Text style={s.distChipTxt}>
                📍 {fmtDistance(straightLineDistance)} away
                {route ? `  ·  ${fmtDistance(route.distance)} by road` : ""}
              </Text>
            </View>
          )}

          <View style={s.searchBox}>
            <TouchableOpacity style={s.searchRow} onPress={() => setActiveInput("pickup")} activeOpacity={0.7}>
              <View style={s.dotGreen} />
              <View style={{ flex: 1 }}>
                {activeInput === "pickup"
                  ? <TextInput style={s.searchInput} autoFocus value={pickupQuery} onChangeText={t => handleSearch(t, "pickup")} placeholderTextColor={C.text4} />
                  : <Text style={s.searchVal} numberOfLines={1}>{pickupQuery}</Text>}
              </View>
            </TouchableOpacity>
            <View style={s.searchDivider} />
            <TouchableOpacity style={s.searchRow} onPress={() => setActiveInput("drop")} activeOpacity={0.7}>
              <View style={s.dotRed} />
              <View style={{ flex: 1 }}>
                {activeInput === "drop"
                  ? <TextInput style={s.searchInput} autoFocus value={dropQuery} onChangeText={t => handleSearch(t, "drop")} placeholder="Enter destination" placeholderTextColor={C.text4} />
                  : <Text style={[s.searchVal, !dropQuery && { color: C.text4 }]} numberOfLines={1}>{dropQuery || "Enter destination"}</Text>}
              </View>
            </TouchableOpacity>
          </View>

          {(searching || searchResults.length > 0) && (
            <View style={s.resultBox}>
              {searching && (
                <View style={s.searchingRow}>
                  <ActivityIndicator size="small" color={C.accent} />
                  <Text style={s.searchingTxt}>Searching…</Text>
                </View>
              )}
              <FlatList
                data={searchResults.slice(0, 6)} keyExtractor={(_, i) => i.toString()} keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => (
                  <TouchableOpacity style={[s.resultRow, index > 0 && s.resultBorder]} onPress={() => handleSelectPlace(item)} activeOpacity={0.7}>
                    <View style={s.resultPin}><Text style={{ fontSize: 13 }}>📍</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.resultName} numberOfLines={1}>{item.placeName}</Text>
                      {item.placeAddress ? <Text style={s.resultAddr} numberOfLines={1}>{item.placeAddress}</Text> : null}
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {!activeInput && searchResults.length === 0 && (
            <>
              <Text style={s.sectionLabel}>SAVED PLACES</Text>
              {[
                { name: "Home", addr: "Your home location", icon: "🏠" },
                { name: "Office", addr: "Your work location", icon: "🏢" },
                { name: "Airport", addr: "Nearest airport", icon: "✈️" },
              ].map((p, i) => (
                <TouchableOpacity key={i} style={s.savedRow} onPress={() => { setActiveInput("drop"); setDropQuery(p.name); handleSearch(p.name, "drop"); }} activeOpacity={0.7}>
                  <View style={s.savedIcon}><Text style={{ fontSize: 16 }}>{p.icon}</Text></View>
                  <View>
                    <Text style={s.savedName}>{p.name}</Text>
                    <Text style={s.savedAddr}>{p.addr}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </Animated.View>
      )}

      {/* ── BOTTOM SHEET — matching autos ── */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: sheetY }] }]}>
        <View style={s.sheetHandle} />
        <View style={s.sheetHeader}>
          <View>
            <Text style={s.sheetTitle}>Autos on your route</Text>
            {route && (
              <Text style={s.sheetSub}>
                {fmtDistance(route.distance)}  ·  {fmtDuration(route.duration)}
                {straightLineDistance !== null
                  ? `  ·  ${fmtDistance(straightLineDistance)} straight`
                  : ""}
              </Text>
            )}
          </View>
          <TouchableOpacity style={s.sheetCloseBtn} onPress={() => { hideSheet(); setScreen("home"); }} activeOpacity={0.8}>
            <Text style={s.sheetCloseTxt}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={s.sheetDivider} />

        {loadingRides ? (
          <View style={s.sheetLoading}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={s.sheetLoadingTxt}>Finding autos on your route…</Text>
          </View>
        ) : (
          <FlatList
            data={matchingRides} keyExtractor={r => r.id}
            contentContainerStyle={s.ridesList}
            renderItem={({ item, index }) => {
              const seatsLeft = item.totalSeats - item.bookedSeats;
              const isAlmostFull = seatsLeft === 1;
              return (
                <View style={[s.rideItem, index > 0 && s.rideItemBorder]}>
                  <View style={s.rideItemLeft}>
                    <View style={s.rideAutoIcon}><Text style={{ fontSize: 20 }}>🛺</Text></View>
                    <View>
                      <Text style={s.rideAutoNum}>{item.autoNumber}</Text>
                      <Text style={s.rideAutoModel}>{item.autoModel}</Text>
                      <View style={s.rideTags}>
                        <View style={[s.rideBadge, isAlmostFull && s.rideBadgeRed]}>
                          <Text style={[s.rideBadgeTxt, isAlmostFull && s.rideBadgeTxtRed]}>
                            {seatsLeft} seat{seatsLeft !== 1 ? "s" : ""} left
                          </Text>
                        </View>
                        <View style={s.rideBadge}>
                          <Text style={s.rideBadgeTxt}>{fmtDuration(item.duration)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={s.rideItemRight}>
                    <Text style={s.rideFare}>₹{item.farePerSeat}</Text>
                    <Text style={s.rideFareLabel}>per seat</Text>
                    <TouchableOpacity style={s.bookBtn} onPress={() => handleBook(item)} activeOpacity={0.85}>
                      <Text style={s.bookBtnTxt}>BOOK</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}
      </Animated.View>

      {/* ── PAYMENT PANEL ── */}
      {screen === "payment" && selectedRide && (
        <Animated.View style={[s.payPanel, { opacity: payFadeAnim, transform: [{ scale: payScaleAnim }] }]}>
          <View style={s.handle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.payHeader}>
              <TouchableOpacity style={s.backBtn} onPress={() => { setScreen("matching"); showSheet(); }} activeOpacity={0.8}>
                <Text style={s.backBtnTxt}>←</Text>
              </TouchableOpacity>
              <Text style={s.heading}>Confirm & Pay</Text>
            </View>

            {/* Summary */}
            <View style={s.paySummaryCard}>
              <View style={s.paySummaryRow}>
                <Text style={s.paySummaryIcon}>🛺</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.paySummaryNum}>{selectedRide.autoNumber} · {selectedRide.autoModel}</Text>
                  <Text style={s.paySummaryDriver}>{selectedRide.driverName}</Text>
                </View>
                <View style={s.payFareTag}>
                  <Text style={s.payFareTagTxt}>₹{selectedRide.farePerSeat}</Text>
                </View>
              </View>
              <View style={s.paySummaryDivider} />
              <View style={s.payRouteRow}>
                <View style={[s.payRouteDot, { backgroundColor: C.green }]} />
                <Text style={s.payRouteTxt} numberOfLines={1}>{selectedRide.origin.name}</Text>
              </View>
              <View style={s.payRouteConnector} />
              <View style={s.payRouteRow}>
                <View style={[s.payRouteDot, { backgroundColor: C.red }]} />
                <Text style={s.payRouteTxt} numberOfLines={1}>{selectedRide.destination.name}</Text>
              </View>
            </View>

            {/* Fare breakdown */}
            <View style={s.fareBreakCard}>
              <View style={s.fareBreakRow}>
                <Text style={s.fareBreakLabel}>Seat fare</Text>
                <Text style={s.fareBreakVal}>₹{selectedRide.farePerSeat}</Text>
              </View>
              <View style={s.fareBreakDivider} />
              <View style={s.fareBreakRow}>
                <Text style={s.fareBreakLabel}>Distance</Text>
                <Text style={s.fareBreakVal}>{fmtDistance(selectedRide.distance)}</Text>
              </View>
              <View style={s.fareBreakDivider} />
              <View style={s.fareBreakRow}>
                <Text style={s.fareBreakLabel}>Platform fee</Text>
                <Text style={s.fareBreakVal}>₹0</Text>
              </View>
              <View style={s.fareBreakDivider} />
              <View style={s.fareBreakRow}>
                <Text style={[s.fareBreakLabel, { fontWeight: "700", color: C.text1 }]}>Total</Text>
                <Text style={[s.fareBreakVal, { fontWeight: "800", fontSize: 16, color: C.text1 }]}>₹{selectedRide.farePerSeat}</Text>
              </View>
            </View>

            {/* Savings tag */}
            <View style={s.savingsTag}>
              <Text style={s.savingsTxt}>
                {"🌿 You save ₹" + Math.max(0, Math.round((selectedRide.distance / 1000) * 15) - selectedRide.farePerSeat) + " vs booking a full auto"}
              </Text>
            </View>

            {/* Payment method */}
            <Text style={s.sectionLabel}>PAYMENT METHOD</Text>
            <View style={s.payMethodRow}>
              {(["upi", "cash", "card"] as PayMethod[]).map(m => (
                <TouchableOpacity key={m} style={[s.payMethodBtn, payMethod === m && s.payMethodBtnOn]} onPress={() => setPayMethod(m)} activeOpacity={0.8}>
                  <Text style={s.payMethodIcon}>{m === "upi" ? "📱" : m === "cash" ? "💵" : "💳"}</Text>
                  <Text style={[s.payMethodLabel, payMethod === m && s.payMethodLabelOn]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {payMethod === "upi" && (
              <View style={s.upiBox}>
                <TextInput style={s.upiInput} placeholder="Enter UPI ID (e.g. name@upi)" placeholderTextColor={C.text4} value={upiId} onChangeText={setUpiId} autoCapitalize="none" />
              </View>
            )}
            {payMethod === "cash" && (
              <View style={s.cashNote}>
                <Text style={s.cashNoteTxt}>{"💵  Pay ₹" + selectedRide.farePerSeat + " in cash directly to the driver when you board."}</Text>
              </View>
            )}
            {payMethod === "card" && (
              <View style={s.upiBox}>
                <TextInput style={s.upiInput} placeholder="Card number" placeholderTextColor={C.text4} keyboardType="number-pad" />
              </View>
            )}

            <TouchableOpacity
              style={[s.payBtn, processing && { opacity: 0.6 }]}
              onPress={handlePay} disabled={processing} activeOpacity={0.85}
            >
              {processing
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.payBtnTxt}>{payMethod === "cash" ? "Confirm Booking" : "Pay ₹" + selectedRide.farePerSeat}</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </ScrollView>
        </Animated.View>
      )}

      {/* ── CONFIRMED SCREEN ── */}
      {screen === "confirmed" && selectedRide && (
        <Animated.View style={[s.panel, { transform: [{ translateY: panelY }] }]}>
          <View style={s.handle} />

          <View style={s.confirmedHeader}>
            <View style={s.confirmedIconBig}><Text style={{ fontSize: 32 }}>✅</Text></View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.confirmedTitle}>Booking Confirmed!</Text>
              <Text style={s.confirmedRef}>{"Ref: " + bookingRef}</Text>
            </View>
          </View>

          <View style={s.ticketCard}>
            <View style={s.ticketRow}>
              <Text style={s.ticketLabel}>Driver</Text>
              <Text style={s.ticketVal}>{selectedRide.driverName}</Text>
            </View>
            <View style={s.ticketDivider} />
            <View style={s.ticketRow}>
              <Text style={s.ticketLabel}>Auto</Text>
              <Text style={s.ticketVal}>{selectedRide.autoNumber + "  ·  " + selectedRide.autoModel}</Text>
            </View>
            <View style={s.ticketDivider} />
            <View style={s.ticketRow}>
              <Text style={s.ticketLabel}>From</Text>
              <Text style={s.ticketVal} numberOfLines={1}>{selectedRide.origin.name}</Text>
            </View>
            <View style={s.ticketDivider} />
            <View style={s.ticketRow}>
              <Text style={s.ticketLabel}>To</Text>
              <Text style={s.ticketVal} numberOfLines={1}>{selectedRide.destination.name}</Text>
            </View>
            <View style={s.ticketDivider} />
            <View style={s.ticketRow}>
              <Text style={s.ticketLabel}>Distance</Text>
              <Text style={s.ticketVal}>{fmtDistance(selectedRide.distance)}</Text>
            </View>
            <View style={s.ticketDivider} />
            <View style={s.ticketRow}>
              <Text style={s.ticketLabel}>Fare paid</Text>
              <Text style={[s.ticketVal, { color: C.green, fontWeight: "800" }]}>{"₹" + selectedRide.farePerSeat}</Text>
            </View>
            <View style={s.ticketDivider} />
            <View style={s.ticketRow}>
              <Text style={s.ticketLabel}>Payment</Text>
              <Text style={s.ticketVal}>
                {payMethod === "upi" ? "UPI · " + (upiId || "Paid") : payMethod === "cash" ? "Cash to driver" : "Card"}
              </Text>
            </View>
          </View>

          <View style={s.savingsTag}>
            <Text style={s.savingsTxt}>
              {"🌿 You saved ₹" + Math.max(0, Math.round((selectedRide.distance / 1000) * 15) - selectedRide.farePerSeat) + " and reduced carbon emissions today"}
            </Text>
          </View>

          <TouchableOpacity style={[s.primaryBtn, { marginBottom: 10 }]} onPress={handleStartTracking} activeOpacity={0.85}>
            <Text style={s.primaryTxt}>{"🛺  Track My Ride"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.ghostBtn} onPress={handleReset} activeOpacity={0.8}>
            <Text style={s.ghostBtnTxt}>Back to Home</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── TRACKING PANEL ── */}
      {screen === "tracking" && selectedRide && (
        <Animated.View style={[s.trackingPanel, { transform: [{ translateY: trackingPanelY }] }]}>
          <View style={s.handle} />

          {/* ETA banner */}
          <View style={[s.etaBanner, trackPhase === "arrived" && s.etaBannerGreen]}>
            <View style={s.etaLeft}>
              <Text style={s.etaNum}>
                {trackPhase === "arriving" ? String(etaMin) : trackPhase === "onway" ? "🚗" : "🎉"}
              </Text>
              <Text style={s.etaSub}>
                {trackPhase === "arriving" ? "min away" : trackPhase === "onway" ? "On the way" : "Arrived!"}
              </Text>
            </View>
            <View style={s.etaRight}>
              <Text style={s.etaRouteTxt} numberOfLines={1}>{"📍 " + selectedRide.origin.name}</Text>
              <View style={s.etaRouteConnector} />
              <Text style={s.etaRouteTxt} numberOfLines={1}>{"🏁 " + selectedRide.destination.name}</Text>
            </View>
          </View>

          {/* Driver card */}
          <View style={s.trackDriverCard}>
            <View style={s.trackDriverIcon}>
              <Text style={{ fontSize: 22 }}>🧑‍✈️</Text>
            </View>
            <View style={s.trackDriverInfo}>
              <Text style={s.trackDriverName}>{selectedRide.driverName}</Text>
              <Text style={s.trackDriverNum}>{selectedRide.autoNumber + " · " + selectedRide.autoModel}</Text>
            </View>
            <View style={s.trackFareBadge}>
              <Text style={s.trackFareTxt}>{"₹" + selectedRide.farePerSeat}</Text>
            </View>
          </View>

          <View style={s.trackDivider} />

          {/* Safety row */}
          <View style={s.safetyRow}>
            <TouchableOpacity
              style={s.safetyBtn}
              onPress={() => Alert.alert("Trip Shared", "Details sent to your emergency contact.")}
              activeOpacity={0.8}
            >
              <Text style={s.safetyIcon}>🔗</Text>
              <Text style={s.safetyLabel}>Share Trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.safetyBtn, s.safetyBtnSOS]}
              onPress={() => Alert.alert("SOS", "Emergency services have been notified.")}
              activeOpacity={0.8}
            >
              <Text style={s.safetyIcon}>🚨</Text>
              <Text style={[s.safetyLabel, { color: C.red }]}>SOS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.safetyBtn} onPress={handleReset} activeOpacity={0.8}>
              <Text style={s.safetyIcon}>✓</Text>
              <Text style={s.safetyLabel}>End Trip</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  map: { flex: 1 },

  // ── Top bar — cleaner pill styles ──────────────────────────────────────────
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === "ios" ? 52 : 42,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  topBarInner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  // App name pill — slightly heavier so it stands out on map
  appNameWrap: {
    backgroundColor: C.accent,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 4,
    elevation: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  appName: { fontSize: 15, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },

  // Profile button — white pill with border
  profileBtn: {
    backgroundColor: C.white,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1, borderColor: C.border,
    elevation: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    flexDirection: "row", alignItems: "center",
  },
  profileBtnTxt: { fontSize: 13, fontWeight: "600", color: C.text1 },

  // Distance chip
  distChip: {
    backgroundColor: C.blue + "18",
    borderWidth: 1, borderColor: C.blue + "44",
    paddingHorizontal: 10, paddingVertical: 6,
    marginBottom: 10, alignSelf: "flex-start",
  },
  distChipTxt: { fontSize: 12, fontWeight: "600", color: C.blue },

  routePill: {
    position: "absolute",
    bottom: 0,
    alignSelf: "center",
    backgroundColor: C.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4, borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  routePillTxt: { fontSize: 13, fontWeight: "700", color: C.text1 },

  routeLoadingOverlay: {
    position: "absolute", bottom: 0, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.white + "EE", paddingHorizontal: 16, paddingVertical: 8,
    borderTopLeftRadius: 6, borderTopRightRadius: 6, elevation: 4,
  },
  routeLoadingTxt: { fontSize: 12, color: C.text3 },

  // LIVE badge
  liveBadge: {
    position: "absolute", top: Platform.OS === "ios" ? 52 : 42, alignSelf: "center",
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 7,
    elevation: 4, gap: 7, borderWidth: 1, borderColor: C.border,
  },
  liveBadgeDot: {
    width: 8, height: 8,
    borderRadius: 4,

    backgroundColor: C.green
  },

  liveBadgeTxt: { fontSize: 11, fontWeight: "700", color: C.green, letterSpacing: 0.5 },

  panel: {
    backgroundColor: C.white, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30,
    maxHeight: "52%", elevation: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10,
  },
  payPanel: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: C.white, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30,
    maxHeight: "78%", elevation: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 14,
  },
  handle: { width: 32, height: 3, backgroundColor: C.border, alignSelf: "center", marginBottom: 16 },
  heading: { fontSize: 19, fontWeight: "700", color: C.text1, marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontWeight: "700", color: C.text3, letterSpacing: 1, marginBottom: 8, marginTop: 4 },

  searchBox: { borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg, marginBottom: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13 },
  searchDivider: { height: 1, backgroundColor: C.border, marginLeft: 38 },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.green, marginRight: 13 },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red, marginRight: 13 },
  searchVal: { fontSize: 14, fontWeight: "500", color: C.text1 },
  searchInput: { fontSize: 14, fontWeight: "500", color: C.text1, padding: 0 },

  resultBox: { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, marginBottom: 8 },
  searchingRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  searchingTxt: { fontSize: 13, color: C.text3 },
  resultRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 14 },
  resultBorder: { borderTopWidth: 1, borderColor: C.border },
  resultPin: { width: 28, height: 28, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", marginRight: 12 },
  resultName: { fontSize: 14, fontWeight: "500", color: C.text1 },
  resultAddr: { fontSize: 11, color: C.text3, marginTop: 1 },

  savedRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderColor: C.border },
  savedIcon: { width: 34, height: 34, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", marginRight: 12 },
  savedName: { fontSize: 14, fontWeight: "600", color: C.text1 },
  savedAddr: { fontSize: 11, color: C.text3, marginTop: 1 },

  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: C.white, maxHeight: SH * 0.65, elevation: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16,
  },
  sheetHandle: { width: 32, height: 3, backgroundColor: C.border, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: C.text1 },
  sheetSub: { fontSize: 12, color: C.text3, marginTop: 2 },
  sheetCloseBtn: { width: 30, height: 30, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center" },
  sheetCloseTxt: { fontSize: 14, color: C.text2, fontWeight: "600" },
  sheetDivider: { height: 1, backgroundColor: C.border },
  sheetLoading: { flexDirection: "row", alignItems: "center", padding: 20, gap: 12 },
  sheetLoadingTxt: { fontSize: 14, color: C.text3 },

  ridesList: { paddingHorizontal: 20 },
  rideItem: { flexDirection: "row", alignItems: "center", paddingVertical: 16 },
  rideItemBorder: { borderTopWidth: 1, borderColor: C.border },
  rideItemLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", marginRight: 12 },
  rideAutoIcon: { width: 44, height: 44, backgroundColor: C.goldBg, justifyContent: "center", alignItems: "center", marginRight: 12 },
  rideAutoNum: { fontSize: 14, fontWeight: "700", color: C.text1, marginBottom: 2 },
  rideAutoModel: { fontSize: 12, color: C.text3, marginBottom: 6 },
  rideTags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  rideBadge: { backgroundColor: C.greenBg, paddingHorizontal: 7, paddingVertical: 2 },
  rideBadgeRed: { backgroundColor: C.redBg },
  rideBadgeTxt: { fontSize: 10, fontWeight: "700", color: C.green },
  rideBadgeTxtRed: { color: C.red },
  rideItemRight: { alignItems: "center", minWidth: 72 },
  rideFare: { fontSize: 20, fontWeight: "800", color: C.text1 },
  rideFareLabel: { fontSize: 10, color: C.text3, marginBottom: 8 },
  bookBtn: { backgroundColor: C.green, paddingVertical: 10, paddingHorizontal: 18, minWidth: 72, alignItems: "center" },
  bookBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "800" },

  payHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  backBtn: { width: 32, height: 32, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center" },
  backBtnTxt: { fontSize: 17, color: C.text1, fontWeight: "600" },
  paySummaryCard: { borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  paySummaryRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  paySummaryIcon: { fontSize: 28 },
  paySummaryNum: { fontSize: 14, fontWeight: "700", color: C.text1 },
  paySummaryDriver: { fontSize: 12, color: C.text3, marginTop: 2 },
  payFareTag: { backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 5 },
  payFareTagTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  paySummaryDivider: { height: 1, backgroundColor: C.border },
  payRouteRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, gap: 10 },
  payRouteDot: { width: 8, height: 8, borderRadius: 4 },
  payRouteTxt: { fontSize: 12, color: C.text2, fontWeight: "500", flex: 1 },
  payRouteConnector: { height: 1, backgroundColor: C.border, marginLeft: 32 },
  fareBreakCard: { borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  fareBreakRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  fareBreakDivider: { height: 1, backgroundColor: C.border },
  fareBreakLabel: { fontSize: 13, color: C.text3 },
  fareBreakVal: { fontSize: 14, fontWeight: "600", color: C.text2 },
  savingsTag: { backgroundColor: C.greenBg, padding: 12, marginBottom: 14 },
  savingsTxt: { fontSize: 12, color: C.green, fontWeight: "600", lineHeight: 18 },
  payMethodRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  payMethodBtn: { flex: 1, borderWidth: 1.5, borderColor: C.border, paddingVertical: 12, alignItems: "center", backgroundColor: C.white },
  payMethodBtnOn: { borderColor: C.accent, backgroundColor: "#F0F0F0" },
  payMethodIcon: { fontSize: 20, marginBottom: 4 },
  payMethodLabel: { fontSize: 12, fontWeight: "600", color: C.text3 },
  payMethodLabelOn: { color: C.text1 },
  upiBox: { borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  upiInput: { fontSize: 14, color: C.text1, paddingHorizontal: 14, paddingVertical: 13 },
  cashNote: { borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14, backgroundColor: C.goldBg },
  cashNoteTxt: { fontSize: 13, color: C.gold, fontWeight: "500", lineHeight: 20 },
  payBtn: { backgroundColor: C.green, paddingVertical: 15, alignItems: "center" },
  payBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },

  confirmedHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  confirmedIconBig: { width: 56, height: 56, backgroundColor: C.greenBg, justifyContent: "center", alignItems: "center" },
  confirmedTitle: { fontSize: 18, fontWeight: "700", color: C.text1 },
  confirmedRef: { fontSize: 12, color: C.text3, marginTop: 3, fontWeight: "500" },
  ticketCard: { borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  ticketRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  ticketDivider: { height: 1, backgroundColor: C.border },
  ticketLabel: { fontSize: 12, color: C.text3, fontWeight: "500" },
  ticketVal: { fontSize: 13, fontWeight: "600", color: C.text1, flex: 1, textAlign: "right" },
  primaryBtn: { backgroundColor: C.accent, paddingVertical: 14, alignItems: "center" },
  primaryTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  ghostBtn: { borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: "center" },
  ghostBtnTxt: { fontSize: 14, fontWeight: "600", color: C.text2 },

  // ── Tracking panel ────────────────────────────────────────────────────────
  trackingPanel: {
    backgroundColor: C.white, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28,
    elevation: 20, shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 12,
  },
  etaBanner: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12, backgroundColor: "#F9F9F9",
  },
  etaBannerGreen: { borderColor: C.green, backgroundColor: C.greenBg },
  etaLeft: { marginRight: 16, alignItems: "center", minWidth: 52 },
  etaNum: { fontSize: 38, fontWeight: "900", color: C.text1, lineHeight: 42 },
  etaSub: { fontSize: 10, color: C.text3, fontWeight: "600", marginTop: 2, textAlign: "center" },
  etaRight: { flex: 1 },
  etaRouteTxt: { fontSize: 12, color: C.text2, fontWeight: "500" },
  etaRouteConnector: { height: 8, width: 1, backgroundColor: C.border, marginLeft: 7, marginVertical: 3 },
  trackDriverCard: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  trackDriverIcon: { width: 44, height: 44, backgroundColor: C.goldBg, justifyContent: "center", alignItems: "center", marginRight: 12, borderWidth: 1, borderColor: C.border },
  trackDriverInfo: { flex: 1 },
  trackDriverName: { fontSize: 14, fontWeight: "700", color: C.text1, marginBottom: 2 },
  trackDriverNum: { fontSize: 12, color: C.text3 },
  trackFareBadge: { backgroundColor: C.accent, paddingHorizontal: 8, paddingVertical: 4 },
  trackFareTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
  trackDivider: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  safetyRow: { flexDirection: "row", gap: 10 },
  safetyBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: C.border, alignItems: "center", backgroundColor: C.white },
  safetyBtnSOS: { borderColor: C.red + "44", backgroundColor: C.redBg },
  safetyIcon: { fontSize: 18, marginBottom: 3 },
  safetyLabel: { fontSize: 11, fontWeight: "700", color: C.text3 },
});