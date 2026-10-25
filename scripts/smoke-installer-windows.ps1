param(
  [string]$OutputDirectory = "apps/desktop/out-builder"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Wait-Until {
  param([scriptblock]$Condition, [string]$Description, [int]$TimeoutSeconds = 60)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Description."
}

function Assert-PrivateAcl {
  param([string]$Path)
  $acl = Get-Acl -LiteralPath $Path
  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  Write-Host "ACL for $Path"
  Write-Host ($rules | Select-Object IdentityReference, FileSystemRights, AccessControlType, IsInherited, PropagationFlags |
    Format-Table -AutoSize | Out-String -Width 240)
  $allowedSids = @(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
    "S-1-5-18",
    "S-1-5-32-544"
  )
  if (-not $acl.AreAccessRulesCanonical -or $rules.Count -eq 0) {
    throw "Missing or noncanonical data ACL on $Path."
  }
  foreach ($rule in $rules) {
    if ($rule.AccessControlType -eq "Allow" -and $rule.IdentityReference.Value -notin $allowedSids) {
      throw "Data ACL grants access to unexpected principal $($rule.IdentityReference.Value) on $Path."
    }
  }
  Write-Host "Private ACL passed. Only current user, SYSTEM, and Administrators have applicable allow entries."
}

function Start-SmokeApp {
  param([string]$Exe)
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  $listener.Stop()
  $token = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $env:PORT = [string]$port
  $env:SLEEPER_AI_API_TOKEN = $token
  Remove-Item -LiteralPath $rendererReadyPath -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $Exe -PassThru
  $null = $process.Handle
  $launch = [pscustomobject]@{
    Process = $process
    Url = "http://127.0.0.1:$port"
    Headers = @{ Authorization = "Bearer $token" }
    Port = $port
  }
  Wait-Until {
    if ($process.HasExited) { throw "Desktop exited before readiness." }
    (Test-Path -LiteralPath $rendererReadyPath) -and (Test-Path -LiteralPath $databasePath)
  } "renderer mount and database at the default per-user location"
  $diagnostics = Invoke-RestMethod "$($launch.Url)/diagnostics" -Headers $launch.Headers -TimeoutSec 5
  if (-not $diagnostics.ok) { throw "Installed API diagnostics failed." }
  $unauthenticated = Invoke-WebRequest "$($launch.Url)/settings" -SkipHttpErrorCheck -TimeoutSec 5
  if ([int]$unauthenticated.StatusCode -ne 401) { throw "Settings accepted an unauthenticated request." }
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen)
  if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne "127.0.0.1") {
    throw "API listener is not exclusively on IPv4 loopback."
  }
  Write-Host "Renderer mounted and authenticated API ready at the default profile."
  return $launch
}

function Stop-SmokeApp {
  param($Launch)
  $windows = @(Get-Process -Name "Sleeper Draft Assistant" -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 })
  if ($windows.Count -ne 1 -or -not $windows[0].CloseMainWindow()) {
    throw "Could not close the app's main window cleanly."
  }
  Wait-Until {
    $Launch.Process.Refresh()
    $Launch.Process.HasExited -and
      @(Get-Process -Name "Sleeper Draft Assistant" -ErrorAction SilentlyContinue).Count -eq 0 -and
      @(Get-NetTCPConnection -LocalPort $Launch.Port -State Listen -ErrorAction SilentlyContinue).Count -eq 0
  } "clean app and owned API shutdown" 20
  $Launch.Process.WaitForExit()
  if ($Launch.Process.ExitCode -ne 0) { throw "Desktop exited with $($Launch.Process.ExitCode) on close." }
  Write-Host "Window close returned exit code zero. No desktop, owned API process, or listener remains."
}

if ($env:CI -ne "true" -or $env:RUNNER_OS -ne "Windows") {
  throw "This destructive install/uninstall smoke requires a disposable Windows CI runner."
}
$output = (Resolve-Path $OutputDirectory).Path
$version = (Get-Content (Join-Path $PSScriptRoot "../apps/desktop/package.json") | ConvertFrom-Json).version
$installer = Join-Path $output "Sleeper Draft Assistant Setup $version.exe"
$portable = Join-Path $output "Sleeper Draft Assistant $version.exe"
foreach ($artifact in @($installer, $portable)) {
  if (-not (Test-Path -LiteralPath $artifact)) { throw "Missing artifact $artifact." }
}
$profileRoot = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "Sleeper Draft Assistant"
$databasePath = Join-Path $profileRoot "data/app.sqlite"
$rendererReadyPath = Join-Path $profileRoot "renderer-ready"
$shortcuts = @(
  (Join-Path ([Environment]::GetFolderPath("DesktopDirectory")) "Sleeper Draft Assistant.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "Sleeper Draft Assistant.lnk")
)
if ((Test-Path -LiteralPath $profileRoot) -or
    @(Get-Process -Name "Sleeper Draft Assistant" -ErrorAction SilentlyContinue).Count -ne 0) {
  throw "Installer smoke requires a fresh profile with no running app."
}
foreach ($shortcut in $shortcuts) {
  if (Test-Path -LiteralPath $shortcut) { throw "Pre-existing app shortcut $shortcut." }
}
$smokeRoot = Join-Path $env:RUNNER_TEMP ("sda-installer-" + [guid]::NewGuid().ToString("N"))
$installDir = Join-Path $smokeRoot "Installed App"
$exe = Join-Path $installDir "Sleeper Draft Assistant.exe"
$uninstaller = Join-Path $installDir "Uninstall Sleeper Draft Assistant.exe"
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
$environmentNames = @("PORT", "ELECTRON_RUN_AS_NODE", "SLEEPER_AI_API_TOKEN", "SLEEPER_AI_DATA_DIR", "SLEEPER_AI_USER_DATA_DIR", "SLEEPER_AI_PACKAGE_SMOKE")
$savedEnvironment = @{}
foreach ($name in $environmentNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name)
  Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}
if ((Test-Path Env:ELECTRON_RUN_AS_NODE) -or (Test-Path Env:SLEEPER_AI_USER_DATA_DIR)) {
  throw "Desktop smoke must not inherit Node mode or a user-data override."
}
$env:SLEEPER_AI_PACKAGE_SMOKE = "1"
try {
  $install = Start-Process -FilePath $installer -ArgumentList "/S /currentuser /D=$installDir" -PassThru
  $null = $install.Handle
  Wait-Until { $install.HasExited } "silent per-user installation" 90
  if ($install.ExitCode -ne 0) { throw "Installer exited with $($install.ExitCode)." }
  foreach ($path in @($exe, $uninstaller) + $shortcuts) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Installation did not create $path." }
  }
  $registration = @(Get-ItemProperty $uninstallKey | Where-Object { $_.PSObject.Properties["DisplayName"] -and $_.DisplayName -eq "Sleeper Draft Assistant $version" })
  if ($registration.Count -ne 1 -or $registration[0].UninstallString -ne "`"$uninstaller`" /currentuser") {
    throw "Expected per-user uninstall registration at the chosen install directory."
  }
  $shortcutShell = New-Object -ComObject WScript.Shell
  foreach ($shortcut in $shortcuts) {
    if ($shortcutShell.CreateShortcut($shortcut).TargetPath -ne $exe) { throw "Shortcut target is not the installed executable." }
  }
  Write-Host "Silent per-user NSIS install, HKCU registration, and both shortcut targets passed."

  $first = Start-SmokeApp $exe
  Assert-PrivateAcl (Join-Path $profileRoot "data")
  Assert-PrivateAcl $databasePath
  $settings = Invoke-RestMethod "$($first.Url)/settings" -Headers $first.Headers -TimeoutSec 5
  if ($settings.codexWebSearch -ne $true) { throw "Fresh profile did not use default settings." }
  $saved = Invoke-RestMethod "$($first.Url)/settings" -Method Put -Headers $first.Headers `
    -ContentType "application/json" -Body '{"codexWebSearch":false,"codexTimeoutMs":75000}' -TimeoutSec 5
  if ($saved.codexWebSearch -ne $false -or $saved.codexTimeoutMs -ne 75000) { throw "Settings write failed." }
  Stop-SmokeApp $first

  $second = Start-SmokeApp $exe
  $persisted = Invoke-RestMethod "$($second.Url)/settings" -Headers $second.Headers -TimeoutSec 5
  if ($persisted.codexWebSearch -ne $false -or $persisted.codexTimeoutMs -ne 75000) {
    throw "Settings did not persist across installed-app restart."
  }
  Write-Host "Authenticated settings persisted across restart with a fresh launch token."
  Assert-PrivateAcl $databasePath
  Stop-SmokeApp $second
  $databaseHash = (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash

  Start-Process -FilePath $uninstaller -ArgumentList "/S /currentuser"
  Wait-Until {
    -not (Test-Path -LiteralPath $installDir) -and
      @($shortcuts | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0 -and
      -not (Test-Path -LiteralPath $registration[0].PSPath)
  } "uninstall to remove installation and shortcuts" 90
  if (-not (Test-Path -LiteralPath $rendererReadyPath) -or
      (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash -ne $databaseHash) {
    throw "Uninstall removed profile data or changed the database."
  }
  Write-Host "Uninstall removed install directory, both shortcuts, and HKCU registration. Profile and database were retained unchanged."

  $portableLaunch = Start-SmokeApp $portable
  $portableSettings = Invoke-RestMethod "$($portableLaunch.Url)/settings" -Headers $portableLaunch.Headers -TimeoutSec 5
  if ($portableSettings.codexWebSearch -ne $false -or $portableSettings.codexTimeoutMs -ne 75000) {
    throw "Portable app did not read retained per-user settings."
  }
  Stop-SmokeApp $portableLaunch
  Write-Host "Portable renderer readiness and retained-settings check passed."
} finally {
  Get-Process -Name "Sleeper Draft Assistant" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  foreach ($name in $environmentNames) {
    if ($null -eq $savedEnvironment[$name]) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item "Env:$name" -Value $savedEnvironment[$name]
    }
  }
}
