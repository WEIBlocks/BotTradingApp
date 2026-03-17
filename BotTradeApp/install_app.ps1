$env:ANDROID_HOME = "C:\Users\faroo\AppData\Local\Android\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
& $adb -s ojyhushavolnvc65 install -r "D:\Weiblocks\Bot_App\BotTradeApp\android\app\build\outputs\apk\debug\app-debug.apk"
if ($LASTEXITCODE -ne 0) { Write-Host "INSTALL FAILED"; exit 1 }
& $adb -s ojyhushavolnvc65 shell am start -n "com.botttradeapp/.MainActivity"
Write-Host "APP LAUNCHED SUCCESSFULLY"
