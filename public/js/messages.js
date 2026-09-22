(async function () {
  const user = await requireSession(['admin', 'auditor', 'super_admin']);
  if (!user) return;

  document.querySelectorAll('[data-admin-only]').forEach(el => { if (user.role === 'auditor') el.style.display = 'none'; });
  document.querySelectorAll('[data-auditor-only]').forEach(el => { if (user.role !== 'auditor') el.style.display = 'none'; });
  document.getElementById('roleLabel').textContent = user.role === 'auditor' ? 'Auditor' : (user.role === 'super_admin' ? 'Super Admin' : 'Admin');
  document.getElementById('tasksNavLabel').textContent = user.role === 'auditor' ? 'My Tasks' : 'Tasks';

  const threadsList = document.getElementById('threadsList');
  const threadHeader = document.getElementById('threadHeader');
  const messagesList = document.getElementById('messagesList');
  const form = document.getElementById('messageForm');
  const input = document.getElementById('fMessageBody');
  let activeClientId = null;
  let activeClientName = '';

  function bubble(m) {
    const fromClient = m.sender_role === 'client';
    return `
      <div style="display:flex;flex-direction:column;align-items:${fromClient ? 'flex-start' : 'flex-end'};">
        <div style="max-width:65%;background:${fromClient ? 'var(--muted-bg)' : 'var(--blue)'};color:${fromClient ? 'var(--text)' : '#fff'};border-radius:12px;padding:10px 14px;font-size:13.5px;">
          ${escapeHtml(m.body)}
        </div>
        <div class="cell-sub" style="margin-top:3px;">${escapeHtml(m.sender_name)} · ${formatDate(m.created_at.slice(0, 10))}</div>
      </div>
    `;
  }

  async function loadThreads() {
    const { threads } = await apiGet('/api/messages/threads');
    threadsList.innerHTML = threads.length ? threads.map(t => `
      <button type="button" class="thread-item" data-id="${t.client_id}" data-name="${escapeHtml(t.client_name)}"
        style="display:block;width:100%;text-align:left;padding:14px 18px;border:none;background:${t.client_id === activeClientId ? 'var(--bg)' : 'transparent'};border-bottom:1px solid var(--border);cursor:pointer;font-family:inherit;">
        <div style="font-size:13.5px;font-weight:700;">${escapeHtml(t.client_name)}</div>
        <div class="cell-sub" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.last_body ? escapeHtml(t.last_body) : 'No messages yet'}</div>
      </button>
    `).join('') : `<div class="cell-sub" style="padding:20px;">No clients yet.</div>`;
  }

  async function openThread(clientId, clientName) {
    activeClientId = clientId;
    activeClientName = clientName;
    threadHeader.textContent = clientName;
    form.style.display = 'flex';
    messagesList.innerHTML = `<div class="cell-sub">Loading…</div>`;
    const { messages } = await apiGet(`/api/messages?client_id=${clientId}`);
    messagesList.innerHTML = messages.length ? messages.map(bubble).join('') : `<div class="cell-sub">No messages yet.</div>`;
    messagesList.scrollTop = messagesList.scrollHeight;
    loadThreads();
  }

  threadsList.addEventListener('click', (e) => {
    const item = e.target.closest('.thread-item');
    if (item) openThread(Number(item.dataset.id), item.dataset.name);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body || !activeClientId) return;
    input.disabled = true;
    try {
      await apiPost('/api/messages', { client_id: activeClientId, body });
      input.value = '';
      await openThread(activeClientId, activeClientName);
    } catch (err) {
      alert('Could not send: ' + err.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  loadThreads();
})();
