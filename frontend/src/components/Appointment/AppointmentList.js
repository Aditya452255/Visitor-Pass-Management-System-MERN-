// AppointmentList.js (fixed - use Link instead of <a href>)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { appointmentAPI } from '../../services/api';
import { useAuthContext } from '../../hooks/useAuthContext';
import Loader from '../Shared/Loader';
import { format } from 'date-fns';
import './Appointment.css';

const AppointmentList = () => {
  const { user, authIsReady } = useAuthContext();
  // fallback to localStorage in case context isn't hydrated yet
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || null;
    } catch (e) {
      return null;
    }
  })();
  const effectiveUser = user || storedUser;
  const effectiveRole = effectiveUser?.role;
  const effectiveUserId = effectiveUser?._id || effectiveUser?.id;

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchAppointments = async (page = currentPage, status = filter) => {
    if (!effectiveRole) {
        setLoading(false);
        return;
    }
    try {
      setLoading(true);
      // If logged-in visitor, fetch their own appointments
      if (effectiveRole === 'visitor') {
        const res = await appointmentAPI.getMy();
        let list = res?.appointments || res?.data || res || [];
        if (!Array.isArray(list)) list = [];
        
        setAppointments(list);
        setTotalPages(1);

      } else { // For admin/employee
        const params = { page, limit: 10 };
        if (effectiveRole === 'employee' && effectiveUserId) {
          params.hostId = effectiveUserId;
        }
        if (status && status !== 'all') {
          params.status = status;
        }
        const dataAll = await appointmentAPI.getAll(params);
        let list = dataAll?.appointments || dataAll?.data || dataAll || [];
        if (!Array.isArray(list)) list = [];

        // Ensure employees only see their own appointments even if server returns more
        if (effectiveRole === 'employee' && effectiveUserId) {
          list = list.filter((a) => {
            const hostId = a.host?._id || a.host?.id || a.host;
            return hostId && hostId.toString() === effectiveUserId.toString();
          });
        }
        const pages = dataAll?.totalPages ?? dataAll?.total_pages ?? 1;

        setAppointments(Array.isArray(list) ? list : []);
        setTotalPages(Number.isFinite(pages) ? pages : 1);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      setAppointments([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authIsReady) {
        fetchAppointments(currentPage, filter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, currentPage, authIsReady]);

  // For visitors, poll for updates so approved/rejected statuses appear without a hard refresh
  useEffect(() => {
    let timer;
    if (effectiveRole === 'visitor') {
      timer = setInterval(() => {
        fetchAppointments();
      }, 8000); // every 8 seconds
    }
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRole, filter]);

  const handleApprove = async (id) => {
    // Double-check stored token/role before sending admin action
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem('user')) || null; } catch (e) { return null; }
    })();
    if (!stored || (stored.role !== 'admin' && stored.role !== 'employee')) {
      alert('Action blocked: current session token is not authorized to approve. Please login as admin/employee.');
      return;
    }

    try {
      const res = await appointmentAPI.approve(id);
      // Optimistic update: reflect change immediately in the list
      setAppointments(prev => prev.map(a => (a._id === id || a.id === id) ? { ...a, status: res.status || 'approved', approvedBy: res.approvedBy || a.approvedBy } : a));
      alert('Appointment approved successfully!');
      // fetch fresh from server as well
      fetchAppointments(currentPage, filter);
    } catch (error) {
      console.error('Error approving appointment:', error);
      alert(error?.message || 'Failed to approve appointment');
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (reason) {
      const stored = (() => {
        try { return JSON.parse(localStorage.getItem('user')) || null; } catch (e) { return null; }
      })();
      if (!stored || (stored.role !== 'admin' && stored.role !== 'employee')) {
        alert('Action blocked: current session token is not authorized to reject. Please login as admin/employee.');
        return;
      }

      try {
        const res = await appointmentAPI.reject(id, reason);
        setAppointments(prev => prev.map(a => (a._id === id || a.id === id) ? { ...a, status: res.status || 'rejected', rejectionReason: res.rejectionReason || reason } : a));
        alert('Appointment rejected successfully!');
        fetchAppointments(currentPage, filter);
      } catch (error) {
        console.error('Error rejecting appointment:', error);
        alert(error?.message || 'Failed to reject appointment');
      }
    }
  };

  const handleCancel = async (id) => {
    if (window.confirm('Are you sure you want to cancel this appointment?')) {
      const stored = (() => {
        try { return JSON.parse(localStorage.getItem('user')) || null; } catch (e) { return null; }
      })();
      if (!stored || (stored.role !== 'admin' && stored.role !== 'employee')) {
        alert('Action blocked: current session token is not authorized to cancel. Please login as admin/employee.');
        return;
      }

      try {
        const res = await appointmentAPI.cancel(id);
        setAppointments(prev => prev.map(a => (a._id === id || a.id === id) ? { ...a, status: res.status || 'cancelled' } : a));
        alert('Appointment cancelled successfully!');
        fetchAppointments(currentPage, filter);
      } catch (error) {
        console.error('Error cancelling appointment:', error);
        alert(error?.message || 'Failed to cancel appointment');
      }
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'badge-orange',
      approved: 'badge-green',
      rejected: 'badge-red',
      completed: 'badge-blue',
      cancelled: 'badge-red'
    };
    return badges[status] || 'badge-blue';
  };

  const filteredAppointments = (filter && filter !== 'all')
    ? appointments.filter(a => a.status === filter)
    : appointments;

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="appointment-list-container">
      <div className="list-header">
        <h2>Appointments</h2>
        {(effectiveRole === 'admin' || effectiveRole === 'employee' || effectiveRole === 'visitor') && (
          // Use Link to avoid full page reload (SPA navigation)
          <Link to="/appointments/create" className="btn-primary">
            📅 Create Appointment
          </Link>
        )}
      </div>

      <div className="filter-bar">
        <button
          className={filter === 'all' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => { setFilter('all'); setCurrentPage(1); }}
        >
          All
        </button>
        <button
          className={filter === 'pending' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => { setFilter('pending'); setCurrentPage(1); }}
        >
          Pending
        </button>
        <button
          className={filter === 'approved' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => { setFilter('approved'); setCurrentPage(1); }}
        >
          Approved
        </button>
        <button
          className={filter === 'rejected' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => { setFilter('rejected'); setCurrentPage(1); }}
        >
          Rejected
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Visitor</th>
              <th>Host</th>
              <th>Date & Time</th>
              <th>Purpose</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAppointments.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>No appointments found</td>
              </tr>
            ) : (
              filteredAppointments.map((appointment) => {
                const dateText = appointment?.appointmentDate
                  ? (() => {
                      const d = new Date(appointment.appointmentDate);
                      return Number.isNaN(d.getTime()) ? (appointment.appointmentDate || 'N/A') : format(d, 'MMM dd, yyyy');
                    })()
                  : 'N/A';

                const timeText = appointment?.appointmentTime || (appointment?.appointmentDate ? new Date(appointment.appointmentDate).toLocaleTimeString() : 'N/A');

                return (
                  <tr key={appointment._id || appointment.id}>
                    <td>
                      <div>
                        <strong>{appointment.visitor?.name || 'N/A'}</strong>
                        <br />
                        <small>{appointment.visitor?.email || ''}</small>
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{appointment.host?.name || 'N/A'}</strong>
                        <br />
                        <small>{appointment.host?.department || ''}</small>
                      </div>
                    </td>
                    <td>
                      {dateText}
                      <br />
                      {timeText}
                    </td>
                    <td>{appointment.purpose || 'N/A'}</td>
                    <td>{appointment.location || 'N/A'}</td>
                    <td>
                      <span className={`badge ${getStatusBadge(appointment.status)}`}>
                        {appointment.status || 'unknown'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        {/* Use Link for view to avoid reload */}
                        <Link to={`/appointments/${appointment._id || appointment.id}`} className="btn-icon" title="View">
                          👁️
                        </Link>
                        {appointment.status === 'pending' && (
                          effectiveRole === 'admin' ||
                          (effectiveRole === 'employee' && effectiveUserId && ((appointment.host?._id || appointment.host?.id || appointment.host)?.toString() === effectiveUserId.toString()))
                        ) && (
                          <>
                            <button
                              onClick={() => handleApprove(appointment._id || appointment.id)}
                              className="btn-icon"
                              title="Approve"
                            >
                              ✅
                            </button>
                            <button
                              onClick={() => handleReject(appointment._id || appointment.id)}
                              className="btn-icon"
                              title="Reject"
                            >
                              ❌
                            </button>
                          </>
                        )}
                        {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                          <button
                            onClick={() => handleCancel(appointment._id || appointment.id)}
                            className="btn-icon btn-delete"
                            title="Cancel"
                          >
                            🚫
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="btn-secondary"
          >
            Previous
          </button>
          <span className="page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="btn-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AppointmentList;
