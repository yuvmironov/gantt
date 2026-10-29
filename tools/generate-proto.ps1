$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$protoRoot = Join-Path $root "proto"
$generated = Join-Path $root "generated\proto"
New-Item -ItemType Directory -Path $generated -Force | Out-Null
$protos = Get-ChildItem -LiteralPath $protoRoot -Recurse -Filter *.proto | ForEach-Object { $_.FullName }
if (-not $protos) { throw "No .proto files found" }
npx --yes grpc-tools grpc_tools_node_protoc `
  -I $protoRoot `
  --js_out="import_style=commonjs,binary:$generated" `
  --grpc_out="grpc_js:$generated" `
  $protos
if ($LASTEXITCODE -ne 0) { throw "protoc failed" }
Write-Output "Generated into $generated"
