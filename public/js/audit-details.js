(async function () {
  const user = await requireSession(['admin', 'auditor', 'super_admin']);
  if (!user) return;

  const auditId = new URLSearchParams(window.location.search).get('id');
  if (!auditId) {
    document.querySelector('.content').innerHTML = '<p class="cell-sub">No audit selected. Open this page from an audits table link.</p>';
    return;
  }

  try {
    const { audit, team, documents, procedures, interviews, notes, findings } = await apiGet(`/api/audits/${auditId}`);

    document.getElementById('breadcrumbTitle').textContent = audit.title;
    document.getElementById('auditTitle').textContent = audit.title;
    document.getElementById('auditPhaseBadge').textContent = audit.phase;
    document.getElementById('auditRiskBadge').textContent = `${audit.risk_level} Risk`;
    document.getElementById('auditSubline').textContent =
      `${audit.client_name} · Engagement #${audit.engagement_code} · Started ${formatDate(audit.start_date)}`;

    const teamEl = document.getElementById('teamAvatars');
    teamEl.innerHTML = team.slice(0, 3).map((m, i) => `<div class="avatar avatar-sm" style="margin-right:-8px;border:2px solid #fff;">${escapeHtml(initials(m.name))}</div>`).join('')
      + (team.length > 3 ? `<div class="avatar avatar-sm" style="border:2px solid #fff;background:#FDF3E2;color:#B4720A;">+${team.length - 3}</div>` : '');
    if (!team.length) teamEl.innerHTML = '<span class="cell-sub">Unassigned</span>';

    document.getElementById('progressFill').style.width = `${audit.progress_pct}%`;
    document.getElementById('progressLabel').textContent = `${audit.progress_pct}%`;
    document.getElementById('targetDate').textContent = formatDate(audit.target_date);
    document.getElementById('scopeText').textContent = audit.scope_text || '—';

    const openFindings = findings.filter(f => f.status !== 'Resolved');
    const criticalCount = openFindings.filter(f => f.risk_level === 'Critical').length;
    document.getElementById('openFindings').textContent = openFindings.length
      ? `${openFindings.length} finding${openFindings.length === 1 ? '' : 's'}${criticalCount ? ` (${criticalCount} critical)` : ''}`
      : 'None';

    document.getElementById('evidenceCountBadge').textContent =
      `${documents.filter(d => d.status !== 'Awaiting').length} of ${documents.length} collected`;
    document.getElementById('evidenceTableBody').innerHTML = documents.length ? documents.map(d => `
      <tr>
        <td>${d.status === 'Awaiting' ? escapeHtml(d.original_filename) : `<a href="/api/documents/${d.id}/download">${escapeHtml(d.original_filename)}</a>`}</td>
        <td>${badge(d.category === 'bank_statement' ? 'Client upload' : 'Internal', d.category === 'bank_statement' ? 'badge-info' : 'badge-muted')}</td>
        <td>${escapeHtml(d.requested_from || '—')}</td>
        <td>${d.status === 'Awaiting' ? '<span class="badge badge-warning">Awaiting</span>' : statusBadge(d.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="4" class="cell-sub">No evidence requested yet.</td></tr>`;

    document.getElementById('procedureCountBadge').textContent =
      `${procedures.filter(p => p.result !== 'In progress').length} of ${procedures.length} complete`;
    document.getElementById('proceduresTableBody').innerHTML = procedures.length ? procedures.map(p => `
      <tr>
        <td>${escapeHtml(p.procedure_text)}</td>
        <td>${escapeHtml(p.assertion)}</td>
        <td style="display:flex;align-items:center;gap:8px;">${p.assigned_name ? avatarSm(p.assigned_name) + escapeHtml(p.assigned_name) : '—'}</td>
        <td>${badge(p.result, p.result === 'No exceptions' ? 'badge-success' : p.result === 'Exception noted' ? 'badge-critical' : 'badge-muted')}</td>
      </tr>
    `).join('') : `<tr><td colspan="4" class="cell-sub">No procedures logged yet.</td></tr>`;

    document.getElementById('interviewsList').innerHTML = interviews.length ? interviews.map(iv => `
      <div class="stat-line">
        <div><div style="font-size:13px;font-weight:600;">${escapeHtml(iv.topic)}</div>
        <div class="cell-sub">${iv.status === 'Complete' ? formatDate(iv.scheduled_date) : 'Scheduled ' + formatDate(iv.scheduled_date)}</div></div>
        ${badge(iv.status, iv.status === 'Complete' ? 'badge-success' : 'badge-muted')}
      </div>
    `).join('') : `<div class="cell-sub">No interviews logged yet.</div>`;

    document.getElementById('notesList').innerHTML = notes.length ? notes.map(n => `
      <div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:5px;">${avatarSm(n.user_name)}<b style="font-size:13px;">${escapeHtml(n.user_name)}</b><span class="cell-sub" style="margin:0;">${formatDate(n.created_at.slice(0, 10))}</span></div>
        <div style="font-size:13px;color:#3A4150;padding-left:34px;">${escapeHtml(n.body)}</div>
      </div>
    `).join('') : `<div class="cell-sub">No notes yet.</div>`;

    const uploadBtn = document.getElementById('uploadEvidenceBtn');
    const uploadInput = document.getElementById('uploadEvidenceInput');
    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      form.append('audit_id', auditId);
      form.append('category', 'evidence');
      uploadBtn.disabled = true;
      try {
        const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        window.location.reload();
      } catch (err) {
        alert('Upload failed: ' + err.message);
        uploadBtn.disabled = false;
      }
    });
  } catch (err) {
    console.error(err);
    document.querySelector('.content').innerHTML = '<p class="cell-sub">Could not load this audit.</p>';
  }
})();
