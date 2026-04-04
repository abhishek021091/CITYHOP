import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, StyleSheet, TextInput, FlatList, TouchableOpacity,
  Text, Animated, ActivityIndicator, Alert,
  Platform, Keyboard, StatusBar, PermissionsAndroid, Dimensions, ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import MapplsGL from "mappls-map-react-native";
import Geolocation from "@react-native-community/geolocation";
import { getAuth } from "@react-native-firebase/auth";
import {
  getFirestore, collection, addDoc, doc,
  updateDoc, serverTimestamp, getDoc, onSnapshot,
} from "@react-native-firebase/firestore";

const { width: SW } = Dimensions.get("window");

const C = {
  bg:        "#F4F4F4",
  white:     "#FFFFFF",
  border:    "#E5E5E5",
  borderMid: "#CCCCCC",
  accent:    "#1C1C1E",
  green:     "#1A8F5C",
  greenBg:   "#EAF7F1",
  red:       "#D93025",
  redBg:     "#FEF0EF",
  gold:      "#E69A00",
  goldBg:    "#FEF8EE",
  blue:      "#1A6BCC",
  text1:     "#111111",
  text2:     "#444444",
  text3:     "#888888",
  text4:     "#BBBBBB",
  inputBg:   "#FAFAFA",
};

type Coords       = [number, number];
type ActiveInput  = "pickup" | "drop" | null;
type DriverScreen = "home" | "setup" | "live" | "summary";

interface Place { placeName: string; placeAddress?: string; longitude: string; latitude: string; }
interface Route { distance: number; duration: number; coordinates: Coords[]; }

interface FakePassenger {
  id: string; name: string; phone: string;
  pickup: string; seats: number; joinedAt: string;
}

// ── Haversine distance (metres) ────────────────────────────────────────────
const haversineDistance = (a: Coords, b: Coords): number => {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// ── Generate fake passengers ───────────────────────────────────────────────
const generatePassengers = (origin: string, destination: string, totalSeats: number): FakePassenger[] => {
  const pool = [
    { name: "Priya Sharma",   phone: "98765 43210" },
    { name: "Amit Verma",     phone: "97654 32109" },
    { name: "Neha Singh",     phone: "96543 21098" },
    { name: "Rahul Gupta",    phone: "95432 10987" },
    { name: "Sunita Yadav",   phone: "94321 09876" },
  ];
  const count = Math.min(totalSeats, Math.floor(Math.random() * 2) + 1);
  return pool.slice(0, count).map((p, i) => ({
    id:       `pass_${i}_${Date.now()}`,
    name:     p.name,
    phone:    p.phone,
    pickup:   i === 0 ? origin : `Near ${origin}`,
    seats:    1,
    joinedAt: `${Math.floor(Math.random() * 3) + 1} min ago`,
  }));
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtDuration  = (s: number) => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const fmtDistance  = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const isValid      = (n: number) => !isNaN(n) && isFinite(n) && n !== 0;
const calcEarnings = (fare: number, seats: number) => fare * seats;

// ── Search ─────────────────────────────────────────────────────────────────
const searchPlaces = async (query: string, userLoc?: Coords): Promise<Place[]> => {
  try {
    const { autoSuggest } = (MapplsGL as any).RestApi;
    const params: any = { query };
    if (userLoc) params.location = { latitude: userLoc[1], longitude: userLoc[0] };
    const result = await autoSuggest(params);
    const list: any[] = result?.suggestedLocations || [];
    return list
      .map((item: any) => ({
        placeName:    item.placeName    || item.alternateName || "Unknown",
        placeAddress: item.placeAddress || item.addressTokens?.city || "",
        longitude:    String(item.longitude ?? item.lng ?? ""),
        latitude:     String(item.latitude  ?? item.lat ?? ""),
      }))
      .filter(p => isValid(parseFloat(p.longitude)) && isValid(parseFloat(p.latitude)));
  } catch (e) { console.warn("[search]", e); return []; }
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
      origin:      { latitude: o[1], longitude: o[0] },
      destination: { latitude: d[1], longitude: d[0] },
      alternatives: false, geometries: "geojson", overview: "full", steps: false,
    });
    const route = res?.routes?.[0]; if (!route) return null;
    let coords: Coords[] = [];
    if (route.geometry?.coordinates?.length)    coords = route.geometry.coordinates;
    else if (typeof route.geometry === "string") coords = decodePolyline(route.geometry);
    return { distance: route.distance ?? 0, duration: route.duration ?? 0, coordinates: coords };
  } catch (e) { console.warn("[route]", e); return null; }
};

// ── Markers ────────────────────────────────────────────────────────────────
const PickupMarker = () => (
  <View style={{ alignItems: "center" }}>
    <View style={{
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: C.green + "33",
      justifyContent: "center", alignItems: "center",
    }}>
      <View style={{
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: C.green, borderWidth: 2.5, borderColor: "#fff",
        elevation: 6,
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
      }} />
    </View>
  </View>
);

const DropMarker = () => (
  <View style={{ alignItems: "center" }}>
    <View style={{
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: C.gold, borderWidth: 3, borderColor: "#fff",
      justifyContent: "center", alignItems: "center",
      elevation: 8,
      shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 4,
    }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
    </View>
    <View style={{
      width: 3, height: 10, backgroundColor: C.gold,
      borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
    }} />
    <View style={{ width: 8, height: 3, borderRadius: 4, backgroundColor: "#00000030", marginTop: 1 }} />
  </View>
);

const DriverMarker = () => (
  <View style={{ alignItems: "center" }}>
    <View style={{
      backgroundColor: C.white, borderWidth: 2, borderColor: C.gold,
      paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
      elevation: 8,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
    }}>
      <Text style={{ fontSize: 22 }}>🛺</Text>
    </View>
    <View style={{
      width: 0, height: 0,
      borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7,
      borderLeftColor: "transparent", borderRightColor: "transparent",
      borderTopColor: C.gold, marginTop: -1,
    }} />
  </View>
);

interface Props { navigation?: any; route?: any; }

export default function DriverHome({ navigation }: Props) {
  const mapCamera       = useRef<any>(null);
  const panelY          = useRef(new Animated.Value(400)).current;
  const passengerSheetY = useRef(new Animated.Value(600)).current;
  const locationWatcher = useRef<number | null>(null);

  // Keep a ref mirror of pickup/drop/route so handleGoLive always reads latest values
  // even if called before React re-render flushes
  const pickupRef = useRef<Place | null>(null);
  const dropRef   = useRef<Place | null>(null);
  const routeRef  = useRef<Route | null>(null);

  const auth = getAuth();
  const db   = getFirestore();
  const currentUser = auth.currentUser;

  const [screen, setScreen]               = useState<DriverScreen>("home");
  const [activeInput, setActiveInput]     = useState<ActiveInput>(null);
  const [pickup, setPickup]               = useState<Place | null>(null);
  const [drop, setDrop]                   = useState<Place | null>(null);
  const [pickupQuery, setPickupQuery]     = useState("Current Location");
  const [dropQuery, setDropQuery]         = useState("");
 const [currentLocation, setCurrentLocation] = useState<Coords>([78.1746, 26.2485]);

  const [driverLiveLocation, setDriverLiveLocation] = useState<Coords | null>(null);
  const [userLoc, setUserLoc]             = useState<Coords | undefined>(undefined);
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [searching, setSearching]         = useState(false);
  const [route, setRoute]                 = useState<Route | null>(null);
  const [routeLoading, setRouteLoading]   = useState(false);
  const [totalSeats, setTotalSeats]       = useState(2);
  const [fare, setFare]                   = useState("");
  const [autoNumber, setAutoNumber]       = useState("");
  const [autoModel, setAutoModel]         = useState("");
  const [activeRideId, setActiveRideId]   = useState<string | null>(null);
  const [bookedSeats, setBookedSeats]     = useState(0);
  const [passengers, setPassengers]       = useState<string[]>([]);
  const [goingLive, setGoingLive]         = useState(false);
  const [driverName, setDriverName]       = useState("Driver");
  const [driverPhone, setDriverPhone]     = useState("");

  const [fakePassengers, setFakePassengers]           = useState<FakePassenger[]>([]);
  const [showPassengerSheet, setShowPassengerSheet]   = useState(false);
  const [confirmedPassengers, setConfirmedPassengers] = useState<FakePassenger[]>([]);

  // Keep refs in sync with state so handleGoLive can always read latest values
  const setPickupSynced = (p: Place | null) => { pickupRef.current = p; setPickup(p); };
  const setDropSynced   = (d: Place | null) => { dropRef.current   = d; setDrop(d);   };
  const setRouteSynced  = (r: Route | null) => { routeRef.current  = r; setRoute(r);  };

  // GPS
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
          setCurrentLocation(c); setUserLoc(c); setDriverLiveLocation(c);
          const loc: Place = { placeName: "Current Location", longitude: String(c[0]), latitude: String(c[1]) };
          setPickupSynced(loc);
          setPickupQuery("Current Location");
          mapCamera.current?.setCamera({ centerCoordinate: c, zoomLevel: 14, animationDuration: 1000 });
        },
        err => console.warn("GPS:", err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    })();
    return () => { if (locationWatcher.current !== null) Geolocation.clearWatch(locationWatcher.current); };
  }, []);

  // Load driver profile
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "drivers", currentUser.uid));
        if (snap.exists()) {
          const data = snap.data() as any;
          setDriverName(data.name    || "Driver");
          setAutoNumber(data.vehicle || "");
          setDriverPhone(data.phone  || "");
        }
      } catch (e) { console.warn("profile", e); }
    })();
  }, []);

  // Panel slide
  useEffect(() => {
    panelY.setValue(400);
    Animated.spring(panelY, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }).start();
  }, [screen]);

  // Real-time ride listener
  useEffect(() => {
    if (!activeRideId) return;
    const unsub = onSnapshot(doc(db, "rides", activeRideId), (snap: any) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setBookedSeats(data.bookedSeats || 0);
      setPassengers(data.passengers  || []);
    });
    return () => unsub();
  }, [activeRideId]);

  const openPassengerSheet = (pList: FakePassenger[]) => {
    setFakePassengers(pList);
    setShowPassengerSheet(true);
    Animated.spring(passengerSheetY, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }).start();
  };
  const closePassengerSheet = () => {
    Animated.timing(passengerSheetY, { toValue: 600, duration: 250, useNativeDriver: true }).start(() => setShowPassengerSheet(false));
  };

  const startLocationTracking = (rideId: string) => {
    locationWatcher.current = Geolocation.watchPosition(
      pos => {
        const c: Coords = [pos.coords.longitude, pos.coords.latitude];
        setDriverLiveLocation(c);
        updateDoc(doc(db, "rides", rideId), {
          driverLocation: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        }).catch(() => {});
      },
      err => console.warn("watch:", err.message),
      { enableHighAccuracy: true, distanceFilter: 50, interval: 30000 }
    );
  };

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

    if (activeInput === "pickup") {
      setPickupSynced(updated);
      setPickupQuery(item.placeName);
    } else {
      setDropSynced(updated);
      setDropQuery(item.placeName);
    }

    mapCamera.current?.setCamera({ centerCoordinate: coords, zoomLevel: 14, animationDuration: 800 });
    setActiveInput(null);

    const np = activeInput === "pickup" ? updated : pickupRef.current;
    const nd = activeInput === "drop"   ? updated : dropRef.current;

    if (np && nd) {
      const pLng = parseFloat(np.longitude), pLat = parseFloat(np.latitude);
      const dLng = parseFloat(nd.longitude), dLat = parseFloat(nd.latitude);
      if (!isValid(pLng) || !isValid(pLat) || !isValid(dLng) || !isValid(dLat)) return;
      setRouteLoading(true);
      const r = await fetchRoute([pLng, pLat], [dLng, dLat]);
      setRouteSynced(r);
      setRouteLoading(false);
      mapCamera.current?.fitBounds([pLng, pLat], [dLng, dLat], [100, 50, 240, 50], 1000);
      setScreen("setup");
    }
  }, [activeInput, currentLocation]);

  // ── Go Live — uses refs so it's never stale ────────────────────────────
  const handleGoLive = async () => {
    // Read from refs (always current) rather than state (may lag one render)
    const currentPickup = pickupRef.current;
    const currentDrop   = dropRef.current;
    const currentRoute  = routeRef.current;

    // Only real blockers — no destination at all
    if (!currentPickup || !pickupQuery.trim()) {
      Alert.alert("Missing info", "Set your pickup location first"); return;
    }
    if (!currentDrop || !dropQuery.trim()) {
      Alert.alert("Missing info", "Enter your destination first"); return;
    }
    if (!autoNumber.trim()) {
      Alert.alert("Missing info", "Enter your auto number"); return;
    }
    if (!fare || isNaN(Number(fare)) || Number(fare) <= 0) {
      Alert.alert("Missing info", "Enter a valid fare per seat"); return;
    }
    if (!currentUser) return;

    const pLng = parseFloat(currentPickup.longitude), pLat = parseFloat(currentPickup.latitude);
    const dLng = parseFloat(currentDrop.longitude),   dLat = parseFloat(currentDrop.latitude);

    // Use route if available, else fall back to haversine estimate
    const dist = currentRoute?.distance || haversineDistance([pLng, pLat], [dLng, dLat]);
    const dur  = currentRoute?.duration || Math.round(dist / 8); // rough 8 m/s average speed

    setGoingLive(true);
    try {
      const docRef = await addDoc(collection(db, "rides"), {
        driverUid:   currentUser.uid,
        driverName, driverPhone,
        autoNumber:  autoNumber.trim().toUpperCase(),
        autoModel:   autoModel.trim(),
        origin:      { name: currentPickup.placeName, latitude: pLat, longitude: pLng },
        destination: { name: currentDrop.placeName,   latitude: dLat, longitude: dLng },
        totalSeats, bookedSeats: 0, passengers: [],
        farePerSeat: Number(fare),
        distance: dist, duration: dur,
        status: "active",
        driverLocation: { latitude: pLat, longitude: pLng },
        createdAt: serverTimestamp(),
      });
      setActiveRideId(docRef.id);
      startLocationTracking(docRef.id);
      setScreen("live");

      // Show fake passenger requests after 2.5 s
      setTimeout(() => {
        const generated = generatePassengers(currentPickup.placeName, currentDrop.placeName, totalSeats);
        openPassengerSheet(generated);
      }, 2500);

    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setGoingLive(false);
    }
  };

  const handleAcceptPassenger = (passenger: FakePassenger) => {
    setConfirmedPassengers(prev => {
      const already = prev.find(p => p.id === passenger.id);
      if (already) return prev;
      const updated = [...prev, passenger];
      setBookedSeats(updated.length);
      return updated;
    });
    setFakePassengers(prev => prev.filter(p => p.id !== passenger.id));
  };

  const incrementSeats = () => {
    if (bookedSeats < totalSeats) {
      const newVal = bookedSeats + 1;
      setBookedSeats(newVal);
      if (activeRideId) updateDoc(doc(db, "rides", activeRideId), { bookedSeats: newVal }).catch(() => {});
    }
  };
  const decrementSeats = () => {
    if (bookedSeats > 0) {
      const newVal = bookedSeats - 1;
      setBookedSeats(newVal);
      if (activeRideId) updateDoc(doc(db, "rides", activeRideId), { bookedSeats: newVal }).catch(() => {});
    }
  };

  const handleEndRide = () => {
    Alert.alert(
      "End Ride",
      `End this ride with ${bookedSeats} passenger${bookedSeats !== 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Ride", style: "destructive",
          onPress: async () => {
            try {
              if (activeRideId) await updateDoc(doc(db, "rides", activeRideId), { status: "completed" });
              if (locationWatcher.current !== null) Geolocation.clearWatch(locationWatcher.current);
              setScreen("summary");
            } catch (e: any) { Alert.alert("Error", e.message); }
          },
        },
      ]
    );
  };

  const handleNewRide = () => {
    setPickupSynced(null); setDropSynced(null);
    setPickupQuery("Current Location"); setDropQuery(""); setRouteSynced(null);
    setFare(""); setBookedSeats(0); setPassengers([]);
    setActiveRideId(null); setConfirmedPassengers([]);
    setScreen("home");
  };

  const pickupCoords: Coords = (() => {
    const p = pickupRef.current || pickup;
    if (!p) return currentLocation;
    const lng = parseFloat(p.longitude), lat = parseFloat(p.latitude);
    return isValid(lng) && isValid(lat) ? [lng, lat] : currentLocation;
  })();
  const dropCoords: Coords | null = (() => {
    const d = dropRef.current || drop;
    if (!d) return null;
    const lng = parseFloat(d.longitude), lat = parseFloat(d.latitude);
    return isValid(lng) && isValid(lat) ? [lng, lat] : null;
  })();

  const seatsLeft     = totalSeats - bookedSeats;
  const totalEarnings = calcEarnings(Number(fare) || 0, bookedSeats);
  const isFull        = bookedSeats >= totalSeats;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* MAP */}
      <View style={s.map}>
        <MapplsGL.MapView style={StyleSheet.absoluteFill} logoEnabled={false} compassEnabled>
          <MapplsGL.Camera ref={mapCamera} zoomLevel={14} centerCoordinate={currentLocation} />
          {route && route.coordinates.length > 1 && (
            <MapplsGL.ShapeSource id="routeSource" shape={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coordinates } }}>
              <MapplsGL.LineLayer id="routeCasing" style={{ lineColor: "#fff",  lineWidth: 8, lineCap: "round", lineJoin: "round" }} layerIndex={10} />
              <MapplsGL.LineLayer id="routeLine"   style={{ lineColor: C.gold, lineWidth: 4, lineCap: "round", lineJoin: "round" }} layerIndex={11} />
            </MapplsGL.ShapeSource>
          )}
          <MapplsGL.PointAnnotation id="pickup" coordinate={pickupCoords}>
            <PickupMarker />
          </MapplsGL.PointAnnotation>
          {dropCoords && (
            <MapplsGL.PointAnnotation id="drop" coordinate={dropCoords}>
              <DropMarker />
            </MapplsGL.PointAnnotation>
          )}
          {screen === "live" && driverLiveLocation && (
            <MapplsGL.PointAnnotation id="driverLive" coordinate={driverLiveLocation}>
              <DriverMarker />
            </MapplsGL.PointAnnotation>
          )}
        </MapplsGL.MapView>

        {/* Top bar */}
        <View style={s.topBar} pointerEvents="box-none">
          <View style={s.topBarInner}>
            <View style={s.appNameWrap}>
              <Text style={s.appName}>🛺CityHop</Text>
              <View style={s.driverBadgeWrap}>
                <Text style={s.driverBadgeTxt}>DRIVER</Text>
              </View>
            </View>
            <TouchableOpacity
              style={s.profileBtn}
              onPress={() => navigation && navigation.navigate("DriverProfile")}
              activeOpacity={0.8}
            >
              <Text style={s.profileBtnTxt}>👤  Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {route && screen === "setup" && (
          <View style={s.routePill}>
            <Text style={s.routePillTxt}>{fmtDuration(route.duration)}  ·  {fmtDistance(route.distance)}</Text>
          </View>
        )}
        {screen === "live" && (
          <View style={s.liveBadge}>
            <View style={s.liveBadgeDot} />
            <Text style={s.liveBadgeTxt}>{"LIVE  ·  " + seatsLeft + " seat" + (seatsLeft !== 1 ? "s" : "") + " left"}</Text>
          </View>
        )}
      </View>

      {/* PANEL */}
      <Animated.View style={[s.panel, { transform: [{ translateY: panelY }] }]}>
        <View style={s.handle} />

        {/* ── HOME ── */}
        {screen === "home" && (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.panelScrollContent}
            nestedScrollEnabled
          >
            <Text style={s.greeting}>{"Hello, " + driverName + " 👋"}</Text>
            <Text style={s.heading}>Set your route</Text>
            <View style={s.searchBox}>
              <TouchableOpacity style={s.searchRow} onPress={() => setActiveInput("pickup")} activeOpacity={0.7}>
                <View style={s.dotGreen} />
                <View style={{ flex: 1 }}>
                  {activeInput === "pickup"
                    ? <TextInput style={s.searchInput} autoFocus value={pickupQuery} onChangeText={t => handleSearch(t, "pickup")} placeholderTextColor={C.text4} />
                    : <Text style={s.searchVal} numberOfLines={1}>{pickupQuery}</Text>}
                </View>
                <Text style={s.searchLabel}>FROM</Text>
              </TouchableOpacity>
              <View style={s.searchDivider} />
              <TouchableOpacity style={s.searchRow} onPress={() => setActiveInput("drop")} activeOpacity={0.7}>
                <View style={s.dotGold} />
                <View style={{ flex: 1 }}>
                  {activeInput === "drop"
                    ? <TextInput style={s.searchInput} autoFocus value={dropQuery} onChangeText={t => handleSearch(t, "drop")} placeholder="Where are you going?" placeholderTextColor={C.text4} />
                    : <Text style={[s.searchVal, !dropQuery && { color: C.text4 }]} numberOfLines={1}>{dropQuery || "Where are you going?"}</Text>}
                </View>
                <Text style={s.searchLabel}>TO</Text>
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
                  scrollEnabled={false}
                  data={searchResults.slice(0, 6)} keyExtractor={(_, i) => i.toString()} keyboardShouldPersistTaps="handled"
                  renderItem={({ item, index }) => (
                    <TouchableOpacity style={[s.resultRow, index > 0 && s.resultBorder]} onPress={() => handleSelectPlace(item)} activeOpacity={0.6}>
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
          </ScrollView>
        )}

        {/* ── SETUP ── */}
        {screen === "setup" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          >
            <View style={s.rowHeader}>
              <TouchableOpacity style={s.backBtn} onPress={() => setScreen("home")}>
                <Text style={s.backBtnTxt}>←</Text>
              </TouchableOpacity>
              <View>
                <Text style={s.heading}>Ride setup</Text>
                {route && <Text style={s.subTxt}>{fmtDistance(route.distance)} · {fmtDuration(route.duration)}</Text>}
              </View>
            </View>

            <View style={s.routeSummary}>
              <View style={s.routePoint}>
                <View style={[s.routeDot, { backgroundColor: C.green }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.routePointLabel}>FROM</Text>
                  <Text style={s.routePointName} numberOfLines={1}>{pickupQuery}</Text>
                </View>
              </View>
              <View style={s.routeConnector} />
              <View style={s.routePoint}>
                <View style={[s.routeDot, { backgroundColor: C.gold }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.routePointLabel}>TO</Text>
                  <Text style={s.routePointName} numberOfLines={1}>{dropQuery}</Text>
                </View>
              </View>
            </View>

            <Text style={s.fieldLabel}>AUTO DETAILS</Text>
            <View style={s.inputGroup}>
              <View style={s.inputRow}>
                <Text style={s.inputIcon}>🚗</Text>
                <TextInput
                  style={s.fieldInput}
                  placeholder="Auto number  (e.g. UP 65 AB 1234)"
                  placeholderTextColor={C.text4}
                  value={autoNumber}
                  onChangeText={t => setAutoNumber(t.toUpperCase())}
                  autoCapitalize="characters"
                />
              </View>
              <View style={s.fieldDivider} />
              <View style={s.inputRow}>
                <Text style={s.inputIcon}>🛺</Text>
                <TextInput
                  style={s.fieldInput}
                  placeholder="Auto model  (e.g. Bajaj RE, Piaggio)"
                  placeholderTextColor={C.text4}
                  value={autoModel}
                  onChangeText={setAutoModel}
                />
              </View>
            </View>

            <Text style={s.fieldLabel}>AVAILABLE SEATS FOR SHARING</Text>
            <View style={s.seatsRow}>
              {[1, 2, 3].map(n => (
                <TouchableOpacity key={n} style={[s.seatBtn, totalSeats === n && s.seatBtnOn]} onPress={() => setTotalSeats(n)} activeOpacity={0.8}>
                  <Text style={[s.seatNum, totalSeats === n && s.seatNumOn]}>{n}</Text>
                  <Text style={[s.seatLbl, totalSeats === n && s.seatLblOn]}>{n === 1 ? "seat" : "seats"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>FARE PER SEAT (₹)</Text>
            <View style={s.fareInputBox}>
              <Text style={s.fareRupee}>₹</Text>
              <TextInput
                style={s.fareInput}
                placeholder="0"
                placeholderTextColor={C.text4}
                value={fare}
                onChangeText={setFare}
                keyboardType="numeric"
              />
              <Text style={s.farePerSeat}>per seat</Text>
            </View>

            {fare && Number(fare) > 0 && (
              <View style={s.earningsPreview}>
                <View style={s.earningsRow}>
                  <Text style={s.earningsLabel}>{"If " + totalSeats + " seat" + (totalSeats > 1 ? "s" : "") + " filled"}</Text>
                  <Text style={s.earningsVal}>{"₹" + (Number(fare) * totalSeats)}</Text>
                </View>
                <View style={s.earningsDivider} />
                <View style={s.earningsRow}>
                  <Text style={s.earningsLabel}>Passenger saves ≈</Text>
                  <Text style={[s.earningsSubVal, { color: C.green }]}>
                    {"₹" + (route ? Math.round((route.distance / 1000) * 15) - Number(fare) : "—") + " each"}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[s.liveBtn, goingLive && { opacity: 0.6 }]}
              onPress={handleGoLive}
              disabled={goingLive}
              activeOpacity={0.85}
            >
              {goingLive
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <View style={s.liveBtnDot} />
                    <Text style={s.liveBtnTxt}>Go Live</Text>
                  </>
                )
              }
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </ScrollView>
        )}

        {/* ── LIVE ── */}
        {screen === "live" && (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Seat status */}
            <View style={s.seatStatusBar}>
              {Array.from({ length: totalSeats }).map((_, i) => (
                <View key={i} style={[s.seatSlot, i < bookedSeats && s.seatSlotFilled]}>
                  <Text style={s.seatSlotIcon}>{i < bookedSeats ? "👤" : "○"}</Text>
                </View>
              ))}
              <Text style={s.seatStatusTxt}>{isFull ? "Auto full" : seatsLeft + " left"}</Text>
            </View>

            {/* Stats */}
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statVal}>{bookedSeats}</Text>
                <Text style={s.statLbl}>Booked</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBox}>
                <Text style={s.statVal}>{seatsLeft}</Text>
                <Text style={s.statLbl}>Available</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBox}>
                <Text style={[s.statVal, { color: C.green }]}>{"₹" + totalEarnings}</Text>
                <Text style={s.statLbl}>Earned</Text>
              </View>
            </View>

            {/* Manual seat update */}
            <View style={s.seatUpdateRow}>
              <Text style={s.seatUpdateLabel}>Update occupied seats:</Text>
              <View style={s.seatCounter}>
                <TouchableOpacity style={s.seatCounterBtn} onPress={decrementSeats}>
                  <Text style={s.seatCounterBtnTxt}>−</Text>
                </TouchableOpacity>
                <Text style={s.seatCounterVal}>{bookedSeats}</Text>
                <TouchableOpacity
                  style={[s.seatCounterBtn, bookedSeats >= totalSeats && { opacity: 0.3 }]}
                  onPress={incrementSeats}
                  disabled={bookedSeats >= totalSeats}
                >
                  <Text style={s.seatCounterBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Auto info */}
            <View style={s.liveInfoCard}>
              <View style={s.liveInfoRow}>
                <Text style={s.liveInfoIcon}>🛺</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.liveAutoNum}>{autoNumber}</Text>
                  <Text style={s.liveAutoModel}>{autoModel || "Auto"}</Text>
                </View>
                <View style={[s.fareTag, isFull && s.fareTagFull]}>
                  <Text style={[s.fareTagTxt, isFull && s.fareTagTxtFull]}>{isFull ? "FULL" : "₹" + fare + "/seat"}</Text>
                </View>
              </View>
              <View style={s.liveInfoDivider} />
              <View style={s.liveRouteRow}>
                <View style={[s.liveRouteDot, { backgroundColor: C.green }]} />
                <Text style={s.liveRouteTxt} numberOfLines={1}>{pickupQuery.slice(0, 24)}</Text>
              </View>
              <View style={s.liveRouteConnector} />
              <View style={s.liveRouteRow}>
                <View style={[s.liveRouteDot, { backgroundColor: C.gold }]} />
                <Text style={s.liveRouteTxt} numberOfLines={1}>{dropQuery.slice(0, 24)}</Text>
              </View>
            </View>

            {/* Confirmed passengers */}
            {confirmedPassengers.length > 0 && (
              <>
                <Text style={s.fieldLabel}>{"CONFIRMED PASSENGERS  (" + confirmedPassengers.length + ")"}</Text>
                <View style={s.passBox}>
                  {confirmedPassengers.map((p, i) => (
                    <View key={p.id} style={[s.passRow, i > 0 && { borderTopWidth: 1, borderColor: C.border }]}>
                      <View style={s.passAvatar}><Text style={{ fontSize: 16 }}>👤</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.passName}>{p.name}</Text>
                        <Text style={s.passDetail}>{p.phone + "  ·  Boarded from " + p.pickup.slice(0, 20)}</Text>
                      </View>
                      <View style={s.confirmedBadge}>
                        <Text style={s.confirmedTxt}>✓ On board</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {confirmedPassengers.length === 0 && (
              <View style={s.waitBox}>
                <Text style={s.waitTxt}>Your ride is live 🟢</Text>
                <Text style={s.waitSub}>Passengers heading your way will see and book your auto</Text>
              </View>
            )}

            <TouchableOpacity style={s.endBtn} onPress={handleEndRide} activeOpacity={0.8}>
              <Text style={s.endTxt}>End Ride</Text>
            </TouchableOpacity>
            <View style={{ height: 16 }} />
          </ScrollView>
        )}

        {/* ── SUMMARY ── */}
        {screen === "summary" && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.summaryHeader}>
              <View style={s.summaryIconWrap}><Text style={{ fontSize: 30 }}>✅</Text></View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={s.summaryTitle}>Ride Completed!</Text>
                <Text style={s.summarySub}>{"Great job, " + driverName}</Text>
              </View>
            </View>

            <View style={s.earningsSummaryCard}>
              <Text style={s.earningsSummaryTitle}>EARNINGS SUMMARY</Text>
              <View style={s.earningsSummaryRow}>
                <Text style={s.earningsSummaryLabel}>Passengers carried</Text>
                <Text style={s.earningsSummaryVal}>{bookedSeats}</Text>
              </View>
              <View style={s.earningsSummaryDivider} />
              <View style={s.earningsSummaryRow}>
                <Text style={s.earningsSummaryLabel}>Fare per seat</Text>
                <Text style={s.earningsSummaryVal}>{"₹" + fare}</Text>
              </View>
              <View style={s.earningsSummaryDivider} />
              <View style={s.earningsSummaryRow}>
                <Text style={s.earningsSummaryLabel}>Total earned</Text>
                <Text style={[s.earningsSummaryVal, { fontSize: 22, color: C.green, fontWeight: "800" }]}>{"₹" + totalEarnings}</Text>
              </View>
              <View style={s.earningsSummaryDivider} />
              <View style={s.earningsSummaryRow}>
                <Text style={s.earningsSummaryLabel}>Route</Text>
                <Text style={[s.earningsSummaryVal, { flex: 1, textAlign: "right" }]} numberOfLines={2}>
                  {pickupQuery.slice(0, 18) + " → " + dropQuery.slice(0, 18)}
                </Text>
              </View>
            </View>

            {confirmedPassengers.length > 0 && (
              <View style={s.passBox}>
                <Text style={[s.fieldLabel, { paddingHorizontal: 0, marginBottom: 10 }]}>PASSENGERS CARRIED</Text>
                {confirmedPassengers.map((p, i) => (
                  <View key={p.id} style={[s.passRow, i > 0 && { borderTopWidth: 1, borderColor: C.border }]}>
                    <View style={s.passAvatar}><Text style={{ fontSize: 16 }}>👤</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.passName}>{p.name}</Text>
                      <Text style={s.passDetail}>{p.phone}</Text>
                    </View>
                    <Text style={[s.confirmedTxt, { color: C.green }]}>{"₹" + fare}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.impactBox}>
              <Text style={s.impactTxt}>
                {"🌿 By sharing your route, you helped reduce " + bookedSeats + " solo auto trips — saving fuel and reducing emissions."}
              </Text>
            </View>

            <TouchableOpacity style={s.liveBtn} onPress={handleNewRide}>
              <Text style={s.liveBtnTxt}>Start New Ride</Text>
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </ScrollView>
        )}
      </Animated.View>

      {/* ── PASSENGER REQUEST SHEET ── */}
      {showPassengerSheet && (
        <Animated.View style={[s.passengerSheet, { transform: [{ translateY: passengerSheetY }] }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View>
              <Text style={s.sheetTitle}>
                {fakePassengers.length > 0
                  ? fakePassengers.length + " passenger" + (fakePassengers.length !== 1 ? "s" : "") + " want to join"
                  : "No more requests"}
              </Text>
              <Text style={s.sheetSub}>Going your way — accept to board</Text>
            </View>
            <TouchableOpacity style={s.sheetCloseBtn} onPress={closePassengerSheet}>
              <Text style={s.sheetCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.sheetDivider} />

          {fakePassengers.length === 0 ? (
            <View style={s.sheetEmpty}>
              <Text style={s.sheetEmptyTxt}>All requests handled</Text>
              <TouchableOpacity style={s.sheetDoneBtn} onPress={closePassengerSheet}>
                <Text style={s.sheetDoneBtnTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              {fakePassengers.map((p, i) => (
                <View key={p.id} style={[s.requestItem, i > 0 && s.requestItemBorder]}>
                  <View style={s.requestLeft}>
                    <View style={s.requestAvatar}><Text style={{ fontSize: 20 }}>👤</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.requestName}>{p.name}</Text>
                      <Text style={s.requestDetail}>{p.phone}</Text>
                      <Text style={s.requestPickup}>{"📍 " + p.pickup.slice(0, 24)}</Text>
                      <Text style={s.requestTime}>{p.joinedAt}</Text>
                    </View>
                  </View>
                  <View style={s.requestActions}>
                    <TouchableOpacity
                      style={s.acceptBtn}
                      onPress={() => {
                        handleAcceptPassenger(p);
                        if (fakePassengers.length <= 1) closePassengerSheet();
                      }}
                    >
                      <Text style={s.acceptBtnTxt}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.declineBtn}
                      onPress={() => setFakePassengers(prev => prev.filter(x => x.id !== p.id))}
                    >
                      <Text style={s.declineBtnTxt}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      )}
    </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  map:            { flex: 1 },

  topBar:         { position: "absolute", top: 0, left: 0, right: 0, paddingTop: Platform.OS === "ios" ? 52 : 42, paddingHorizontal: 16, paddingBottom: 8 },
  topBarInner:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  // App name — dark pill matching passenger screen
  appNameWrap:    {
    backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 4, flexDirection: "row", alignItems: "center", gap: 8,
    elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  appName:        { fontSize: 15, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
  driverBadgeWrap:{ borderWidth: 1, borderColor: C.gold, paddingHorizontal: 5, paddingVertical: 1 },
  driverBadgeTxt: { fontSize: 9, fontWeight: "800", color: C.gold, letterSpacing: 1 },

  // Profile button — white pill
  profileBtn:     {
    backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 4, borderWidth: 1, borderColor: C.border,
    elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    flexDirection: "row", alignItems: "center",
  },
  profileBtnTxt:  { fontSize: 13, fontWeight: "600", color: C.text1 },

  routePill:      { position: "absolute", bottom: 0, alignSelf: "center", backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 8, elevation: 4, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  routePillTxt:   { fontSize: 13, fontWeight: "700", color: C.text1 },
  liveBadge:      { position: "absolute", top: Platform.OS === "ios" ? 52 : 42, alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 7, elevation: 4, gap: 7 },
  liveBadgeDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  liveBadgeTxt:   { fontSize: 12, fontWeight: "700", color: C.green, letterSpacing: 0.5 },

  panelScrollContent: { flexGrow: 1, paddingBottom: 12 },
  panel:          { backgroundColor: C.white, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, maxHeight: "60%", elevation: 18, shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10 },
  handle:         { width: 32, height: 3, backgroundColor: C.border, alignSelf: "center", marginBottom: 16 },
  greeting:       { fontSize: 12, color: C.text3, fontWeight: "500", marginBottom: 3 },
  heading:        { fontSize: 19, fontWeight: "700", color: C.text1, marginBottom: 12 },
  subTxt:         { fontSize: 12, color: C.text3, marginTop: 1 },
  fieldLabel:     { fontSize: 10, fontWeight: "700", color: C.text3, letterSpacing: 1, marginBottom: 8, marginTop: 4 },

  searchBox:      { borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg, marginBottom: 10 },
  searchRow:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13 },
  searchDivider:  { height: 1, backgroundColor: C.border, marginLeft: 38 },
  dotGreen:       { width: 10, height: 10, borderRadius: 5, backgroundColor: C.green, marginRight: 13 },
  dotGold:        { width: 10, height: 10, borderRadius: 5, backgroundColor: C.gold,  marginRight: 13 },
  searchVal:      { fontSize: 14, fontWeight: "500", color: C.text1, flex: 1 },
  searchInput:    { fontSize: 14, fontWeight: "500", color: C.text1, padding: 0, flex: 1 },
  searchLabel:    { fontSize: 9, fontWeight: "700", color: C.text4, letterSpacing: 1 },

  resultBox:      { borderWidth: 1, borderColor: C.border, backgroundColor: C.white, marginBottom: 8 },
  searchingRow:   { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  searchingTxt:   { fontSize: 13, color: C.text3 },
  resultRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 14 },
  resultBorder:   { borderTopWidth: 1, borderColor: C.border },
  resultPin:      { width: 28, height: 28, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", marginRight: 12 },
  resultName:     { fontSize: 14, fontWeight: "500", color: C.text1 },
  resultAddr:     { fontSize: 11, color: C.text3, marginTop: 1 },

  rowHeader:      { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backBtn:        { width: 32, height: 32, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center" },
  backBtnTxt:     { fontSize: 17, color: C.text1, fontWeight: "600" },

  routeSummary:   { borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16 },
  routePoint:     { flexDirection: "row", alignItems: "center", gap: 12 },
  routeDot:       { width: 10, height: 10, borderRadius: 5 },
  routePointLabel:{ fontSize: 9, fontWeight: "700", color: C.text4, letterSpacing: 1, marginBottom: 2 },
  routePointName: { fontSize: 13, fontWeight: "600", color: C.text1 },
  routeConnector: { height: 1, backgroundColor: C.border, marginLeft: 22, marginVertical: 8 },

  inputGroup:     { borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg, marginBottom: 14 },
  inputRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  inputIcon:      { fontSize: 16, marginRight: 10, paddingVertical: 13 },
  fieldInput:     { flex: 1, fontSize: 14, color: C.text1, paddingVertical: 13, fontWeight: "500" },
  fieldDivider:   { height: 1, backgroundColor: C.border, marginLeft: 44 },

  seatsRow:       { flexDirection: "row", gap: 8, marginBottom: 14 },
  seatBtn:        { flex: 1, paddingVertical: 12, borderWidth: 1.5, borderColor: C.border, alignItems: "center", backgroundColor: C.white },
  seatBtnOn:      { borderColor: C.accent, backgroundColor: "#F0F0F0" },
  seatNum:        { fontSize: 22, fontWeight: "800", color: C.text3 },
  seatNumOn:      { color: C.text1 },
  seatLbl:        { fontSize: 10, color: C.text4, marginTop: 2 },
  seatLblOn:      { color: C.text3 },

  fareInputBox:   { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg, paddingHorizontal: 14, marginBottom: 14, gap: 8 },
  fareRupee:      { fontSize: 26, fontWeight: "700", color: C.text3 },
  fareInput:      { flex: 1, fontSize: 32, fontWeight: "800", color: C.text1, paddingVertical: 12 },
  farePerSeat:    { fontSize: 13, color: C.text3, fontWeight: "500" },

  earningsPreview:{ borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  earningsRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  earningsDivider:{ height: 1, backgroundColor: C.border },
  earningsLabel:  { fontSize: 12, color: C.text3 },
  earningsVal:    { fontSize: 18, fontWeight: "800", color: C.text1 },
  earningsSubVal: { fontSize: 14, fontWeight: "600", color: C.text2 },

  liveBtn:        { backgroundColor: C.green, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 },
  liveBtnDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  liveBtnTxt:     { color: "#fff", fontSize: 15, fontWeight: "700" },

  seatStatusBar:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, paddingVertical: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14 },
  seatSlot:       { width: 32, height: 32, borderWidth: 1.5, borderColor: C.border, justifyContent: "center", alignItems: "center" },
  seatSlotFilled: { borderColor: C.green, backgroundColor: C.greenBg },
  seatSlotIcon:   { fontSize: 14 },
  seatStatusTxt:  { flex: 1, fontSize: 12, fontWeight: "600", color: C.text3, textAlign: "right" },

  seatUpdateRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 },
  seatUpdateLabel:{ fontSize: 13, fontWeight: "600", color: C.text2 },
  seatCounter:    { flexDirection: "row", alignItems: "center", gap: 16 },
  seatCounterBtn: { width: 36, height: 36, borderWidth: 1.5, borderColor: C.border, justifyContent: "center", alignItems: "center" },
  seatCounterBtnTxt:{ fontSize: 20, fontWeight: "700", color: C.text1 },
  seatCounterVal: { fontSize: 22, fontWeight: "800", color: C.text1, minWidth: 28, textAlign: "center" },

  statsRow:       { flexDirection: "row", borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  statBox:        { flex: 1, alignItems: "center", paddingVertical: 14 },
  statDivider:    { width: 1, backgroundColor: C.border },
  statVal:        { fontSize: 24, fontWeight: "800", color: C.text1, marginBottom: 3 },
  statLbl:        { fontSize: 10, color: C.text3, fontWeight: "600", letterSpacing: 0.5 },

  liveInfoCard:   { borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  liveInfoRow:    { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  liveInfoIcon:   { fontSize: 28 },
  liveAutoNum:    { fontSize: 15, fontWeight: "700", color: C.text1 },
  liveAutoModel:  { fontSize: 11, color: C.text3, marginTop: 2 },
  fareTag:        { borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 4 },
  fareTagFull:    { borderColor: C.red, backgroundColor: C.redBg },
  fareTagTxt:     { fontSize: 12, fontWeight: "700", color: C.text2 },
  fareTagTxtFull: { color: C.red },
  liveInfoDivider:{ height: 1, backgroundColor: C.border },
  liveRouteRow:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  liveRouteDot:   { width: 8, height: 8, borderRadius: 4 },
  liveRouteTxt:   { fontSize: 12, color: C.text2, fontWeight: "500" },
  liveRouteConnector: { height: 1, backgroundColor: C.border, marginLeft: 32 },

  waitBox:        { borderWidth: 1, borderColor: C.border, padding: 20, alignItems: "center", marginBottom: 12 },
  waitTxt:        { fontSize: 14, fontWeight: "600", color: C.text1, marginBottom: 4 },
  waitSub:        { fontSize: 12, color: C.text3, textAlign: "center", lineHeight: 18 },

  passBox:        { borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  passRow:        { flexDirection: "row", alignItems: "center", padding: 12 },
  passAvatar:     { width: 36, height: 36, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", marginRight: 12 },
  passName:       { fontSize: 14, fontWeight: "600", color: C.text1 },
  passDetail:     { fontSize: 11, color: C.text3, marginTop: 2 },
  confirmedBadge: { backgroundColor: C.greenBg, paddingHorizontal: 8, paddingVertical: 4 },
  confirmedTxt:   { fontSize: 11, fontWeight: "700", color: C.green },

  endBtn:         { borderWidth: 1, borderColor: C.red, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  endTxt:         { fontSize: 14, fontWeight: "600", color: C.red },

  summaryHeader:  { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  summaryIconWrap:{ width: 56, height: 56, backgroundColor: C.greenBg, justifyContent: "center", alignItems: "center" },
  summaryTitle:   { fontSize: 18, fontWeight: "700", color: C.text1 },
  summarySub:     { fontSize: 12, color: C.text3, marginTop: 2 },

  earningsSummaryCard:    { borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  earningsSummaryTitle:   { fontSize: 10, fontWeight: "700", color: C.text3, letterSpacing: 1, padding: 12, borderBottomWidth: 1, borderColor: C.border },
  earningsSummaryRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  earningsSummaryDivider: { height: 1, backgroundColor: C.border },
  earningsSummaryLabel:   { fontSize: 13, color: C.text3 },
  earningsSummaryVal:     { fontSize: 14, fontWeight: "600", color: C.text1 },

  impactBox:      { backgroundColor: C.greenBg, padding: 14, marginBottom: 16 },
  impactTxt:      { fontSize: 12, color: C.green, fontWeight: "500", lineHeight: 18 },

  passengerSheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: C.white, maxHeight: "65%", elevation: 28, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16 },
  sheetHandle:    { width: 32, height: 3, backgroundColor: C.border, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  sheetHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  sheetTitle:     { fontSize: 17, fontWeight: "700", color: C.text1 },
  sheetSub:       { fontSize: 12, color: C.text3, marginTop: 2 },
  sheetCloseBtn:  { width: 30, height: 30, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center" },
  sheetCloseTxt:  { fontSize: 14, color: C.text2, fontWeight: "600" },
  sheetDivider:   { height: 1, backgroundColor: C.border },
  sheetEmpty:     { alignItems: "center", padding: 24, gap: 14 },
  sheetEmptyTxt:  { fontSize: 14, color: C.text3, fontWeight: "500" },
  sheetDoneBtn:   { backgroundColor: C.accent, paddingVertical: 12, paddingHorizontal: 32 },
  sheetDoneBtnTxt:{ color: "#fff", fontSize: 14, fontWeight: "700" },

  requestItem:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  requestItemBorder:{ borderTopWidth: 1, borderColor: C.border },
  requestLeft:    { flex: 1, flexDirection: "row", alignItems: "flex-start", marginRight: 12 },
  requestAvatar:  { width: 40, height: 40, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", marginRight: 12 },
  requestName:    { fontSize: 14, fontWeight: "700", color: C.text1, marginBottom: 2 },
  requestDetail:  { fontSize: 11, color: C.text3, marginBottom: 2 },
  requestPickup:  { fontSize: 11, color: C.blue, marginBottom: 2 },
  requestTime:    { fontSize: 10, color: C.text4 },
  requestActions: { gap: 8 },
  acceptBtn:      { backgroundColor: C.green, paddingVertical: 8, paddingHorizontal: 14, alignItems: "center" },
  acceptBtnTxt:   { color: "#fff", fontSize: 13, fontWeight: "800" },
  declineBtn:     { borderWidth: 1, borderColor: C.borderMid, paddingVertical: 8, paddingHorizontal: 14, alignItems: "center" },
  declineBtnTxt:  { color: C.text3, fontSize: 13, fontWeight: "600" },
});