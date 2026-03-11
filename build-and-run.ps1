# ============================================================
# BotTradeApp - Full Build, Install & Run Script
# Run this when you need to rebuild the APK
# ============================================================

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot"
$env:ANDROID_HOME = "C:\Users\faroo\AppData\Local\Android\Sdk"
$env:PATH = "C:\Program Files\nodejs;" + $env:ANDROID_HOME + "\platform-tools;" + $env:JAVA_HOME + "\bin;" + $env:PATH
$env:GRADLE_USER_HOME = "D:\gradle_home"
$adb = $env:ANDROID_HOME + "\platform-tools\adb.exe"
$DEVICE = "ojyhushavolnvc65"
$APK = "D:\Weiblocks\Bot_App\BotTradeApp\android\app\build\outputs\apk\debug\app-debug.apk"

# --- Step 1: Kill any stale Java/Gradle processes ---
Write-Host "[1/5] Killing stale processes..." -ForegroundColor Cyan
Stop-Process -Name java -Force -ErrorAction SilentlyContinue
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# --- Step 2: Build APK ---
Write-Host "[2/5] Building APK..." -ForegroundColor Cyan
Set-Location "D:\Weiblocks\Bot_App\BotTradeApp\android"
.\gradlew.bat assembleDebug --console=plain
if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD FAILED. Check errors above." -ForegroundColor Red
    exit 1
}
Write-Host "Build successful!" -ForegroundColor Green

# --- Step 3: Install APK on device ---
Write-Host "[3/5] Installing APK on device..." -ForegroundColor Cyan
& $adb -s $DEVICE install -r $APK
if ($LASTEXITCODE -ne 0) {
    Write-Host "Install failed. Is the device connected?" -ForegroundColor Red
    exit 1
}

# --- Step 4: Start Metro in new window ---
Write-Host "[4/5] Starting Metro bundler..." -ForegroundColor Cyan
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location ''D:\Weiblocks\Bot_App\BotTradeApp''; npx react-native start --host 0.0.0.0 --reset-cache' -WindowStyle Normal
Start-Sleep -Seconds 20

# --- Step 5: Set dev server IP and launch app ---
Write-Host "[5/5] Launching app on device..." -ForegroundColor Cyan
$IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" -and $_.PrefixOrigin -eq "Dhcp" } | Select-Object -First 1).IPAddress
if (-not $IP) {
    $IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object -First 1).IPAddress
}
Write-Host "Using PC IP: $IP" -ForegroundColor Yellow
$prefs = "<?xml version=`"1.0`" encoding=`"utf-8`" standalone=`"yes`"?><map><boolean name=`"remote_js_debug`" value=`"false`"/><string name=`"debug_http_host`">${IP}:8081</string></map>"
& $adb -s $DEVICE shell "run-as com.botttradeapp sh -c 'printf ""%s"" ""$prefs"" > shared_prefs/com.botttradeapp_preferences.xml'"
& $adb -s $DEVICE shell am force-stop com.botttradeapp
Start-Sleep -Seconds 2
& $adb -s $DEVICE shell am start -n com.botttradeapp/.MainActivity

Write-Host ""
Write-Host "Done! App is running on device." -ForegroundColor Green
Write-Host "Metro is open in the other PowerShell window." -ForegroundColor Green
