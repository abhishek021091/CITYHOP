import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, StatusBar, Platform, 
  KeyboardAvoidingView, Dimensions
} from 'react-native';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from '@react-native-firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';

const { width } = Dimensions.get('window');

const C = {
  white:   '#FFFFFF',
  bg:      '#FBFBFB',
  border:  '#EEEEEE',
  accent:  '#111111',
  gold:    '#F4A300',
  goldBg:  '#FFF8E7',
  text1:   '#111827',
  text3:   '#6B7280',
  text4:   '#9CA3AF',
  inputBg: '#F3F4F6',
};

const InputField = ({ icon, ...props }: any) => (
  <View style={s.inputWrapper}>
    <Icon name={icon} size={18} color={C.text4} style={s.inputIcon} />
    <TextInput 
      style={s.input} 
      placeholderTextColor={C.text4} 
      autoCorrect={false}
      spellCheck={false}
      {...props} 
    />
  </View>
);

export default function DriverAuth() {
  const navigation = useNavigation<any>();
  const auth = getAuth();
  const db   = getFirestore();

  const [signup,   setSignup]   = useState(false);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [phone,    setPhone]    = useState('');
  const [vehicle,  setVehicle]  = useState('');
  const [license,  setLicense]  = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleAuth = async () => {
    if (!email || !password) { 
        Alert.alert('Missing Info', 'Email and password are required.'); 
        return; 
    }
    if (signup && (!name || !phone || !vehicle || !license)) { 
        Alert.alert('Details Required', 'Please provide all driver and vehicle information.'); 
        return; 
    }

    try {
      setLoading(true);
      if (signup) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'drivers', cred.user.uid), {
          name, phone, vehicle, license: license.toUpperCase(), email, role: 'driver', createdAt: serverTimestamp(),
        });
        
        // Mid-eval update: Redirect to login view after signup
        Alert.alert('Success', 'Account created! Please login to verify.');
        setSignup(false);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        navigation.replace('DriverHome');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView 
          contentContainerStyle={s.scrollContent} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Icon name="arrow-left" size={22} color={C.text1} />
            </TouchableOpacity>
            <View style={s.badge}>
              <Text style={s.badgeTxt}>DRIVER PORTAL</Text>
            </View>
          </View>

          <View style={s.body}>
            <Text style={s.brand}>City<Text style={{color: C.gold}}>Hop</Text></Text>
            <Text style={s.formTitle}>{signup ? 'Partner with us' : 'Welcome back'}</Text>
            <Text style={s.formSub}>Enter details to start hosting routes.</Text>

            {signup && (
              <View>
                <Text style={s.fieldLabel}>PERSONAL DETAILS</Text>
                <InputField icon="user" placeholder="Full Name" value={name} onChangeText={setName} autoCapitalize="words" />
                <InputField icon="phone" placeholder="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} />

                <Text style={[s.fieldLabel, { marginTop: 12 }]}>VEHICLE INFORMATION</Text>
                <InputField icon="truck" placeholder="Vehicle Model" value={vehicle} onChangeText={setVehicle} />
                <InputField icon="file-text" placeholder="License Number" value={license} onChangeText={(t:any)=>setLicense(t.toUpperCase())} autoCapitalize="characters" />
              </View>
            )}

            <Text style={[s.fieldLabel, { marginTop: 12 }]}>ACCOUNT SECURITY</Text>
            <InputField icon="mail" placeholder="Email Address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <InputField icon="lock" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={handleAuth}
              disabled={loading}
            >
              <Text style={s.primaryTxt}>{loading ? 'Please wait...' : signup ? 'Register' : 'Login'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.toggleRow} onPress={() => setSignup(!signup)}>
              <Text style={s.toggleTxt}>
                {signup ? 'Already have an account? ' : 'New driver? '}
                <Text style={s.toggleLink}>{signup ? 'Sign In' : 'Join Now'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  scrollContent: { 
    flexGrow: 1, 
    paddingBottom: 60 
  },
  header: { 
    paddingHorizontal: 24, 
    paddingTop: Platform.OS === 'android' ? 10 : 10, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    height: 50 
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, backgroundColor: '#F3F4F6' },
  badge: { backgroundColor: C.goldBg, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6 },
  badgeTxt: { fontSize: 9, fontWeight: '800', color: C.gold, letterSpacing: 0.5 },
  body: { paddingHorizontal: 24, paddingTop: 10 }, 
  brand: { fontSize: 18, fontWeight: '900', color: C.text1, marginBottom: 4 },
  formTitle: { fontSize: 26, fontWeight: '800', color: C.text1, marginBottom: 4 },
  formSub: { fontSize: 13, color: C.text3, marginBottom: 15 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: C.text3, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 12, marginBottom: 10, paddingHorizontal: 12, height: 50, borderWidth: 1, borderColor: '#EDEDED' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: C.text1, fontWeight: '500' },
  primaryBtn: { backgroundColor: C.accent, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  primaryTxt: { color: C.white, fontSize: 16, fontWeight: '700' },
  toggleRow: { alignItems: 'center', marginTop: 15 },
  toggleTxt: { fontSize: 13, color: C.text3 },
  toggleLink: { color: C.gold, fontWeight: '700' },
});