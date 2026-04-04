import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { ActiveRide } from "../../booking/types";
import { fmtDuration } from "../../booking/format";
import { RIDE_THEME as C } from "./theme";

type RideType = "shared" | "private";

interface Props {
  driver: ActiveRide;
  rideType: RideType;
  priceLabel: string;
  onCall: () => void;
  onCancel: () => void;
  onContinueToPay: () => void;
}

export default function DriverAssignedScreen({
  driver,
  rideType,
  priceLabel,
  onCall,
  onCancel,
  onContinueToPay,
}: Props) {
  const dist =
    driver.pickupDistanceM < 1000
      ? `${Math.round(driver.pickupDistanceM)} m`
      : `${(driver.pickupDistanceM / 1000).toFixed(1)} km`;
  const etaPickup = fmtDuration(driver.duration);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Driver assigned</Text>
      <Text style={styles.sub}>
        {rideType === "shared" ? "Shared ride" : "Private ride"} · {priceLabel}
      </Text>

      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Text style={styles.bigIcon}>🛺</Text>
        </View>
        <Text style={styles.driverName} numberOfLines={1}>
          {driver.driverName}
        </Text>
        <Text style={styles.vehicle} numberOfLines={1}>
          {driver.autoNumber}
        </Text>
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Distance from pickup</Text>
          <Text style={styles.metaVal}>{dist}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.metaLabel}>ETA to pickup</Text>
          <Text style={styles.metaVal}>{etaPickup}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.callBtn} onPress={onCall} activeOpacity={0.85}>
        <Text style={styles.callTxt}>📞 Call driver</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.continueBtn} onPress={onContinueToPay} activeOpacity={0.85}>
        <Text style={styles.continueTxt}>Continue to payment</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
        <Text style={styles.cancelTxt}>Cancel ride</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 20 },
  title: { fontSize: 20, fontWeight: "900", color: C.text1, textAlign: "center" },
  sub: { fontSize: 13, fontWeight: "600", color: C.text3, textAlign: "center", marginTop: 6, marginBottom: 16 },
  card: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    backgroundColor: C.white,
    marginBottom: 14,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.goldBg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  bigIcon: { fontSize: 36 },
  driverName: { fontSize: 18, fontWeight: "800", color: C.text1 },
  vehicle: { fontSize: 15, fontWeight: "700", color: C.text2, marginTop: 4, marginBottom: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  metaLabel: { fontSize: 13, color: C.text3, fontWeight: "600" },
  metaVal: { fontSize: 14, fontWeight: "800", color: C.text1 },
  callBtn: {
    backgroundColor: C.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  callTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  continueBtn: {
    backgroundColor: C.green,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  continueTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelTxt: { fontSize: 14, fontWeight: "700", color: C.red },
});
