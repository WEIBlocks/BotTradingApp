$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot"
$env:ANDROID_HOME = "C:\Users\faroo\AppData\Local\Android\Sdk"
$env:PATH = "C:\Program Files\nodejs;" + $env:ANDROID_HOME + "\platform-tools;" + $env:JAVA_HOME + "\bin;" + $env:PATH
$env:GRADLE_USER_HOME = "D:\gradle_home"

# Kill lingering Java processes
Stop-Process -Name java -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Build
Set-Location "D:\Weiblocks\Bot_App\BotTradeApp\android"
.\gradlew.bat assembleDebug --console=plain
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FAILED"; exit 1 }

# Install
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
& $adb -s ojyhushavolnvc65 install -r "D:\Weiblocks\Bot_App\BotTradeApp\android\app\build\outputs\apk\debug\app-debug.apk"
if ($LASTEXITCODE -ne 0) { Write-Host "INSTALL FAILED"; exit 1 }

# Launch
& $adb -s ojyhushavolnvc65 shell am start -n "com.botttradeapp/.MainActivity"
Write-Host "APP LAUNCHED SUCCESSFULLY"
