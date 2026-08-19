# 后端看门狗（Windows 开发部署）：弥补「登录自启（AtLogOn）」无崩溃自愈的短板。
# 每 15s 探测一次 8001，若进程不在则自动拉起 start.py。
# 用法（建议另起一个计划任务，触发器 AtLogOn、隐藏窗口、操作 = powershell -File 本脚本）：
#   powershell -ExecutionPolicy Bypass -File backend/scripts/backend_watchdog.ps1
$ErrorActionPreference = 'SilentlyContinue'
$PORT = 8001
$BackendDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$Python = Join-Path $BackendDir '.venv\Scripts\python.exe'

while ($true) {
    $listening = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
        Write-Host "$(Get-Date) backend not listening on :$PORT, restarting..."
        Start-Process -FilePath $Python -ArgumentList 'start.py' -WorkingDirectory $BackendDir -WindowStyle Hidden
    }
    Start-Sleep -Seconds 15
}
