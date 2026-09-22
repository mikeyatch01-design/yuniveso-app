(async function () {
  const user = await requireSession(['admin', 'auditor']);
  if (!user) return;

  const isAdmin = user.role === 'admin';
  document.querySelectorAll('[data-admin-only]').forEach(el => { if (!isAdmin) el.style.display = 'none'; });
  document.querySelectorAll('[data-auditor-only]').forEach(el => { if (isAdmin) el.style.display = 'none'; });
  document.getElementById('roleLabel').textContent = isAdmin ? 'Admin' : 'Auditor';
  document.getElementById('tasksNavLabel').textContent = isAdmin ? 'Tasks' : 'My Tasks';
  document.getElementById('breadcrumbLabel').textContent = isAdmin ? 'Tasks' : 'My Tasks';
  document.getElementById('pageTitle').textContent = isAdmin ? 'Tasks' : 'My Tasks';

  const tbody = document.getElementById('tasksTableBody');
  const modalOverlay = document.getElementById('taskModalOverlay');
  const form = document.getElementById('taskForm');
  const errEl = document.getElementById('taskFormError');
  const submitBtn = document.getElementById('taskSubmitBtn');
  const fTitle = document.getElementById('fTaskTitle');
  const fAudit = document.getElementById('fTaskAudit');
  const fAssignee = document.getElementById('fTaskAssignee');
  const fDue = document.getElementById('fTaskDue');

  const STATUS_CLASS = { Open: 'badge-muted', Overdue: 'badge-critical', Done: 'badge-success' };

  async function load() {
    const { tasks } = await apiGet('/api/tasks');
    document.getElementById('pageSub').textContent = isAdmin
      ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} across your firm`
      : `${tasks.filter(t => t.status !== 'Done').length} open task${tasks.length === 1 ? '' : 's'} assigned to you`;

    tbody.innerHTML = tasks.length ? tasks.map(t => `
      <tr>
        <td><b>${escapeHtml(t.title)}</b></td>
        <td>${t.audit_title ? escapeHtml(t.audit_title) : '<span class="cell-sub">—</span>'}</td>
        <td>${t.assigned_name ? avatarSm(t.assigned_name) + ' ' + escapeHtml(t.assigned_name) : '<span class="cell-sub">Unassigned</span>'}</td>
        <td>${formatDate(t.due_date)}</td>
        <td>${badge(t.status, STATUS_CLASS[t.status] || 'badge-muted')}</td>
        <td class="row-actions">
          ${t.status !== 'Done' ? `<button type="button" class="row-icon-btn done-task-btn" data-id="${t.id}" title="Mark done">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6 9 17l-5-5"/></svg>
          </button>` : ''}
          ${isAdmin ? `<button type="button" class="row-icon-btn danger delete-task-btn" data-id="${t.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>
          </button>` : ''}
        </td>
      </tr>
    `).join('') : `<tr><td colspan="6" class="cell-sub">No tasks yet.</td></tr>`;
  }

  tbody.addEventListener('click', async (e) => {
    const doneBtn = e.target.closest('.done-task-btn');
    if (doneBtn) {
      doneBtn.disabled = true;
      try { await apiPatch(`/api/tasks/${doneBtn.dataset.id}`, { status: 'Done' }); load(); }
      catch (err) { alert(err.message); doneBtn.disabled = false; }
      return;
    }
    const delBtn = e.target.closest('.delete-task-btn');
    if (delBtn) {
      if (!confirm('Delete this task?')) return;
      delBtn.disabled = true;
      try { await apiDelete(`/api/tasks/${delBtn.dataset.id}`); load(); }
      catch (err) { alert(err.message); delBtn.disabled = false; }
    }
  });

  if (isAdmin) {
    const addBtn = document.getElementById('addTaskBtn');
    addBtn.addEventListener('click', async () => {
      const [{ audits }, { users }] = await Promise.all([apiGet('/api/audits'), apiGet('/api/users?role=auditor')]);
      fAudit.innerHTML = '<option value="">— None —</option>' + audits.map(a => `<option value="${a.id}">${escapeHtml(a.title)} (${escapeHtml(a.client_name)})</option>`).join('');
      fAssignee.innerHTML = '<option value="">— Unassigned —</option>' + users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
      fTitle.value = ''; fDue.value = '';
      errEl.style.display = 'none';
      modalOverlay.classList.add('show');
    });
    document.getElementById('taskModalClose').addEventListener('click', () => modalOverlay.classList.remove('show'));
    document.getElementById('taskModalCancel').addEventListener('click', () => modalOverlay.classList.remove('show'));
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('show'); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';
      submitBtn.disabled = true;
      try {
        await apiPost('/api/tasks', {
          title: fTitle.value.trim(),
          audit_id: fAudit.value || null,
          assigned_to: fAssignee.value || null,
          due_date: fDue.value || null,
        });
        modalOverlay.classList.remove('show');
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
