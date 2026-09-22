(async function () {
  const user = await requireSession(['super_admin']);
  if (!user) return;

  const tbody = document.getElementById('orgsTableBody');
  const modalOverlay = document.getElementById('orgModalOverlay');
  const modalTitle = document.getElementById('orgModalTitle');
  const adminFields = document.getElementById('orgAdminFields');
  const form = document.getElementById('orgForm');
  const errEl = document.getElementById('orgFormError');
  const submitBtn = document.getElementById('orgSubmitBtn');

  const fName = document.getElementById('fOrgName');
  const fIndustry = document.getElementById('fOrgIndustry');
  const fPlan = document.getElementById('fOrgPlan');
  const fMrr = document.getElementById('fOrgMrr');
  const fStatus = document.getElementById('fOrgStatus');
  const fAdminName = document.getElementById('fAdminName');
  const fAdminEmail = document.getElementById('fAdminEmail');
  const fAdminPassword = document.getElementById('fAdminPassword');

  let editingId = null;

  async function load() {
    const { organizations } = await apiGet('/api/organizations');
    tbody.innerHTML = organizations.length ? organizations.map(o => `
      <tr>
        <td><b>${escapeHtml(o.name)}</b><div class="cell-sub">${escapeHtml(o.industry || '—')} · ${o.clients} clients · ${o.audits} audits</div></td>
        <td>${o.admin_name ? `${escapeHtml(o.admin_name)}<div class="cell-sub">${escapeHtml(o.admin_email)}</div>` : '<span class="cell-sub">No admin yet</span>'}</td>
        <td>${escapeHtml(o.plan)}</td>
        <td class="mono">$${Number(o.mrr).toLocaleString('en-US')}</td>
        <td>${statusBadge(o.status)}</td>
        <td class="row-actions">
          <button type="button" class="row-icon-btn edit-org-btn" data-id="${o.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.85 0 0 1 4 4L7 21l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" class="row-icon-btn danger delete-org-btn" data-id="${o.id}" data-name="${escapeHtml(o.name)}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>
          </button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="6" class="cell-sub">No organizations yet.</td></tr>`;
  }

  function openModal(org) {
    editingId = org ? org.id : null;
    modalTitle.textContent = org ? 'Edit Organization' : 'Add Organization';
    adminFields.style.display = org ? 'none' : 'block';
    fName.value = org ? org.name : '';
    fIndustry.value = org ? org.industry : '';
    fPlan.value = org ? org.plan : 'Trial';
    fMrr.value = org ? org.mrr : 0;
    fStatus.value = org ? org.status : 'Trial';
    fAdminName.value = ''; fAdminEmail.value = ''; fAdminPassword.value = '';
    errEl.style.display = 'none';
    modalOverlay.classList.add('show');
  }
  function closeModal() { modalOverlay.classList.remove('show'); }

  document.getElementById('addOrgBtn').addEventListener('click', () => openModal(null));
  document.getElementById('orgModalClose').addEventListener('click', closeModal);
  document.getElementById('orgModalCancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  tbody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-org-btn');
    if (editBtn) {
      const { organizations } = await apiGet('/api/organizations');
      const org = organizations.find(o => o.id === Number(editBtn.dataset.id));
      if (org) openModal(org);
      return;
    }
    const delBtn = e.target.closest('.delete-org-btn');
    if (delBtn) {
      if (!confirm(`Delete "${delBtn.dataset.name}"? This permanently deletes every client, audit, finding, and document under this organization. This can't be undone.`)) return;
      delBtn.disabled = true;
      try {
        await apiDelete(`/api/organizations/${delBtn.dataset.id}`);
        load();
      } catch (err) {
        alert('Could not delete: ' + err.message);
        delBtn.disabled = false;
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    submitBtn.disabled = true;
    try {
      if (editingId) {
        await apiPatch(`/api/organizations/${editingId}`, {
          name: fName.value.trim(), industry: fIndustry.value.trim(),
          plan: fPlan.value, mrr: Number(fMrr.value) || 0, status: fStatus.value,
        });
      } else {
        await apiPost('/api/organizations', {
          name: fName.value.trim(), industry: fIndustry.value.trim(),
          plan: fPlan.value, mrr: Number(fMrr.value) || 0, status: fStatus.value,
          admin_name: fAdminName.value.trim(), admin_email: fAdminEmail.value.trim(), admin_password: fAdminPassword.value,
        });
      }
      closeModal();
      load();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  });

  load();
})();
