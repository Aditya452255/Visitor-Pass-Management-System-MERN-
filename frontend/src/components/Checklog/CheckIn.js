// CheckIn.js (fixed)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkLogsAPI, passesAPI } from '../../services/api';
import './CheckLog.css';

const CheckIn = () => {
  const navigate = useNavigate();
  const [passNumber, setPassNumber] = useState('');
  const [pass, setPass] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [formData, setFormData] = useState({
    temperature: '',
    deviceInfo: { laptop: false, mobile: false, other: '' },
    notes: '',
    location: 'Main Entrance'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleVerifyPass = async () => {
    const trimmed = (passNumber || '').trim();
    if (!trimmed) {
      setError('Please enter a pass number');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const result = await passesAPI.verify(trimmed);

      // tolerate different response shapes
      const isValid = result?.valid || result?.success || (result?.status === 'valid');
      const receivedPass = result?.pass || result?.data || result;

      if (isValid) {
        setPass(receivedPass || null);
        setError(null);
      } else {
        const errMsg = result?.error || result?.message || 'Pass is not valid';
        setError(errMsg);
        setPass(null);
      }
    } catch (err) {
      console.error('verify error', err);
      setError(err?.message || 'Failed to verify pass');
      setPass(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.startsWith('deviceInfo.')) {
      const deviceKey = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        deviceInfo: { ...prev.deviceInfo, [deviceKey]: type === 'checkbox' ? checked : value }
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!pass || !pass._id) throw new Error('No valid pass selected');

      const checkInData = {
        passId: pass._id,
        visitorId: pass?.visitor?._id || pass?.visitor?.id,
        temperature: formData.temperature ? parseFloat(formData.temperature) : undefined,
        deviceInfo: formData.deviceInfo,
        notes: formData.notes,
        location: formData.location
      };

      const res = await checkLogsAPI.checkIn(checkInData);

      // check for error in response
      if (res?.error || res?.success === false) {
        throw res;
      }

      alert('Visitor checked in successfully!');
      navigate('/checklogs');
    } catch (err) {
      console.error('Check in error:', err);
      const message = err?.message || err?.error || err?.msg || 'Failed to check in visitor';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='checkin-container'>
      <h2>Visitor Check-In</h2>

      <div className="verify-row">
        <input
          type='text'
          value={passNumber}
          onChange={(e) => setPassNumber(e.target.value)}
          placeholder='Enter Pass Number'
        />
        <button onClick={handleVerifyPass} disabled={verifying}>
          {verifying ? 'Verifying...' : 'Verify Pass'}
        </button>
      </div>

      {error && <div className='error' role="alert">{error}</div>}

      {pass && (
        <form onSubmit={handleSubmit}>
          <div>
            <strong>Visitor:</strong> {pass?.visitor?.name || 'N/A'}
          </div>
          <div>
            <strong>Valid Until:</strong> {pass?.validUntil ? new Date(pass.validUntil).toLocaleString() : 'N/A'}
          </div>

          <div className="form-row">
            <input
              type='number'
              name='temperature'
              value={formData.temperature}
              onChange={handleChange}
              placeholder='Temperature (°C)'
              step="0.1"
            />
          </div>

          <div className="device-row">
            <label>
              <input
                type='checkbox'
                name='deviceInfo.laptop'
                checked={!!formData.deviceInfo.laptop}
                onChange={handleChange}
              />
              Laptop
            </label>
            <label>
              <input
                type='checkbox'
                name='deviceInfo.mobile'
                checked={!!formData.deviceInfo.mobile}
                onChange={handleChange}
              />
              Mobile
            </label>
            <input
              type='text'
              name='deviceInfo.other'
              value={formData.deviceInfo.other}
              onChange={handleChange}
              placeholder='Other devices'
            />
          </div>

          <div>
            <textarea
              name='notes'
              value={formData.notes}
              onChange={handleChange}
              placeholder='Notes'
            />
          </div>

          <div>
            <input
              type='text'
              name='location'
              value={formData.location}
              onChange={handleChange}
              placeholder='Location'
            />
          </div>

          <div className="form-actions">
            <button type='submit' disabled={loading}>
              {loading ? 'Checking in...' : 'Check In Visitor'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default CheckIn;
