import React from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { RIDE_THEME as C } from "./theme";

interface Props {
  visible: boolean;
  driverPriceLine: string;
  acceptAmountLabel: string;
  offerInput: string;
  onChangeOffer: (t: string) => void;
  onAcceptListed: () => void;
  onSendOffer: () => void;
  onClose: () => void;
  waiting?: boolean;
  counterNotice?: string | null;
}

export default function RideOfferModal({
  visible,
  driverPriceLine,
  acceptAmountLabel,
  offerInput,
  onChangeOffer,
  onAcceptListed,
  onSendOffer,
  onClose,
  waiting,
  counterNotice,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>Driver price</Text>
          <Text style={styles.driverLine}>{driverPriceLine}</Text>
          {counterNotice ? <Text style={styles.counter}>{counterNotice}</Text> : null}

          <Text style={styles.label}>Your offer (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 25"
            placeholderTextColor={C.text4}
            keyboardType="number-pad"
            value={offerInput}
            onChangeText={onChangeOffer}
            editable={!waiting}
          />

          {waiting ? (
            <Text style={styles.wait}>Waiting for driver…</Text>
          ) : (
            <>
              <TouchableOpacity style={styles.primary} onPress={onAcceptListed} activeOpacity={0.85}>
                <Text style={styles.primaryTxt}>Accept {acceptAmountLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={onSendOffer} activeOpacity={0.85}>
                <Text style={styles.secondaryTxt}>Send offer</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeRow}>
                <Text style={styles.closeTxt}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 24 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  title: { fontSize: 18, fontWeight: "900", color: C.text1, marginBottom: 8 },
  driverLine: { fontSize: 16, fontWeight: "800", color: C.text1, marginBottom: 8 },
  counter: { fontSize: 14, fontWeight: "700", color: C.green, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "600", color: C.text3, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    color: C.text1,
    marginBottom: 16,
  },
  wait: { textAlign: "center", fontSize: 14, fontWeight: "600", color: C.text3, padding: 12 },
  primary: {
    backgroundColor: C.green,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  secondary: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: C.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryTxt: { color: C.accent, fontSize: 15, fontWeight: "800" },
  closeRow: { marginTop: 14, alignItems: "center" },
  closeTxt: { fontSize: 14, fontWeight: "700", color: C.text3 },
});
