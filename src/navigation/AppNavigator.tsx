



import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import IntroScreen      from '../introscreen';
import RoleSelect       from '../RoleSelect';
import PassengerAuth    from '../passenger/PassengerAuth';
//import PassengerHome    from '../passenger/PassengerHome';
//import PassengerProfile from '../passenger/PassengerProfile';
import DriverAuth       from '../driver/DriverAuth';
//import DriverHome       from '../driver/DriverHome';
//import DriverProfile    from '../driver/DriverProfile';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="Intro"            component={IntroScreen}      />
      <Stack.Screen name="RoleSelect"       component={RoleSelect}       />
      <Stack.Screen name="PassengerAuth"    component={PassengerAuth}    />
      <Stack.Screen name="PassengerHome"    component={PassengerHome}    />
      <Stack.Screen name="PassengerProfile" component={PassengerProfile} />
      <Stack.Screen name="DriverAuth"       component={DriverAuth}       />
      <Stack.Screen name="DriverHome"       component={DriverHome}       />
      <Stack.Screen name="DriverProfile"    component={DriverProfile}    />
    </Stack.Navigator>
  );
}