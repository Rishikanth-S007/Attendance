// Server error codes -> short messages an employee can act on.
const HELP = {
  LOCATION_REQUIRED: 'Location is required. Turn on location and allow access, then try again.',
  OUTSIDE_GEOFENCE: 'You are outside the allowed work location.',
  MOCK_LOCATION: 'A fake or mock location was detected. Turn it off and try again.',
  TOO_SOON: 'You just checked in. Please wait a moment before checking out.',
  NO_CHECKIN: 'No check-in found for today, so you cannot check out yet.',
  FACE_NOT_RECOGNIZED: 'Face not recognized. Face the camera in good light and try again.',
  FACE_AMBIGUOUS: 'Could not tell who this is. Move closer, face the camera and try again.',
  NO_FACE: 'No face found. Position your face in the frame.',
  MULTIPLE_FACES: 'More than one face in view. Only you should be in the frame.',
  FACE_TOO_SMALL: 'Move closer to the camera.',
  TOO_DARK: 'Too dark. Move to a brighter place.',
  OVEREXPOSED: 'Too bright. Avoid strong light behind you.',
  TOO_BLURRY: 'Image is blurry. Hold the phone steady.',
  FACE_TURNED: 'Look straight at the camera.',
  FACE_TILTED: 'Keep your head level.',
  FACE_SERVICE_UNAVAILABLE: 'Face recognition is temporarily unavailable. Try again shortly.',
  DEVICE_KEY_INVALID: 'This device is not authorised. Ask your admin for a new device key.',
  PAST_DATE: 'Leave cannot start in the past. Ask your admin to record it.',
};

export function explain(err) {
  if (!err.response) return 'Cannot reach the server. Check your connection and the server address in Settings.';
  const { code, message } = err.response.data || {};
  if (err.response.status === 401 || err.response.status === 403) {
    return HELP[code] || 'This device is not authorised. Ask your admin for a device key.';
  }
  if (err.response.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return HELP[code] || message || 'Something went wrong. Please try again.';
}
