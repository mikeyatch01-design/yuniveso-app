(async function () {
  const user = await requireSession(['admin']);
  if (!user) return;

  const tbody = document.getElementById('employeesTableBody');
  const modalOverlay = document.getElementById('empModalOverlay');
  const modalTitle = document.getElementById('empModalTitle');
  const form = document.getElementById('empForm');
  const errEl = document.getElementById('empFormError');
  const submitBtn = document.getElementById('empSubmitBtn');
  const passwordLabel = document.getElementById('fEmpPasswordLabel');

  const fName = document.getElementById('fEmpName');
  const fTitle = document.getElementById('fEmpTitle');
  const fEmail = document.getElementById('fEmpEmail');
  const fPassword = document.getElementById('fEmpPassword');

  let editingId = null;

  async function load() {
    const [{ users }, { audits }] = await Promise.all([apiGet('/api/users?role=auditor'), apiGet('/api/audits')]);
    const counts = {};
    audits.forEach(a => { if (a.lead_auditor_id) counts[a.lead_auditor_id] = (counts[a.lead_auditor_id] || 0) + 1; });

    tbody.innerHTML = users.length ? users.map(u => `
      <tr>
        <td style="display:flex;align-items:center;gap:8px;">${avatarSm(u.name)}<b>${escapeHtml(u.name)}</b></td>
        <td>${escapeHtml(u.title || '—')}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${counts[u.id] || 0}</td>
        <td class="row-actions">
          <button type="button" class="row-icon-btn edit-emp-btn" data-id="${u.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.85 0 0 1 4 4L7 21l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" class="row-icon-btn danger delete-emp-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>
          </button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="5" class="cell-sub">No employees yet.</td></tr>`;
  }

  function openModal(u) {
    editingId = u ? u.id : null;
    modalTitle.textContent = u ? 'Edit Employee' : 'Add Employee';
    fName.value = u ? u.name : '';
    fTitle.value = u ? u.title : '';
    fEmail.value = u ? u.email : '';
    fPassword.value = '';
    passwordLabel.firstChild.textContent = u ? 'New password (leave blank to keep current)' : 'Password';
    errEl.style.display = 'none';
    modalOverlay.classList.add('show');
  }
  function closeModal() { modalOverlay.classList.remove('show'); }

  document.getElementById('addEmployeeBtn').addEventListener('click', () => openModal(null));
  document.getElementById('empModalClose').addEventListener('click', closeModal);
  document.getElementById('empModalCancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  tbody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-emp-btn');
    if (editBtn) {
      const { users } = await apiGet('/api/users?role=auditor');
      const u = users.find(x => x.id === Number(editBtn.dataset.id));
      if (u) openModal(u);
      return;
    }
    const delBtn = e.target.closest('.delete-emp-btn');
    if (delBtn) {
      if (!confirm(`Remove ${delBtn.dataset.name}? They'll be unassigned from any audits.`)) return;
      delBtn.disabled = true;
      try {
        await apiDelete(`/api/users/${delBtn.dataset.id}`);
        load();
      } catch (err) {
        alert('Could not remove: ' + err.message);
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
        const body = { name: fName.value.trim(), title: fTitle.value.trim(), email: fEmail.value.trim() };
        if (fPassword.value) body.password = fPassword.value;
        await apiPatch(`/api/users/${editingId}`, body);
      } else {
        await apiPost('/api/users', {
          role: 'auditor', name: fName.value.trim(), title: fTitle.value.trim(),
          email: fEmail.value.trim(), password: fPassword.value,
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
