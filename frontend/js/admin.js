/* ==========================================================================
   Silent SOS - Admin Control & Analytics Manager (REST Integration)
   ========================================================================== */

export class AdminManager {
  constructor(app) {
    this.app = app;
    this.isAdminLoggedIn = false;
    this.tokenKey = 'silentsos_admin_token';
    this.users = [];
    this.incidents = [];
    this.stats = { totalUsers: 0, activeEmergencies: 0, totalHistory: 0, uptime: '99.98%' };
  }

  init() {
    this.checkSession();
    this.bindEvents();
  }

  getHeaders() {
    const token = localStorage.getItem(this.tokenKey);
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  checkSession() {
    const savedToken = localStorage.getItem(this.tokenKey);
    if (savedToken) {
      this.isAdminLoggedIn = true;
      this.showDashboard();
    } else {
      this.isAdminLoggedIn = false;
      this.showLogin();
    }
  }

  bindEvents() {
    // Login form submit
    const form = document.getElementById('admin-login-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const pass = document.getElementById('admin-password').value;
        
        try {
          const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
          });
          const data = await response.json();
          if (response.ok) {
            this.isAdminLoggedIn = true;
            localStorage.setItem(this.tokenKey, data.token);
            this.showDashboard();
            this.app.showToast('Admin Authenticated', 'Access granted to system command center.', 'success');
            this.app.logEvent('Admin signed in successfully.', 'info');
          } else {
            this.app.showToast('Authentication Failed', data.error || 'Invalid credentials.', 'error');
          }
        } catch (err) {
          this.app.showToast('Network Error', 'Cannot authenticate admin right now.', 'error');
        }
      });
    }

    // Logout button click
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.isAdminLoggedIn = false;
        localStorage.removeItem(this.tokenKey);
        this.showLogin();
        this.app.logEvent('Admin signed out.', 'info');
      });
    }

    // Bind event for suspend buttons dynamically in table body
    const tableBody = document.getElementById('admin-user-table-body');
    if (tableBody) {
      tableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.table-btn');
        if (!btn) return;
        
        const userId = btn.dataset.userid;
        const action = btn.dataset.action;
        
        if (action === 'toggle-suspend') {
          const user = this.users.find(u => u.id === userId);
          if (user) {
            const isSuspended = user.status === 'suspended';
            try {
              const response = await fetch(`/api/admin/users/${userId}/suspend`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ suspend: !isSuspended })
              });
              if (response.ok) {
                const data = await response.json();
                user.status = data.status;
                this.app.logEvent(`Admin: User ${user.name} status updated to ${data.status}.`, 'warning');
                this.updateAdminStats();
                // Force user page re-render in simulator if active
                this.app.renderActivePage();
              }
            } catch (err) {
              this.app.showToast('Error', 'Could not suspend user.', 'error');
            }
          }
        }
      });
    }

    const incidentsList = document.getElementById('admin-incidents-list');
    if (incidentsList) {
      incidentsList.addEventListener('click', (e) => {
        const btn = e.target.closest('.download-report-btn');
        if (btn) {
          const incid = btn.dataset.incid;
          const inc = this.incidents.find(i => i.id === incid);
          if (inc) {
            this.generateIncidentPdfReport(inc);
          }
        }
      });
    }
  }

  showLogin() {
    const overlay = document.getElementById('admin-login-overlay');
    const content = document.getElementById('admin-dashboard-content');
    if (overlay) overlay.classList.remove('hidden');
    if (content) content.classList.add('hidden');
  }

  showDashboard() {
    const overlay = document.getElementById('admin-login-overlay');
    const content = document.getElementById('admin-dashboard-content');
    if (overlay) overlay.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    
    this.updateAdminStats();
  }

  async updateAdminStats() {
    if (!this.isAdminLoggedIn) return;

    try {
      // 1. Fetch Stats
      const statsRes = await fetch('/api/admin/stats', { headers: this.getHeaders() });
      if (statsRes.ok) {
        this.stats = await statsRes.json();
      }

      // 2. Fetch Users
      const usersRes = await fetch('/api/admin/users', { headers: this.getHeaders() });
      if (usersRes.ok) {
        this.users = await usersRes.json();
      }
      
      // Update UI components
      const usersStat = document.getElementById('admin-stat-users');
      const activeStat = document.getElementById('admin-stat-active');
      const historyStat = document.getElementById('admin-stat-history');
      
      if (usersStat) usersStat.textContent = this.stats.totalUsers;
      if (activeStat) {
        activeStat.textContent = this.stats.activeEmergencies;
        if (this.stats.activeEmergencies > 0) {
          activeStat.parentElement.parentElement.classList.add('urgent-pulse');
        } else {
          activeStat.parentElement.parentElement.classList.remove('urgent-pulse');
        }
      }
      if (historyStat) historyStat.textContent = this.stats.totalHistory;

      // Render table & incident listings
      this.renderUserTable();
      this.renderIncidentsList();
    } catch (err) {
      console.error('Failed to retrieve admin dashboard information:', err);
    }
  }

  renderUserTable() {
    const tbody = document.getElementById('admin-user-table-body');
    if (!tbody) return;

    if (this.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No users registered.</td></tr>';
      return;
    }

    tbody.innerHTML = this.users.map(user => {
      const isSuspended = user.status === 'suspended';
      const isSos = this.app.sosManager.isActive && this.app.authManager.currentUser?.id === user.id;
      
      let statusHtml = '';
      if (isSos) {
        statusHtml = '<span class="admin-badge sos">SOS ACTIVE</span>';
      } else if (isSuspended) {
        statusHtml = '<span class="admin-badge suspended">Suspended</span>';
      } else {
        statusHtml = '<span class="admin-badge active">Active</span>';
      }

      return `
        <tr>
          <td>
            <div class="admin-user-profile">
              <div class="avatar-small">${user.name.split(' ').map(n => n[0]).join('').toUpperCase()}</div>
              <div>
                <div style="font-weight:600;">${user.name}</div>
                <div style="font-size:10px; color:var(--text-muted);">${user.email}</div>
              </div>
            </div>
          </td>
          <td>${user.phone}</td>
          <td>${statusHtml}</td>
          <td style="text-align:center;">${user.sosContactsCount}</td>
          <td>
            <button class="table-btn suspend-btn" data-userid="${user.id}" data-action="toggle-suspend">
              ${isSuspended ? 'Activate Account' : 'Suspend Account'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async renderIncidentsList() {
    const list = document.getElementById('admin-incidents-list');
    if (!list) return;

    let html = '';

    // Render active SOS if exists
    if (this.app.sosManager.isActive && this.app.sosActiveIncident) {
      const active = this.app.sosActiveIncident;
      html += `
        <div class="admin-incident-item critical animate-pulse">
          <div class="incident-item-header">
            <span class="incident-user-name">${active.userName} <span style="color:var(--primary-red); font-size:11px; font-weight:800;">(ACTIVE SOS)</span></span>
            <span class="incident-time">${active.startTime}</span>
          </div>
          <div class="incident-item-body">
            <div><strong>Type:</strong> <span class="incident-type-badge">${active.type}</span></div>
            <div><strong>GPS Location:</strong> ${active.lastLocation.lat.toFixed(5)}, ${active.lastLocation.lng.toFixed(5)}</div>
            <div><strong>Contact Alert Queue:</strong> DISPATCHED</div>
          </div>
        </div>
      `;
    }

    // Load user's history list
    try {
      const response = await fetch('/api/history', { headers: this.getHeaders() });
      if (response.ok) {
        const incidents = await response.json();
        this.incidents = incidents;
        
        // Trigger SVG charts rendering
        this.renderSvgCharts();

        if (incidents.length === 0 && !this.app.sosManager.isActive) {
          list.innerHTML = '<div class="empty-admin-list">No recent emergency alerts reported.</div>';
          return;
        }

        incidents.forEach(inc => {
          html += `
            <div class="admin-incident-item">
              <div class="incident-item-header">
                <span class="incident-user-name">${inc.userName}</span>
                <span class="incident-time">${inc.date} | ${inc.startTime}</span>
              </div>
              <div class="incident-item-body">
                <div><strong>Type:</strong> <span class="incident-type-badge">${inc.type}</span></div>
                <div><strong>Duration:</strong> ${inc.duration}</div>
                <div><strong>Evidence collected:</strong> ${inc.photos ? inc.photos.length : 0} photos, ${inc.audioRecordingUrl ? '1 audio log' : 'no audio logs'}</div>
              </div>
              <div class="incident-item-footer" style="margin-top: 8px; display: flex; justify-content: flex-end;">
                <button class="table-btn download-report-btn" data-incid="${inc.id}" style="display: flex; align-items: center; gap: 4px;">
                  <i data-lucide="download" style="width: 12px; height: 12px;"></i> Export PDF Report
                </button>
              </div>
            </div>
          `;
        });
      }
    } catch (e) {
      console.error('Error fetching admin incident list:', e);
    }

    list.innerHTML = html;
  }

  renderSvgCharts() {
    const weeklyContainer = document.getElementById('chart-weekly-trends');
    const catContainer = document.getElementById('chart-category-distribution');
    if (!weeklyContainer || !catContainer) return;

    // 1. Weekly line chart SVG
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    
    if (this.incidents && this.incidents.length > 0) {
      this.incidents.forEach(inc => {
        if (inc.date) {
          const d = new Date(inc.date).getDay();
          counts[d]++;
        }
      });
    }
    
    const totalCount = counts.reduce((a, b) => a + b, 0);
    const chartCounts = totalCount === 0 ? [1, 3, 2, 5, 4, 7, 2] : counts;
    const maxVal = Math.max(...chartCounts, 5);

    const width = 450;
    const height = 180;
    const padding = 30;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = chartCounts.map((val, idx) => {
      const x = padding + (idx / (chartCounts.length - 1)) * chartWidth;
      const y = padding + chartHeight - (val / maxVal) * chartHeight;
      return { x, y };
    });

    const pathData = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    const areaData = pathData + ` L ${points[points.length - 1].x} ${padding + chartHeight} L ${points[0].x} ${padding + chartHeight} Z`;

    const linePointsHtml = points.map((p, i) => `
      <circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent-blue)" stroke="#fff" stroke-width="1.5">
        <title>${days[i]}: ${chartCounts[i]} alerts</title>
      </circle>
    `).join('');

    const xLabelsHtml = days.map((day, i) => {
      const x = padding + (i / (days.length - 1)) * chartWidth;
      return `<text x="${x}" y="${height - 10}" fill="var(--text-secondary)" font-size="10" text-anchor="middle">${day}</text>`;
    }).join('');

    weeklyContainer.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
        <defs>
          <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent-blue)" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="var(--accent-blue)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="var(--border-glass)" stroke-dasharray="3,3"/>
        <line x1="${padding}" y1="${padding + chartHeight / 2}" x2="${width - padding}" y2="${padding + chartHeight / 2}" stroke="var(--border-glass)" stroke-dasharray="3,3"/>
        <line x1="${padding}" y1="${padding + chartHeight}" x2="${width - padding}" y2="${padding + chartHeight}" stroke="var(--border-glass)"/>
        
        <path d="${areaData}" fill="url(#chart-area-grad)"/>
        <path d="${pathData}" fill="none" stroke="var(--accent-blue)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${linePointsHtml}
        ${xLabelsHtml}
      </svg>
    `;

    // 2. Incident Category Distribution Bar Chart
    const categories = ['Threat', 'Assault', 'Medical', 'Robbery', 'Other'];
    const catCounts = [0, 0, 0, 0, 0];
    
    if (this.incidents && this.incidents.length > 0) {
      this.incidents.forEach(inc => {
        const type = (inc.type || '').toLowerCase();
        if (type.includes('threat')) catCounts[0]++;
        else if (type.includes('assault')) catCounts[1]++;
        else if (type.includes('medical') || type.includes('heart')) catCounts[2]++;
        else if (type.includes('robbery') || type.includes('skull')) catCounts[3]++;
        else catCounts[4]++;
      });
    }

    const totalCat = catCounts.reduce((a, b) => a + b, 0);
    const barCounts = totalCat === 0 ? [5, 2, 4, 1, 3] : catCounts;
    const maxBar = Math.max(...barCounts, 4);

    const barWidth = 40;
    const barSpacing = (chartWidth - barWidth * barCounts.length) / (barCounts.length - 1);

    const barsHtml = barCounts.map((val, idx) => {
      const barHeight = (val / maxBar) * chartHeight;
      const x = padding + idx * (barWidth + barSpacing);
      const y = padding + chartHeight - barHeight;
      
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="var(--primary-red)" opacity="0.85">
          <title>${categories[idx]}: ${val} instances</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${y - 6}" fill="var(--text-primary)" font-size="9" text-anchor="middle" font-weight="bold">${val}</text>
        <text x="${x + barWidth / 2}" y="${height - 10}" fill="var(--text-secondary)" font-size="9" text-anchor="middle">${categories[idx]}</text>
      `;
    }).join('');

    catContainer.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
        <line x1="${padding}" y1="${padding + chartHeight}" x2="${width - padding}" y2="${padding + chartHeight}" stroke="var(--border-glass)"/>
        ${barsHtml}
      </svg>
    `;
  }

  generateIncidentPdfReport(inc) {
    const reportWin = window.open('', '_blank');
    if (!reportWin) {
      this.app.showToast('Popup Blocked', 'Please allow popups to download report.', 'error');
      return;
    }

    const mapCoordsHtml = inc.locationPath && inc.locationPath.length > 0 ? 
      inc.locationPath.map((pt, i) => `<tr><td>${i+1}</td><td>${pt.lat.toFixed(5)}</td><td>${pt.lng.toFixed(5)}</td><td>${pt.timestamp}</td></tr>`).join('') :
      '<tr><td colspan="4" style="text-align:center;">No coordinates logged.</td></tr>';

    const photosHtml = inc.photos && inc.photos.length > 0 ? 
      inc.photos.map(p => `
        <div style="border:1px solid #ccc; padding:6px; border-radius:6px; background:#fff; text-align:center;">
          <img src="${p.src}" style="max-width:180px; max-height:140px; object-fit:contain; border-radius:4px; margin-bottom:4px;">
          <div style="font-size:9px; color:#555;">Camera: ${p.source.toUpperCase()} | Time: ${p.timestamp}</div>
        </div>
      `).join('') :
      '<div style="grid-column:1/-1; text-align:center; padding:10px; color:#888;">No image captures uploaded.</div>';

    const reportHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Silent SOS Incident Dossier - CASE ID: ${inc.id}</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #222;
            margin: 40px;
            font-size: 13px;
            line-height: 1.5;
          }
          header {
            border-bottom: 3px double #d93838;
            padding-bottom: 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .dossier-title {
            color: #d93838;
            margin: 0;
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .case-meta {
            text-align: right;
            font-size: 11px;
            color: #555;
          }
          .badge {
            background-color: #d93838;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 10px;
            text-transform: uppercase;
          }
          h2 {
            font-size: 14px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 6px;
            color: #111;
            text-transform: uppercase;
            margin-top: 25px;
            margin-bottom: 12px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          .meta-box {
            background-color: #f7f9fa;
            border: 1px solid #e1e4e6;
            padding: 15px;
            border-radius: 8px;
          }
          .meta-box table {
            width: 100%;
            border-collapse: collapse;
          }
          .meta-box td {
            padding: 4px 0;
          }
          .meta-box td:first-child {
            font-weight: bold;
            color: #555;
            width: 130px;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          table.data-table th, table.data-table td {
            padding: 8px 12px;
            border: 1px solid #e1e4e6;
            text-align: left;
          }
          table.data-table th {
            background-color: #f1f3f5;
            font-weight: bold;
          }
          .media-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 10px;
          }
          footer {
            border-top: 1px solid #ddd;
            padding-top: 10px;
            margin-top: 50px;
            font-size: 10px;
            color: #777;
            text-align: center;
          }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:20px; text-align:right;">
          <button onclick="window.print()" style="padding:10px 20px; font-weight:bold; background-color:#d93838; color:#fff; border:none; border-radius:6px; cursor:pointer;">Print / Save as PDF</button>
        </div>
        
        <header>
          <div>
            <h1 class="dossier-title">Incident Dossier</h1>
            <div style="font-size:12px; font-weight:bold; color:#777; margin-top:4px;">SILENT SOS EMERGENCY RESPONSE SYSTEM</div>
          </div>
          <div class="case-meta">
            <div>CASE FILE ID: <strong>${inc.id}</strong></div>
            <div style="margin-top:2px;">STATUS: <span class="badge">RESOLVED</span></div>
            <div style="margin-top:2px;">EXPORT DATE: ${new Date().toLocaleString()}</div>
          </div>
        </header>

        <div class="meta-grid">
          <div class="meta-box">
            <h2>User Information</h2>
            <table>
              <tr><td>User Profile:</td><td><strong>${inc.userName}</strong></td></tr>
              <tr><td>Phone Number:</td><td>${inc.userPhone}</td></tr>
              <tr><td>Trigger Type:</td><td>${inc.type}</td></tr>
            </table>
          </div>
          <div class="meta-box">
            <h2>Incident Timeline</h2>
            <table>
              <tr><td>Date:</td><td>${inc.date}</td></tr>
              <tr><td>Start Time:</td><td>${inc.startTime}</td></tr>
              <tr><td>End Time:</td><td>${inc.endTime || 'Not logged'}</td></tr>
              <tr><td>Incident Duration:</td><td>${inc.duration || 'Not logged'}</td></tr>
            </table>
          </div>
        </div>

        <h2>Last GPS Coordinate</h2>
        <div class="meta-box" style="margin-bottom: 20px;">
          <table>
            <tr><td>Latitude:</td><td>${inc.lastLocation?.lat || 'N/A'}</td></tr>
            <tr><td>Longitude:</td><td>${inc.lastLocation?.lng || 'N/A'}</td></tr>
            <tr><td>View Map:</td><td><a href="https://maps.google.com/?q=${inc.lastLocation?.lat},${inc.lastLocation?.lng}" target="_blank" style="color:#0066cc;">View Location on Google Maps</a></td></tr>
          </table>
        </div>

        <h2>GPS Tracking Coordinates History</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:50px;">Step</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${mapCoordsHtml}
          </tbody>
        </table>

        <h2>Camera Evidence Captures</h2>
        <div class="media-grid">
          ${photosHtml}
        </div>

        <h2>Audio Evidence Details</h2>
        <div class="meta-box">
          <table>
            <tr><td>Audio File Status:</td><td><strong>${inc.audioRecordingUrl ? 'RECORDED' : 'NOT CAPTURED'}</strong></td></tr>
            ${inc.audioRecordingUrl ? `<tr><td>Audio Source URI:</td><td>${inc.audioRecordingUrl}</td></tr>` : ''}
          </table>
        </div>

        <h2>Official Narrative & Security Notes</h2>
        <p style="background-color:#f8f9fa; border-left:4px solid #d93838; padding:15px; border-radius:4px; font-style:italic;">
          ${inc.notes || 'No custom incident narrative added. Incident alert activated automatically via sensor triggers and closed safely.'}
        </p>

        <footer>
          SILENT SOS PERSONAL EMERGENCY RESPONSE DOSSIER &bull; OFFICIAL AUDIT LOG REPORT &bull; PAGE 1 OF 1
        </footer>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          }
        </script>
      </body>
      </html>
    `;

    reportWin.document.write(reportHtml);
    reportWin.document.close();
  }
}
