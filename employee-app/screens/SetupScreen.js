import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { saveSettings, clearSettings, loadSettings } from '../api/client';

// One-time pairing: server address plus the device key generated in the admin dashboard (Devices page).
export default function SetupScreen({ onSaved, onCancel, canCancel }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  React.useEffect(() => { loadSettings().then((s) => setUrl(s.url || '')); }, []);

  async function save() {
    if (!/^https?:\/\/.+/.test(url.trim())) return setError('Enter the server address, e.g. http://192.168.1.10:5000/api');
    if (!key.trim().startsWith('dk_')) return setError('Device key should start with "dk_". Copy it from the Devices page.');
    await saveSettings({ url, key });
    onSaved();
  }

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Pair this device</Text>
      <Text style={s.info}>Ask your admin to create a device key on the dashboard (Devices page).</Text>
      <Text style={s.label}>Server address</Text>
      <TextInput style={s.input} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.1.10:5000/api" keyboardType="url" />
      <Text style={s.label}>Device key</Text>
      <TextInput style={s.input} value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="dk_..." />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.btn} onPress={save}><Text style={s.btnText}>SAVE</Text></TouchableOpacity>
      {canCancel && (
        <>
          <TouchableOpacity style={s.link} onPress={onCancel}><Text style={s.linkText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={s.link} onPress={async () => { await clearSettings(); onSaved(); }}><Text style={[s.linkText, { color: '#B4483A' }]}>Remove this device's key</Text></TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', backgroundColor: '#EFEDE7', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#1C2127', marginBottom: 8 },
  info: { fontSize: 14, color: '#6B7178', marginBottom: 20 },
  label: { fontSize: 13, color: '#6B7178', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DAD6CC', borderRadius: 6, padding: 12, marginBottom: 14, fontSize: 15 },
  error: { color: '#B4483A', marginBottom: 10 },
  btn: { backgroundColor: '#2F5D8A', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { alignItems: 'center', padding: 14 },
  linkText: { color: '#2F5D8A', fontWeight: '600' },
});
