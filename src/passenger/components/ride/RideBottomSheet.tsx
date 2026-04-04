import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  Animated,
} from "react-native";
import type { ActiveRide, Route } from "../../booking/types";
import { getRouteTripDisplay } from "../../booking/routeTripDisplay";
import { RIDE_THEME as C } from "./theme";
import RideCard from "./RideCard";

const SH = Dimensions.get("window").height;

interface Props {
  sheetY: Animated.Value;
  pickupLabel: string;
  dropLabel: string;
  route: Route | null;
  routeLoading: boolean;
  routeUnavailable: boolean;
  loadingRides: boolean;
  matchingRides: ActiveRide[];
  onClose: () => void;
  onBook: (ride: ActiveRide) => void;
}

export default function RideBottomSheet({
  sheetY,
  pickupLabel,
  dropLabel,
  route,
  routeLoading,
  routeUnavailable,
  loadingRides,
  matchingRides,
  onClose,
  onBook,
}: Props) {
  const trip = getRouteTripDisplay(route, routeLoading, routeUnavailable, loadingRides, matchingRides.length);

  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Shared rides on your route</Text>
          <Text style={styles.headerSub}>Route-matched autos — not point-to-point</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tripCard}>
        <View style={styles.tripRow}>
          <View style={[styles.tripDot, { backgroundColor: C.green }]} />
          <View style={styles.tripTextCol}>
            <Text style={styles.tripLabel}>From</Text>
            <Text style={styles.tripValue} numberOfLines={2}>
              {pickupLabel}
            </Text>
          </View>
        </View>
        <View style={styles.tripLine} />
        <View style={styles.tripRow}>
          <View style={[styles.tripDot, { backgroundColor: C.red }]} />
          <View style={styles.tripTextCol}>
            <Text style={styles.tripLabel}>To</Text>
            <Text style={[styles.tripValue, styles.dropHighlight]} numberOfLines={2}>
              {dropLabel}
            </Text>
          </View>
        </View>
        <View style={styles.tripDivider} />
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>ETA · Distance</Text>
          <Text style={[styles.metaValue, trip.isError && styles.metaWarn]}>{trip.text}</Text>
        </View>
      </View>

      <View style={styles.sheetDivider} />

      {loadingRides ? (
        <View style={styles.sheetLoading}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={styles.sheetLoadingTxt}>Matching your route with drivers…</Text>
        </View>
      ) : matchingRides.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No shared matches yet</Text>
          <Text style={styles.emptySub}>No autos near your route right now. Try again soon.</Text>
        </View>
      ) : (
        <FlatList
          data={matchingRides}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.ridesList}
          renderItem={({ item, index }) => <RideCard ride={item} index={index} onBook={onBook} />}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.white,
    maxHeight: SH * 0.72,
    paddingBottom: Platform.OS === "ios" ? 32 : 18,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: "900", color: C.text1, letterSpacing: -0.3 },
  headerSub: { fontSize: 11, fontWeight: "600", color: C.text3, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F3F3",
    justifyContent: "center",
    alignItems: "center",
  },
  closeTxt: { fontSize: 15, color: C.text2, fontWeight: "700" },
  tripCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  tripRow: { flexDirection: "row", alignItems: "flex-start" },
  tripDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, marginRight: 12 },
  tripTextCol: { flex: 1 },
  tripLabel: { fontSize: 11, fontWeight: "700", color: C.text3, letterSpacing: 0.8, marginBottom: 4 },
  tripValue: { fontSize: 15, fontWeight: "600", color: C.text1, lineHeight: 20 },
  dropHighlight: { color: C.accent, fontWeight: "800" },
  tripLine: { width: 2, height: 14, backgroundColor: C.border, marginLeft: 4, marginVertical: 4 },
  tripDivider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  metaBlock: { paddingTop: 2 },
  metaLabel: { fontSize: 11, fontWeight: "600", color: C.text3, marginBottom: 4 },
  metaValue: { fontSize: 15, fontWeight: "800", color: C.text1 },
  metaWarn: { color: C.gold, fontWeight: "800" },
  sheetDivider: { height: 1, backgroundColor: C.border },
  sheetLoading: { flexDirection: "row", alignItems: "center", padding: 22, gap: 12 },
  sheetLoadingTxt: { fontSize: 14, color: C.text3, fontWeight: "600", flex: 1 },
  emptyBox: { paddingHorizontal: 24, paddingVertical: 28 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.text1, marginBottom: 6 },
  emptySub: { fontSize: 13, color: C.text3, lineHeight: 19, fontWeight: "500" },
  ridesList: { paddingHorizontal: 16, paddingBottom: 16 },
});
