$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$dataDir = Join-Path $root 'data'
$servicePidFile = Join-Path $dataDir 'service.pid'
$supervisorScript = Join-Path $root 'RUN-SERVICE.ps1'

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Test-ServiceHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:8787/api/health'
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Wait-ServiceHealth {
  param([int]$Seconds = 30)

  for ($attempt = 0; $attempt -lt $Seconds; $attempt++) {
    if (Test-ServiceHealth) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

if (Test-ServiceHealth) {
  Write-Host '比分提醒服务已经在运行。'
  exit 0
}

$supervisorIsRunning = $false
if (Test-Path $servicePidFile) {
  $recordedId = 0
  if ([int]::TryParse((Get-Content $servicePidFile -First 1), [ref]$recordedId)) {
    $recordedProcess = Get-Process -Id $recordedId -ErrorAction SilentlyContinue
    if ($recordedProcess -and @('powershell', 'pwsh') -contains $recordedProcess.ProcessName) {
      $supervisorIsRunning = $true
    }
  }

  if (-not $supervisorIsRunning) {
    Remove-Item $servicePidFile -Force -ErrorAction SilentlyContinue
  }
}

if (-not $supervisorIsRunning) {
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$supervisorScript`""
  Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden | Out-Null
}

if (Wait-ServiceHealth -Seconds 30) {
  Write-Host '比分提醒服务已在后台启动：http://localhost:8787'
  exit 0
}

Write-Error "服务启动超时。请查看 $dataDir\server-error.log 和 server-supervisor.log。"
exit 1
