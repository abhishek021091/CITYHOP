import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Animated,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  PermissionsAndroid,
  Dimensions,
  ScrollView,
  Switch,
} from "react-native";
import MapplsGL from "mappls-map-react-native";
import Geolocation from "@react-native-community/geolocation";
import { getAuth } from "@react-native-firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from "@react-native-firebase/firestore";
import type { Coords } from "../passenger/booking/types";
import { PREDEFINED_ROUTES, type PredefinedRoute } from "./predefinedRoutes";

const { width: SW } = Dimensions.get("window");

const C = {
  bg: "#F4F4F4",
  white: "#FFFFFF",
  border: "#E5E5E5",
  accent: "#1C1C1E",
  green: "#1A8F5C",
  greenBg: "#EAF7F1",
  red: "#D93025",
  redBg: "#FEF0EF",
  gold: "#E69A00",
  goldBg: "#FEF8EE",
  blue: "#1A6BCC",
  text1: "#111111",
  text2: "#444444",
  text3: "#888888",
  text4: "#BBBBBB",
  inputBg: "#FAFAFA",
};

type Phase = "mode" | "fixed_setup" | "fixed_live" | "booking";
/** Persisted choice on the mode screen (Fixed vs Booking). */
type SelectedDriverMode = "fixed" | "booking" | null;

const haversineDistance = (a: Coords, b: Coords): number => {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const fmtDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

const DropMarker = () => (
  <View style={{ alignItems: "center" }}>
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: C.gold,
        borderWidth: 3,
        borderColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
        elevation: 8,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
    </View>
  </View>
);

const DriverMarker = () => (
  <View style={{ alignItems: "center" }}>
    <View
      style={{
        backgroundColor: C.white,
        borderWidth: 2,
        borderColor: C.gold,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 6,
        elevation: 8,
      }}
    >
      <Text style={{ fontSize: 22 }}>🛺</Text>
    </View>
  </View>
);

interface FixedRequest {
  id: string;
  distanceM: number;
  dropLabel: string;
  dropCoords: Coords;
}

interface BookingRequest {
  id: string;
  pickupLabel: string;
  dropLabel: string;
  distanceM: number;
}

const DROP_POOL = [
  "Near Bus Stand",
  "Civil Lines Crossing",
  "Railway Colony Gate",
  "GMDA Office",
  "Shiv Chowk",
  "Kanth Road Junction",
];

function randomFixedRequest(driverAt: Coords | null, route: PredefinedRoute): FixedRequest {
  const t = 0.3 + Math.random() * 0.65;
  const drop: Coords = [
    route.start[0] + (route.end[0] - route.start[0]) * t,
    route.start[1] + (route.end[1] - route.start[1]) * t,
  ];
  const dist = driverAt ? haversineDistance(driverAt, drop) : 400 + Math.random() * 2000;
  return {
    id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    distanceM: dist,
    dropLabel: DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)] ?? "Along route",
    dropCoords: drop,
  };
}

function randomBookingRequest(driverAt: Coords | null): BookingRequest {
  const p = ["Station", "Mall Road", "Court", "Hospital"][Math.floor(Math.random() * 4)] ?? "Pickup";
  const d = DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)] ?? "Drop";
  return {
    id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pickupLabel: p,
    dropLabel: d,
    distanceM: driverAt ? 200 + Math.random() * 4000 : 500,
  };
}

interface Props {
  navigation?: { navigate: (name: string) => void };
}

export default function DriverHome({ navigation }: Props) {
  const mapCamera = useRef<any>(null);
  const panelY = useRef(new Animated.Value(420)).current;
  const locationWatchId = useRef<number | null>(null);
  const firestoreInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mockFixedInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mockBookingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCoords = useRef<Coords | null>(null);

  const auth = getAuth();
  const db = getFirestore();
  const currentUser = auth.currentUser;

  const [phase, setPhase] = useState<Phase>("mode");
  const [selectedDriverMode, setSelectedDriverMode] = useState<SelectedDriverMode>(null);

  const [currentLocation, setCurrentLocation] = useState<Coords>([78.1746, 26.2485]);
  const [driverLiveLocation, setDriverLiveLocation] = useState<Coords | null>(null);

  const [selectedRoute, setSelectedRoute] = useState<PredefinedRoute | null>(null);
  const [totalSeats, setTotalSeats] = useState(3);
  const [availableSeats, setAvailableSeats] = useState(3);
  const [pricePerSeat, setPricePerSeat] = useState("30");

  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [goingLive, setGoingLive] = useState(false);

  const [driverName, setDriverName] = useState("Driver");
  const [driverPhone, setDriverPhone] = useState("");
  const [autoNumber, setAutoNumber] = useState("");

  const [fixedRequests, setFixedRequests] = useState<FixedRequest[]>([]);
  const [bookingOnline, setBookingOnline] = useState(false);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);

  const clearFirestoreInterval = () => {
    if (firestoreInterval.current) {
      clearInterval(firestoreInterval.current);
      firestoreInterval.current = null;
    }
  };

  const clearMockIntervals = () => {
    if (mockFixedInterval.current) {
      clearInterval(mockFixedInterval.current);
      mockFixedInterval.current = null;
    }
    if (mockBookingInterval.current) {
      clearInterval(mockBookingInterval.current);
      mockBookingInterval.current = null;
    }
  };

  const stopLocationWatch = () => {
    if (locationWatchId.current !== null) {
      Geolocation.clearWatch(locationWatchId.current);
      locationWatchId.current = null;
    }
  };

  // Initial GPS
  useEffect(() => {
    (async () => {
      if (Platform.OS === "android") {
        const g = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location",
            message: "CityHop needs your location",
            buttonPositive: "Allow",
            buttonNegative: "Deny",
          }
        );
        if (g !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      Geolocation.getCurrentPosition(
        (pos) => {
          const c: Coords = [pos.coords.longitude, pos.coords.latitude];
          setCurrentLocation(c);
          setDriverLiveLocation(c);
          lastCoords.current = c;
          mapCamera.current?.setCamera({
            centerCoordinate: c,
            zoomLevel: 13,
            animationDuration: 800,
          });
        },
        (err) => console.warn("GPS:", err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    })();
    return () => {
      stopLocationWatch();
      clearFirestoreInterval();
      clearMockIntervals();
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "drivers", currentUser.uid));
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          setDriverName((data.name as string) || "Driver");
          setAutoNumber((data.vehicle as string) || "");
          setDriverPhone((data.phone as string) || "");
        }
      } catch (e) {
        console.warn("driver profile", e);
      }
    })();
  }, [currentUser, db]);

  useEffect(() => {
    panelY.setValue(400);
    Animated.spring(panelY, {
      toValue: 0,
      tension: 70,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [phase, panelY]);

  const pushDriverLocationToRide = useCallback(
    (rideId: string) => {
      const c = lastCoords.current;
      if (!c) return;
      updateDoc(doc(db, "rides", rideId), {
        driverLocation: { latitude: c[1], longitude: c[0] },
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    },
    [db]
  );

  const pushDriverLocationToProfile = useCallback(() => {
    if (!currentUser) return;
    const c = lastCoords.current;
    if (!c) return;
    updateDoc(doc(db, "drivers", currentUser.uid), {
      driverLocation: { latitude: c[1], longitude: c[0] },
      locationUpdatedAt: serverTimestamp(),
    }).catch(() => {});
  }, [currentUser, db]);

  const startLiveTracking = useCallback(
    (rideId: string) => {
      stopLocationWatch();
      clearFirestoreInterval();

      locationWatchId.current = Geolocation.watchPosition(
        (pos) => {
          const c: Coords = [pos.coords.longitude, pos.coords.latitude];
          lastCoords.current = c;
          setDriverLiveLocation(c);
          setCurrentLocation(c);
        },
        (err) => console.warn("watch:", err.message),
        { enableHighAccuracy: true, distanceFilter: 10 }
      );

      firestoreInterval.current = setInterval(() => {
        pushDriverLocationToRide(rideId);
      }, 5000);
      pushDriverLocationToRide(rideId);
    },
    [pushDriverLocationToRide]
  );

  useEffect(() => {
    if (phase !== "booking" || !bookingOnline) return;
    stopLocationWatch();
    clearFirestoreInterval();
    locationWatchId.current = Geolocation.watchPosition(
      (pos) => {
        const c: Coords = [pos.coords.longitude, pos.coords.latitude];
        lastCoords.current = c;
        setDriverLiveLocation(c);
        setCurrentLocation(c);
      },
      (err) => console.warn("watch booking:", err.message),
      { enableHighAccuracy: true, distanceFilter: 15 }
    );
    firestoreInterval.current = setInterval(() => {
      pushDriverLocationToProfile();
    }, 5000);
    pushDriverLocationToProfile();
    return () => {
      stopLocationWatch();
      clearFirestoreInterval();
    };
  }, [phase, bookingOnline, pushDriverLocationToProfile]);

  const handleSelectModeFixed = () => {
    setSelectedDriverMode("fixed");
    setPhase("fixed_setup");
    setSelectedRoute(null);
  };

  const handleSelectModeBooking = () => {
    setSelectedDriverMode("booking");
    setPhase("booking");
    setBookingOnline(false);
    setBookingRequests([]);
  };

  const handleBackToMode = () => {
    clearMockIntervals();
    stopLocationWatch();
    clearFirestoreInterval();
    setActiveRideId(null);
    setPhase("mode");
    setSelectedDriverMode(null);
    setSelectedRoute(null);
    setFixedRequests([]);
    setBookingRequests([]);
    setBookingOnline(false);
  };

  const handleGoLiveFixed = async () => {
    if (!selectedRoute) {
      Alert.alert("Route", "Select a predefined route.");
      return;
    }
    if (!currentUser) {
      Alert.alert("Auth", "Not signed in.");
      return;
    }
    if (!autoNumber.trim()) {
      Alert.alert("Vehicle", "Add your vehicle number in your driver profile first.");
      return;
    }

    setGoingLive(true);
    try {
      const coords = selectedRoute.polyline;
      const avail = totalSeats;
      const price = Math.max(1, Number(pricePerSeat) || 30);
      const docRef = await addDoc(collection(db, "rides"), {
        driverUid: currentUser.uid,
        driverName,
        driverPhone,
        autoNumber: autoNumber.trim().toUpperCase(),
        mode: "fixed",
        status: "active",
        startName: selectedRoute.startName,
        endName: selectedRoute.endName,
        origin: {
          name: selectedRoute.startName,
          latitude: selectedRoute.start[1],
          longitude: selectedRoute.start[0],
        },
        destination: {
          name: selectedRoute.endName,
          latitude: selectedRoute.end[1],
          longitude: selectedRoute.end[0],
        },
        routePolyline: coords.map(([lng, lat]) => ({ longitude: lng, latitude: lat })),
        totalSeats,
        bookedSeats: 0,
        availableSeats: avail,
        passengers: [],
        pricePerSeat: price,
        farePerSeat: price,
        distance: haversineDistance(selectedRoute.start, selectedRoute.end),
        duration: 0,
        driverLocation: lastCoords.current
          ? { latitude: lastCoords.current[1], longitude: lastCoords.current[0] }
          : { latitude: selectedRoute.start[1], longitude: selectedRoute.start[0] },
        createdAt: serverTimestamp(),
      });

      setActiveRideId(docRef.id);
      setAvailableSeats(avail);
      setPhase("fixed_live");
      setFixedRequests([]);
      startLiveTracking(docRef.id);

      const r = selectedRoute;
      setTimeout(() => {
        setFixedRequests((prev) => {
          if (prev.length >= 4) return prev;
          return [...prev, randomFixedRequest(lastCoords.current, r)];
        });
      }, 2000);

      mockFixedInterval.current = setInterval(() => {
        setFixedRequests((prev) => {
          if (!r || prev.length >= 5) return prev;
          return [...prev, randomFixedRequest(lastCoords.current, r)];
        });
      }, 14000);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not go live");
    } finally {
      setGoingLive(false);
    }
  };

  const handleAcceptFixed = (req: FixedRequest) => {
    setAvailableSeats((prev) => {
      if (prev <= 0) return prev;
      const next = prev - 1;
      if (activeRideId) {
        updateDoc(doc(db, "rides", activeRideId), {
          availableSeats: next,
          bookedSeats: totalSeats - next,
        }).catch(() => {});
      }
      return next;
    });
    setFixedRequests((list) => list.filter((x) => x.id !== req.id));
  };

  const handleIgnoreFixed = (req: FixedRequest) => {
    setFixedRequests((list) => list.filter((x) => x.id !== req.id));
  };

  const handleEndFixedRide = () => {
    Alert.alert("End ride", "Stop this fixed route session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End",
        style: "destructive",
        onPress: async () => {
          try {
            if (activeRideId) {
              await updateDoc(doc(db, "rides", activeRideId), { status: "completed" });
            }
          } catch (_) {}
          clearMockIntervals();
          stopLocationWatch();
          clearFirestoreInterval();
          setActiveRideId(null);
          setFixedRequests([]);
          setPhase("fixed_setup");
        },
      },
    ]);
  };

  useEffect(() => {
    if (!bookingOnline || phase !== "booking") {
      if (mockBookingInterval.current) {
        clearInterval(mockBookingInterval.current);
        mockBookingInterval.current = null;
      }
      return;
    }
    mockBookingInterval.current = setInterval(() => {
      setBookingRequests((prev) => {
        if (prev.length >= 6) return prev;
        return [...prev, randomBookingRequest(lastCoords.current)];
      });
    }, 12000);
    return () => {
      if (mockBookingInterval.current) {
        clearInterval(mockBookingInterval.current);
        mockBookingInterval.current = null;
      }
    };
  }, [bookingOnline, phase]);

  const onToggleBookingOnline = async (on: boolean) => {
    setBookingOnline(on);
    setBookingRequests([]);
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "drivers", currentUser.uid), {
        bookingOnline: on,
        bookingUpdatedAt: serverTimestamp(),
      });
    } catch (_) {}
  };

  const handleAcceptBooking = (req: BookingRequest) => {
    setBookingRequests((list) => list.filter((x) => x.id !== req.id));
  };

  const handleRejectBooking = (req: BookingRequest) => {
    setBookingRequests((list) => list.filter((x) => x.id !== req.id));
  };

  const routeLine =
    selectedRoute && phase === "fixed_live" ? selectedRoute.polyline : null;
  const mapCenter = driverLiveLocation || currentLocation;

  useEffect(() => {
    if (phase === "fixed_live" && routeLine && routeLine.length > 1) {
      const lngs = routeLine.map((c) => c[0]);
      const lats = routeLine.map((c) => c[1]);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      mapCamera.current?.fitBounds(
        [minLng, minLat],
        [maxLng, maxLat],
        [80, 120, 280, 80],
        900
      );
    }
  }, [phase, routeLine]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <View style={styles.map}>
        <MapplsGL.MapView style={StyleSheet.absoluteFill} logoEnabled={false} compassEnabled>
          <MapplsGL.Camera ref={mapCamera} zoomLevel={13} centerCoordinate={mapCenter} />
          {routeLine && routeLine.length > 1 && (
            <MapplsGL.ShapeSource
              id="fixedRoute"
              shape={{
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: routeLine },
              }}
            >
              <MapplsGL.LineLayer
                id="routeCasing"
                style={{
                  lineColor: "#fff",
                  lineWidth: 8,
                  lineCap: "round",
                  lineJoin: "round",
                }}
                layerIndex={10}
              />
              <MapplsGL.LineLayer
                id="routeLine"
                style={{
                  lineColor: C.gold,
                  lineWidth: 4,
                  lineCap: "round",
                  lineJoin: "round",
                }}
                layerIndex={11}
              />
            </MapplsGL.ShapeSource>
          )}
          {selectedRoute && (phase === "fixed_setup" || phase === "fixed_live") && (
            <>
              <MapplsGL.PointAnnotation id="start" coordinate={selectedRoute.start}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: C.green,
                    borderWidth: 2,
                    borderColor: "#fff",
                  }}
                />
              </MapplsGL.PointAnnotation>
              <MapplsGL.PointAnnotation id="end" coordinate={selectedRoute.end}>
                <DropMarker />
              </MapplsGL.PointAnnotation>
            </>
          )}
          {(phase === "fixed_live" || (phase === "booking" && bookingOnline)) &&
            driverLiveLocation && (
              <MapplsGL.PointAnnotation id="driver" coordinate={driverLiveLocation}>
                <DriverMarker />
              </MapplsGL.PointAnnotation>
            )}
        </MapplsGL.MapView>

        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.topBarInner}>
            <View style={styles.appNameWrap}>
              <Text style={styles.appName}>🛺CityHop</Text>
              <View style={styles.driverBadgeWrap}>
                <Text style={styles.driverBadgeTxt}>DRIVER</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation?.navigate("DriverProfile")}
              activeOpacity={0.8}
            >
              <Text style={styles.profileBtnTxt}>👤 Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {phase === "fixed_live" && (
          <View style={styles.liveBadge}>
            <View style={styles.liveBadgeDot} />
            <Text style={styles.liveBadgeTxt}>
              LIVE · Fixed · {availableSeats} seat{availableSeats !== 1 ? "s" : ""} left
            </Text>
          </View>
        )}
        {phase === "booking" && (
          <View style={[styles.liveBadge, bookingOnline && { borderWidth: 1, borderColor: C.green }]}>
            <View style={[styles.liveBadgeDot, { backgroundColor: bookingOnline ? C.green : C.text4 }]} />
            <Text style={[styles.liveBadgeTxt, !bookingOnline && { color: C.text3 }]}>
              {bookingOnline ? "Booking · Online" : "Booking · Offline"}
            </Text>
          </View>
        )}
      </View>

      <Animated.View style={[styles.panel, { transform: [{ translateY: panelY }] }]}>
        <View style={styles.handle} />

        {phase === "mode" && (
          <ScrollView
            contentContainerStyle={styles.panelScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.greeting}>Hello, {driverName} 👋</Text>
            <Text style={styles.heading}>Choose driver mode</Text>
            <Text style={styles.subTxt}>Select how you want to operate today.</Text>

            <TouchableOpacity
              style={[
                styles.modeCard,
                selectedDriverMode === "fixed" && styles.modeCardActive,
              ]}
              onPress={handleSelectModeFixed}
              activeOpacity={0.85}
            >
              <Text style={styles.modeCardTitle}>Fixed Route Mode</Text>
              <Text style={styles.modeCardSub}>Predefined corridor · seat sharing</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeCard,
                selectedDriverMode === "booking" && styles.modeCardActive,
              ]}
              onPress={handleSelectModeBooking}
              activeOpacity={0.85}
            >
              <Text style={styles.modeCardTitle}>Booking Mode</Text>
              <Text style={styles.modeCardSub}>On-demand trips · go online when ready</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {phase === "fixed_setup" && (
          <ScrollView
            contentContainerStyle={styles.panelScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.rowHeader}>
              <TouchableOpacity style={styles.backBtn} onPress={handleBackToMode}>
                <Text style={styles.backBtnTxt}>←</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={styles.modePillRow}>
                  <View style={[styles.modePill, styles.modePillOn]}>
                    <Text style={styles.modePillTxtOn}>Fixed route</Text>
                  </View>
                  <View style={styles.modePill}>
                    <Text style={styles.modePillTxt}>Booking</Text>
                  </View>
                </View>
                <Text style={[styles.heading, { marginBottom: 4 }]}>Pick a route</Text>
                <Text style={styles.subTxt}>Tap a route, set seats, then go live.</Text>
              </View>
            </View>

            <FlatList
              scrollEnabled={false}
              data={PREDEFINED_ROUTES}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const on = selectedRoute?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.routeRow, on && styles.routeRowOn]}
                    onPress={() => setSelectedRoute(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.routeRowTitle}>{item.name}</Text>
                    <Text style={styles.routeRowSub}>
                      {item.startName} → {item.endName}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <Text style={styles.fieldLabel}>SEATS (2–4)</Text>
            <View style={styles.seatsRow}>
              {[2, 3, 4].map((n) => {
                const on = totalSeats === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.seatBtn, on && styles.seatBtnOn]}
                    onPress={() => {
                      setTotalSeats(n);
                      setAvailableSeats(n);
                    }}
                  >
                    <Text style={[styles.seatNum, on && styles.seatNumOn]}>{n}</Text>
                    <Text style={[styles.seatLbl, on && styles.seatLblOn]}>seats</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>PRICE PER SEAT</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="Enter price per seat"
              placeholderTextColor={C.text4}
              keyboardType="numeric"
              value={pricePerSeat}
              onChangeText={setPricePerSeat}
            />

            <TouchableOpacity
              style={[styles.liveBtn, (!selectedRoute || goingLive) && { opacity: 0.55 }]}
              disabled={!selectedRoute || goingLive}
              onPress={handleGoLiveFixed}
            >
              {goingLive ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <View style={styles.liveBtnDot} />
                  <Text style={styles.liveBtnTxt}>Go Live</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}

        {phase === "fixed_live" && selectedRoute && (
          <View style={{ flex: 1, maxHeight: "52%" }}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Passenger requests</Text>
                <Text style={styles.sheetSub} numberOfLines={1}>
                  {selectedRoute.name}
                </Text>
              </View>
              <TouchableOpacity onPress={handleEndFixedRide} style={styles.endChip}>
                <Text style={styles.endChipTxt}>End ride</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sheetDivider} />
            <FlatList
              data={fixedRequests}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <Text style={styles.emptyTxt}>No requests yet. Stay on the route.</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.reqBox}>
                  <Text style={styles.reqDrop} numberOfLines={2}>
                    Drop: {item.dropLabel}
                  </Text>
                  <Text style={styles.reqDist}>
                    {fmtDistance(item.distanceM)} away
                  </Text>
                  <View style={styles.reqActions}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAcceptFixed(item)}
                      disabled={availableSeats <= 0}
                    >
                      <Text style={styles.acceptBtnTxt}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ignoreBtn}
                      onPress={() => handleIgnoreFixed(item)}
                    >
                      <Text style={styles.ignoreBtnTxt}>Ignore</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {phase === "booking" && (
          <ScrollView contentContainerStyle={styles.panelScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.rowHeader}>
              <TouchableOpacity style={styles.backBtn} onPress={handleBackToMode}>
                <Text style={styles.backBtnTxt}>←</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={styles.modePillRow}>
                  <View style={styles.modePill}>
                    <Text style={styles.modePillTxt}>Fixed route</Text>
                  </View>
                  <View style={[styles.modePill, styles.modePillOn]}>
                    <Text style={styles.modePillTxtOn}>Booking</Text>
                  </View>
                </View>
                <Text style={[styles.heading, { marginBottom: 4 }]}>Booking mode</Text>
                <Text style={styles.subTxt}>Go online to receive ride requests.</Text>
              </View>
            </View>

            <View style={styles.onlineRow}>
              <View>
                <Text style={styles.onlineLabel}>Online</Text>
                <Text style={styles.onlineSub}>Visible to passengers nearby</Text>
              </View>
              <Switch
                value={bookingOnline}
                onValueChange={onToggleBookingOnline}
                trackColor={{ false: C.border, true: C.greenBg }}
                thumbColor={bookingOnline ? C.green : "#f4f3f4"}
              />
            </View>

            <Text style={styles.fieldLabel}>INCOMING</Text>
            {bookingRequests.length === 0 ? (
              <Text style={styles.emptyTxt}>
                {bookingOnline ? "Waiting for requests…" : "Turn on to see requests."}
              </Text>
            ) : (
              bookingRequests.map((req) => (
                <View key={req.id} style={styles.reqBox}>
                  <Text style={styles.reqDrop}>
                    {req.pickupLabel} → {req.dropLabel}
                  </Text>
                  <Text style={styles.reqDist}>{fmtDistance(req.distanceM)} away</Text>
                  <View style={styles.reqActions}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAcceptBooking(req)}
                    >
                      <Text style={styles.acceptBtnTxt}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleRejectBooking(req)}
                    >
                      <Text style={styles.rejectBtnTxt}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  map: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === "ios" ? 52 : 42,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  appNameWrap: {
    backgroundColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 4,
  },
  appName: { fontSize: 15, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
  driverBadgeWrap: { borderWidth: 1, borderColor: C.gold, paddingHorizontal: 5, paddingVertical: 1 },
  driverBadgeTxt: { fontSize: 9, fontWeight: "800", color: C.gold, letterSpacing: 1 },
  profileBtn: {
    backgroundColor: C.white,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    elevation: 4,
  },
  profileBtnTxt: { fontSize: 13, fontWeight: "600", color: C.text1 },
  liveBadge: {
    position: "absolute",
    top: Platform.OS === "ios" ? 52 : 42,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    paddingHorizontal: 14,
    paddingVertical: 7,
    elevation: 4,
    gap: 7,
    borderRadius: 4,
  },
  liveBadgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  liveBadgeTxt: { fontSize: 12, fontWeight: "700", color: C.green, letterSpacing: 0.5 },
  panel: {
    backgroundColor: C.white,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    maxHeight: "58%",
    minHeight: 280,
    elevation: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: 12,
    borderRadius: 2,
  },
  panelScroll: { paddingBottom: 20 },
  greeting: { fontSize: 12, color: C.text3, fontWeight: "500", marginBottom: 4 },
  heading: { fontSize: 19, fontWeight: "700", color: C.text1, marginBottom: 8 },
  subTxt: { fontSize: 12, color: C.text3, marginBottom: 14 },
  modeCard: {
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: C.white,
  },
  modeCardActive: { borderColor: C.accent, backgroundColor: "#FAFAFA" },
  modeCardTitle: { fontSize: 16, fontWeight: "700", color: C.text1 },
  modeCardSub: { fontSize: 12, color: C.text3, marginTop: 4 },
  rowHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
  },
  backBtnTxt: { fontSize: 18, color: C.text1, fontWeight: "600" },
  modePillRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  modePillOn: { borderColor: C.accent, backgroundColor: "#F3F3F3" },
  modePillTxt: { fontSize: 10, fontWeight: "700", color: C.text3 },
  modePillTxtOn: { fontSize: 10, fontWeight: "800", color: C.text1 },
  routeRow: {
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
    borderRadius: 8,
  },
  routeRowOn: { borderColor: C.gold, backgroundColor: C.goldBg },
  routeRowTitle: { fontSize: 14, fontWeight: "700", color: C.text1 },
  routeRowSub: { fontSize: 11, color: C.text3, marginTop: 4 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 6,
  },
  seatsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  seatBtn: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 8,
  },
  seatBtnOn: { borderColor: C.accent, backgroundColor: "#F0F0F0" },
  seatNum: { fontSize: 22, fontWeight: "800", color: C.text3 },
  seatNumOn: { color: C.text1 },
  seatLbl: { fontSize: 10, color: C.text4, marginTop: 2 },
  seatLblOn: { color: C.text3 },
  priceInput: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: C.text1,
    marginBottom: 18,
  },
  liveBtn: {
    backgroundColor: C.green,
    paddingVertical: 15,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    borderRadius: 8,
  },
  liveBtnDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  liveBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: C.text1 },
  sheetSub: { fontSize: 12, color: C.text3, marginTop: 2, maxWidth: SW - 160 },
  sheetDivider: { height: 1, backgroundColor: C.border, marginBottom: 8 },
  endChip: {
    borderWidth: 1,
    borderColor: C.red,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  endChipTxt: { fontSize: 12, fontWeight: "700", color: C.red },
  reqBox: {
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
  },
  reqDrop: { fontSize: 14, fontWeight: "600", color: C.text1 },
  reqDist: { fontSize: 12, color: C.text3, marginTop: 4 },
  reqActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  acceptBtn: {
    flex: 1,
    backgroundColor: C.green,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 6,
  },
  acceptBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  ignoreBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 6,
  },
  ignoreBtnTxt: { color: C.text2, fontWeight: "700", fontSize: 14 },
  rejectBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.red,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 6,
    backgroundColor: C.redBg,
  },
  rejectBtnTxt: { color: C.red, fontWeight: "700", fontSize: 14 },
  emptyTxt: { fontSize: 13, color: C.text3, textAlign: "center", paddingVertical: 20 },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  onlineLabel: { fontSize: 15, fontWeight: "700", color: C.text1 },
  onlineSub: { fontSize: 11, color: C.text3, marginTop: 2 },
});
