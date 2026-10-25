param(
  [string]$OutputDirectory = "apps/desktop/out-builder",
  [switch]$Record
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$output = (Resolve-Path $OutputDirectory).Path
$artifacts = @(Get-ChildItem $output -File | Where-Object {
  $_.Name -like "Sleeper Draft Assistant*" -and $_.Extension -in @(".exe", ".zip")
} | Sort-Object Name)
if ($artifacts.Count -lt 2) { throw "Missing candidate installer or portable executable." }
$hashes = @($artifacts | ForEach-Object {
  [pscustomobject]@{ name = $_.Name; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
})
if ($Record) {
  $json = ConvertTo-Json -InputObject $hashes -Compress
  "hashes=$json" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
  Write-Host "Recorded candidate hashes before running any smoke binary."
} else {
  if ([string]::IsNullOrWhiteSpace($env:SMOKE_CANDIDATE_HASHES)) { throw "Missing pre-smoke candidate hashes." }
  $expected = @(ConvertFrom-Json -InputObject $env:SMOKE_CANDIDATE_HASHES)
  if ($expected.Count -ne $hashes.Count) { throw "Candidate artifact set changed during smoke tests." }
  foreach ($artifact in $hashes) {
    $match = @($expected | Where-Object { $_.name -ceq $artifact.name -and $_.sha256 -ceq $artifact.sha256 })
    if ($match.Count -ne 1) { throw "Candidate artifact integrity failed for $($artifact.name)." }
  }
  Write-Host "Candidate artifact integrity verified against pre-smoke hashes before checksums and upload."
}
