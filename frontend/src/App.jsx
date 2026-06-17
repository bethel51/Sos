import React, { useState, useEffect, useRef } from 'react';

// Socket.io client initialization
// The server script injects socket.io client dynamically or we can use the library from window.io if loaded in index.html
const getSocket = () => {
  if (typeof window !== 'undefined' && window.io) {
    return window.io();
  }
  return null;
};

export default function App() {
  const getInitialView = () => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash === '#/admin') return 'admin-panel';
      if (hash === '#/contact') return 'contact-dashboard';
      if (hash === '#/user') return 'user-app';
    }
    return 'portal-gate';
  };

  // Global Workspace View: 'portal-gate', 'user-app', 'contact-dashboard', 'admin-panel'
  const [workspaceView, setWorkspaceView] = useState(getInitialView);
  const [showSimulator, setShowSimulator] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [theme, setTheme] = useState('dark');
  const [toasts, setToasts] = useState([]);
  const [isOnline, setIsOnline] = useState(true);

  const navigateTo = (view, hash) => {
    if (typeof window !== 'undefined') {
      window.location.hash = hash;
    }
    setWorkspaceView(view);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#/admin') {
        setWorkspaceView('admin-panel');
      } else if (hash === '#/contact') {
        setWorkspaceView('contact-dashboard');
      } else if (hash === '#/user') {
        setWorkspaceView('user-app');
      } else {
        setWorkspaceView('portal-gate');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Auth State
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('lc_token') || '');
  const [screenState, setScreenState] = useState('login'); // login, signup, forgot-password, verify-code, reset-new-password, lock-screen, home, contacts, timers, zones, history, settings, medical-profile
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPin, setAuthPin] = useState('1234');
  const [signupEmail, setSignupEmail] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '']);
  const [devOtp, setDevOtp] = useState(null); // Shows OTP on screen if email delivery fails
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState(['', '', '', '']);
  const [resetPassword, setResetPassword] = useState('');

  // Lock screen
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockScreenReason, setLockScreenReason] = useState('normal-unlock'); // normal-unlock, disarm-sos, disarm-timer

  // User App Data
  const [contacts, setContacts] = useState([]);
  const [safeZones, setSafeZones] = useState([]);
  const [userSettings, setUserSettings] = useState({
    shakeEnabled: true,
    powerTapThreshold: 5,
    selectedTemplate: 'I am in danger. Please check my location. (Lead City SOS)',
    geofenceAutoSosEnabled: false
  });
  const [historyLogs, setHistoryLogs] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);

  // Safety Timer state
  const [safetyTimerDuration, setSafetyTimerDuration] = useState(120); // default 2 mins
  const [safetyTimerActive, setSafetyTimerActive] = useState(false);
  const [safetyTimerSecondsLeft, setSafetyTimerSecondsLeft] = useState(0);
  const timerIntervalRef = useRef(null);

  // Medical profile form
  const [dob, setDob] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [emergencyNotes, setEmergencyNotes] = useState('');
  const [homeAddress, setHomeAddress] = useState('');

  // Contact Console Auth & State
  const [contactConsoleAuthenticated, setContactConsoleAuthenticated] = useState(false);
  const [contactAuthEmail, setContactAuthEmail] = useState('');
  const [contactAuthPin, setContactAuthPin] = useState('');
  const [contactDashboardIncident, setContactDashboardIncident] = useState(null);

  // Admin Console Auth & State
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState('admin@leadcitysos.com');
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [adminToken, setAdminToken] = useState('');
  const [adminStats, setAdminStats] = useState({ totalUsers: 0, activeEmergencies: 0, totalHistory: 0, uptime: '99.98%' });
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminIncidents, setAdminIncidents] = useState([]);

  // Simulator Controls
  const [powerTapCount, setPowerTapCount] = useState(0);
  const [simSequence, setSimSequence] = useState('None');
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [simGpsRoute, setSimGpsRoute] = useState('stationary');
  const [simGpsStep, setSimGpsStep] = useState(0);
  const [simLat, setSimLat] = useState(4.8156);
  const [simLng, setSimLng] = useState(7.0498);

  const socketRef = useRef(null);
  const userMapRef = useRef(null);
  const contactMapRef = useRef(null);
  const pathMarkerRef = useRef(null);
  const pathLineRef = useRef(null);

  // Predefined coordinates for Lead City University Simulation
  const lcuRoutes = {
    stationary: [{ lat: 4.8156, lng: 7.0498 }],
    'safe-walk': [
      { lat: 4.8156, lng: 7.0498 },
      { lat: 4.8160, lng: 7.0505 },
      { lat: 4.8165, lng: 7.0510 },
      { lat: 4.8170, lng: 7.0515 },
      { lat: 4.8175, lng: 7.0520 }
    ],
    deviation: [
      { lat: 4.8156, lng: 7.0498 },
      { lat: 4.8160, lng: 7.0505 },
      { lat: 4.8150, lng: 7.0520 }, // deviation path
      { lat: 4.8140, lng: 7.0530 },
      { lat: 4.8130, lng: 7.0540 }
    ],
    'emergency-move': [
      { lat: 4.8156, lng: 7.0498 },
      { lat: 4.8162, lng: 7.0500 },
      { lat: 4.8168, lng: 7.0502 },
      { lat: 4.8174, lng: 7.0504 },
      { lat: 4.8180, lng: 7.0506 }
    ]
  };

  // Toast dispatch helper
  const showToast = (title, text, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, title, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Setup WebSockets
  useEffect(() => {
    socketRef.current = getSocket();
    if (socketRef.current) {
      socketRef.current.on('sos_triggered', (incident) => {
        showToast('SOS Alert Triggered', `${incident.userName} is in danger!`, 'error');
        if (workspaceView === 'contact-dashboard') {
          setContactDashboardIncident(incident);
        }
      });
      socketRef.current.on('location_update', (incident) => {
        if (workspaceView === 'contact-dashboard') {
          setContactDashboardIncident(incident);
        }
      });
      socketRef.current.on('evidence_update', (incident) => {
        if (workspaceView === 'contact-dashboard') {
          setContactDashboardIncident(incident);
        }
      });
      socketRef.current.on('sos_deactivated', () => {
        showToast('SOS Resolved', 'Emergency alert has been resolved.', 'success');
        if (workspaceView === 'contact-dashboard') {
          setContactDashboardIncident(null);
        }
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [workspaceView]);

  // Load Session on start
  useEffect(() => {
    if (token) {
      fetch('/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Invalid token');
        })
        .then(data => {
          setCurrentUser(data.user);
          setDob(data.user.dob || '');
          setBloodGroup(data.user.bloodGroup || '');
          setMedicalConditions(data.user.medicalConditions || '');
          setEmergencyNotes(data.user.emergencyNotes || '');
          setHomeAddress(data.user.homeAddress || '');
          setScreenState('lock-screen');
          
          if (socketRef.current) {
            socketRef.current.emit('join_user_room', data.user.id);
          }
        })
        .catch(() => {
          setToken('');
          localStorage.removeItem('lc_token');
          setScreenState('login');
        });
    } else {
      setScreenState('login');
    }
  }, [token]);

  // Fetch data on Screen State transition
  useEffect(() => {
    if (!currentUser) return;
    if (screenState === 'contacts') {
      fetch('/api/contacts', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setContacts(Array.isArray(data) ? data : []))
        .catch(err => console.error(err));
    } else if (screenState === 'zones') {
      fetch('/api/zones', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setSafeZones(Array.isArray(data) ? data : []))
        .catch(err => console.error(err));
    } else if (screenState === 'history') {
      fetch('/api/history', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setHistoryLogs(Array.isArray(data) ? data : []))
        .catch(err => console.error(err));
    } else if (screenState === 'settings') {
      fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setUserSettings(data))
        .catch(err => console.error(err));
    }
  }, [screenState, currentUser, token]);

  // Active Incident polling
  useEffect(() => {
    if (!currentUser) return;
    const checkActive = () => {
      fetch('/api/sos/active', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          if (data.active) {
            setActiveIncident(data.incident);
            setScreenState('active-sos');
          } else {
            setActiveIncident(null);
            if (screenState === 'active-sos') {
              setScreenState('home');
            }
          }
        })
        .catch(err => console.error(err));
    };
    checkActive();
    const interval = setInterval(checkActive, 5000);
    return () => clearInterval(interval);
  }, [currentUser, token]);

  // GPS routing simulator sync
  useEffect(() => {
    const route = lcuRoutes[simGpsRoute];
    const point = route[simGpsStep % route.length];
    if (point) {
      setSimLat(point.lat);
      setSimLng(point.lng);

      // If SOS is active, push coordinate updates to backend
      if (activeIncident) {
        fetch('/api/sos/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ lat: point.lat, lng: point.lng })
        })
          .then(res => res.json())
          .then(data => setActiveIncident(data))
          .catch(err => console.error(err));
      }
    }
  }, [simGpsRoute, simGpsStep, activeIncident, token]);

  // Safety Timer countdown logic
  useEffect(() => {
    if (safetyTimerActive) {
      setSafetyTimerSecondsLeft(safetyTimerDuration);
      timerIntervalRef.current = setInterval(() => {
        setSafetyTimerSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            setSafetyTimerActive(false);
            // Trigger SOS
            triggerSOS('Safety Timer Expired');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [safetyTimerActive]);

  // Leaflet map setup for User Geofences / Safe Zones
  useEffect(() => {
    if (screenState === 'zones' && typeof window !== 'undefined' && window.L) {
      if (!userMapRef.current) {
        userMapRef.current = window.L.map('user-zones-map').setView([simLat, simLng], 15);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(userMapRef.current);
      } else {
        userMapRef.current.setView([simLat, simLng], 15);
      }

      // Clear previous layers (except tileLayer)
      userMapRef.current.eachLayer(layer => {
        if (layer instanceof window.L.Marker || layer instanceof window.L.Circle) {
          userMapRef.current.removeLayer(layer);
        }
      });

      // User current position marker
      window.L.marker([simLat, simLng]).addTo(userMapRef.current).bindPopup('My Current Location').openPopup();

      // Render safe zones circles
      safeZones.forEach(zone => {
        window.L.circle([zone.lat, zone.lng], {
          color: '#ffd700',
          fillColor: '#ffd700',
          fillOpacity: 0.2,
          radius: zone.radius
        }).addTo(userMapRef.current).bindPopup(zone.name);
      });
    }
  }, [screenState, safeZones, simLat, simLng]);

  // Leaflet map setup for Contact Console Dashboard
  useEffect(() => {
    if (workspaceView === 'contact-dashboard' && contactConsoleAuthenticated && typeof window !== 'undefined' && window.L) {
      const activeInc = contactDashboardIncident;
      const targetLat = activeInc ? activeInc.lastLocation.lat : simLat;
      const targetLng = activeInc ? activeInc.lastLocation.lng : simLng;

      if (!contactMapRef.current) {
        contactMapRef.current = window.L.map('contact-map').setView([targetLat, targetLng], 15);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(contactMapRef.current);
      } else {
        contactMapRef.current.setView([targetLat, targetLng], 15);
      }

      // Draw Marker
      if (pathMarkerRef.current) {
        contactMapRef.current.removeLayer(pathMarkerRef.current);
      }
      pathMarkerRef.current = window.L.marker([targetLat, targetLng]).addTo(contactMapRef.current)
        .bindPopup(activeInc ? `${activeInc.userName} (ACTIVE SOS)` : 'User Location').openPopup();

      // Draw tracking line
      if (pathLineRef.current) {
        contactMapRef.current.removeLayer(pathLineRef.current);
      }
      if (activeInc && activeInc.locationPath && activeInc.locationPath.length > 0) {
        const coords = activeInc.locationPath.map(p => [p.lat, p.lng]);
        pathLineRef.current = window.L.polyline(coords, { color: '#ff4d4d', weight: 4 }).addTo(contactMapRef.current);
      }
    }
  }, [workspaceView, contactConsoleAuthenticated, contactDashboardIncident, simLat, simLng]);

  // Admin dashboard authentication/loading
  const loadAdminDashboard = (tok) => {
    const bearer = tok || adminToken;
    const headers = { 'Authorization': `Bearer ${bearer}` };
    Promise.all([
      fetch('/api/admin/stats', { headers }).then(r => r.ok ? r.json() : null),
      fetch('/api/admin/users', { headers }).then(r => r.ok ? r.json() : [])
    ])
      .then(([stats, users]) => {
        if (stats) setAdminStats(prev => ({ ...prev, ...stats }));
        setAdminUsers(Array.isArray(users) ? users : []);
      })
      .catch(err => console.error('Admin dashboard load error:', err));
  };

  useEffect(() => {
    if (workspaceView === 'admin-panel' && adminAuthenticated) {
      loadAdminDashboard();
    }
  }, [workspaceView, adminAuthenticated]);

  // Handle Hardware Triggers
  const handlePowerTap = () => {
    setPowerTapCount(prev => {
      const next = prev + 1;
      setSimSequence(`Power Button tap ${next}`);
      if (next >= userSettings.powerTapThreshold) {
        triggerSOS('Power Button Sequence');
        return 0;
      }
      return next;
    });

    // Reset tap sequence if no action within 3 seconds
    setTimeout(() => {
      setPowerTapCount(0);
    }, 3000);
  };

  const handleShakeTrigger = () => {
    setSimSequence('Shake Gesture Triggered');
    if (userSettings.shakeEnabled) {
      triggerSOS('Device Shook Triggered');
    } else {
      showToast('Shake Ignored', 'Shake gesture is disabled in settings.', 'warning');
    }
  };

  // Trigger SOS API
  const triggerSOS = (type) => {
    fetch('/api/sos/active', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        type: type || 'General Threat',
        location: { lat: simLat, lng: simLng }
      })
    })
      .then(res => {
        if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed to trigger SOS') });
        return res.json();
      })
      .then(data => {
        setActiveIncident(data);
        setScreenState('active-sos');
        showToast('SOS Broadcasted', 'Distress alerts sent to emergency contacts.', 'error');
      })
      .catch(err => {
        console.error(err);
        showToast('Connection Error', err.message || 'Failed to push distress signal. Queueing SMS fallback...', 'warning');
      });
  };

  // Deactivate SOS
  const deactivateSOS = () => {
    fetch('/api/sos/deactivate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed to deactivate SOS') });
        return res.json();
      })
      .then(() => {
        setActiveIncident(null);
        setScreenState('home');
        showToast('Emergency Resolved', 'Distress mode closed.', 'success');
      })
      .catch(err => {
        console.error(err);
        showToast('Error', err.message || 'Failed to close distress mode.', 'error');
      });
  };

  // User Signup
  const handleSignup = (e) => {
    e.preventDefault();
    fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: authName, email: authEmail, phone: authPhone, password: authPassword, pin: authPin })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error); });
      })
      .then(data => {
        setSignupEmail(authEmail);
        setDevOtp(data.devOtp || null);
        setScreenState('verify-code');
        if (data.devOtp) {
          showToast('OTP Ready', `Dev mode: Your code is ${data.devOtp}`, 'success');
        } else {
          showToast('OTP Dispatched', 'Check your email inbox for 4-digit code.', 'success');
        }
      })
      .catch(err => showToast('Signup Failed', err.message, 'error'));
  };

  // Verify OTP
  const handleVerifyOtp = (e) => {
    e.preventDefault();
    const codeStr = otpCode.join('');
    fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: signupEmail, code: codeStr })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error); });
      })
      .then(data => {
        setCurrentUser(data.user);
        setToken(data.token);
        localStorage.setItem('lc_token', data.token);
        setScreenState('lock-screen');
        showToast('Verification Successful', 'Device activated securely.', 'success');
      })
      .catch(err => showToast('Verification Failed', err.message, 'error'));
  };

  // User Login
  const handleLogin = (e) => {
    e.preventDefault();
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authEmail, password: authPassword })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error); });
      })
      .then(data => {
        setCurrentUser(data.user);
        setToken(data.token);
        localStorage.setItem('lc_token', data.token);
        setScreenState('lock-screen');
        showToast('Welcome Back', `Logged in as ${data.user.name}`, 'success');
      })
      .catch(err => showToast('Login Failed', err.message, 'error'));
  };

  // Forgot Password
  const handleForgotPassword = (e) => {
    e.preventDefault();
    fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error); });
      })
      .then(data => {
        setDevOtp(data.devOtp || null);
        setScreenState('reset-new-password');
        if (data.devOtp) {
          showToast('Reset Code Ready', `Dev mode: Your code is ${data.devOtp}`, 'success');
        } else {
          showToast('Reset Sent', 'Password reset code sent to email.', 'success');
        }
      })
      .catch(err => showToast('Failed', err.message, 'error'));
  };

  // Reset Password
  const handleResetPassword = (e) => {
    e.preventDefault();
    const codeStr = resetCode.join('');
    fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail, code: codeStr, newPassword: resetPassword })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error); });
      })
      .then(() => {
        setScreenState('login');
        showToast('Password Updated', 'You can now login with your new password.', 'success');
      })
      .catch(err => showToast('Reset Failed', err.message, 'error'));
  };

  // Lockscreen unlock
  const handleUnlockPin = (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('Session Error', 'User session not fully loaded. Please wait or reload.', 'error');
      return;
    }
    
    if (lockPinInput === currentUser.pin) {
      setLockPinInput('');
      if (lockScreenReason === 'disarm-sos') {
        deactivateSOS();
      } else if (lockScreenReason === 'disarm-timer') {
        setSafetyTimerActive(false);
        setScreenState('timers');
      } else {
        setScreenState('home');
      }
    } else {
      showToast('Incorrect PIN', 'Please enter your secure 4-digit PIN.', 'error');
      setLockPinInput('');
    }
  };

  // Add Contact
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRel, setNewContactRel] = useState('');

  const handleAddContact = (e) => {
    e.preventDefault();
    fetch('/api/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: newContactName, phone: newContactPhone, email: newContactEmail, relationship: newContactRel })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error); });
      })
      .then(data => {
        setContacts(prev => [...prev, data]);
        setNewContactName('');
        setNewContactPhone('');
        setNewContactEmail('');
        setNewContactRel('');
        showToast('Contact Saved', 'Emergency responder added.', 'success');
      })
      .catch(err => showToast('Failed', err.message, 'error'));
  };

  // Delete Contact
  const handleDeleteContact = (id) => {
    fetch(`/api/contacts/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.ok) {
          setContacts(prev => prev.filter(c => c.id !== id));
          showToast('Contact Removed', 'Responder deleted successfully.', 'success');
        } else {
          return res.json().then(d => { throw new Error(d.error); });
        }
      })
      .catch(err => showToast('Error', err.message, 'error'));
  };

  // Add Geofence
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState(150);

  const handleAddZone = (e) => {
    e.preventDefault();
    fetch('/api/zones', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: newZoneName, lat: simLat, lng: simLng, radius: parseInt(newZoneRadius, 10) })
    })
      .then(res => res.json())
      .then(data => {
        setSafeZones(prev => [...prev, data]);
        setNewZoneName('');
        showToast('Geofence Created', 'Safe zone initialized.', 'success');
      })
      .catch(err => console.error(err));
  };

  // Delete Safezone
  const handleDeleteZone = (id) => {
    fetch(`/api/zones/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.ok) {
          setSafeZones(prev => prev.filter(z => z.id !== id));
          showToast('Geofence Removed', 'Safe zone deleted.', 'success');
        }
      })
      .catch(err => console.error(err));
  };

  // Medical Profile update
  const handleUpdateMedical = (e) => {
    e.preventDefault();
    fetch('/api/auth/profile/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ dob, bloodGroup, medicalConditions, emergencyNotes, homeAddress })
    })
      .then(res => res.json())
      .then(data => {
        setCurrentUser(data.user);
        showToast('Profile Updated', 'Medical configuration saved.', 'success');
      })
      .catch(err => console.error(err));
  };

  // Settings update
  const handleSaveSettings = (e) => {
    e.preventDefault();
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(userSettings)
    })
      .then(res => res.json())
      .then(data => {
        setUserSettings(data);
        showToast('Configuration Saved', 'Distress options updated.', 'success');
      })
      .catch(err => console.error(err));
  };

  // Contact dashboard authentication
  const handleContactLogin = (e) => {
    e.preventDefault();
    fetch('/api/sos/active')
      .then(res => res.json())
      .then(data => {
        // Authenticate with user PIN or active distress code
        if (data.active && (data.incident.emergencyNotes.includes(contactAuthPin) || contactAuthPin === '1234')) {
          setContactConsoleAuthenticated(true);
          setContactDashboardIncident(data.incident);
          showToast('Access Granted', 'Console loaded.', 'success');
        } else if (contactAuthPin === '1234') {
          // fallback simulator bypass
          setContactConsoleAuthenticated(true);
          showToast('Access Granted (Sim Bypass)', 'Loaded tracking console.', 'success');
        } else {
          showToast('Authentication Failed', 'Invalid console security code.', 'error');
        }
      })
      .catch(err => console.error(err));
  };

  // Admin dashboard load helper has been consolidated above

  const handleAdminLogin = (e) => {
    e.preventDefault();
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword })
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Access Denied');
      })
      .then(data => {
        const tok = data.token || data.adminToken || '';
        setAdminToken(tok);
        setAdminAuthenticated(true);
        loadAdminDashboard(tok);
        showToast('Access Authorized', 'Admin command panel online.', 'success');
      })
      .catch(() => showToast('Access Refused', 'Invalid admin authentication token.', 'error'));
  };

  const toggleUserSuspension = (userId, currentStatus) => {
    const isSuspended = currentStatus === 'suspended';
    fetch(`/api/admin/users/${userId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ suspend: !isSuspended })
    })
      .then(res => res.json())
      .then(() => { loadAdminDashboard(); showToast('Directory Updated', 'User status toggled successfully.', 'success'); })
      .catch(err => console.error(err));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setToken('');
    localStorage.removeItem('lc_token');
    setScreenState('login');
  };

  return (
    <div className={`app-root-container theme-${theme}`}>
      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <div className="toast-content">
              <div className="toast-title">{t.title}</div>
              <div>{t.text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Header bar */}
      <header className="app-global-header">
        <div className="logo-container" style={{ cursor: 'pointer' }} onClick={() => navigateTo('portal-gate', '#/')}>
          <div className="logo-icon">🛡️</div>
          <div className="logo-text">
            <h1>Lead City SOS</h1>
            <span className="logo-tagline">LCU Emergency Security App</span>
          </div>
        </div>

        {/* geofence state ribbon */}
        {workspaceView !== 'portal-gate' && (
          <div className={`status-ribbon ${isOnline ? '' : 'offline'}`}>
            <span className="status-dot"></span>
            <span className="status-text">{isOnline ? 'System Monitoring Active' : 'OFFLINE: SMS Fallback Active'}</span>
          </div>
        )}

        {/* Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {workspaceView === 'user-app' && (
            <button
              onClick={() => setShowSimulator(prev => !prev)}
              className="sim-toggle-btn"
              title="Toggle Simulator Panel"
              style={{ 
                height: '38px', 
                padding: '0 12px',
                borderRadius: '10px', 
                background: showSimulator ? 'var(--accent-blue)' : 'rgba(37, 99, 235, 0.1)', 
                border: '1px solid var(--accent-blue)', 
                color: showSimulator ? '#ffffff' : 'var(--accent-blue)', 
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'var(--transition-fast)'
              }}
            >
              🛠️ <span>{showSimulator ? 'Hide Controls' : 'Controls'}</span>
            </button>
          )}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="theme-toggle-btn"
            style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.1)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', cursor: 'pointer' }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          
          {workspaceView !== 'portal-gate' && (
            <button
              onClick={() => navigateTo('portal-gate', '#/')}
              className="portal-back-btn"
              style={{
                height: '38px',
                padding: '0 12px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                color: '#ef4444',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'var(--transition-fast)'
              }}
            >
              🏠 <span>Exit to Portal</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="workspace-container">
        
        {/* LEFT SIMULATOR CONTROL BAR */}
        {showSimulator && workspaceView === 'user-app' && (
          <aside className="simulator-sidebar">
            <div className="sidebar-header">
              ⚡ <h2>Environment Simulator</h2>
            </div>

            <div className="simulator-section">
              <h3>🔴 Physical Hardware Triggers</h3>
              <p className="simulator-desc">Tap power button rapidly or shake to simulate kinetic gestures.</p>
              <div className="sim-btn-group">
                <button onClick={handlePowerTap} className="sim-action-btn">
                  <span className="btn-indicator">{powerTapCount}</span>
                  Tap Power Button
                </button>
                <button onClick={handleShakeTrigger} className="sim-action-btn" style={{ background: '#ffa500' }}>
                  Shake Device
                </button>
              </div>
              <div className="sequence-history">
                <span>Sensor Feed:</span> <code style={{ color: 'var(--accent-blue)' }}>{simSequence}</code>
              </div>
            </div>

            <div className="simulator-section">
              <h3>📍 GPS Coordinate Feeds</h3>
              <div className="sim-control-item">
                <label>Select Route Path</label>
                <select value={simGpsRoute} onChange={e => { setSimGpsRoute(e.target.value); setSimGpsStep(0); }} className="sim-select">
                  <option value="stationary">Stationary (Main Gate)</option>
                  <option value="safe-walk">Route A (Senate Bldg to Library)</option>
                  <option value="deviation">Route B (Hostel Route Deviation)</option>
                  <option value="emergency-move">Route C (Fleeing during Incident)</option>
                </select>
              </div>
              <button onClick={() => setSimGpsStep(prev => prev + 1)} className="sim-action-btn full-width secondary">
                🐾 Increment GPS Step
              </button>
              <div className="gps-coordinates-display">
                <div>Lat: <span>{simLat.toFixed(5)}</span></div>
                <div>Lng: <span>{simLng.toFixed(5)}</span></div>
              </div>
            </div>

            <div className="simulator-section">
              <h3>🌐 Network State</h3>
              <div className="sim-control-item">
                <button
                  onClick={() => setIsOnline(!isOnline)}
                  className={`sim-action-btn full-width ${isOnline ? 'success' : 'danger'}`}
                  style={{ background: isOnline ? '#28a745' : '#dc3545', color: '#fff' }}
                >
                  {isOnline ? 'Signal Status: Online' : 'Signal Status: Offline'}
                </button>
              </div>
            </div>

            <div className="simulator-section help-section">
              <h3>🔑 LCU Credentials Box</h3>
              <div className="credentials-box" style={{ fontSize: '11px', color: '#ccc' }}>
                <div><strong>Unlock PIN:</strong> <code>1234</code></div>
                <div><strong>Admin Portal:</strong></div>
                <div>Email: <code>admin@leadcitysos.com</code></div>
                <div>Password: <code>admin123</code></div>
              </div>
            </div>
          </aside>
        )}

        {/* CENTRAL VIEW CANVAS */}
        <section className="viewport-canvas">

          {/* VIEW 0: PORTAL GATE (LANDING PAGE) */}
          {workspaceView === 'portal-gate' && (
            <div className="portal-gate-wrapper">
              <div className="portal-gate-header">
                <h2>Lead City SOS Safety Gate</h2>
                <p>Welcome to the Lead City University Emergency and Personal Safety Guardian App. Please select your target portal console below to proceed.</p>
              </div>
              <div className="portal-gate-grid">
                
                {/* User Mobile App Card */}
                <div className="portal-gate-card" onClick={() => navigateTo('user-app', '#/user')}>
                  <div className="portal-gate-icon">📱</div>
                  <h3>Student Safety Mobile App</h3>
                  <p>Access your personal safety dashboard, set safety timers, manage emergency responders, and trigger distress alerts.</p>
                  <button className="portal-gate-btn">Enter Mobile Portal</button>
                </div>

                {/* Contact Console Card */}
                <div className="portal-gate-card" onClick={() => navigateTo('contact-dashboard', '#/contact')}>
                  <div className="portal-gate-icon">📻</div>
                  <h3>Emergency Contact Console</h3>
                  <p>Authorized responder portal to monitor live tracking feeds, view active distress alerts, and access safety profiles.</p>
                  <button className="portal-gate-btn">Enter Responder Portal</button>
                </div>

                {/* Admin Center Card */}
                <div className="portal-gate-card" onClick={() => navigateTo('admin-panel', '#/admin')}>
                  <div className="portal-gate-icon">🛡️</div>
                  <h3>Command & Control Center</h3>
                  <p>System administrators command panel to manage users, view security histories, manage safe zones, and review stats.</p>
                  <button className="portal-gate-btn">Enter Admin Portal</button>
                </div>

              </div>
            </div>
          )}
          
          {/* VIEW 1: USER APP (MOBILE PHONE FRAME) */}
          {workspaceView === 'user-app' && (
            <div className="phone-mockup-frame">
              <div className="phone-bezel">
                <div className="phone-island">
                  <div className="camera-lens"></div>
                  <div className="sensor-dot"></div>
                </div>

                <div className="phone-screen">
                  {/* Status Bar */}
                  <div className="screen-statusbar" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '12px' }}>
                    <span>18:19 PM</span>
                    <span>📶 🔋 {batteryLevel}%</span>
                  </div>

                  {/* Phone App Inner Content Router */}
                  <div className="screen-body">
                    
                    {/* Screen: LOGIN */}
                    {screenState === 'login' && (
                      <div className="auth-page-wrapper">
                        <div className="auth-brand-header">
                          <h1 style={{ color: 'var(--accent-blue)' }}>Lead City SOS</h1>
                          <p>Emergency & Personal Safety Guardian</p>
                        </div>
                        <div className="auth-glass-card">
                          <form onSubmit={handleLogin} className="auth-form">
                            <input
                              type="email"
                              placeholder="Email Address"
                              value={authEmail}
                              onChange={e => setAuthEmail(e.target.value)}
                              required
                            />
                            <input
                              type="password"
                              placeholder="Password"
                              value={authPassword}
                              onChange={e => setAuthPassword(e.target.value)}
                              required
                            />
                            <button type="submit" className="auth-submit-btn">Sign In</button>
                          </form>
                          <div className="auth-card-links">
                            <a href="#" onClick={() => setScreenState('forgot-password')}>Forgot Password?</a>
                            <span> · </span>
                            <a href="#" onClick={() => setScreenState('signup')} style={{ color: 'var(--accent-blue)' }}>Create Account</a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen: SIGNUP */}
                    {screenState === 'signup' && (
                      <div className="auth-page-wrapper">
                        <div className="auth-brand-header">
                          <h1 style={{ color: 'var(--accent-blue)' }}>Create Account</h1>
                        </div>
                        <div className="auth-glass-card">
                          <form onSubmit={handleSignup} className="auth-form">
                            <input
                              type="text"
                              placeholder="Full Name"
                              value={authName}
                              onChange={e => setAuthName(e.target.value)}
                              required
                            />
                            <input
                              type="email"
                              placeholder="Email Address"
                              value={authEmail}
                              onChange={e => setAuthEmail(e.target.value)}
                              required
                            />
                            <input
                              type="tel"
                              placeholder="Phone Number"
                              value={authPhone}
                              onChange={e => setAuthPhone(e.target.value)}
                              required
                            />
                            <input
                              type="password"
                              placeholder="Password"
                              value={authPassword}
                              onChange={e => setAuthPassword(e.target.value)}
                              required
                            />
                            <input
                              type="text"
                              placeholder="4-Digit PIN (e.g. 1234)"
                              maxLength="4"
                              value={authPin}
                              onChange={e => setAuthPin(e.target.value)}
                              required
                            />
                            <button type="submit" className="auth-submit-btn">Continue</button>
                          </form>
                          <div className="auth-card-links">
                            <a href="#" onClick={() => setScreenState('login')}>Already have an account? Sign In</a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen: VERIFY OTP */}
                    {screenState === 'verify-code' && (
                      <div className="auth-page-wrapper">
                        <div className="auth-brand-header">
                          <h1 style={{ color: 'var(--accent-blue)' }}>Verify Email</h1>
                          <p>Enter 4-digit code sent to your email</p>
                        </div>

                        {/* DEV MODE: Show OTP on screen if email couldn't be delivered */}
                        {devOtp && (
                          <div style={{
                            background: 'rgba(37,99,235,0.1)',
                            border: '1px solid var(--accent-blue)',
                            borderRadius: '10px',
                            padding: '12px',
                            textAlign: 'center',
                            marginBottom: '8px'
                          }}>
                            <div style={{ fontSize: '10px', color: 'var(--accent-blue)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>🔧 Dev Mode — Your OTP Code</div>
                            <div style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '8px', color: 'var(--accent-blue)' }}>{devOtp}</div>
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>Email delivery bypassed — use this code</div>
                          </div>
                        )}

                        <div className="auth-glass-card">
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
                            {otpCode.map((digit, idx) => (
                              <input
                                key={idx}
                                type="text"
                                maxLength="1"
                                value={digit}
                                onChange={e => {
                                  const val = e.target.value;
                                  setOtpCode(prev => {
                                    const next = [...prev];
                                    next[idx] = val;
                                    return next;
                                  });
                                }}
                                style={{ width: '44px', height: '44px', textAlign: 'center', fontSize: '22px', borderRadius: '8px', border: '2px solid var(--border-glass)', background: '#fff', color: 'var(--text-primary)' }}
                              />
                            ))}
                          </div>
                          <button onClick={handleVerifyOtp} className="auth-submit-btn">Verify Account</button>
                          <div className="auth-card-links" style={{ marginTop: '10px' }}>
                            <a href="#" onClick={() => setScreenState('signup')}>← Back to Sign Up</a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen: FORGOT PASSWORD */}
                    {screenState === 'forgot-password' && (
                      <div className="auth-page-wrapper">
                        <div className="auth-brand-header">
                          <h1 style={{ color: 'var(--accent-blue)' }}>Forgot Password</h1>
                        </div>
                        <div className="auth-glass-card">
                          <form onSubmit={handleForgotPassword} className="auth-form">
                            <input
                              type="email"
                              placeholder="Enter Email"
                              value={resetEmail}
                              onChange={e => setResetEmail(e.target.value)}
                              required
                            />
                            <button type="submit" className="auth-submit-btn">Send Recovery Code</button>
                          </form>
                          <div className="auth-card-links">
                            <a href="#" onClick={() => setScreenState('login')}>Back to Login</a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen: RESET PASSWORD */}
                    {screenState === 'reset-new-password' && (
                      <div className="auth-page-wrapper">
                        <div className="auth-brand-header">
                          <h1 style={{ color: 'var(--accent-blue)' }}>Set Password</h1>
                        </div>
                        <div className="auth-glass-card">
                          <form onSubmit={handleResetPassword} className="auth-form">
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
                              {resetCode.map((digit, idx) => (
                                <input
                                  key={idx}
                                  type="text"
                                  maxLength="1"
                                  value={digit}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setResetCode(prev => {
                                      const next = [...prev];
                                      next[idx] = val;
                                      return next;
                                    });
                                  }}
                                  style={{ width: '40px', height: '40px', textAlign: 'center', fontSize: '20px', borderRadius: '8px', border: '1px solid gold', background: 'rgba(0,0,0,0.5)', color: 'white' }}
                                />
                              ))}
                            </div>
                            <input
                              type="password"
                              placeholder="New Password"
                              value={resetPassword}
                              onChange={e => setResetPassword(e.target.value)}
                              required
                            />
                            <button type="submit" className="auth-submit-btn">Reset Password</button>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Screen: LOCK SCREEN */}
                    {screenState === 'lock-screen' && (
                      <div className="auth-page-wrapper">
                        <div className="auth-brand-header">
                          <h1 style={{ color: 'var(--accent-blue)' }}>🔒 Locked</h1>
                          <p>Enter 4-digit PIN to access features</p>
                        </div>
                        <div className="auth-glass-card">
                          <input
                            type="password"
                            maxLength="4"
                            placeholder="Enter PIN"
                            value={lockPinInput}
                            onChange={e => setLockPinInput(e.target.value)}
                            style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '24px', width: '100%', marginBottom: '15px' }}
                          />
                          <button onClick={handleUnlockPin} className="auth-submit-btn">Unlock Device</button>
                        </div>
                      </div>
                    )}

                    {/* Screen: HOME (SOS Distress Button) */}
                    {screenState === 'home' && (
                      <div className="app-screen-body-padded">
                        {/* User Greeting */}
                        <div className="home-greeting">
                          <div className="home-greeting-avatar">{currentUser?.name?.charAt(0).toUpperCase() || 'U'}</div>
                          <div>
                            <div className="home-greeting-name">Hi, {currentUser?.name?.split(' ')[0] || 'Student'} 👋</div>
                            <div className="home-greeting-sub">LCU Campus Safety — Stay Protected</div>
                          </div>
                        </div>

                        {/* Big SOS Button */}
                        <div className="sos-button-wrapper">
                          <div className="sos-ring-outer">
                            <div className="sos-ring-inner">
                              <button onClick={() => triggerSOS('Distress Panic')} className="pulse-sos-button">
                                🚨
                                <span>SOS</span>
                              </button>
                            </div>
                          </div>
                          <p className="sos-hint">Hold to send distress signal</p>
                        </div>

                        {/* Threat Type Cards */}
                        <div className="home-section-label">⚡ Quick Threat Report</div>
                        <div className="threat-selector-grid">
                          <button onClick={() => triggerSOS('Security Threat')} className="threat-opt-card threat-security">⚔️<span>Security</span></button>
                          <button onClick={() => triggerSOS('Medical Emergency')} className="threat-opt-card threat-medical">🏥<span>Medical</span></button>
                          <button onClick={() => triggerSOS('Fire Incident')} className="threat-opt-card threat-fire">🔥<span>Fire</span></button>
                          <button onClick={() => triggerSOS('Harassment Report')} className="threat-opt-card threat-harassment">⚠️<span>Intrusion</span></button>
                        </div>

                        {/* Medical Profile Banner */}
                        <button onClick={() => setScreenState('medical-profile')} className="medical-nav-btn">
                          <span className="med-btn-icon">🏥</span>
                          <div className="med-btn-text">
                            <div className="med-btn-title">Emergency Medical Profile</div>
                            <div className="med-btn-sub">Blood group, conditions & notes</div>
                          </div>
                          <span className="med-btn-arrow">›</span>
                        </button>
                      </div>
                    )}

                    {/* Screen: CONTACTS */}
                    {screenState === 'contacts' && (
                      <div className="app-screen-body-padded">
                        <div className="screen-page-header">
                          <div className="screen-page-icon" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent-blue)' }}>📞</div>
                          <div>
                            <div className="screen-page-title">Emergency Contacts</div>
                            <div className="screen-page-sub">{contacts.length} responder{contacts.length !== 1 ? 's' : ''} saved</div>
                          </div>
                        </div>

                        <div className="form-card">
                          <div className="form-card-title">+ Add New Contact</div>
                          <form onSubmit={handleAddContact} className="app-form">
                            <input type="text" placeholder="Full Name" value={newContactName} onChange={e => setNewContactName(e.target.value)} required />
                            <input type="tel" placeholder="Phone Number" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} required />
                            <input type="email" placeholder="Email Address" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} required />
                            <input type="text" placeholder="Relationship (e.g. Parent, Friend)" value={newContactRel} onChange={e => setNewContactRel(e.target.value)} required />
                            <button type="submit" className="app-primary-btn">Save Contact</button>
                          </form>
                        </div>

                        <div className="contacts-list-container">
                          {contacts.length === 0 ? (
                            <div className="empty-state">📭<span>No contacts yet. Add one above.</span></div>
                          ) : contacts.map(c => (
                            <div key={c.id} className="contact-item-card">
                              <div className="contact-avatar">{c.name?.charAt(0).toUpperCase()}</div>
                              <div className="contact-info">
                                <div className="contact-name">{c.name} <span className="contact-badge">{c.relationship}</span></div>
                                <div className="contact-detail">{c.phone}</div>
                                <div className="contact-detail">{c.email}</div>
                              </div>
                              <button onClick={() => handleDeleteContact(c.id)} className="delete-btn">🗑️</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Screen: SAFETY TIMERS */}
                    {screenState === 'timers' && (
                      <div className="app-screen-body-padded">
                        <div className="screen-page-header">
                          <div className="screen-page-icon" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent-blue)' }}>⏱️</div>
                          <div>
                            <div className="screen-page-title">Safety Timer</div>
                            <div className="screen-page-sub">Auto-triggers SOS on expiry</div>
                          </div>
                        </div>

                        {!safetyTimerActive ? (
                          <div className="form-card">
                            <div className="form-card-title">Set Timer Duration</div>
                            <p className="form-card-desc">SOS triggers automatically if not cancelled with your PIN before the timer expires.</p>
                            <div className="app-form">
                              <label className="app-label">Duration (seconds)</label>
                              <input
                                type="number"
                                value={safetyTimerDuration}
                                onChange={e => setSafetyTimerDuration(parseInt(e.target.value, 10))}
                                min="10"
                                max="3600"
                              />
                              <button onClick={() => setSafetyTimerActive(true)} className="app-primary-btn">
                                ⏱️ Start Safety Watch
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="timer-active-display">
                            <div className="timer-active-label">⚠️ Guard Active</div>
                            <div className="timer-countdown-display">
                              {Math.floor(safetyTimerSecondsLeft / 60)}:{(safetyTimerSecondsLeft % 60).toString().padStart(2, '0')}
                            </div>
                            <p className="timer-active-hint">Enter PIN to disarm before time runs out</p>
                            <button
                              onClick={() => { setLockScreenReason('disarm-timer'); setScreenState('lock-screen'); }}
                              className="app-danger-btn"
                            >
                              🛑 Disarm Safety Guard
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Screen: GEOFENCING / SAFE ZONES */}
                    {screenState === 'zones' && (
                      <div style={{ height: '100%' }}>
                        <div id="user-zones-map" style={{ height: '200px', width: '100%' }}></div>
                        <div className="app-screen-body-padded">
                          <h4 style={{ color: 'var(--accent-blue)', margin: '8px 0' }}>Manage Geofences</h4>
                          <form onSubmit={handleAddZone} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                            <input
                              type="text"
                              placeholder="Safezone Name"
                              value={newZoneName}
                              onChange={e => setNewZoneName(e.target.value)}
                              required
                            />
                            <input
                              type="number"
                              placeholder="Radius"
                              value={newZoneRadius}
                              onChange={e => setNewZoneRadius(e.target.value)}
                              style={{ width: '80px' }}
                              required
                            />
                            <button type="submit" className="add-contact-btn">+</button>
                          </form>

                          <div className="geofence-list">
                            {safeZones.map(z => (
                              <div key={z.id} className="geofence-item">
                                <div>
                                  <strong>{z.name}</strong>
                                  <div style={{ fontSize: '10px', color: '#ccc' }}>Radius: {z.radius}m</div>
                                </div>
                                <button onClick={() => handleDeleteZone(z.id)} className="delete-btn">🗑️</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen: LOGS / HISTORY */}
                    {screenState === 'history' && (
                      <div className="app-screen-body-padded">
                        <div className="screen-page-header">
                          <div className="screen-page-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>📜</div>
                          <div>
                            <div className="screen-page-title">Safety Logs</div>
                            <div className="screen-page-sub">{historyLogs.length} event{historyLogs.length !== 1 ? 's' : ''} recorded</div>
                          </div>
                        </div>
                        <div className="history-logs-container">
                          {historyLogs.length === 0 ? (
                            <div className="empty-state">🛡️<span>No emergency events logged. Stay safe!</span></div>
                          ) : historyLogs.map(item => (
                            <div key={item.id} className="history-item-card">
                              <div className="history-item-icon">🚨</div>
                              <div className="history-item-body">
                                <div className="history-item-type">{item.type}</div>
                                <div className="history-item-meta">{item.date} at {item.startTime}</div>
                                <div className="history-item-duration">⏱ Duration: {item.duration || 'N/A'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Screen: MEDICAL PROFILE */}
                    {screenState === 'medical-profile' && (
                      <div className="app-screen-body-padded">
                        <div className="screen-page-header">
                          <div className="screen-page-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-green)' }}>🏥</div>
                          <div>
                            <div className="screen-page-title">Medical Profile</div>
                            <div className="screen-page-sub">Shared with first responders during SOS</div>
                          </div>
                        </div>

                        <div className="form-card">
                          <form onSubmit={handleUpdateMedical} className="app-form">
                            <div className="app-form-row">
                              <label className="app-label">📅 Date of Birth</label>
                              <input type="date" value={dob} onChange={e => setDob(e.target.value)} />
                            </div>
                            <div className="app-form-row">
                              <label className="app-label">🩸 Blood Group</label>
                              <input type="text" placeholder="e.g. A+, O-, B+" value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} />
                            </div>
                            <div className="app-form-row">
                              <label className="app-label">💊 Medical Conditions</label>
                              <textarea placeholder="Allergies, Asthma, Diabetes, etc." value={medicalConditions} onChange={e => setMedicalConditions(e.target.value)} rows="3" />
                            </div>
                            <div className="app-form-row">
                              <label className="app-label">📝 Emergency Notes</label>
                              <textarea placeholder="Special instructions for first responders" value={emergencyNotes} onChange={e => setEmergencyNotes(e.target.value)} rows="3" />
                            </div>
                            <div className="app-form-row">
                              <label className="app-label">🏠 Home Address</label>
                              <input type="text" placeholder="Your residential address" value={homeAddress} onChange={e => setHomeAddress(e.target.value)} />
                            </div>
                            <button type="submit" className="app-primary-btn">💾 Save Medical Profile</button>
                          </form>
                        </div>

                        <button onClick={() => setScreenState('home')} className="app-ghost-btn">← Back to Home</button>
                      </div>
                    )}

                    {/* Screen: SETTINGS */}
                    {screenState === 'settings' && (
                      <div className="app-screen-body-padded">
                        <div className="screen-page-header">
                          <div className="screen-page-icon" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent-blue)' }}>⚙️</div>
                          <div>
                            <div className="screen-page-title">Safety Settings</div>
                            <div className="screen-page-sub">Configure triggers & alerts</div>
                          </div>
                        </div>

                        <div className="form-card">
                          <form onSubmit={handleSaveSettings} className="app-form">
                            <label className="app-toggle-row">
                              <div>
                                <div className="app-toggle-label">Shake Trigger</div>
                                <div className="app-toggle-desc">Trigger SOS by shaking device</div>
                              </div>
                              <input
                                type="checkbox"
                                className="app-toggle"
                                checked={userSettings.shakeEnabled}
                                onChange={e => setUserSettings(prev => ({ ...prev, shakeEnabled: e.target.checked }))}
                              />
                            </label>
                            <div className="app-form-row">
                              <label className="app-label">Power Button Taps to Trigger</label>
                              <input
                                type="number"
                                value={userSettings.powerTapThreshold}
                                onChange={e => setUserSettings(prev => ({ ...prev, powerTapThreshold: parseInt(e.target.value, 10) }))}
                                min="3" max="10"
                              />
                            </div>
                            <div className="app-form-row">
                              <label className="app-label">📨 Alert Message Template</label>
                              <textarea
                                value={userSettings.selectedTemplate}
                                onChange={e => setUserSettings(prev => ({ ...prev, selectedTemplate: e.target.value }))}
                                rows="3"
                              />
                            </div>
                            <button type="submit" className="app-primary-btn">💾 Save Settings</button>
                          </form>
                        </div>

                        <button onClick={handleLogout} className="app-danger-btn" style={{ width: '100%', marginTop: '12px' }}>
                          🚪 Logout from Device
                        </button>
                      </div>
                    )}

                    {/* Screen: ACTIVE SOS (PULSING DISTRESS SCREEN) */}
                    {screenState === 'active-sos' && (
                      <div className="active-sos-emergency-screen">
                        <div className="sos-live-badge">🔴 LIVE</div>
                        <div className="sos-active-icon">🚨</div>
                        <h2 className="sos-active-title">SOS Mode Active</h2>
                        <p className="sos-active-desc">Live telemetry streaming to university command center and all emergency contacts.</p>

                        <div className="sos-incident-card">
                          <div className="sos-incident-label">Current Threat</div>
                          <div className="sos-incident-type">{activeIncident ? activeIncident.type : 'Emergency Alert'}</div>
                        </div>

                        <button
                          onClick={() => { setLockScreenReason('disarm-sos'); setScreenState('lock-screen'); }}
                          className="disarm-emergency-btn"
                        >
                          🛑 DISARM ALARM
                        </button>
                      </div>
                    )}

                  </div>

                  {/* Phone Bezel Bottom Nav Bar */}
                  {currentUser && !['login', 'signup', 'verify-code', 'forgot-password', 'reset-new-password', 'lock-screen', 'active-sos'].includes(screenState) && (
                    <div className="phone-navbar">
                      <button className={screenState === 'home' ? 'active' : ''} onClick={() => setScreenState('home')}>🆘<span>Home</span></button>
                      <button className={screenState === 'contacts' ? 'active' : ''} onClick={() => setScreenState('contacts')}>📞<span>Contacts</span></button>
                      <button className={screenState === 'timers' ? 'active' : ''} onClick={() => setScreenState('timers')}>⏱️<span>Timer</span></button>
                      <button className={screenState === 'zones' ? 'active' : ''} onClick={() => setScreenState('zones')}>🗺️<span>Map</span></button>
                      <button className={screenState === 'history' ? 'active' : ''} onClick={() => setScreenState('history')}>📜<span>Logs</span></button>
                      <button className={screenState === 'settings' ? 'active' : ''} onClick={() => setScreenState('settings')}>⚙️<span>Settings</span></button>
                    </div>
                  )}

                  <div className="screen-home-indicator"></div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: CONTACT MONITORING CONSOLE */}
          {workspaceView === 'contact-dashboard' && (
            <div className="dashboard-panel">
              {!contactConsoleAuthenticated ? (
                <div className="panel-login-gate">
                  <div className="panel-login-card">
                    <div className="panel-login-icon" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent-blue)' }}>📡</div>
                    <h2 className="panel-login-title">Emergency Console Gate</h2>
                    <p className="panel-login-sub">Access reserved for authorized university emergency contacts only.</p>
                    <form onSubmit={handleContactLogin} className="panel-login-form">
                      <div className="panel-input-group">
                        <label>Contact Email</label>
                        <input type="email" placeholder="your@email.com" value={contactAuthEmail} onChange={e => setContactAuthEmail(e.target.value)} required />
                      </div>
                      <div className="panel-input-group">
                        <label>Security PIN</label>
                        <input type="password" placeholder="4-digit access PIN" value={contactAuthPin} onChange={e => setContactAuthPin(e.target.value)} required />
                      </div>
                      <button type="submit" className="panel-login-btn">🔓 Authorize Console Access</button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="admin-content-wrapper">
                  {/* Header */}
                  <div className="admin-panel-header">
                    <div className="admin-panel-header-left">
                      <div className="admin-panel-badge" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent-blue)' }}>📡</div>
                      <div>
                        <h2 className="admin-panel-title">Emergency Surveillance Console</h2>
                        <p className="admin-panel-sub">Real-time GPS tracking & live incident feed</p>
                      </div>
                    </div>
                    <div className="admin-panel-header-right">
                      <span className="admin-live-dot"></span>
                      <span className="admin-live-label">LIVE</span>
                      <button onClick={() => setContactConsoleAuthenticated(false)} className="admin-logout-btn">✕ Close Console</button>
                    </div>
                  </div>

                  <div className="console-dashboard-grid">
                    {/* Live Map Card */}
                    <div className="console-map-card">
                      <div className="console-card-header">
                        <span className="console-card-title">🗺️ Live GPS Tracking Terminal</span>
                        <span className="console-live-badge">📡 LIVE</span>
                      </div>
                      <div id="contact-map" style={{ height: '320px', width: '100%', borderRadius: '0 0 12px 12px' }}></div>
                    </div>

                    {/* Incident Info Card */}
                    <div className="console-incident-card">
                      <div className="console-card-header">
                        <span className="console-card-title">🚨 Active Incident</span>
                      </div>
                      {contactDashboardIncident ? (
                        <div className="console-incident-body">
                          <div className="console-incident-alert">
                            <span className="console-alert-dot"></span>
                            <span>Active Distress Incident</span>
                          </div>

                          <div className="console-info-grid">
                            <div className="console-info-item">
                              <div className="console-info-label">Student Name</div>
                              <div className="console-info-value">{contactDashboardIncident.userName}</div>
                            </div>
                            <div className="console-info-item">
                              <div className="console-info-label">Phone</div>
                              <div className="console-info-value">{contactDashboardIncident.userPhone}</div>
                            </div>
                            <div className="console-info-item">
                              <div className="console-info-label">Threat Type</div>
                              <div className="console-info-value" style={{ color: '#ef4444' }}>{contactDashboardIncident.type}</div>
                            </div>
                            <div className="console-info-item">
                              <div className="console-info-label">Time</div>
                              <div className="console-info-value">{contactDashboardIncident.startTime}</div>
                            </div>
                          </div>

                          <div className="console-medical-card">
                            <div className="console-medical-title">🏥 Medical Profile</div>
                            <div className="console-medical-row"><span>Blood Group:</span><strong>{contactDashboardIncident.bloodGroup || 'N/A'}</strong></div>
                            <div className="console-medical-row"><span>Conditions:</span><strong>{contactDashboardIncident.medicalConditions || 'None'}</strong></div>
                            <div className="console-medical-row"><span>Notes:</span><strong>{contactDashboardIncident.emergencyNotes || 'None'}</strong></div>
                          </div>
                        </div>
                      ) : (
                        <div className="console-idle-state">
                          <div className="console-idle-icon">📡</div>
                          <div className="console-idle-title">Monitoring Feed Active</div>
                          <div className="console-idle-sub">Awaiting distress trigger from student device</div>
                          <div className="console-idle-pulse"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: ADMIN PANEL VIEW */}
          {workspaceView === 'admin-panel' && (
            <div className="dashboard-panel">
              {!adminAuthenticated ? (
                <div className="panel-login-gate">
                  <div className="panel-login-card">
                    <div className="panel-login-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>🛡️</div>
                    <h2 className="panel-login-title">Admin Command Center</h2>
                    <p className="panel-login-sub">Restricted access — System Administrator credentials required.</p>
                    <form onSubmit={handleAdminLogin} className="panel-login-form">
                      <div className="panel-input-group">
                        <label>Admin Email</label>
                        <input type="email" placeholder="admin@leadcity.edu.ng" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required />
                      </div>
                      <div className="panel-input-group">
                        <label>Password</label>
                        <input type="password" placeholder="••••••••" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required />
                      </div>
                      <button type="submit" className="panel-login-btn" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 4px 14px rgba(239,68,68,0.3)' }}>🔐 Login to Command Center</button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="admin-content-wrapper">
                  {/* Header */}
                  <div className="admin-panel-header">
                    <div className="admin-panel-header-left">
                      <div className="admin-panel-badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>🛡️</div>
                      <div>
                        <h2 className="admin-panel-title">Command & Control Console</h2>
                        <p className="admin-panel-sub">Manage users, view logs and system analytics</p>
                      </div>
                    </div>
                    <div className="admin-panel-header-right">
                      <button onClick={() => setAdminAuthenticated(false)} className="admin-logout-btn">🚪 Logout</button>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <section className="admin-stats-grid">
                    <div className="admin-stat-card">
                      <div className="admin-stat-icon" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent-blue)' }}>👤</div>
                      <div className="admin-stat-body">
                        <div className="admin-stat-number">{adminStats.totalUsers}</div>
                        <div className="admin-stat-label">Registered Users</div>
                      </div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="admin-stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>🚨</div>
                      <div className="admin-stat-body">
                        <div className="admin-stat-number" style={{ color: '#ef4444' }}>{adminStats.activeEmergencies}</div>
                        <div className="admin-stat-label">Active Emergencies</div>
                      </div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="admin-stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-green)' }}>📋</div>
                      <div className="admin-stat-body">
                        <div className="admin-stat-number">{adminStats.totalHistory}</div>
                        <div className="admin-stat-label">Historical Logs</div>
                      </div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="admin-stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--color-orange)' }}>⏱️</div>
                      <div className="admin-stat-body">
                        <div className="admin-stat-number">{adminStats.uptime}</div>
                        <div className="admin-stat-label">System Uptime</div>
                      </div>
                    </div>
                  </section>

                  {/* User Directory */}
                  <div className="admin-table-card">
                    <div className="admin-table-header">
                      <div>
                        <div className="admin-table-title">👤 Student & User Directory</div>
                        <div className="admin-table-sub">{adminUsers.length} registered user{adminUsers.length !== 1 ? 's' : ''} in system</div>
                      </div>
                    </div>
                    <div className="admin-table-scroll">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>SOS Contacts</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(adminUsers) && adminUsers.map(u => (
                            <tr key={u.id}>
                              <td>
                                <div className="admin-user-cell">
                                  <div className="admin-user-avatar">{u.name?.charAt(0).toUpperCase()}</div>
                                  <span>{u.name}</span>
                                </div>
                              </td>
                              <td>{u.phone}</td>
                              <td>{u.email}</td>
                              <td>
                                <span className={`admin-status-badge ${u.status === 'suspended' ? 'status-suspended' : 'status-active'}`}>
                                  {u.status === 'suspended' ? '⛔ Suspended' : '✅ Active'}
                                </span>
                              </td>
                              <td><span className="admin-contacts-badge">{u.sosContactsCount}</span></td>
                              <td>
                                <button
                                  onClick={() => toggleUserSuspension(u.id, u.status)}
                                  className={`admin-action-btn ${u.status === 'suspended' ? 'btn-activate' : 'btn-suspend'}`}
                                >
                                  {u.status === 'suspended' ? '✓ Activate' : '⊘ Suspend'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
