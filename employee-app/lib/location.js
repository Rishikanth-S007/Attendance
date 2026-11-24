import * as Location from 'expo-location';

/**
 * Current GPS fix for the geofence check. Returns fields to append to the form,
 * or null if the user denied permission (the server decides if that is acceptable).
 */
export async function getLocationFields() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    latitude: String(pos.coords.latitude),
    longitude: String(pos.coords.longitude),
    accuracy: String(pos.coords.accuracy ?? ''),
    mocked: String(!!pos.mocked),
  };
}

export function appendLocation(form, fields) {
  if (!fields) return;
  Object.entries(fields).forEach(([k, v]) => { if (v !== '') form.append(k, v); });
}
