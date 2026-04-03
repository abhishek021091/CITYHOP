import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/FontAwesome';

const C = {
  white:   '#FFFFFF',
  bg:      '#F7F7F7',
  border:  '#E8E8E8',
  green:   '#1A8F5C',
  greenBg: '#EAF7F1',
  gold:    '#E69A00',
  goldBg:  '#FEF8EE',
  text1:   '#111111',
  text2:   '#444444',
  text3:   '#666666',
  text4:   '#BBBBBB',
};

const STATS = [
  { value: '2x',   label: 'Less cost\nper ride'    },
  { value: '40%',  label: 'Fuel saved\nper trip'   },
  { value: '100%', label: 'Local &\naffordable'    },
];

export default function RoleSelect({ navigation }: any) {
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* HEADER */}
      <View style={s.header}>
        <Text style={s.brand}>City<Text style={s.brandGold}>Hop</Text></Text>
        <Text style={s.tagline}>Share rides · Save money · Go green</Text>
      </View>

      <View style={s.divider} />

      {/* STATS */}
      <View style={s.statsRow}>
        {STATS.map((st, i) => (
          <View key={i} style={[s.statItem, i < 2 && s.statBorder]}>
            <Text style={s.statValue}>{st.value}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      <View style={s.divider} />

      {/* HOW IT WORKS */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>HOW IT WORKS</Text>
        <View style={s.stepsRow}>
          {[
            { icon: 'map-marker', text: 'Set your\nroute' },
            { icon: 'car', text: 'Match with\nan auto' },
            { icon: 'money', text: 'Split the\nfare' },
          ].map((step, i) => (
            <View key={i} style={s.stepCol}>
              <View style={s.stepIconWrap}>
                <Icon name={step.icon} size={22} color={C.text1} />
              </View>
              <Text style={s.stepTxt}>{step.text}</Text>
              {i < 2 && <View style={s.stepArrow}><Text style={s.stepArrowTxt}>→</Text></View>}
            </View>
          ))}
        </View>
      </View>

      <View style={s.divider} />

      {/* ROLE CARDS */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>I AM A</Text>

        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.navigate('PassengerAuth')}
          activeOpacity={0.7}
        >
          <View style={[s.cardIcon, { backgroundColor: C.greenBg }]}>
            <Icon name="user" size={26} color={C.green} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>Passenger</Text>
            <Text style={s.cardSub}>Find autos going your way</Text>
          </View>
          <Text style={s.cardArrow}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 16 }} />

        <TouchableOpacity
          style={[s.card, s.cardGold]}
          onPress={() => navigation.navigate('DriverAuth')}
          activeOpacity={0.7}
        >
          <View style={[s.cardIcon, { backgroundColor: C.goldBg }]}>
            <Icon name="car" size={26} color={C.gold} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>Driver</Text>
            <Text style={s.cardSub}>Share your route, earn more</Text>
          </View>
          <Text style={s.cardArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* SPACER */}
      <View style={{ flex: 1 }} />

      {/* FOOTER */}
      <View style={s.footer}>
        <Text style={s.footerTxt}>
          By continuing you agree to our Terms of Service
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.white },

  header:       { paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 20 : 8, paddingBottom: 22 },
  brand:        { fontSize: 30, fontWeight: '900', color: C.text1, letterSpacing: -0.5, marginBottom: 5 },
  brandGold:    { color: C.gold },
  tagline:      { fontSize: 14, color: C.text3, fontWeight: '500' },
  divider:      { height: 1, backgroundColor: C.border },

  statsRow:     { flexDirection: 'row', backgroundColor: C.bg, paddingVertical: 8 },
  statItem:     { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statBorder:   { borderRightWidth: 1, borderColor: C.border },
  statValue:    { fontSize: 24, fontWeight: '800', color: C.text1, marginBottom: 4 },
  statLabel:    { fontSize: 11, color: C.text3, textAlign: 'center', lineHeight: 14, fontWeight: '500' },

  section:      { paddingHorizontal: 24, paddingVertical: 24 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.text2, letterSpacing: 1.5, marginBottom: 16, textTransform: 'uppercase' },

  stepsRow:     { flexDirection: 'row', alignItems: 'flex-start' },
  stepCol:      { flex: 1, alignItems: 'center', position: 'relative' },
  stepIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  stepTxt:      { fontSize: 11, color: C.text2, textAlign: 'center', lineHeight: 16, fontWeight: '500' },
  stepArrow:    { position: 'absolute', top: 16, right: -10, zIndex: 1 },
  stepArrowTxt: { fontSize: 14, color: C.text4 },

  card:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, padding: 16, backgroundColor: C.white, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardGold:     { borderColor: C.gold, borderWidth: 1.5 },
  cardIcon:     { width: 52, height: 52, justifyContent: 'center', alignItems: 'center', marginRight: 14, borderRadius: 26 },
  cardBody:     { flex: 1 },
  cardTitle:    { fontSize: 16, fontWeight: '700', color: C.text1, marginBottom: 2 },
  cardSub:      { fontSize: 12, color: C.text3, fontWeight: '400' },
  cardArrow:    { fontSize: 16, color: C.text4 },

  footer:       { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 12, borderTopWidth: 1, borderColor: C.border, alignItems: 'center' },
  footerTxt:    { fontSize: 11, color: C.text2, opacity: 0.6, textAlign: 'center' },
});
