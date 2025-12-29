---
description: How to set up Google OAuth credentials for the application
---

# Setting up Google OAuth

To enable "Sign in with Google", you need to create a project in the Google Cloud Console and obtain OAuth credentials.

## 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top left and select **New Project**.
3. Give it a name (e.g., "TestSimply Auth") and click **Create**.

## 2. Configure OAuth Consent Screen
1. In the left sidebar, go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** (or **Internal** if you are a Google Workspace user and only want to allow your organization) and click **Create**.
3. Fill in the required fields:
   - **App name**: TestSimply
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click **Save and Continue**.
5. You can skip "Scopes" for now (default scopes are usually sufficient for login). Click **Save and Continue**.
6. Add Test Users (if External): Add your own email to test the login. Click **Save and Continue**.

## 3. Create Credentials
1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Select **Web application** as the Application type.
4. Name it (e.g., "TestSimply Web Client").
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback/google`
7. Click **Create**.

## 4. Copy Credentials
1. You will see a modal with your **Client ID** and **Client Secret**.
2. Copy these values.

## 5. Update Environment Variables
1. Open your `.env.local` file.
2. Add or update the following lines:
   ```env
   GOOGLE_CLIENT_ID=your_pasted_client_id
   GOOGLE_CLIENT_SECRET=your_pasted_client_secret
   ```
3. Restart your server: `npm run dev`.
