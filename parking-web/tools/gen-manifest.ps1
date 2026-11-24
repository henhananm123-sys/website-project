<#
  gen-manifest.ps1 - builds manifest.json from a folder of images
  (IoT camera simulation) for the parking-lot guard dashboard.

  Usage:
    powershell -ExecutionPolicy Bypass -File tools\gen-manifest.ps1 -ImagesDir "C:\parking\camera-drop\images"
  Optional:
    -OutFile "C:\parking\camera-drop\api\manifest.json"   (if Apache serves the manifest from a different path)

  Output: JSON array, newest first, UTF-8 without BOM:
    [ { "file": "car_2026-11-16_10-15-01.jpg", "ts": "2026-11-16T10:15:01" }, ... ]

  Note: kept ASCII-only on purpose - Windows PowerShell 5.1 reads .ps1 files
  without a BOM using the ANSI code page, which corrupts non-ASCII text.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ImagesDir,

  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ImagesDir)) {
  throw "Images folder not found: $ImagesDir"
}
if ($OutFile -eq "") {
  $OutFile = Join-Path $ImagesDir "manifest.json"
}

$exts = ".jpg", ".jpeg", ".png", ".webp", ".svg", ".bmp"

$items = foreach ($f in (Get-ChildItem -LiteralPath $ImagesDir -File |
                         Where-Object { $exts -contains $_.Extension.ToLowerInvariant() })) {

  # Timestamp extraction from the file name:
  #   Pattern A: *_YYYY-MM-DD_HH-MM-SS.*
  #   Pattern B: *_YYYYMMDD_HHMMSS.*
  $ts = $null
  if ($f.Name -match "(20\d{2})[-.](\d{2})[-.](\d{2})[_-](\d{2})[-.](\d{2})[-.](\d{2})") {
    $ts = New-Object System.DateTime([int]$Matches[1], [int]$Matches[2], [int]$Matches[3],
                                     [int]$Matches[4], [int]$Matches[5], [int]$Matches[6])
  }
  elseif ($f.Name -match "(20\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})") {
    $ts = New-Object System.DateTime([int]$Matches[1], [int]$Matches[2], [int]$Matches[3],
                                     [int]$Matches[4], [int]$Matches[5], [int]$Matches[6])
  }

  if ($ts) { $tsText = $ts.ToString("yyyy-MM-ddTHH:mm:ss") }
  else     { $tsText = $f.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ss") }

  [pscustomobject]@{ file = $f.Name; ts = $tsText }
}

$items = @($items | Sort-Object -Property @{ Expression = "ts"; Descending = $true })

# ConvertTo-Json unwraps a single-item array - handle it manually
if ($items.Count -eq 0) {
  $json = "[]"
}
elseif ($items.Count -eq 1) {
  $json = "[" + ($items | ConvertTo-Json -Depth 3) + "]"
}
else {
  $json = ConvertTo-Json -InputObject $items -Depth 3
}

[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("Created {0} entries in {1}" -f $items.Count, $OutFile)
