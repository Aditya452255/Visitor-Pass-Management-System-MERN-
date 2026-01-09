# Visitor Pass Management System

A comprehensive full-stack web application for managing visitor passes, appointments, and check-in/check-out processes for organizations.

## Deploy 
- [Deploy](https://visitor-pass-management-system-mern.vercel.app/)

## 🏗️ Architecture

**MERN Stack Application:**
- **M**ongoDB - Database
- **E**xpress.js - Backend Framework
- **R**eact.js - Frontend Framework
- **N**ode.js - Runtime Environment

```
Frontend (React)  ←→  Backend (Express/Node)  ←→  Database (MongoDB)
```

## ✨ Features

### For Admin
- **User Management**: Create and manage Employee and Security staff accounts
- Issue visitor passes with QR codes
- Manage appointments (approve/reject/cancel)
- View all visitors and check-in/out logs
- Blacklist/unblacklist visitors
- Generate and download pass PDFs
- Dashboard with statistics and analytics

### For Employees
- **Edit Profile**: Update name, email, phone, and department
- Create visitor appointments (see all employees as hosts)
- View and manage their appointments
- Track visitor check-ins related to their appointments

### For Visitors
- Register and create appointment requests (visitors only during signup)
- **Edit Profile**: Update personal information
- View appointment status
- View their passes with QR codes
- Cancel their own appointments
- Track their visit history

### System Features
- QR code-based check-in/check-out
- Automatic checkout after configurable duration
- Email and SMS notifications (optional)
- Role-based access control (Admin, Employee, Security, Visitor)
- Photo upload for appointments
- Export data to CSV/Excel
- Dynamic employee/host selection (all employees available after creation)

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- npm or yarn

### Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file (use `.env.example` as template):
```env
MONGO_URI=mongodb://localhost:27017/visitor-pass-db
JWT_SECRET=your-secret-key
PORT=5000
FRONTEND_URL=http://localhost:3000
```

Start the backend:
```bash
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install --legacy-peer-deps
```

Create a `.env` file (use `.env.example` as template):
```env
REACT_APP_API_URL=http://localhost:5000/api
```

Start the frontend:
```bash
npm start
```

The application will open at `http://localhost:3000`

## 📦 Tech Stack

### Backend
- Express.js - Web framework
- Mongoose - MongoDB ODM
- JWT - Authentication
- Bcrypt - Password hashing
- Multer - File uploads
- QRCode - QR code generation
- PDFKit - PDF generation
- Nodemailer - Email service
- Twilio - SMS service (optional)

### Frontend
- React.js - UI framework
- React Router - Navigation
- Axios - HTTP client
- html5-qrcode - QR scanning
- react-toastify - Notifications
- Recharts - Charts/analytics
- date-fns - Date formatting

## 🌐 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on deploying to Render.

### Quick Deploy to Render

1. **Backend**: Deploy as Web Service
   - Build: `npm install`
   - Start: `npm start`
   - Add environment variables

2. **Frontend**: Deploy as Static Site
   - Build: `npm install && npm run build`
   - Publish: `build`
   - Add `REACT_APP_API_URL` environment variable

## 📁 Project Structure

```
├── backend/
│   ├── config/          # Database configuration
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Auth & validation
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   ├── scripts/         # Utility scripts (seedData, createAdmin, deleteAppointment, etc.)
│   ├── uploads/         # File uploads
│   └── utils/           # Helper functions (emailService, pdfGenerator, etc.)
│
├── frontend/
│   ├── public/          # Static files
│   └── src/
│       ├── components/  # React components
│       │   ├── Appointment/
│       │   ├── Auth/
│       │   ├── Checklog/
│       │   ├── Pass/
│       │   ├── Shared/
│       │   ├── User/        # New: User Management component
│       │   └── Visitor/
│       ├── context/     # Context providers
│       ├── hooks/       # Custom hooks
│       ├── pages/       # Page components
│       ├── services/    # API services
│       └── utils/       # Utilities
│
├── DEPLOYMENT.md        # Deployment guide
└── README.md           # This file
```

## 🔒 Security Features

- JWT-based authentication
- Role-based authorization
- Password hashing with bcrypt
- CORS configuration
- Input validation
- Secure file uploads

## 📊 API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new visitor (visitors only)
- `POST /api/auth/login` - Login user
- `POST /api/auth/create-user` - Create Employee/Security user (Admin only)
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/profile` - Update profile (Visitor, Employee)
- `GET /api/auth/users` - Get all users (Admin only)
- `PUT /api/auth/users/:id/role` - Update user role/status (Admin only)
- `DELETE /api/auth/users/:id` - Delete user (Admin only)

### Visitors
- `GET /api/visitors` - Get all visitors (Admin)
- `POST /api/visitors` - Register visitor
- `PATCH /api/visitors/:id` - Update visitor (Admin, Security)
- `DELETE /api/visitors/:id` - Delete visitor (Admin only)
- `PATCH /api/visitors/:id/blacklist` - Toggle blacklist status (Admin only)

### Appointments
- `GET /api/appointments` - Get appointments
- `POST /api/appointments` - Create appointment
- `PATCH /api/appointments/:id` - Update appointment
- `PATCH /api/appointments/:id/approve` - Approve appointment (Admin, Employee)
- `PATCH /api/appointments/:id/reject` - Reject appointment (Admin, Employee)
- `PATCH /api/appointments/:id/cancel` - Cancel appointment
- `DELETE /api/appointments/:id` - Delete appointment
- `GET /api/appointments/stats` - Get appointment statistics

### Passes
- `GET /api/passes` - Get passes
- `POST /api/passes` - Issue pass (Admin, Security)
- `GET /api/passes/:id` - Get single pass
- `GET /api/passes/:id/pdf` - Download pass PDF
- `PATCH /api/passes/:id/revoke` - Revoke pass (Admin only)

### Check Logs
- `GET /api/checklogs` - Get check-in/out logs
- `POST /api/checklogs/checkin` - Check in visitor (Admin, Security)
- `POST /api/checklogs/checkout` - Check out visitor
- `GET /api/checklogs/visitor/:visitorId` - Get visitor check history
- # Create Employee/Security User (via Admin Panel)
1. Login as Admin
2. Navigate to `/users` (Users section in navbar)
3. Click "+ Create User"
4. Select role (Employee or Security)
5. Fill in details and submit

### Edit Employee Profile
1. Login as Employee
2. Click "Profile" in navbar
3. Click "Edit Profile"
4. Update information and save

### Delete Appointment by Purpose
```bash
cd backend
node scripts/deleteAppointment.js
```

## 📝 Recent Updates (Jan 2026)

- ✅ **Public Signup**: Visitors only - removed Employee/Security role selection
- ✅ **Admin User Management**: Create and manage Employee/Security staff
- ✅ **Dynamic Host Selection**: Appointment and Pass forms now show all employees
- ✅ **Employee Profile**: Employees can now edit their profile information
- ✅ **Improved Access Control**: Role-based access to all features

##`GET /api/checklogs/stats` - Get check log statistics
- `GET /api/checklogs/current` - Get current check status

## 🛠️ Development

### Create Admin User
```bash
cd backend
node scripts/createAdmin.js
```

### Seed Sample Data
```bash
cd backend
node scripts/seedData.js
```

## 📝 License

This project is licensed under the ISC License.

## 👨‍💻 Author

Aditya Jain

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
npm install date-fns