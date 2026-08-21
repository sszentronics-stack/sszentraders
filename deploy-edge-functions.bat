@echo off
cd /d "%~dp0"

echo.
echo === Aura Beauty Care: deploy Edge Functions ===
echo.

echo Step 1: Login (browser will open)...
call npx.cmd supabase login
if errorlevel 1 (
  echo Login failed.
  pause
  exit /b 1
)

echo.
echo Step 2: Link project...
call npx.cmd supabase link --project-ref jooukhdxxllutkdqznqt
if errorlevel 1 (
  echo Link failed.
  pause
  exit /b 1
)

echo.
echo Step 3: Deploy functions...
call npm.cmd run db:deploy-functions
if errorlevel 1 (
  echo Deploy failed.
  pause
  exit /b 1
)

echo.
echo Done. Check:
echo https://supabase.com/dashboard/project/jooukhdxxllutkdqznqt/functions
pause
