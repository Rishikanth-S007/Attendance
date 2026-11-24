import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';

const ANGLES = [
  { label: 'primary', title: 'Straight on', hint: 'Look straight at the camera' },
  { label: 'left', title: 'Turn slightly left', hint: 'Turn your head a little to the left' },
  { label: 'right', title: 'Turn slightly right', hint: 'Turn your head a little to the right' },
];

const CODE_HELP = {
  NO_FACE: 'No face found. Move into the frame.',
  MULTIPLE_FACES: 'More than one face in frame. Only the employee should be visible.',
  FACE_TOO_SMALL: 'Too far away. Move closer to the camera.',
  TOO_DARK: 'Too dark. Add light in front of the face.',
  OVEREXPOSED: 'Too bright or backlit. Avoid direct light behind or on the face.',
  TOO_BLURRY: 'Image is blurry. Hold still and try again.',
  FACE_TURNED: 'Face is turned too far. Look closer to the camera.',
  FACE_TILTED: 'Head is tilted. Keep your head level.',
  DUPLICATE_FACE: 'This face is already registered under another employee.',
};

// Enrolment with several angles improves recognition. Only the first (straight on) is required.
export default function FaceRegistration() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const [cameraOk, setCameraOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState({}); // label -> true
  const [message, setMessage] = useState({ ok: true, text: '' });
  const current = ANGLES.find((a) => !done[a.label]);

  useEffect(() => {
    let stream;
    navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 } })
      .then((s) => { stream = s; if (videoRef.current) videoRef.current.srcObject = s; setCameraOk(true); })
      .catch(() => setMessage({ ok: false, text: 'Camera unavailable. You can upload a photo instead.' }));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function submit(blob, filename, label) {
    setBusy(true);
    setMessage({ ok: true, text: '' });
    const form = new FormData();
    form.append('image', blob, filename);
    form.append('label', label);
    try {
      await client.post(`/employees/${id}/register-face`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDone((d) => ({ ...d, [label]: true }));
      setMessage({ ok: true, text: `Saved: ${ANGLES.find((a) => a.label === label).title}.` });
    } catch (err) {
      const code = err.response?.data?.code;
      setMessage({ ok: false, text: CODE_HELP[code] || err.response?.data?.message || 'Registration failed. Try better lighting and one clear face.' });
    } finally { setBusy(false); }
  }

  function capture() {
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((b) => b && submit(b, 'face.jpg', current.label), 'image/jpeg', 0.92);
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (f && current) submit(f, f.name, current.label);
    e.target.value = '';
  }

  const doneCount = Object.keys(done).length;

  return (
    <div>
      <div className="page-header"><div><h1>Register face — {id}</h1>
        <p className="sub">Capture 1 to 3 angles. More angles make recognition more reliable.</p></div></div>

      <div className="steps">
        {ANGLES.map((a) => (
          <div key={a.label} className={`step ${done[a.label] ? 'done' : current?.label === a.label ? 'current' : ''}`}>
            {done[a.label] ? '✓ ' : ''}{a.title}{a.label !== 'primary' ? ' (optional)' : ''}
          </div>
        ))}
      </div>

      <div className="panel" style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <video ref={videoRef} autoPlay playsInline muted className="camera-frame" style={{ objectFit: 'cover', width: 320, height: 240 }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          <div className="row-actions" style={{ marginTop: 12 }}>
            {current ? (
              <>
                <button className="btn" onClick={capture} disabled={busy || !cameraOk}>{busy ? 'Checking…' : `Capture: ${current.title}`}</button>
                <button className="btn secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Upload photo</button>
              </>
            ) : <span className="muted">All angles captured.</span>}
          </div>
        </div>
        <div style={{ maxWidth: 340, fontSize: 14 }} className="muted">
          {current && <p><strong>{current.hint}.</strong></p>}
          <ul>
            <li>Even lighting, no strong backlight</li>
            <li>One person in frame, face fills a good part of it</li>
            <li>No sunglasses or masks</li>
          </ul>
          {message.text && <p className={message.ok ? 'ok-text' : 'error-text'}>{message.text}</p>}
          {doneCount > 0 && <button className="btn" style={{ marginTop: 8 }} onClick={() => navigate(`/employees/${id}`)}>Finish</button>}
        </div>
      </div>
    </div>
  );
}
