import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import type { Place, ActiveInput, Coords } from "../../booking/types";
import { fmtDistance } from "../../booking/format";
import { RIDE_THEME as C } from "./theme";

const INPUT_BORDER = "#ddd";

export function placeRowKey(p: Place): string {
  return `${p.placeName}|${p.latitude}|${p.longitude}|${p.eLoc ?? ""}`;
}

interface Props {
  userLoc?: Coords;
  pickupQuery: string;
  dropQuery: string;
  activeInput: ActiveInput;
  keyboardInset?: number;
  onActiveInput: (f: ActiveInput) => void;
  onSearch: (text: string, field: ActiveInput) => void;
  onSelectPlace: (item: Place) => void;
  searchResults: Place[];
  searching: boolean;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
}

export default function SearchBar({
  userLoc,
  pickupQuery,
  dropQuery,
  activeInput,
  keyboardInset = 0,
  onActiveInput,
  onSearch,
  onSelectPlace,
  searchResults,
  searching,
  onSearchFocus,
  onSearchBlur,
}: Props) {
  const bottomPad = Math.max(80, 12 + keyboardInset + (Platform.OS === "ios" ? 8 : 12));

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
      nestedScrollEnabled
    >
      <Text style={styles.title}>Where to?</Text>
      <Text style={styles.subtitle}>Search a destination or pick a saved place</Text>

      <View style={styles.heroSearch}>
        <Text style={styles.heroIcon}>🔍</Text>
        <TextInput
          style={styles.heroInput}
          placeholder="Search destination"
          placeholderTextColor={C.text4}
          textAlignVertical="center"
          value={dropQuery}
          onChangeText={t => {
            onActiveInput("drop");
            onSearch(t, "drop");
          }}
          onFocus={() => {
            onSearchFocus?.();
            onActiveInput("drop");
          }}
          onBlur={() => onSearchBlur?.()}
          returnKeyType="search"
        />
      </View>

      <Text style={styles.sectionLabel}>PICKUP</Text>
      <TouchableOpacity
        style={styles.rowPickup}
        onPress={() => onActiveInput("pickup")}
        activeOpacity={0.75}
      >
        <View style={styles.dotGreen} />
        <View style={styles.rowBody}>
          {activeInput === "pickup" ? (
            <TextInput
              style={styles.input}
              autoFocus
              textAlignVertical="center"
              value={pickupQuery}
              onChangeText={t => onSearch(t, "pickup")}
              onFocus={() => onSearchFocus?.()}
              onBlur={() => onSearchBlur?.()}
              placeholder="Pickup location"
              placeholderTextColor={C.text4}
            />
          ) : (
            <Text style={styles.rowValue} numberOfLines={1}>
              {pickupQuery}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {(searching || searchResults.length > 0) && activeInput && (
        <View style={styles.resultsCard}>
          {searching && (
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={styles.searchingTxt}>Searching…</Text>
            </View>
          )}
          <FlatList
            scrollEnabled={false}
            data={searchResults.slice(0, 8)}
            keyExtractor={item => placeRowKey(item)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const distLabel =
                item.distanceFromUserM != null && userLoc ? fmtDistance(item.distanceFromUserM) : null;
              return (
                <TouchableOpacity
                  style={[styles.resultRow, index > 0 && styles.resultBorder]}
                  onPress={() => onSelectPlace(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.iconContainer}>
                    <Text style={styles.pinEmoji}>📍</Text>
                  </View>
                  <View style={styles.textContainer}>
                    <View style={styles.nameDistanceRow}>
                      <Text style={styles.placeNameBold} numberOfLines={1}>
                        {item.placeName}
                      </Text>
                      {distLabel ? (
                        <Text style={styles.distanceRight} numberOfLines={1}>
                          {distLabel}
                        </Text>
                      ) : null}
                    </View>
                    {item.placeAddress ? (
                      <Text style={styles.placeAddrSmall} numberOfLines={1}>
                        {item.placeAddress}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {!activeInput && searchResults.length === 0 && (
        <>
          <Text style={styles.sectionLabel}>SAVED PLACES</Text>
          {[
            { name: "Home", addr: "Your home location", icon: "🏠" },
            { name: "Office", addr: "Your work location", icon: "🏢" },
            { name: "Airport", addr: "Nearest airport", icon: "✈️" },
          ].map((p, i) => (
            <TouchableOpacity
              key={i}
              style={styles.savedRow}
              onPress={() => {
                onActiveInput("drop");
                onSearch(p.name, "drop");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.savedIcon}>
                <Text style={{ fontSize: 14 }}>{p.icon}</Text>
              </View>
              <View>
                <Text style={styles.savedName}>{p.name}</Text>
                <Text style={styles.savedAddr}>{p.addr}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingTop: 4 },
  title: { fontSize: 20, fontWeight: "800", color: C.text1, letterSpacing: -0.3, marginBottom: 2 },
  subtitle: { fontSize: 12, fontWeight: "500", color: C.text3, marginBottom: 10 },
  heroSearch: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    maxHeight: 52,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
  },
  heroIcon: { fontSize: 15, marginRight: 8 },
  heroInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: C.text1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    height: 48,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: C.text3,
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 2,
  },
  rowPickup: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
  },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, marginRight: 10 },
  rowBody: { flex: 1 },
  rowValue: { fontSize: 14, fontWeight: "600", color: C.text1 },
  input: {
    fontSize: 14,
    fontWeight: "500",
    color: C.text1,
    paddingVertical: Platform.OS === "android" ? 4 : 2,
    paddingHorizontal: 0,
    margin: 0,
    minHeight: 32,
  },
  resultsCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    backgroundColor: C.white,
    overflow: "hidden",
    marginBottom: 6,
  },
  searchingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  searchingTxt: { fontSize: 12, color: C.text3, fontWeight: "500" },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingLeft: 8,
  },
  resultBorder: { borderTopWidth: 1, borderColor: "#eee" },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  pinEmoji: { fontSize: 12 },
  textContainer: { flex: 1, minWidth: 0 },
  nameDistanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  placeNameBold: { fontSize: 14, fontWeight: "700", color: C.text1, flex: 1, flexShrink: 1 },
  distanceRight: { fontSize: 12, fontWeight: "600", color: C.text3, flexShrink: 0 },
  placeAddrSmall: { fontSize: 11, color: C.text3, marginTop: 2, fontWeight: "500" },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  savedIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  savedName: { fontSize: 14, fontWeight: "700", color: C.text1 },
  savedAddr: { fontSize: 11, color: C.text3, marginTop: 2, fontWeight: "500" },
});
