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

  async createMockIncident(type) {
    try {
      const response = await fetch('/api/history', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ type })
      });
      if (response.ok) {
        const newInc = await response.json();
        this.incidents.unshift(newInc);
        localStorage.setItem(`silentsos_history_${this.userId}`, JSON.stringify(this.incidents));
        return newInc;
      }
    } catch (e) {
      console.error('Error creating mock incident log:', e);
    }
  }

  async deleteIncident(id) {
    try {
      const response = await fetch(`/api/history/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      if (response.ok) {
        this.incidents = this.incidents.filter(inc => inc.id !== id);
        localStorage.setItem(`silentsos_history_${this.userId}`, JSON.stringify(this.incidents));
        return true;
      }
    } catch (e) {
      console.error('Error deleting incident log:', e);
    }
    return false;
  }

  getIncidents() {
    return this.incidents;
  }
}
