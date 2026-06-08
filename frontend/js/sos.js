/* ==========================================================================
   Silent SOS - SOS Engine & Triggers Evaluator (REST Integration)
   ========================================================================== */

export class SOSManager {
  constructor(app) {
    this.app = app;
    this.isActive = false;
    
    // Configurable SOS Settings
    this.config = {
      powerTapThreshold: 5,
      volumeSequence: ['up', 'down', 'up'],
      shakeEnabled: true,
      gestureSequence: [0, 4, 8],
      selectedTemplate: 'I am in danger. Please check my location. (Silent SOS)',
      batteryProtectionEnabled: true,
      geofenceAutoSosEnabled: false
    };
    
    // Trigger State Trackers
    this.powerTapCount = 0;
    this.lastPowerTapTime = 0;
    this.volumePressHistory = [];
    this.gestureInputBuffer = [];

    // Offline Sync Queue
    this.offlineQueue = JSON.parse(localStorage.getItem('silentsos_offline_queue') || '[]');
    window.addEventListener('online', () => this.flushOfflineQueue());
  }

  queueOfflineRequest(url, method, body) {
    this.offlineQueue.push({ url, method, body });
    localStorage.setItem('silentsos_offline_queue', JSON.stringify(this.offlineQueue));
    this.app.logEvent('Offline mode: Request cached in local queue.', 'warning');
  }

  async flushOfflineQueue() {
    if (this.offlineQueue.length === 0) return;
    this.app.logEvent('Network restored. Synchronizing offline distress logs...', 'success');
    this.app.showToast('Online Mode', 'Synchronizing offline cues with cloud database.', 'success');
    
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];
    localStorage.setItem('silentsos_offline_queue', '[]');
    
    for (const req of queue) {
      try {
        await fetch(req.url, {
          method: req.method,
          headers: this.getHeaders(),
          body: JSON.stringify(req.body)
        });
      } catch (err) {
        console.error('Failed to sync offline request, re-queueing:', err);
        this.offlineQueue.push(req);
        localStorage.setItem('silentsos_offline_queue', JSON.stringify(this.offlineQueue));
      }
    }
  }

  getHeaders() {
    const token = localStorage.getItem('silentsos_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/settings', { headers: this.getHeaders() });
      if (response.ok) {
        const settings = await response.json();
        this.config.shakeEnabled = settings.shakeEnabled;
        this.config.powerTapThreshold = settings.powerTapThreshold;
        this.config.selectedTemplate = settings.selectedTemplate;
        this.config.geofenceAutoSosEnabled = settings.geofenceAutoSosEnabled;
      }
    } catch (err) {
      console.error('Error loading settings from server:', err);
    }
  }

  async saveSettings(shakeEnabled, powerTapThreshold, selectedTemplate, geofenceAutoSosEnabled) {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ shakeEnabled, powerTapThreshold, selectedTemplate, geofenceAutoSosEnabled })
      });
      if (response.ok) {
        const settings = await response.json();
        this.config.shakeEnabled = settings.shakeEnabled;
        this.config.powerTapThreshold = settings.powerTapThreshold;
        this.config.selectedTemplate = settings.selectedTemplate;
        this.config.geofenceAutoSosEnabled = settings.geofenceAutoSosEnabled;
      }
    } catch (err) {
      console.error('Error saving settings to server:', err);
    }
  }

  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  // --- SOS STATE TRANSITIONS ---
  async activateSOS(emergencyType = 'Unspecified Threat') {
    if (this.isActive) return;
    
    this.isActive = true;
    const user = this.app.authManager.currentUser || { name: 'Jane Doe', phone: '+1 (555) 019-2834' };
    
    try {
      if (!navigator.onLine) {
        throw new Error('Browser is currently offline');
      }
      
      const response = await fetch('/api/sos/active', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          type: emergencyType,
          location: { lat: this.app.locationManager.lat, lng: this.app.locationManager.lng }
        })
      });

      if (response.ok) {
        this.app.sosActiveIncident = await response.json();
      } else {
        throw new Error('Could not start SOS session on server');
      }
    } catch (err) {
      console.error('Offline/fallback SOS session started:', err);
      this.queueOfflineRequest('/api/sos/active', 'POST', {
        type: emergencyType,
        location: { lat: this.app.locationManager.lat, lng: this.app.locationManager.lng }
      });
      
      // Local fallback
      const dateNow = new Date();
      this.app.sosActiveIncident = {
        id: 'incident_' + Date.now(),
        userName: user.name,
        userPhone: user.phone,
        startTime: dateNow.toLocaleTimeString(),
        date: dateNow.toISOString().split('T')[0],
        type: emergencyType,
        lastLocation: { lat: this.app.locationManager.lat, lng: this.app.locationManager.lng },
        locationPath: [{ 
          lat: this.app.locationManager.lat, 
          lng: this.app.locationManager.lng, 
          timestamp: dateNow.toLocaleTimeString() 
        }],
        photos: [],
        audioRecordingUrl: null,
        notes: ''
      };
    }

    // 1. Update Global Header Ribbon
    const statusRibbon = document.getElementById('global-sos-status');
    if (statusRibbon) {
      statusRibbon.className = 'status-ribbon sos-active';
      statusRibbon.querySelector('.status-text').textContent = `ACTIVE EMERGENCY: ${emergencyType}`;
    }

    // 2. Add GPS Icon to Phone Statusbar
    const gpsIndicator = document.getElementById('phone-gps-indicator');
    if (gpsIndicator) gpsIndicator.classList.remove('hidden');

    // 3. Start Geolocation & Evidence Tracking
    this.app.locationManager.startTracking();
    this.app.evidenceCollector.startAudioRecording();
    this.app.evidenceCollector.startCameraCapture();
    this.app.evidenceCollector.startVideoTelemetry();

    // 4. Send Alerts to Contacts
    this.dispatchAlertsToEmergencyContacts(user, emergencyType);

    // 5. Update UI View State
    this.app.logEvent(`SOS ACTIVATED (${emergencyType})`, 'critical');
    
    // Switch Emergency Contacts view badges
    const contactBadge = document.getElementById('contact-alert-badge');
    if (contactBadge) contactBadge.classList.remove('hidden');
    
    this.app.currentScreenState = 'active-sos';
    this.app.renderActivePage();
    
    // Update Admin dashboard metrics
    this.app.adminManager.updateAdminStats();
    this.app.syncActiveEmergencyData();
  }

  async deactivateSOS() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    // 1. Stop Trackers
    this.app.locationManager.stopTracking();
    this.app.evidenceCollector.stopAudioRecording();
    this.app.evidenceCollector.stopCameraCapture();
    this.app.evidenceCollector.stopVideoTelemetry();
    this.app.timersManager.clearAllTimers();

    let incidentObj = null;
    try {
      if (!navigator.onLine) {
        throw new Error('Browser is currently offline');
      }
      const response = await fetch('/api/sos/deactivate', {
        method: 'POST',
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        incidentObj = data.incident;
      }
    } catch (err) {
      console.error('Error deactivating SOS on server:', err);
      this.queueOfflineRequest('/api/sos/deactivate', 'POST', {});
    }

    if (!incidentObj && this.app.sosActiveIncident) {
      incidentObj = {
        ...this.app.sosActiveIncident,
        endTime: new Date().toLocaleTimeString(),
        duration: this.calculateDuration(this.app.sosActiveIncident.startTime, new Date().toLocaleTimeString())
      };
    }

    if (incidentObj) {
      this.app.historyManager.addIncident(incidentObj);
    }
    this.app.sosActiveIncident = null;

    // 3. Reset Global Status Ribbon
    const statusRibbon = document.getElementById('global-sos-status');
    if (statusRibbon) {
      statusRibbon.className = 'status-ribbon';
      statusRibbon.querySelector('.status-text').textContent = 'System Monitoring Active';
    }

    // 4. Remove GPS indicator
    const gpsIndicator = document.getElementById('phone-gps-indicator');
    if (gpsIndicator) gpsIndicator.classList.add('hidden');
    
    // Hide Contact alert badges
    const contactBadge = document.getElementById('contact-alert-badge');
    if (contactBadge) contactBadge.classList.add('hidden');

    this.app.logEvent('SOS Alert deactivated safely.', 'success');
    this.app.showToast('SOS Cancelled', 'Alert is now disarmed.', 'success');
    
    // Return to main app screens
    this.app.currentScreenState = 'home';
    this.app.renderActivePage();
    
    // Update dashboards
    this.app.adminManager.updateAdminStats();
    this.app.syncActiveEmergencyData();
  }

  // --- TRIGGERS EVALUATION ---

  handlePowerButtonTap() {
    const timeNow = Date.now();
    if (timeNow - this.lastPowerTapTime > 3000) {
      this.powerTapCount = 1;
    } else {
      this.powerTapCount++;
    }
    
    this.lastPowerTapTime = timeNow;
    this.app.logEvent(`Simulator: Power button tap detected (${this.powerTapCount}/${this.config.powerTapThreshold})`, 'info');
    
    const ind = document.getElementById('power-count-indicator');
    if (ind) ind.textContent = this.powerTapCount;

    if (this.powerTapCount >= this.config.powerTapThreshold) {
      this.powerTapCount = 0;
      if (ind) ind.textContent = 0;
      this.activateSOS('Hardware Power Trigger');
    }
  }

  handleVolumeButtonPress(direction) {
    this.volumePressHistory.push(direction);
    
    if (this.volumePressHistory.length > this.config.volumeSequence.length) {
      this.volumePressHistory.shift();
    }
    
    const seqText = this.volumePressHistory.map(dir => dir.toUpperCase()).join(' - ');
    const seqLog = document.getElementById('sim-sequence-log');
    if (seqLog) seqLog.textContent = seqText;

    this.app.logEvent(`Simulator: Volume ${direction.toUpperCase()} pressed.`, 'info');

    const isMatch = this.volumePressHistory.length === this.config.volumeSequence.length &&
      this.volumePressHistory.every((val, idx) => val === this.config.volumeSequence[idx]);
      
    if (isMatch) {
      this.volumePressHistory = [];
      if (seqLog) seqLog.textContent = 'Triggered!';
      this.activateSOS('Volume Sequence Trigger');
      setTimeout(() => {
        if (seqLog) seqLog.textContent = 'None';
      }, 2000);
    }
  }

  handleShakeTrigger() {
    if (!this.config.shakeEnabled) return;
    this.app.logEvent('Simulator: Device shake event received.', 'warning');
    this.activateSOS('Kinetic Shake Trigger');
  }

  handleGestureNodeInput(nodeIndex) {
    if (this.gestureInputBuffer[this.gestureInputBuffer.length - 1] === nodeIndex) return;
    
    this.gestureInputBuffer.push(nodeIndex);
    this.app.logEvent(`Secret Gesture: node ${nodeIndex} clicked.`, 'info');

    const nodeEl = document.querySelector(`.gesture-node[data-index="${nodeIndex}"]`);
    if (nodeEl) nodeEl.classList.add('active');

    const targetSeq = this.config.gestureSequence;
    
    if (this.gestureInputBuffer.length === targetSeq.length) {
      const match = this.gestureInputBuffer.every((v, i) => v === targetSeq[i]);
      if (match) {
        this.gestureInputBuffer = [];
        this.app.logEvent('Secret Gesture matched! SOS activated.', 'success');
        this.activateSOS('Secret Pattern Gesture');
      } else {
        document.querySelectorAll('.gesture-node').forEach(node => {
          node.classList.add('error');
        });
        this.app.logEvent('Gesture mismatch. Resetting buffer.', 'error');
        
        setTimeout(() => {
          this.gestureInputBuffer = [];
          document.querySelectorAll('.gesture-node').forEach(node => {
            node.className = 'gesture-node';
          });
        }, 800);
      }
    }
  }

  dispatchAlertsToEmergencyContacts(user, type) {
    const contacts = this.app.contactsManager.getContacts();
    const messageBody = this.config.selectedTemplate;
    const locationUrl = `https://maps.google.com/?q=${this.app.locationManager.lat},${this.app.locationManager.lng}`;
    
    contacts.forEach(contact => {
      this.app.showToast(
        `SMS Sent to ${contact.name}`,
        `"${messageBody} Current location: ${locationUrl}"`,
        'success'
      );
      this.app.logEvent(`SOS email notification dispatched to ${contact.name} (${contact.email})`, 'success');
    });
  }

  calculateDuration(start, end) {
    const parseTime = (timeStr) => {
      const [h, m, s] = timeStr.split(' ')[0].split(':').map(Number);
      const isPm = timeStr.includes('PM') && h !== 12;
      const isAm = timeStr.includes('AM') && h === 12;
      return (h + (isPm ? 12 : 0) - (isAm ? 12 : 0)) * 3600 + m * 60 + s;
    };
    
    try {
      const diffSecs = Math.abs(parseTime(end) - parseTime(start));
      const mins = Math.floor(diffSecs / 60);
      const secs = diffSecs % 60;
      return `${mins}m ${secs}s`;
    } catch (e) {
      return '1m 20s';
    }
  }
}
