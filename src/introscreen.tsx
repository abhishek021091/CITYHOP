import React, { useEffect, useRef } from 'react';
import {
  View, StyleSheet, Animated,
  StatusBar, Text, Dimensions, Easing
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');


const GRID_SIZE = 80;
const LINE_COUNT = 50; 

const IntroScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const barWidth = useRef(new Animated.Value(0)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;
  const exitFade = useRef(new Animated.Value(1)).current;
  const mapMove = useRef(new Animated.Value(0)).current; 
  const routeAnim = useRef(new Animated.Value(0)).current;
  const nodeFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    
    Animated.loop(
      Animated.timing(mapMove, {
        toValue: GRID_SIZE, 
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true })
    ]).start();

    // 3. Elements Sequence
    setTimeout(() => {
      Animated.timing(taglineFade, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    }, 600);

    Animated.timing(barWidth, { toValue: width * 0.5, duration: 2500, useNativeDriver: false }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(routeAnim, { toValue: width * 0.5 - 20, duration: 1500, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: false }),
        Animated.timing(routeAnim, { toValue: 0, duration: 0, useNativeDriver: false })
      ])
    ).start();

    setTimeout(() => {
      Animated.timing(nodeFade, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    }, 1000);

    // exit
    setTimeout(() => {
      Animated.timing(exitFade, { toValue: 0, duration: 800, useNativeDriver: true }).start(() => {
        navigation.replace('RoleSelect');
      });
    }, 3500);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: exitFade }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* --- BACKGROUND MAP GRID --- */}
      <View style={styles.mapContainer}>
        <Animated.View 
          style={[
            styles.mapBackground, 
            { 
                transform: [
                    { rotate: '-15deg' }, // Adds perspective
                    { translateX: mapMove }, 
                    { translateY: mapMove }
                ] 
            }
          ]}
        >
          {/* Create Vertical Lines */}
          {[...Array(LINE_COUNT)].map((_, i) => (
            <View key={`v-${i}`} style={[styles.gridLineVertical, { left: i * GRID_SIZE }]} />
          ))}
          {/* Create Horizontal Lines */}
          {[...Array(LINE_COUNT)].map((_, i) => (
            <View key={`h-${i}`} style={[styles.gridLineHorizontal, { top: i * GRID_SIZE }]} />
          ))}
        </Animated.View>
      </View>

      {/* --- CONTENT --- */}
      <Animated.View style={[
        styles.content,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }
      ]}>
        
        <View style={styles.iconContainer}>
            <Text style={styles.auto}>🛺</Text>
        </View>

        <Text style={styles.logoText}>
          City<Text style={styles.highlight}>Hop</Text>
        </Text>

        <Animated.Text style={[styles.tagline, { opacity: taglineFade }]}>
          REAL-TIME SHARED MOBILITY
        </Animated.Text>

        <View style={styles.routeContainer}>
          <View style={styles.routeTrack}>
            <Animated.View style={[styles.routeDot, { left: routeAnim }]} />
            <Animated.View style={[styles.node, styles.nodeLeft, { opacity: nodeFade }]} />
            <Animated.View style={[styles.node, styles.nodeRight, { opacity: nodeFade }]} />
          </View>
        </View>

        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>
      </Animated.View>

      <Animated.View style={[styles.footer, { opacity: taglineFade }]}>
        <Text style={styles.footerText}>Handcrafted by</Text>
        <Text style={styles.brandText}>Jugaadu Engineers · v1.0</Text>
      </Animated.View>
    </Animated.View>
  );
};

export default IntroScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A', // Fixed from white to black
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapBackground: {
    position: 'absolute',
    width: width * 2,
    height: height * 2,
    opacity: 0.1, // Subtle
  },
  gridLineVertical: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: '#F4A300',
  },
  gridLineHorizontal: {
    position: 'absolute',
    height: 1,
    width: '100%',
    backgroundColor: '#F4A300',
  },
  content: {
    alignItems: 'center',
    zIndex: 10,
  },
  iconContainer: {
    width: 70,
    height: 70,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333'
  },
  auto: { fontSize: 30 },
  logoText: {
    fontSize: 50,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -2,
  },
  highlight: { color: '#F4A300' },
  tagline: {
    fontSize: 10,
    color: '#AAAAAA',
    letterSpacing: 4,
    marginTop: 8,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  routeContainer: {
    marginTop: 40,
    marginBottom: 10,
  },
  routeTrack: {
    height: 2,
    width: width * 0.5,
    backgroundColor: '#222',
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center'
  },
  routeDot: {
    position: 'absolute',
    width: 20,
    height: 2,
    backgroundColor: '#F4A300',
    borderRadius: 2,
  },
  node: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F4A300',
    borderWidth: 2,
    borderColor: '#0A0A0A'
  },
  nodeLeft: { left: -4 },
  nodeRight: { right: -4 },
  barTrack: {
    width: width * 0.5,
    height: 2,
    backgroundColor: '#111',
    marginTop: 30,
    borderRadius: 1
  },
  barFill: {
    height: 2,
    backgroundColor: '#F4A300',
    opacity: 0.5
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center'
  },
  footerText: {
    fontSize: 10,
    color: '#444',
    letterSpacing: 1,
    marginBottom: 4
  },
  brandText: {
    fontSize: 12,
    color: '#777',
    fontWeight: '500',
    letterSpacing: 0.5
  }
});