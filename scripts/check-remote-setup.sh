#!/bin/bash

# Check if Supabase is configured for remote-only usage

echo "🔍 Checking Supabase remote setup..."

# Check if linked to remote project
if [ -f "supabase/.temp/project-ref" ]; then
  PROJECT_REF=$(cat supabase/.temp/project-ref)
  echo "✅ Project linked: $PROJECT_REF"
else
  echo "❌ Not linked to remote project"
  echo "   Run: supabase link --project-ref <your-project-ref>"
  exit 1
fi

# Check if logged in
if supabase projects list > /dev/null 2>&1; then
  echo "✅ Logged in to Supabase"
else
  echo "❌ Not logged in to Supabase"
  echo "   Run: supabase login"
  exit 1
fi

# Check config.toml
if [ -f "supabase/config.toml" ]; then
  if grep -q "enabled = false" supabase/config.toml; then
    echo "✅ Config set for remote-only (local services disabled)"
  else
    echo "⚠️  Config may have local services enabled"
  fi
else
  echo "⚠️  No config.toml found (will use defaults)"
fi

echo ""
echo "✅ Setup looks good! You can push migrations with:"
echo "   npm run db:push"
echo "   or"
echo "   supabase db push"
