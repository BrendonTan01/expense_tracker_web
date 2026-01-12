# Expense Tracker

A web-based expense tracking application built with React and TypeScript. Track your expenses, income, and manage custom spending buckets with recurring transaction support.

## Features

- **Custom Spending Buckets**: Create and manage custom categories (buckets) for organizing expenses
- **Income & Expense Tracking**: Add multiple income sources and expenses with detailed descriptions
- **Recurring Transactions**: Set up recurring transactions (daily, weekly, monthly, yearly)
- **Summary Dashboard**: View your financial summary with breakdowns by bucket
- **Backend Database**: Persistent data storage using SQLite database with REST API

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the backend server:
```bash
npm run server
```

The backend API will run on `http://localhost:3001`

3. In a separate terminal, start the frontend development server:
```bash
npm run dev
```

4. Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`)

**Alternative: Run both servers simultaneously:**
```bash
npm run dev:all
```

This will start both the frontend and backend servers concurrently.

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Running Production Build Locally

To test the production build (backend serves frontend):

```bash
npm run build:start
```

This builds the frontend and starts the server. Visit `http://localhost:3001` to see the app.

## Deployment

**Want to share your app with others without running anything on your computer?**

Deploy everything to Vercel with Supabase for the database!

**Quick Start:**

1. **Set up Supabase** (free database):
   - Sign up at [supabase.com](https://supabase.com)
   - Create a project
   - Run the SQL schema from `supabase/schema.sql`
   - Get your API keys

2. **Deploy to Vercel**:
   - Push code to GitHub
   - Sign up at [vercel.com](https://vercel.com)
   - Import your GitHub repo
   - Add environment variables:
     - `VITE_SUPABASE_URL` = your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
   - Deploy!

3. **Share your Vercel URL** - That's it!

For detailed step-by-step instructions, see:
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Vercel deployment guide
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Supabase setup guide

## Usage

1. **Buckets**: Create custom spending categories in the "Buckets" tab
2. **Transactions**: Add income or expenses in the "Transactions" tab
3. **Recurring**: Set up recurring transactions that will automatically generate new transactions
4. **Summary**: View your financial overview and breakdowns in the "Summary" tab

## Technology Stack

### Frontend
- React 18
- TypeScript
- Vite
- CSS3

### Backend
- Vercel Serverless Functions
- Supabase (PostgreSQL)
- REST API

## Data Storage

All data is stored in a Supabase PostgreSQL database. The database schema is defined in `supabase/schema.sql`. 

For local development, you'll need to:
1. Create a Supabase project (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))
2. Run the schema SQL in Supabase SQL Editor
3. Add environment variables to `.env` file

### API Endpoints

- `GET /api/buckets` - Get all buckets
- `POST /api/buckets` - Create a new bucket
- `PUT /api/buckets/:id` - Update a bucket
- `DELETE /api/buckets/:id` - Delete a bucket

- `GET /api/transactions` - Get all transactions
- `POST /api/transactions` - Create a new transaction
- `PUT /api/transactions/:id` - Update a transaction
- `DELETE /api/transactions/:id` - Delete a transaction

- `GET /api/recurring` - Get all recurring transactions
- `POST /api/recurring` - Create a new recurring transaction
- `PUT /api/recurring/:id` - Update a recurring transaction
- `DELETE /api/recurring/:id` - Delete a recurring transaction

- `GET /api/health` - Health check endpoint

### Environment Variables

Create a `.env` file in the root directory for local development:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Get these values from your Supabase project dashboard → Settings → API.

For production (Vercel), add these as environment variables in the Vercel dashboard.

## License

MIT