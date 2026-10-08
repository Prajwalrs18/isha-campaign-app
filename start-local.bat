@echo off
cd /d "%~dp0"
echo Starting Isha Outreach Seva on http://localhost:8080
echo Volunteer page: http://localhost:8080/index.html
echo Admin page:     http://localhost:8080/admin.html
echo (Keep this window open. Press Ctrl+C to stop.)
start "" http://localhost:8080/index.html
python -m http.server 8080 2>nul || py -m http.server 8080 2>nul || npx --yes serve -l 8080 .
pause
