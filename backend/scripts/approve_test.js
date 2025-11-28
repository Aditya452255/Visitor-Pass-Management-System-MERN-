const axios = require('axios');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_BASE_URL = 'http://localhost:5000/api';

const loginUser = async (email, password) => {
    try {
        console.log(`[TestScript] Logging in as ${email}...`);
        const response = await axios.post(`${API_BASE_URL}/auth/login`, { email, password });
        console.log('[TestScript] Login successful.');
        return response.data.token;
    } catch (error) {
        console.error('[TestScript] Error logging in:');
        try {
            console.error('error.message:', error.message);
            console.error('error.code:', error.code);
            console.error('error.stack:', error.stack);
            if (error.response) {
                console.error('error.response.status:', error.response.status);
                console.error('error.response.data:', JSON.stringify(error.response.data, null, 2));
            }
        } catch (e) {
            console.error('Failed to serialize axios error:', e);
            console.error(error);
        }
        throw new Error('Login failed');
    }
};

const approveAppointment = async (token, appointmentId) => {
    try {
        console.log(`[TestScript] Approving appointment ID: ${appointmentId}...`);
        const response = await axios.patch(
            `${API_BASE_URL}/appointments/${appointmentId}/approve`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log('[TestScript] Approval request sent successfully.');
        return response.data;
    } catch (error) {
        console.error('[TestScript] Error approving appointment:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw new Error('Approval failed');
    }
};

const runTest = async () => {
    try {
        // --- CONFIGURATION ---
        const employeeEmail = 'employee@example.com';
        const employeePassword = 'Employee@123456';
        // Allow overriding the appointment via env var for flexible testing
        const appointmentToApprove = process.env.APPOINTMENT_ID || '69275edc750d5704a30ffbd7'; 

        console.log('--- RUNNING APPROVAL TEST SCRIPT ---');
        
        console.log('[TestScript] Waiting 10 seconds for server to start...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // 1. Log in as the employee to get a token
        const token = await loginUser(employeeEmail, employeePassword);

        // 2. Approve the appointment
        const result = await approveAppointment(token, appointmentToApprove);
        
        console.log('--- TEST SCRIPT FINISHED ---');
        console.log('API Response:');
        console.log(result);

    } catch (error) {
        console.error('--- TEST SCRIPT FAILED ---');
        console.error(error.message);
        process.exit(1); // Exit with error code
    }
};

runTest();
