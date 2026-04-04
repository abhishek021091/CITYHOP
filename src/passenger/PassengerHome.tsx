import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  Animated,
  ActivityIndicator,
  Alert,
  Platform,
  Keyboard,
  StatusBar,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { getAuth } from "@react-native-firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";

import type { Coords, Place, Route, AppScreen, ActiveInput, PayMethod, ActiveRide } from "./booking/types";
import { fmtDistance, isValid, haversineDistance } from "./booking/format";
import {
  searchPlaces,
  reverseGeocode,
  boundsFromRoute,
  ensurePlaceWithCoordinates,
} from "./booking/mapplsApi";
import { buildMatchedRides, buildStaticDemoDriverRides } from "./booking/routeService";
import { getRouteTripDisplay } from "./booking/routeTripDisplay";
import { usePassengerLocation } from "./hooks/usePassengerLocation";
import { useDirectionsRoute } from "./hooks/useDirectionsRoute";

import MapComponent from "./components/ride/MapComponent";
import SearchBar from "./components/ride/SearchBar";
import RideBottomSheet from "./components/ride/RideBottomSheet";
import MapFooterNav from "./components/ride/MapFooterNav";
import { RIDE_THEME as C } from "./components/ride/theme";

const { height: SH } = Dimensions.get("window");
interface Props {
  navigation?: any;
}

export default function PassengerHome({ navigation }: Props) {
  const mapCamera = useRef<any>(null);
  const panelY = useRef(new Animated.Value(400)).current;
  const sheetY = useRef(new Animated.Value(SH)).current;
  const payScaleAnim = useRef(new Animated.Value(0.95)).current;
  const payFadeAnim = useRef(new Animated.Value(0)).current;
  const trackingPanelY = useRef(new Animated.Value(300)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fakeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pickup, setPickup] = useState<Place | null>(null);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [activeInput, setActiveInput] = useState<ActiveInput>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [pickupQuery, setPickupQuery] = useState("Current Location");
  const [dropQuery, setDropQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [matchingRides, setMatchingRides] = useState<ActiveRide[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [selectedRide, setSelectedRide] = useState<ActiveRide | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("upi");
  const [upiId, setUpiId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [driverCoord, setDriverCoord] = useState<Coords | null>(null);
  const [etaMin, setEtaMin] = useState(4);
  const [trackPhase, setTrackPhase] = useState<"arriving" | "onway" | "arrived">("arriving");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const auth = getAuth();
  const db = getFirestore();
  const currentUser = auth.currentUser;

  const onLocated = useCallback((c: Coords) => {
    setPickup({
      placeName: "Current Location",
      longitude: String(c[0]),
      latitude: String(c[1]),
    });
  }, []);

  const { currentLocation, userLoc } = usePassengerLocation(mapCamera, onLocated);
  const { route, routeLoading, routeUnavailable, loadRoute, clearRoute } = useDirectionsRoute();

  const pickupCoords = useMemo((): Coords => {
    if (!pickup) return currentLocation;
    const lng = parseFloat(pickup.longitude);
    const lat = parseFloat(pickup.latitude);
    return isValid(lng) && isValid(lat) ? [lng, lat] : currentLocation;
  }, [pickup, currentLocation]);

  const dropCoords = useMemo((): Coords | null => {
    if (!drop) return null;
    const lng = parseFloat(drop.longitude);
    const lat = parseFloat(drop.latitude);
    return isValid(lng) && isValid(lat) ? [lng, lat] : null;
  }, [drop]);

  const fleetMarkers = useMemo(
    () => matchingRides.map(r => ({ id: `fleet_${r.id}`, coordinate: r.driverMarker })),
    [matchingRides]
  );

  const routeTrip = useMemo(
    () =>
      getRouteTripDisplay(route, routeLoading, routeUnavailable, loadingRides, matchingRides.length),
    [route, routeLoading, routeUnavailable, loadingRides, matchingRides.length]
  );

  const showSheet = useCallback(() => {
    Animated.spring(sheetY, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }).start();
  }, [sheetY]);

  const hideSheet = useCallback(() => {
    Animated.timing(sheetY, { toValue: SH, duration: 250, useNativeDriver: true }).start();
  }, [sheetY]);

  const fitMapToRoute = useCallback((pCoords: Coords, dCoords: Coords, r: Route | null) => {
    if (r && r.coordinates.length > 1) {
      const b = boundsFromRoute(r.coordinates);
      if (b) {
        mapCamera.current?.fitBounds(b.ne, b.sw, [88, 88, 220, 88], 1000);
        return;
      }
    }
    if (isValid(pCoords[0]) && isValid(pCoords[1]) && isValid(dCoords[0]) && isValid(dCoords[1])) {
      mapCamera.current?.fitBounds(pCoords, dCoords, [100, 50, 260, 50], 1000);
    }
  }, []);

  const handleSearch = useCallback(
    async (text: string, field: ActiveInput) => {
      if (field === "pickup") setPickupQuery(text);
      else setDropQuery(text);
      if (!field || text.length < 3) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        setSearchResults(await searchPlaces(text, userLoc ?? currentLocation));
      } finally {
        setSearching(false);
      }
    },
    [userLoc, currentLocation]
  );

  const applyPlaceAfterResolve = useCallback(
    async (item: Place, field: ActiveInput) => {
      const resolved = await ensurePlaceWithCoordinates(item);
      if (!resolved) {
        console.warn("[CityHop] could not resolve place coordinates", item.placeName);
        return;
      }
      Keyboard.dismiss();
      setSearchResults([]);
      setIsSearching(false);
      if (field === "pickup") {
        setPickup(resolved);
        setPickupQuery(resolved.placeName);
      } else {
        setDrop(resolved);
        setDropQuery(resolved.placeName);
        setPickup(prev => prev ?? {
          placeName: "Current Location",
          longitude: String(currentLocation[0]),
          latitude: String(currentLocation[1]),
        });
      }
      const lng = parseFloat(resolved.longitude);
      const lat = parseFloat(resolved.latitude);
      if (isValid(lng) && isValid(lat)) {
        mapCamera.current?.setCamera({ centerCoordinate: [lng, lat], zoomLevel: 14, animationDuration: 800 });
      }
      setActiveInput(null);
    },
    [currentLocation]
  );

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", e => {
      setKeyboardHeight(e.endCoordinates.height);
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleSelectPlace = useCallback(
    (item: Place) => {
      const field: ActiveInput = activeInput ?? "drop";
      void applyPlaceAfterResolve(item, field);
    },
    [activeInput, applyPlaceAfterResolve]
  );

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
  }, [screen, pulseAnim]);

  useEffect(() => {
    panelY.setValue(400);
    Animated.spring(panelY, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }).start();
  }, [screen, panelY]);

  useEffect(() => {
    if (!activeRideId || screen !== "tracking") return;
    const unsub = onSnapshot(doc(db, "rides", activeRideId), (snap: any) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data?.driverLocation) {
        setDriverCoord([data.driverLocation.longitude, data.driverLocation.latitude]);
      }
    });
    return () => unsub();
  }, [activeRideId, screen, db]);

  useEffect(() => {
    if (screen !== "tracking") return;
    if (trackPhase !== "arriving") return;
    if (etaMin <= 0) {
      setTrackPhase("onway");
      return;
    }
    const t = setTimeout(() => setEtaMin(p => Math.max(0, p - 1)), 60000);
    return () => clearTimeout(t);
  }, [screen, trackPhase, etaMin]);

  useEffect(() => {
    return () => {
      if (fakeIntervalRef.current) clearInterval(fakeIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pickup || !drop) clearRoute();
  }, [pickup, drop, clearRoute]);

  useEffect(() => {
    if (!pickup || !drop) return;
    const plng = parseFloat(pickup.longitude);
    const plat = parseFloat(pickup.latitude);
    const dlng = parseFloat(drop.longitude);
    const dlat = parseFloat(drop.latitude);
    if (!isValid(plng) || !isValid(plat) || !isValid(dlng) || !isValid(dlat)) {
      console.log("[CityHop] skip route fetch: invalid coords", { plng, plat, dlng, dlat });
      return;
    }
    const pCoords: Coords = [plng, plat];
    const dCoords: Coords = [dlng, dlat];

    setMatchingRides([]);
    clearRoute();
    let cancelled = false;
    (async () => {
      console.log("[CityHop] pickup+drop set → fetching route…", {
        from: pickup.placeName,
        to: drop.placeName,
        pCoords,
        dCoords,
      });
      const out = await loadRoute(pCoords, dCoords);
      if (cancelled) return;
      const r = out.route;
      console.log("[CityHop] route loaded in effect:", r.distance, r.coordinates.length, out.unavailable);
      fitMapToRoute(pCoords, dCoords, r);
      setLoadingRides(true);
      const dist = r.distance > 0 ? r.distance : haversineDistance(pCoords, dCoords) || 1;
      const dur = r.duration > 0 ? r.duration : Math.max(120, Math.round(dist / 7));
      setTimeout(() => {
        if (!cancelled) {
          const real = buildMatchedRides(pickup.placeName, drop.placeName, pCoords, dCoords, r.coordinates, dist, dur);
          const demo = buildStaticDemoDriverRides(
            pCoords[0],
            pCoords[1],
            pickup.placeName,
            drop.placeName,
            pCoords,
            dCoords,
            dist
          );
          setMatchingRides(real.length > 0 ? real : demo);
          setLoadingRides(false);
        }
      }, 500);
      setScreen("matching");
      showSheet();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pickup?.longitude,
    pickup?.latitude,
    pickup?.placeName,
    drop?.longitude,
    drop?.latitude,
    drop?.placeName,
    loadRoute,
    fitMapToRoute,
    showSheet,
    clearRoute,
  ]);

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
        if (fakeIntervalRef.current) clearInterval(fakeIntervalRef.current);
        setTrackPhase("arrived");
      }
    }, 4000);
  };

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

  const handlePay = async () => {
    if (!selectedRide || !currentUser) return;
    if (payMethod === "upi" && !upiId.trim()) {
      Alert.alert("Enter UPI ID", "Please enter your UPI ID to proceed.");
      return;
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

  const handleStartTracking = () => {
    if (!selectedRide) return;
    const line =
      route && route.coordinates.length >= 2 ? route.coordinates : selectedRide.driverRoute;
    if (!line || line.length < 2) return;
    trackingPanelY.setValue(300);
    Animated.spring(trackingPanelY, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }).start();
    setEtaMin(4);
    setTrackPhase("arriving");
    setScreen("tracking");
    const pCoords: Coords = [selectedRide.origin.longitude, selectedRide.origin.latitude];
    const dCoords: Coords = [selectedRide.destination.longitude, selectedRide.destination.latitude];
    mapCamera.current?.fitBounds(pCoords, dCoords, [120, 60, 260, 60], 1000);
    startFakeTracking(line);
  };

  const handleReset = () => {
    if (fakeIntervalRef.current) clearInterval(fakeIntervalRef.current);
    setPickup(null);
    setDrop(null);
    setPickupQuery("Current Location");
    setDropQuery("");
    clearRoute();
    setMatchingRides([]);
    setSelectedRide(null);
    setUpiId("");
    setPayMethod("upi");
    setBookingRef("");
    setActiveRideId(null);
    setDriverCoord(null);
    setTrackPhase("arriving");
    setEtaMin(4);
    payScaleAnim.setValue(0.95);
    payFadeAnim.setValue(0);
    setScreen("home");
    hideSheet();
    setIsSearching(false);
  };

  const showFooterNav =
    (screen === "home" || screen === "matching") && !isSearching && !keyboardVisible;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 52 : 0}
    >
      <View style={s.root}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        <View style={s.map}>
          <MapComponent
            ref={mapCamera}
            currentLocation={currentLocation}
            pickupCoords={pickupCoords}
            dropCoords={dropCoords}
            route={route}
            screen={screen}
            driverCoord={driverCoord}
            fleetMarkers={fleetMarkers}
            onLongPress={async (e: any) => {
              if (screen === "tracking") return;
              const coords: Coords | undefined = e.geometry?.coordinates;
              if (!coords) return;
              console.log("[CityHop] map long-press coords:", coords);
              const address = await reverseGeocode(coords);
              const place: Place = {
                placeName: address,
                longitude: String(coords[0]),
                latitude: String(coords[1]),
              };
              setDrop(place);
              setDropQuery(address);
              if (!pickup) {
                const def: Place = {
                  placeName: "Current Location",
                  longitude: String(currentLocation[0]),
                  latitude: String(currentLocation[1]),
                };
                console.log("[CityHop] long-press: default pickup", def);
                setPickup(def);
              }
            }}
          />

          <View style={s.topBar} pointerEvents="box-none">
            <View style={s.brandPill}>
              <Text style={s.brandTxt}>🛺 CityHop</Text>
            </View>
          </View>

          {pickup &&
            drop &&
            screen !== "confirmed" &&
            screen !== "tracking" && (
              <View style={[s.routePill, routeTrip.isError && s.routePillWarn]}>
                {routeLoading ? (
                  <>
                    <ActivityIndicator size="small" color={C.blue} />
                    <Text style={s.routePillTxt}>Fetching route…</Text>
                  </>
                ) : (
                  <Text style={[s.routePillTxt, routeTrip.isError && s.routePillTxtWarn]}>{routeTrip.text}</Text>
                )}
              </View>
            )}

          {screen === "tracking" && (
            <View style={s.liveBadge}>
              <Animated.View style={[s.liveBadgeDot, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={s.liveBadgeTxt}>LIVE TRACKING</Text>
            </View>
          )}

        </View>

        {(screen === "home" || screen === "matching") && (
          <Animated.View style={[s.panel, { transform: [{ translateY: panelY }] }]}>
            <View style={s.panelHandle} />
            <SearchBar
              userLoc={userLoc ?? currentLocation}
              pickupQuery={pickupQuery}
              dropQuery={dropQuery}
              activeInput={activeInput}
              keyboardInset={keyboardHeight}
              onActiveInput={setActiveInput}
              onSearch={handleSearch}
              onSelectPlace={handleSelectPlace}
              searchResults={searchResults}
              searching={searching}
              onSearchFocus={() => setIsSearching(true)}
              onSearchBlur={() => setIsSearching(false)}
            />
          </Animated.View>
        )}

        <RideBottomSheet
          sheetY={sheetY}
          pickupLabel={pickup?.placeName ?? pickupQuery}
          dropLabel={(drop?.placeName ?? dropQuery) || "—"}
          route={route}
          routeLoading={routeLoading}
          routeUnavailable={routeUnavailable}
          loadingRides={loadingRides}
          matchingRides={matchingRides}
          onClose={() => {
            hideSheet();
            setScreen("home");
          }}
          onBook={handleBook}
        />

        {screen === "payment" && selectedRide && (
          <Animated.View style={[s.payPanel, { opacity: payFadeAnim, transform: [{ scale: payScaleAnim }] }]}>
            <View style={s.panelHandle} />
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <View style={s.payHeader}>
                <TouchableOpacity
                  style={s.backBtn}
                  onPress={() => {
                    setScreen("matching");
                    showSheet();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={s.backBtnTxt}>←</Text>
                </TouchableOpacity>
                <Text style={s.heading}>Confirm & Pay</Text>
              </View>

              <View style={s.paySummaryCard}>
                <View style={s.paySummaryRow}>
                  <Text style={s.paySummaryIcon}>🛺</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.paySummaryNum}>
                      {selectedRide.autoNumber} · {selectedRide.autoModel}
                    </Text>
                    <Text style={s.paySummaryDriver}>{selectedRide.driverName}</Text>
                  </View>
                  <View style={s.payFareTag}>
                    <Text style={s.payFareTagTxt}>₹{selectedRide.farePerSeat}</Text>
                  </View>
                </View>
                <View style={s.paySummaryDivider} />
                <View style={s.payRouteRow}>
                  <View style={[s.payRouteDot, { backgroundColor: C.green }]} />
                  <Text style={s.payRouteTxt} numberOfLines={1}>
                    {selectedRide.origin.name}
                  </Text>
                </View>
                <View style={s.payRouteConnector} />
                <View style={s.payRouteRow}>
                  <View style={[s.payRouteDot, { backgroundColor: C.red }]} />
                  <Text style={s.payRouteTxt} numberOfLines={1}>
                    {selectedRide.destination.name}
                  </Text>
                </View>
              </View>

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
                  <Text style={[s.fareBreakVal, { fontWeight: "800", fontSize: 16, color: C.text1 }]}>
                    ₹{selectedRide.farePerSeat}
                  </Text>
                </View>
              </View>

              <Text style={s.sectionLabel}>PAYMENT METHOD</Text>
              <View style={s.payMethodRow}>
                {(["upi", "cash", "card"] as PayMethod[]).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[s.payMethodBtn, payMethod === m && s.payMethodBtnOn]}
                    onPress={() => setPayMethod(m)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.payMethodIcon}>{m === "upi" ? "📱" : m === "cash" ? "💵" : "💳"}</Text>
                    <Text style={[s.payMethodLabel, payMethod === m && s.payMethodLabelOn]}>{m.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {payMethod === "upi" && (
                <View style={s.upiBox}>
                  <TextInput
                    style={s.upiInput}
                    placeholder="Enter UPI ID (e.g. name@upi)"
                    placeholderTextColor={C.text4}
                    value={upiId}
                    onChangeText={setUpiId}
                    autoCapitalize="none"
                  />
                </View>
              )}
              {payMethod === "cash" && (
                <View style={s.cashNote}>
                  <Text style={s.cashNoteTxt}>
                    {"💵  Pay ₹" + selectedRide.farePerSeat + " in cash directly to the driver when you board."}
                  </Text>
                </View>
              )}
              {payMethod === "card" && (
                <View style={s.upiBox}>
                  <TextInput
                    style={s.upiInput}
                    placeholder="Card number"
                    placeholderTextColor={C.text4}
                    keyboardType="number-pad"
                  />
                </View>
              )}

              <TouchableOpacity
                style={[s.payBtn, processing && { opacity: 0.6 }]}
                onPress={handlePay}
                disabled={processing}
                activeOpacity={0.85}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.payBtnTxt}>
                    {payMethod === "cash" ? "Confirm Booking" : "Pay ₹" + selectedRide.farePerSeat}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </Animated.View>
        )}

        {screen === "confirmed" && selectedRide && (
          <Animated.View style={[s.panel, { transform: [{ translateY: panelY }] }]}>
            <View style={s.panelHandle} />
            <View style={s.confirmedHeader}>
              <View style={s.confirmedIconBig}>
                <Text style={{ fontSize: 32 }}>✅</Text>
              </View>
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
                <Text style={s.ticketVal}>
                  {selectedRide.autoNumber + "  ·  " + selectedRide.autoModel}
                </Text>
              </View>
              <View style={s.ticketDivider} />
              <View style={s.ticketRow}>
                <Text style={s.ticketLabel}>From</Text>
                <Text style={s.ticketVal} numberOfLines={1}>
                  {selectedRide.origin.name}
                </Text>
              </View>
              <View style={s.ticketDivider} />
              <View style={s.ticketRow}>
                <Text style={s.ticketLabel}>To</Text>
                <Text style={s.ticketVal} numberOfLines={1}>
                  {selectedRide.destination.name}
                </Text>
              </View>
              <View style={s.ticketDivider} />
              <View style={s.ticketRow}>
                <Text style={s.ticketLabel}>Distance</Text>
                <Text style={s.ticketVal}>{fmtDistance(selectedRide.distance)}</Text>
              </View>
              <View style={s.ticketDivider} />
              <View style={s.ticketRow}>
                <Text style={s.ticketLabel}>Fare paid</Text>
                <Text style={[s.ticketVal, { color: C.green, fontWeight: "800" }]}>
                  {"₹" + selectedRide.farePerSeat}
                </Text>
              </View>
              <View style={s.ticketDivider} />
              <View style={s.ticketRow}>
                <Text style={s.ticketLabel}>Payment</Text>
                <Text style={s.ticketVal}>
                  {payMethod === "upi" ? "UPI · " + (upiId || "Paid") : payMethod === "cash" ? "Cash to driver" : "Card"}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={[s.primaryBtn, { marginBottom: 10 }]} onPress={handleStartTracking} activeOpacity={0.85}>
              <Text style={s.primaryTxt}>{"🛺  Track My Ride"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.ghostBtn} onPress={handleReset} activeOpacity={0.8}>
              <Text style={s.ghostBtnTxt}>Back to Home</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {screen === "tracking" && selectedRide && (
          <Animated.View style={[s.trackingPanel, { transform: [{ translateY: trackingPanelY }] }]}>
            <View style={s.panelHandle} />
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
                <Text style={s.etaRouteTxt} numberOfLines={1}>
                  {"📍 " + selectedRide.origin.name}
                </Text>
                <View style={s.etaRouteConnector} />
                <Text style={s.etaRouteTxt} numberOfLines={1}>
                  {"🏁 " + selectedRide.destination.name}
                </Text>
              </View>
            </View>

            <View style={s.trackDriverCard}>
              <View style={s.trackDriverIcon}>
                <Text style={{ fontSize: 22 }}>🧑‍✈️</Text>
              </View>
              <View style={s.trackDriverInfo}>
                <Text style={s.trackDriverName}>{selectedRide.driverName}</Text>
                <Text style={s.trackDriverNum}>
                  {selectedRide.autoNumber + " · " + selectedRide.autoModel}
                </Text>
              </View>
              <View style={s.trackFareBadge}>
                <Text style={s.trackFareTxt}>{"₹" + selectedRide.farePerSeat}</Text>
              </View>
            </View>

            <View style={s.trackDivider} />

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

        {showFooterNav ? (
          <MapFooterNav
            onHomePress={() =>
              mapCamera.current?.setCamera({
                centerCoordinate: pickupCoords,
                zoomLevel: 14,
                animationDuration: 500,
              })
            }
            onProfilePress={() => navigation?.navigate("PassengerProfile")}
          />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
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
    alignItems: "flex-start",
  },
  brandPill: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  brandTxt: { fontSize: 15, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.2 },
  routePill: {
    position: "absolute",
    bottom: 0,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.white,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  routePillWarn: { borderWidth: 1, borderColor: C.gold },
  routePillTxt: { fontSize: 14, fontWeight: "800", color: C.text1 },
  routePillTxtWarn: { color: C.text2 },
  liveBadge: {
    position: "absolute",
    top: Platform.OS === "ios" ? 52 : 42,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 6,
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  liveBadgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  liveBadgeTxt: { fontSize: 11, fontWeight: "800", color: C.green, letterSpacing: 0.5 },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: 12,
  },
  panel: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 88 : 76,
    maxHeight: "54%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  payPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 30,
    maxHeight: "78%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 26,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  heading: { fontSize: 19, fontWeight: "800", color: C.text1, marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontWeight: "800", color: C.text3, letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  payHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  backBtn: { width: 32, height: 32, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", borderRadius: 8 },
  backBtnTxt: { fontSize: 17, color: C.text1, fontWeight: "600" },
  paySummaryCard: { borderWidth: 1, borderColor: C.border, borderRadius: 12, marginBottom: 16, overflow: "hidden" },
  paySummaryRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  paySummaryIcon: { fontSize: 28 },
  paySummaryNum: { fontSize: 14, fontWeight: "800", color: C.text1 },
  paySummaryDriver: { fontSize: 12, color: C.text3, marginTop: 2, fontWeight: "500" },
  payFareTag: { backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  payFareTagTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  paySummaryDivider: { height: 1, backgroundColor: C.border },
  payRouteRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, gap: 10 },
  payRouteDot: { width: 8, height: 8, borderRadius: 4 },
  payRouteTxt: { fontSize: 12, color: C.text2, fontWeight: "600", flex: 1 },
  payRouteConnector: { height: 1, backgroundColor: C.border, marginLeft: 32 },
  fareBreakCard: { borderWidth: 1, borderColor: C.border, borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  fareBreakRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  fareBreakDivider: { height: 1, backgroundColor: C.border },
  fareBreakLabel: { fontSize: 13, color: C.text3, fontWeight: "500" },
  fareBreakVal: { fontSize: 14, fontWeight: "700", color: C.text2 },
  payMethodRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  payMethodBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 10,
  },
  payMethodBtnOn: { borderColor: C.accent, backgroundColor: "#F5F5F5" },
  payMethodIcon: { fontSize: 20, marginBottom: 4 },
  payMethodLabel: { fontSize: 12, fontWeight: "700", color: C.text3 },
  payMethodLabelOn: { color: C.text1 },
  upiBox: { borderWidth: 1, borderColor: C.border, marginBottom: 14, borderRadius: 10, overflow: "hidden" },
  upiInput: { fontSize: 14, color: C.text1, paddingHorizontal: 14, paddingVertical: 13, fontWeight: "500" },
  cashNote: { borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14, backgroundColor: C.goldBg, borderRadius: 10 },
  cashNoteTxt: { fontSize: 13, color: C.gold, fontWeight: "600", lineHeight: 20 },
  payBtn: { backgroundColor: C.green, paddingVertical: 15, alignItems: "center", borderRadius: 12 },
  payBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "900" },
  confirmedHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  confirmedIconBig: {
    width: 56,
    height: 56,
    backgroundColor: C.greenBg,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
  },
  confirmedTitle: { fontSize: 18, fontWeight: "800", color: C.text1 },
  confirmedRef: { fontSize: 12, color: C.text3, marginTop: 3, fontWeight: "600" },
  ticketCard: { borderWidth: 1, borderColor: C.border, marginBottom: 12, borderRadius: 12, overflow: "hidden" },
  ticketRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  ticketDivider: { height: 1, backgroundColor: C.border },
  ticketLabel: { fontSize: 12, color: C.text3, fontWeight: "600" },
  ticketVal: { fontSize: 13, fontWeight: "700", color: C.text1, flex: 1, textAlign: "right" },
  primaryBtn: { backgroundColor: C.accent, paddingVertical: 14, alignItems: "center", borderRadius: 12 },
  primaryTxt: { color: "#fff", fontSize: 14, fontWeight: "800" },
  ghostBtn: { borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: "center", borderRadius: 12 },
  ghostBtnTxt: { fontSize: 14, fontWeight: "700", color: C.text2 },
  trackingPanel: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  etaBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
  },
  etaBannerGreen: { borderColor: C.green, backgroundColor: C.greenBg },
  etaLeft: { marginRight: 16, alignItems: "center", minWidth: 52 },
  etaNum: { fontSize: 38, fontWeight: "900", color: C.text1, lineHeight: 42 },
  etaSub: { fontSize: 10, color: C.text3, fontWeight: "700", marginTop: 2, textAlign: "center" },
  etaRight: { flex: 1 },
  etaRouteTxt: { fontSize: 12, color: C.text2, fontWeight: "600" },
  etaRouteConnector: { height: 8, width: 1, backgroundColor: C.border, marginLeft: 7, marginVertical: 3 },
  trackDriverCard: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  trackDriverIcon: {
    width: 44,
    height: 44,
    backgroundColor: C.goldBg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
  },
  trackDriverInfo: { flex: 1 },
  trackDriverName: { fontSize: 14, fontWeight: "800", color: C.text1, marginBottom: 2 },
  trackDriverNum: { fontSize: 12, color: C.text3, fontWeight: "500" },
  trackFareBadge: { backgroundColor: C.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  trackFareTxt: { fontSize: 13, fontWeight: "900", color: "#fff" },
  trackDivider: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  safetyRow: { flexDirection: "row", gap: 10 },
  safetyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 10,
  },
  safetyBtnSOS: { borderColor: C.red + "44", backgroundColor: C.redBg },
  safetyIcon: { fontSize: 18, marginBottom: 3 },
  safetyLabel: { fontSize: 11, fontWeight: "800", color: C.text3 },
});
