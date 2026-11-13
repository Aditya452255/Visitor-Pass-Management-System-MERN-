# Visitor Pass Management System (AWS Ready)

A modernized full-stack web application for visitor pass issuance, appointment approvals, QR badge generation, and check-in / check-out workflows.

Migrated from MongoDB (MERN) to **PostgreSQL + Prisma ORM** with **AWS S3** file storage, **AWS SES** email support, structured **Winston** logging, and an **AWS Lambda-compatible** auto-checkout background job.

---

- [Video](https://www.loom.com/share/363a1035a04647199f06bbc81bc69df6)

## 🏗️ Architecture

```
React 19 Frontend  ──►  Express 5 (Node.js)  ──►  PostgreSQL (Prisma ORM)
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
     AWS S3 Storage    AWS SES Email     Lambda / EventBridge
   (presigned URLs)   (or SMTP dev)     (auto-checkout job)
```

- **Frontend**: React 19, React Router, HTML5 QR Scanner, CSS Modules / responsive design
- **Backend**: Node.js (v20+), Express 5, Prisma ORM 6.4.0, Helmet, Express-Rate-Limit, Winston
- **Database**: PostgreSQL (relational foreign keys, indexes, enums, migrations)
- **File Storage**: AWS S3 (AWS SDK v3, private bucket + presigned URLs, local disk fallback for dev)
- **Email Service**: AWS SES in production, SMTP / mock fallback for development
- **Scheduled Tasks**: AWS Lambda + EventBridge compatible auto-checkout handler (`backend/jobs/autoCheckout.js`)

---

## 💻 Local Setup Instructions (Windows PowerShell)

Follow these step-by-step instructions to run and test the complete system locally:

### 1. Prerequisites
- **Node.js**: v20.x or higher (`node -v`)
- **npm**: v10.x or higher (`npm -v`)
- **PostgreSQL**: Installed and running on `localhost:5432` (`pg_isready`)

### 2. PostgreSQL Database Creation
Open PowerShell or your PostgreSQL CLI (`psql`) and create the database:
```powershell
# Using psql:
psql -U postgres -c "CREATE DATABASE visitor_pass_db;"
```
*(Or create `visitor_pass_db` using pgAdmin 4).*

### 3. Backend Dependency Installation
```powershell
Set-Location "backend"
npm install
```

### 4. Environment Configuration
Copy `.env.example` to `.env` in the `backend/` folder:
```powershell
Copy-Item .env.example .env
```
Open `backend/.env` and update your PostgreSQL password:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/visitor_pass_db?schema=public"
JWT_SECRET="your-32-character-random-secret-key"
PORT=5000
STORAGE_PROVIDER=local
EMAIL_PROVIDER=smtp
```

### 5. Prisma Client Generation
Generate the Prisma Client:
```powershell
npm run db:generate
```

### 6. Database Migrations
Apply the initial SQL migration to create all tables, enums, and foreign-key constraints:
```powershell
npm run db:migrate
```

### 7. Seed Initial Data
Seed standard roles (Admin, Security, Host/Employee, Visitor) and sample records:
```powershell
npm run db:seed
```

**Default Seeded Credentials:**
| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@example.com` | `Admin@123456` |
| **Employee (Host)** | `employee@example.com` | `Employee@123456` |
| **Security Guard** | `security@example.com` | `Security@123456` |
| **Visitor** | `visitor@example.com` | `Visitor@123456` |

### 8. Start Backend API Server
```powershell
npm run dev
# Server will run on http://localhost:5000
```

### 9. Frontend Dependency Installation
In a second PowerShell window:
```powershell
Set-Location "frontend"
npm install
```

### 10. Start Frontend Application
```powershell
npm start
# Client will launch in browser at http://localhost:3000
```

---

## 🧪 Testing Commands

### Backend Automated Test Suite
Run the 17 unit and integration tests covering security, storage, PDF generation, QR payloads, and services:
```powershell
Set-Location "backend"
npm test
```

### Frontend Test & Build
```powershell
Set-Location "frontend"
$env:CI="true"; npm test -- --watchAll=false
npm run build
```

### Standalone Auto-Checkout Job
Manually trigger the auto-checkout batch runner:
```powershell
Set-Location "backend"
npm run job:checkout
```

---

## ⚠️ Common Errors and Solutions

| Issue | Cause | Solution |
|---|---|---|
| `P1001: Can't reach database server at localhost:5432` | PostgreSQL service stopped | Start PostgreSQL service in Windows Services (`services.msc`) or run `net start postgresql-x64-18`. |
| `P1000: Authentication failed against database server` | Incorrect password in `DATABASE_URL` | Update the password in `backend/.env` to match your `postgres` superuser password. |
| `P1012: Environment variable not found: DATABASE_URL` | `.env` missing in `backend/` | Ensure `backend/.env` exists and contains `DATABASE_URL`. |
| `CORS Error in Frontend` | `FRONTEND_URL` mismatch | In `backend/.env`, ensure `FRONTEND_URL=http://localhost:3000`. |
| `Only image files are allowed` | File upload validation | Ensure the uploaded file is a valid image (`.jpg`, `.jpeg`, `.png`, or `.webp`) under 5MB. |

---

## ☁️ Production AWS Deployment (EC2 + Nginx)

1. **EC2 Instance**: Ubuntu 22.04 LTS (t3.small or t3.medium recommended) with IAM Instance Profile for S3 (`s3:PutObject`, `s3:GetObject`) and SES (`ses:SendRawEmail`).
2. **Reverse Proxy (Nginx)**: Proxy `/api/` to `http://127.0.0.1:5000` and serve static frontend from `frontend/build`.
3. **Environment**:
   - Set `STORAGE_PROVIDER=s3` and specify `AWS_S3_BUCKET` and `AWS_REGION`.
   - Set `EMAIL_PROVIDER=ses` and specify `AWS_SES_FROM_EMAIL`.
   - Leave `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` blank to let the AWS SDK automatically assume the EC2 IAM Instance Profile role.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
