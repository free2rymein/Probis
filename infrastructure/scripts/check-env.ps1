$required = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "REDIS_URL"
)

$missing = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) }

if ($missing.Count -gt 0) {
  Write-Error "Missing required environment variables: $($missing -join ', ')"
  exit 1
}

Write-Output "Environment looks ready."
