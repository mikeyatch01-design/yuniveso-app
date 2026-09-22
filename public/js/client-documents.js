(async function () {
  const user = await requireSession(['client']);
  if (!user) return;

  const tbody = document.getElementById('docsTableBody');
  let primaryAuditId = null;

  async function load() {
    const [{ documents }, { audits }] = await Promise.all([
      apiGet('/api/documents'),
      apiGet('/api/dashboard').then(d => ({ audits: d.audits })),
    ]);
    const primary = audits.find(a => a.status !== 'Completed') || audits[0];
    primaryAuditId = primary ? primary.id : null;

    const nonReports = documents.filter(d => d.category !== 'report');
    tbody.innerHTML = nonReports.length ? nonReports.map(d => `
      <tr>
        <td>${d.status === 'Awaiting' ? escapeHtml(d.original_filename) : `<a href="/api/documents/${d.id}/download">${escapeHtml(d.original_filename)}</a>`}</td>
        <td>${escapeHtml(d.audit_title)}</td>
        <td>${escapeHtml(d.requested_from || '—')}</td>
        <td>${formatDate(d.due_date)}</td>
        <td>${d.status === 'Awaiting' ? '<span class="badge badge-warning">Awaiting upload</span>' : statusBadge(d.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="5" class="cell-sub">No documents yet.</td></tr>`;
  }

  const uploadBtn = document.getElementById('uploadBtn');
  const uploadInput = document.getElementById('uploadInput');
  uploadBtn.addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files[0];
    if (!file || !primaryAuditId) return;
    const form = new FormData();
    form.append('file', file);
    form.append('audit_id', primaryAuditId);
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';
    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = '+ Upload Document';
    }
  });

  load();
})();
