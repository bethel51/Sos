import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import Dashboard from './components/Dashboard';
import ContactsPanel from './components/ContactsPanel';
import SafeZonesMap from './components/SafeZonesMap';
import SafetyTimer from './components/SafetyTimer';
import HistoryFeed from './components/HistoryFeed';
import AdminPanel from './components/AdminPanel';

// Socket.io client helper
const getSocket = () => {
  if (typeof window !== 'undefined' && window.io) {
    return window.io();
  }
  return null;
};

export default function App() {
  // Navigation & Authentication
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('lc_token') || '');
  const [screenState, setScreenState] = useState('home'); // home, contacts, zones, history, settings, medical-profile, timers, admin
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Safety Timer
  const [safetyTimerDuration, setSafetyTimerDuration] = useState(120);
  const [safetyTimerActive, setSafetyTimerActive] = useState(false);
  const [safetyTimerSecondsLeft, setSafetyTimerSecondsLeft] = useState(0);
  const timerIntervalRef = useRef(null);

  // App data lists
  const [contacts, setContacts] = useState([]);
  const [safeZones, setSafeZones] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);

  // Profile data
  const [dob, setDob] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [emergencyNotes, setEmergencyNotes] = useState('');
  const [homeAddress, setHomeAddress] = useState('');

  // Simulator controls (simulated device metrics)
  const [simLat, setSimLat] = useState(4.8156);
  const [simLng, setSimLng] = useState(7.0498);
  const [batteryLevel] = useState(85);

  // Media Capture Refs
  const cameraStreamRef = useRef(null);
  const cameraIntervalRef = useRef(null);
  const mockImageIndexRef = useRef(0);
  const isMediaRecordingRef = useRef(false);

  const socketRef = useRef(null);

  // Toast dispatch helper
  const showToast = (title, text, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, title, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Audio/Camera capture routines (Phase 1 background safety evidence capture)
  const startCameraCapture = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        cameraStreamRef.current = stream;
      } catch (err) {
        console.warn("Could not acquire persistent camera stream:", err);
      }
    }
    captureSnapshot();
    cameraIntervalRef.current = setInterval(captureSnapshot, 30000);
  };

  const stopCameraCapture = () => {
    if (cameraIntervalRef.current) {
      clearInterval(cameraIntervalRef.current);
      cameraIntervalRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
  };

  const captureSnapshot = async () => {
    const timeStr = new Date().toLocaleTimeString();
    if (cameraStreamRef.current) {
      try {
        const video = document.createElement('video');
        video.srcObject = cameraStreamRef.current;
        await video.play();

        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imgData = canvas.toDataURL('image/jpeg');
        await uploadEvidence({ photo: { id: 'photo_' + Date.now(), src: imgData, source: 'front', timestamp: timeStr } });
        return;
      } catch (err) {
        console.warn("Persistent capture fallback:", err);
      }
    }
  };

  const uploadEvidence = async (payload) => {
    try {
      const response = await fetch('/api/sos/evidence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const activeInc = await response.json();
        setActiveIncident(activeInc);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // SOS Trigger Routines
  const triggerSOS = (type) => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }

    fetch('/api/sos/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ type, lat: simLat, lng: simLng })
    })
      .then(res => {
        if (!res.ok) return res.json().then(d => { throw new Error(d.error) });
        return res.json();
      })
      .then(incident => {
        setActiveIncident(incident);
        showToast('SOS Triggered', 'Emergency alerts dispatched.', 'error');
      })
      .catch(err => showToast('Error', err.message, 'error'));
  };

  const deactivateSOS = () => {
    fetch('/api/sos/deactivate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(() => {
        setActiveIncident(null);
        showToast('SOS Disarmed', 'Emergency resolved safely.', 'success');
      })
      .catch(err => showToast('Error', err.message, 'error'));
  };

  // Handle Token / Session check
  useEffect(() => {
    if (token) {
      fetch('/api/auth/profile', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Invalid session');
        })
        .then(data => {
          setCurrentUser(data.user);
          setDob(data.user.dob || '');
          setBloodGroup(data.user.bloodGroup || '');
          setMedicalConditions(data.user.medicalConditions || '');
          setEmergencyNotes(data.user.emergencyNotes || '');
          setHomeAddress(data.user.homeAddress || '');
        })
        .catch(() => {
          setToken('');
          localStorage.removeItem('lc_token');
        });
    }
  }, [token]);

  // Sync Sockets
  useEffect(() => {
    socketRef.current = getSocket();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // Sync Data on Tab screen transitions
  useEffect(() => {
    if (!currentUser) return;
    if (screenState === 'contacts') {
      fetch('/api/contacts', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setContacts(Array.isArray(data) ? data : []));
    } else if (screenState === 'zones') {
      fetch('/api/zones', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setSafeZones(Array.isArray(data) ? data : []));
    } else if (screenState === 'history') {
      fetch('/api/history', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setHistoryLogs(Array.isArray(data) ? data : []));
    }
  }, [screenState, currentUser, token]);

  // Active Incident Polling
  useEffect(() => {
    if (!currentUser) return;
    const checkActive = () => {
      fetch('/api/sos/active', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          if (data.active) {
            setActiveIncident(data.incident);
          } else {
            setActiveIncident(null);
          }
        });
    };
    checkActive();
    const interval = setInterval(checkActive, 5000);
    return () => clearInterval(interval);
  }, [currentUser, token]);

  // Media recording listeners
  useEffect(() => {
    if (activeIncident) {
      if (!isMediaRecordingRef.current) {
        isMediaRecordingRef.current = true;
        startCameraCapture();
      }
    } else {
      if (isMediaRecordingRef.current) {
        isMediaRecordingRef.current = false;
        stopCameraCapture();
      }
    }
  }, [activeIncident]);

  // Safety Timer Logic
  useEffect(() => {
    if (safetyTimerActive) {
      setSafetyTimerSecondsLeft(safetyTimerDuration);
      timerIntervalRef.current = setInterval(() => {
        setSafetyTimerSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            setSafetyTimerActive(false);
            triggerSOS('Safety Check-in Timer Expired');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [safetyTimerActive]);

  const handleLogout = () => {
    setToken('');
    setCurrentUser(null);
    localStorage.removeItem('lc_token');
    showToast('Signed Out', 'Session ended successfully.', 'info');
    setScreenState('home');
  };

  const handleAddContact = (contact) => {
    fetch('/api/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(contact)
    })
      .then(res => res.json())
      .then(data => {
        setContacts(prev => [...prev, data]);
        showToast('Contact Added', 'New emergency responder registered.', 'success');
      });
  };

  const handleDeleteContact = (contactId) => {
    fetch(`/api/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(() => {
        setContacts(prev => prev.filter(c => c.id !== contactId));
        showToast('Contact Deleted', 'Emergency responder removed.', 'info');
      });
  };
  const handleAddZone = (zone) => {
    fetch('/api/zones', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(zone)
    })
      .then(res => res.json())
      .then(data => {
        setSafeZones(prev => [...prev, data]);
        showToast('Safe Zone Added', 'Geofence activated for this zone.', 'success');
      })
      .catch(err => showToast('Error', err.message, 'error'));
  };

  const handleDeleteZone = (zoneId) => {
    fetch(`/api/zones/${zoneId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(() => {
        setSafeZones(prev => prev.filter(z => (z.id || z._id) !== zoneId));
        showToast('Safe Zone Removed', 'Geofence deactivated.', 'info');
      })
      .catch(err => showToast('Error', err.message, 'error'));
  };

  return (
    <div id="root">
      <Navbar 
        currentUser={currentUser} 
        screenState={screenState} 
        setScreenState={setScreenState} 
        onOpenAuth={() => setIsAuthOpen(true)} 
        onLogout={handleLogout} 
        activeIncident={activeIncident}
        onTriggerSOS={triggerSOS}
      />

      <main className="web-app-container">
        {screenState === 'home' && (
          <Dashboard 
            currentUser={currentUser} 
            activeIncident={activeIncident} 
            onTriggerSOS={triggerSOS} 
            onDeactivateSOS={deactivateSOS} 
            setScreenState={setScreenState}
            simLat={simLat}
            simLng={simLng}
            batteryLevel={batteryLevel}
          />
        )}

        {screenState === 'contacts' && (
          <ContactsPanel 
            contacts={contacts} 
            onAddContact={handleAddContact} 
            onDeleteContact={handleDeleteContact} 
            token={token} 
          />
        )}

        {screenState === 'zones' && (
          <SafeZonesMap 
            safeZones={safeZones} 
            simLat={simLat} 
            simLng={simLng} 
            onAddZone={handleAddZone}
            onDeleteZone={handleDeleteZone}
          />
        )}

        {screenState === 'timers' && (
          <SafetyTimer 
            safetyTimerActive={safetyTimerActive} 
            safetyTimerSecondsLeft={safetyTimerSecondsLeft} 
            safetyTimerDuration={safetyTimerDuration} 
            setSafetyTimerDuration={setSafetyTimerDuration} 
            onStartTimer={() => setSafetyTimerActive(true)} 
            onCancelTimer={() => setSafetyTimerActive(false)} 
          />
        )}

        {screenState === 'history' && (
          <HistoryFeed historyLogs={historyLogs} />
        )}

        {screenState === 'admin' && (
          <AdminPanel showToast={showToast} />
        )}
      </main>

      <AuthModal 
        isOpen={isAuthOpen} 
        onClose={() => setIsAuthOpen(false)} 
        onLoginSuccess={(user, token) => {
          setCurrentUser(user);
          setToken(token);
          localStorage.setItem('lc_token', token);
        }}
        showToast={showToast}
      />

      {/* Toast Notification HUD */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item ${t.type}`}>
            <div>
              <strong style={{ display: 'block', fontSize: '14px' }}>{t.title}</strong>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
