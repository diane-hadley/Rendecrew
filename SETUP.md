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
   Then edit `.env.local` and add your Clerk keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Your publishable key (starts with `pk_test_` or `pk_live_`)
   - `CLERK_SECRET_KEY` - Your secret key (starts with `sk_test_` or `sk_live_`)

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

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

middleware.ts             # Clerk middleware for route protection
```

## Authentication Flow

- **Public routes**: `/`, `/sign-in`, `/sign-up`
- **Protected routes**: `/dashboard` and all other routes (protected by middleware)
- Users are automatically redirected to `/sign-in` if not authenticated
