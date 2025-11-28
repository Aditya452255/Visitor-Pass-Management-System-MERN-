// Test flow script: automated visitor -> appointment -> approve
// Debug-friendly: prints response status and content-type on failures

(async () => {
  const API = 'http://localhost:5000/api';
  const adminCred = { email: 'admin@example.com', password: 'Admin@123456' };
  const employeeCred = { email: 'employee@example.com', password: 'Employee@123456' };

  try {
    console.log('Logging in as admin...');
    let res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminCred)
    });

    const contentType = res.headers.get('content-type') || '';
    const bodyText = await res.text();
    let admin;
    try {
      admin = JSON.parse(bodyText);
    } catch (e) {
      console.error('Admin login: unexpected response content-type:', contentType);
      console.error('Admin login response body (first 1000 chars):', bodyText.slice(0, 1000));
      throw new Error('Admin login returned non-JSON response');
    }
    if (!res.ok) throw new Error('Admin login failed: ' + JSON.stringify(admin));
    const adminToken = admin.token;
    console.log('Admin token length:', adminToken.length);

    console.log('Fetching visitors...');
    res = await fetch(`${API}/visitors`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const visitorsText = await res.text();
    let visitorsData;
    try { visitorsData = JSON.parse(visitorsText); } catch(e) { throw new Error('Visitors endpoint returned non-JSON: ' + visitorsText.slice(0,500)); }
    const visitors = visitorsData?.visitors || visitorsData || [];
    if (!visitors.length) throw new Error('No visitors available to test');
    const visitor = visitors[0];
    console.log('Using visitor:', visitor.name, visitor._id);

    console.log('Fetching hosts (public)...');
    res = await fetch(`${API}/auth/hosts`);
    const hostsText = await res.text();
    let hostsData;
    try { hostsData = JSON.parse(hostsText); } catch(e) { throw new Error('Hosts endpoint returned non-JSON: ' + hostsText.slice(0,500)); }
    const hosts = hostsData?.users || hostsData || [];
    if (!hosts.length) throw new Error('No hosts available to test');
    const host = hosts[0];
    console.log('Using host:', host.name, host._id || host.id || host.email);

    // Create appointment as public (visitor)
    const appointmentPayload = {
      visitorId: visitor._id || visitor.id,
      hostId: host._id || host.id,
      appointmentDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      appointmentTime: new Date(Date.now() + 24 * 3600 * 1000).toTimeString().slice(0,5),
      duration: 60,
      purpose: 'Test Meeting',
      location: 'Conference Room A',
      notes: 'Automated test'
    };

    console.log('Creating public appointment...');
    res = await fetch(`${API}/appointments/public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appointmentPayload)
    });
    const createText = await res.text();
    let createResult;
    try { createResult = JSON.parse(createText); } catch(e) { throw new Error('Create appointment returned non-JSON: ' + createText.slice(0,500)); }
    if (!res.ok) throw new Error('Create appointment failed: ' + JSON.stringify(createResult));
    const appointment = createResult?.appointment || createResult;
    console.log('Appointment created:', appointment._id || appointment.id || appointment.passNumber);

    // Login as employee to approve
    console.log('Logging in as employee...');
    res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employeeCred)
    });
    const empText = await res.text();
    let employee;
    try { employee = JSON.parse(empText); } catch (e) { throw new Error('Employee login returned non-JSON: ' + empText.slice(0,500)); }
    if (!res.ok) throw new Error('Employee login failed: ' + JSON.stringify(employee));
    const empToken = employee.token;
    console.log('Employee token length:', empToken.length);

    // Approve appointment
    const appId = appointment._id || appointment.id || appointment._id;
    console.log('Approving appointment id:', appId);
    res = await fetch(`${API}/appointments/${appId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' }
    });
    const approveText = await res.text();
    let approveResult;
    try { approveResult = JSON.parse(approveText); } catch(e) { throw new Error('Approve endpoint returned non-JSON: ' + approveText.slice(0,500)); }
    if (!res.ok) throw new Error('Approve failed: ' + JSON.stringify(approveResult));
    console.log('Appointment approved:', approveResult.status || approveResult);

    console.log('Test flow completed successfully');
  } catch (err) {
    console.error('Test flow error:', err);
    process.exit(1);
  }
})();
