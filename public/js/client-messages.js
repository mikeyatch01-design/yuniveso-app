(async function () {
  const user = await requireSession(['client']);
  if (!user) return;

  const list = document.getElementById('messagesList');
  const form = document.getElementById('messageForm');
  const input = document.getElementById('fMessageBody');

  function bubble(m) {
    const mine = m.sender_role === 'client';
    return `
      <div style="display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'};">
        <div style="max-width:65%;background:${mine ? 'var(--blue)' : 'var(--muted-bg)'};color:${mine ? '#fff' : 'var(--text)'};border-radius:12px;padding:10px 14px;font-size:13.5px;">
          ${escapeHtml(m.body)}
        </div>
        <div class="cell-sub" style="margin-top:3px;">${escapeHtml(m.sender_name)} · ${formatDate(m.created_at.slice(0, 10))}</div>
      </div>
    `;
  }

  async function load() {
    const { messages } = await apiGet('/api/messages');
    list.innerHTML = messages.length ? messages.map(bubble).join('') : `<div class="cell-sub">No messages yet — say hello to your audit team.</div>`;
    list.scrollTop = list.scrollHeight;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.disabled = true;
    try {
      await apiPost('/api/messages', { body });
      input.value = '';
      await load();
    } catch (err) {
      alert('Could not send: ' + err.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  load();
})();
