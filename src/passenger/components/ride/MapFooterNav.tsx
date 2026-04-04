import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { RIDE_THEME as C } from "./theme";

interface Props {
  bottomInset?: number;
  onHomePress?: () => void;
  onProfilePress: () => void;
}

const BAR_HEIGHT = 70;

export default function MapFooterNav({ bottomInset = 0, onHomePress, onProfilePress }: Props) {
  return (
    <View style={[styles.wrap, { bottom: bottomInset }]} pointerEvents="box-none">
      <View style={styles.bar}>
        <TouchableOpacity style={styles.half} onPress={onHomePress} activeOpacity={0.75}>
          <Text style={styles.icon}>🗺️</Text>
          <Text style={styles.label}>Ride</Text>
        </TouchableOpacity>
        <View style={styles.sep} />
        <TouchableOpacity style={styles.half} onPress={onProfilePress} activeOpacity={0.75}>
          <Text style={styles.icon}>👤</Text>
          <Text style={styles.label}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    width: "100%",
    margin: 0,
    padding: 0,
    height: BAR_HEIGHT,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    zIndex: 100,
    elevation: 10,
  },
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    height: BAR_HEIGHT,
    backgroundColor: "#fff",
  },
  half: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sep: { width: 1, backgroundColor: "#ddd", marginVertical: 12 },
  icon: { fontSize: 28, marginBottom: 4 },
  label: { fontSize: 15, fontWeight: "800", color: C.text1 },
});
