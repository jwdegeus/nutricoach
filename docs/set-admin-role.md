# Admin Rol Instellen

Er zijn verschillende manieren om een gebruiker een admin rol te geven:

## Methode 1: Via de Settings Pagina (Alleen als er nog geen admins zijn)

1. Log in als de gebruiker die admin moet worden
2. Ga naar `/settings`
3. Klik op "Maak mij admin" in de "Account acties" sectie
4. Dit werkt alleen als er nog geen admins in het systeem zijn

## Methode 2: Via SQL (Aanbevolen voor productie)

### Via Supabase Dashboard

1. Ga naar je Supabase project dashboard
2. Open de SQL Editor
3. Voer de volgende query uit (vervang `USER_EMAIL` met het email adres van de gebruiker):

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'USER_EMAIL'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
```

### Via Supabase CLI

```bash
# Verbind met je Supabase project
supabase db execute "
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'USER_EMAIL'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
"
```

## Methode 3: Eerste Gebruiker Automatisch Admin Maken

Je kunt een migratie maken die de eerste gebruiker automatisch admin maakt:

```sql
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  -- Get the first user (or modify to get by email)
  SELECT id INTO first_user_id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  -- Set as admin if user exists
  IF first_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (first_user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
  END IF;
END $$;
```

## Controleren of een Gebruiker Admin is

```sql
-- Check of een specifieke gebruiker admin is
SELECT
  u.email,
  ur.role
FROM auth.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE u.email = 'USER_EMAIL';
```

## Alle Admins Lijsten

```sql
SELECT
  u.email,
  u.created_at,
  ur.created_at as admin_since
FROM auth.users u
INNER JOIN public.user_roles ur ON u.id = ur.user_id
WHERE ur.role = 'admin'
ORDER BY ur.created_at ASC;
```

## Admin Rol Verwijderen

```sql
-- Verwijder admin rol van een gebruiker
DELETE FROM public.user_roles
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'USER_EMAIL'
);
```
