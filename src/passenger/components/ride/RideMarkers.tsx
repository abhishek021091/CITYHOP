import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Easing } from "react-native";
import { RIDE_THEME as C } from "./theme";

/** Green pulsing dot — current / pickup location */
export function PulsingPickupMarker() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={styles.pickupWrap}>
      <Animated.View
        style={[
          styles.pulseRing,
          { transform: [{ scale: ringScale }], opacity: ringOpacity },
        ]}
      />
      <View style={styles.pickupOuter}>
        <View style={styles.pickupInner} />
      </View>
    </View>
  );
}

/** Red destination pin */
export function DropPinMarker() {
  return (
    <View style={styles.dropWrap}>
      <View style={styles.dropHead}>
        <View style={styles.dropDot} />
      </View>
      <View style={styles.dropTail} />
      <View style={styles.dropShadow} />
    </View>
  );
}

/** Tuk-tuk for live driver tracking */
export function DriverTukMarker() {
  return (
    <View style={styles.driverWrap}>
      <View style={styles.driverCard}>
        <Text style={styles.driverEmoji}>🛺</Text>
      </View>
      <View style={styles.driverPointer} />
    </View>
  );
}

const styles = StyleSheet.create({
  pickupWrap: { alignItems: "center", justifyContent: "center", width: 44, height: 44 },
  pulseRing: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.green,
  },
  pickupOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.green + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  pickupInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.green,
    borderWidth: 3,
    borderColor: "#fff",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  dropWrap: { alignItems: "center" },
  dropHead: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.red,
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  dropDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  dropTail: {
    width: 12,
    height: 10,
    backgroundColor: C.red,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    marginTop: -2,
  },
  dropShadow: { width: 10, height: 4, borderRadius: 5, backgroundColor: "#00000022", marginTop: 2 },
  driverWrap: { alignItems: "center" },
  driverCard: {
    backgroundColor: C.white,
    borderWidth: 3,
    borderColor: C.green,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  driverEmoji: { fontSize: 22 },
  driverPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: C.green,
    marginTop: -1,
  },
});
