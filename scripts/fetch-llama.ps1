# Downloads the official llama.cpp Windows CPU build and copies llama-server.exe + its DLLs into -Dest.
# Used by the release and engine-test workflows. Set $env:LLAMA_TAG (e.g. "b7000") to pin a version.
param([string]$Dest = "src-tauri/llama")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
# Surface failures as GitHub annotations so they are visible without opening the log.
trap { Write-Host "::error title=fetch-llama::$($_.Exception.Message)"; exit 1 }

$headers = @{ "User-Agent" = "myai-ci" }
if ($env:GH_TOKEN) { $headers.Authorization = "Bearer $env:GH_TOKEN" }
$pattern = "bin-win-cpu-x64\.zip$"
if ($env:LLAMA_TAG) {
  $releases = @(Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/$($env:LLAMA_TAG)" -Headers $headers)
} else {
  # The "latest" release may not carry binaries (e.g. a nightly marker), so scan recent releases.
  $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=40" -Headers $headers
}
$rel = $null; $asset = $null
foreach ($r in $releases) {
  if ($r.draft) { continue }
  $a = $r.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1
  if ($a) { $rel = $r; $asset = $a; break }
}
if (-not $asset) {
  $seen = ($releases | Select-Object -First 5 | ForEach-Object { "$($_.tag_name): " + (($_.assets | Select-Object -First 6 | ForEach-Object { $_.name }) -join ",") }) -join " | "
  throw "No release with a Windows CPU x64 build found. Recent: $seen"
}
Write-Host "::notice title=llama.cpp::using $($rel.tag_name) / $($asset.name)"
Write-Host "llama.cpp $($rel.tag_name): $($asset.name)"

Invoke-WebRequest -Uri $asset.browser_download_url -OutFile llama.zip
$tmp = "llama-extract"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive llama.zip -DestinationPath $tmp
$server = Get-ChildItem $tmp -Recurse -Filter llama-server.exe | Select-Object -First 1
if (-not $server) { throw "llama-server.exe not found in $($asset.name)" }

New-Item -ItemType Directory -Force $Dest | Out-Null
Copy-Item $server.FullName $Dest -Force
Get-ChildItem $server.DirectoryName -Filter *.dll | Copy-Item -Destination $Dest -Force
Set-Content -Path (Join-Path $Dest "VERSION.txt") -Value "llama.cpp $($rel.tag_name) (MIT License) https://github.com/ggml-org/llama.cpp"
Remove-Item llama.zip, $tmp -Recurse -Force
Get-ChildItem $Dest | Format-Table Name, Length
