(function () {
  'use strict';

  const FM = window.FieldMaps;

  // ---------- small helpers ----------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function el(id) { return document.getElementById(id); }

  function badge(text, tone) {
    if (!text) return '<span class="na">\u2014</span>';
    return `<span class="badge badge-${tone || 'neutral'}">${escapeHtml(text)}</span>`;
  }

  // ---------- tabs ----------
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      el('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'analytics' && !analyticsLoaded) {
        loadAnalytics();
      }
      if (btn.dataset.tab === 'traffic' && !trafficLoaded) {
        loadTraffic();
      }
      if (btn.dataset.tab === 'sessions' && !sessionsLoaded) {
        loadLlmSettings();
        loadSessions();
      }
    });
  });

  // ---------- state ----------
  let state = {
    page: 1,
    pageSize: 25,
    sortField: 'serverReceivedAt',
    sortDir: 'desc',
    filters: {},
  };
  let analyticsLoaded = false;
  let trafficLoaded = false;
  let sessionsLoaded = false;
  let sessionsState = { page: 1, pageSize: 25, filters: {} };
  const charts = {};

  const KNOWN_CATEGORIES = new Set();
  const KNOWN_SEVERITIES = new Set();
  const KNOWN_WOULD_USE = new Set();
  const KNOWN_WOULD_PAY = new Set();

  function buildQuery(extra) {
    const params = new URLSearchParams();
    params.set('page', state.page);
    params.set('pageSize', state.pageSize);
    params.set('sortField', state.sortField);
    params.set('sortDir', state.sortDir);
    Object.entries(state.filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    }
    return params.toString();
  }

  function updateExportLink() {
    el('export-btn').href = '/admin/api/export.csv?' + buildQuery();
  }

  // ---------- table ----------
  async function loadSubmissions() {
    const tbody = el('submissions-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading-row">Loading\u2026</td></tr>';

    try {
      const res = await fetch('/admin/api/submissions?' + buildQuery());
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();

      if (!data.items.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No submissions match these filters.</td></tr>';
      } else {
        tbody.innerHTML = data.items
          .map((item) => {
            item.category && KNOWN_CATEGORIES.add(item.category);
            item.severity && KNOWN_SEVERITIES.add(item.severity);
            item.wouldUse && KNOWN_WOULD_USE.add(item.wouldUse);
            item.wouldPay && KNOWN_WOULD_PAY.add(item.wouldPay);

            const categoryText = FM.decodeShort('category', item.category);
            const severityText = FM.decodeShort('severity', item.severity);
            const wouldUseText = FM.decodeShort('wouldUse', item.wouldUse);
            const wouldPayText = FM.decodeShort('wouldPay', item.wouldPay);

            return `<tr data-id="${escapeHtml(item._id)}">
              <td>${escapeHtml(fmtDate(item.serverReceivedAt))}</td>
              <td>${escapeHtml(item.name || 'Anonymous')}</td>
              <td>${item.email ? escapeHtml(item.email) : '<span class="na">\u2014</span>'}</td>
              <td>${categoryText ? escapeHtml(categoryText) : '<span class="na">\u2014</span>'}</td>
              <td>${badge(severityText, FM.tone('severity', item.severity))}</td>
              <td>${item.rating !== undefined && item.rating !== null ? `<span class="rating-pip">${escapeHtml(item.rating)}/5</span>` : '<span class="na">\u2014</span>'}</td>
              <td>${badge(wouldUseText, FM.tone('wouldUse', item.wouldUse))}</td>
              <td>${badge(wouldPayText, FM.tone('wouldPay', item.wouldPay))}</td>
              <td class="mono-cell">${escapeHtml(item.referenceCode)}</td>
            </tr>`;
          })
          .join('');

        tbody.querySelectorAll('tr[data-id]').forEach((row) => {
          row.addEventListener('click', () => openDetail(row.dataset.id));
        });

        refreshFilterOptions();
      }

      el('page-info').textContent = `Page ${data.page} of ${data.totalPages} (${data.total} total)`;
      el('prev-page').disabled = data.page <= 1;
      el('next-page').disabled = data.page >= data.totalPages;
      updateExportLink();
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Failed to load submissions.</td></tr>';
      console.error(err);
    }
  }

  function refreshFilterOptions() {
    fillSelectOnce('f-category', KNOWN_CATEGORIES, 'category');
    fillSelectOnce('f-severity', KNOWN_SEVERITIES, 'severity');
    fillSelectOnce('f-wouldUse', KNOWN_WOULD_USE, 'wouldUse');
    fillSelectOnce('f-wouldPay', KNOWN_WOULD_PAY, 'wouldPay');
  }

  function fillSelectOnce(selectId, valuesSet, fieldName) {
    const select = el(selectId);
    const existing = new Set(Array.from(select.options).map((o) => o.value));
    valuesSet.forEach((v) => {
      if (!existing.has(v)) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = (fieldName && FM.decodeShort(fieldName, v)) || v;
        select.appendChild(opt);
      }
    });
  }

  // ---------- detail modal ----------

  function sectionHtml(title, rowsHtml) {
    if (!rowsHtml) return '';
    return `<div class="detail-section">
      <h3 class="detail-section-title">${escapeHtml(title)}</h3>
      <div class="detail-grid">${rowsHtml}</div>
    </div>`;
  }

  function row(label, valueHtml, opts) {
    if (valueHtml === null || valueHtml === undefined || valueHtml === '') return '';
    const wide = opts && opts.wide ? ' detail-row-wide' : '';
    return `<div class="detail-row${wide}">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${valueHtml}</div>
    </div>`;
  }

  function textValue(v) {
    if (v === null || v === undefined || v === '') return null;
    return `<span>${escapeHtml(v)}</span>`;
  }

  function proseValue(v) {
    if (v === null || v === undefined || v === '') return null;
    return `<p class="prose">${escapeHtml(v)}</p>`;
  }

  function decodedValue(field, raw, extraOtherText) {
    const decoded = FM.decode(field, raw);
    if (decoded === null) return null;
    const otherNote = extraOtherText ? ` <span class="detail-subtle">\u2014 "${escapeHtml(extraOtherText)}"</span>` : '';
    return `<span>${escapeHtml(decoded)}${otherNote}</span>`;
  }

  function chipsValue(field, values) {
    if (!Array.isArray(values) || !values.length) return null;
    const decoded = FM.decodeList(field, values);
    return `<div class="chip-row">${decoded.map((d) => `<span class="chip">${escapeHtml(d)}</span>`).join('')}</div>`;
  }

  function boolValue(v, trueLabel, falseLabel) {
    if (v === undefined || v === null) return null;
    return v
      ? `<span class="badge badge-good">${escapeHtml(trueLabel || 'Yes')}</span>`
      : `<span class="badge badge-neutral">${escapeHtml(falseLabel || 'No')}</span>`;
  }

  function ratingValue(v) {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    const pct = Math.max(0, Math.min(100, (n / 5) * 100));
    return `<div class="rating-bar-wrap">
      <div class="rating-bar"><div class="rating-bar-fill" style="width:${pct}%"></div></div>
      <span class="rating-bar-label">${escapeHtml(v)} / 5</span>
    </div>`;
  }

  function metaValue(v) {
    if (v === null || v === undefined || v === '') return null;
    return `<span class="detail-subtle">${escapeHtml(v)}</span>`;
  }

  async function openDetail(id) {
    const modal = el('detail-modal');
    const body = el('modal-body');
    body.innerHTML = '<div class="modal-loading">Loading\u2026</div>';
    modal.classList.remove('hidden');

    try {
      const res = await fetch(`/admin/api/submissions/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('not found');
      const item = await res.json();

      const extra = item.extraFields && typeof item.extraFields === 'object' ? item.extraFields : {};

      const header = `
        <div class="detail-header">
          <div>
            <div class="detail-header-name">${escapeHtml(item.name || 'Anonymous respondent')}</div>
            <div class="detail-header-sub">
              ${item.email ? escapeHtml(item.email) + ' \u00b7 ' : ''}${escapeHtml(fmtDate(item.serverReceivedAt))}
            </div>
          </div>
          <span class="ref-code-pill">${escapeHtml(item.referenceCode)}</span>
        </div>`;

      const respondentRows = [
        row(FM.label('ageGroup'), decodedValue('ageGroup', item.ageGroup)),
        row(FM.label('role'), decodedValue('role', item.role, extra.roleOther)),
      ].join('');

      const problemRows = [
        row(FM.label('category'), decodedValue('category', item.category, extra.categoryOther)),
        row(FM.label('problemDescription'), proseValue(item.problemDescription), { wide: true }),
        row(FM.label('severity'), badge(FM.decode('severity', item.severity), FM.tone('severity', item.severity))),
        row(FM.label('frequency'), decodedValue('frequency', item.frequency)),
        row(FM.label('timeCost'), decodedValue('timeCost', item.timeCost)),
        row(FM.label('currentSolution'), decodedValue('currentSolution', item.currentSolution)),
        row(FM.label('rating'), ratingValue(item.rating)),
        row(FM.label('whyStopped'), decodedValue('whyStopped', item.whyStopped)),
        row(FM.label('triedAlternatives'), proseValue(item.triedAlternatives), { wide: true }),
        row(FM.label('frustrationTags'), chipsValue('frustrationTags', item.frustrationTags), { wide: true }),
        row(FM.label('frustrationText'), proseValue(item.frustrationText), { wide: true }),
      ].join('');

      const idealRows = [
        row(FM.label('idealDescription'), proseValue(item.idealDescription), { wide: true }),
        row(FM.label('mustHave'), textValue(item.mustHave)),
        row(FM.label('platformPref'), decodedValue('platformPref', item.platformPref)),
        row(FM.label('featurePriorities'), chipsValue('featurePriorities', item.featurePriorities), { wide: true }),
      ].join('');

      const buyingRows = [
        row(FM.label('wouldUse'), badge(FM.decode('wouldUse', item.wouldUse), FM.tone('wouldUse', item.wouldUse))),
        row(FM.label('wouldPay'), badge(FM.decode('wouldPay', item.wouldPay), FM.tone('wouldPay', item.wouldPay))),
        row(FM.label('priceRange'), decodedValue('priceRange', item.priceRange)),
        row(FM.label('urgency'), decodedValue('urgency', item.urgency)),
      ].join('');

      const contactRows = [
        row(FM.label('consent'), boolValue(item.consent, 'Consented', 'Not given')),
        row(FM.label('openToContact'), boolValue(item.openToContact, 'Open to contact', 'Not opted in')),
        row(FM.label('betaInterest'), boolValue(item.betaInterest, 'Wants beta access', 'Not interested')),
        row(FM.label('contactMethod'), decodedValue('contactMethod', item.contactMethod)),
        row(FM.label('contactValue'), textValue(item.contactValue)),
        row(FM.label('bestTime'), textValue(item.bestTime)),
      ].join('');

      const extraEntries = Object.entries(extra).filter(([k]) => k !== 'roleOther' && k !== 'categoryOther');
      const extraRows = extraEntries
        .map(([k, v]) => row(humanizeUnknownKey(k), textValue(Array.isArray(v) ? v.join(', ') : v)))
        .join('');

      const metaRows = [
        row(FM.label('clientSubmittedAt'), metaValue(item.clientSubmittedAt)),
        row(FM.label('serverReceivedAt'), metaValue(fmtDate(item.serverReceivedAt))),
        row(FM.label('browser'), metaValue(item.parsedUA && item.parsedUA.browser)),
        row(FM.label('os'), metaValue(item.parsedUA && item.parsedUA.os)),
        row(FM.label('device'), metaValue(item.parsedUA && item.parsedUA.device)),
        row(FM.label('ip'), metaValue(item.ip)),
      ].join('');

      body.innerHTML = header
        + sectionHtml('Respondent', respondentRows)
        + sectionHtml('The problem', problemRows)
        + sectionHtml('Their ideal solution', idealRows)
        + sectionHtml('Buying signal', buyingRows)
        + sectionHtml('Consent & follow-up', contactRows)
        + sectionHtml('Other answers on the form', extraRows)
        + sectionHtml('Submission metadata', metaRows)
        + rawJsonToggle(item);
    } catch (err) {
      body.innerHTML = '<div class="modal-loading">Failed to load submission detail.</div>';
      console.error(err);
    }
  }

  function humanizeUnknownKey(key) {
    const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function rawJsonToggle(item) {
    const pretty = escapeHtml(JSON.stringify(item.rawJson !== undefined ? item.rawJson : item, null, 2));
    return `<details class="raw-json-details">
      <summary>Raw submitted JSON (for debugging)</summary>
      <pre class="raw-json">${pretty}</pre>
    </details>`;
  }

  el('modal-close').addEventListener('click', () => el('detail-modal').classList.add('hidden'));
  el('detail-modal').addEventListener('click', (e) => {
    if (e.target === el('detail-modal')) el('detail-modal').classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el('detail-modal').classList.add('hidden');
  });

  // ---------- filters ----------
  el('f-apply').addEventListener('click', () => {
    state.filters = {
      q: el('f-search').value.trim(),
      category: el('f-category').value,
      severity: el('f-severity').value,
      wouldUse: el('f-wouldUse').value,
      wouldPay: el('f-wouldPay').value,
      dateFrom: el('f-dateFrom').value,
      dateTo: el('f-dateTo').value,
    };
    state.page = 1;
    loadSubmissions();
  });

  el('f-clear').addEventListener('click', () => {
    ['f-search', 'f-dateFrom', 'f-dateTo'].forEach((id) => (el(id).value = ''));
    ['f-category', 'f-severity', 'f-wouldUse', 'f-wouldPay'].forEach((id) => (el(id).value = ''));
    state.filters = {};
    state.page = 1;
    loadSubmissions();
  });

  // ---------- sorting ----------
  document.querySelectorAll('#submissions-table thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      document.querySelectorAll('#submissions-table thead th[data-sort]').forEach((t) => t.classList.remove('sort-asc', 'sort-desc'));
      if (state.sortField === field) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = field;
        state.sortDir = 'desc';
      }
      th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      loadSubmissions();
    });
  });

  // ---------- pagination ----------
  el('prev-page').addEventListener('click', () => {
    if (state.page > 1) { state.page -= 1; loadSubmissions(); }
  });
  el('next-page').addEventListener('click', () => {
    state.page += 1; loadSubmissions();
  });
  el('page-size').addEventListener('change', (e) => {
    state.pageSize = parseInt(e.target.value, 10);
    state.page = 1;
    loadSubmissions();
  });

  // ---------- analytics ----------
  async function loadAnalytics() {
    try {
      const res = await fetch('/admin/api/analytics');
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      analyticsLoaded = true;

      el('stat-cards').innerHTML = `
        <div class="stat-card"><div class="value">${data.totalCount}</div><div class="label">Total submissions</div></div>
        <div class="stat-card"><div class="value">${data.avgRating !== null ? data.avgRating : 'N/A'}</div><div class="label">Avg current-solution rating (n=${data.avgRatingSampleSize})</div></div>
        <div class="stat-card"><div class="value">${data.contactOptInPct}%</div><div class="label">Opted into contact (${data.contactOptInCount})</div></div>
        <div class="stat-card"><div class="value">${data.betaOptInPct}%</div><div class="label">Beta interest (${data.betaOptInCount})</div></div>
      `;

      renderLineChart('chart-byDay', data.byDay.map((d) => d.date), data.byDay.map((d) => d.count));
      renderBarChart('chart-byCategory', decorateEntries('category', data.byCategory));
      renderBarChart('chart-bySeverity', decorateEntries('severity', data.bySeverity));
      renderBarChart('chart-byFrequency', decorateEntries('frequency', data.byFrequency));
      renderBarChart('chart-frustrationTags', decorateEntries('frustrationTags', data.topFrustrationTags));
      renderBarChart('chart-featurePriorities', decorateEntries('featurePriorities', data.topFeaturePriorities));
      renderBarChart('chart-wouldUse', decorateEntries('wouldUse', data.wouldUseFunnel));
      renderBarChart('chart-wouldPay', decorateEntries('wouldPay', data.wouldPayFunnel));
      renderBarChart('chart-priceRange', decorateEntries('priceRange', data.priceRangeBreakdown));
    } catch (err) {
      el('stat-cards').innerHTML = '<div class="stat-card">Failed to load analytics.</div>';
      console.error(err);
    }
  }

  async function loadTraffic() {
    try {
      const res = await fetch('/admin/api/traffic');
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      trafficLoaded = true;

      el('traffic-stat-cards').innerHTML = `
        <div class="stat-card"><div class="value">${data.totalPageViews}</div><div class="label">Total page views</div></div>
        <div class="stat-card"><div class="value">${data.uniqueIpCount}</div><div class="label">Unique IP addresses</div></div>
        <div class="stat-card"><div class="value">${data.totalSubmissions}</div><div class="label">Total submissions</div></div>
        <div class="stat-card"><div class="value">${data.conversionRatePct}%</div><div class="label">View → submission rate</div></div>
      `;

      renderLineChart('chart-viewsByDay', data.viewsByDay.map((d) => d.date), data.viewsByDay.map((d) => d.count));

      const tbody = el('traffic-tbody');
      if (!data.topIps.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No page views recorded yet.</td></tr>';
      } else {
        tbody.innerHTML = data.topIps
          .map((row) => `<tr>
            <td class="mono-cell">${escapeHtml(row.ip)}</td>
            <td>${escapeHtml(row.views)}</td>
            <td>${row.submissions ? badge(row.submissions + (row.submissions === 1 ? ' submission' : ' submissions'), 'good') : '<span class="na">\u2014</span>'}</td>
            <td class="detail-subtle">${escapeHtml(row.browser)} \u00b7 ${escapeHtml(row.os)}</td>
            <td>${escapeHtml(fmtDate(row.firstSeen))}</td>
            <td>${escapeHtml(fmtDate(row.lastSeen))}</td>
          </tr>`)
          .join('');
      }
    } catch (err) {
      el('traffic-stat-cards').innerHTML = '<div class="stat-card">Failed to load traffic data.</div>';
      el('traffic-tbody').innerHTML = '<tr><td colspan="6" class="empty-row">Failed to load.</td></tr>';
      console.error(err);
    }
  }

  // Swap raw codes for human labels on chart axes, leaving "unspecified" alone.
  function decorateEntries(field, entries) {
    return entries.map((e) => ({
      label: e.label === 'unspecified' ? 'Unspecified' : (FM.decodeShort(field, e.label) || e.label),
      count: e.count,
    }));
  }

  function chartColors() {
    return {
      cyan: '#ff6a3d',
      grid: 'rgba(237,232,214,0.06)',
      text: '#93998d',
    };
  }

  function destroyIfExists(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function renderLineChart(canvasId, labels, values) {
    destroyIfExists(canvasId);
    const c = chartColors();
    charts[canvasId] = new Chart(el(canvasId), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: c.cyan,
          backgroundColor: 'rgba(255,106,61,0.15)',
          tension: 0.25,
          fill: true,
          pointRadius: 2,
        }],
      },
      options: baseChartOptions(c),
    });
  }

  function renderBarChart(canvasId, entries) {
    destroyIfExists(canvasId);
    const c = chartColors();
    charts[canvasId] = new Chart(el(canvasId), {
      type: 'bar',
      data: {
        labels: entries.map((e) => e.label),
        datasets: [{
          data: entries.map((e) => e.count),
          backgroundColor: c.cyan,
          borderRadius: 4,
        }],
      },
      options: baseChartOptions(c),
    });
  }

  function baseChartOptions(c) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid } },
        y: { ticks: { color: c.text, font: { size: 10 } }, grid: { color: c.grid }, beginAtZero: true },
      },
    };
  }

  // ---------- sessions & replay ----------
  async function loadSessions() {
    const tbody = el('sessions-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading-row">Loading\u2026</td></tr>';
    try {
      const params = new URLSearchParams();
      params.set('page', sessionsState.page);
      params.set('pageSize', sessionsState.pageSize);
      Object.entries(sessionsState.filters).forEach(([k, v]) => { if (v) params.set(k, v); });

      const res = await fetch(`/admin/api/sessions?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      sessionsLoaded = true;

      el('s-page-info').textContent = `Page ${data.page} of ${data.totalPages} (${data.total} sessions)`;

      if (!data.items.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No sessions recorded yet.</td></tr>';
        return;
      }

      tbody.innerHTML = data.items.map((s) => {
        const identity = s.submissionId
          ? badge((s.submissionId.name || s.submissionId.email || s.submissionId.referenceCode), 'good')
          : '<span class="na">Anonymous</span>';
        const replay = s.replayEnabled
          ? badge(`${s.replayChunkCount} chunk${s.replayChunkCount === 1 ? '' : 's'}`, 'good')
          : '<span class="na">\u2014</span>';
        return `<tr data-session-id="${escapeHtml(s.sessionId)}">
          <td>${escapeHtml(fmtDate(s.lastSeenAt))}</td>
          <td>${escapeHtml(fmtDate(s.firstSeenAt))}</td>
          <td class="mono-cell">${escapeHtml(s.landingPath || '/')}</td>
          <td>${escapeHtml(s.pageViewCount || 0)}</td>
          <td>${s.rageClickCount ? badge(s.rageClickCount, 'warn') : '0'}</td>
          <td>${escapeHtml(s.maxScrollDepthPct || 0)}%</td>
          <td>${replay}</td>
          <td>${identity}</td>
          <td class="detail-subtle">${escapeHtml((s.parsedUA && s.parsedUA.browser) || 'unknown')} \u00b7 ${escapeHtml((s.parsedUA && s.parsedUA.device) || '')}</td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('tr[data-session-id]').forEach((tr) => {
        tr.addEventListener('click', () => openSessionDetail(tr.dataset.sessionId));
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Failed to load sessions.</td></tr>';
      console.error(err);
    }
  }

  el('s-apply').addEventListener('click', () => {
    sessionsState.filters = {
      hasReplay: el('s-hasReplay').value,
      identified: el('s-identified').value,
    };
    sessionsState.page = 1;
    loadSessions();
  });
  el('s-prev-page').addEventListener('click', () => {
    if (sessionsState.page > 1) { sessionsState.page -= 1; loadSessions(); }
  });
  el('s-next-page').addEventListener('click', () => {
    sessionsState.page += 1; loadSessions();
  });

  let activeRrwebPlayer = null;
  let activeSessionId = null;

  async function openSessionDetail(sessionId) {
    activeSessionId = sessionId;
    const modal = el('session-modal');
    modal.classList.remove('hidden');
    el('session-stats').innerHTML = 'Loading\u2026';
    el('session-event-timeline').innerHTML = '';
    el('llm-summary-output').innerHTML = '';
    el('replay-player-target').innerHTML = '<p style="opacity:0.7; font-size:13px;">Loading\u2026</p>';

    try {
      const res = await fetch(`/admin/api/sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      renderSessionStats(data.session);
      renderEventTimeline(data.events, data.pageViews);
      if (data.session.llmSummary && data.session.llmSummary.text) {
        el('llm-summary-output').innerHTML =
          `<div class="detail-subtle">Generated ${escapeHtml(fmtDate(data.session.llmSummary.generatedAt))} \u00b7 ${escapeHtml(data.session.llmSummary.model)}</div>
           <p>${escapeHtml(data.session.llmSummary.text)}</p>`;
      }
      el('llm-summarize-btn').disabled = !data.llmEnabled;
      el('llm-summarize-btn').title = data.llmEnabled ? '' : 'Enable the summarizer above first.';

      if (data.replayChunks && data.replayChunks.length) {
        loadReplay(sessionId);
      } else {
        el('replay-player-target').innerHTML = '<p style="opacity:0.7; font-size:13px;">No replay recorded for this session (visitor didn\'t accept the notice, or there\'s nothing to replay yet).</p>';
      }
    } catch (err) {
      el('session-stats').innerHTML = 'Failed to load session.';
      console.error(err);
    }
  }

  function renderSessionStats(s) {
    el('session-stats').innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><div class="value">${escapeHtml(s.pageViewCount || 0)}</div><div class="label">Page views</div></div>
        <div class="stat-card"><div class="value">${escapeHtml(s.eventCount || 0)}</div><div class="label">Behavioral events</div></div>
        <div class="stat-card"><div class="value">${escapeHtml(s.rageClickCount || 0)}</div><div class="label">Rage clicks</div></div>
        <div class="stat-card"><div class="value">${escapeHtml(s.deadClickCount || 0)}</div><div class="label">Dead clicks</div></div>
        <div class="stat-card"><div class="value">${escapeHtml(s.maxScrollDepthPct || 0)}%</div><div class="label">Max scroll depth</div></div>
      </div>`;
  }

  function renderEventTimeline(events, pageViews) {
    const merged = [
      ...(pageViews || []).map((p) => ({ t: p.createdAt, label: `pageview \u2192 ${p.path}` })),
      ...(events || []).map((e) => ({ t: e.createdAt, label: `${e.type} ${JSON.stringify(e.detail || {})}` })),
    ].sort((a, b) => new Date(a.t) - new Date(b.t));

    if (!merged.length) {
      el('session-event-timeline').innerHTML = '<p style="opacity:0.7;">No events recorded.</p>';
      return;
    }
    el('session-event-timeline').innerHTML = merged
      .map((e) => `<div>${escapeHtml(fmtDate(e.t))} \u2014 ${escapeHtml(e.label)}</div>`)
      .join('');
  }

  async function loadReplay(sessionId) {
    const target = el('replay-player-target');
    target.innerHTML = '<p style="opacity:0.7; font-size:13px;">Loading replay\u2026</p>';
    try {
      const res = await fetch(`/admin/api/sessions/${encodeURIComponent(sessionId)}/replay`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (!data.events || data.events.length < 2) {
        target.innerHTML = '<p style="opacity:0.7; font-size:13px;">Not enough replay data yet.</p>';
        return;
      }
      target.innerHTML = '';
      if (activeRrwebPlayer && typeof activeRrwebPlayer.$destroy === 'function') {
        activeRrwebPlayer.$destroy();
      }
      // rrweb-player global export is `rrwebPlayer`
      activeRrwebPlayer = new window.rrwebPlayer({
        target,
        props: { events: data.events, width: 820, height: 460, autoPlay: false },
      });
    } catch (err) {
      target.innerHTML = '<p style="opacity:0.7; font-size:13px;">Failed to load replay.</p>';
      console.error(err);
    }
  }

  el('session-modal-close').addEventListener('click', () => el('session-modal').classList.add('hidden'));
  el('session-modal').addEventListener('click', (e) => {
    if (e.target === el('session-modal')) el('session-modal').classList.add('hidden');
  });

  el('llm-summarize-btn').addEventListener('click', async () => {
    if (!activeSessionId) return;
    const btn = el('llm-summarize-btn');
    btn.disabled = true;
    const out = el('llm-summary-output');
    out.innerHTML = 'Generating\u2026';
    try {
      const res = await fetch(`/admin/api/sessions/${encodeURIComponent(activeSessionId)}/summarize`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      out.innerHTML = `<div class="detail-subtle">Generated just now \u00b7 ${escapeHtml(data.summary.model)}</div><p>${escapeHtml(data.summary.text)}</p>`;
    } catch (err) {
      out.innerHTML = `<p style="color:#ff6a3d;">${escapeHtml(err.message || 'Failed to generate summary.')}</p>`;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- LLM settings (optional summarizer) ----------
  async function loadLlmSettings() {
    try {
      const res = await fetch('/admin/api/settings/llm');
      const data = await res.json();
      el('llm-enabled-toggle').checked = !!data.enabled;
      el('llm-provider-select').value = data.provider || 'ollama';
      el('llm-system-prompt').value = data.systemPrompt || '';
      el('llm-system-prompt').placeholder = data.defaultSystemPrompt || '';
    } catch (err) {
      console.error(err);
    }
  }

  el('llm-settings-save').addEventListener('click', async () => {
    const status = el('llm-settings-status');
    status.textContent = 'Saving\u2026';
    try {
      const res = await fetch('/admin/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: el('llm-enabled-toggle').checked,
          provider: el('llm-provider-select').value,
          systemPrompt: el('llm-system-prompt').value,
        }),
      });
      const data = await res.json();
      status.textContent = data.enabled
        ? `Saved \u2014 enabled (${data.provider}). Resets to off on server restart unless LLM_ENABLED=true is set in env.`
        : 'Saved \u2014 disabled.';
    } catch (err) {
      status.textContent = 'Failed to save.';
      console.error(err);
    }
  });

  // ---------- init ----------
  loadSubmissions();
})();
