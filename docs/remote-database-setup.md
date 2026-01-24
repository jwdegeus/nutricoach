# Remote Database Setup

Dit project gebruikt **alleen remote Supabase database** (geen lokale database).

## Setup

### 1. Login bij Supabase CLI

```bash
supabase login
```

### 2. Link naar je remote project

```bash
supabase link --project-ref <your-project-ref>
```

Je project reference ID vind je in je Supabase dashboard: https://app.supabase.com/project/_/settings/general

### 3. Push migraties naar remote database

```bash
supabase db push
```

Dit pusht alle migraties in `supabase/migrations/` naar je remote database.

## Migraties beheren

### Nieuwe migratie aanmaken

```bash
supabase migration new <migration_name>
```

Dit maakt een nieuwe migratie aan in `supabase/migrations/`.

### Migraties pushen

```bash
supabase db push
```

### Migraties resetten (LET OP: verwijdert alle data!)

```bash
supabase db reset --linked
```

## Belangrijk

- **Geen lokale database**: Dit project gebruikt geen lokale Supabase instance
- **Alleen remote**: Alle database operaties gaan naar je remote Supabase project
- **Migraties**: Gebruik altijd `supabase db push` om migraties toe te passen
- **Config**: De `supabase/config.toml` is geconfigureerd voor remote-only gebruik

## Troubleshooting

### "Access token not provided"
```bash
supabase login
```

### "Project not linked"
```bash
supabase link --project-ref <your-project-ref>
```

### Migraties niet toegepast
```bash
# Check status
supabase db remote commit

# Push migraties
supabase db push
```
