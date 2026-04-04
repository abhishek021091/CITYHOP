import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Platform, ActivityIndicator, Switch, Alert, Animated,
} from "react-native";
import { getAuth, signOut } from "@react-native-firebase/auth";
import {
  getFirestore, collection, query, where,
  orderBy, getDocs, doc, getDoc,
} from "@react-native-firebase/firestore";

// ── Design tokens (matches DriverHome) ────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface DriverData {
  name:     string;
  phone:    string;
  vehicle:  string;   // auto model
  license:  string;
  email:    string;
}

interface RideRecord {
  id:          string;
  autoNumber:  string;
  autoModel:   string;
  origin:      { name: string };
  destination: { name: string };
  bookedSeats: number;
  farePerSeat: number;
  distance:    number;
  duration:    number;
  status:      string;
  createdAt:   any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
const fmtDist = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { navigation: any; }

export default function DriverProfile({ navigation }: Props) {
  const auth = getAuth();
  const db   = getFirestore();
  const user = auth.currentUser;

  // ── Animated badge ───────────────────────────────────────────────────────────
  const verifiedAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(verifiedAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  // ── State ────────────────────────────────────────────────────────────────────
  const [profile,       setProfile]       = useState<DriverData | null>(null);
  const [rides,         setRides]         = useState<RideRecord[]>([]);
  const [loadingProfile,setLoadingProfile]= useState(true);
  const [loadingRides,  setLoadingRides]  = useState(true);
  const [notifOn,       setNotifOn]       = useState(true);
  const [locationOn,    setLocationOn]    = useState(true);
  const [historyOpen,   setHistoryOpen]   = useState(true);

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const totalRides      = rides.length;
  const totalPassengers = rides.reduce((a, r) => a + (r.bookedSeats || 0), 0);
  const totalEarnings   = rides.reduce((a, r) => a + (r.farePerSeat || 0) * (r.bookedSeats || 0), 0);
  const totalKm         = rides.reduce((a, r) => a + (r.distance   || 0), 0) / 1000;
  const avgRating       = 4.7; // static for now — can be pulled from ratings collection later
  const thisMonthRides  = rides.filter(r => {
    if (!r.createdAt) return false;
    try {
      const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } catch { return false; }
  });
  const thisMonthEarnings = thisMonthRides.reduce((a, r) => a + (r.farePerSeat || 0) * (r.bookedSeats || 0), 0);

  // ── Load driver profile from Firestore ───────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "drivers", user.uid));
        if (snap.exists()) {
          setProfile(snap.data() as DriverData);
        } else {
          // Fallback to auth email if no Firestore doc
          setProfile({ name: user.email?.split("@")[0] || "Driver", phone: "—", vehicle: "—", license: "—", email: user.email || "—" });
        }
      } catch (e) { console.warn("DriverProfile:", e); }
      finally     { setLoadingProfile(false); }
    })();
  }, []);

  // ── Load ride history (rides created by this driver) ─────────────────────────
  // useEffect(() => {
  //   if (!user) return;
  //   (async () => {
  //     try {
  //       const q = query(
  //         collection(db, "rides"),
  //         where("driverUid", "==", user.uid),
  //         orderBy("createdAt", "desc")
  //       );
  //       const snap = await getDocs(q);
  //       const list: RideRecord[] = snap.docs.map(d => ({
  //         id: d.id,
  //         ...(d.data() as any),
  //       }));
  //       setRides(list);
  //     } catch (e) { console.warn("RideHistory:", e); }
  //     finally     { setLoadingRides(false); }
  //   })();
  // }, []);
// ... (rest of the code remains exactly the same)

  // ── Load ride history (rides created by this driver) ─────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const q = query(
          collection(db, "rides"),
          where("driverUid", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        
        // FIXED: Added explicit 'any' type to 'd' to resolve the implicit any error
        const list: RideRecord[] = snap.docs.map((d: any) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        
        setRides(list);
      } catch (e) { console.warn("RideHistory:", e); }
      finally     { setLoadingRides(false); }
    })();
  }, []);

// ... (rest of the code remains exactly the same)
  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
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

  // ── Display ───────────────────────────────────────────────────────────────────
  const displayName = profile?.name || user?.email?.split("@")[0] || "Driver";
  const initials    = displayName.slice(0, 2).toUpperCase();
  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "—";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={s.backBtnTxt}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Driver Profile</Text>
          <View style={s.driverBadge}>
            <Text style={s.driverBadgeTxt}>DRIVER</Text>
          </View>
        </View>
        <TouchableOpacity style={s.logoutTopBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={s.logoutTopTxt}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── PROFILE CARD ─────────────────────────────────────── */}
        {loadingProfile ? (
          <View style={s.loadingCard}>
            <ActivityIndicator size="small" color={C.accent} />
          </View>
        ) : (
          <View style={s.profileCard}>
            {/* Avatar */}
            <View style={s.avatarWrap}>
              <View style={s.avatarCircle}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
              <Animated.View style={[s.verifiedBadge, { opacity: verifiedAnim }]}>
                <Text style={s.verifiedTxt}>✓ Verified</Text>
              </Animated.View>
            </View>

            {/* Info */}
            <View style={s.profileInfo}>
              <Text style={s.displayName}>{displayName}</Text>
              <Text style={s.emailTxt}>{profile?.email || user?.email || "—"}</Text>
              {profile?.phone !== "—" && (
                <Text style={s.phoneTxt}>📞 {profile?.phone}</Text>
              )}
              <View style={s.memberBadge}>
                <Text style={s.memberTxt}>Driver since {memberSince}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={s.divider} />

        {/* ── VEHICLE INFO ──────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>VEHICLE DETAILS</Text>
          <View style={s.vehicleCard}>
            <View style={s.vehicleRow}>
              <View style={s.vehicleIcon}>
                <Text style={{ fontSize: 22 }}>🛺</Text>
              </View>
              <View style={s.vehicleInfo}>
                <Text style={s.vehicleModel}>{profile?.vehicle || "—"}</Text>
                <Text style={s.vehicleSub}>Auto-rickshaw</Text>
              </View>
              <View style={s.ratingBadge}>
                <Text style={s.ratingIcon}>⭐</Text>
                <Text style={s.ratingVal}>{avgRating}</Text>
              </View>
            </View>

            <View style={s.innerDivider} />

            <View style={s.vehicleDetailRow}>
              <View style={s.vehicleDetailItem}>
                <Text style={s.vehicleDetailLabel}>LICENSE</Text>
                <Text style={s.vehicleDetailVal}>{profile?.license || "—"}</Text>
              </View>
              <View style={s.vehicleDetailDivider} />
              <View style={s.vehicleDetailItem}>
                <Text style={s.vehicleDetailLabel}>STATUS</Text>
                <View style={s.activeStatusRow}>
                  <View style={s.activeStatusDot} />
                  <Text style={s.activeStatusTxt}>Active</Text>
                </View>
              </View>
              <View style={s.vehicleDetailDivider} />
              <View style={s.vehicleDetailItem}>
                <Text style={s.vehicleDetailLabel}>CAPACITY</Text>
                <Text style={s.vehicleDetailVal}>3 seats</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── EARNINGS SUMMARY ─────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>EARNINGS</Text>

          {/* Big earnings card */}
          <View style={s.earningsCard}>
            <View style={s.earningsMain}>
              <Text style={s.earningsMainLabel}>Total Earned</Text>
              <Text style={s.earningsMainVal}>
                ₹{loadingRides ? "—" : totalEarnings}
              </Text>
            </View>
            <View style={s.innerDivider} />
            <View style={s.earningsRow}>
              <View style={[s.earningsStat, s.earningsStatBorder]}>
                <Text style={s.earningsStatVal}>
                  ₹{loadingRides ? "—" : thisMonthEarnings}
                </Text>
                <Text style={s.earningsStatLabel}>This month</Text>
              </View>
              <View style={[s.earningsStat, s.earningsStatBorder]}>
                <Text style={s.earningsStatVal}>
                  {loadingRides ? "—" : totalRides > 0
                    ? `₹${Math.round(totalEarnings / totalRides)}`
                    : "₹0"}
                </Text>
                <Text style={s.earningsStatLabel}>Per ride avg</Text>
              </View>
              <View style={s.earningsStat}>
                <Text style={s.earningsStatVal}>
                  {loadingRides ? "—" : totalPassengers}
                </Text>
                <Text style={s.earningsStatLabel}>Passengers</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── PERFORMANCE STATS ─────────────────────────────────── */}
        <View style={s.statsGrid}>
          {[
            { val: loadingRides ? "—" : String(totalRides),      label: "Total\nrides",      color: C.text1 },
            { val: loadingRides ? "—" : `${totalKm.toFixed(0)}`, label: "Total\nkm driven",  color: C.text1 },
            { val: String(avgRating),                             label: "Driver\nrating",    color: C.gold  },
            { val: loadingRides ? "—" : String(thisMonthRides.length), label: "Rides this\nmonth", color: C.green },
          ].map((stat, i) => (
            <View key={i} style={[s.statCard, i % 2 === 0 && s.statCardLeft]}>
              <Text style={[s.statCardVal, { color: stat.color }]}>{stat.val}</Text>
              <Text style={s.statCardLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.divider} />

        {/* ── RIDE HISTORY ─────────────────────────────────────── */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.sectionHeaderRow}
            onPress={() => setHistoryOpen(o => !o)}
            activeOpacity={0.7}
          >
            <Text style={s.sectionLabel}>
              RIDE HISTORY{loadingRides ? " (…)" : ` (${totalRides})`}
            </Text>
            <Text style={s.collapseArrow}>{historyOpen ? "▲" : "▼"}</Text>
          </TouchableOpacity>

          {loadingRides ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={s.loadingTxt}>Loading rides…</Text>
            </View>
          ) : rides.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>🛺</Text>
              <Text style={s.emptyTitle}>No rides yet</Text>
              <Text style={s.emptySub}>Your completed rides will appear here</Text>
            </View>
          ) : historyOpen ? (
            <>
              {rides.map((ride, index) => (
                <View key={ride.id} style={[s.rideCard, index > 0 && s.rideCardTop]}>
                  {/* Top row */}
                  <View style={s.rideCardTop}>
                    <View style={s.rideAutoIcon}>
                      <Text style={{ fontSize: 18 }}>🛺</Text>
                    </View>
                    <View style={s.rideCardInfo}>
                      <Text style={s.rideAutoNum}>{ride.autoNumber || "—"}</Text>
                      <Text style={s.rideAutoModel}>{ride.autoModel || profile?.vehicle || "—"}</Text>
                    </View>
                    <View style={s.rideCardRight}>
                      <Text style={s.rideEarning}>
                        ₹{(ride.farePerSeat || 0) * (ride.bookedSeats || 0)}
                      </Text>
                      <View style={[
                        s.rideStatusBadge,
                        ride.status === "completed" ? s.statusCompleted : s.statusActive,
                      ]}>
                        <Text style={[
                          s.rideStatusTxt,
                          ride.status === "completed" ? s.statusTxtCompleted : s.statusTxtActive,
                        ]}>
                          {ride.status === "completed" ? "DONE" : ride.status?.toUpperCase() || "DONE"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Route */}
                  <View style={s.rideRouteRow}>
                    <View style={s.rDotGreen} />
                    <Text style={s.rRouteTxt} numberOfLines={1}>{ride.origin?.name || "—"}</Text>
                  </View>
                  <View style={s.rConnector} />
                  <View style={s.rideRouteRow}>
                    <View style={s.rDotGold} />
                    <Text style={s.rRouteTxt} numberOfLines={1}>{ride.destination?.name || "—"}</Text>
                  </View>

                  {/* Footer */}
                  <View style={s.rideFooter}>
                    <Text style={s.rideFooterTxt}>
                      {fmtDate(ride.createdAt)}  ·  {fmtTime(ride.createdAt)}
                    </Text>
                    <View style={s.rideFooterRight}>
                      <View style={s.passBadge}>
                        <Text style={s.passBadgeTxt}>
                          👤 {ride.bookedSeats || 0} passenger{(ride.bookedSeats || 0) !== 1 ? "s" : ""}
                        </Text>
                      </View>
                      {ride.distance > 0 && (
                        <Text style={s.rideDistTxt}>{fmtDist(ride.distance)}</Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </View>

        <View style={s.divider} />

        {/* ── ECO IMPACT ───────────────────────────────────────── */}
        <View style={s.ecoCard}>
          <Text style={s.ecoTitle}>🌿 Your environmental contribution</Text>
          <Text style={s.ecoSub}>
            By sharing rides you help reduce fuel consumption and emissions
          </Text>
          <View style={s.ecoRow}>
            {[
              { val: `${(totalKm * 0.12).toFixed(1)}`, label: "Litres\nfuel saved" },
              { val: `${totalPassengers}`,              label: "People\nmoved"      },
              { val: `${(totalKm * 0.21).toFixed(1)}`, label: "Kg CO₂\nreduced"   },
            ].map((e, i) => (
              <View key={i} style={s.ecoStat}>
                <Text style={s.ecoVal}>{loadingRides ? "—" : e.val}</Text>
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
              <Text style={s.prefTitle}>Booking notifications</Text>
              <Text style={s.prefSub}>Alert when a passenger books your ride</Text>
            </View>
            <Switch
              value={notifOn}
              onValueChange={setNotifOn}
              trackColor={{ true: C.green, false: C.border }}
              thumbColor={C.white}
            />
          </View>

          <View style={s.prefDivider} />

          <View style={s.prefRow}>
            <Text style={s.prefIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.prefTitle}>Live location sharing</Text>
              <Text style={s.prefSub}>Share location with matched passengers</Text>
            </View>
            <Switch
              value={locationOn}
              onValueChange={setLocationOn}
              trackColor={{ true: C.green, false: C.border }}
              thumbColor={C.white}
            />
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

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: C.bg },
  scroll:            { paddingBottom: 40 },
  divider:           { height: 1, backgroundColor: C.border },

  // Header
  header:            { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 52 : 60, paddingBottom: 16, backgroundColor: C.white },
  backBtn:           { width: 36, height: 36, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center" },
  backBtnTxt:        { fontSize: 18, color: C.text1, fontWeight: "600" },
  headerCenter:      { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle:       { fontSize: 17, fontWeight: "700", color: C.text1 },
  driverBadge:       { borderWidth: 1, borderColor: C.gold, paddingHorizontal: 6, paddingVertical: 2 },
  driverBadgeTxt:    { fontSize: 9, fontWeight: "800", color: C.gold, letterSpacing: 1.5 },
  logoutTopBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  logoutTopTxt:      { fontSize: 12, fontWeight: "600", color: C.text3 },

  // Profile
  loadingCard:       { padding: 32, alignItems: "center", backgroundColor: C.white },
  profileCard:       { flexDirection: "row", alignItems: "center", padding: 20, backgroundColor: C.white, gap: 16 },
  avatarWrap:        { alignItems: "center", gap: 6 },
  avatarCircle:      { width: 64, height: 64, backgroundColor: C.accent, justifyContent: "center", alignItems: "center" },
  avatarInitials:    { fontSize: 22, fontWeight: "800", color: "#fff" },
  verifiedBadge:     { backgroundColor: C.greenBg, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: C.green + "44" },
  verifiedTxt:       { fontSize: 9, fontWeight: "800", color: C.green },
  profileInfo:       { flex: 1 },
  displayName:       { fontSize: 18, fontWeight: "700", color: C.text1, marginBottom: 2 },
  emailTxt:          { fontSize: 12, color: C.text3, marginBottom: 3 },
  phoneTxt:          { fontSize: 12, color: C.text3, marginBottom: 8 },
  memberBadge:       { alignSelf: "flex-start", backgroundColor: C.goldBg, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: C.gold + "44" },
  memberTxt:         { fontSize: 10, color: C.gold, fontWeight: "600" },

  // Section
  section:           { backgroundColor: C.white, paddingHorizontal: 20, paddingVertical: 16 },
  sectionLabel:      { fontSize: 10, fontWeight: "700", color: C.text4, letterSpacing: 1.5, marginBottom: 12 },
  sectionHeaderRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  collapseArrow:     { fontSize: 10, color: C.text4 },
  innerDivider:      { height: 1, backgroundColor: C.border },

  // Vehicle
  vehicleCard:       { borderWidth: 1, borderColor: C.border, backgroundColor: "#FAFAFA" },
  vehicleRow:        { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  vehicleIcon:       { width: 46, height: 46, backgroundColor: C.goldBg, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: C.border },
  vehicleInfo:       { flex: 1 },
  vehicleModel:      { fontSize: 15, fontWeight: "700", color: C.text1, marginBottom: 2 },
  vehicleSub:        { fontSize: 11, color: C.text3 },
  ratingBadge:       { flexDirection: "row", alignItems: "center", backgroundColor: C.goldBg, paddingHorizontal: 8, paddingVertical: 5, gap: 3, borderWidth: 1, borderColor: C.gold + "44" },
  ratingIcon:        { fontSize: 12 },
  ratingVal:         { fontSize: 14, fontWeight: "800", color: C.gold },
  vehicleDetailRow:  { flexDirection: "row" },
  vehicleDetailItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  vehicleDetailDivider:{ width: 1, backgroundColor: C.border },
  vehicleDetailLabel:{ fontSize: 9, fontWeight: "700", color: C.text4, letterSpacing: 1, marginBottom: 5 },
  vehicleDetailVal:  { fontSize: 12, fontWeight: "600", color: C.text1 },
  activeStatusRow:   { flexDirection: "row", alignItems: "center", gap: 4 },
  activeStatusDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  activeStatusTxt:   { fontSize: 12, fontWeight: "600", color: C.green },

  // Earnings
  earningsCard:      { borderWidth: 1, borderColor: C.border, backgroundColor: "#FAFAFA" },
  earningsMain:      { padding: 16 },
  earningsMainLabel: { fontSize: 11, color: C.text3, fontWeight: "500", marginBottom: 4 },
  earningsMainVal:   { fontSize: 36, fontWeight: "900", color: C.text1 },
  earningsRow:       { flexDirection: "row" },
  earningsStat:      { flex: 1, alignItems: "center", paddingVertical: 14 },
  earningsStatBorder:{ borderRightWidth: 1, borderColor: C.border },
  earningsStatVal:   { fontSize: 17, fontWeight: "800", color: C.text1, marginBottom: 3 },
  earningsStatLabel: { fontSize: 10, color: C.text3, fontWeight: "500" },

  // Stats grid (2x2)
  statsGrid:         { flexDirection: "row", flexWrap: "wrap", backgroundColor: C.white },
  statCard:          { width: "50%", alignItems: "center", paddingVertical: 20, borderTopWidth: 1, borderColor: C.border },
  statCardLeft:      { borderRightWidth: 1, borderColor: C.border },
  statCardVal:       { fontSize: 26, fontWeight: "800", marginBottom: 6 },
  statCardLabel:     { fontSize: 10, color: C.text3, textAlign: "center", lineHeight: 14 },

  // Ride history
  loadingRow:        { flexDirection: "row", alignItems: "center", paddingVertical: 16, gap: 10 },
  loadingTxt:        { fontSize: 13, color: C.text3 },
  emptyWrap:         { alignItems: "center", paddingVertical: 24 },
  emptyIcon:         { fontSize: 32, marginBottom: 8 },
  emptyTitle:        { fontSize: 14, fontWeight: "700", color: C.text2, marginBottom: 4 },
  emptySub:          { fontSize: 12, color: C.text3, textAlign: "center" },

  rideCard:          { paddingVertical: 14 },
  rideCardTop:       { borderTopWidth: 1, borderColor: C.border },
  rideCardTopRow:    { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  rideAutoIcon:      { width: 36, height: 36, backgroundColor: C.goldBg, justifyContent: "center", alignItems: "center", marginRight: 10, borderWidth: 1, borderColor: C.border },
  rideCardInfo:      { flex: 1 },
  rideAutoNum:       { fontSize: 13, fontWeight: "700", color: C.text1, marginBottom: 2 },
  rideAutoModel:     { fontSize: 11, color: C.text3 },
  rideCardRight:     { alignItems: "flex-end", gap: 4 },
  rideEarning:       { fontSize: 16, fontWeight: "800", color: C.green },
  rideStatusBadge:   { paddingHorizontal: 5, paddingVertical: 2 },
  statusCompleted:   { backgroundColor: C.greenBg },
  statusActive:      { backgroundColor: C.goldBg },
  rideStatusTxt:     { fontSize: 9, fontWeight: "800" },
  statusTxtCompleted:{ color: C.green },
  statusTxtActive:   { color: C.gold },

  rideRouteRow:      { flexDirection: "row", alignItems: "center", marginBottom: 2, marginTop: 6 },
  rDotGreen:         { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 8 },
  rDotGold:          { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold,  marginRight: 8 },
  rRouteTxt:         { fontSize: 12, color: C.text2, flex: 1, fontWeight: "500" },
  rConnector:        { width: 1, height: 6, backgroundColor: C.border, marginLeft: 2, marginBottom: 2 },

  rideFooter:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: C.border },
  rideFooterTxt:     { fontSize: 11, color: C.text4 },
  rideFooterRight:   { flexDirection: "row", alignItems: "center", gap: 8 },
  passBadge:         { backgroundColor: "#F0F0F0", paddingHorizontal: 6, paddingVertical: 2 },
  passBadgeTxt:      { fontSize: 9, fontWeight: "700", color: C.text3 },
  rideDistTxt:       { fontSize: 11, color: C.text4 },

  // Eco
  ecoCard:           { backgroundColor: C.greenBg, padding: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.green + "33" },
  ecoTitle:          { fontSize: 13, fontWeight: "700", color: C.green, marginBottom: 4 },
  ecoSub:            { fontSize: 12, color: C.green, opacity: 0.8, marginBottom: 16, lineHeight: 18 },
  ecoRow:            { flexDirection: "row" },
  ecoStat:           { flex: 1, alignItems: "center" },
  ecoVal:            { fontSize: 20, fontWeight: "800", color: C.green, marginBottom: 4 },
  ecoLabel:          { fontSize: 10, color: C.green, textAlign: "center", lineHeight: 14, opacity: 0.8 },

  // Preferences
  prefRow:           { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  prefDivider:       { height: 1, backgroundColor: C.border },
  prefIcon:          { fontSize: 16, marginRight: 14, width: 22, textAlign: "center" },
  prefTitle:         { fontSize: 14, fontWeight: "600", color: C.text1, marginBottom: 2 },
  prefSub:           { fontSize: 11, color: C.text3 },

  // Logout
  logoutSection:     { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.white },
  logoutBtn:         { borderWidth: 1.5, borderColor: C.accent, paddingVertical: 13, alignItems: "center" },
  logoutTxt:         { fontSize: 14, fontWeight: "700", color: C.text1 },
  versionRow:        { alignItems: "center", paddingVertical: 16 },
  versionTxt:        { fontSize: 11, color: C.text4 },

  // Shared
  rideCardTop2:      { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
});