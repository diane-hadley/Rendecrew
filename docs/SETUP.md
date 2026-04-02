# Setup Guide

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18.17.0 or higher** (check with `node --version`)
- **npm 9.0.0 or higher** (check with `npm --version`)

### Installing/Upgrading Node.js

If you don't have Node.js 18.17.0+, download and install it:

1. Go to https://nodejs.org/
2. Download the **LTS version** (v18.x.x or v20.x.x)
3. Choose the macOS installer (.pkg file)
4. Run the downloaded installer and follow the installation wizard
5. This will install both Node.js and npm

After installation, verify your version:
```bash
node --version  # Should show v18.17.0 or higher
npm --version    # Should show 9.0.0 or higher
```

## Installation Steps

Follow these steps in order:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Set Up Auth (Clerk)

1. Go to https://clerk.com and sign up (or sign in if you already have an account)
2. Go to https://dashboard.clerk.com
3. Create a new application
4. Copy your API keys from the dashboard:
   - **Publishable Key** (starts with `pk_test_` or `pk_live_`)
   - **Secret Key** (starts with `sk_test_` or `sk_live_`)
5. Keep these keys handy - you'll need them in Step 4

### Step 3: Set Up Database (Supabase)

1. Go to https://supabase.com and create a new project
2. Navigate to **Settings** > **Database**
3. Scroll to **Connection string** section
4. Select the **Connection pooling** tab (recommended for better performance) or **Direct connection**
5. Copy the URI connection string - it will look like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with your actual database password (set when creating the project)
7. The final connection string should look like:
   ```
   postgresql://postgres:your_actual_password@db.xxxxx.supabase.co:5432/postgres
   ```
8. Keep this connection string handy - you'll need it in Step 4

### Step 4: Set Up AI (Anthropic)

Rendecrew uses the **Anthropic TypeScript SDK** (`@anthropic-ai/sdk`) to call the Claude API. The default model is **Claude Sonnet 4.5** (`claude-sonnet-4-5`).

1. Go to https://console.anthropic.com/ and sign in (or create an account).
2. Open **API Keys** and create a key.
3. Keep the key handy for Step 4 (it is only shown once).

### Step 5: Configure Environment Variables

1. Create your environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` in your editor and add your credentials:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   DATABASE_URL=postgresql://postgres:your_actual_password@db.xxxxx.supabase.co:5432/postgres
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```
   Replace the values with the keys you collected in Steps 2, 3, and 4.

### Step 6: Initialize Database Schema

Run the Prisma migration to create your database tables:

```bash
npm run prisma:push
```

This syncs `prisma/schema.prisma` to your empty database. If your `DATABASE_URL` uses Supabase’s **transaction pooler** (port `6543`), the script switches to port `5432` for the push, because DDL on `6543` often hangs. Prefer a **direct** or **session** connection string (port `5432`) in `.env.local` when possible. 

When you want versioned migrations later, switch to `prisma migrate dev`.

### Step 7: Run the Development Server

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see your app running.
