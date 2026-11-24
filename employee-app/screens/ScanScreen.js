import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import client from '../api/client';
import { getLocationFields, appendLocation } from '../lib/location';
import { explain } from '../lib/errors';

const fmt = (v) => {
  const t = v?.timestamp || v;
  return t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
};

// One screen for both check-in and check-out. mode: 'in' | 'out'.
export default function ScanScreen({ mode, onDone }) {
  const isIn = mode === 'in';
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [phase, setPhase] = useState('camera'); // camera | scanning | success | already | failed
  const [message, setMessage] = useState('');
  const [data, setData] = useState(null);

  if (!permission) return <View style={s.center}><ActivityIndicator /></View>;
  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.info}>Camera access is required to verify your face.</Text>
        <TouchableOpacity style={s.btn} onPress={requestPermission}><Text style={s.btnText}>Grant camera permission</Text></TouchableOpacity>
      </View>
    );
  }

  async function capture() {
    if (!cameraRef.current) return;
    setPhase('scanning');
    try {
      const [photo, loc] = await Promise.all([
        cameraRef.current.takePictureAsync({ quality: 0.7 }),
        getLocationFields().catch(() => null),
      ]);
      const form = new FormData();
      form.append('image', { uri: photo.uri, name: 'scan.jpg', type: 'image/jpeg' });
      appendLocation(form, loc);
      const res = await client.post(isIn ? '/attendance/check-in' : '/attendance/check-out', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setData(res.data);
      setMessage(res.data.message);
      setPhase(res.data.alreadyCheckedIn || res.data.alreadyCheckedOut ? 'already' : 'success');
    } catch (err) {
      setMessage(explain(err));
      setPhase('failed');
    }
  }

  if (phase === 'camera' || phase === 'scanning') {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
        <View style={s.overlay}>
          {phase === 'scanning' ? (
            <><ActivityIndicator color="#fff" /><Text style={s.overlayText}>Verifying…{'\n'}Please wait.</Text></>
          ) : (
            <TouchableOpacity style={[s.capture, { backgroundColor: isIn ? '#2F8F7E' : '#B4483A' }]} onPress={capture}>
              <Text style={s.btnText}>{isIn ? 'CHECK IN' : 'CHECK OUT'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const a = data?.attendance;
  return (
    <View style={s.center}>
      {phase === 'success' && (
        <>
          <Text style={s.ok}>✓ {isIn ? 'Checked in' : 'Checked out'}</Text>
          {!!data?.employee?.name && <Text style={s.name}>{data.employee.name}</Text>}
          <Text style={s.info}>{message}</Text>
          <Text style={s.time}>{isIn ? `Check-in: ${fmt(a?.checkIn)}` : `Check-out: ${fmt(a?.checkOut)}`}</Text>
          {isIn && a?.outcome === 'late' && <Text style={s.warn}>Late by {a.lateMinutes} min</Text>}
          {isIn && a?.outcome === 'half_day' && <Text style={s.warn}>Marked half day (late by {a.lateMinutes} min)</Text>}
          {!isIn && !!a?.workedMinutes && <Text style={s.time}>Worked {Math.floor(a.workedMinutes / 60)}h {a.workedMinutes % 60}m</Text>}
        </>
      )}
      {phase === 'already' && (<><Text style={s.ok}>{isIn ? 'Already checked in' : 'Already checked out'}</Text><Text style={s.info}>{message}</Text></>)}
      {phase === 'failed' && (
        <>
          <Text style={s.fail}>Could not {isIn ? 'check in' : 'check out'}</Text>
          <Text style={s.info}>{message}</Text>
          <TouchableOpacity style={s.btn} onPress={() => setPhase('camera')}><Text style={s.btnText}>TRY AGAIN</Text></TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={s.done} onPress={onDone}><Text style={s.doneText}>DONE</Text></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFEDE7', padding: 24 },
  overlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  overlayText: { color: '#fff', textAlign: 'center', marginTop: 12 },
  capture: { paddingVertical: 18, paddingHorizontal: 40, borderRadius: 30 },
  btn: { backgroundColor: '#2F5D8A', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 8, marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ok: { fontSize: 22, fontWeight: '700', color: '#2F8F7E', marginBottom: 8 },
  fail: { fontSize: 22, fontWeight: '700', color: '#B4483A', marginBottom: 12 },
  name: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#1C2127' },
  info: { fontSize: 16, textAlign: 'center', color: '#1C2127' },
  time: { fontSize: 14, color: '#6B7178', marginTop: 10 },
  warn: { fontSize: 14, color: '#C97D2E', marginTop: 8, fontWeight: '600' },
  done: { marginTop: 30, padding: 12 },
  doneText: { color: '#2F5D8A', fontWeight: '700' },
});
