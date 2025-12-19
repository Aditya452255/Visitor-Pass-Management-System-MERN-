import React, { useEffect, useState } from 'react';
import { authAPI } from '../services/api';
import { useAuthContext } from '../hooks/useAuthContext';
import Loader from '../components/Shared/Loader';

const ProfileVisitor = () => {
  const { user, login } = useAuthContext();
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isVisitor = (user?.role || '').toLowerCase() === 'visitor';

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await authAPI.getProfile();
        if (!mounted) return;
        setForm({
          name: data?.name || '',
          email: data?.email || '',
          phone: data?.phone || '',
          role: (data?.role || '').toLowerCase()
        });
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load profile');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!form.name.trim()) return 'Name is required';
    if (!form.email.trim()) return 'Email is required';
    if (!/.+@.+\..+/.test(form.email)) return 'Enter a valid email address';
    if (!form.phone.trim()) return 'Phone is required';
    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const v = validate();
    if (v) { setError(v); return; }
    try {
      setSaving(true);
      const payload = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() };
      const updated = await authAPI.updateProfile(payload);
      if (updated?.error) throw new Error(updated.error);
      setSuccess('Profile updated successfully');
      // Update auth context/localStorage to keep UI consistent
      try {
        const storedRaw = localStorage.getItem('user');
        const stored = storedRaw ? JSON.parse(storedRaw) : {};
        const merged = { ...stored, name: updated.name, email: updated.email };
        login(merged);
      } catch (_) { /* ignore */ }
    } catch (e) {
      setError(e?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (!isVisitor) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Profile</h2>
        <p>This section is available only for visitor accounts.</p>
      </div>
    );
  }

  if (loading) return <Loader />;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <h2>My Profile</h2>
      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ color: 'green', marginBottom: 12 }}>{success}</div>}
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" value={form.name} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={form.email} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="text" value={form.phone} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="role">Role</label>
          <input id="role" name="role" type="text" value={form.role} readOnly />
        </div>
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Updating…' : 'Update Profile'}
        </button>
      </form>
    </div>
  );
};

export default ProfileVisitor;
