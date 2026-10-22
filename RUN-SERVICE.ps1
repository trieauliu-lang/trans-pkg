$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$dataDir = Join-Path $root 'data'
$servicePidFile = Join-Path $dataDir 'service.pid'
$nodePidFile = Join-Path $dataDir 'node.pid'
$stdoutLog = Join-Path $dataDir 'server-out.log'
$stderrLog = Join-Path $dataDir 'server-error.log'
$supervisorLog = Join-Path $dataDir 'server-supervisor.log'

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Set-Content -Path $servicePidFile -Value $PID -Encoding Ascii
Set-Location $root

try {
  while ($true) {
    try {
      $nodeProcess = Start-Process `
        -FilePath 'node.exe' `
        -ArgumentList @('--env-file-if-exists=.env', 'server\index.js', '--production') `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

      Set-Content -Path $nodePidFile -Value $nodeProcess.Id -Encoding Ascii
      $nodeProcess.WaitForExit()
      $exitCode = $nodeProcess.ExitCode
      Remove-Item $nodePidFile -Force -ErrorAction SilentlyContinue
      Add-Content -Path $supervisorLog -Encoding UTF8 -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Node 已退出，退出码 $exitCode；5 秒后重启。"
    }
    catch {
      Remove-Item $nodePidFile -Force -ErrorAction SilentlyContinue
      Add-Content -Path $supervisorLog -Encoding UTF8 -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 启动 Node 失败：$($_.Exception.Message)；5 秒后重试。"
    }

    Start-Sleep -Seconds 5
  }
}
finally {
  Remove-Item $nodePidFile -Force -ErrorAction SilentlyContinue
  Remove-Item $servicePidFile -Force -ErrorAction SilentlyContinue
}
