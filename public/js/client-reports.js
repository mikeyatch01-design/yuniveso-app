(async function () {
  const user = await requireSession(['client']);
  if (!user) return;

  const { documents } = await apiGet('/api/documents?category=report');
  const list = document.getElementById('reportsList');
  list.innerHTML = documents.length ? documents.map(d => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:10px;">
      <div style="width:38px;height:38px;border-radius:8px;background:var(--blue-light);display:flex;align-items:center;justify-content:center;flex:0 0 38px;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="var(--blue-dark)" stroke-width="1.8" stroke-linejoin="round"/></svg>
      </div>
      <div style="flex:1;">
        <div style="font-size:13.5px;font-weight:700;">${escapeHtml(d.original_filename)}</div>
        <div class="cell-sub">${escapeHtml(d.audit_title)} · ${formatDate(d.created_at.slice(0, 10))} · ${(d.size_bytes / 1024).toFixed(0)} KB</div>
      </div>
      <a class="btn btn-secondary" style="padding:7px 12px;" href="/api/documents/${d.id}/download">Download</a>
    </div>
  `).join('') : `<div class="cell-sub">No reports published yet.</div>`;
})();
