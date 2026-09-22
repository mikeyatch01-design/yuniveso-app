(async function () {
  const user = await requireSession(['admin', 'auditor', 'super_admin']);
  if (!user) return;

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  document.querySelectorAll('[data-admin-only]').forEach(el => { if (!isAdmin) el.style.display = 'none'; });
  document.querySelectorAll('[data-auditor-only]').forEach(el => { if (isAdmin) el.style.display = 'none'; });
  document.getElementById('roleLabel').textContent = user.role === 'auditor' ? 'Auditor' : (user.role === 'super_admin' ? 'Super Admin' : 'Admin');
  document.getElementById('pageTitle').textContent = isAdmin ? 'Audits' : 'Assigned Audits';
  document.getElementById('breadcrumbLabel').textContent = isAdmin ? 'Audits' : 'Assigned Audits';
  document.getElementById('auditsNavLabel').textContent = isAdmin ? 'Audits' : 'Assigned Audits';

  const tbody = document.getElementById('auditsTableBody');
  const modalOverlay = document.getElementById('auditModalOverlay');
  const modalTitle = document.getElementById('auditModalTitle');
  const form = document.getElementById('auditForm');
  const errEl = document.getElementById('auditFormError');
  const submitBtn = document.getElementById('auditSubmitBtn');

  const fClient = document.getElementById('fAuditClient');
  const fTitle = document.getElementById('fAuditTitle');
  const fPhase = document.getElementById('fAuditPhase');
  const fStatus = document.getElementById('fAuditStatus');
  const fRisk = document.getElementById('fAuditRisk');
  const fLead = document.getElementById('fAuditLead');
  const fStart = document.getElementById('fAuditStart');
  const fTarget = document.getElementById('fAuditTarget');
  const fScope = document.getElementById('fAuditScope');

  let editingId = null;

  async function load() {
    const { audits } = await apiGet('/api/audits');
    document.getElementById('pageSub').textContent = `${audits.length} audit${audits.length === 1 ? '' : 's'}`;
    tbody.innerHTML = audits.length ? audits.map(a => `
      <tr>
        <td><b>${escapeHtml(a.client_name)}</b></td>
        <td><a href="audit-details.html?id=${a.id}">${escapeHtml(a.title)}</a></td>
        <td>${a.lead_name ? avatarSm(a.lead_name) + ' ' + escapeHtml(a.lead_name) : '<span class="cell-sub">Unassigned</span>'}</td>
        <td>${escapeHtml(a.phase)}</td>
        <td>${riskBadge(a.risk_level)}</td>
        <td>${formatDate(a.target_date)}</td>
        <td>${statusBadge(a.status)}</td>
        <td class="row-actions">
          ${isAdmin ? `
            <button type="button" class="row-icon-btn edit-audit-btn" data-id="${a.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.85 0 0 1 4 4L7 21l-4 1 1-4Z"/></svg>
            </button>
            <button type="button" class="row-icon-btn danger delete-audit-btn" data-id="${a.id}" data-title="${escapeHtml(a.title)}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>
            </button>` : ''}
        </td>
      </tr>
    `).join('') : `<tr><td colspan="8" class="cell-sub">No audits yet.</td></tr>`;
    wireTableSearch('searchInput', 'auditsTableBody');
    return audits;
  }

  if (isAdmin) {
    async function openModal(audit) {
      editingId = audit ? audit.id : null;
      modalTitle.textContent = audit ? 'Edit Audit' : 'New Audit';
      const [{ clients }, { users }] = await Promise.all([apiGet('/api/clients'), apiGet('/api/users?role=auditor')]);
      fClient.innerHTML = clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      fLead.innerHTML = '<option value="">— Unassigned —</option>' + users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');

      if (audit) {
        fClient.value = audit.client_id;
        fTitle.value = audit.title;
        fPhase.value = audit.phase;
        fStatus.value = audit.status;
        fRisk.value = audit.risk_level;
        fLead.value = audit.lead_auditor_id || '';
        fStart.value = audit.start_date || '';
        fTarget.value = audit.target_date || '';
        fScope.value = audit.scope_text || '';
      } else {
        form.reset();
      }
      errEl.style.display = 'none';
      modalOverlay.classList.add('show');
    }
    function closeModal() { modalOverlay.classList.remove('show'); }

    document.getElementById('addAuditBtn').addEventListener('click', () => openModal(null));
    document.getElementById('auditModalClose').addEventListener('click', closeModal);
    document.getElementById('auditModalCancel').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    tbody.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-audit-btn');
      if (editBtn) {
        const { audits } = await apiGet('/api/audits');
        const a = audits.find(x => x.id === Number(editBtn.dataset.id));
        if (a) openModal(a);
        return;
      }
      const delBtn = e.target.closest('.delete-audit-btn');
      if (delBtn) {
        if (!confirm(`Delete "${delBtn.dataset.title}"? This also deletes its findings and documents. This can't be undone.`)) return;
        delBtn.disabled = true;
        try { await apiDelete(`/api/audits/${delBtn.dataset.id}`); load(); }
        catch (err) { alert('Could not delete: ' + err.message); delBtn.disabled = false; }
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';
      submitBtn.disabled = true;
      const body = {
        client_id: Number(fClient.value), title: fTitle.value.trim(), phase: fPhase.value, status: fStatus.value,
        risk_level: fRisk.value, lead_auditor_id: fLead.value || null,
        start_date: fStart.value || null, target_date: fTarget.value || null, scope_text: fScope.value.trim(),
        team: fLead.value ? [Number(fLead.value)] : [],
      };
      try {
        if (editingId) await apiPatch(`/api/audits/${editingId}`, body);
        else await apiPost('/api/audits', body);
        closeModal();
        load();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  load();
})();
