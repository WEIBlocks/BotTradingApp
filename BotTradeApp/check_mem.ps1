Stop-Process -Name java -Force -ErrorAction SilentlyContinue
$os = Get-CimInstance Win32_OperatingSystem
$freeMB = [math]::Round($os.FreePhysicalMemory/1KB)
$totalMB = [math]::Round($os.TotalVisibleMemorySize/1KB)
Write-Host "Free: ${freeMB}MB / Total: ${totalMB}MB"
