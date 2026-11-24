import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import client from '../api/client';
import { explain } from '../lib/errors';

const TYPES = ['casual', 'sick', 'earned', 'unpaid'];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const todayStr = () => new Date().toLocaleDateString('en-CA');

// Leave request. The face scan identifies the employee, so no ID or password is typed.
export default function LeaveScreen({ onDone }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [step, setStep] = useState('form'); // form | camera | busy | result
  const [action, setAction] = useState('request'); // request | balance
  const [type, setType] = useState('casual');
  const [start, setStart] = useState(todayStr());
  const [end, setEnd] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function begin(a) {
    setError('');
    if (a === 'request') {
      if (!isDate(start) || !isDate(end)) return setError('Enter dates as YYYY-MM-DD.');
      if (end < start) return setError('End date cannot be before the start date.');
    }
    setAction(a);
    setStep('camera');
  }

  async function submit() {
    if (!cameraRef.current) return;
    setStep('busy');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      const form = new FormData();
      form.append('image', { uri: photo.uri, name: 'leave.jpg', type: 'image/jpeg' });
      let res;
      if (action === 'request') {
        form.append('type', type); form.append('startDate', start); form.append('endDate', end); form.append('reason', reason);
        res = await client.post('/leaves/app/request', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        res = await client.post('/leaves/app/balance', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      setResult({ ok: true, data: res.data });
    } catch (err) {
      setResult({ ok: false, message: explain(err) });
    }
    setStep('result');
  }

  if (step === 'camera' || step === 'busy') {
    if (!permission?.granted) {
      return <View style={s.center}><TouchableOpacity style={s.btn} onPress={requestPermission}><Text style={s.btnText}>Grant camera permission</Text></TouchableOpacity></View>;
    }
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
        <View style={s.overlay}>
          {step === 'busy' ? <ActivityIndicator color="#fff" /> : (
            <TouchableOpacity style={s.capture} onPress={submit}><Text style={s.btnText}>SCAN FACE TO CONFIRM</Text></TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (step === 'result') {
    const balances = result?.data?.balance;
    return (
      <ScrollView contentContainerStyle={s.center}>
        {result.ok ? (
          <>
            <Text style={s.ok}>{action === 'request' ? '✓ Request sent' : 'Leave balance'}</Text>
            {action === 'request' && <Text style={s.info}>{result.data.message}{result.data.leave ? `\n${result.data.leave.days} working day(s), status: ${result.data.leave.status}` : ''}</Text>}
            {Array.isArray(balances) && balances.map((b) => (
              <Text key={b.type} style={s.row}>{b.type}: {b.remaining === null ? 'unlimited' : `${b.remaining} left`} (used {b.used}{b.pending ? `, pending ${b.pending}` : ''})</Text>
            ))}
          </>
        ) : (
          <><Text style={s.fail}>Could not complete</Text><Text style={s.info}>{result.message}</Text></>
        )}
        <TouchableOpacity style={s.btn} onPress={() => { setResult(null); setStep('form'); }}><Text style={s.btnText}>BACK</Text></TouchableOpacity>
        <TouchableOpacity style={s.done} onPress={onDone}><Text style={s.doneText}>HOME</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Leave</Text>
      <Text style={s.label}>Type</Text>
      <View style={s.chips}>
        {TYPES.map((t) => (
          <TouchableOpacity key={t} onPress={() => setType(t)} style={[s.chip, type === t && s.chipOn]}>
            <Text style={type === t ? s.chipTextOn : s.chipText}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.label}>From (YYYY-MM-DD)</Text>
      <TextInput style={s.input} value={start} onChangeText={setStart} autoCapitalize="none" />
      <Text style={s.label}>To (YYYY-MM-DD)</Text>
      <TextInput style={s.input} value={end} onChangeText={setEnd} autoCapitalize="none" />
      <Text style={s.label}>Reason (optional)</Text>
      <TextInput style={s.input} value={reason} onChangeText={setReason} maxLength={300} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.btn} onPress={() => begin('request')}><Text style={s.btnText}>REQUEST LEAVE</Text></TouchableOpacity>
      <TouchableOpacity style={[s.btn, { backgroundColor: '#6B7178' }]} onPress={() => begin('balance')}><Text style={s.btnText}>CHECK MY BALANCE</Text></TouchableOpacity>
      <TouchableOpacity style={s.done} onPress={onDone}><Text style={s.doneText}>BACK</Text></TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFEDE7', padding: 24 },
  form: { flexGrow: 1, backgroundColor: '#EFEDE7', padding: 24, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16, color: '#1C2127' },
  label: { fontSize: 13, color: '#6B7178', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DAD6CC', borderRadius: 6, padding: 12, marginBottom: 14, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: '#DAD6CC', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2F5D8A', borderColor: '#2F5D8A' },
  chipText: { color: '#1C2127' }, chipTextOn: { color: '#fff', fontWeight: '600' },
  error: { color: '#B4483A', marginBottom: 10 },
  overlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  capture: { backgroundColor: '#2F8F7E', paddingVertical: 18, paddingHorizontal: 30, borderRadius: 30 },
  btn: { backgroundColor: '#2F5D8A', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 8, marginTop: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ok: { fontSize: 22, fontWeight: '700', color: '#2F8F7E', marginBottom: 12 },
  fail: { fontSize: 22, fontWeight: '700', color: '#B4483A', marginBottom: 12 },
  info: { fontSize: 16, textAlign: 'center', color: '#1C2127' },
  row: { fontSize: 15, marginTop: 8, color: '#1C2127' },
  done: { marginTop: 20, padding: 12, alignItems: 'center' },
  doneText: { color: '#2F5D8A', fontWeight: '700' },
});
