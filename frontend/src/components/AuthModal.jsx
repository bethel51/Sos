import React, { useState } from 'react';

export default function AuthModal({ isOpen, onClose, onLoginSuccess, showToast }) {
  const [authMode, setAuthMode] = useState('login'); // login, signup, verify-otp, forgot-password, reset-password

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('1234');
  const [otpCode, setOtpCode] = useState(['', '', '', '']);
  const [devOtp, setDevOtp] = useState(null);

  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState(['', '', '', '']);
  const [newPassword, setNewPassword] = useState('');

  if (!isOpen) return null;

  const handleLogin = (e) => {
    e.preventDefault();
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error || 'Login failed'); });
      })
      .then(data => {
        onLoginSuccess(data.user, data.token);
        showToast('Welcome Back', `Signed in as ${data.user.name}`, 'success');
        onClose();
      })
      .catch(err => showToast('Login Error', err.message, 'error'));
  };

  const handleSignup = (e) => {
    e.preventDefault();
    fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: email.trim(), phone: phone.trim(), password, pin })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error || 'Signup failed'); });
      })
      .then(data => {
        setDevOtp(data.devOtp || null);
        setAuthMode('verify-otp');
        showToast('Verification Code Sent', 'Check your email inbox for 4-digit code.', 'success');
      })
      .catch(err => showToast('Signup Failed', err.message, 'error'));
  };

  const handleVerifyOtp = (e) => {
    e.preventDefault();
    const codeStr = otpCode.join('');
    fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), code: codeStr })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error || 'Verification failed'); });
      })
      .then(data => {
        onLoginSuccess(data.user, data.token);
        showToast('Account Created', 'Registration & verification successful!', 'success');
        onClose();
      })
      .catch(err => showToast('Verification Error', err.message, 'error'));
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail.trim() })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error); });
      })
      .then(data => {
        setDevOtp(data.devOtp || null);
        setAuthMode('reset-password');
        showToast('Reset Sent', 'Password reset OTP dispatched to email.', 'success');
      })
      .catch(err => showToast('Error', err.message, 'error'));
  };

  const handleResetPassword = (e) => {
    e.preventDefault();
    const codeStr = resetCode.join('');
    fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail.trim(), code: codeStr, newPassword })
    })
      .then(res => {
        if (res.ok) return res.json();
        return res.json().then(d => { throw new Error(d.error); });
      })
      .then(() => {
        setAuthMode('login');
        showToast('Password Updated', 'Login using your new password.', 'success');
      })
      .catch(err => showToast('Reset Failed', err.message, 'error'));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button 
          onClick={onClose} 
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
        >
          ✕
        </button>

        {authMode === 'login' && (
          <div>
            <h2 style={{ marginBottom: '8px', fontSize: '24px' }}>Welcome Back</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>Sign in to access your Silent SOS safety control center.</p>

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  placeholder="name@leadcitysos.com" 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  placeholder="••••••••" 
                  required 
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>Sign In</button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span>Don't have an account? </span>
              <button onClick={() => setAuthMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontWeight: '600', cursor: 'pointer' }}>Create Account</button>
              <br />
              <button onClick={() => setAuthMode('forgot-password')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', marginTop: '10px', cursor: 'pointer' }}>Forgot Password?</button>
            </div>
          </div>
        )}

        {authMode === 'signup' && (
          <div>
            <h2 style={{ marginBottom: '8px', fontSize: '24px' }}>Create Account</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>Register to dispatch emergency alerts to your responders.</p>

            <form onSubmit={handleSignup}>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" required />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" required />
              </div>

              <div className="form-group">
                <label>Phone Number</label>
                <input type="tel" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000" required />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create password" required />
              </div>

              <div className="form-group">
                <label>4-Digit Security PIN (Disarm Code)</label>
                <input type="text" maxLength="4" className="form-input" value={pin} onChange={e => setPin(e.target.value)} placeholder="1234" required />
              </div>

              <button type="submit" className="btn-primary">Continue to Verification</button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span>Already registered? </span>
              <button onClick={() => setAuthMode('login')} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontWeight: '600', cursor: 'pointer' }}>Sign In</button>
            </div>
          </div>
        )}

        {authMode === 'verify-otp' && (
          <div>
            <h2 style={{ marginBottom: '8px', fontSize: '24px' }}>Enter Verification Code</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>We sent a 4-digit security OTP code to <strong style={{ color: 'var(--accent-cyan)' }}>{email}</strong>.</p>

            {devOtp && (
              <div style={{ background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--accent-cyan)', padding: '12px', borderRadius: '8px', margin: '16px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>DEV OTP DISPLAY</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '6px', color: 'var(--text-primary)' }}>{devOtp}</div>
              </div>
            )}

            <form onSubmit={handleVerifyOtp}>
              <div className="otp-input-container">
                {[0, 1, 2, 3].map(idx => (
                  <input
                    key={idx}
                    type="text"
                    maxLength="1"
                    className="otp-digit-box"
                    value={otpCode[idx]}
                    onChange={e => {
                      const val = e.target.value;
                      const next = [...otpCode];
                      next[idx] = val;
                      setOtpCode(next);
                      if (val && e.target.nextElementSibling) {
                        e.target.nextElementSibling.focus();
                      }
                    }}
                  />
                ))}
              </div>

              <button type="submit" className="btn-primary">Verify & Create Account</button>
            </form>
          </div>
        )}

        {authMode === 'forgot-password' && (
          <div>
            <h2 style={{ marginBottom: '8px', fontSize: '24px' }}>Reset Password</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>Enter your registered email address to receive a password reset code.</p>

            <form onSubmit={handleForgotPassword}>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" className="form-input" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="name@example.com" required />
              </div>

              <button type="submit" className="btn-primary">Send Reset Code</button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button onClick={() => setAuthMode('login')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' }}>← Back to Sign In</button>
            </div>
          </div>
        )}

        {authMode === 'reset-password' && (
          <div>
            <h2 style={{ marginBottom: '8px', fontSize: '24px' }}>New Password</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Enter the OTP code sent to your email along with your new password.</p>

            <form onSubmit={handleResetPassword}>
              <div className="otp-input-container">
                {[0, 1, 2, 3].map(idx => (
                  <input
                    key={idx}
                    type="text"
                    maxLength="1"
                    className="otp-digit-box"
                    value={resetCode[idx]}
                    onChange={e => {
                      const val = e.target.value;
                      const next = [...resetCode];
                      next[idx] = val;
                      setResetCode(next);
                      if (val && e.target.nextElementSibling) {
                        e.target.nextElementSibling.focus();
                      }
                    }}
                  />
                ))}
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" required />
              </div>

              <button type="submit" className="btn-primary">Update Password</button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
