param(
  [string]$Tag = $env:GITHUB_REF_NAME,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$output = Resolve-Path "build/windows-candidate/files"
$manifest = Get-Content build/windows-candidate/candidate-hashes.json | ConvertFrom-Json
$artifactPaths = @($manifest.artifacts | ForEach-Object { Join-Path $output $_.name })
$artifactPaths += Join-Path $output "SHA256SUMS.txt"
$releaseJson = & gh release view $Tag --json assets 2>$null
$exists = $LASTEXITCODE -eq 0
$pendingPaths = @()
if ($exists) {
  $release = $releaseJson | ConvertFrom-Json
  foreach ($path in $artifactPaths) {
    $name = (Split-Path -Leaf $path).Replace(" ", ".")
    $assets = @($release.assets | Where-Object { $_.name -ceq $name })
    if ($assets.Count -eq 0) {
      $pendingPaths += $path
      continue
    }
    $asset = $assets[0]
    $digest = if ($asset.PSObject.Properties["digest"]) { $asset.digest } else { $null }
    if ($digest -notmatch '^sha256:[0-9a-fA-F]{64}$') {
      $directory = New-Item -ItemType Directory -Path (Join-Path ".tmp" ([Guid]::NewGuid().ToString())) -Force
      $download = Join-Path $directory "existing-asset"
      try {
        & gh api $asset.apiUrl -H "Accept: application/octet-stream" > $download
        if ($LASTEXITCODE -ne 0) { throw "Could not hash existing release asset $name." }
        $digest = "sha256:$((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash)"
      } finally {
        Remove-Item -LiteralPath $directory -Recurse -Force
      }
    }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    if ($digest -ine "sha256:$hash") {
      throw "Refusing to replace published asset $name with different SHA-256 bytes. Use a new version and tag."
    }
    Write-Host "Existing release asset $name has matching SHA-256. Keeping published bytes."
  }
}
if ($DryRun) {
  Write-Host "Release publication dry run passed. No release or asset was changed."
  return
}
if ($exists) {
  if ($pendingPaths.Count -eq 0) {
    Write-Host "All release assets already match. Nothing to upload."
    return
  }
  & gh release upload $Tag @pendingPaths
} else {
  $isPrerelease = $Tag.Contains("-").ToString().ToLowerInvariant()
  $notesPath = "docs/releases/$($Tag.TrimStart('v')).md"
  $notesArgs = @()
  if (Test-Path $notesPath) { $notesArgs = @("--notes-file", $notesPath) }
  & gh release create $Tag @artifactPaths `
    --title "Sleeper Draft Assistant $Tag" `
    --generate-notes `
    "--prerelease=$isPrerelease" `
    --verify-tag @notesArgs
}
if ($LASTEXITCODE -ne 0) { throw "GitHub release publication failed." }
