// src/components/appointments/AppointmentCreate.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appointmentAPI, visitorAPI, usersAPI } from '../../services/api'; // <- keep path consistent with other files
import { useAuthContext } from '../../hooks/useAuthContext';
import './Appointment.css';

const AppointmentCreate = () => {
  const navigate = useNavigate();
  const [visitors, setVisitors] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [formData, setFormData] = useState({
    visitorId: '',
    hostId: '',
    appointmentDate: '',
    appointmentTime: '',
    duration: 60,
    purpose: '',
    location: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuthContext();

  // Fetch visitors and hosts
  const fetchVisitorsAndHosts = async () => {
    try {
      const [visitorsData, usersData] = await Promise.all([
        visitorAPI.getAll({ limit: 100 }).catch(() => ({ visitors: [] })),
        usersAPI.getHosts().catch(() => ({ users: [] }))
      ]);

      const visitorsList = visitorsData?.visitors ?? visitorsData ?? [];
      setVisitors(Array.isArray(visitorsList) ? visitorsList : []);

      const usersList = usersData?.users ?? usersData ?? [];
      setHosts(Array.isArray(usersList) ? usersList : []);
    } catch (err) {
      console.error('Error fetching visitors/hosts:', err);
      setVisitors([]);
      setHosts([]);
    }
  };

  useEffect(() => {
    fetchVisitorsAndHosts();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = { ...formData };

      // If logged-in visitor, ensure payload doesn't include a different visitorId
      if (user && user.role === 'visitor') {
        // set visitorId to logged-in user id for clarity (backend will also use token)
        payload.visitorId = user._id || user.id || payload.visitorId;
      }

      // If both date and time given, convert to ISO datetime for backend acceptance
      if (formData.appointmentDate && formData.appointmentTime) {
        const iso = new Date(`${formData.appointmentDate}T${formData.appointmentTime}`);
        if (!Number.isNaN(iso.getTime())) {
          payload.appointmentDate = iso.toISOString();
        } else {
          throw new Error('Invalid date/time');
        }
      }

      // Ensure numeric duration
      if (payload.duration) payload.duration = Number(payload.duration);

      const res = await appointmentAPI.create(payload);

      // handle different response shapes (error object vs api success flag)
      if (res?.error || res?.success === false) {
        throw res;
      }

      alert('Appointment created successfully!');
      navigate('/appointments');
    } catch (err) {
      console.error('Create appointment error:', err);
      // pick a sensible message from different shapes
      const message =
        err?.response?.data?.error ||
        err?.error ||
        err?.message ||
        (typeof err === 'string' ? err : 'Failed to create appointment');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="appointment-create-container">
      <div className="form-card">
        <h2>Create Appointment</h2>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
              {user?.role !== 'visitor' && (
                <div className="form-group">
                  <label>Visitor</label>
                  <select
                    name="visitorId"
                    value={formData.visitorId}
                    onChange={handleChange}
                  >
                    <option value="">Guest / Unregistered</option>
                    {visitors.map(visitor => (
                      <option key={visitor._id || visitor.id} value={visitor._id || visitor.id}>
                        {visitor.name} - {visitor.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            <div className="form-group">
              <label>Host *</label>
              <select
                name="hostId"
                value={formData.hostId}
                onChange={handleChange}
                required
              >
                <option value="">Select Host</option>
                {hosts.map(host => (
                  <option key={host._id || host.id} value={host._id || host.id}>
                    {host.name} - {host.department}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Appointment Date *</label>
              <input
                type="date"
                name="appointmentDate"
                value={formData.appointmentDate}
                onChange={handleChange}
                min={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            <div className="form-group">
              <label>Appointment Time *</label>
              <input
                type="time"
                name="appointmentTime"
                value={formData.appointmentTime}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Duration (minutes) *</label>
              <input
                type="number"
                name="duration"
                value={formData.duration}
                onChange={handleChange}
                min="15"
                step="15"
                required
              />
            </div>

            <div className="form-group">
              <label>Location *</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="e.g. Conference Room A, Building 2"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Purpose *</label>
            <input
              type="text"
              name="purpose"
              value={formData.purpose}
              onChange={handleChange}
              placeholder="e.g. Business Meeting, Interview"
              required
            />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="4"
              placeholder="Any additional information."
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/appointments')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Creating...' : 'Create Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppointmentCreate;
