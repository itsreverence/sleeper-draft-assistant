param(
  [string]$OutputDirectory = "apps/desktop/out-builder/win-unpacked"
)

$ErrorActionPreference = "Stop"

function Wait-Until {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (& $Condition) {
      return
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)

  throw "Timed out after $TimeoutSeconds seconds."
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    0
  )
  $listener.Start()
  try {
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

$output = (Resolve-Path $OutputDirectory).Path
$exe = Join-Path $output "Sleeper Draft Assistant.exe"
$apiBundle = Join-Path $output "resources/app.asar.unpacked/dist/api-server.mjs"
if (-not (Test-Path $exe) -or -not (Test-Path $apiBundle)) {
  throw "Packaged executable or API bundle is missing."
}

$apiPort = Get-FreeTcpPort

$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  "sleeper-draft-assistant-package-smoke-" + [guid]::NewGuid().ToString("N")
)
$apiData = Join-Path $smokeRoot "api-data"
$profileRoot = Join-Path $smokeRoot "profile"
New-Item -ItemType Directory -Force -Path $apiData, $profileRoot | Out-Null

$apiProcess = $null
try {
  $env:ELECTRON_RUN_AS_NODE = "1"
  $env:PORT = [string]$apiPort
  $env:SLEEPER_AI_API_TOKEN = "package-smoke-token"
  $env:SLEEPER_AI_DATA_DIR = $apiData
  $apiProcess = Start-Process -FilePath $exe -ArgumentList "`"$apiBundle`"" -WindowStyle Hidden -PassThru

  Wait-Until {
    try {
      (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$apiPort/health").StatusCode -eq 200
    } catch {
      $false
    }
  }

  try {
    Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$apiPort/diagnostics" | Out-Null
    throw "Protected diagnostics route accepted an unauthenticated request."
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -ne 401) {
      throw
    }
  }

  $authorized = Invoke-WebRequest -UseBasicParsing `
    -Headers @{ Authorization = "Bearer package-smoke-token" } `
    "http://127.0.0.1:$apiPort/diagnostics"
  if ($authorized.StatusCode -ne 200) {
    throw "Protected diagnostics route rejected the package smoke token."
  }
  Write-Output "Packaged API smoke check passed."
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force
  }
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Remove-Item Env:PORT -ErrorAction SilentlyContinue
  Remove-Item Env:SLEEPER_AI_API_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:SLEEPER_AI_DATA_DIR -ErrorAction SilentlyContinue
}

$existingProcessIds = @(
  Get-Process -Name "Sleeper Draft Assistant" -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Id }
)
$env:SLEEPER_AI_PACKAGE_SMOKE = "1"
$env:SLEEPER_AI_USER_DATA_DIR = $profileRoot
$env:PORT = [string](Get-FreeTcpPort)
New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
$databasePath = Join-Path $profileRoot "data/app.sqlite"
$appProcess = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru

try {
  Wait-Until { Test-Path $databasePath }
  Write-Output "Packaged desktop startup smoke check passed."
} finally {
  if (-not $appProcess.HasExited) {
    $appProcess.CloseMainWindow() | Out-Null
    try {
      Wait-Until { $appProcess.HasExited } 10
    } catch {
      Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
    }
  }

  Get-Process -Name "Sleeper Draft Assistant" -ErrorAction SilentlyContinue |
    Where-Object { $_.Id -notin $existingProcessIds -and $_.Path -eq $exe } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Item Env:PORT -ErrorAction SilentlyContinue
  Remove-Item Env:SLEEPER_AI_PACKAGE_SMOKE -ErrorAction SilentlyContinue
  Remove-Item Env:SLEEPER_AI_USER_DATA_DIR -ErrorAction SilentlyContinue
}

Write-Output "Packaged API authentication and desktop startup smoke checks passed."
