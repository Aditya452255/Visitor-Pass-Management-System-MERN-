# Visitor Pass Management System

A comprehensive full-stack web application for managing visitor passes, appointments, and check-in/check-out processes for organizations.

## 📹 Demo Videos
- [Full Demo](https://www.loom.com/share/363a1035a04647199f06bbc81bc69df6)

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
- Issue visitor passes with QR codes
- Manage appointments (approve/reject/cancel)
- View all visitors and check-in/out logs
- Blacklist/unblacklist visitors
- Generate and download pass PDFs
- Dashboard with statistics and analytics

### For Employees
- Create visitor appointments
- View and manage their appointments
- Track visitor check-ins related to their appointments

### For Visitors
- Register and create appointment requests
- View appointment status
- View their passes with QR codes
- Cancel their own appointments
- Track their visit history

### System Features
- QR code-based check-in/check-out
- Automatic checkout after configurable duration
- Email and SMS notifications (optional)
- Role-based access control (Admin, Employee, Visitor, Security)
- Photo upload for appointments
- Export data to CSV/Excel

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
│   ├── scripts/         # Utility scripts
│   ├── uploads/         # File uploads
│   └── utils/           # Helper functions
│
├── frontend/
│   ├── public/          # Static files
│   └── src/
│       ├── components/  # React components
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
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user

### Visitors
- `GET /api/visitors` - Get all visitors (Admin)
- `POST /api/visitors` - Register visitor
- `DELETE /api/visitors/:id` - Delete visitor

### Appointments
- `GET /api/appointments` - Get appointments
- `POST /api/appointments` - Create appointment
- `PATCH /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id/cancel` - Cancel appointment

### Passes
- `GET /api/passes` - Get passes
- `POST /api/passes` - Issue pass
- `GET /api/passes/:id/pdf` - Download pass PDF

### Check Logs
- `GET /api/checklogs` - Get check-in/out logs
- `POST /api/checklogs/checkin` - Check in visitor
- `POST /api/checklogs/checkout` - Check out visitor

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

