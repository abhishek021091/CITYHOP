import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, StatusBar, Platform, KeyboardAvoidingView
} from 'react-native';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';

const C = {
  white:   '#FFFFFF',
  bg:      '#FBFBFB',
  border:  '#EEEEEE',
  accent:  '#111111',
  gold:    '#F4A300',
  green:   '#10B981',
  greenBg: '#ECFDF5',
  text1:   '#111827',
  text3:   '#6B7280',
  text4:   '#9CA3AF',
  inputBg: '#F3F4F6',
};

export default function PassengerAuth() {
  const navigation = useNavigation<any>();
  const auth = getAuth();

  const [signup,   setSignup]   = useState(false);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Missing Info', 'Please enter your credentials to proceed.');
      return;
    }
    try {
      setLoading(true);
      if (signup) {
        await createUserWithEmailAndPassword(auth, email, password);
        Alert.alert('Welcome!', 'Account created successfully. You can now log in.');
        setSignup(false);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        
        // --- MID EVALUATION CHANGE ---
        // Replaced navigation.replace('PassengerHome') to avoid crash
        Alert.alert(
          "Login Success",
          "Passenger dashboard will be available in the final build.",
          [{ text: "OK", onPress: () => navigation.navigate("RoleSelect") }]
        );
        // -----------------------------
      }
    } catch (error: any) {
      let msg = "Something went wrong. Please try again.";
      if (error.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
      if (error.code === 'auth/invalid-credential')   msg = 'Incorrect email or password.';
      Alert.alert('Authentication Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={s.root} keyboardShouldPersistTaps="handled">
        <StatusBar barStyle="dark-content" backgroundColor={C.white} />

        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Icon name="arrow-left" size={24} color={C.text1} />
          </TouchableOpacity>
          <View style={s.badge}>
            <Text style={s.badgeTxt}>PASSENGER</Text>
          </View>
        </View>

        <View style={s.body}>
          <Text style={s.brand}>City<Text style={{color: C.gold}}>Hop</Text></Text>
          <Text style={s.formTitle}>
            {signup ? 'Create Account' : 'Welcome Back'}
          </Text>
          <Text style={s.formSub}>
            {signup ? 'Join the community and save on your daily commute.' : 'Sign in to find your next shared ride.'}
          </Text>

          <View style={s.formGroup}>
            <View style={s.inputWrapper}>
              <Icon name="mail" size={18} color={C.text4} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Email address"
                placeholderTextColor={C.text4}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={s.inputWrapper}>
              <Icon name="lock" size={18} color={C.text4} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="Password"
                placeholderTextColor={C.text4}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, loading && { opacity: 0.7 }]}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={s.primaryTxt}>
              {loading ? 'Processing...' : signup ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={s.toggleRow} 
            onPress={() => setSignup(!signup)} 
            activeOpacity={0.7}
          >
            <Text style={s.toggleTxt}>
              {signup ? 'Already have an account? ' : 'Don’t have an account? '}
              <Text style={s.toggleLink}>{signup ? 'Sign In' : 'Register'}</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Secure SSL Encryption • CityHop v1.0</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { 
    flexGrow: 1, 
    backgroundColor: C.white,
    paddingBottom: 40
  },
  header: { 
    paddingHorizontal: 24, 
    paddingTop: Platform.OS === 'android' ? 24 : 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    height: 60
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F3F4F6'
  },
  badge: { 
    backgroundColor: C.greenBg, 
    paddingHorizontal: 12, 
    paddingVertical: 4,
    borderRadius: 8
  },
  badgeTxt: { 
    fontSize: 11, 
    fontWeight: '800', 
    color: C.green, 
    letterSpacing: 1 
  },
  body: { 
    paddingHorizontal: 30, 
    paddingTop: 40 
  },
  brand: { 
    fontSize: 22, 
    fontWeight: '900', 
    color: C.text1, 
    letterSpacing: -1,
    marginBottom: 8
  },
  formTitle: { 
    fontSize: 32, 
    fontWeight: '800', 
    color: C.text1, 
    marginBottom: 10,
    letterSpacing: -0.5
  },
  formSub: { 
    fontSize: 15, 
    color: C.text3, 
    lineHeight: 22,
    marginBottom: 35 
  },
  formGroup: {
    marginBottom: 25
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderRadius: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 60,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  inputIcon: {
    marginRight: 12
  },
  input: { 
    flex: 1,
    fontSize: 16, 
    color: C.text1,
    fontWeight: '500'
  },
  primaryBtn: { 
    backgroundColor: C.accent, 
    height: 60,
    borderRadius: 18,
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  primaryTxt: { 
    color: C.white, 
    fontSize: 17, 
    fontWeight: '700' 
  },
  toggleRow: { 
    alignItems: 'center', 
    marginTop: 25, 
    paddingVertical: 10 
  },
  toggleTxt: { 
    fontSize: 14, 
    color: C.text3 
  },
  toggleLink: { 
    color: C.green, 
    fontWeight: '700' 
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingTop: 20
  },
  footerText: {
    fontSize: 11,
    color: C.text4,
    fontWeight: '500'
  }
});