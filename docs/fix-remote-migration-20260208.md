# Fix: family_members missing on remote (migration 20260208000000)

## What went wrong

- The remote DB had version `20260208000000` in `schema_migrations` from an earlier run (the old duplicate `get_ingredients_unified` migration).
- So `20260208000000_family_members_schema.sql` was **never applied** on remote (Supabase thinks that version is already done).
- The backfill `20260208000002` then fails because `public.family_members` does not exist.

## Fix (one-time)

### 1. Remove the wrong migration record on the remote DB

In **Supabase Dashboard** → **SQL Editor**, run:

```sql
-- Supabase usually stores migration history here:
DELETE FROM supabase_migrations.schema_migrations
WHERE version = 20260208000000;
```

If you get "relation does not exist", try the `public` schema:

```sql
DELETE FROM public.schema_migrations
WHERE version = 20260208000000;
```

### 2. Push migrations again

From the project root:

```bash
supabase db push --include-all
```

This will:

- Apply **20260208000000** (`family_members_schema`) → creates `family_members` and related tables
- Skip **20260208000001** (already applied)
- Apply **20260208000002** (backfill) → now succeeds
- Apply **20260208000003** (`get_ingredients_unified`) → idempotent

After that you can delete this doc if you want.
