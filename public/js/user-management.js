(async function () {
  const user = await requireSession(['super_admin']);
  if (!user) return;

  const urlRole = new URLSearchParams(window.location.search).get('role') || '';
  const roleFilter = document.getElementById('roleFilter');
  roleFilter.value = urlRole;

  const tbody = document.getElementById('usersTableBody');
  const modalOverlay = document.getElementById('userModalOverlay');
  const modalTitle = document.getElementById('userModalTitle');
  const form = document.getElementById('userForm');
  const errEl = document.getElementById('userFormError');
  const submitBtn = document.getElementById('userSubmitBtn');
  const passwordLabel = document.getElementById('fUserPasswordLabel');

  const fOrg = document.getElementById('fUserOrg');
  const fName = document.getElementById('fUserName');
  const fRole = document.getElementById('fUserRole');
  const fTitle = document.getElementById('fUserTitle');
  const fEmail = document.getElementById('fUserEmail');
  const fPassword = document.getElementById('fUserPassword');

  let editingId = null;
  let orgs = [];

  async function loadOrgs() {
    const { organizations } = await apiGet('/api/organizations');
    orgs = organizations;
    fOrg.innerHTML = organizations.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  }

  async function load() {
    const role = roleFilter.value;
    document.getElementById('pageSub').textContent = role ? `Showing ${role}s across every organization` : 'Every staff account across the platform';
    const { users } = await apiGet(`/api/users${role ? '?role=' + role : ''}`);
    tbody.innerHTML = users.length ? users.map(u => `
      <tr>
        <td style="display:flex;align-items:center;gap:8px;">${avatarSm(u.name)}<b>${escapeHtml(u.name)}</b></td>
        <td>${escapeHtml(u.org_name || '—')}</td>
        <td>${badge(u.role, u.role === 'admin' ? 'badge-info' : 'badge-muted')}</td>
        <td>${escapeHtml(u.email)}</td>
        <td class="row-actions">
          <button type="button" class="row-icon-btn edit-user-btn" data-id="${u.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.85 0 0 1 4 4L7 21l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" class="row-icon-btn danger delete-user-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>
          </button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="5" class="cell-sub">No users found.</td></tr>`;
    return users;
  }

  function openModal(u) {
    editingId = u ? u.id : null;
    modalTitle.textContent = u ? 'Edit User' : 'Add User';
    fOrg.value = u ? u.org_id : (orgs[0] ? orgs[0].id : '');
    fName.value = u ? u.name : '';
    fRole.value = u ? u.role : (roleFilter.value || 'admin');
    fTitle.value = u ? u.title : '';
    fEmail.value = u ? u.email : '';
    fPassword.value = '';
    passwordLabel.firstChild.textContent = u ? 'New password (leave blank to keep current)' : 'Password';
    errEl.style.display = 'none';
    modalOverlay.classList.add('show');
  }
  function closeModal() { modalOverlay.classList.remove('show'); }

  document.getElementById('addUserBtn').addEventListener('click', () => openModal(null));
  document.getElementById('userModalClose').addEventListener('click', closeModal);
  document.getElementById('userModalCancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  roleFilter.addEventListener('change', load);

  tbody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-user-btn');
    if (editBtn) {
      const { users } = await apiGet('/api/users');
      const u = users.find(x => x.id === Number(editBtn.dataset.id));
      if (u) openModal(u);
      return;
    }
    const delBtn = e.target.closest('.delete-user-btn');
    if (delBtn) {
      if (!confirm(`Remove ${delBtn.dataset.name}'s account? This can't be undone.`)) return;
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
        const body = { org_id: Number(fOrg.value), role: fRole.value, name: fName.value.trim(), title: fTitle.value.trim(), email: fEmail.value.trim() };
        if (fPassword.value) body.password = fPassword.value;
        await apiPatch(`/api/users/${editingId}`, body);
      } else {
        await apiPost('/api/users', {
          org_id: Number(fOrg.value), role: fRole.value, name: fName.value.trim(),
          title: fTitle.value.trim(), email: fEmail.value.trim(), password: fPassword.value,
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

  await loadOrgs();
  await load();
})();
