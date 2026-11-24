import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { fmtTime, minutesToHm } from '../lib/download';

// Live snapshot. Counts come from the backend, which combines records, shifts, holidays and leave.
export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [today, setToday] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/dashboard/summary').then((r) => setSummary(r.data)).catch(() => setError('Could not load summary'));
    client.get('/dashboard/today').then((r) => setToday(r.data.records)).catch(() => {});
  }, []);

  const card = (cls, label, key) => (
    <div className={`stat-card ${cls}`}>
      <div className="label">{label}</div>
      <div className="value">{summary?.[key] ?? '—'}</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Live snapshot of today's attendance{summary?.holiday ? ' — today is a holiday / day off' : ''}</p>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="stat-grid six">
        {card('', 'Total employees', 'totalEmployees')}
        {card('present', 'Present', 'present')}
        {card('late', 'Late', 'late')}
        {card('halfday', 'Half day', 'halfDay')}
        {card('leave', 'On leave', 'onLeave')}
        {card('absent', 'Absent', 'absent')}
      </div>
      {summary && <p className="muted" style={{ marginTop: -14, marginBottom: 20 }}>Attendance rate today: {summary.attendancePercentage}% · Checked out: {summary.checkedOut}</p>}

      <div className="panel table-scroll">
        <h3 style={{ marginBottom: 14 }}>Today's attendance</h3>
        <table>
          <thead><tr><th>Employee</th><th>Check-in</th><th>Check-out</th><th>Worked</th><th>Status</th><th>Punctuality</th></tr></thead>
          <tbody>
            {today.length === 0 && <tr><td colSpan={6} className="muted">No attendance recorded yet today.</td></tr>}
            {today.map((r) => (
              <tr key={r._id}>
                <td>{r.employeeId}</td>
                <td>{fmtTime(r.checkIn)}</td>
                <td>{fmtTime(r.checkOut)}</td>
                <td>{minutesToHm(r.workedMinutes)}</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td>{r.outcome ? <span className={`badge ${r.outcome}`}>{r.outcome === 'late' ? `late ${r.lateMinutes}m` : r.outcome.replace('_', ' ')}</span> : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
