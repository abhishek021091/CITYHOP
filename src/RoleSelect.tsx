import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/FontAwesome';

const C = {
  white:   '#FFFFFF',
  black:'#000000',
  bg:      '#F8F9FA',
  border:  '#E8E8E8',
  green:   '#10B981',
  greenBg: '#ECFDF5',
  gold:    '#F59E0B',
  goldBg:  '#FFFBEB',
  blue:    '#3B82F6',
  blueBg:  '#EFF6FF',
  text1:   '#111827',
  text2:   '#4B5563',
  text3:   '#6B7280',
  text4:   '#9CA3AF',
};

const STATS = [
  { value: '2x',   label: 'Less cost\nper ride', color: C.black },
  { value: '40%',  label: 'Fuel saved\nper trip', color: C.black },
  { value: '100%', label: 'Local &\naffordable', color: C.black },
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
            <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
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
            { icon: 'map-marker', text: 'Set your\nroute', color: '#EF4444' },
            { icon: 'car', text: 'Match with\nan auto', color: C.gold },
            { icon: 'money', text: 'Split the\nfare', color: C.green },
          ].map((step, i) => (
            <View key={i} style={s.stepCol}>
              <View style={[s.stepIconWrap, { backgroundColor: C.white, borderColor: C.border, borderWidth: 1 }]}>
                <Icon name={step.icon} size={20} color={step.color} />
              </View>
              <Text style={s.stepTxt}>{step.text}</Text>
              {i < 2 && <View style={s.stepArrow}><Icon name="angle-right" size={14} color={C.text4} /></View>}
            </View>
          ))}
        </View>
      </View>

      <View style={s.divider} />

      {/* ROLE CARDS */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>CONTINUE AS</Text>

        <TouchableOpacity
          style={[s.card, { borderColor: C.green }]}
          onPress={() => navigation.navigate('PassengerAuth')}
          activeOpacity={0.8}
        >
          <View style={[s.cardIcon, { backgroundColor: C.greenBg }]}>
            <Icon name="user" size={24} color={C.green} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>Passenger</Text>
            <Text style={s.cardSub}>Find shared vehicles nearby</Text>
          </View>
          <Icon name="chevron-right" size={14} color={C.text4} />
        </TouchableOpacity>

        <View style={{ height: 16 }} />

        <TouchableOpacity
          style={[s.card, { borderColor: C.gold }]}
          onPress={() => navigation.navigate('DriverAuth')}
          activeOpacity={0.8}
        >
          <View style={[s.cardIcon, { backgroundColor: C.goldBg }]}>
            <Icon name="bullseye" size={24} color={C.gold} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>Driver</Text>
            <Text style={s.cardSub}>Host a route & earn more</Text>
          </View>
          <Icon name="chevron-right" size={14} color={C.text4} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }} />

      {/* FOOTER */}
      <View style={s.footer}>
        <Text style={s.footerTxt}>
          Secure Platform • Trusted by 1000+ Users
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.white },

  header:       { paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 24 : 12, paddingBottom: 24 },
  brand:        { fontSize: 32, fontWeight: '900', color: C.text1, letterSpacing: -1, marginBottom: 4 },
  brandGold:    { color: C.gold },
  tagline:      { fontSize: 13, color: C.text3, fontWeight: '500', letterSpacing: 0.2 },
  divider:      { height: 1, backgroundColor: C.border },

  statsRow:     { flexDirection: 'row', backgroundColor: '#FBFBFB', paddingVertical: 10 },
  statItem:     { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statBorder:   { borderRightWidth: 1, borderColor: C.border },
  statValue:    { fontSize: 26, fontWeight: '800', marginBottom: 2 },
  statLabel:    { fontSize: 10, color: C.text3, textAlign: 'center', lineHeight: 14, fontWeight: '600', textTransform: 'uppercase' },

  section:      { paddingHorizontal: 24, paddingVertical: 28 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: C.text4, letterSpacing: 1.5, marginBottom: 20, textTransform: 'uppercase' },

  stepsRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepCol:      { flex: 1, alignItems: 'center' },
  stepIconWrap: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10, backgroundColor: C.white, ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } } }) },
  stepTxt:      { fontSize: 11, color: C.text2, textAlign: 'center', lineHeight: 15, fontWeight: '600' },
  stepArrow:    { position: 'absolute', top: 18, right: -8 },

  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1.5, 
    padding: 18, 
    backgroundColor: C.white, 
    borderRadius: 16, 
    ...Platform.select({ 
      android: { elevation: 3 }, 
      ios: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } } 
    }) 
  },
  cardIcon:     { width: 52, height: 52, justifyContent: 'center', alignItems: 'center', marginRight: 16, borderRadius: 12 },
  cardBody:     { flex: 1 },
  cardTitle:    { fontSize: 18, fontWeight: '800', color: C.text1, marginBottom: 2 },
  cardSub:      { fontSize: 13, color: C.text3, fontWeight: '400' },

  footer:       { paddingHorizontal: 24, paddingBottom: 20, alignItems: 'center' },
  footerTxt:    { fontSize: 12, color: C.text4, fontWeight: '500' },
});