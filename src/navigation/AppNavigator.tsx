import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import IntroScreen   from '../introscreen';
import RoleSelect    from '../RoleSelect';

import PassengerAuth from '../passenger/PassengerAuth';
import DriverAuth    from '../driver/DriverAuth';

// Home & Profile screens removed for mid evaluation

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>

      <Stack.Screen 
        name="Intro"
        component={IntroScreen}
      />

      <Stack.Screen 
        name="RoleSelect"
        component={RoleSelect}
      />

      <Stack.Screen 
        name="PassengerAuth"
        component={PassengerAuth}
      />

      <Stack.Screen 
        name="DriverAuth"
        component={DriverAuth}
      />

    </Stack.Navigator>
  );
}