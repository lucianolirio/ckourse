<#
.SYNOPSIS
    Gera um build portatil do ckourse para Windows (executavel + dependencias).

.DESCRIPTION
    1. Verifica Node, npm, Rust/cargo e NASM.
    2. Instala as dependencias npm (pule com -SkipNpmInstall).
    3. Copia ffmpeg/ffprobe de node_modules para src-tauri\binaries.
    4. Compila o app em modo release (sem instaladores).
    5. Copia ckourse.exe, ffmpeg.exe, ffprobe.exe e licenses\ para a pasta de saida.

.PARAMETER OutputDir
    Pasta de destino. Padrao: C:\publish\ckourse

.PARAMETER SkipNpmInstall
    Nao executa "npm install" (use quando node_modules ja estiver atualizado).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\publish-windows.ps1

.EXAMPLE
    .\scripts\publish-windows.ps1 -OutputDir D:\apps\ckourse -SkipNpmInstall
#>
[CmdletBinding()]
param(
    [string]$OutputDir = 'C:\publish\ckourse',
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tauriDir = Join-Path $repo 'src-tauri'
$releaseDir = Join-Path $tauriDir 'target\release'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Step([string]$msg) {
    Write-Host ''
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Invoke-Native([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Falhou (codigo $LASTEXITCODE): $exe $($arguments -join ' ')"
    }
}

function Assert-Command([string]$name, [string]$hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "'$name' nao encontrado no PATH. $hint"
    }
}

Push-Location $repo
try {
    # ---------------------------------------------------------------- 1. Pre-requisitos
    Write-Step 'Verificando pre-requisitos'
    Assert-Command 'node.exe'  'Instale o Node.js: winget install OpenJS.NodeJS.LTS'
    Assert-Command 'npm.cmd'   'Instale o Node.js: winget install OpenJS.NodeJS.LTS'
    Assert-Command 'cargo.exe' 'Instale o Rust: winget install Rustlang.Rustup'
    Write-Host "  node  $(node --version)"
    Write-Host "  $(cargo --version)"

    # aws-lc-sys (usado pelo SDK S3) precisa do NASM para compilar no Windows.
    if (-not (Get-Command 'nasm' -ErrorAction SilentlyContinue)) {
        $nasmDirs = @(
            (Join-Path $env:LOCALAPPDATA 'Programs\NASM'),
            (Join-Path $env:LOCALAPPDATA 'bin\NASM'),   # padrao do instalador por usuario
            (Join-Path $env:ProgramFiles 'NASM')
        )
        $found = $nasmDirs | Where-Object { Test-Path (Join-Path $_ 'nasm.exe') } | Select-Object -First 1
        if ($found) {
            $env:Path = "$found;$env:Path"
        }
        else {
            Write-Warning 'NASM nao encontrado; usando objetos pre-compilados do aws-lc-sys (AWS_LC_SYS_PREBUILT_NASM=1).'
            Write-Warning 'Para instalar: winget install NASM.NASM'
            $env:AWS_LC_SYS_PREBUILT_NASM = '1'
        }
    }
    if (Get-Command 'nasm' -ErrorAction SilentlyContinue) {
        Write-Host "  $(nasm -v)"
    }

    # ---------------------------------------------------------------- 2. npm install
    if ($SkipNpmInstall) {
        Write-Step 'Pulando npm install (-SkipNpmInstall)'
        if (-not (Test-Path (Join-Path $repo 'node_modules'))) {
            throw 'node_modules nao existe; rode sem -SkipNpmInstall.'
        }
    }
    else {
        Write-Step 'Instalando dependencias npm'
        Invoke-Native 'npm.cmd' @('install', '--no-audit', '--no-fund')
    }

    # ---------------------------------------------------------------- 3. ffmpeg / ffprobe
    # Equivalente ao ramo Windows de scripts/download-ffmpeg.sh.
    Write-Step 'Preparando ffmpeg e ffprobe'
    $binDir = Join-Path $tauriDir 'binaries'
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Get-ChildItem $binDir -File | Where-Object { $_.Name -like 'ffmpeg-*' -or $_.Name -like 'ffprobe-*' } | Remove-Item -Force

    $sidecars = @(
        @{ From = 'node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe'; To = 'ffprobe-x86_64-pc-windows-msvc.exe' },
        @{ From = 'node_modules\ffmpeg-static\ffmpeg.exe';                  To = 'ffmpeg-x86_64-pc-windows-msvc.exe' }
    )
    foreach ($s in $sidecars) {
        $src = Join-Path $repo $s.From
        if (-not (Test-Path $src)) {
            throw "Binario nao encontrado: $src (o npm install terminou corretamente?)"
        }
        Copy-Item $src (Join-Path $binDir $s.To) -Force
        Write-Host "  $($s.To)"
    }

    # ---------------------------------------------------------------- 4. Build
    # --no-bundle: gera so o executavel; sem instaladores, sem assinatura do updater.
    Write-Step 'Compilando (release)'
    Invoke-Native 'npx.cmd' @('tauri', 'build', '--no-bundle')

    # ---------------------------------------------------------------- 5. Publicar
    Write-Step "Copiando para $OutputDir"
    $exeOut = Join-Path $OutputDir 'ckourse.exe'
    $running = Get-Process -Name 'ckourse' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and ($_.Path -ieq $exeOut) }
    if ($running) {
        throw "O ckourse esta aberto a partir de $OutputDir. Feche o app e rode novamente."
    }

    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
    foreach ($f in @('ckourse.exe', 'ffmpeg.exe', 'ffprobe.exe')) {
        $src = Join-Path $releaseDir $f
        if (-not (Test-Path $src)) {
            throw "Arquivo esperado do build nao encontrado: $src"
        }
        Copy-Item $src (Join-Path $OutputDir $f) -Force
    }

    # Licencas do FFmpeg (exigidas para redistribuir os binarios).
    $licOut = Join-Path $OutputDir 'licenses'
    if (Test-Path $licOut) { Remove-Item $licOut -Recurse -Force }
    Copy-Item (Join-Path $tauriDir 'licenses') $licOut -Recurse -Force

    # ---------------------------------------------------------------- Resumo
    $version = (Get-Content (Join-Path $tauriDir 'tauri.conf.json') -Raw | ConvertFrom-Json).version
    Write-Step "Pronto: ckourse v$version em $([int]$sw.Elapsed.TotalMinutes)m$($sw.Elapsed.Seconds)s"
    Get-ChildItem $OutputDir -Recurse -File |
        Select-Object @{ n = 'Arquivo'; e = { $_.FullName.Substring($OutputDir.TrimEnd('\').Length + 1) } },
                      @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } } |
        Format-Table -AutoSize | Out-String | Write-Host
}
finally {
    Pop-Location
}
