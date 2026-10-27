$ErrorActionPreference = 'SilentlyContinue'

$dataDir = Join-Path $PSScriptRoot 'data'
$servicePidFile = Join-Path $dataDir 'service.pid'
$nodePidFile = Join-Path $dataDir 'node.pid'
$stoppedAnything = $false

function Stop-RecordedProcess {
  param(
    [string]$PidFile,
    [string[]]$AllowedNames
  )

  if (-not (Test-Path $PidFile)) {
    return $false
  }

  $recordedId = 0
  $hasValidId = [int]::TryParse((Get-Content $PidFile -First 1), [ref]$recordedId)
  if ($hasValidId) {
    $recordedProcess = Get-Process -Id $recordedId -ErrorAction SilentlyContinue
    if ($recordedProcess -and $AllowedNames -contains $recordedProcess.ProcessName) {
      Stop-Process -Id $recordedId -Force -ErrorAction SilentlyContinue
      Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
      return $true
    }
  }

  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  return $false
}

# 先停止守护进程，避免它在停止 Node 后立即把服务重新拉起。
if (Stop-RecordedProcess -PidFile $servicePidFile -AllowedNames @('powershell', 'pwsh')) {
  $stoppedAnything = $true
}
if (Stop-RecordedProcess -PidFile $nodePidFile -AllowedNames @('node')) {
  $stoppedAnything = $true
}

if ($stoppedAnything) {
  Write-Host '比分提醒后台服务已停止。'
}
else {
  Write-Host '没有发现由本安装包启动的后台服务。'
}
