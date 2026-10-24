# 确保 adb 里有手机：优先 USB，其次上次成功的无线地址
# 由 whale-watchdog.ps1 调用；也支持手动跑：powershell -File connect-phone-adb.ps1
$ErrorActionPreference = 'Continue'
$root = 'D:\deepseenhanress\qq-bot'
$stateFile = Join-Path $root 'state\phone-adb.json'
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'phone-adb.log'
function Log($m) { ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) | Add-Content -Path $log -Encoding UTF8 }

# 1) 找 adb：ADB 环境变量 → PATH → 已知位置
$adb = $null
if ($env:ADB -and (Test-Path $env:ADB)) { $adb = $env:ADB }
if (-not $adb) {
  $c = Get-Command adb -ErrorAction SilentlyContinue
  if ($c) { $adb = $c.Source }
}
if (-not $adb) {
  foreach ($p in @(
    'C:\Users\Administrator\.local\bin\adb.exe',
    'D:\deepseenhanress\tools\android\platform-tools\adb.exe'
  )) { if (Test-Path $p) { $adb = $p; break } }
}
if (-not $adb) { Log 'adb 未找到，跳过'; exit 1 }

# 2) 现有设备
$lines = & $adb devices 2>&1 | Where-Object { $_ -match '\t(device|unauthorized|offline)$' -or $_ -match ':(5555|5037)\s+device' }
$devices = @()
foreach ($l in $lines) {
  $parts = ($l -split '\s+') | Where-Object { $_ }
  if ($parts.Count -ge 2) { $devices += $parts[0] }
}
$wireless = $devices | Where-Object { $_ -match ':\d+$' }
$usb = $devices | Where-Object { $_ -notmatch ':\d+$' }

if ($usb) { Log ('USB 已连接: ' + ($usb -join ',')) }
if ($wireless) { Log ('无线已连接: ' + ($wireless -join ',')) }
if ($usb -or $wireless) {
  @{ at = (Get-Date).ToString('o'); usb = $usb; wireless = $wireless } | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8
  exit 0
}

# 3) 都没连着：尝试上次成功的无线地址，再试已知地址
$candidates = @()
if (Test-Path $stateFile) {
  try {
    $st = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($st.lastWifi) { $candidates += $st.lastWifi }
  } catch {}
}
$candidates += @('192.168.182.14:5555', '192.168.18.68:5555')

foreach ($addr in ($candidates | Select-Object -Unique)) {
  $out = & $adb connect $addr 2>&1
  if ($out -match 'connected to') {
    Log ('无线连接成功: ' + $addr)
    @{ at = (Get-Date).ToString('o'); lastWifi = $addr; wireless = @($addr) } | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8
    exit 0
  }
  Log ('连接失败: ' + $addr + ' → ' + ($out -join ' '))
}
Log '没有可用设备（USB 未插、无线地址均失败）'
exit 1
