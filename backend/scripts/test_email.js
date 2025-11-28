const nodemailer = require('nodemailer');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const testEmail = async () => {
    console.log('--- RUNNING EMAIL TEST SCRIPT ---');
    console.log(`Using email user: ${process.env.EMAIL_USER}`);

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('EMAIL_USER or EMAIL_PASS is not defined in .env file.');
        return;
    }

    const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        // Add more verbose logging from nodemailer
        logger: true,
        debug: true 
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: 'test.recipient@example.com', // A safe test recipient
        subject: 'Nodemailer Test',
        text: 'This is a test email from the visitor management system.',
    };

    try {
        console.log('Attempting to send email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('--- EMAIL TEST SUCCESS ---');
        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error('--- EMAIL TEST FAILED ---');
        console.error(error);
    }
};

testEmail();
