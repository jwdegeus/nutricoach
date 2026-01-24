This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

- Node.js 18+ 
- Supabase CLI (`npm install -g supabase`)
- A Supabase project (remote only - no local database)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp ENV.example .env.local
   ```
   Fill in your Supabase credentials from your project dashboard.

3. **Link to remote Supabase project:**
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

4. **Push database migrations:**
   ```bash
   npm run db:push
   # or
   supabase db push
   ```

5. **Run the development server:**

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Database Management

This project uses **remote Supabase database only** (no local database).

### Available Scripts

- `npm run db:push` - Push migrations to remote database
- `npm run db:reset` - Reset remote database (⚠️ deletes all data!)
- `npm run db:status` - Check migration status
- `npm run db:migration <name>` - Create new migration

### Database Setup

See [docs/remote-database-setup.md](./docs/remote-database-setup.md) for detailed instructions.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
