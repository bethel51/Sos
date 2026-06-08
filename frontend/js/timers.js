/* ==========================================================================
   Silent SOS - Timers & Check-in Manager
   ========================================================================== */

export class TimersManager {
  constructor(app) {
    this.app = app;
    this.timerId = null;
    this.remainingSeconds = 0;
    this.activeTimerType = null; // 'safety', 'arrival', 'deviation'
    this.checkInTimeoutId = null;
  }

  // --- SAFETY TIMER COUNTDOWN ---
  startSafetyTimer(durationSeconds) {
    this.clearAllTimers();
    this.remainingSeconds = durationSeconds;
    this.activeTimerType = 'safety';
    this.app.logEvent(`Safety Timer started for ${durationSeconds} seconds.`, 'info');
    
    this.runTimerLoop();
  }

  // --- SAFE ARRIVAL TIMER ---
  startSafeArrivalTimer(durationSeconds) {
    this.clearAllTimers();
    this.remainingSeconds = durationSeconds;
    this.activeTimerType = 'arrival';
    this.app.logEvent(`Safe Arrival monitoring started. Check-in expected in ${durationSeconds}s.`, 'info');
    
    this.runTimerLoop();
  }

  // --- ROUTE DEVIATION WARNING TIMER ---
  startDeviationCountdown() {
    // Only start if no timer is already running to avoid override issues
    if (this.activeTimerType === 'deviation') return;
    
    this.clearAllTimers();
    this.remainingSeconds = 15; // 15 seconds to disarm deviation warning
    this.activeTimerType = 'deviation';
    this.app.logEvent('Route deviation check-in countdown triggered (15s).', 'warning');
    
    this.runTimerLoop();
    this.app.renderActivePage(); // Force page switch to prompt check-in
  }

  runTimerLoop() {
    if (this.timerId) clearInterval(this.timerId);
    
    this.timerId = setInterval(() => {
      this.remainingSeconds--;
      
      // Update UI countdown values
      const valContainer = document.getElementById('timer-countdown-val');
      if (valContainer) {
        valContainer.textContent = this.formatTime(this.remainingSeconds);
        if (this.remainingSeconds <= 5) {
          valContainer.classList.add('urgent');
        } else {
          valContainer.classList.remove('urgent');
        }
      }

      if (this.remainingSeconds <= 0) {
        clearInterval(this.timerId);
        this.timerId = null;
        this.handleTimerExpiry();
      }
    }, 1000);
  }

  handleTimerExpiry() {
    this.app.logEvent(`Timer (${this.activeTimerType}) expired without check-in response.`, 'critical');
    
    if (this.activeTimerType === 'safety') {
      // Trigger prompt for PIN confirmation, but set a short fallback timeout
      this.triggerSOSConfirmationRequest();
    } else if (this.activeTimerType === 'arrival') {
      // Trigger immediate SOS because arrival confirmation failed
      this.app.sosManager.activateSOS('Accident / Non-Responsive');
      this.clearAllTimers();
    } else if (this.activeTimerType === 'deviation') {
      // Deviaion countdown expired, trigger SOS
      this.app.sosManager.activateSOS('Stalking / Deviation Threat');
      this.clearAllTimers();
    }
  }

  triggerSOSConfirmationRequest() {
    // Prompt the user in-app
    this.app.showToast('Security Check-in Required!', 'Please confirm you are safe by entering your PIN immediately.', 'error');
    
    // Switch to Pin Unlock Screen with countdown
    this.app.currentScreenState = 'lock-screen';
    this.app.lockScreenReason = 'disarm-timer';
    this.app.renderActivePage();
    
    // If they don't enter PIN in 10 seconds, activate SOS
    this.checkInTimeoutId = setTimeout(() => {
      if (this.app.authManager.currentUser) {
        this.app.sosManager.activateSOS('Safety Timer Exceeded');
        this.clearAllTimers();
      }
    }, 10000);
  }

  clearAllTimers() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.checkInTimeoutId) {
      clearTimeout(this.checkInTimeoutId);
      this.checkInTimeoutId = null;
    }
    this.activeTimerType = null;
    this.remainingSeconds = 0;
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
