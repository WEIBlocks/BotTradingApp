# ─── BotTradeApp - Build, Install & Run ─────────────────────────────────────
# Usage: Right-click > Run with PowerShell, or from terminal: powershell -ExecutionPolicy Bypass -File run_app.ps1
# Flags: -SkipBuild to skip Gradle build (just install + metro)

param([switch]$SkipBuild)

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot"
$env:ANDROID_HOME = "C:\Users\faroo\AppData\Local\Android\Sdk"
$env:PATH = "C:\Program Files\nodejs;" + $env:ANDROID_HOME + "\platform-tools;" + $env:JAVA_HOME + "\bin;" + $env:PATH
$env:GRADLE_USER_HOME = "D:\gradle_home"

$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
$apk = "D:\Weiblocks\Bot_App\BotTradeApp\android\app\build\outputs\apk\debug\app-debug.apk"
$package = "com.botttradeapp"
$activity = "$package/.MainActivity"
$device = "ojyhushavolnvc65"

# ─── Step 1: Check device ───────────────────────────────────────────────────
Write-Host "`n=== [1/6] Checking device ===" -ForegroundColor Cyan
$devices = & $adb devices 2>&1
if ($devices -notmatch $device) {
    Write-Host "ERROR: Device $device not found. Connect USB and enable USB debugging." -ForegroundColor Red
    Write-Host $devices
    exit 1
}
Write-Host "Device $device connected." -ForegroundColor Green

# ─── Step 2: Kill stale Metro / Gradle processes ────────────────────────────
Write-Host "`n=== [2/6] Killing stale processes ===" -ForegroundColor Cyan
$metroPort = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
foreach ($conn in $metroPort) {
    Write-Host "  Killing process $($conn.OwningProcess) on port 8081"
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}
Write-Host "Port 8081 clear." -ForegroundColor Green

# ─── Step 3: Build APK ──────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Host "`n=== [3/6] Building APK (Gradle) ===" -ForegroundColor Cyan
    Set-Location "D:\Weiblocks\Bot_App\BotTradeApp\android"
    .\gradlew.bat assembleDebug --console=plain
    Set-Location "D:\Weiblocks\Bot_App\BotTradeApp"

    if (-not (Test-Path $apk)) {
        Write-Host "ERROR: APK not found at $apk. Build may have failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "APK built successfully." -ForegroundColor Green
} else {
    Write-Host "`n=== [3/6] Skipping build (--SkipBuild) ===" -ForegroundColor Yellow
}

# ─── Step 4: Install APK ────────────────────────────────────────────────────
Write-Host "`n=== [4/6] Installing APK ===" -ForegroundColor Cyan
& $adb -s $device install -r $apk
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: APK install failed." -ForegroundColor Red
    exit 1
}
Write-Host "APK installed." -ForegroundColor Green

# ─── Step 5: Set up ADB reverse port ────────────────────────────────────────
Write-Host "`n=== [5/6] Setting up ADB reverse tcp:8081 ===" -ForegroundColor Cyan
& $adb -s $device reverse tcp:8081 tcp:8081
Write-Host "ADB reverse port set." -ForegroundColor Green

# ─── Step 6: Start Metro + Launch App ────────────────────────────────────────
Write-Host "`n=== [6/6] Starting Metro & launching app ===" -ForegroundColor Cyan

# Launch app on device
& $adb -s $device shell am force-stop $package
Start-Sleep -Seconds 1
& $adb -s $device shell am start -n $activity
Write-Host "App launched on device." -ForegroundColor Green

# Start Metro in this terminal (keeps it alive)
Write-Host "`n=== Metro bundler starting... (keep this terminal open) ===" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop Metro when done.`n" -ForegroundColor DarkGray
Set-Location "D:\Weiblocks\Bot_App\BotTradeApp"
npx react-native start
