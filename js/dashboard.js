/* ==========================================================================
   Silent SOS - Emergency Contact Monitoring Console (REST Integration)
   ========================================================================== */

export class ContactDashboard {
  constructor(app) {
    this.app = app;
    this.logsList = [];
    this.lastFetchedIncidentId = null;
  }

  init() {
    this.bindEvents();
    this.renderRestingState();
    
    // Poll for active SOS alerts in the backend database
    setInterval(() => {
      this.pollActiveIncident();
    }, 3000);
  }

  bindEvents() {
    const directionBtn = document.getElementById('contact-direction-btn');
    if (directionBtn) {
      directionBtn.addEventListener('click', () => {
        const lat = this.app.locationManager.lat;
        const lng = this.app.locationManager.lng;
        window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
      });
    }

    const grid = document.getElementById('contact-camera-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const img = e.target.closest('img');
        if (img) {
          this.openImageModal(img.src);
        }
      });
    }
  }

  renderRestingState() {
    const banner = document.getElementById('contact-active-alert-banner');
    if (banner) banner.classList.add('hidden');
    
    const audioSection = document.getElementById('contact-audio-section');
    if (audioSection) {
      audioSection.className = 'empty-evidence';
      audioSection.innerHTML = 'No active audio stream available.';
    }
    
    const grid = document.getElementById('contact-camera-grid');
    if (grid) {
      grid.innerHTML = '<p class="empty-evidence-msg">No images captured yet.</p>';
    }
    
    const logs = document.getElementById('contact-incident-log');
    if (logs) {
      logs.innerHTML = '<li class="empty-logs">Awaiting incident trigger...</li>';
    }
  }

  async pollActiveIncident() {
    try {
      const response = await fetch('/api/sos/active');
      if (response.ok) {
        const data = await response.json();
        if (data.active) {
          // Sync state into orchestrator
          this.app.sosManager.isActive = true;
          this.app.sosActiveIncident = data.incident;
          
          // Trigger Leaflet map sync in dashboard view
          if (this.app.currentRoleView === 'contact-dashboard') {
            const lastLoc = data.incident.lastLocation;
            if (lastLoc && this.app.locationManager.contactMap) {
              const latlng = L.latLng(lastLoc.lat, lastLoc.lng);
              if (this.app.locationManager.contactMarker) {
                this.app.locationManager.contactMarker.setLatLng(latlng);
              }
              if (this.app.locationManager.contactPathLine) {
                this.app.locationManager.contactPathLine.setLatLngs(data.incident.locationPath.map(p => [p.lat, p.lng]));
              }
              // Adjust coordinates visual text inputs
              const currLat = document.getElementById('contact-curr-lat');
              const currLng = document.getElementById('contact-curr-lng');
              if (currLat) currLat.textContent = lastLoc.lat.toFixed(5);
              if (currLng) currLng.textContent = lastLoc.lng.toFixed(5);
            }
            this.update();
          }
        } else {
          // SOS ended
          if (this.app.sosManager.isActive) {
            this.app.sosManager.isActive = false;
            this.app.sosActiveIncident = null;
            this.renderRestingState();
          }
        }
      }
    } catch (err) {
      console.error('Error polling active incidents:', err);
    }
  }

  update() {
    const isActive = this.app.sosManager.isActive;
    const incident = this.app.sosActiveIncident;
    
    // Resolve user data: prefer active incident values, fall back to current simulator user
    const user = {
      name: (isActive && incident && incident.userName) ? incident.userName : (this.app.authManager.currentUser ? this.app.authManager.currentUser.name : 'Jane Doe'),
      phone: (isActive && incident && incident.userPhone) ? incident.userPhone : (this.app.authManager.currentUser ? this.app.authManager.currentUser.phone : '+1 (555) 019-2834'),
      email: (isActive && incident && incident.userEmail) ? incident.userEmail : (this.app.authManager.currentUser ? this.app.authManager.currentUser.email : 'jane.doe@example.com'),
      dob: (isActive && incident && incident.dob) ? incident.dob : (this.app.authManager.currentUser ? this.app.authManager.currentUser.dob : ''),
      bloodGroup: (isActive && incident && incident.bloodGroup) ? incident.bloodGroup : (this.app.authManager.currentUser ? this.app.authManager.currentUser.bloodGroup : 'O+'),
      medicalConditions: (isActive && incident && incident.medicalConditions) ? incident.medicalConditions : (this.app.authManager.currentUser ? this.app.authManager.currentUser.medicalConditions : 'None reported'),
      emergencyNotes: (isActive && incident && incident.emergencyNotes) ? incident.emergencyNotes : (this.app.authManager.currentUser ? this.app.authManager.currentUser.emergencyNotes : 'None'),
      homeAddress: (isActive && incident && incident.homeAddress) ? incident.homeAddress : (this.app.authManager.currentUser ? this.app.authManager.currentUser.homeAddress : '')
    };

    const banner = document.getElementById('contact-active-alert-banner');
    if (banner) {
      if (isActive) {
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    }

    const avatar = document.getElementById('contact-view-avatar');
    if (avatar) avatar.textContent = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
    
    const nameEl = document.getElementById('contact-view-name');
    if (nameEl) nameEl.textContent = user.name;
    
    const phoneEl = document.getElementById('contact-view-phone');
    if (phoneEl) phoneEl.textContent = user.phone;
    
    const emailEl = document.getElementById('contact-view-email');
    if (emailEl) emailEl.textContent = user.email;

    // Render Emergency Medical Responder Card if SOS is active, otherwise render standard layout
    const medBox = document.querySelector('.medical-notes-box');
    if (medBox) {
      if (isActive) {
        let ageStr = 'Unknown Age';
        if (user.dob) {
          const dobDate = new Date(user.dob);
          const diffMs = Date.now() - dobDate.getTime();
          const ageDate = new Date(diffMs);
          ageStr = `${Math.abs(ageDate.getUTCFullYear() - 1970)} Y/O (${user.dob})`;
        }
        
        medBox.className = 'medical-notes-box medical-responder-card active-emergency';
        medBox.innerHTML = `
          <div class="responder-card-header">
            <span class="responder-card-badge"><i data-lucide="shield-alert"></i> FIRST RESPONDER CARD</span>
            <span class="responder-blood-badge">${user.bloodGroup || 'N/A'}</span>
          </div>
          <div class="responder-card-grid">
            <div class="responder-field">
              <span class="responder-label">DOB / Age</span>
              <span class="responder-value">${ageStr}</span>
            </div>
            <div class="responder-field">
              <span class="responder-label">Home Address</span>
              <span class="responder-value">${user.homeAddress || 'No Address Provided'}</span>
            </div>
          </div>
          <div class="responder-section">
            <span class="responder-label"><i data-lucide="heart-pulse"></i> Medical Conditions / Allergies</span>
            <div class="responder-value-box highlight">${user.medicalConditions || 'No conditions reported'}</div>
          </div>
          <div class="responder-section">
            <span class="responder-label"><i data-lucide="alert-circle"></i> Custom Emergency Instructions</span>
            <div class="responder-value-box warning">${user.emergencyNotes || 'No instructions provided'}</div>
          </div>
        `;
      } else {
        medBox.className = 'medical-notes-box';
        medBox.innerHTML = `
          <p><strong>Medical Notes:</strong> <span id="contact-view-medical">${user.bloodGroup || 'O+'} | ${user.medicalConditions || 'None reported'}</span></p>
          <p><strong>Emergency Notes:</strong> <span id="contact-view-notes">${user.emergencyNotes || 'None'}</span></p>
        `;
      }
    }

    const callBtn = document.getElementById('contact-call-btn');
    if (callBtn) callBtn.setAttribute('href', `tel:${user.phone}`);

    if (isActive && incident) {
      const audioSection = document.getElementById('contact-audio-section');
      if (audioSection) {
        audioSection.className = 'evidence-audio-player';
        
        if (this.app.evidenceCollector.isAudioRecording) {
          audioSection.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-glass);">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="pulse-dot" style="background-color: var(--primary-red);"></span>
                <span style="font-size: 11px; font-weight: bold; color: var(--primary-red);">LIVE STREAM</span>
              </div>
              <div class="audio-visualizer-box" style="margin: 0; height: 18px;">
                <div class="vis-bar" style="width: 2px;"></div>
                <div class="vis-bar" style="width: 2px;"></div>
                <div class="vis-bar" style="width: 2px;"></div>
                <div class="vis-bar" style="width: 2px;"></div>
                <div class="vis-bar" style="width: 2px;"></div>
              </div>
            </div>
          `;
        } else if (incident.audioRecordingUrl) {
          audioSection.innerHTML = `
            <audio src="${incident.audioRecordingUrl}" controls style="width: 100%; height: 32px; border-radius: 6px;"></audio>
          `;
        } else {
          audioSection.innerHTML = `
            <div style="font-size: 11px; color: var(--text-muted);">Audio feed packaging...</div>
          `;
        }
      }

      const grid = document.getElementById('contact-camera-grid');
      if (grid) {
        if (incident.photos && incident.photos.length > 0) {
          grid.innerHTML = incident.photos.map(p => `
            <div style="position: relative;">
              <img src="${p.src}" alt="Evidence snap">
              <span style="position: absolute; bottom: 2px; right: 2px; font-size: 8px; background: rgba(0,0,0,0.7); padding: 1px 4px; border-radius: 3px; color: white;">${p.source.toUpperCase()}</span>
            </div>
          `).join('');
        } else {
          grid.innerHTML = '<p class="empty-evidence-msg">No images captured yet.</p>';
        }
      }

      const logs = document.getElementById('contact-incident-log');
      if (logs) {
        const relevantLogs = this.app.globalActivityLog.filter(log => {
          return log.type === 'critical' || log.type === 'warning' || log.text.includes('capture') || log.text.includes('GPS') || log.text.includes('Audio');
        });
        
        if (relevantLogs.length > 0) {
          logs.innerHTML = relevantLogs.map(log => `
            <li class="${log.type === 'critical' ? 'critical' : ''}">
              <span class="log-time">${log.time}</span>
              <span>${log.text}</span>
            </li>
          `).join('');
        } else {
          logs.innerHTML = '<li class="empty-logs">Monitoring signals active. Waiting for events...</li>';
        }
      }

      if (this.app.locationManager.contactMap) {
        this.app.locationManager.contactMap.invalidateSize();
      }
    } else {
      this.renderRestingState();
    }

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  openImageModal(src) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.9)';
    modal.style.zIndex = '20000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.cursor = 'zoom-out';
    
    modal.innerHTML = `<img src="${src}" style="max-width: 90%; max-height: 90%; border-radius: 8px; box-shadow: 0 0 30px rgba(255,255,255,0.1);">`;
    modal.addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
  }
}
