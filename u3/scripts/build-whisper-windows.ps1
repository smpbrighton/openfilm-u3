#requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $IsWindows -or
    [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64 -or
    [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64) {
    throw 'Windows x64의 PowerShell x64에서만 빌드합니다.'
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cache = if ($env:OPENFILM_U3_BUILD_CACHE) { $env:OPENFILM_U3_BUILD_CACHE } else { Join-Path $repoRoot '.dev/whisper-build-windows' }
$out = Join-Path $repoRoot 'out'
New-Item -ItemType Directory -Force -Path $cache, $out | Out-Null

function Get-VerifiedDownload([string] $Uri, [string] $Path, [string] $Sha256) {
    if (-not (Test-Path -LiteralPath $Path)) {
        $partial = "$Path.part"
        Invoke-WebRequest -Uri $Uri -OutFile $partial -MaximumRetryCount 3 -RetryIntervalSec 5
        if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $Sha256) {
            Remove-Item -LiteralPath $partial
            throw "SHA-256이 다릅니다: $Uri"
        }
        Move-Item -LiteralPath $partial -Destination $Path
    }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Sha256) {
        throw "캐시 파일의 SHA-256이 다릅니다: $Path"
    }
}

$archive = Join-Path $cache 'whisper.cpp-v1.9.5.tar.gz'
Get-VerifiedDownload 'https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.9.5.tar.gz' $archive 'ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720'
# Extract and configure in a new directory so cached source/flags cannot affect this build.
$work = Join-Path $cache "work-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $work | Out-Null
& tar -xzf $archive -C $work
if ($LASTEXITCODE -ne 0) { throw '소스 tar 압축 해제에 실패했습니다.' }
$source = Join-Path $work 'whisper.cpp-1.9.5'
$build = Join-Path $work 'build'

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsArgs = @('-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64')
$vsPath = & $vswhere @vsArgs -property installationPath
if ($LASTEXITCODE -ne 0 -or -not $vsPath) { throw 'Visual Studio C++ x64 도구를 찾지 못했습니다.' }
$vsVersion = & $vswhere @vsArgs -property installationVersion
if ($LASTEXITCODE -ne 0 -or -not $vsVersion) { throw 'Visual Studio 버전을 찾지 못했습니다.' }
$vsMajor = ([version] $vsVersion).Major
$capabilities = & cmake -E capabilities
if ($LASTEXITCODE -ne 0) { throw 'CMake generator 목록을 읽지 못했습니다.' }
$generator = @((($capabilities -join "`n") | ConvertFrom-Json).generators |
    Where-Object { $_.name -like "Visual Studio $vsMajor *" })
if ($generator.Count -ne 1) { throw "설치된 Visual Studio $vsMajor 용 CMake generator가 없습니다." }
$toolsVersion = (Get-Content -LiteralPath (Join-Path $vsPath 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt') -Raw).Trim()
$dumpbin = Join-Path $vsPath "VC/Tools/MSVC/$toolsVersion/bin/Hostx64/x64/dumpbin.exe"
if (-not (Test-Path -LiteralPath $dumpbin)) { throw "dumpbin을 찾지 못했습니다: $dumpbin" }

$configure = @(
    '-S', $source, '-B', $build, '-G', $generator[0].name, '-A', 'x64',
    "-DCMAKE_GENERATOR_INSTANCE=$vsPath",
    '-DBUILD_SHARED_LIBS=OFF',
    # v1.9.5 has cmake_minimum_required(VERSION 3.5); enable /MT before project().
    '-DCMAKE_POLICY_DEFAULT_CMP0091=NEW',
    '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded',
    '-DGGML_OPENMP=OFF', '-DGGML_NATIVE=OFF', '-DWHISPER_BUILD_TESTS=OFF'
)
& cmake @configure
if ($LASTEXITCODE -ne 0) { throw 'CMake 설정에 실패했습니다.' }
& cmake --build $build --config Release --target whisper-cli --parallel
if ($LASTEXITCODE -ne 0) { throw 'whisper-cli Release 빌드에 실패했습니다.' }
$binary = Join-Path $build 'bin/Release/whisper-cli.exe'
if (-not (Test-Path -LiteralPath $binary)) { throw "빌드 결과가 없습니다: $binary" }

$dump = & $dumpbin /dependents $binary
if ($LASTEXITCODE -ne 0) { throw 'dumpbin /dependents 검사에 실패했습니다.' }
$dump | Set-Content -LiteralPath (Join-Path $out 'whisper-cli-win32-x64.dumpbin.txt') -Encoding utf8
$dump | Write-Host
$dependencies = @($dump | ForEach-Object {
    if ($_ -match '^\s+([A-Za-z0-9_.-]+\.dll)\s*$') { $Matches[1] }
})
if ($dependencies.Count -eq 0) { throw 'dumpbin 출력에서 DLL 목록을 찾지 못했습니다.' }
# /MT must not import MSVCP*, VCRUNTIME*, VCOMP*, ucrtbase, or api-ms-win-crt-*.
$systemDlls = @(
    'KERNEL32.dll', 'ADVAPI32.dll', 'USER32.dll', 'SHELL32.dll',
    'OLE32.dll', 'OLEAUT32.dll', 'WS2_32.dll', 'BCRYPT.dll',
    'NTDLL.dll', 'SHLWAPI.dll', 'VERSION.dll', 'WINMM.dll',
    'GDI32.dll', 'PSAPI.dll', 'RPCRT4.dll'
)
$unexpected = @($dependencies | Where-Object { $_ -notin $systemDlls })
if ($unexpected.Count -gt 0) {
    throw "Windows 시스템 DLL 이외 의존성이 있습니다: $($unexpected -join ', '). /MT 빌드에는 동적 CRT 의존성이 없어야 합니다."
}

$model = Join-Path $cache 'ggml-tiny.bin'
# Official models/download-ggml-model.sh host; pin both the HF revision and bytes.
Get-VerifiedDownload 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.bin' $model 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21'
$transcript = Join-Path $work 'jfk-smoke'
& $binary -m $model -f (Join-Path $source 'samples/jfk.wav') -l en --no-gpu -otxt -of $transcript
if ($LASTEXITCODE -ne 0) { throw 'jfk.wav smoke test 실행에 실패했습니다.' }
$text = Get-Content -LiteralPath "$transcript.txt" -Raw
if ($text -notmatch '(?i)\bask\s+not\b') { throw "smoke test 출력에 'ask not'이 없습니다: $text" }
Write-Host $text

# Only expose an executable after both dependency and transcription checks pass.
$outputBinary = Join-Path $out 'whisper-cli-win32-x64.exe'
Copy-Item -LiteralPath $binary -Destination $outputBinary
$sha256 = (Get-FileHash -LiteralPath $outputBinary -Algorithm SHA256).Hash.ToLowerInvariant()
$sha256Line = "$sha256  whisper-cli-win32-x64.exe"
$sha256Line | Set-Content -LiteralPath (Join-Path $out 'whisper-cli-win32-x64.exe.sha256') -Encoding utf8
Write-Host $sha256Line
