(async function () {
  const user = await requireSession(['admin', 'super_admin']);
  if (!user) return;

  const tbody = document.getElementById('clientsTableBody');
  const modalOverlay = document.getElementById('clientModalOverlay');
  const modalTitle = document.getElementById('clientModalTitle');
  const passwordRow = document.getElementById('clientPasswordRow');
  const form = document.getElementById('clientForm');
  const errEl = document.getElementById('clientFormError');
  const submitBtn = document.getElementById('clientSubmitBtn');

  const fName = document.getElementById('fClientName');
  const fIndustry = document.getElementById('fClientIndustry');
  const fContactName = document.getElementById('fContactName');
  const fContactEmail = document.getElementById('fContactEmail');
  const fPassword = document.getElementById('fClientPassword');

  let editingId = null;
  let auditCounts = {};

  async function load() {
    const [{ clients }, { audits }] = await Promise.all([apiGet('/api/clients'), apiGet('/api/audits')]);
    auditCounts = {};
    audits.forEach(a => { auditCounts[a.client_id] = (auditCounts[a.client_id] || 0) + 1; });

    tbody.innerHTML = clients.length ? clients.map(c => `
      <tr>
        <td><b>${escapeHtml(c.name)}</b><div class="cell-sub">${escapeHtml(c.industry || '—')}</div></td>
        <td>${escapeHtml(c.contact_name)}<div class="cell-sub">${escapeHtml(c.contact_email)}</div></td>
        <td>${auditCounts[c.id] || 0}</td>
        <td class="row-actions">
          <button type="button" class="row-icon-btn edit-client-btn" data-id="${c.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.85 0 0 1 4 4L7 21l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" class="row-icon-btn danger delete-client-btn" data-id="${c.id}" data-name="${escapeHtml(c.name)}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>
          </button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="4" class="cell-sub">No clients yet.</td></tr>`;
    return clients;
  }

  function openModal(c) {
    editingId = c ? c.id : null;
    modalTitle.textContent = c ? 'Edit Client' : 'Add Client';
    passwordRow.style.display = c ? 'none' : 'block';
    fPassword.required = !c;
    fName.value = c ? c.name : '';
    fIndustry.value = c ? c.industry : '';
    fContactName.value = c ? c.contact_name : '';
    fContactEmail.value = c ? c.contact_email : '';
    fPassword.value = '';
    errEl.style.display = 'none';
    modalOverlay.classList.add('show');
  }
  function closeModal() { modalOverlay.classList.remove('show'); }

  document.getElementById('addClientBtn').addEventListener('click', () => openModal(null));
  document.getElementById('clientModalClose').addEventListener('click', closeModal);
  document.getElementById('clientModalCancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  tbody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-client-btn');
    if (editBtn) {
      const { clients } = await apiGet('/api/clients');
      const c = clients.find(x => x.id === Number(editBtn.dataset.id));
      if (c) openModal(c);
      return;
    }
    const delBtn = e.target.closest('.delete-client-btn');
    if (delBtn) {
      if (!confirm(`Delete "${delBtn.dataset.name}"? This permanently deletes all of their audits, findings, and documents. This can't be undone.`)) return;
      delBtn.disabled = true;
      try {
        await apiDelete(`/api/clients/${delBtn.dataset.id}`);
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
      const body = {
        name: fName.value.trim(), industry: fIndustry.value.trim(),
        contact_name: fContactName.value.trim(), contact_email: fContactEmail.value.trim(),
      };
      if (editingId) {
        await apiPatch(`/api/clients/${editingId}`, body);
      } else {
        body.password = fPassword.value;
        await apiPost('/api/clients', body);
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
