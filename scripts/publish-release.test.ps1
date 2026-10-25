$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$publish = Join-Path $PSScriptRoot "publish-release.ps1"
$root = (Get-Location).Path
$fixture = Join-Path $root ".tmp/publish-test-$([Guid]::NewGuid())"
$files = New-Item -ItemType Directory -Path "$fixture/build/windows-candidate/files" -Force
$name = "Sleeper Draft Assistant Setup 1.2.3.exe"
[System.IO.File]::WriteAllText((Join-Path $files $name), "candidate")
[System.IO.File]::WriteAllText((Join-Path $files "SHA256SUMS.txt"), "checksums")
@{ artifacts = @(@{ name = $name }) } | ConvertTo-Json -Depth 3 |
  Set-Content "$fixture/build/windows-candidate/candidate-hashes.json"

$global:publishTest = @{ Calls = [System.Collections.Generic.List[string]]::new(); Assets = @(); Exists = $true }
function gh {
  $global:publishTest.Calls.Add(($args -join "|"))
  $global:LASTEXITCODE = 0
  if ($args[0] -eq "release" -and $args[1] -eq "view") {
    if (-not $global:publishTest.Exists) { $global:LASTEXITCODE = 1; return }
    return ConvertTo-Json -InputObject @{ assets = $global:publishTest.Assets } -Depth 4
  }
  if ($args[0] -eq "api") { return "existing bytes" }
}
function Assert-NoPublication {
  if (@($global:publishTest.Calls | Where-Object { $_ -match '^release\|(upload|create)\|' }).Count -ne 0) {
    throw "Guard published assets during a mismatch or dry run."
  }
}

try {
  Set-Location $fixture
  $global:publishTest.Assets = @($name, "SHA256SUMS.txt" | ForEach-Object {
    @{ name = $_.Replace(" ", "."); digest = "sha256:$((Get-FileHash -LiteralPath (Join-Path $files $_)).Hash)" }
  })
  & $publish -Tag "v1.2.3" -DryRun
  Assert-NoPublication
  Write-Host "PASS matching published hashes pass the dry run without publication."

  $global:publishTest.Calls.Clear()
  & $publish -Tag "v1.2.3"
  Assert-NoPublication
  Write-Host "PASS matching assets keep their published bytes."

  $global:publishTest.Calls.Clear()
  $global:publishTest.Assets = @($global:publishTest.Assets[1])
  & $publish -Tag "v1.2.3"
  $uploads = @($global:publishTest.Calls | Where-Object { $_ -match '^release\|upload\|' })
  if ($uploads.Count -ne 1 -or $uploads[0] -cne "release|upload|v1.2.3|$(Join-Path $files $name)") {
    throw "Expected only the missing asset to upload without clobber."
  }
  Write-Host "PASS only missing assets upload."

  $global:publishTest.Calls.Clear()
  $global:publishTest.Assets[0].digest = "sha256:$(('0' * 64))"
  $rejected = $false
  try { & $publish -Tag "v1.2.3" -DryRun } catch {
    if ($_.Exception.Message -notlike 'Refusing to replace published asset * with different SHA-256 bytes.*') { throw }
    $rejected = $true
  }
  if (-not $rejected) { throw "A mismatched asset passed the guard." }
  Assert-NoPublication
  Write-Host "PASS a mismatch rejects the entire publication, including earlier missing assets."

  $global:publishTest.Calls.Clear()
  [System.IO.File]::WriteAllText((Join-Path $files "SHA256SUMS.txt"), "existing bytes$([Environment]::NewLine)")
  $global:publishTest.Assets = @(@{ name = "SHA256SUMS.txt"; apiUrl = "repos/example/repo/releases/assets/1" })
  & $publish -Tag "v1.2.3" -DryRun
  Assert-NoPublication
  if (@($global:publishTest.Calls | Where-Object { $_ -like 'api|*' }).Count -ne 1) { throw "Missing digest did not download the existing asset." }
  Write-Host "PASS assets without API digests are downloaded and hashed."

  $global:publishTest.Calls.Clear()
  $global:publishTest.Exists = $false
  & $publish -Tag "v1.2.3" -DryRun
  Assert-NoPublication
  if ($LASTEXITCODE -ne 0) { throw "A successful dry run retained the missing-release exit code." }
  Write-Host "PASS missing-release dry runs return exit code zero."
} finally {
  Set-Location $root
  Remove-Item -LiteralPath $fixture -Recurse -Force
  Remove-Variable -Name publishTest -Scope Global
}
