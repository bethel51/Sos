/* ==========================================================================
   Silent SOS - Main Web Application Orchestrator
   ========================================================================== */

import { AuthManager } from './auth.js';
import { ContactsManager } from './contacts.js';
import { SOSManager } from './sos.js';
import { LocationManager } from './location.js';
import { EvidenceCollector } from './evidence.js';
import { TimersManager } from './timers.js';
import { HistoryManager } from './history.js';
import { ContactDashboard } from './dashboard.js';
import { AdminManager } from './admin.js';

class AppOrchestrator {
  constructor() {
    this.globalActivityLog = [];
    this.sosActiveIncident = null;
    
    // Core Navigation State
    // States: 'login', 'signup', 'forgot-password', 'verify-code', 'reset-verify', 'reset-new-password', 'lock-screen', 'home', 'contacts', 'timers', 'zones', 'history', 'settings', 'active-sos', 'medical-profile'
    this.currentScreenState = 'signup';
    this.lockScreenReason = 'normal-unlock'; // 'normal-unlock', 'disarm-sos', 'disarm-timer'
    
    // Sub-Systems Initializations
    this.authManager = new AuthManager(this);
    this.contactsManager = null; // initialized after login
    this.historyManager = null;  // initialized after login
    
    this.sosManager = new SOSManager(this);
    this.locationManager = new LocationManager(this);
    this.evidenceCollector = new EvidenceCollector(this);
    this.timersManager = new TimersManager(this);
    
    this.contactDashboard = new ContactDashboard(this);
    this.adminManager = new AdminManager(this);
    
    this.socket = null;
  }

  setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('sos_triggered', (incident) => {
      this.sosManager.isActive = true;
      this.sosActiveIncident = incident;
      this.syncActiveEmergencyData();
      this.showToast('SOS Triggered', `${incident.userName} is in danger!`, 'error');
      this.logEvent(`Surveillance: SOS triggered by ${incident.userName} (${incident.type})`, 'critical');
    });

    this.socket.on('location_update', (incident) => {
      this.sosActiveIncident = incident;
      this.syncActiveEmergencyData();
      this.logEvent(`Surveillance: Live GPS coordinates received.`, 'info');
    });

    this.socket.on('evidence_update', (incident) => {
      this.sosActiveIncident = incident;
      this.syncActiveEmergencyData();
      this.logEvent(`Surveillance: New evidence uploaded to incident.`, 'info');
    });

    this.socket.on('sos_deactivated', (incident) => {
      this.sosManager.isActive = false;
      this.sosActiveIncident = null;
      this.syncActiveEmergencyData();
      this.showToast('SOS Resolved', 'Emergency alert has been resolved.', 'success');
      this.logEvent(`Surveillance: Emergency resolved safely.`, 'success');
    });
  }

  initTheme() {
    const theme = localStorage.getItem('silentsos_theme') || 'dark';
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    
    const themeBtn = document.getElementById('global-theme-toggle');
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'light' ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
      themeBtn.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-theme');
        localStorage.setItem('silentsos_theme', isLight ? 'light' : 'dark');
        themeBtn.innerHTML = isLight ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
        lucide.createIcons();
      });
    }
  }

  async init() {
    this.initTheme();

    // Register Service Worker for PWA (Only in production/non-dev ports to avoid caching HMR scripts)
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if ('serviceWorker' in navigator && !isLocal) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => console.log('ServiceWorker registered successfully:', reg.scope))
          .catch(err => console.warn('ServiceWorker registration failed:', err));
      });
    }

    if (typeof io !== 'undefined') {
      this.socket = io();
      this.setupSocketListeners();
    }

    this.bindSimulatorControls();
    this.bindRoleNavigation();
    this.contactDashboard.init();
    this.adminManager.init();
    
    // Load existing session asynchronously if token exists
    if (this.authManager.getToken()) {
      const user = await this.authManager.loadSession();
      if (user) {
        this.currentScreenState = 'lock-screen';
        this.lockScreenReason = 'normal-unlock';
      }
    }
    
    this.renderActivePage();
    this.logEvent('Silent SOS safety system initialized.', 'info');
    
    // Start status bar clock updates
    this.startClock();
    
    // Trigger Lucide icons replacing
    lucide.createIcons();
  }

  // Setup user-specific databases
  initUserSession(user) {
    this.contactsManager = new ContactsManager(user.id);
    this.historyManager = new HistoryManager(this, user.id);
    
    if (this.socket) {
      this.socket.emit('join_user_room', user.id);
    }
    
    // sync config values from user account overrides if needed
    this.logEvent(`Session started for user: ${user.name}`, 'info');
  }

  // --- GLOBAL UTILS ---
  logEvent(text, type = 'info') {
    const timeStr = new Date().toLocaleTimeString();
    this.globalActivityLog.push({ time: timeStr, text, type });
    
    // Keep log buffer size
    if (this.globalActivityLog.length > 50) this.globalActivityLog.shift();
    
    // Update live simulator log log stream
    const logsContainer = document.getElementById('contact-incident-log');
    if (logsContainer && this.currentRoleView === 'contact-dashboard') {
      this.contactDashboard.update();
    }
  }

  showToast(title, text, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'error') iconName = 'alert-octagon';
    if (type === 'success') iconName = 'check-circle';
    
    toast.innerHTML = `
      <div class="toast-icon ${type}"><i data-lucide="${iconName}"></i></div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div>${text}</div>
      </div>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();

    // Slide out after 3.5 seconds
    setTimeout(() => {
      toast.style.animation = 'slide-in-toast 0.3s reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Broadcast coordinates / telemetry to components
  syncActiveEmergencyData() {
    if (this.currentRoleView === 'contact-dashboard') {
      this.contactDashboard.update();
    }
    if (this.currentRoleView === 'admin-panel') {
      this.adminManager.updateAdminStats();
    }
  }

  // --- RUNTIME VIEW SELECTOR TAB HANDLER ---
  switchWorkspaceView(view) {
    this.currentRoleView = view;
    
    // Toggle Active Tabs CSS
    const tabs = document.querySelectorAll('.global-view-nav .view-tab-btn');
    tabs.forEach(t => {
      if (t.dataset.view === view) t.classList.add('active');
      else t.classList.remove('active');
    });

    // Toggle Active Drawer Buttons CSS
    const drawerBtns = document.querySelectorAll('.drawer-opt-btn');
    drawerBtns.forEach(b => {
      if (b.dataset.view === view) b.classList.add('active');
      else b.classList.remove('active');
    });
    
    // Hide all views
    document.querySelectorAll('.role-view').forEach(rv => rv.classList.remove('active'));
    
    // Show selected view
    const targetView = document.getElementById(`view-${view}`);
    if (targetView) targetView.classList.add('active');
    
    // Initialize leaf maps if switching views
    if (view === 'contact-dashboard') {
      if (this.socket && this.sosActiveIncident) {
        this.socket.emit('join_user_room', this.sosActiveIncident.userId);
      } else if (this.socket && this.authManager.currentUser) {
        this.socket.emit('join_user_room', this.authManager.currentUser.id);
      }
      setTimeout(() => {
        this.locationManager.initContactMap('contact-map');
        this.contactDashboard.update();
      }, 100);
    } else if (view === 'admin-panel') {
      if (this.socket) {
        this.socket.emit('join_admin_room');
      }
      this.adminManager.showDashboard();
    } else if (view === 'user-app') {
      // If in safe zones map tab inside user app, trigger redraw
      if (this.currentScreenState === 'zones') {
        setTimeout(() => {
          this.locationManager.initUserMap('user-zones-map');
        }, 100);
      }
    }
  }

  bindRoleNavigation() {
    this.currentRoleView = 'user-app';
    const tabs = document.querySelectorAll('.global-view-nav .view-tab-btn');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        this.switchWorkspaceView(view);
      });
    });

    // Mobile role drawer sheet setup
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const roleDrawer = document.getElementById('mobile-role-drawer');
    const closeDrawer = document.getElementById('close-drawer-btn');
    const drawerBtns = document.querySelectorAll('.drawer-opt-btn');

    if (menuToggle && roleDrawer) {
      menuToggle.addEventListener('click', () => {
        roleDrawer.classList.remove('hidden');
      });
    }

    if (closeDrawer && roleDrawer) {
      closeDrawer.addEventListener('click', () => {
        roleDrawer.classList.add('hidden');
      });
    }

    if (roleDrawer) {
      roleDrawer.addEventListener('click', (e) => {
        if (e.target === roleDrawer) {
          roleDrawer.classList.add('hidden');
        }
      });
    }

    drawerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchWorkspaceView(view);
        if (roleDrawer) {
          roleDrawer.classList.add('hidden');
        }
      });
    });
  }

  // --- HARDWARE SIMULATOR INTERACTION ---
  bindSimulatorControls() {
    // Physical button actions
    document.getElementById('sim-power-btn').addEventListener('click', () => {
      this.sosManager.handlePowerButtonTap();
    });
    
    document.getElementById('sim-vol-up').addEventListener('click', () => {
      this.sosManager.handleVolumeButtonPress('up');
    });
    
    document.getElementById('sim-vol-down').addEventListener('click', () => {
      this.sosManager.handleVolumeButtonPress('down');
    });
    
    document.getElementById('sim-shake-btn').addEventListener('click', () => {
      this.sosManager.handleShakeTrigger();
    });
    
    // GPS slider paths
    const routeSelector = document.getElementById('sim-gps-route');
    routeSelector.addEventListener('change', (e) => {
      const pathName = e.target.value;
      this.locationManager.setSimulationPath(pathName);
    });

    document.getElementById('sim-move-step').addEventListener('click', () => {
      this.locationManager.incrementSimulatedStep();
    });

    // Battery slider (simulator sidebar - updates battery %, triggers critical alert)
    const batterySlider = document.getElementById('sim-battery-slider');
    const batteryPct = document.getElementById('sim-battery-pct');

    if (batterySlider) {
      batterySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (batteryPct) batteryPct.textContent = `${val}%`;
        // Battery critical alert trigger (still functional even without status bar icon)
        this.checkBatteryCriticalTrigger(val);
      });
    }

    // Online toggle (controls offline mode ribbon and SMS fallback)
    const networkToggle = document.getElementById('sim-network-status');
    if (networkToggle) {
      networkToggle.addEventListener('change', (e) => {
        const isOnline = e.target.checked;
        const ribbon = document.getElementById('global-sos-status');

        if (isOnline) {
          this.logEvent('Network Connection restored (Online). Uploading queued data.', 'success');
          this.showToast('Online Mode', 'Connection restored. Uploading cached logs.', 'success');
          if (ribbon && !this.sosManager.isActive) {
            ribbon.className = 'status-ribbon';
            ribbon.querySelector('.status-text').textContent = 'System Monitoring Active';
          }
        } else {
          this.logEvent('Network connection lost. Offline SOS Queues active.', 'warning');
          this.showToast('Offline Mode', 'Internet lost. Queueing distress signals to SMS fallback.', 'warning');
          if (ribbon && !this.sosManager.isActive) {
            ribbon.className = 'status-ribbon offline';
            ribbon.querySelector('.status-text').textContent = 'OFFLINE: SMS Fallback Active';
          }
        }
      });
    }
  }

  checkBatteryCriticalTrigger(val) {
    if (this.sosManager.config.batteryProtectionEnabled && val <= 10 && !this.batteryCriticalAlertSent) {
      this.batteryCriticalAlertSent = true;
      this.logEvent('Critical Battery Alert: Battery level is under 10%. Dispatching final coords.', 'critical');
      this.showToast('Battery Warning Sent', 'Final GPS details dispatched to emergency contacts.', 'error');
      
      // Send location coords immediately
      const user = this.authManager.currentUser || { name: 'Jane Doe', phone: '+1 (555) 019-2834' };
      this.sosManager.dispatchAlertsToEmergencyContacts(user, 'Critical Battery Warning');
    } else if (val > 10) {
      this.batteryCriticalAlertSent = false;
    }
  }

  startClock() {
    const updateTime = () => {
      const timeDisplay = document.getElementById('phone-time');
      if (timeDisplay) {
        const timeNow = new Date();
        let hours = timeNow.getHours();
        const mins = timeNow.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        timeDisplay.textContent = `${hours}:${mins} ${ampm}`;
      }
    };
    updateTime();
    setInterval(updateTime, 60000);
  }

  // --- MOBILE VIEWS RENDER ROUTING ---
  async renderActivePage() {
    const container = document.getElementById('screen-body');
    if (!container) return;

    // Reset standard layout elements
    const navbar = document.querySelector('.phone-navbar');
    if (navbar) navbar.classList.remove('hidden');

    // Pre-load data from backend
    if (this.currentScreenState === 'contacts' && this.contactsManager) {
      try {
        await this.contactsManager.loadContacts();
      } catch (err) {
        console.error('Error loading contacts:', err);
      }
    } else if (this.currentScreenState === 'zones' && this.locationManager) {
      try {
        await this.locationManager.loadSafeZones();
      } catch (err) {
        console.error('Error loading safe zones:', err);
      }
    } else if (this.currentScreenState === 'settings' && this.sosManager) {
      try {
        await this.sosManager.loadSettings();
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    } else if (this.currentScreenState === 'history' && this.historyManager) {
      try {
        await this.historyManager.loadHistory();
      } catch (err) {
        console.error('Error loading history:', err);
      }
    }

    let html = '';

    // Check user suspension state
    if (this.authManager.currentUser && this.authManager.currentUser.status === 'suspended') {
      this.authManager.logout();
      this.currentScreenState = 'signup';
      this.showToast('Account Suspended', 'Your account has been suspended by an administrator.', 'error');
    }

    // Proper gating and roles redirect:
    const publicScreens = ['login', 'signup', 'forgot-password', 'verify-code', 'reset-verify', 'reset-new-password'];
    if (!publicScreens.includes(this.currentScreenState) && !this.authManager.currentUser) {
      this.currentScreenState = 'signup';
      this.showToast('Authentication Required', 'Please create an account or login to proceed.', 'warning');
      this.renderActivePage();
      return;
    }

    switch (this.currentScreenState) {
      case 'login':
        html = this.getLoginHtml();
        break;
      case 'signup':
        html = this.getSignupHtml();
        break;
      case 'forgot-password':
        html = this.getForgotPasswordHtml();
        break;
      case 'verify-code':
        html = this.getVerifyCodeHtml();
        break;
      case 'reset-verify':
        html = this.getResetVerifyHtml();
        break;
      case 'reset-new-password':
        html = this.getResetNewPasswordHtml();
        break;
      case 'lock-screen':
        html = this.getLockScreenHtml();
        break;
      case 'home':
        html = this.getHomeHtml();
        break;
      case 'contacts':
        html = this.getContactsHtml();
        break;
      case 'timers':
        html = this.getTimersHtml();
        break;
      case 'zones':
        html = this.getZonesHtml();
        break;
      case 'history':
        html = this.getHistoryHtml();
        break;
      case 'settings':
        html = this.getSettingsHtml();
        break;
      case 'active-sos':
        html = this.getActiveSosHtml();
        break;
      case 'medical-profile':
        html = this.getMedicalProfileHtml();
        break;
    }

    container.innerHTML = html;
    this.bindPageSpecificEvents();
    
    // Handle bottom navigation bar rendering
    this.renderNavigationBar();

    // Trigger icon render
    lucide.createIcons();
  }

  // Render bottom navigator in mobile app views
  renderNavigationBar() {
    const screen = document.getElementById('phone-screen-content');
    if (!screen) return;
    
    // Clear old navbar
    const oldNavbar = screen.querySelector('.phone-navbar');
    if (oldNavbar) oldNavbar.remove();

    const noNavStates = ['login', 'signup', 'forgot-password', 'verify-code', 'reset-verify', 'reset-new-password', 'lock-screen', 'active-sos', 'medical-profile'];
    if (noNavStates.includes(this.currentScreenState)) return;

    const nav = document.createElement('div');
    nav.className = 'phone-navbar';
    
    const tabs = [
      { state: 'home', icon: 'shield-alert', label: 'SOS' },
      { state: 'contacts', icon: 'phone', label: 'Contacts' },
      { state: 'timers', icon: 'clock', label: 'Timers' },
      { state: 'zones', icon: 'map-pin', label: 'Map' },
      { state: 'history', icon: 'archive', label: 'Logs' },
      { state: 'settings', icon: 'settings', label: 'Options' }
    ];

    nav.innerHTML = tabs.map(tab => {
      const activeClass = this.currentScreenState === tab.state ? 'active' : '';
      const activeSosNav = this.sosManager.isActive && tab.state === 'home' ? 'active-sos-nav' : '';
      return `
        <a class="nav-item ${activeClass} ${activeSosNav}" data-nav="${tab.state}">
          <i data-lucide="${tab.icon}"></i>
          <span>${tab.label}</span>
        </a>
      `;
    }).join('');

    screen.appendChild(nav);
    
    // Bind navigator clicks
    nav.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const dest = item.dataset.nav;
        this.currentScreenState = dest;
        this.renderActivePage();
      });
    });
  }

  // --- PAGE HTML GENERATORS ---

  getLoginHtml() {
    return `
      <div class="auth-page-wrapper">
        <div class="auth-brand-header">
          <div class="auth-brand-icon">
            <i data-lucide="shield-check"></i>
          </div>
          <h1 class="auth-brand-title">Silent SOS</h1>
          <p class="auth-brand-sub">Your personal safety guardian</p>
        </div>

        <div class="auth-glass-card">
          <h2 class="auth-card-title">Welcome Back</h2>
          <p class="auth-card-sub">Sign in to continue protecting yourself</p>

          <form id="user-login-form" class="auth-form">
            <div class="auth-field">
              <div class="auth-field-icon"><i data-lucide="mail"></i></div>
              <input type="email" id="login-email" value="jane.doe@example.com" placeholder="Email address" required autocomplete="username">
            </div>
            <div class="auth-field">
              <div class="auth-field-icon"><i data-lucide="lock"></i></div>
              <input type="password" id="login-password" value="Password123!" placeholder="Password" required autocomplete="current-password">
            </div>
            <button type="submit" class="auth-submit-btn">
              <i data-lucide="log-in"></i>
              Sign In
            </button>
          </form>

          <div class="auth-card-links">
            <a href="#" id="link-forgot-pass" class="auth-link">Forgot Password?</a>
            <span class="auth-divider">·</span>
            <a href="#" id="link-signup" class="auth-link auth-link-accent">Create Account</a>
          </div>
        </div>
      </div>
    `;
  }

  getSignupHtml() {
    return `
      <div class="auth-page-wrapper premium-signup-view">
        <div class="auth-brand-header">
          <div class="auth-brand-icon premium-glow-blue">
            <i data-lucide="shield-plus"></i>
          </div>
          <h1 class="auth-brand-title">Create Account</h1>
          <p class="auth-brand-sub">Secure your personal safety network today</p>
        </div>

        <div class="auth-glass-card premium-signup-card">
          <div class="auth-steps-indicator premium-steps">
            <div class="auth-step active"><span class="step-num">1</span> <span class="step-lbl">Details</span></div>
            <div class="auth-step-line active"></div>
            <div class="auth-step"><span class="step-num">2</span> <span class="step-lbl">Verify</span></div>
            <div class="auth-step-line"></div>
            <div class="auth-step"><span class="step-num">3</span> <span class="step-lbl">Done</span></div>
          </div>

          <form id="user-signup-form" class="auth-form premium-form" style="max-height: 380px; overflow-y: auto; padding-right: 4px;">
            <div class="premium-input-group">
              <label class="premium-input-label">Full Name</label>
              <div class="auth-field premium-field">
                <div class="auth-field-icon"><i data-lucide="user"></i></div>
                <input type="text" id="reg-name" placeholder="John Doe" required autocomplete="name">
              </div>
            </div>

            <div class="premium-input-group">
              <label class="premium-input-label">Email Address</label>
              <div class="auth-field premium-field">
                <div class="auth-field-icon"><i data-lucide="mail"></i></div>
                <input type="email" id="reg-email" placeholder="john@example.com" required autocomplete="email">
              </div>
            </div>

            <div class="premium-input-group">
              <label class="premium-input-label">Phone Number</label>
              <div class="auth-field premium-field">
                <div class="auth-field-icon"><i data-lucide="phone"></i></div>
                <input type="tel" id="reg-phone" placeholder="+1 (555) 000-0000" required autocomplete="tel">
              </div>
            </div>

            <div class="premium-input-group">
              <label class="premium-input-label">Security Password</label>
              <div class="auth-field premium-field">
                <div class="auth-field-icon"><i data-lucide="lock"></i></div>
                <input type="password" id="reg-password" placeholder="Min. 8 chars, mixed case, symbol" required autocomplete="new-password">
              </div>
            </div>

            <div class="premium-input-group">
              <label class="premium-input-label">4-Digit Unlock PIN</label>
              <div class="auth-field premium-field">
                <div class="auth-field-icon"><i data-lucide="key-round"></i></div>
                <input type="text" id="reg-pin" placeholder="e.g. 1234" maxlength="4" pattern="[0-9]{4}" required>
              </div>
              <span class="field-hint-text">Used to cancel active SOS alarms safely</span>
            </div>

            <button type="submit" class="auth-submit-btn premium-submit-btn" style="margin-top: 10px;">
              <span>Continue to Verification</span>
              <i data-lucide="arrow-right"></i>
            </button>
          </form>

          <div class="auth-card-links premium-links">
            <span style="font-size: 11px; color: var(--text-muted);">Already registered?</span>
            <a href="#" id="link-login" class="auth-link auth-link-accent">Sign In</a>
          </div>
        </div>
      </div>
    `;
  }

  getForgotPasswordHtml() {
    return `
      <div class="auth-page-wrapper">
        <div class="auth-brand-header">
          <div class="auth-brand-icon" style="background: linear-gradient(135deg, #f7971e, #ffd200);">
            <i data-lucide="key"></i>
          </div>
          <h1 class="auth-brand-title">Reset Password</h1>
          <p class="auth-brand-sub">We'll send you a recovery code</p>
        </div>

        <div class="auth-glass-card">
          <form id="forgot-form" class="auth-form">
            <div class="auth-field">
              <div class="auth-field-icon"><i data-lucide="mail"></i></div>
              <input type="email" id="forgot-email" placeholder="Registered email" required autocomplete="email">
            </div>
            <button type="submit" class="auth-submit-btn">
              <i data-lucide="send"></i>
              Send Reset Code
            </button>
          </form>

          <div class="auth-card-links">
            <a href="#" id="link-login-back" class="auth-link"><i data-lucide="chevron-left" style="width:12px;height:12px;"></i> Back to Login</a>
          </div>
        </div>
      </div>
    `;
  }

  getVerifyCodeHtml() {
    return `
      <div class="auth-page-wrapper premium-verify-view">
        <div class="auth-brand-header">
          <div class="auth-brand-icon otp-icon-glow premium-glow-purple">
            <i data-lucide="shield-check"></i>
          </div>
          <h1 class="auth-brand-title">Verify Email</h1>
          <p class="auth-brand-sub">Verify your account to activate distress features</p>
        </div>

        <div class="auth-glass-card premium-verify-card">
          <div class="auth-steps-indicator premium-steps">
            <div class="auth-step completed"><span class="step-num"><i data-lucide="check" style="width: 10px; height: 10px;"></i></span> <span class="step-lbl">Details</span></div>
            <div class="auth-step-line active"></div>
            <div class="auth-step active"><span class="step-num">2</span> <span class="step-lbl">Verify</span></div>
            <div class="auth-step-line active"></div>
            <div class="auth-step"><span class="step-num">3</span> <span class="step-lbl">Done</span></div>
          </div>

          <div class="verify-instruction-box">
            <p class="otp-hint-text">We sent a 4-digit security code to <strong style="color:var(--color-cyan);">${this.currentSignupEmail ? this.currentSignupEmail.replace(/(.{2}).+(@.+)/, '$1****$2') : 'your email'}</strong>. Enter it below to authorize this device.</p>
          </div>

          <div class="otp-input-row premium-otp-row">
            <input type="text" class="code-input otp-digit premium-otp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="code-input otp-digit premium-otp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="code-input otp-digit premium-otp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="code-input otp-digit premium-otp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
          </div>

          <button id="verify-submit-btn" class="auth-submit-btn premium-verify-btn" style="margin-top: 24px;">
            <i data-lucide="key-round"></i>
            <span>Verify &amp; Activate Device</span>
          </button>

          <div class="auth-card-links premium-links" style="flex-direction: column; gap: 8px; margin-top: 18px;">
            <a href="#" id="resend-code-btn" class="auth-link">Didn't receive code? <strong>Resend Email</strong></a>
          </div>
        </div>
      </div>
    `;
  }
  getResetVerifyHtml() {
    const email = this.tempResetEmail || '';
    const maskedEmail = email.replace(/(.{2}).+(@.+)/, '$1****$2');
    return `
      <div class="auth-page-wrapper">
        <div class="auth-brand-header">
          <div class="auth-brand-icon otp-icon-glow" style="background: linear-gradient(135deg, #f7971e, #ffd200);">
            <i data-lucide="key-round"></i>
          </div>
          <h1 class="auth-brand-title">Enter Reset Code</h1>
          <p class="auth-brand-sub">We sent a 4-digit code to ${maskedEmail}</p>
        </div>

        <div class="auth-glass-card">
          <div class="auth-steps-indicator">
            <div class="auth-step completed"><i data-lucide="check" style="width:10px;height:10px;"></i> Email</div>
            <div class="auth-step-line active"></div>
            <div class="auth-step active"><span>2</span> Verify</div>
            <div class="auth-step-line"></div>
            <div class="auth-step"><span>3</span> New Pass</div>
          </div>

          <p class="otp-hint-text">Check your inbox for the 4-digit reset code. It expires in 10 minutes.<br>
          <span style="color:var(--color-green); font-weight:600;">Dev tip:</span> Check the server console/terminal for the code.</p>

          <div class="otp-input-row">
            <input type="text" class="code-input otp-digit reset-otp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="code-input otp-digit reset-otp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="code-input otp-digit reset-otp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
            <input type="text" class="code-input otp-digit reset-otp-digit" maxlength="1" inputmode="numeric" pattern="[0-9]" required>
          </div>

          <button id="reset-verify-btn" class="auth-submit-btn" style="margin-top:16px; background: linear-gradient(135deg, #f7971e, #e05c00);">
            <i data-lucide="arrow-right"></i>
            Continue
          </button>

          <div class="auth-card-links" style="flex-direction: column; gap: 6px;">
            <a href="#" id="resend-reset-btn" class="auth-link">Didn't receive a code? <strong>Resend</strong></a>
            <a href="#" id="back-to-forgot-btn" class="auth-link" style="font-size:11px; color:var(--text-muted);">
              <i data-lucide="chevron-left" style="width:11px;height:11px;"></i> Back
            </a>
          </div>
        </div>
      </div>
    `;
  }

  getResetNewPasswordHtml() {
    return `
      <div class="auth-page-wrapper">
        <div class="auth-brand-header">
          <div class="auth-brand-icon" style="background: linear-gradient(135deg, #00c6ff, #0072ff);">
            <i data-lucide="lock-keyhole"></i>
          </div>
          <h1 class="auth-brand-title">New Password</h1>
          <p class="auth-brand-sub">Create a strong, secure password</p>
        </div>

        <div class="auth-glass-card">
          <div class="auth-steps-indicator">
            <div class="auth-step completed"><i data-lucide="check" style="width:10px;height:10px;"></i> Email</div>
            <div class="auth-step-line active"></div>
            <div class="auth-step completed"><i data-lucide="check" style="width:10px;height:10px;"></i> Verify</div>
            <div class="auth-step-line active"></div>
            <div class="auth-step active"><span>3</span> New Pass</div>
          </div>

          <form id="reset-new-pass-form" class="auth-form">
            <div class="auth-field">
              <div class="auth-field-icon"><i data-lucide="lock"></i></div>
              <input type="password" id="reset-new-pass" placeholder="New password" required autocomplete="new-password">
            </div>
            <div class="auth-field">
              <div class="auth-field-icon"><i data-lucide="lock-keyhole"></i></div>
              <input type="password" id="reset-confirm-pass" placeholder="Confirm new password" required autocomplete="new-password">
            </div>

            <div id="reset-pass-strength" class="pass-strength-hints" style="display:none;"></div>

            <button type="submit" class="auth-submit-btn" style="background: linear-gradient(135deg, #00c6ff, #0072ff);">
              <i data-lucide="check-circle"></i>
              Set New Password
            </button>
          </form>

          <div class="auth-card-links">
            <span style="font-size:10px; color:var(--text-muted);">Must include uppercase, lowercase, digit &amp; symbol</span>
          </div>
        </div>
      </div>
    `;
  }

  getLockScreenHtml() {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    
    let reasonText = 'Enter Passcode';
    if (this.lockScreenReason === 'disarm-sos') reasonText = 'ENTER PIN TO CANCEL SOS';
    if (this.lockScreenReason === 'disarm-timer') reasonText = 'ENTER PIN TO DISARM TIMER';

    return `
      <div class="lock-screen-container">
        <div class="lock-clock">
          <h1 id="lock-time-val">${timeStr}</h1>
          <p>${dateStr}</p>
        </div>
        
        <div style="text-align:center; width:100%;">
          <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">
            ${reasonText}
          </div>
          
          <div class="passcode-dots" style="justify-content:center;">
            <span class="passcode-dot"></span>
            <span class="passcode-dot"></span>
            <span class="passcode-dot"></span>
            <span class="passcode-dot"></span>
          </div>
        </div>
        
        <div class="lock-keypad">
          <button class="keypad-btn" data-key="1">1<span class="keypad-sub">o_o</span></button>
          <button class="keypad-btn" data-key="2">2<span class="keypad-sub">abc</span></button>
          <button class="keypad-btn" data-key="3">3<span class="keypad-sub">def</span></button>
          
          <button class="keypad-btn" data-key="4">4<span class="keypad-sub">ghi</span></button>
          <button class="keypad-btn" data-key="5">5<span class="keypad-sub">jkl</span></button>
          <button class="keypad-btn" data-key="6">6<span class="keypad-sub">mno</span></button>
          
          <button class="keypad-btn" data-key="7">7<span class="keypad-sub">pqrs</span></button>
          <button class="keypad-btn" data-key="8">8<span class="keypad-sub">tuv</span></button>
          <button class="keypad-btn" data-key="9">9<span class="keypad-sub">wxyz</span></button>
          
          <button class="keypad-btn empty-key" disabled style="opacity:0.3; background:rgba(255,255,255,0.02);"></button>
          <button class="keypad-btn" data-key="0">0<span class="keypad-sub">+</span></button>
          <button class="keypad-btn" data-key="delete" style="font-size:11px; background:rgba(255,255,255,0.02); color:var(--text-secondary);"><i data-lucide="delete"></i></button>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:0 24px; margin-top:10px;">
          <div class="lock-footer" id="lock-footer-action" style="cursor:pointer; font-size:12px; color:var(--text-secondary);">
            Emergency Call
          </div>
          <button id="lock-biometric-btn" class="sim-action-btn small" style="border-radius:50%; width:38px; height:38px; padding:0; display:flex; align-items:center; justify-content:center; border-color:var(--accent-blue); background:rgba(255,255,255,0.05); color:var(--accent-blue); cursor:pointer;">
            <i data-lucide="fingerprint" style="width:18px; height:18px; display:block;"></i>
          </button>
        </div>
      </div>
    `;
  }

  getHomeHtml() {
    const isSos = this.sosManager.isActive;
    const selectedType = this.sosActiveIncident ? this.sosActiveIncident.type : 'Personal Threat';
    
    // Custom emergency category types list
    const categories = [
      { val: 'Personal Threat', icon: 'user-x' },
      { val: 'Kidnapping Risk', icon: 'shield-alert' },
      { val: 'Physical Assault', icon: 'alert-triangle' },
      { val: 'Medical Emergency', icon: 'heart-pulse' },
      { val: 'Robbery', icon: 'skull' },
      { val: 'Harassment / Stalking', icon: 'eye' }
    ];

    return `
      <div class="home-container">
        <!-- Pulse SOS button -->
        <div class="sos-button-container">
          <div class="sos-pulse-ring"></div>
          <div class="sos-pulse-ring-2"></div>
          <button class="sos-main-btn" id="home-sos-btn">
            SOS
            <span class="sos-btn-sub">${isSos ? 'ACTIVE' : 'PRESS'}</span>
          </button>
        </div>

        <div class="emergency-selector-label">Emergency Category</div>
        <div class="emergency-types-grid">
          ${categories.map(cat => {
            const selClass = cat.val === selectedType ? 'selected' : '';
            return `
              <div class="type-select-card ${selClass}" data-type="${cat.val}">
                <i data-lucide="${cat.icon}"></i>
                <span>${cat.val}</span>
              </div>
            `;
          }).join('')}
        </div>

        <div class="form-group" style="width:100%; margin-top:5px;">
          <label>Custom Threat Alert (Optional)</label>
          <input type="text" id="home-custom-type" placeholder="Type custom threat details..." style="font-size:12px; padding:8px 12px;">
        </div>

        <!-- Active SOS Cancel button -->
        <div style="display:flex; justify-content:center; width:100%; gap:8px; margin-top:5px;">
          ${isSos ? `
            <button class="btn-danger full-width" id="home-cancel-sos" style="font-size:12px; padding:8px 12px;">
              <i data-lucide="slash"></i> Deactivate Emergency Alert
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  getContactsHtml() {
    const contacts = this.contactsManager.getContacts();
    
    return `
      <div class="screen-header">
        <h2>Emergency Contacts</h2>
        <p>Minimum 1 required, Maximum 10 contacts</p>
      </div>
      
      <div class="contact-list-container">
        ${contacts.length === 0 ? `
          <div class="empty-contacts-view">
            <p>No emergency contacts added yet.</p>
          </div>
        ` : contacts.map(c => `
          <div class="contact-card-mobile">
            <div class="contact-card-details">
              <h4 style="font-weight:600;">${c.name}</h4>
              <p>${c.phone}</p>
              <span class="contact-relation-badge">${c.relationship}</span>
            </div>
            <div class="contact-card-actions">
              <button class="contact-icon-btn delete" data-id="${c.id}"><i data-lucide="trash-2" style="width:16px;"></i></button>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="border-top: 1px solid var(--border-glass); padding-top:15px; margin-top:10px; margin-bottom:50px;">
        <h3 style="font-size:14px; margin-bottom:10px; color:var(--accent-blue);">Add New Contact</h3>
        <form id="add-contact-form" style="display:flex; flex-direction:column; gap:8px;">
          <input type="text" id="c-name" placeholder="Full Name" required style="font-size:12px; padding:8px;">
          <input type="tel" id="c-phone" placeholder="Phone Number" required style="font-size:12px; padding:8px;">
          <input type="email" id="c-email" placeholder="Email Address" required style="font-size:12px; padding:8px;">
          <select id="c-relationship" style="font-size:12px; padding:8px;">
            <option value="Parent">Parent</option>
            <option value="Guardian">Guardian</option>
            <option value="Friend">Friend</option>
            <option value="Spouse">Spouse</option>
            <option value="Security Contact">Security Contact</option>
            <option value="Custom">Custom</option>
          </select>
          <button type="submit" class="btn-primary" style="font-size:12px; padding:8px;"><i data-lucide="plus"></i> Add Contact</button>
        </form>
      </div>
    `;
  }

  getTimersHtml() {
    const isTimerActive = this.timersManager.activeTimerType !== null;
    const remaining = this.timersManager.remainingSeconds;
    
    return `
      <div class="screen-header">
        <h2>Safety Timer Checks</h2>
        <p>Automatic triggers if you fail to check-in</p>
      </div>
      
      <div class="timers-tabs-content">
        ${isTimerActive ? `
          <!-- Active Timer View -->
          <div class="countdown-box">
            <h3 style="font-size:13px; color:var(--text-secondary);">
              ACTIVE COUNTDOWN: ${this.timersManager.activeTimerType.toUpperCase()}
            </h3>
            <div class="countdown-timer-value" id="timer-countdown-val">
              ${this.timersManager.formatTime(remaining)}
            </div>
            <button id="cancel-countdown-btn" class="btn-danger" style="width:100%; font-size:13px; padding:8px;">
              Cancel Timer (Requires PIN)
            </button>
          </div>
        ` : `
          <!-- Timer setup selection -->
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); border-radius:10px; padding:15px;">
              <h3 style="font-size:13px; margin-bottom:8px; color:var(--accent-blue);">⏰ Simple Safety Countdown</h3>
              <p style="font-size:10px; color:var(--text-secondary); margin-bottom:12px;">Trigger SOS if you do not confirm check-in within interval.</p>
              <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
                <button class="btn-secondary timer-preset-btn" data-time="10">10 Secs</button>
                <button class="btn-secondary timer-preset-btn" data-time="30">30 Secs</button>
                <button class="btn-secondary timer-preset-btn" data-time="60">1 Min</button>
              </div>
            </div>

            <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); border-radius:10px; padding:15px;">
              <h3 style="font-size:13px; margin-bottom:8px; color:var(--accent-blue);">🚶 Safe Arrival Check-in</h3>
              <p style="font-size:10px; color:var(--text-secondary); margin-bottom:12px;">Start a trip countdown. Prompt check-in when duration expires.</p>
              <div style="display:flex; gap:8px;">
                <input type="number" id="arrival-duration-val" placeholder="Duration (seconds)" value="15" min="5" style="font-size:12px; padding:6px; flex:1; background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); border-radius:6px; color:white;">
                <button id="start-arrival-btn" class="btn-primary" style="font-size:11px; padding:6px 12px;">Start Trip</button>
              </div>
            </div>
            
            <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); border-radius:10px; padding:15px;">
              <h3 style="font-size:13px; margin-bottom:8px; color:var(--accent-blue);">🗺️ Safe Walk Monitored Journey</h3>
              <p style="font-size:10px; color:var(--text-secondary); margin-bottom:12px;">Shares GPS tracking paths. Triggers alarm if you deviate from route.</p>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${this.locationManager.safeWalkActive ? `
                  <button id="stop-safewalk-btn" class="btn-danger" style="font-size:12px; padding:8px;">
                    Stop Journey (Arrived Safely)
                  </button>
                ` : `
                  ${this.locationManager.customRoutePlanning ? `
                    <div id="route-planning-status" style="background: rgba(255, 153, 0, 0.15); border: 1px solid rgba(255,153,0,0.4); padding: 8px; border-radius: 8px; font-size: 10px; margin-bottom: 4px; text-align: center; color: var(--color-orange);">
                      Tap map positions to add route lines.<br>Waypoints: <strong id="route-waypoint-count">${this.locationManager.plannedRoute.length}</strong>
                    </div>
                    <div style="display: flex; gap: 6px; width: 100%;">
                      <button id="start-safewalk-btn" class="btn-primary" style="font-size:11px; padding:8px; flex: 1.5;">
                        Start Monitored Journey
                      </button>
                      <button id="clear-custom-route-btn" class="btn-secondary" style="font-size:11px; padding:8px; color: var(--primary-red); border-color: rgba(255,46,99,0.3); flex: 1;">
                        Clear
                      </button>
                    </div>
                  ` : `
                    <button id="start-custom-route-btn" class="btn-secondary" style="font-size:11px; padding:8px; border-color: var(--accent-blue); color: var(--accent-blue); width: 100%; margin-bottom: 4px;">
                      <i data-lucide="edit-3"></i> Plan Custom Route on Map
                    </button>
                    <button id="start-safewalk-btn" class="btn-primary" style="font-size:11px; padding:8px; width: 100%;">
                      Start Default Monitored Walk
                    </button>
                  `}
                `}
              </div>
            </div>
          </div>
        `}
      </div>
    `;
  }

  getZonesHtml() {
    const zones = this.locationManager.safetyZones;
    return `
      <div class="screen-header" style="margin-bottom: 8px;">
        <h2>Safety Zones & Services</h2>
        <p>Search addresses, tap map to place safe zones</p>
      </div>
      
      <!-- Geocoding Location Search Bar -->
      <div class="map-search-bar" style="display: flex; gap: 6px; margin-bottom: 8px;">
        <input type="text" id="map-search-input" placeholder="Search address/landmark..." style="flex: 1; padding: 8px 10px; font-size: 12px; border: 1px solid var(--border-glass); border-radius: 8px; background: rgba(0,0,0,0.25); color: white; outline: none;">
        <button id="map-search-btn" class="btn-primary" style="padding: 0 12px; font-size: 12px; display: flex; align-items: center; justify-content: center; width: auto; margin: 0;" title="Search Location">
          <i data-lucide="search" style="width: 14px; height: 14px;"></i>
        </button>
      </div>

      <div id="user-zones-map" style="height:170px; border-radius:12px; border:1px solid var(--border-glass); margin-bottom:10px; overflow:hidden;"></div>
      
      <div class="map-assistance-controls" style="border-radius:10px; margin-bottom:15px;">
        <span style="font-size:10px; font-weight:700; width:100%; color:var(--text-secondary); margin-bottom:2px;">NEARBY SERVICES:</span>
        <button class="map-control-btn active" data-category="police"><i data-lucide="shield"></i> Police</button>
        <button class="map-control-btn" data-category="hospital"><i data-lucide="heart-pulse"></i> Medical</button>
        <button class="map-control-btn" data-category="fire"><i data-lucide="flame"></i> Fire</button>
        <button class="map-control-btn" data-category="security"><i data-lucide="eye"></i> Guards</button>
      </div>

      <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); border-radius:10px; padding:10px; margin-bottom:15px;">
        <h3 style="font-size:12px; color:var(--accent-blue); margin-bottom:2px;">Create Safe Zone</h3>
        <span id="selected-location-label" style="font-size: 9px; color: var(--text-muted); display: block; margin-bottom: 6px;">Target: Current Device GPS</span>
        <form id="add-zone-form" style="display:flex; gap:6px;">
          <input type="text" id="zone-name" placeholder="Zone name (e.g. Home)" required style="font-size:11px; padding:6px; flex:1; background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); border-radius:6px; color:white;">
          <input type="number" id="zone-radius" placeholder="Radius (m)" value="100" required style="font-size:11px; padding:6px; width:70px; background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); border-radius:6px; color:white;">
          <button type="submit" class="btn-primary" style="font-size:11px; padding:6px 12px;">Add</button>
        </form>
      </div>

      <div style="margin-bottom:50px;">
        <h3 style="font-size:12px; margin-bottom:6px; color:var(--text-secondary);">Your Safe Zones</h3>
        <div id="zones-list-container" style="display:flex; flex-direction:column; gap:6px;">
          ${zones.length === 0 ? `
            <div style="font-size:10px; color:var(--text-muted); text-align:center; padding:10px; background:rgba(0,0,0,0.1); border-radius:6px;">No custom safe zones saved.</div>
          ` : zones.map(z => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border-glass); border-radius:6px; padding:6px 10px; font-size:11px;">
              <div>
                <strong>${z.name}</strong> (${z.radius}m)
                <div style="font-size:8px; color:var(--text-muted);">${z.lat.toFixed(5)}, ${z.lng.toFixed(5)}</div>
              </div>
              <button class="delete-zone-btn" data-id="${z.id}" style="background:none; border:none; color:var(--primary-red); cursor:pointer;"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  getHistoryHtml() {
    const list = this.historyManager.getIncidents();
    
    return `
      <div class="screen-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
        <div>
          <h2>Incident Logs</h2>
          <p>Past emergency alerts and evidence folders</p>
        </div>
        <button id="btn-add-mock-log" class="btn-primary" style="font-size:11px; padding:6px 10px; border-radius:8px; display:flex; align-items:center; gap:4px; width: auto; margin: 0;">
          <i data-lucide="plus-circle" style="width:12px; height:12px;"></i> Add Log
        </button>
      </div>
      
      <div class="history-list" style="margin-bottom:60px;">
        ${list.length === 0 ? `
          <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:12px; background:rgba(0,0,0,0.1); border-radius:10px;">
            No historical logs saved yet.
          </div>
        ` : list.map(inc => `
          <div class="history-item-card">
            <div class="history-item-header">
              <span class="history-item-type">${inc.type}</span>
              <span class="history-item-date">${inc.date} | ${inc.startTime}</span>
            </div>
            <div class="history-item-details">
              <div>Duration: <strong>${inc.duration}</strong></div>
              <div class="history-evidence-indicator">
                <span><i data-lucide="camera" style="width:10px; vertical-align:middle;"></i> ${inc.photos ? inc.photos.length : 0} Snaps</span>
                <span><i data-lucide="mic" style="width:10px; vertical-align:middle;"></i> ${inc.audioRecordingUrl ? 'Audio Log' : 'No Audio'}</span>
              </div>
            </div>
            <div style="display:flex; gap:8px; margin-top:10px;">
              <button class="history-item-replay-btn" data-incid="${inc.id}" style="flex: 1; padding: 6px 12px; font-size: 11px;">
                <i data-lucide="play" style="width:10px; vertical-align:middle;"></i> Replay
              </button>
              <button class="history-item-delete-btn" data-incid="${inc.id}" style="background:rgba(255, 46, 99, 0.1); border:1px solid rgba(255,46,99,0.25); color:var(--primary-red); border-radius:8px; padding:6px 12px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:var(--transition-smooth);" title="Delete Log">
                <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  getSettingsHtml() {
    const config = this.sosManager.config;
    const evidenceConfig = this.evidenceCollector.config;
    
    return `
      <div class="screen-header">
        <h2>Preferences</h2>
        <p>Customize silent triggers & alerts</p>
      </div>
      
      <div class="settings-list">
        
        <span class="settings-group-title">Hardware Silent Triggers</span>
        
        <div class="setting-row">
          <div class="setting-label-block">
            <span class="setting-title">Power Button Trigger</span>
            <span class="setting-desc">Press power button multiple times</span>
          </div>
          <select id="set-power-count" class="sim-select" style="padding:4px; font-size:11px;">
            <option value="3" ${config.powerTapThreshold === 3 ? 'selected' : ''}>3 Taps</option>
            <option value="5" ${config.powerTapThreshold === 5 ? 'selected' : ''}>5 Taps</option>
            <option value="7" ${config.powerTapThreshold === 7 ? 'selected' : ''}>7 Taps</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-label-block">
            <span class="setting-title">Shake Device Trigger</span>
            <span class="setting-desc">Triggers alert on phone shake</span>
          </div>
          <label class="toggle-container">
            <input type="checkbox" id="set-shake-enabled" ${config.shakeEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-label-block">
            <span class="setting-title">Geofence Auto-SOS Check-in</span>
            <span class="setting-desc">Triggers check-in when exiting safe zones</span>
          </div>
          <label class="toggle-container">
            <input type="checkbox" id="set-geofence-enabled" ${config.geofenceAutoSosEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <span class="settings-group-title">Emergency Health Profile</span>
        <div class="setting-row" style="cursor:pointer;" id="btn-open-medical-profile">
          <div class="setting-label-block">
            <span class="setting-title" style="color: var(--accent-blue); display: flex; align-items: center; gap: 6px;">
              <i data-lucide="heart-handshake" style="width:16px; height:16px;"></i> Health & Medical Card
            </span>
            <span class="setting-desc">Allergies, medications, blood group & instructions</span>
          </div>
          <i data-lucide="chevron-right" style="width:18px; height:18px; color: var(--text-muted);"></i>
        </div>

        <span class="settings-group-title">Evidence Capture Settings</span>
        
        <div class="setting-row">
          <div class="setting-label-block">
            <span class="setting-title">Camera Snapshot Source</span>
            <span class="setting-desc">Select cameras to trigger</span>
          </div>
          <select id="set-camera-mode" class="sim-select" style="padding:4px; font-size:11px;">
            <option value="front" ${evidenceConfig.cameraMode === 'front' ? 'selected' : ''}>Front Only</option>
            <option value="back" ${evidenceConfig.cameraMode === 'back' ? 'selected' : ''}>Back Only</option>
            <option value="both" ${evidenceConfig.cameraMode === 'both' ? 'selected' : ''}>Both Cameras</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-label-block">
            <span class="setting-title">Image Frequency</span>
            <span class="setting-desc">Snapshot rates in emergency</span>
          </div>
          <select id="set-camera-frequency" class="sim-select" style="padding:4px; font-size:11px;">
            <option value="0" ${evidenceConfig.captureFrequency === 0 ? 'selected' : ''}>Once on startup</option>
            <option value="30" ${evidenceConfig.captureFrequency === 30 ? 'selected' : ''}>Every 30 secs</option>
            <option value="60" ${evidenceConfig.captureFrequency === 60 ? 'selected' : ''}>Every 1 min</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-label-block">
            <span class="setting-title">Enable Video Telemetry</span>
            <span class="setting-desc">Collect background video metadata</span>
          </div>
          <label class="toggle-container">
            <input type="checkbox" id="set-video-enabled" ${evidenceConfig.videoEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <span class="settings-group-title">Emergency Alert Messaging</span>
        
        <div class="setting-row" style="flex-direction:column; align-items:stretch; gap:6px;">
          <span class="setting-title">Custom Panic Message Template</span>
          <textarea id="set-panic-template" style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); color:white; border-radius:6px; font-size:11px; padding:6px; font-family:var(--font-body); resize:none; height:50px;">${config.selectedTemplate}</textarea>
        </div>
        
        <div style="margin-top:10px; margin-bottom:50px; display:flex; gap:10px;">
          <button id="save-settings-btn" class="btn-primary flex-1" style="font-size:12px; padding:8px;">Save Options</button>
          <button id="user-logout-btn" class="btn-secondary" style="font-size:12px; padding:8px; color:var(--primary-red);"><i data-lucide="log-out"></i> Logout</button>
        </div>
      </div>
    `;
  }

  getMedicalProfileHtml() {
    const user = this.authManager.currentUser || {};
    const dobValue = user.dob ? user.dob : '';
    const bloodGroup = user.bloodGroup || '';
    const medicalConditions = user.medicalConditions || '';
    const emergencyNotes = user.emergencyNotes || '';
    const homeAddress = user.homeAddress || '';

    return `
      <div class="screen-header">
        <h2>Emergency Health Card</h2>
        <p>Information accessible by responders during SOS</p>
      </div>
      <div class="auth-container">
        <form id="medical-profile-form" style="display:flex; flex-direction:column; gap:10px; max-height: 480px; overflow-y: auto; padding-right:4px; margin-bottom: 50px;">
          <div class="form-group">
            <label>Date of Birth</label>
            <input type="date" id="med-dob" value="${dobValue}" style="font-size:12px; padding:8px; width:100%; border-radius: 6px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.2); color: white;">
          </div>
          <div class="form-group">
            <label>Blood Group</label>
            <select id="med-blood" style="font-size:12px; padding:8px; width:100%; border-radius: 6px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.2); color: white;">
              <option value="" ${bloodGroup === '' ? 'selected' : ''}>Select Blood Group</option>
              <option value="A+" ${bloodGroup === 'A+' ? 'selected' : ''}>A+</option>
              <option value="A-" ${bloodGroup === 'A-' ? 'selected' : ''}>A-</option>
              <option value="B+" ${bloodGroup === 'B+' ? 'selected' : ''}>B+</option>
              <option value="B-" ${bloodGroup === 'B-' ? 'selected' : ''}>B-</option>
              <option value="AB+" ${bloodGroup === 'AB+' ? 'selected' : ''}>AB+</option>
              <option value="AB-" ${bloodGroup === 'AB-' ? 'selected' : ''}>AB-</option>
              <option value="O+" ${bloodGroup === 'O+' ? 'selected' : ''}>O+</option>
              <option value="O-" ${bloodGroup === 'O-' ? 'selected' : ''}>O-</option>
            </select>
          </div>
          <div class="form-group">
            <label>Medical Conditions / Allergies / Medications</label>
            <textarea id="med-conditions" placeholder="e.g. Asthma, Penicillin allergy, takes Insulin" style="font-size:12px; padding:8px; width:100%; height:60px; resize:none; border-radius: 6px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.2); color: white; font-family: var(--font-body);">${medicalConditions}</textarea>
          </div>
          <div class="form-group">
            <label>Custom Emergency Instructions</label>
            <textarea id="med-instructions" placeholder="e.g. Contacts have key to front door. Inhaler is in my front backpack pocket." style="font-size:12px; padding:8px; width:100%; height:60px; resize:none; border-radius: 6px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.2); color: white; font-family: var(--font-body);">${emergencyNotes}</textarea>
          </div>
          <div class="form-group">
            <label>Home Address</label>
            <textarea id="med-address" placeholder="123 Safe St, City, Country" style="font-size:12px; padding:8px; width:100%; height:50px; resize:none; border-radius: 6px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.2); color: white; font-family: var(--font-body);">${homeAddress}</textarea>
          </div>
          <div style="display:flex; gap:10px; margin-top:10px;">
            <button type="submit" class="btn-primary flex-1" style="font-size:12px; padding:8px;">Save Card</button>
            <button type="button" id="cancel-medical-btn" class="btn-secondary" style="font-size:12px; padding:8px;">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  getActiveSosHtml() {
    const inc = this.sosActiveIncident || { type: 'Personal Threat' };
    
    return `
      <div class="active-sos-screen">
        <div class="danger-glow-icon">
          <i data-lucide="alert-triangle" style="width:36px; height:36px;"></i>
        </div>
        
        <div>
          <div class="active-sos-title">Emergency SOS Active</div>
          <p style="font-size:11px; color:var(--text-secondary); margin-top:5px;">Distress signals dispatched silently</p>
        </div>

        <div style="position: relative; width: 120px; height: 120px; margin: 10px auto;">
          <video id="active-sos-cam-preview" autoplay playsinline muted style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary-red); box-shadow: 0 0 20px var(--primary-red-glow); background: #000;"></video>
          <div style="position: absolute; top: 5px; right: 5px; width: 12px; height: 12px; border-radius: 50%; background-color: var(--primary-red); animation: pulse-dot 1.2s infinite alternate; border: 2px solid white;"></div>
        </div>

        <div style="background:rgba(255, 46, 99, 0.08); border:1px solid var(--primary-red-glow); padding:10px 14px; border-radius:8px; font-size:11px; max-width:280px; width: 100%; text-align: center;">
          <div>Alert Type: <strong>${inc.type}</strong></div>
          <div style="margin-top:4px; font-size:9px; color:var(--text-muted);">Audio recording & GPS tracking running.</div>
        </div>

        <!-- Audio Recording Bounce bars -->
        <div class="audio-visualizer-box">
          <div class="vis-bar"></div>
          <div class="vis-bar"></div>
          <div class="vis-bar"></div>
          <div class="vis-bar"></div>
          <div class="vis-bar"></div>
          <div class="vis-bar"></div>
          <div class="vis-bar"></div>
        </div>

        <div style="width:100%; padding:0 15px; display:flex; flex-direction:column; gap:8px;">
          <button id="sos-disarm-btn" class="btn-danger" style="font-size:12px; padding:10px;">
            Cancel Distress Alert (Requires PIN)
          </button>
        </div>
      </div>
    `;
  }

  // --- PAGE SPECIFIC BINDING LOGIC ---
  bindPageSpecificEvents() {
    
    // 1. LOGIN SCREEN
    if (this.currentScreenState === 'login') {
      const loginForm = document.getElementById('user-login-form');
      if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = document.getElementById('login-email').value;
          const pass = document.getElementById('login-password').value;
          
          try {
            const user = await this.authManager.login(email, pass);
            this.initUserSession(user);
            
            // Go to lock screen to verifyPIN lock
            this.currentScreenState = 'lock-screen';
            this.lockScreenReason = 'normal-unlock';
            this.renderActivePage();
            
            this.showToast('Login Success', `Welcome back, ${user.name}!`, 'success');
          } catch (err) {
            this.showToast('Login Error', err.message, 'error');
          }
        });
      }

      document.getElementById('link-signup')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.currentScreenState = 'signup';
        this.renderActivePage();
      });

      document.getElementById('link-forgot-pass')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.currentScreenState = 'forgot-password';
        this.renderActivePage();
      });
    }

    // 2. SIGNUP SCREEN
    if (this.currentScreenState === 'signup') {
      const signupForm = document.getElementById('user-signup-form');
      if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = document.getElementById('reg-name').value;
          const email = document.getElementById('reg-email').value;
          const phone = document.getElementById('reg-phone').value;
          const password = document.getElementById('reg-password').value;
          const pin = document.getElementById('reg-pin').value;

          const validation = this.authManager.validatePassword(password);
          if (!validation.isValid) {
            this.showToast('Password Too Weak', 'Please satisfy uppercase, lowercase, digit, and symbol constraints.', 'error');
            return;
          }

          // Save temporary signup data to instantiate during resend
          this.tempSignupData = { name, email, phone, password, pin };
          
          this.showToast('Sending OTP', 'Dispatching verification email...', 'info');
          this.authManager.sendOTP(this.tempSignupData)
            .then(() => {
              this.currentSignupEmail = email;
              this.showToast('Code Sent', `A verification code was sent to ${email}`, 'success');
              this.currentScreenState = 'verify-code';
              this.renderActivePage();
            })
            .catch(err => {
              this.showToast('Signup Error', err.message, 'error');
            });
        });
      }

      document.getElementById('link-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.currentScreenState = 'login';
        this.renderActivePage();
      });
    }

    // 3. FORGOT PASSWORD
    if (this.currentScreenState === 'forgot-password') {
      const forgotForm = document.getElementById('forgot-form');
      if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = document.getElementById('forgot-email').value.trim();
          if (!email) return;

          try {
            const submitBtn = forgotForm.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

            await this.authManager.forgotPassword(email);

            // Store email for subsequent screens
            this.tempResetEmail = email;
            this.tempResetOtp = null;

            this.showToast('Code Sent', 'Check your email or server console for the 4-digit code.', 'success');
            this.currentScreenState = 'reset-verify';
            this.renderActivePage();
          } catch (err) {
            this.showToast('Error', err.message || 'Reset request failed.', 'error');
            const submitBtn = forgotForm.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-lucide="send"></i> Send Reset Code'; lucide.createIcons(); }
          }
        });
      }

      document.getElementById('link-login-back')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.currentScreenState = 'login';
        this.renderActivePage();
      });
    }

    // 4. VERIFY CODE
    if (this.currentScreenState === 'verify-code') {
      // FIX: scope to .otp-digit only — avoids picking up .reset-otp-digit inputs
      const codeInputs = document.querySelectorAll('.otp-digit');

      // Auto-focus the first input
      setTimeout(() => codeInputs[0]?.focus(), 100);
      
      // Auto focus jumping helper with filled class and backspace support
      codeInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
          // Only allow digits
          e.target.value = e.target.value.replace(/[^0-9]/g, '');
          if (e.target.value) {
            e.target.classList.add('filled');
            if (index < codeInputs.length - 1) {
              codeInputs[index + 1].focus();
            }
            // FIX: defer auto-submit by 50ms so all input events settle (prevents paste race condition)
            const allFilled = Array.from(codeInputs).every(i => i.value.length === 1);
            if (allFilled) {
              setTimeout(() => document.getElementById('verify-submit-btn')?.click(), 50);
            }
          } else {
            e.target.classList.remove('filled');
          }
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !e.target.value && index > 0) {
            codeInputs[index - 1].focus();
            codeInputs[index - 1].value = '';
            codeInputs[index - 1].classList.remove('filled');
          }
        });
      });

      document.getElementById('verify-submit-btn')?.addEventListener('click', async () => {
        const codeInputted = Array.from(codeInputs).map(i => i.value).join('');
        
        // FIX: disable button & show spinner to prevent duplicate submissions
        const verifyBtn = document.getElementById('verify-submit-btn');
        if (verifyBtn) {
          verifyBtn.disabled = true;
          verifyBtn.innerHTML = `<i data-lucide="loader-2" style="width:16px;height:16px;animation:spin 1s linear infinite;"></i><span>Verifying...</span>`;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        try {
          const user = await this.authManager.verifyAndSignUp(this.currentSignupEmail, codeInputted);
          this.initUserSession(user);
          
          // Show verification success message overlay inside phone screen
          const screen = document.getElementById('phone-screen-content');
          const successOverlay = document.createElement('div');
          successOverlay.className = 'verification-success-overlay';
          successOverlay.innerHTML = `
            <div class="success-content-card">
              <div class="success-checkmark-circle">
                <i data-lucide="check-circle-2" style="width: 48px; height: 48px; color: var(--color-green);"></i>
              </div>
              <h3>Verification Successful</h3>
              <p>Your account is now fully secured. Redirecting to your personal dashboard...</p>
            </div>
          `;
          if (screen) screen.appendChild(successOverlay);
          if (typeof lucide !== 'undefined') lucide.createIcons();

          this.tempSignupData = null;
          this.currentSignupEmail = null;

          // Redirect directly to dashboard after 2 seconds
          setTimeout(() => {
            if (successOverlay.parentNode) successOverlay.remove();
            this.currentScreenState = 'home';
            this.showToast('Welcome', `Account verified successfully!`, 'success');
            this.renderActivePage();
          }, 2000);
        } catch (err) {
          // Re-enable button so user can try again
          if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = `<i data-lucide="key-round"></i><span>Verify &amp; Activate Device</span>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }
          this.showToast('Verification Failed', err.message || 'Incorrect code. Please try again.', 'error');
        }
      });

      document.getElementById('resend-code-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.tempSignupData) {
          this.showToast('Resending OTP', 'Requesting new verification code...', 'info');
          this.authManager.sendOTP(this.tempSignupData)
            .then(() => {
              this.showToast('Code Resent', 'A new verification code was sent to your email.', 'success');
            })
            .catch(err => {
              this.showToast('Error', err.message, 'error');
            });
        } else {
          this.showToast('Error', 'Session expired. Please register again.', 'error');
          this.currentScreenState = 'signup';
          this.renderActivePage();
        }
      });
    }

    // 3b. RESET VERIFY (OTP entry for password reset)
    if (this.currentScreenState === 'reset-verify') {
      const resetDigits = document.querySelectorAll('.reset-otp-digit');

      // Auto-focus first digit
      setTimeout(() => resetDigits[0]?.focus(), 100);

      resetDigits.forEach((input, index) => {
        input.addEventListener('input', (e) => {
          e.target.value = e.target.value.replace(/[^0-9]/g, '');
          if (e.target.value) {
            e.target.classList.add('filled');
            if (index < resetDigits.length - 1) {
              resetDigits[index + 1].focus();
            }
            // Auto-trigger continue when all 4 filled
            const allFilled = Array.from(resetDigits).every(i => i.value.length === 1);
            if (allFilled) {
              document.getElementById('reset-verify-btn')?.click();
            }
          } else {
            e.target.classList.remove('filled');
          }
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !e.target.value && index > 0) {
            resetDigits[index - 1].focus();
            resetDigits[index - 1].value = '';
            resetDigits[index - 1].classList.remove('filled');
          }
        });
      });

      document.getElementById('reset-verify-btn')?.addEventListener('click', () => {
        const code = Array.from(resetDigits).map(i => i.value).join('');
        if (code.length !== 4) {
          this.showToast('Incomplete Code', 'Please enter all 4 digits.', 'error');
          return;
        }
        // Store code for the next screen to use
        this.tempResetOtp = code;
        this.currentScreenState = 'reset-new-password';
        this.renderActivePage();
      });

      document.getElementById('resend-reset-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!this.tempResetEmail) {
          this.currentScreenState = 'forgot-password';
          this.renderActivePage();
          return;
        }
        try {
          await this.authManager.forgotPassword(this.tempResetEmail);
          this.showToast('Code Resent', 'A new reset code has been sent.', 'success');
          // Clear existing inputs
          resetDigits.forEach(d => { d.value = ''; d.classList.remove('filled'); });
          resetDigits[0]?.focus();
        } catch (err) {
          this.showToast('Error', err.message, 'error');
        }
      });

      document.getElementById('back-to-forgot-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.currentScreenState = 'forgot-password';
        this.renderActivePage();
      });
    }

    // 3c. RESET NEW PASSWORD (set new password after OTP verified)
    if (this.currentScreenState === 'reset-new-password') {
      const form = document.getElementById('reset-new-pass-form');
      const newPassInput = document.getElementById('reset-new-pass');
      const confirmInput = document.getElementById('reset-confirm-pass');
      const strengthHints = document.getElementById('reset-pass-strength');

      // Live strength indicator
      newPassInput?.addEventListener('input', () => {
        const val = newPassInput.value;
        const checks = [
          { label: '8+ characters', ok: val.length >= 8 },
          { label: 'Uppercase letter', ok: /[A-Z]/.test(val) },
          { label: 'Lowercase letter', ok: /[a-z]/.test(val) },
          { label: 'A digit', ok: /[0-9]/.test(val) },
          { label: 'A special character', ok: /[^A-Za-z0-9]/.test(val) }
        ];
        const allPassed = checks.every(c => c.ok);
        if (strengthHints) {
          strengthHints.style.display = 'block';
          strengthHints.innerHTML = checks.map(c => `
            <span class="strength-item ${c.ok ? 'ok' : 'fail'}">
              <i data-lucide="${c.ok ? 'check-circle' : 'x-circle'}" style="width:11px;height:11px;"></i>
              ${c.label}
            </span>
          `).join('');
          lucide.createIcons();
        }
      });

      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const newPass = newPassInput?.value;
          const confirmPass = confirmInput?.value;

          if (newPass !== confirmPass) {
            this.showToast('Mismatch', 'Passwords do not match.', 'error');
            return;
          }

          const validation = this.authManager.validatePassword(newPass);
          if (!validation.isValid) {
            this.showToast('Weak Password', 'Password must have uppercase, lowercase, digit, and a special character.', 'error');
            return;
          }

          if (!this.tempResetEmail || !this.tempResetOtp) {
            this.showToast('Session Expired', 'Please start the reset process again.', 'error');
            this.currentScreenState = 'forgot-password';
            this.renderActivePage();
            return;
          }

          try {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Updating...'; }

            await this.authManager.resetPassword(this.tempResetEmail, this.tempResetOtp, newPass);

            // Clear temp reset state
            this.tempResetEmail = null;
            this.tempResetOtp = null;

            this.showToast('Password Reset!', 'Your password has been updated. Please login.', 'success');
            this.currentScreenState = 'login';
            this.renderActivePage();
          } catch (err) {
            this.showToast('Reset Failed', err.message || 'Invalid or expired code. Please try again.', 'error');
            // If code is wrong/expired, go back to OTP entry
            if (err.message && (err.message.includes('Invalid') || err.message.includes('expired'))) {
              this.tempResetOtp = null;
              this.currentScreenState = 'reset-verify';
              this.renderActivePage();
            } else {
              const submitBtn = form.querySelector('button[type="submit"]');
              if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-lucide="check-circle"></i> Set New Password'; lucide.createIcons(); }
            }
          }
        });
      }
    }

    // 5. LOCK SCREEN
    if (this.currentScreenState === 'lock-screen') {
      let passcodeVal = '';
      const dots = document.querySelectorAll('.passcode-dot');
      const keys = document.querySelectorAll('.keypad-btn');
      
      keys.forEach(key => {
        key.addEventListener('click', () => {
          const val = key.dataset.key;
          
          if (val === 'delete') {
            if (passcodeVal.length > 0) {
              passcodeVal = passcodeVal.slice(0, -1);
              dots[passcodeVal.length].classList.remove('active');
            }
          } else {
            if (passcodeVal.length < 4) {
              passcodeVal += val;
              dots[passcodeVal.length - 1].classList.add('active');
              
              if (passcodeVal.length === 4) {
                setTimeout(async () => {
                  await this.evaluateLockPasscode(passcodeVal);
                }, 200);
              }
            }
          }
        });
      });

      document.getElementById('lock-footer-action')?.addEventListener('click', () => {
        alert("Simulating emergency call dialer 911.");
      });

      document.getElementById('lock-biometric-btn')?.addEventListener('click', () => {
        this.showBiometricScanOverlay();
      });
    }

    // 6. HOME SCREEN (SOS BUTTON)
    if (this.currentScreenState === 'home') {
      const sosBtn = document.getElementById('home-sos-btn');
      if (sosBtn) {
        sosBtn.addEventListener('click', async () => {
          if (this.sosManager.isActive) {
            // Prompt lock screen to disarm
            this.currentScreenState = 'lock-screen';
            this.lockScreenReason = 'disarm-sos';
            this.renderActivePage();
          } else {
            // Select active type
            const activeTypeEl = document.querySelector('.type-select-card.selected');
            const customInput = document.getElementById('home-custom-type').value;
            
            const activeThreat = customInput.trim() || (activeTypeEl ? activeTypeEl.dataset.type : 'Personal Threat');
            await this.sosManager.activateSOS(activeThreat);
          }
        });
      }

      // Chip Selector clicks
      const chips = document.querySelectorAll('.type-select-card');
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          chips.forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
        });
      });


      // Cancel button
      document.getElementById('home-cancel-sos')?.addEventListener('click', () => {
        this.currentScreenState = 'lock-screen';
        this.lockScreenReason = 'disarm-sos';
        this.renderActivePage();
      });
    }

    // 7. CONTACTS SCREEN
    if (this.currentScreenState === 'contacts') {
      const addForm = document.getElementById('add-contact-form');
      if (addForm) {
        addForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const name = document.getElementById('c-name').value;
          const phone = document.getElementById('c-phone').value;
          const email = document.getElementById('c-email').value;
          const relationship = document.getElementById('c-relationship').value;
          
          try {
            await this.contactsManager.addContact({ name, phone, email, relationship });
            this.showToast('Contact Added', `${name} added to your list.`, 'success');
            await this.renderActivePage();
          } catch (err) {
            this.showToast('Contacts Limit', err.message, 'error');
          }
        });
      }

      // Delete buttons
      document.querySelectorAll('.contact-icon-btn.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const contactId = btn.dataset.id;
          try {
            await this.contactsManager.deleteContact(contactId);
            this.showToast('Contact Deleted', 'Contact removed from list.', 'success');
            await this.renderActivePage();
          } catch (err) {
            this.showToast('Rule Violation', err.message, 'error');
          }
        });
      });
    }

    // 8. TIMERS SCREEN
    if (this.currentScreenState === 'timers') {
      // Countdown cancel
      document.getElementById('cancel-countdown-btn')?.addEventListener('click', () => {
        this.currentScreenState = 'lock-screen';
        this.lockScreenReason = 'disarm-timer';
        this.renderActivePage();
      });

      // Preset preset timers
      document.querySelectorAll('.timer-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const seconds = parseInt(btn.dataset.time);
          this.timersManager.startSafetyTimer(seconds);
          this.renderActivePage();
        });
      });

      // Safe Arrival start
      document.getElementById('start-arrival-btn')?.addEventListener('click', () => {
        const val = parseInt(document.getElementById('arrival-duration-val').value) || 15;
        this.timersManager.startSafeArrivalTimer(val);
        this.renderActivePage();
      });

      // Monitored Safe Walk journey start/stop
      document.getElementById('start-custom-route-btn')?.addEventListener('click', () => {
        this.locationManager.customRoutePlanning = true;
        this.locationManager.plannedRoute = [{ lat: this.locationManager.lat, lng: this.locationManager.lng }];
        this.showToast('Planning Mode', 'Go to MAP tab and tap points to design custom path waypoints.', 'info');
        this.renderActivePage();
      });

      document.getElementById('clear-custom-route-btn')?.addEventListener('click', () => {
        this.locationManager.plannedRoute = [];
        if (this.locationManager.customRoutePolyline) {
          this.locationManager.customRoutePolyline.remove();
          this.locationManager.customRoutePolyline = null;
        }
        this.locationManager.customRouteMarkers.forEach(m => m.remove());
        this.locationManager.customRouteMarkers = [];
        this.locationManager.customRoutePlanning = false;
        this.showToast('Route Cleared', 'Custom Safe Walk route has been cleared.', 'info');
        this.renderActivePage();
      });

      document.getElementById('start-safewalk-btn')?.addEventListener('click', () => {
        if (!this.locationManager.customRoutePlanning) {
          this.locationManager.plannedRoute = [
            { lat: 40.7128, lng: -74.0060 },
            { lat: 40.7142, lng: -74.0050 },
            { lat: 40.7156, lng: -74.0040 },
            { lat: 40.7170, lng: -74.0030 },
            { lat: 40.7185, lng: -74.0015 }
          ];
          this.locationManager.startSafeWalk('Workplace');
        } else {
          this.locationManager.customRoutePlanning = false;
          this.locationManager.startSafeWalk('Custom Route');
        }
        this.renderActivePage();
      });

      document.getElementById('stop-safewalk-btn')?.addEventListener('click', () => {
        this.locationManager.stopSafeWalk();
        this.renderActivePage();
      });
    }

    // 9. SAFETY ZONES & MAP SERVICES
    if (this.currentScreenState === 'zones') {
      setTimeout(() => {
        this.locationManager.initUserMap('user-zones-map');
      }, 50);

      // Geocoding Search Handlers
      const searchInput = document.getElementById('map-search-input');
      const searchBtn = document.getElementById('map-search-btn');
      
      const performSearch = () => {
        const query = searchInput?.value.trim();
        if (query) {
          this.locationManager.searchAddress(query);
        }
      };

      searchBtn?.addEventListener('click', performSearch);
      searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          performSearch();
        }
      });

      // Bind category toggles
      const mapFilters = document.querySelectorAll('.map-control-btn');
      mapFilters.forEach(btn => {
        btn.addEventListener('click', () => {
          mapFilters.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          const cat = btn.dataset.category;
          this.locationManager.showNearbyAssistance(cat);
        });
      });

      // Bind add safe zone form
      document.getElementById('add-zone-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('zone-name').value;
        const radius = parseFloat(document.getElementById('zone-radius').value);
        const lat = this.locationManager.selectedLat;
        const lng = this.locationManager.selectedLng;
        
        await this.locationManager.addSafeZone(name, lat, lng, radius);
        this.showToast('Safe Zone Created', `${name} safe zone added at selected position.`, 'success');
        this.renderActivePage();
      });

      // Bind delete safe zone buttons
      document.querySelectorAll('.delete-zone-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const zoneId = btn.dataset.id;
          await this.locationManager.deleteSafeZone(zoneId);
          this.showToast('Safe Zone Deleted', 'Custom safe zone removed.', 'success');
          this.renderActivePage();
        });
      });
    }

    // 10. INCIDENT HISTORY DETAIL REPLAY & MANAGEMENT
    if (this.currentScreenState === 'history') {
      document.querySelectorAll('.history-item-replay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const incidentId = btn.dataset.incid;
          const incident = this.historyManager.getIncidents().find(i => i.id === incidentId);
          if (incident) {
            this.showIncidentReplayModal(incident);
          }
        });
      });

      document.querySelectorAll('.history-item-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const incidentId = btn.dataset.incid;
          if (confirm("Are you sure you want to delete this incident log?")) {
            const success = await this.historyManager.deleteIncident(incidentId);
            if (success) {
              this.showToast('Log Deleted', 'Incident log removed permanently.', 'success');
              this.logEvent(`Incident log ${incidentId} deleted by user.`, 'warning');
              this.renderActivePage();
            } else {
              this.showToast('Error', 'Could not delete incident log.', 'error');
            }
          }
        });
      });

      document.getElementById('btn-add-mock-log')?.addEventListener('click', async () => {
        const type = prompt("Enter emergency category name (e.g., robbery, harassment):", "Simulated Emergency");
        if (type) {
          const newLog = await this.historyManager.createMockIncident(type);
          if (newLog) {
            this.showToast('Log Created', 'Mock emergency log added successfully.', 'success');
            this.logEvent(`Mock incident log created: ${type}`, 'info');
            this.renderActivePage();
          }
        }
      });
    }

    // 11. OPTIONS / SETTINGS
    if (this.currentScreenState === 'settings') {
      const saveBtn = document.getElementById('save-settings-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const power = parseInt(document.getElementById('set-power-count').value);
          const shake = document.getElementById('set-shake-enabled').checked;
          const geofence = document.getElementById('set-geofence-enabled').checked;
          const cam = document.getElementById('set-camera-mode').value;
          const freq = parseInt(document.getElementById('set-camera-frequency').value);
          const vid = document.getElementById('set-video-enabled').checked;
          const msg = document.getElementById('set-panic-template').value;
          
          this.sosManager.saveSettings(shake, power, msg, geofence).then(() => {
            this.evidenceCollector.updateConfig({
              cameraMode: cam,
              captureFrequency: freq,
              videoEnabled: vid
            });

            this.showToast('Settings Saved', 'Trigger preferences updated on server.', 'success');
            this.logEvent('User preferences saved.', 'info');
          });
        });
      }

      // Logout button
      document.getElementById('user-logout-btn')?.addEventListener('click', () => {
        this.authManager.logout();
        this.currentScreenState = 'signup';
        this.showToast('Logged Out', 'Session terminated safely.', 'success');
        this.renderActivePage();
      });

      document.getElementById('btn-open-medical-profile')?.addEventListener('click', () => {
        this.currentScreenState = 'medical-profile';
        this.renderActivePage();
      });
    }

    // 13. MEDICAL PROFILE SCREEN
    if (this.currentScreenState === 'medical-profile') {
      document.getElementById('cancel-medical-btn')?.addEventListener('click', () => {
        this.currentScreenState = 'settings';
        this.renderActivePage();
      });

      const form = document.getElementById('medical-profile-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const dob = document.getElementById('med-dob').value;
          const bloodGroup = document.getElementById('med-blood').value;
          const medicalConditions = document.getElementById('med-conditions').value;
          const emergencyNotes = document.getElementById('med-instructions').value;
          const homeAddress = document.getElementById('med-address').value;

          try {
            await this.authManager.updateProfile({
              dob,
              bloodGroup,
              medicalConditions,
              emergencyNotes,
              homeAddress
            });
            this.showToast('Profile Updated', 'Emergency health card details saved successfully.', 'success');
            this.logEvent('Emergency health card details updated.', 'info');
            this.currentScreenState = 'settings';
            this.renderActivePage();
          } catch (err) {
            this.showToast('Update Error', err.message, 'error');
          }
        });
      }
    }

    // 12. ACTIVE SOS DISPLAY SCREEN
    if (this.currentScreenState === 'active-sos') {
      document.getElementById('sos-disarm-btn')?.addEventListener('click', () => {
        this.currentScreenState = 'lock-screen';
        this.lockScreenReason = 'disarm-sos';
        this.renderActivePage();
      });


    }
  }

  async evaluateLockPasscode(passcode) {
    const user = this.authManager.currentUser;
    if (!user) return;
    
    // Normal Unlock PIN check
    if (passcode === user.pin) {
      if (this.lockScreenReason === 'disarm-sos') {
        await this.sosManager.deactivateSOS();
      } else if (this.lockScreenReason === 'disarm-timer') {
        this.timersManager.clearAllTimers();
        this.showToast('Timer Disarmed', 'Passcode authenticated successfully.', 'success');
        this.currentScreenState = 'home';
      } else {
        this.currentScreenState = 'home';
      }
      this.renderActivePage();
    }
    // Failed PIN entry
    else {
      this.showToast('Access Denied', 'Incorrect passcode PIN entered.', 'error');
      
      const dots = document.querySelectorAll('.passcode-dot');
      dots.forEach(dot => dot.classList.remove('active'));
      
      this.logEvent('Failed passcode unlock attempt.', 'warning');
    }
  }

  showBiometricScanOverlay() {
    const screen = document.getElementById('phone-screen-content');
    if (!screen) return;

    const overlay = document.createElement('div');
    overlay.className = 'biometric-scan-overlay';
    overlay.innerHTML = `
      <div class="biometric-scanner-ring scanning">
        <div class="scanning-laser-line"></div>
        <i data-lucide="fingerprint"></i>
      </div>
      <div class="biometric-scan-label" id="biometric-status-txt">Scanning Fingerprint...</div>
    `;
    screen.appendChild(overlay);
    lucide.createIcons();

    setTimeout(() => {
      const ring = overlay.querySelector('.biometric-scanner-ring');
      const text = overlay.querySelector('#biometric-status-txt');
      if (ring && text) {
        ring.className = 'biometric-scanner-ring success';
        ring.innerHTML = '<i data-lucide="check"></i>';
        text.textContent = 'Identity Verified';
        lucide.createIcons();
      }

      setTimeout(async () => {
        overlay.remove();
        if (this.lockScreenReason === 'disarm-sos') {
          await this.sosManager.deactivateSOS();
        } else if (this.lockScreenReason === 'disarm-timer') {
          this.timersManager.clearAllTimers();
          this.showToast('Timer Disarmed', 'Biometric identity verified successfully.', 'success');
          this.currentScreenState = 'home';
        } else {
          this.currentScreenState = 'home';
        }
        this.renderActivePage();
      }, 800);
    }, 1500);
  }

  // --- REPLAY INCIDENT MODAL POPUP ---
  showIncidentReplayModal(inc) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(10,10,15,0.98)';
    modal.style.zIndex = '30000';
    modal.style.overflowY = 'auto';
    modal.style.padding = '30px';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.alignItems = 'center';
    
    modal.innerHTML = `
      <div style="width:100%; max-width:800px; background:var(--bg-card); border:1px solid var(--border-glass); border-radius:16px; padding:24px; display:flex; flex-direction:column; gap:20px; box-shadow: 0 10px 45px rgba(0,0,0,0.8);">
        <header style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-glass); padding-bottom:15px;">
          <div>
            <h2 style="font-size:20px; color:var(--primary-red);"><i data-lucide="archive"></i> Incident Replay Console</h2>
            <span style="font-size:11px; color:var(--text-secondary);">${inc.date} | Triggered at ${inc.startTime}</span>
          </div>
          <button id="close-replay-modal" class="btn-secondary" style="padding:6px 12px; font-size:12px;">Close</button>
        </header>

        <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:20px;">
          
          <!-- Map path -->
          <div>
            <h3 style="font-size:13px; margin-bottom:8px; color:var(--accent-blue);"><i data-lucide="map"></i> Route Replay</h3>
            <div id="replay-map-container" style="height:260px; border-radius:10px; overflow:hidden; border:1px solid var(--border-glass);"></div>
            <div style="font-size:10px; color:var(--text-muted); margin-top:6px;">Path compiled from ${inc.locationPath.length} coordinate snapshots.</div>
          </div>
          
          <!-- Media evidence -->
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div>
              <h3 style="font-size:13px; margin-bottom:8px; color:var(--accent-blue);"><i data-lucide="mic"></i> Audio Log</h3>
              ${inc.audioRecordingUrl ? `
                <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid var(--border-glass);">
                  <audio src="${inc.audioRecordingUrl.startsWith('mock') ? '' : inc.audioRecordingUrl}" controls style="width:100%; height:32px;"></audio>
                  <span style="font-size:9px; color:var(--text-muted); margin-top:4px; display:inline-block;">Secure blob audio evidence file format.</span>
                </div>
              ` : `
                <div style="font-size:11px; color:var(--text-muted); background:rgba(0,0,0,0.1); padding:10px; border-radius:8px; text-align:center; border:1px dashed var(--border-glass);">No audio logs found for this incident.</div>
              `}
            </div>

            <div>
              <h3 style="font-size:13px; margin-bottom:8px; color:var(--accent-blue);"><i data-lucide="camera"></i> Image Gallery</h3>
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(80px, 1fr)); gap:6px;">
                ${inc.photos && inc.photos.length > 0 ? inc.photos.map(p => `
                  <img src="${p.src}" style="width:100%; height:75px; object-fit:cover; border-radius:6px; border:1px solid var(--border-glass);">
                `).join('') : `
                  <div style="grid-column: 1/-1; font-size:11px; color:var(--text-muted); text-align:center; padding:10px;">No images captured.</div>
                `}
              </div>
            </div>
          </div>
        </div>

        <div style="border-top:1px solid var(--border-glass); padding-top:15px;">
          <h3 style="font-size:13px; margin-bottom:6px; color:var(--accent-blue);">Incident Narrative / User Notes</h3>
          <p style="font-size:12px; line-height:1.5; color:var(--text-secondary); background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid var(--border-glass);">
            ${inc.notes || 'No user logs added. Incident alert activated automatically via sensor triggers and closed safely.'}
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    lucide.createIcons();

    // Initialize Leaflet map on replay container
    try {
      const map = L.map('replay-map-container', { zoomControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      if (inc.locationPath && inc.locationPath.length > 0) {
        const polyCoords = inc.locationPath.map(pt => [pt.lat, pt.lng]);
        
        // Add marker for start and end
        L.marker(polyCoords[0]).addTo(map).bindPopup('Activation Location');
        L.marker(polyCoords[polyCoords.length - 1]).addTo(map).bindPopup('Disarm Location');
        
        // Add path line
        L.polyline(polyCoords, { color: '#ff2e63', weight: 4 }).addTo(map);
        
        // Fit bounds
        map.fitBounds(polyCoords, { padding: [20, 20] });
      } else {
        map.setView([40.7128, -74.0060], 13);
      }
    } catch (e) {
      console.error("Failed to initialize replay map", e);
    }

    document.getElementById('close-replay-modal').addEventListener('click', () => modal.remove());
  }
}

// Start application runtime after window loading
window.addEventListener('DOMContentLoaded', () => {
  const app = new AppOrchestrator();
  app.init();
});
