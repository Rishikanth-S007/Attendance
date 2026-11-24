import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function HomeScreen({ onCheckIn, onCheckOut, onLeave, onSettings }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <View style={s.container}>
      <Text style={s.title}>ATTENDANCE SYSTEM</Text>
      <Text style={s.greeting}>{greeting}</Text>
      <TouchableOpacity style={[s.button, { backgroundColor: '#3a996d' }]} onPress={onCheckIn}><Text style={s.buttonText}>CHECK IN</Text></TouchableOpacity>
      <TouchableOpacity style={[s.button, { backgroundColor: '#e61c1c' }]} onPress={onCheckOut}><Text style={s.buttonText}>CHECK OUT</Text></TouchableOpacity>
      <TouchableOpacity style={[s.button, { backgroundColor: '#2F5D8A' }]} onPress={onLeave}><Text style={s.buttonText}>LEAVE</Text></TouchableOpacity>
      <TouchableOpacity style={s.settings} onPress={onSettings}><Text style={s.settingsText}>Device settings</Text></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFEDE7', padding: 24 },
  title: { fontSize: 14, letterSpacing: 2, color: '#6B7178', marginBottom: 8 },
  greeting: { fontSize: 26, fontWeight: '700', color: '#1C2127', marginBottom: 40 },
  button: { width: '100%', paddingVertical: 20, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  settings: { marginTop: 24, padding: 10 },
  settingsText: { color: '#6B7178', fontSize: 13 },
});
