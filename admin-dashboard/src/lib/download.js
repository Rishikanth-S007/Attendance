import client from '../api/client';

/** Download an authenticated file (the browser cannot send the JWT via window.open). */
export async function downloadReport(path, params, fallbackName) {
  const res = await client.get(path, { params, responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const name = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const errMsg = (err, fallback) => err.response?.data?.message || fallback;

export const fmtTime = (ts) =>
  ts ? new Date(ts.timestamp || ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

export const minutesToHm = (m) => (m || m === 0 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : '--');

export const todayKey = () => new Date().toLocaleDateString('en-CA');
