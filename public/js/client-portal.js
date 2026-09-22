const PHASES = ['Planning', 'Field Work', 'Findings', 'Reporting'];

function phaseStepperHtml(currentPhase) {
  const currentIdx = PHASES.indexOf(currentPhase);
  return PHASES.map((phase, i) => {
    const done = i < currentIdx;
    const active = i === currentIdx;
    const circleStyle = done
      ? 'background:#1A8754;color:#fff;'
      : active
      ? 'background:#2456C7;color:#fff;font-weight:800;font-size:12px;font-family:\'Manrope\',sans-serif;'
      : 'background:#F5F6F9;color:#8992A3;font-weight:800;font-size:12px;font-family:\'Manrope\',sans-serif;';
    const labelStyle = active ? 'font-size:11.5px;font-weight:700;color:#2456C7;text-align:center;'
      : done ? 'font-size:11.5px;font-weight:600;text-align:center;'
      : 'font-size:11.5px;color:#8992A3;text-align:center;';
    const circle = `<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;${circleStyle}">${done ? '✓' : i + 1}</div>`;
    const step = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex:1;">${circle}<div style="${labelStyle}">${escapeHtml(phase)}</div></div>`;
    if (i === 0) return step;
    const lineColor = i <= currentIdx ? '#1A8754' : '#E3E6EC';
    return `<div style="flex:1;height:2px;background:${lineColor};margin-top:-22px;"></div>${step}`;
  }).join('');
}

function reportRowHtml(doc) {
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #E3E6EC;border-radius:10px;">
      <div style="width:38px;height:38px;border-radius:8px;background:#EAF0FE;display:flex;align-items:center;justify-content:center;flex:0 0 38px;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="#2456C7" stroke-width="1.8" stroke-linejoin="round"/></svg>
      </div>
      <div style="flex:1;"><div style="font-size:13.5px;font-weight:700;">${escapeHtml(doc.original_filename)}</div><div class="cell-sub">${formatDate(doc.created_at.slice(0, 10))} · ${(doc.size_bytes / 1024).toFixed(0)} KB</div></div>
      <a class="btn btn-secondary" style="padding:7px 12px;" href="/api/documents/${doc.id}/download">Download</a>
    </div>`;
}

(async function () {
  const user = await requireSession(['client']);
  if (!user) return;

  document.getElementById('greeting').textContent = `Welcome back, ${user.name.split(' ')[0]}`;

  try {
    const { kpis, audits } = await apiGet('/api/dashboard');
    document.getElementById('kpiRequested').textContent = kpis.requested;
    document.getElementById('kpiSubmitted').textContent = kpis.submitted;
    document.getElementById('kpiReports').textContent = kpis.reports;

    if (!audits.length) {
      document.getElementById('greetingSub').textContent = 'No audits on file yet.';
      document.getElementById('auditTitle').textContent = 'No active engagement';
      document.getElementById('requestedTableBody').innerHTML = `<tr><td colspan="4" class="cell-sub">Nothing requested yet.</td></tr>`;
      document.getElementById('reportsList').innerHTML = `<div class="cell-sub">No reports published yet.</div>`;
      return;
    }

    const primary = audits.find(a => a.status !== 'Completed') || audits[0];
    document.getElementById('greetingSub').textContent = `Your ${primary.title} is currently in ${primary.phase}`;
    document.getElementById('auditTitle').textContent = primary.title;
    document.getElementById('auditStatusBadge').textContent = primary.status;
    document.getElementById('phaseStepper').innerHTML = phaseStepperHtml(primary.phase);

    const detail = await apiGet(`/api/audits/${primary.id}`);
    const leadName = detail.team[0] ? detail.team[0].name : 'Your audit team';
    document.getElementById('auditMeta').textContent = `Lead contact: ${leadName} · Expected completion ${formatDate(primary.target_date)}`;

    const { documents: requested } = await apiGet(`/api/documents?audit_id=${primary.id}&category=bank_statement`);
    const pendingCount = requested.filter(d => d.status === 'Awaiting').length;
    document.getElementById('requestedBadge').textContent = `${pendingCount} pending`;
    document.getElementById('requestedTableBody').innerHTML = requested.length ? requested.map(d => `
      <tr>
        <td><b>${escapeHtml(d.original_filename)}</b></td>
        <td>${escapeHtml(d.requested_from || '—')}</td>
        <td>${formatDate(d.due_date)}</td>
        <td>${d.status === 'Awaiting' ? '<span class="badge badge-warning">Awaiting upload</span>' : statusBadge(d.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="4" class="cell-sub">Nothing requested yet.</td></tr>`;

    // Reports can live under any of the client's audits (e.g. a prior
    // completed engagement's final report), so gather across all of them.
    const reportLists = await Promise.all(audits.map(a => apiGet(`/api/documents?audit_id=${a.id}&category=report`).catch(() => ({ documents: [] }))));
    const allReports = reportLists.flatMap(r => r.documents);
    document.getElementById('reportsList').innerHTML = allReports.length
      ? allReports.map(reportRowHtml).join('')
      : `<div style="text-align:center;padding:14px;color:#8992A3;font-size:12.5px;border:1px dashed #E3E6EC;border-radius:10px;">Reports will appear here once published</div>`;

    // Upload — a client uploading here always tags it against their
    // primary (non-completed) audit; the server independently re-checks
    // that this audit really belongs to them before accepting the file.
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadInput = document.getElementById('uploadInput');
    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      form.append('audit_id', primary.id);
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading…';
      try {
        const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        window.location.reload();
      } catch (err) {
        alert('Upload failed: ' + err.message);
        uploadBtn.disabled = false;
        uploadBtn.textContent = '+ Upload Document';
      }
    });
  } catch (err) {
    console.error(err);
  }
})();
