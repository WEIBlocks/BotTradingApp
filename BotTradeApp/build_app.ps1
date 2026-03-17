$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot"
$env:ANDROID_HOME = "C:\Users\faroo\AppData\Local\Android\Sdk"
$env:PATH = "C:\Program Files\nodejs;" + $env:ANDROID_HOME + "\platform-tools;" + $env:JAVA_HOME + "\bin;" + $env:PATH
$env:GRADLE_USER_HOME = "D:\gradle_home"
Set-Location "D:\Weiblocks\Bot_App\BotTradeApp\android"
.\gradlew.bat assembleDebug --console=plain
