import React, { useEffect, useRef } from 'react';
import {
  View, StyleSheet, Animated,
  StatusBar, Text, Dimensions,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

type RootStackParamList = { Intro: undefined; RoleSelect: undefined; };
type IntroScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Intro'>;

const IntroScreen: React.FC = () => {
  const navigation = useNavigation<IntroScreenNavigationProp>();

  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(24)).current;
  const scaleAnim   = useRef(new Animated.Value(0.92)).current;
  const barWidth    = useRef(new Animated.Value(0)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;
  const exitFade    = useRef(new Animated.Value(1)).current; // ✅ separate exit anim

  useEffect(() => {
    // Logo entrance
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();

    // Tagline fades in slightly after logo
    const taglineTimer = setTimeout(() => {
      Animated.timing(taglineFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, 400);

    // Loading bar fills over 2.2s
    Animated.timing(barWidth, {
      toValue: width * 0.4,
      duration: 2200,
      useNativeDriver: false,
    }).start();

    // Exit: fade out the whole screen, then navigate
    const navTimer = setTimeout(() => {
      Animated.timing(exitFade, { toValue: 0, duration: 600, useNativeDriver: true })
        .start(() => {
          // ✅ safe: replace if possible, else navigate
          if (navigation.canGoBack() === false) {
            navigation.replace('RoleSelect');
          } else {
            navigation.replace('RoleSelect');
          }
        });
    }, 2800);

    return () => {
      clearTimeout(taglineTimer); // ✅ clean up tagline timer too
      clearTimeout(navTimer);
    };
  }, [navigation]);

  return (
    // ✅ exitFade wraps the whole screen for clean fade-out
    <Animated.View style={[styles.container, { opacity: exitFade }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        {/* Logo */}
        <Text style={styles.logoText}>
          City<Text style={styles.highlight}>Hop</Text>
        </Text>

        {/* Gold underline accent */}
        <View style={styles.underline} />

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, { opacity: taglineFade }]}>
          Share rides · Save money · Go green
        </Animated.Text>

        {/* Loading bar */}
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>
      </Animated.View>

      {/* Version tag */}
      <Animated.Text style={[styles.version, { opacity: taglineFade }]}>
        v1.0
      </Animated.Text>
    </Animated.View>
  );
};

export default IntroScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.5,
  },
  highlight: {
    color: '#E69A00',
  },
  underline: {
    height: 3,
    width: 44,
    backgroundColor: '#E69A00',
    marginTop: 2,
    marginBottom: 16,
  },
  tagline: {
    fontSize: 12,
    color: '#777777',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 36,
  },
  barTrack: {
    width: width * 0.4,
    height: 2,
    backgroundColor: '#2A2A2A',
  },
  barFill: {
    height: 2,
    backgroundColor: '#E69A00',
  },
  version: {
    position: 'absolute',
    bottom: 36,
    fontSize: 11,
    color: '#333333',
    letterSpacing: 1,
  },
});