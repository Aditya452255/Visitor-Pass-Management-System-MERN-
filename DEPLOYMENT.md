# Deployment Guide for Render

This guide explains how to deploy the Visitor Pass Management System on Render.

## Prerequisites

1. A [Render](https://render.com) account
2. A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account for database
3. This repository pushed to GitHub

## Step 1: Deploy Backend

### 1.1 Create Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `visitor-pass-backend` (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: `master` (or `main`)
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or paid for better performance)

### 1.2 Set Environment Variables

In the Render dashboard for your backend service, go to **Environment** and add these variables:

```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/visitor-pass-db?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-here-use-strong-random-string
FRONTEND_URL=https://your-frontend-app.onrender.com
NODE_ENV=production
AUTO_CHECKOUT_AFTER_MIN=60
AUTO_CHECKOUT_INTERVAL_MIN=5
```

Optional (if using email/SMS):
```
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
```

### 1.3 Deploy Backend

1. Click **"Create Web Service"**
2. Render will automatically deploy your backend
3. Wait for the deployment to complete
4. Note your backend URL (e.g., `https://visitor-pass-backend.onrender.com`)

## Step 2: Deploy Frontend

### 2.1 Create Static Site on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Static Site"**
3. Connect your GitHub repository
4. Configure the site:
   - **Name**: `visitor-pass-frontend` (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: `master` (or `main`)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `build`

### 2.2 Set Environment Variables

In the Render dashboard for your frontend service, go to **Environment** and add:

```
REACT_APP_API_URL=https://your-backend-app.onrender.com/api
```

Replace `your-backend-app.onrender.com` with your actual backend URL from Step 1.3.

### 2.3 Deploy Frontend

1. Click **"Create Static Site"**
2. Render will automatically build and deploy your frontend
3. Wait for the deployment to complete
4. Note your frontend URL (e.g., `https://visitor-pass-frontend.onrender.com`)

## Step 3: Update Backend CORS

1. Go back to your **backend service** on Render
2. Update the `FRONTEND_URL` environment variable to your actual frontend URL:
   ```
   FRONTEND_URL=https://visitor-pass-frontend.onrender.com
   ```
3. Save changes (this will trigger a redeployment)

## Step 4: Setup MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster (free tier is fine)
3. Create a database user
4. Whitelist Render's IP addresses (or allow access from anywhere: `0.0.0.0/0`)
5. Get your connection string and update the `MONGO_URI` in backend environment variables

## Step 5: Initial Setup

After deployment, you'll need to create an admin user:

1. SSH into your backend service or use a temporary script endpoint
2. Run the admin creation script:
   ```bash
   node scripts/createAdmin.js
   ```

   Or use MongoDB Atlas directly to create an admin user with proper hashed password.

## Troubleshooting

### Backend Issues
- Check logs in Render dashboard
- Verify all environment variables are set correctly
- Ensure MongoDB URI is correct and whitelist is configured

### Frontend Issues
- Verify `REACT_APP_API_URL` points to correct backend URL
- Check browser console for CORS errors
- Ensure backend CORS is configured with frontend URL

### CORS Errors
- Verify `FRONTEND_URL` in backend matches your actual frontend URL
- Check that backend is running and accessible
- Ensure no trailing slashes in URLs

## Free Tier Limitations

Render's free tier has some limitations:
- Services spin down after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds
- 750 hours/month of runtime per service

Consider upgrading to a paid tier for production use.

## Auto-Deployment

Render automatically redeploys when you push to GitHub:
1. Push changes to your repository
2. Render detects the changes
3. Automatic build and deployment starts
4. Check deployment logs for any errors

## Support

For issues with:
- **Render**: Check [Render Docs](https://render.com/docs)
- **MongoDB Atlas**: Check [MongoDB Docs](https://docs.atlas.mongodb.com/)
