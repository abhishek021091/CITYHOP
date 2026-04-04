import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Platform, ActivityIndicator, Switch, Alert,
  Animated,
} from "react-native";
import { getAuth, signOut } from "@react-native-firebase/auth";
import {
  getFirestore, collection, query, where,
  orderBy, getDocs,
} from "@react-native-firebase/firestore";

const C = {
  bg:      "#F4F4F4",
  white:   "#FFFFFF",
  border:  "#E5E5E5",
  accent:  "#1C1C1E",
  green:   "#1A8F5C",
  greenBg: "#EAF7F1",
  red:     "#D93025",
  redBg:   "#FEF0EF",
  gold:    "#E69A00",
  goldBg:  "#FEF8EE",
  text1:   "#111111",
  text2:   "#444444",
  text3:   "#888888",
  text4:   "#BBBBBB",
};

interface Booking {
  id:            string;
  bookingRef:    string;
  driverName:    string;
  autoNumber:    string;
  farePerSeat:   number;
  paymentMethod: string;
  status:        string;
  origin:        { name: string };
  destination:   { name: string };
  createdAt:     any;
}

const fmtDate = (ts: any): string => {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
};
const fmtTime = (ts: any): string => {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};

interface Props { navigation: any; }

export default function PassengerProfile({ navigation }: Props) {
  const auth      = getAuth();
  const db        = getFirestore();
  const user      = auth.currentUser;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [bookings,    setBookings]    = useState<Booking[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [notifOn,     setNotifOn]     = useState(true);
  const [locationOn,  setLocationOn]  = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [etaMin,      setEtaMin]      = useState(4);

  // Derived
  const tripCount  = bookings.length;
  const totalPaid  = bookings.reduce((a, b) => a + (b.farePerSeat || 0), 0);
  //const totalSaved = bookings.reduce((a, b) => a + Math.max(0, Math.round((b.farePerSeat || 0) * 1.5)), 0);
  const totalSaved = bookings.reduce((a, b) => {
  const soloEstimate = Math.round((b.farePerSeat || 0) * 2.5); // solo auto ~2.5x shared seat
  return a + Math.max(0, soloEstimate - (b.farePerSeat || 0));
}, 0);
  const latestBooking = bookings[0] || null;

  // Pulse live dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ETA countdown
  useEffect(() => {
    if (!latestBooking || etaMin <= 0) return;
    const t = setTimeout(() => setEtaMin(p => Math.max(0, p - 1)), 60000);
    return () => clearTimeout(t);
  }, [etaMin, latestBooking]);

  // Load bookings from Firestore
//   useEffect(() => {
//     if (!user) return;
//     (async () => {
//       try {
//         const q = query(
//           collection(db, "bookings"),
//           where("passengerId", "==", user.uid),
//           orderBy("createdAt", "desc")
//         );
//         const snap = await getDocs(q);
//         const list: Booking[] = snap.docs.map(d => ({
//           id: d.id,
//           bookingRef: `RS${d.id.slice(0, 6).toUpperCase()}`,
//           ...(d.data() as any),
//         }));
//         setBookings(list);
//       } catch (e) { console.warn("Profile load:", e); }
//       finally     { setLoading(false); }
//     })();
//   }, []);
// Load bookings from Firestore
useEffect(() => {
  if (!user) return;
  (async () => {
    try {
      // NOTE: This query requires a composite index in Firestore.
      // Click the link in your console log to generate it automatically.
      const q = query(
        collection(db, "bookings"),
        where("passengerId", "==", user.uid),
        orderBy("createdAt", "desc")
      ) as any; // Cast to any if using strict older versions of the SDK

      const snap = await getDocs(q);
      
      // Fixed the 'd' implicitly has an 'any' type error by defining the type
      const list: Booking[] = snap.docs.map((d: any) => ({
        id: d.id,
        bookingRef: `RS${d.id.slice(0, 6).toUpperCase()}`,
        ...(d.data() as any),
      }));
      
      setBookings(list);
    } catch (e) { 
      console.warn("Profile load:", e); 
    }
    finally { 
      setLoading(false); 
    }
  })();
}, [user, db]); // Added dependencies for stability









  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout", style: "destructive",
        onPress: async () => {
          try { await signOut(auth); navigation.replace("RoleSelect"); }
          catch (e: any) { Alert.alert("Error", e.message); }
        },
      },
    ]);
  };

  const displayName = user?.email?.split("@")[0] || "Passenger";
  const initials    = displayName.slice(0, 2).toUpperCase();
  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "—";

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={s.backBtnTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Account</Text>
        <TouchableOpacity style={s.logoutTopBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={s.logoutTopTxt}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── PROFILE ─────────────────────────────────────────── */}
        <View style={s.profileCard}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarInitials}>{initials}</Text>
          </View>
          <View style={s.profileInfo}>
            <Text style={s.displayName}>{displayName}</Text>
            <Text style={s.emailTxt}>{user?.email || "—"}</Text>
            <View style={s.memberBadge}>
              <Text style={s.memberTxt}>Member since {memberSince}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── STATS ───────────────────────────────────────────── */}
        <View style={s.statsRow}>
          <View style={[s.statItem, s.statBorder]}>
            <Text style={s.statVal}>{loading ? "—" : tripCount}</Text>
            <Text style={s.statLabel}>{"Total\ntrips"}</Text>
          </View>
          <View style={[s.statItem, s.statBorder]}>
            <Text style={s.statVal}>₹{loading ? "—" : totalPaid}</Text>
            <Text style={s.statLabel}>{"Total\npaid"}</Text>
          </View>
          <View style={s.statItem}>
            <Text style={[s.statVal, { color: C.green }]}>₹{loading ? "—" : totalSaved}</Text>
            <Text style={s.statLabel}>{"Total\nsaved"}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── ACTIVE TRACKING ─────────────────────────────────── */}
        {latestBooking && (
          <>
            <View style={s.section}>
              <View style={s.sectionRow}>
                <Text style={s.sectionLabel}>ACTIVE TRIP</Text>
                <View style={s.liveChip}>
                  <Animated.View style={[s.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                  <Text style={s.liveTxt}>LIVE</Text>
                </View>
              </View>

              <View style={s.trackCard}>
                {/* ETA row */}
                <View style={s.trackEtaRow}>
                  <View style={s.etaBox}>
                    <Text style={s.etaNum}>{etaMin > 0 ? etaMin : "🎉"}</Text>
                    <Text style={s.etaSub}>{etaMin > 0 ? "min away" : "Arrived!"}</Text>
                  </View>
                  <View style={s.etaRoute}>
                    <Text style={s.etaRouteTxt} numberOfLines={1}>📍 {latestBooking.origin?.name}</Text>
                    <View style={s.etaRouteLine} />
                    <Text style={s.etaRouteTxt} numberOfLines={1}>🏁 {latestBooking.destination?.name}</Text>
                  </View>
                </View>

                <View style={s.innerDivider} />

                {/* Driver row */}
                <View style={s.trackDriverRow}>
                  <View style={s.driverIconBox}>
                    <Text style={{ fontSize: 20 }}>🧑‍✈️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.driverName}>{latestBooking.driverName}</Text>
                    <Text style={s.driverNum}>{latestBooking.autoNumber}</Text>
                  </View>
                  <View style={s.fareBadge}>
                    <Text style={s.fareBadgeTxt}>₹{latestBooking.farePerSeat}</Text>
                  </View>
                </View>

                <View style={s.innerDivider} />

                {/* Footer actions */}
                <View style={s.trackFooter}>
                  <Text style={s.trackRef}>Ref: {latestBooking.bookingRef}</Text>
                  <View style={s.trackBtns}>
                    <TouchableOpacity
                      style={s.trackBtn}
                      onPress={() => Alert.alert("Trip Shared", "Sent to your emergency contact.")}
                      activeOpacity={0.8}
                    >
                      <Text style={s.trackBtnTxt}>🔗 Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.trackBtn, s.trackBtnSOS]}
                      onPress={() => Alert.alert("SOS", "Emergency services notified.")}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.trackBtnTxt, { color: C.red }]}>🚨 SOS</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
            <View style={s.divider} />
          </>
        )}

        {/* ── TRIP HISTORY ────────────────────────────────────── */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.sectionRow}
            onPress={() => setHistoryOpen(o => !o)}
            activeOpacity={0.7}
          >
            <Text style={s.sectionLabel}>
              TRIP HISTORY{loading ? " (…)" : ` (${tripCount})`}
            </Text>
            <Text style={s.collapseArrow}>{historyOpen ? "▲" : "▼"}</Text>
          </TouchableOpacity>

          {loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={s.loadingTxt}>Loading trips…</Text>
            </View>
          ) : bookings.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>🛺</Text>
              <Text style={s.emptyTitle}>No trips yet</Text>
              <Text style={s.emptySub}>Your completed rides will appear here</Text>
            </View>
          ) : historyOpen ? (
            <>
              {bookings.map((item, index) => (
                <View key={item.id} style={[s.historyCard, index > 0 && s.historyCardTop]}>
                  {/* top */}
                  <View style={s.historyTop}>
                    <View style={s.historyAutoIcon}>
                      <Text style={{ fontSize: 18 }}>🛺</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.historyAutoNum}>{item.autoNumber}</Text>
                      <Text style={s.historyDriver}>{item.driverName}</Text>
                    </View>
                    <View style={s.historyRight}>
                      <Text style={s.historyFare}>₹{item.farePerSeat}</Text>
                      <View style={s.historyDoneBadge}>
                        <Text style={s.historyDoneTxt}>DONE</Text>
                      </View>
                    </View>
                  </View>
                  {/* route */}
                  <View style={s.hRouteRow}><View style={s.hDotGreen} /><Text style={s.hRouteTxt} numberOfLines={1}>{item.origin?.name || "—"}</Text></View>
                  <View style={s.hConnector} />
                  <View style={s.hRouteRow}><View style={s.hDotRed} /><Text style={s.hRouteTxt} numberOfLines={1}>{item.destination?.name || "—"}</Text></View>
                  {/* footer */}
                  <View style={s.historyFooter}>
                    <Text style={s.historyDate}>{fmtDate(item.createdAt)}  ·  {fmtTime(item.createdAt)}</Text>
                    <View style={s.payBadge}>
                      <Text style={s.payBadgeTxt}>
                        {item.paymentMethod === "upi" ? "UPI" : item.paymentMethod === "cash" ? "CASH" : "CARD"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </View>

        <View style={s.divider} />

        {/* ── ECO IMPACT ──────────────────────────────────────── */}
        <View style={s.ecoCard}>
          <Text style={s.ecoTitle}>🌿 Your environmental impact</Text>
          <Text style={s.ecoSub}>Sharing rides reduces fuel use and carbon emissions</Text>
          <View style={s.ecoRow}>
            {[
              { val: `${tripCount * 2}`, label: "Kg CO₂\nsaved" },
              { val: `${tripCount}`,     label: "Rides\nshared" },
              { val: `${tripCount * 4}`, label: "Trees\nequivalent" },
            ].map((e, i) => (
              <View key={i} style={s.ecoStat}>
                <Text style={s.ecoVal}>{e.val}</Text>
                <Text style={s.ecoLabel}>{e.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.divider} />

        {/* ── PREFERENCES ─────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { marginBottom: 12 }]}>PREFERENCES</Text>
          <View style={s.prefRow}>
            <Text style={s.prefIcon}>🔔</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.prefTitle}>Ride notifications</Text>
              <Text style={s.prefSub}>Alerts for driver arrivals</Text>
            </View>
            <Switch value={notifOn} onValueChange={setNotifOn} trackColor={{ true: C.green, false: C.border }} thumbColor={C.white} />
          </View>
          <View style={s.prefDivider} />
          <View style={s.prefRow}>
            <Text style={s.prefIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.prefTitle}>Location sharing</Text>
              <Text style={s.prefSub}>For better ride matching</Text>
            </View>
            <Switch value={locationOn} onValueChange={setLocationOn} trackColor={{ true: C.green, false: C.border }} thumbColor={C.white} />
          </View>
        </View>

        <View style={s.divider} />

        {/* ── LOGOUT ──────────────────────────────────────────── */}
        <View style={s.logoutSection}>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={s.logoutTxt}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={s.versionRow}>
          <Text style={s.versionTxt}>CityHop v1.0 · Made in India 🇮🇳</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: C.bg },
  scroll:          { paddingBottom: 40 },
  divider:         { height: 1, backgroundColor: C.border },

  header:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 52 : 60, paddingBottom: 16, backgroundColor: C.white },
  backBtn:         { width: 36, height: 36, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center" },
  backBtnTxt:      { fontSize: 18, color: C.text1, fontWeight: "600" },
  headerTitle:     { fontSize: 17, fontWeight: "700", color: C.text1 },
  logoutTopBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  logoutTopTxt:    { fontSize: 12, fontWeight: "600", color: C.text3 },

  profileCard:     { flexDirection: "row", alignItems: "center", padding: 20, backgroundColor: C.white, gap: 16 },
  avatarCircle:    { width: 60, height: 60, backgroundColor: C.accent, justifyContent: "center", alignItems: "center" },
  avatarInitials:  { fontSize: 20, fontWeight: "800", color: "#fff" },
  profileInfo:     { flex: 1 },
  displayName:     { fontSize: 17, fontWeight: "700", color: C.text1, marginBottom: 2 },
  emailTxt:        { fontSize: 12, color: C.text3, marginBottom: 8 },
  memberBadge:     { alignSelf: "flex-start", backgroundColor: C.goldBg, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: C.gold + "44" },
  memberTxt:       { fontSize: 10, color: C.gold, fontWeight: "600" },

  statsRow:        { flexDirection: "row", backgroundColor: C.white },
  statItem:        { flex: 1, alignItems: "center", paddingVertical: 18 },
  statBorder:      { borderRightWidth: 1, borderColor: C.border },
  statVal:         { fontSize: 20, fontWeight: "800", color: C.text1, marginBottom: 4 },
  statLabel:       { fontSize: 10, color: C.text3, textAlign: "center", lineHeight: 14 },

  section:         { backgroundColor: C.white, paddingHorizontal: 20, paddingVertical: 16 },
  sectionRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionLabel:    { fontSize: 10, fontWeight: "700", color: C.text4, letterSpacing: 1.5 },
  collapseArrow:   { fontSize: 10, color: C.text4 },

  liveChip:        { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.greenBg, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.green + "44" },
  liveDot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  liveTxt:         { fontSize: 9, fontWeight: "800", color: C.green, letterSpacing: 1.5 },

  trackCard:       { borderWidth: 1, borderColor: C.border, backgroundColor: "#FAFAFA" },
  trackEtaRow:     { flexDirection: "row", alignItems: "center", padding: 14, gap: 14 },
  etaBox:          { alignItems: "center", minWidth: 50 },
  etaNum:          { fontSize: 38, fontWeight: "900", color: C.text1, lineHeight: 42 },
  etaSub:          { fontSize: 10, color: C.text3, fontWeight: "600", marginTop: 2, textAlign: "center" },
  etaRoute:        { flex: 1 },
  etaRouteTxt:     { fontSize: 12, color: C.text2, fontWeight: "500" },
  etaRouteLine:    { height: 10, width: 1, backgroundColor: C.border, marginLeft: 7, marginVertical: 2 },
  innerDivider:    { height: 1, backgroundColor: C.border },
  trackDriverRow:  { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  driverIconBox:   { width: 38, height: 38, backgroundColor: C.goldBg, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: C.border },
  driverName:      { fontSize: 13, fontWeight: "700", color: C.text1 },
  driverNum:       { fontSize: 11, color: C.text3, marginTop: 2 },
  fareBadge:       { backgroundColor: C.accent, paddingHorizontal: 8, paddingVertical: 4 },
  fareBadgeTxt:    { fontSize: 13, fontWeight: "800", color: "#fff" },
  trackFooter:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 },
  trackRef:        { fontSize: 11, color: C.text4 },
  trackBtns:       { flexDirection: "row", gap: 10 },
  trackBtn:        { paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
  trackBtnSOS:     { borderColor: C.red + "55", backgroundColor: C.redBg },
  trackBtnTxt:     { fontSize: 11, fontWeight: "700", color: C.text3 },

  loadingRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 16, gap: 10 },
  loadingTxt:      { fontSize: 13, color: C.text3 },
  emptyWrap:       { alignItems: "center", paddingVertical: 24 },
  emptyIcon:       { fontSize: 32, marginBottom: 8 },
  emptyTitle:      { fontSize: 14, fontWeight: "700", color: C.text2, marginBottom: 4 },
  emptySub:        { fontSize: 12, color: C.text3, textAlign: "center" },

  historyCard:     { paddingVertical: 14 },
  historyCardTop:  { borderTopWidth: 1, borderColor: C.border },
  historyTop:      { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  historyAutoIcon: { width: 36, height: 36, backgroundColor: C.goldBg, justifyContent: "center", alignItems: "center", marginRight: 10, borderWidth: 1, borderColor: C.border },
  historyAutoNum:  { fontSize: 13, fontWeight: "700", color: C.text1, marginBottom: 2 },
  historyDriver:   { fontSize: 11, color: C.text3 },
  historyRight:    { alignItems: "flex-end", gap: 4 },
  historyFare:     { fontSize: 15, fontWeight: "800", color: C.text1 },
  historyDoneBadge:{ backgroundColor: C.greenBg, paddingHorizontal: 5, paddingVertical: 2 },
  historyDoneTxt:  { fontSize: 9, fontWeight: "800", color: C.green },
  hRouteRow:       { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  hDotGreen:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 8 },
  hDotRed:         { width: 6, height: 6, borderRadius: 3, backgroundColor: C.red,   marginRight: 8 },
  hRouteTxt:       { fontSize: 12, color: C.text2, flex: 1, fontWeight: "500" },
  hConnector:      { width: 1, height: 6, backgroundColor: C.border, marginLeft: 2, marginBottom: 2 },
  historyFooter:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: C.border },
  historyDate:     { fontSize: 11, color: C.text4 },
  payBadge:        { backgroundColor: "#F0F0F0", paddingHorizontal: 6, paddingVertical: 2 },
  payBadgeTxt:     { fontSize: 9, fontWeight: "700", color: C.text3 },

  ecoCard:         { backgroundColor: C.greenBg, padding: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.green + "33" },
  ecoTitle:        { fontSize: 13, fontWeight: "700", color: C.green, marginBottom: 4 },
  ecoSub:          { fontSize: 12, color: C.green, opacity: 0.8, marginBottom: 16, lineHeight: 18 },
  ecoRow:          { flexDirection: "row" },
  ecoStat:         { flex: 1, alignItems: "center" },
  ecoVal:          { fontSize: 20, fontWeight: "800", color: C.green, marginBottom: 4 },
  ecoLabel:        { fontSize: 10, color: C.green, textAlign: "center", lineHeight: 14, opacity: 0.8 },

  prefRow:         { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  prefDivider:     { height: 1, backgroundColor: C.border },
  prefIcon:        { fontSize: 16, marginRight: 14, width: 22, textAlign: "center" },
  prefTitle:       { fontSize: 14, fontWeight: "600", color: C.text1, marginBottom: 2 },
  prefSub:         { fontSize: 11, color: C.text3 },

  logoutSection:   { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.white },
  logoutBtn:       { borderWidth: 1.5, borderColor: C.accent, paddingVertical: 13, alignItems: "center" },
  logoutTxt:       { fontSize: 14, fontWeight: "700", color: C.text1 },
  versionRow:      { alignItems: "center", paddingVertical: 16 },
  versionTxt:      { fontSize: 11, color: C.text4 },
});