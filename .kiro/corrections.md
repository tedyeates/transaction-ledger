# Corrections Log

<!-- Entries added automatically when mistakes are made. Read before starting work. -->



- ❌ WSL has Windows Node paths (`/mnt/c/Program Files/nodejs/`) in $PATH that shadow WSL corepack/npm → ✅ Must filter `/mnt/c` paths or run commands in user's interactive terminal where nvm is sourced (tool shell doesn't persist nvm across calls reliably)
- ❌ Seeded auth.users with NULL in string columns (email_change, phone, etc.) → ✅ Must set all varchar/text columns to '' not NULL — GoTrue Go code scans into non-pointer strings and panics on NULL
