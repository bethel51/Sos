/* ==========================================================================
   Silent SOS - Authentication & Profile Manager (REST Backend Integration)
   ========================================================================== */

export class AuthManager {
  constructor(app) {
    this.app = app;
    this.currentUser = null;
    this.tokenKey = 'silentsos_token';
  }

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  // Set auth headers for requests
  getHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  async loadSession() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const response = await fetch('/api/auth/profile', {
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        this.currentUser = data.user;
        this.app.initUserSession(this.currentUser);
        return this.currentUser;
      } else {
        this.logout();
      }
    } catch (error) {
      console.error('Session load error, working offline/cached mode:', error);
      // Try to load cached user if offline
      const cached = localStorage.getItem('silentsos_cached_user');
      if (cached) {
        this.currentUser = JSON.parse(cached);
        this.app.initUserSession(this.currentUser);
        return this.currentUser;
      }
    }
    return null;
  }

  validatePassword(password) {
    const minLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    
    return {
      isValid: minLength && hasUpper && hasLower && hasDigit && hasSpecial,
      errors: {
        minLength: !minLength,
        hasUpper: !hasUpper,
        hasLower: !hasLower,
        hasDigit: !hasDigit,
        hasSpecial: !hasSpecial
      }
    };
  }

  async sendOTP(userData) {
    const validation = this.validatePassword(userData.password);
    if (!validation.isValid) {
      throw new Error('Password does not meet secure strength requirements.');
    }

    const response = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to dispatch verification email');
    }
    return true;
  }

  async verifyAndSignUp(email, code) {
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Verification failed');
    }

    localStorage.setItem(this.tokenKey, data.token);
    localStorage.setItem('silentsos_cached_user', JSON.stringify(data.user));
    this.currentUser = data.user;
    this.app.initUserSession(this.currentUser);
    return data.user;
  }

  async login(email, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem(this.tokenKey, data.token);
    localStorage.setItem('silentsos_cached_user', JSON.stringify(data.user));
    this.currentUser = data.user;
    this.app.initUserSession(this.currentUser);
    return data.user;
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem('silentsos_cached_user');
  }

  async updateProfile(profileData) {
    if (!this.currentUser) return;
    
    const response = await fetch('/api/auth/profile/update', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(profileData)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Profile update failed');
    }

    this.currentUser = data.user;
    localStorage.setItem('silentsos_cached_user', JSON.stringify(data.user));
    return data.user;
  }

  async forgotPassword(email) {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send password reset code.');
    }
    return true;
  }

  async resetPassword(email, code, newPassword) {
    const validation = this.validatePassword(newPassword);
    if (!validation.isValid) {
      throw new Error('Password does not meet secure strength requirements.');
    }

    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Password reset failed');
    }
    return true;
  }

  async suspendUser(userId, suspendState) {
    const adminToken = localStorage.getItem('silentsos_admin_token');
    const response = await fetch(`/api/admin/users/${userId}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ suspend: suspendState })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update user suspension status');
    }
    return data;
  }
}
