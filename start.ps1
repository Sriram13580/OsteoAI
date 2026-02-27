# OsteoAI — Start Script
# Starts the Flask backend (which serves the built React frontend) or falls back to dev mode

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🦴 OsteoAI — Starting Application" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

# Try to find Python
$pythonExe = $null
$pythonPaths = @(
    "$HOME\AppData\Local\Programs\Thonny\python.exe",
    "python",
    "python3",
    "py"
)
foreach ($p in $pythonPaths) {
    try {
        $v = & $p --version 2>&1
        if ($v -match "Python") { $pythonExe = $p; break }
    }
    catch {}
}

if ($pythonExe) {
    Write-Host "✅ Python found at: $pythonExe" -ForegroundColor Green
    Write-Host "▶ Starting Flask backend (serves built frontend at port 5000)..." -ForegroundColor Green
    $flaskJob = Start-Process -FilePath $pythonExe -ArgumentList "app.py" -WorkingDirectory "$ROOT\backend" -PassThru -WindowStyle Normal
    Start-Sleep -Seconds 3
    $appUrl = "http://localhost:5000"
}
else {
    Write-Host "ℹ️  Python not found — starting Node.js mock backend + React dev server" -ForegroundColor Yellow
    $backendJob = Start-Process -FilePath "node" -ArgumentList "mock_server.js" -WorkingDirectory "$ROOT\backend" -PassThru -WindowStyle Minimized
    Start-Sleep -Seconds 2
    Write-Host "▶ Starting React frontend on port 5173..." -ForegroundColor Green
    Start-Process -FilePath "cmd" -ArgumentList "/c", "npm run dev" -WorkingDirectory "$ROOT\frontend" -PassThru -WindowStyle Normal
    Start-Sleep -Seconds 3
    $appUrl = "http://localhost:5173"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ✅ OsteoAI is RUNNING!" -ForegroundColor Green
Write-Host "  🌐 App URL:   $appUrl" -ForegroundColor White
Write-Host "  🤖 Chatbot:   Groq LLaMA-3 8B (set GROQ_API_KEY in backend/.env)" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Open browser
Start-Sleep -Seconds 1
Start-Process $appUrl

Write-Host "Press any key to stop all services..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Cleanup
if ($backendJob) { Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue }
if ($flaskJob) { Stop-Process -Id $flaskJob.Id -Force -ErrorAction SilentlyContinue }
Write-Host "Services stopped." -ForegroundColor Red
