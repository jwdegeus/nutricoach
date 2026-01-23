# Supabase Connector

Deze directory bevat de Supabase client connectors voor Next.js App Router.

## Setup

1. **Installeer dependencies:**
   ```bash
   npm install
   ```

2. **Maak `.env.local` bestand:**
   Kopieer `ENV.example` naar `.env.local` en vul je Supabase credentials in:
   ```bash
   cp ENV.example .env.local
   ```

3. **Vul je Supabase credentials in:**
   - Ga naar je Supabase project: https://app.supabase.com/project/_/settings/api
   - Kopieer je Project URL naar `NEXT_PUBLIC_SUPABASE_URL`
   - Kopieer je `anon` public key naar `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Gebruik

### Server Components (Server-side)

```typescript
import { createClient } from '@/src/lib/supabase/server'

export default async function MyPage() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('clients')
    .select('*')
  
  return <div>...</div>
}
```

### Client Components (Client-side)

```typescript
'use client'

import { createBrowserClient } from '@/src/lib/supabase/client'
import { useEffect, useState } from 'react'

export function MyComponent() {
  const [data, setData] = useState(null)
  const supabase = createBrowserClient()
  
  useEffect(() => {
    supabase
      .from('clients')
      .select('*')
      .then(({ data, error }) => {
        if (data) setData(data)
      })
  }, [])
  
  return <div>...</div>
}
```

### Server Actions

```typescript
'use server'

import { createClient } from '@/src/lib/supabase/server'

export async function createClient(data: FormData) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('clients')
    .insert({ name: data.get('name') })
  
  if (error) throw error
}
```

## TypeScript Types

Genereer database types met:

```bash
npx supabase gen types typescript --project-id your-project-id > src/lib/supabase/types.ts
```

Of gebruik de Supabase CLI:

```bash
supabase gen types typescript --local > src/lib/supabase/types.ts
```

## Bestanden

- `client.ts` - Browser client voor Client Components
- `server.ts` - Server client voor Server Components en Server Actions
- `middleware.ts` - Middleware helper voor session management
- `types.ts` - TypeScript database types (te genereren)
- `index.ts` - Re-exports voor gemakkelijk gebruik
