# Setup Guide

## Prerequisites

- **Node.js 18.17.0 or higher** (required - check with `node --version`)
- **npm 9.0.0 or higher** (check with `npm --version`)
- A Clerk account (sign up at https://clerk.com)

### Installing/Upgrading Node.js

If you don't have Node.js 18.17.0+, download and install it directly:

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

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up Clerk:
   - Go to https://dashboard.clerk.com
   - Create a new application
   - Copy your API keys from the dashboard

3. Create environment variables:
   ```bash
   cp env.example .env.local
   ```
   Then edit `.env.local` and add your keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Your publishable key (starts with `pk_test_` or `pk_live_`)
   - `CLERK_SECRET_KEY` - Your secret key (starts with `sk_test_` or `sk_live_`)
   - `DATABASE_URL` - Your PostgreSQL connection string (see Database Setup below)

4. Set up the database:
   - **Supabase** (recommended):
     1. Go to https://supabase.com and create a new project
     2. Navigate to **Settings** > **Database**
     3. Scroll to **Connection string** section
     4. Select the **Connection pooling** tab (recommended for better performance) or **Direct connection**
     5. Copy the URI connection string - it will look like:
        ```
        postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
        ```
     6. Replace `[YOUR-PASSWORD]` with your actual database password (set when creating the project)
     7. The final string should look like:
        ```
        postgresql://postgres:your_actual_password@db.xxxxx.supabase.co:5432/postgres
        ```
     8. Add this complete URI string to `.env.local` as `DATABASE_URL`:
        ```
        DATABASE_URL=postgresql://postgres:your_actual_password@db.xxxxx.supabase.co:5432/postgres
        ```
   
   Then initialize your database schema:
   ```bash
   npm run prisma:migrate
   ```
   This will create your first migration and apply it to the database.

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
app/
  ├── layout.tsx          # Root layout with ClerkProvider
  ├── page.tsx            # Home page with sign-in/sign-up
  ├── globals.css         # Global styles with Tailwind
  ├── sign-in/            # Sign-in page
  ├── sign-up/            # Sign-up page
  └── dashboard/          # Protected dashboard page

components/
  ├── UserButton.tsx      # User button component
  └── ProtectedRoute.tsx  # Client-side route protection

lib/
  └── prisma.ts           # Prisma Client singleton (database access)

prisma/
  └── schema.prisma       # Database schema (platform-agnostic PostgreSQL)

middleware.ts             # Clerk middleware for route protection
```

## Authentication Flow

- **Public routes**: `/`, `/sign-in`, `/sign-up`
- **Protected routes**: `/dashboard` and all other routes (protected by middleware)
- Users are automatically redirected to `/sign-in` if not authenticated
