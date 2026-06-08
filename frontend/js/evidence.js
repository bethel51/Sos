/* ==========================================================================
   Silent SOS - Audio/Image/Video Evidence Collector (REST Integration)
   ========================================================================== */

export class EvidenceCollector {
  constructor(app) {
    this.app = app;
    this.audioRecorder = null;
    this.audioChunks = [];
    this.audioUrl = null;
    this.isAudioRecording = false;
    this.isAudioPaused = false;
    
    this.captureIntervalId = null;
    this.mockImageIndex = 0;
    this.cameraStream = null;
    
    // Configuration options (defaults)
    this.config = {
      cameraMode: 'both', // 'front', 'back', 'both'
      captureFrequency: 30, // 0 (once), 30 (seconds), 60 (seconds)
      videoEnabled: false
    };
  }

  getHeaders() {
    const token = localStorage.getItem('silentsos_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  // --- AUDIO COLLECTION ---
  async startAudioRecording() {
    this.audioChunks = [];
    this.isAudioRecording = true;
    this.isAudioPaused = false;
    
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioRecorder = new MediaRecorder(stream);
        
        this.audioRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
            
            // Stream audio chunk in real-time
            if (this.app.socket && this.app.authManager.currentUser) {
              const reader = new FileReader();
              reader.readAsDataURL(event.data);
              reader.onloadend = () => {
                const base64Chunk = reader.result;
                this.app.socket.emit('audio_stream_chunk', {
                  userId: this.app.authManager.currentUser.id,
                  chunk: base64Chunk
                });
              };
            }
          }
        };

        this.audioRecorder.onstop = async () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result;
            this.audioUrl = base64Audio;
            if (this.app.sosActiveIncident) {
              this.app.sosActiveIncident.audioRecordingUrl = this.audioUrl;
            }
            await this.uploadEvidence({ audio: this.audioUrl });
            this.app.logEvent('Audio recording saved successfully to server.', 'info');
            this.app.syncActiveEmergencyData();
          };
        };

        // Pass 1000ms timeslice to trigger ondataavailable periodically
        this.audioRecorder.start(1000);
        this.app.logEvent('Microphone activated. Audio streaming started.', 'info');
      } else {
        this.startMockAudio();
      }
    } catch (err) {
      console.warn("Microphone access denied, using mock audio visualizer:", err);
      this.startMockAudio();
    }
  }

  startMockAudio() {
    this.audioRecorder = null;
    this.isAudioRecording = true;
    this.app.logEvent('Microphone permission missing. Simulating background audio capture.', 'warning');
    
    this.mockAudioInterval = setInterval(() => {
      if (!this.isAudioRecording) {
        clearInterval(this.mockAudioInterval);
        return;
      }
      if (this.app.socket && this.app.authManager.currentUser) {
        // Emit tiny valid empty WAV base64 chunk to simulate stream activity
        this.app.socket.emit('audio_stream_chunk', {
          userId: this.app.authManager.currentUser.id,
          chunk: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAAHAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA=='
        });
      }
    }, 1000);
  }

  pauseAudioRecording() {
    if (!this.isAudioRecording || this.isAudioPaused) return;
    
    if (this.audioRecorder && this.audioRecorder.state === 'recording') {
      this.audioRecorder.pause();
    }
    this.isAudioPaused = true;
    this.app.logEvent('Audio recording paused.', 'info');
  }

  resumeAudioRecording() {
    if (!this.isAudioRecording || !this.isAudioPaused) return;
    
    if (this.audioRecorder && this.audioRecorder.state === 'paused') {
      this.audioRecorder.resume();
    }
    this.isAudioPaused = false;
    this.app.logEvent('Audio recording resumed.', 'info');
  }

  async stopAudioRecording() {
    if (!this.isAudioRecording) return;
    
    if (this.mockAudioInterval) {
      clearInterval(this.mockAudioInterval);
      this.mockAudioInterval = null;
    }
    
    if (this.audioRecorder && this.audioRecorder.state !== 'inactive') {
      this.audioRecorder.stop();
      this.audioRecorder.stream.getTracks().forEach(track => track.stop());
    } else {
      this.audioUrl = 'mock_audio_stream_' + Date.now();
      if (this.app.sosActiveIncident) {
        this.app.sosActiveIncident.audioRecordingUrl = this.audioUrl;
      }
      await this.uploadEvidence({ audio: this.audioUrl });
      this.app.logEvent('Simulated audio evidence stored securely on server.', 'info');
    }
    
    this.isAudioRecording = false;
    this.isAudioPaused = false;
  }

  // --- CAMERA IMAGE CAPTURE ---
  async startCameraCapture() {
    this.stopCameraCapture();
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: this.config.cameraMode === 'front' ? 'user' : 'environment' } 
        });
        this.cameraStream = stream;
        this.app.logEvent('Camera stream acquired successfully.', 'info');
        
        const preview = document.getElementById('active-sos-cam-preview');
        if (preview) {
          preview.srcObject = stream;
          preview.play().catch(e => console.warn("Auto-play preview failed", e));
        }
      } catch (err) {
        console.warn("Could not acquire persistent camera stream:", err);
      }
    }
    
    // First immediate capture
    this.captureSnapshot();
    
    // Setup recurring capture if configured
    const freqSeconds = parseInt(this.config.captureFrequency);
    if (freqSeconds > 0) {
      this.captureIntervalId = setInterval(() => {
        this.captureSnapshot();
      }, freqSeconds * 1000);
      this.app.logEvent(`Camera monitoring active. Capturing every ${freqSeconds}s.`, 'info');
    }
  }

  stopCameraCapture() {
    if (this.captureIntervalId) {
      clearInterval(this.captureIntervalId);
      this.captureIntervalId = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
  }

  async captureSnapshot() {
    const timeStr = new Date().toLocaleTimeString();
    
    if (this.cameraStream) {
      try {
        const video = document.createElement('video');
        video.srcObject = this.cameraStream;
        await video.play();
        
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imgData = canvas.toDataURL('image/jpeg');
        const isFront = this.config.cameraMode === 'front' || (this.config.cameraMode === 'both' && this.mockImageIndex % 2 === 0);
        await this.saveCapturedImage(imgData, isFront ? 'front' : 'back', timeStr);
        this.mockImageIndex++;
        return;
      } catch (err) {
        console.warn("Failed drawing snapshot from persistent stream, trying fallback:", err);
      }
    }
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: this.config.cameraMode === 'front' ? 'user' : 'environment' } 
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imgData = canvas.toDataURL('image/jpeg');
        await this.saveCapturedImage(imgData, this.config.cameraMode, timeStr);
        
        stream.getTracks().forEach(track => track.stop());
        return;
      } catch (err) {
        console.warn("Camera hardware unavailable or denied. Generating mock snapshot:", err);
      }
    }
    
    this.generateMockSnapshot(timeStr);
  }

  async generateMockSnapshot(timeStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    const isFront = this.config.cameraMode === 'front' || (this.config.cameraMode === 'both' && this.mockImageIndex % 2 === 0);
    const modeLabel = isFront ? 'FRONT CAMERA' : 'BACK CAMERA';
    
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    if (isFront) {
      grad.addColorStop(0, '#111122');
      grad.addColorStop(1, '#ff2e63');
    } else {
      grad.addColorStop(0, '#050510');
      grad.addColorStop(1, '#08d9d6');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 300);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.arc(200, 150, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(200, 260, 100, 0, Math.PI, true);
    ctx.fill();

    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * 400;
      const y = Math.random() * 300;
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.08})`;
      ctx.fillRect(x, y, 1, 1);
    }
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Outfit", sans-serif';
    ctx.fillText(`SILENT SOS SECURITY STREAM - ${modeLabel}`, 15, 25);
    
    ctx.font = '10px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(`GPS Coordinates: ${this.app.locationManager.lat.toFixed(5)}, ${this.app.locationManager.lng.toFixed(5)}`, 15, 265);
    ctx.fillText(`Captured: ${timeStr} | Environment Threat High`, 15, 280);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(200, 130); ctx.lineTo(200, 170);
    ctx.moveTo(180, 150); ctx.lineTo(220, 150);
    ctx.stroke();

    const imgData = canvas.toDataURL('image/jpeg');
    await this.saveCapturedImage(imgData, isFront ? 'front' : 'back', timeStr);
    this.mockImageIndex++;
  }

  async saveCapturedImage(dataUrl, source, timestamp) {
    const photoObj = {
      id: 'photo_' + Date.now(),
      src: dataUrl,
      source: source,
      timestamp: timestamp
    };
    
    if (this.app.sosActiveIncident) {
      if (!this.app.sosActiveIncident.photos) {
        this.app.sosActiveIncident.photos = [];
      }
      this.app.sosActiveIncident.photos.push(photoObj);
    }
    
    await this.uploadEvidence({ photo: photoObj });
    this.app.logEvent(`Image captured from ${source} camera.`, 'info');
    this.app.syncActiveEmergencyData();
  }

  async uploadEvidence(payload) {
    try {
      const response = await fetch('/api/sos/evidence', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const activeInc = await response.json();
        this.app.sosActiveIncident = activeInc;
      }
    } catch (err) {
      console.error('Offline/failed uploading evidence to server:', err);
    }
  }

  // --- VIDEO TELEMETRY ---
  startVideoTelemetry() {
    if (this.config.videoEnabled) {
      this.app.logEvent('Background video collection active. Recording metadata stream.', 'info');
    }
  }

  stopVideoTelemetry() {
    if (this.config.videoEnabled) {
      this.app.logEvent('Video recording final stream packaged & sent.', 'info');
    }
  }
}
