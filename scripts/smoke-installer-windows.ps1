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
  param([string]$Exe, [switch]$PreviousRelease)
  for ($attempt = 0; $attempt -lt 2; $attempt++) {
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
      Token = $token
    }
    try {
      Wait-Until {
        if ($process.HasExited) { throw "Desktop exited before readiness." }
        if (-not (Test-Path -LiteralPath $databasePath)) { return $false }
        if (-not $PreviousRelease -and -not (Test-Path -LiteralPath $rendererReadyPath)) { return $false }
        try {
          (Invoke-RestMethod "$($launch.Url)/health" -TimeoutSec 2).ok -eq $true
        } catch { $false }
      } "database, API health, and applicable renderer readiness"
    } catch {
      $foreignListeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).Path -ne $Exe })
      if ($attempt -ne 0 -or $foreignListeners.Count -eq 0) { throw }
      & taskkill /PID $process.Id /T /F | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Could not stop failed launch before bind retry." }
      Wait-Until { @(Get-Process -Name "Sleeper Draft Assistant" -ErrorAction SilentlyContinue).Count -eq 0 } "failed launch cleanup" 20
      Write-Host "Port was taken after reservation. Retrying once on a fresh port."
      continue
    }
    $diagnostics = Invoke-RestMethod "$($launch.Url)/diagnostics" -Headers $launch.Headers -TimeoutSec 5
    if (-not $diagnostics.ok) { throw "Installed API diagnostics failed." }
    $unauthenticated = Invoke-WebRequest "$($launch.Url)/settings" -SkipHttpErrorCheck -TimeoutSec 5
    if ([int]$unauthenticated.StatusCode -ne 401) { throw "Settings accepted an unauthenticated request." }
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne "127.0.0.1") {
      throw "API listener is not exclusively on IPv4 loopback."
    }
    if ($PreviousRelease) {
      Write-Host "Previous release ready through health, authenticated diagnostics, and database. Renderer marker not required."
    } else {
      Write-Host "Renderer mounted and authenticated API ready at the default profile."
    }
    return $launch
  }
}

function Invoke-AppApi {
  param($Launch, [string]$Route, [string]$Method = "Get", $Body)
  $arguments = @{
    Uri = "$($Launch.Url)$Route"
    Headers = $Launch.Headers
    Method = $Method
    TimeoutSec = 10
  }
  if ($null -ne $Body) {
    $arguments.ContentType = "application/json"
    $arguments.Body = ConvertTo-Json -InputObject $Body -Depth 20 -Compress
  }
  Invoke-RestMethod @arguments
}

function Assert-Settings {
  param($Actual, $Expected)
  foreach ($property in $Expected.PSObject.Properties) {
    if ($Actual.($property.Name) -cne $property.Value) {
      throw "Persisted settings mismatch for $($property.Name)."
    }
  }
}

function Assert-SeededState {
  param($Launch, [int]$ExpectedRank = 17)
  Assert-Settings (Invoke-AppApi $Launch "/settings") $seededSettings
  $guidance = Invoke-AppApi $Launch "/drafts/mock-draft/strategy-instructions"
  if (($guidance.instructions | ConvertTo-Json -Depth 20 -Compress) -cne $seededGuidance) {
    throw "Upgrade did not preserve saved strategy guidance."
  }
  $payload = Invoke-AppApi $Launch "/drafts/mock/state"
  if (($payload.rankingImportSummary | ConvertTo-Json -Depth 20 -Compress) -cne $seededImportSummary) {
    throw "Upgrade did not preserve the import summary and unmatched name."
  }
  $state = $payload.state
  $player = @($state.players | Where-Object { $_.id -eq $seedPlayer.id })
  if ($player.Count -ne 1 -or $player[0].importedRank -ne $ExpectedRank) {
    throw "Upgrade did not preserve the seeded ranking value."
  }
  $inventory = Invoke-AppApi $Launch "/data"
  if ($inventory.rankingImports -ne 1 -or $inventory.strategyInstructions -ne 1 -or $inventory.decisionSnapshots -lt 1) {
    throw "Upgrade lost seeded imports, guidance, or decision history."
  }
  $history = Invoke-AppApi $Launch "/drafts/mock-draft/decisions"
  if (($history | ConvertTo-Json -Depth 100 -Compress) -cne $seededHistory) {
    throw "Upgrade did not preserve decision history."
  }
}

function Assert-Redaction {
  param($Launch)
  $privateValues = @(
    $Launch.Token, $profileRoot, $env:USERNAME, $env:APPDATA, "%APPDATA%",
    $privatePathSegment, $seededSettings.codexBin, $guidanceText, $unmatchedName,
    $seedPlayer.id, $seedPlayer.name, "mock-draft", "team-3", $instructionId
  )
  foreach ($route in @("/diagnostics", "/data/support-report")) {
    $response = Invoke-WebRequest "$($Launch.Url)$route" -Headers $Launch.Headers -TimeoutSec 10
    $body = $response.Content.Replace('\\', '\')
    $payload = $response.Content | ConvertFrom-Json
    $diagnostics = if ($route -eq "/diagnostics") { $payload } else { $payload.diagnostics }
    if (-not $diagnostics.ok -or -not $diagnostics.settings.codexBinConfigured -or
        $diagnostics.storage.rankingImportRecords -ne 1 -or $diagnostics.storage.decisionSnapshots -lt 1) {
      throw "Redaction fixture is missing configured private data."
    }
    foreach ($value in $privateValues) {
      if ([string]::IsNullOrWhiteSpace($value)) { throw "Redaction fixture contains an empty private value." }
      if ($body.Contains($value, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Installed response redaction failed for $route. Private value omitted from log."
      }
    }
  }
  Write-Host "Installed diagnostics and support report omit token, profile, username, AppData, executable path, seeded names, identifiers, and guidance."
}

function Install-SmokeApp {
  param([string]$Installer)
  $install = Start-Process -FilePath $Installer -ArgumentList "/S /currentuser /D=$installDir" -PassThru
  $null = $install.Handle
  Wait-Until { $install.HasExited } "silent per-user installation" 90
  if ($install.ExitCode -ne 0) { throw "Installer exited with $($install.ExitCode)." }
}

function Get-PreviousInstaller {
  $releasesJson = & gh api --paginate --slurp "repos/$env:GITHUB_REPOSITORY/releases?per_page=100"
  if ($LASTEXITCODE -ne 0) { throw "Could not list published releases." }
  $previous = @($releasesJson | ConvertFrom-Json | ForEach-Object { $_ } | Where-Object {
    -not $_.draft -and $_.tag_name -ne "v$version" -and $_.tag_name -ne $version
  } | Sort-Object { [DateTimeOffset]$_.published_at } -Descending)[0]
  if (-not $previous) { throw "No previous published release exists for upgrade verification." }
  $installers = @($previous.assets | Where-Object { $_.name -match '^Sleeper[. ]Draft[. ]Assistant[. ]Setup[. ].+\.exe$' })
  if ($installers.Count -ne 1) { throw "Previous release must have exactly one NSIS installer." }
  $download = Join-Path $smokeRoot "previous"
  New-Item -ItemType Directory -Path $download -Force | Out-Null
  & gh release download $previous.tag_name --repo $env:GITHUB_REPOSITORY --dir $download `
    --pattern $installers[0].name --pattern "SHA256SUMS.txt"
  if ($LASTEXITCODE -ne 0) { throw "Previous release download failed." }
  $entries = @(Get-Content (Join-Path $download "SHA256SUMS.txt") | Where-Object {
    $_ -match ('^[a-fA-F0-9]{64}  ' + [regex]::Escape($installers[0].name) + '$')
  })
  $installerPath = Join-Path $download $installers[0].name
  if ($entries.Count -ne 1 -or
      (Get-FileHash $installerPath -Algorithm SHA256).Hash -ine $entries[0].Substring(0, 64)) {
    throw "Previous release installer checksum mismatch or missing checksum entry."
  }
  Write-Host "Verified previous published release $($previous.tag_name) against its SHA256SUMS.txt. Building $version."
  return $installerPath
}

function Test-OccupiedPort {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  foreach ($action in @("Retry", "Exit")) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
      $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
      $env:PORT = [string]$port
      $env:SLEEPER_AI_API_TOKEN = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
      Remove-Item -LiteralPath $rendererReadyPath -ErrorAction SilentlyContinue
      $process = Start-Process -FilePath $exe -PassThru
      $null = $process.Handle
      $processCondition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $process.Id)
      $script:recoveryButton = $null
      Wait-Until {
        if ($process.HasExited) { throw "Occupied-port launch exited before showing recovery." }
        $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
          [System.Windows.Automation.TreeScope]::Children, $processCondition)
        foreach ($window in $windows) {
          $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
          $names = @($elements | ForEach-Object { $_.Current.Name })
          if ($names -contains "Another service is using the local API port. Close the other Sleeper window or service, then retry.") {
            $script:recoveryButton = $elements | Where-Object { $_.Current.Name -eq $action } | Select-Object -First 1
          }
        }
        $null -ne $script:recoveryButton
      } "native occupied-port Retry/Exit dialog" 30
      if (Test-Path -LiteralPath $rendererReadyPath) { throw "Occupied port incorrectly opened the renderer." }
      $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $process.Id -and $_.CommandLine -like '*api-server.mjs*' })
      if ($children.Count -ne 0) { throw "Occupied-port recovery left an owned API process." }
      if ($action -eq "Retry") { $listener.Stop() }
      $pattern = $script:recoveryButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $pattern.Invoke()
      if ($action -eq "Retry") {
        Wait-Until { Test-Path -LiteralPath $rendererReadyPath } "renderer after native Retry" 60
        $launch = [pscustomobject]@{
          Process = $process
          Port = $port
          Url = "http://127.0.0.1:$port"
          Headers = @{ Authorization = "Bearer $env:SLEEPER_AI_API_TOKEN" }
        }
        if (-not (Invoke-AppApi $launch "/diagnostics").ok) { throw "Retry did not recover authenticated API." }
        Stop-SmokeApp $launch
      } else {
        Wait-Until {
          $process.HasExited -and @(Get-Process -Name "Sleeper Draft Assistant" -ErrorAction SilentlyContinue).Count -eq 0
        } "native Exit and all app processes to stop" 20
        $remaining = @(Get-NetTCPConnection -LocalPort $port -State Listen)
        if ($remaining.Count -ne 1 -or $remaining[0].OwningProcess -ne $PID) {
          throw "Exit disturbed the unrelated listener."
        }
      }
      Write-Host "Occupied-port native $action passed without an empty renderer, owned API leak, or unrelated process termination."
    } finally {
      $listener.Stop()
    }
  }
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
  Install-SmokeApp (Get-PreviousInstaller)
  $old = Start-SmokeApp $exe -PreviousRelease
  $privatePathSegment = "sda-private-codex-" + [guid]::NewGuid().ToString("N")
  $seededSettings = Invoke-AppApi $old "/settings" Put @{
    codexWebSearch = $false
    codexTimeoutMs = 75000
    codexServiceTier = "default"
    aiSetupAcknowledged = $true
    codexBin = (Join-Path $profileRoot "$privatePathSegment/codex.exe")
  }
  $guidanceText = "Private upgrade guidance " + [guid]::NewGuid().ToString("N")
  $guidance = Invoke-AppApi $old "/drafts/mock-draft/strategy-instructions" Post @{ text = $guidanceText; scope = "draft" }
  $seededGuidance = $guidance.instructions | ConvertTo-Json -Depth 20 -Compress
  $instructionId = @($guidance.instructions)[0].id
  $seedPlayer = (Invoke-AppApi $old "/drafts/mock/state").state.players[0]
  $unmatchedName = "Private unmatched " + [guid]::NewGuid().ToString("N")
  $imported = Invoke-AppApi $old "/drafts/mock-draft/rankings/import" Post @{
    source = "fantasypros"
    scoring = "PPR"
    csvText = "RK,TIERS,PLAYER NAME,TEAM,POS`n17,2,$($seedPlayer.name),$($seedPlayer.team),$($seedPlayer.position)1`n18,2,$unmatchedName,BUF,QB2"
  }
  if ($imported.summary.matched -ne 1 -or $imported.summary.unmatched[0].name -ne $unmatchedName) {
    throw "Synthetic ranking seed was not imported."
  }
  $seededImportSummary = $imported.summary | ConvertTo-Json -Depth 20 -Compress
  $seededHistory = Invoke-AppApi $old "/drafts/mock-draft/decisions" | ConvertTo-Json -Depth 100 -Compress
  Assert-SeededState $old
  Stop-SmokeApp $old
  Install-SmokeApp $installer
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
  Assert-SeededState $first
  Write-Host "Upgrade preserved every setting, saved guidance, synthetic ranking value, and complete decision history through authenticated API reads."
  Assert-Redaction $first

  $cleared = Invoke-AppApi $first "/data/strategy-instructions" Delete
  if ($cleared.deleted -ne 1 -or $cleared.inventory.strategyInstructions -ne 0) {
    throw "Category clear did not remove saved guidance."
  }
  Stop-SmokeApp $first
  $second = Start-SmokeApp $exe
  if (@((Invoke-AppApi $second "/drafts/mock-draft/strategy-instructions").instructions).Count -ne 0) {
    throw "Category clear did not persist across relaunch."
  }
  Assert-Settings (Invoke-AppApi $second "/settings") $seededSettings
  $remaining = Invoke-AppApi $second "/data"
  if ($remaining.rankingImports -ne 1 -or $remaining.decisionSnapshots -lt 1) {
    throw "Category clear removed unrelated seeded data."
  }
  Write-Host "Category clear persisted across relaunch and retained unrelated settings, imports, and history."
  $null = Invoke-AppApi $second "/drafts/mock-draft/strategy-instructions" Post @{ text = $guidanceText; scope = "draft" }
  $reset = Invoke-AppApi $second "/data/reset" Post @{ confirmation = "DELETE ALL LOCAL DATA" }
  $defaultSettings = $reset.settings
  if (-not $defaultSettings.codexWebSearch -or $defaultSettings.codexTimeoutMs -ne 60000 -or
      $defaultSettings.codexBin -ne "codex" -or $defaultSettings.aiSetupAcknowledged -or
      $defaultSettings.codexServiceTier -ne "fast" -or $defaultSettings.aiProvider -ne "noop" -or
      $defaultSettings.automaticAiAudit -ne "off") {
    throw "Reset did not restore expected defaults."
  }
  Stop-SmokeApp $second
  $afterReset = Start-SmokeApp $exe
  Assert-Settings (Invoke-AppApi $afterReset "/settings") $defaultSettings
  $inventory = Invoke-AppApi $afterReset "/data"
  foreach ($category in @("rankingImports", "seasonProjectionImports", "adpImports", "rosRankingImports",
      "weeklyProjectionImports", "decisionSnapshots", "draftPlans", "strategyInstructions")) {
    if ($inventory.$category -ne 0) { throw "Reset did not persist for $category." }
  }
  $resetState = (Invoke-AppApi $afterReset "/drafts/mock/state").state
  if (@($resetState.players | Where-Object { ($_.PSObject.Properties["importedRank"] -and $null -ne $_.importedRank) }).Count -ne 0 -or
      @((Invoke-AppApi $afterReset "/drafts/mock-draft/strategy-instructions").instructions).Count -ne 0) {
    throw "Reset retained seeded draft data."
  }
  $null = Invoke-AppApi $afterReset "/settings" Put @{ codexWebSearch = $false; codexTimeoutMs = 75000 }
  Stop-SmokeApp $afterReset
  Write-Host "Full reset persisted across relaunch. Renderer mounted, all data categories are empty, defaults returned, and settings remain writable."
  Test-OccupiedPort
  $retainedProfileMarker = Join-Path $profileRoot "installer-smoke-retained"
  Set-Content -LiteralPath $retainedProfileMarker -Value ([guid]::NewGuid().ToString("N"))
  $markerHash = (Get-FileHash -LiteralPath $retainedProfileMarker -Algorithm SHA256).Hash
  $databaseHash = (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash

  Start-Process -FilePath $uninstaller -ArgumentList "/S /currentuser"
  Wait-Until {
    -not (Test-Path -LiteralPath $installDir) -and
      @($shortcuts | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0 -and
      -not (Test-Path -LiteralPath $registration[0].PSPath)
  } "uninstall to remove installation and shortcuts" 90
  if (-not (Test-Path -LiteralPath $retainedProfileMarker) -or
      (Get-FileHash -LiteralPath $retainedProfileMarker -Algorithm SHA256).Hash -ne $markerHash -or
      (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash -ne $databaseHash) {
    throw "Uninstall removed profile data or changed the database."
  }
  Write-Host "Uninstall removed install directory, both shortcuts, and HKCU registration. The profile marker and an unchanged database were retained."

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
