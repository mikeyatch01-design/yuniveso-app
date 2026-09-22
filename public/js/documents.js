(async function () {
  const user = await requireSession(['admin', 'auditor', 'super_admin']);
  if (!user) return;

  document.querySelectorAll('[data-admin-only]').forEach(el => { if (user.role === 'auditor') el.style.display = 'none'; });
  document.querySelectorAll('[data-auditor-only]').forEach(el => { if (user.role !== 'auditor') el.style.display = 'none'; });
  document.getElementById('roleLabel').textContent = user.role === 'auditor' ? 'Auditor' : (user.role === 'super_admin' ? 'Super Admin' : 'Admin');
  document.getElementById('tasksNavLabel').textContent = user.role === 'auditor' ? 'My Tasks' : 'Tasks';

  const tbody = document.getElementById('docsTableBody');
  const categoryFilter = document.getElementById('categoryFilter');
  const CATEGORY_LABEL = { bank_statement: 'Client upload', evidence: 'Internal evidence', report: 'Report' };

  async function load() {
    const category = categoryFilter.value;
    const { documents } = await apiGet(`/api/documents${category ? '?category=' + category : ''}`);
    document.getElementById('pageSub').textContent = `${documents.length} document${documents.length === 1 ? '' : 's'}`;

    tbody.innerHTML = documents.length ? documents.map(d => `
      <tr>
        <td>${d.status === 'Awaiting' ? escapeHtml(d.original_filename) : `<a href="/api/documents/${d.id}/download">${escapeHtml(d.original_filename)}</a>`}</td>
        <td><a href="audit-details.html?id=${d.audit_id}">${escapeHtml(d.audit_title)}</a></td>
        <td>${badge(CATEGORY_LABEL[d.category] || d.category, d.category === 'bank_statement' ? 'badge-info' : d.category === 'report' ? 'badge-success' : 'badge-muted')}</td>
        <td>${escapeHtml(d.requested_from || '—')}</td>
        <td>${d.status === 'Awaiting' ? '<span class="badge badge-warning">Awaiting</span>' : statusBadge(d.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="5" class="cell-sub">No documents yet.</td></tr>`;
    wireTableSearch('searchInput', 'docsTableBody');
  }

  categoryFilter.addEventListener('change', load);
  load();
})();
