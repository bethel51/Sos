/* ==========================================================================
   Silent SOS - Incident History Log & Replay (REST Integration)
   ========================================================================== */

export class HistoryManager {
  constructor(app, userId) {
    this.app = app;
    this.userId = userId;
    this.incidents = [];
    this.loadHistory();
  }

  getHeaders() {
    const token = localStorage.getItem('silentsos_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  async loadHistory() {
    try {
      const response = await fetch('/api/history', {
        headers: this.getHeaders()
      });
      if (response.ok) {
        this.incidents = await response.json();
        localStorage.setItem(`silentsos_history_${this.userId}`, JSON.stringify(this.incidents));
      } else {
        throw new Error('Failed to load incident history');
      }
    } catch (error) {
      console.error('Offline/cached history loading:', error);
      const saved = localStorage.getItem(`silentsos_history_${this.userId}`);
      if (saved) {
        this.incidents = JSON.parse(saved);
      }
    }
    return this.incidents;
  }

  addIncident(incident) {
    // Unshift locally. Main sync is handled by server during SOS deactivate.
    this.incidents.unshift(incident);
    localStorage.setItem(`silentsos_history_${this.userId}`, JSON.stringify(this.incidents));
  }

  getIncidents() {
    return this.incidents;
  }
}
