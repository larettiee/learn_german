# Supabase sync setup

This app works locally without Supabase. To sync between Mac and phone, connect a free Supabase project.

## 1. Create a Supabase project

Create a project at https://supabase.com/.

## 2. Create the sync table

Open Supabase Dashboard -> SQL Editor -> New query, paste `supabase-schema.sql`, then run it.

The table stores the whole app state in one private row per authenticated user:

- cards
- trainer sentences
- streak state

RLS is enabled, and each user can only read/update their own row.

## 3. Add environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

In Supabase Dashboard, find these in Project Settings -> API.

## 4. Configure auth redirect

In Supabase Dashboard -> Authentication -> URL Configuration:

- Site URL: your deployed app URL, for example `https://your-site.netlify.app`
- Redirect URLs: add the same deployed URL and local dev URL `http://127.0.0.1:5173`

## 5. Run locally

```bash
npm install
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`, enter your email in the sync panel, and open the magic link from your email.

## Deploy notes

On Netlify or Vercel, add the same environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then deploy with:

- build command: `npm run build`
- publish directory: `dist`
