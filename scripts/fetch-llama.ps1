# Downloads the official llama.cpp Windows CPU build and copies llama-server.exe + its DLLs into -Dest.
# Used by the release and engine-test workflows. Set $env:LLAMA_TAG (e.g. "b7000") to pin a version.
param([string]$Dest = "src-tauri/llama")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$headers = @{ "User-Agent" = "myai-ci" }
if ($env:GH_TOKEN) { $headers.Authorization = "Bearer $env:GH_TOKEN" }
$api = if ($env:LLAMA_TAG) {
  "https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/$($env:LLAMA_TAG)"
} else {
  "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
}
$rel = Invoke-RestMethod -Uri $api -Headers $headers
$asset = $rel.assets | Where-Object { $_.name -match "bin-win-cpu-x64\.zip$" } | Select-Object -First 1
if (-not $asset) { throw "No Windows CPU x64 build in llama.cpp release $($rel.tag_name)" }
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
