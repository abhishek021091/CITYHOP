import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ActiveRide } from "../../booking/types";
import { fmtDuration } from "../../booking/format";
import { RIDE_THEME as C } from "./theme";

interface Props {
  ride: ActiveRide;
  index: number;
}

export default function RideCard({ ride, index }: Props) {
  const seatsLeft = ride.totalSeats - ride.bookedSeats;
  const isAlmostFull = seatsLeft === 1;
  const walk =
    ride.pickupDistanceM < 1000
      ? `${Math.round(ride.pickupDistanceM)} m from pickup`
      : `${(ride.pickupDistanceM / 1000).toFixed(1)} km from pickup`;

  return (
    <View style={[styles.card, index > 0 && styles.cardMargin]}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Text style={styles.tuk}>🛺</Text>
        </View>
        <View style={styles.main}>
          <Text style={styles.vehicleNo} numberOfLines={1}>
            {ride.autoNumber}
          </Text>
          <Text style={styles.driverName} numberOfLines={1}>
            {ride.driverName}
          </Text>
          <Text style={styles.line}>{walk}</Text>
          <Text style={styles.line}>ETA {fmtDuration(ride.duration)}</Text>
          <View style={[styles.tag, isAlmostFull && styles.tagWarn]}>
            <Text style={[styles.tagTxt, isAlmostFull && styles.tagTxtWarn]}>
              {seatsLeft} seat{seatsLeft !== 1 ? "s" : ""} left
            </Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Expected fare:</Text>
            <Text style={styles.fareValue}>₹{ride.pricePerSeat}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardMargin: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: C.goldBg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  tuk: { fontSize: 22 },
  main: { flex: 1, minWidth: 0 },
  vehicleNo: { fontSize: 16, fontWeight: "800", color: C.text1, letterSpacing: -0.2 },
  driverName: { fontSize: 13, color: C.text2, fontWeight: "600", marginTop: 4 },
  line: { fontSize: 13, color: C.text2, fontWeight: "600", marginTop: 6 },
  tag: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: C.greenBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagWarn: { backgroundColor: C.redBg },
  tagTxt: { fontSize: 11, fontWeight: "800", color: C.green },
  tagTxtWarn: { color: C.red },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  fareLabel: { fontSize: 12, color: C.text3, fontWeight: "600" },
  fareValue: { fontSize: 14, color: C.text1, fontWeight: "800" },
});
