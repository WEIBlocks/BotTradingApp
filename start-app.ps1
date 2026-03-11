# ============================================================
# BotTradeApp - Quick Start Script
# Run this after reconnecting USB cable (no rebuild needed)
# ============================================================

$env:ANDROID_HOME = "C:\Users\faroo\AppData\Local\Android\Sdk"
$adb = $env:ANDROID_HOME + "\platform-tools\adb.exe"
$DEVICE = "ojyhushavolnvc65"

# --- Check device is connected ---
Write-Host "Checking device connection..." -ForegroundColor Cyan
$devices = & $adb devices
if ($devices -notmatch $DEVICE) {
    Write-Host "Device not found! Make sure USB is connected and USB debugging is enabled." -ForegroundColor Red
    exit 1
}
Write-Host "Device connected." -ForegroundColor Green

# --- Start Metro if not already running ---
$metroRunning = $false
try {
    $r = Invoke-WebRequest -Uri "http://localhost:8081/status" -TimeoutSec 3 -ErrorAction Stop
    $metroRunning = $true
    Write-Host "Metro already running." -ForegroundColor Green
} catch {
    Write-Host "Starting Metro bundler in new window..." -ForegroundColor Cyan
    Stop-Process -Name node -Force -ErrorAction SilentlyContinue
    Start-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location ''D:\Weiblocks\Bot_App\BotTradeApp''; npx react-native start --host 0.0.0.0' -WindowStyle Normal
    Write-Host "Waiting for Metro to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 20
}

# --- Get current PC IP ---
$IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" -and $_.PrefixOrigin -eq "Dhcp" } | Select-Object -First 1).IPAddress
if (-not $IP) {
    $IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object -First 1).IPAddress
}
Write-Host "Using PC IP: $IP" -ForegroundColor Yellow

# --- Set dev server host on device ---
Write-Host "Setting dev server on device..." -ForegroundColor Cyan
$prefs = "<?xml version=`"1.0`" encoding=`"utf-8`" standalone=`"yes`"?><map><boolean name=`"remote_js_debug`" value=`"false`"/><string name=`"debug_http_host`">${IP}:8081</string></map>"
& $adb -s $DEVICE shell "run-as com.botttradeapp sh -c 'printf ""%s"" ""$prefs"" > shared_prefs/com.botttradeapp_preferences.xml'"

# --- Launch app ---
Write-Host "Launching app..." -ForegroundColor Cyan
& $adb -s $DEVICE shell am force-stop com.botttradeapp
Start-Sleep -Seconds 2
& $adb -s $DEVICE shell am start -n com.botttradeapp/.MainActivity

Write-Host ""
Write-Host "Done! App is running on device." -ForegroundColor Green
