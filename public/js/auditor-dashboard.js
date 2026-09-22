(async function () {
  const user = await requireSession(['auditor']);
  if (!user) return;

  document.getElementById('greeting').textContent = `Your engagements, ${user.name.split(' ')[0]}`;

  try {
    const { kpis, audits } = await apiGet('/api/dashboard');

    document.getElementById('kpiAssigned').textContent = kpis.assigned_audits;
    document.getElementById('kpiFindings').textContent = kpis.findings_logged;
    document.getElementById('greetingSub').textContent =
      `${kpis.assigned_audits} audit${kpis.assigned_audits === 1 ? '' : 's'} assigned`;

    const tbody = document.getElementById('auditsTableBody');
    tbody.innerHTML = audits.length ? audits.map(a => `
      <tr>
        <td><a href="audit-details.html?id=${a.id}"><b>${escapeHtml(a.title)}</b></a></td>
        <td>${escapeHtml(a.client_name)}</td>
        <td>${escapeHtml(a.phase)}</td>
        <td>${formatDate(a.target_date)}</td>
        <td>${statusBadge(a.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="5" class="cell-sub">No audits assigned yet.</td></tr>`;
    wireTableSearch('searchInput', 'auditsTableBody');

    const timeModal = document.getElementById('timeModalOverlay');
    const timeForm = document.getElementById('timeForm');
    const timeErr = document.getElementById('timeFormError');
    const fTimeAudit = document.getElementById('fTimeAudit');
    document.getElementById('logTimeBtn').addEventListener('click', () => {
      fTimeAudit.innerHTML = audits.map(a => `<option value="${a.id}">${escapeHtml(a.title)} (${escapeHtml(a.client_name)})</option>`).join('');
      timeForm.reset();
      document.getElementById('fTimeDate').value = new Date().toISOString().slice(0, 10);
      timeErr.style.display = 'none';
      timeModal.classList.add('show');
    });
    document.getElementById('timeModalClose').addEventListener('click', () => timeModal.classList.remove('show'));
    document.getElementById('timeModalCancel').addEventListener('click', () => timeModal.classList.remove('show'));
    timeModal.addEventListener('click', (e) => { if (e.target === timeModal) timeModal.classList.remove('show'); });
    timeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      timeErr.style.display = 'none';
      const submitBtn = document.getElementById('timeSubmitBtn');
      submitBtn.disabled = true;
      try {
        await apiPost('/api/time-entries', {
          audit_id: Number(fTimeAudit.value),
          entry_date: document.getElementById('fTimeDate').value,
          hours: Number(document.getElementById('fTimeHours').value),
          notes: document.getElementById('fTimeNotes').value.trim(),
        });
        timeModal.classList.remove('show');
      } catch (err) {
        timeErr.textContent = err.message;
        timeErr.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
      }
    });
  } catch (err) {
    console.error(err);
  }
})();
