import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './screens/HomeScreen';
import ScanScreen from './screens/ScanScreen';
import LeaveScreen from './screens/LeaveScreen';
import SetupScreen from './screens/SetupScreen';
import { loadSettings, isConfigured } from './api/client';

// Employees have no login: the face is the identity and the device key is the
// authorisation. A small state switch is enough for five screens.
export default function App() {
  const [screen, setScreen] = useState(null); // null = loading

  useEffect(() => {
    loadSettings().then(() => setScreen(isConfigured() ? 'home' : 'setup'));
  }, []);

  if (!screen) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  const home = () => setScreen('home');

  return (
    <>
      <StatusBar style="dark" />
      {screen === 'home' && <HomeScreen onCheckIn={() => setScreen('in')} onCheckOut={() => setScreen('out')} onLeave={() => setScreen('leave')} onSettings={() => setScreen('setup')} />}
      {screen === 'in' && <ScanScreen mode="in" onDone={home} />}
      {screen === 'out' && <ScanScreen mode="out" onDone={home} />}
      {screen === 'leave' && <LeaveScreen onDone={home} />}
      {screen === 'setup' && <SetupScreen canCancel={isConfigured()} onCancel={home} onSaved={() => setScreen(isConfigured() ? 'home' : 'setup')} />}
    </>
  );
}
