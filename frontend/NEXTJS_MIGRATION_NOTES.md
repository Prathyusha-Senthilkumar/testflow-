# TestFlow Frontend — Next.js Migration

The frontend has been migrated from React + Vite + React Router to **Next.js App Router + React + TypeScript + Tailwind CSS**.

## Main changes
- Vite entry/config removed.
- `react-router-dom` removed.
- Next.js App Router routes added under `src/app`.
- Existing React screen components are retained under `src/pages`.
- `AppShell` now wraps route children through Next.js layouts.
- A small `src/lib/navigation.tsx` adapter maps the existing `to=` navigation style onto Next.js navigation, minimizing UI rewrites.
- Browser-exposed environment variables now use `NEXT_PUBLIC_*`.

## Run
```powershell
npm.cmd install
npm.cmd run dev
```

Then open `http://localhost:3000`.

## Environment variables
Copy `.env.example` to `.env.local` and provide the required values. Never expose a Supabase service-role key in the frontend.
