param(
    [int]$Quantidade = 0
)

Clear-Host

function Show-Tabela {
    param(
        [Parameter(Mandatory)] [object[]]$Dados,
        [Parameter(Mandatory)] [string[]]$Colunas,
        [string]$BranchAtual = $null
    )

    if (-not $Dados) { return }

    # Largura de cada coluna = maior valor entre cabeçalho e conteúdo
    $larguras = @{}
    foreach ($c in $Colunas) {
        $max = $c.Length
        foreach ($d in $Dados) {
            $v = [string]$d.$c
            if ($v.Length -gt $max) { $max = $v.Length }
        }
        $larguras[$c] = $max
    }

    # Cabeçalho
    $header = ($Colunas | ForEach-Object { $_.PadRight($larguras[$_]) }) -join ' │ '
    Write-Host $header -ForegroundColor White

    # Divisor (somente abaixo do cabeçalho)
    $divisor = ($Colunas | ForEach-Object { '─' * $larguras[$_] }) -join '─┼─'
    Write-Host $divisor

    # Linhas (sem divisão entre elas)
    foreach ($d in $Dados) {
        $linhaParts = @()

        foreach ($c in $Colunas) {
            $valor = ([string]$d.$c).PadRight($larguras[$c])
            $linhaParts += $valor
        }

        $linha = $linhaParts -join ' │ '

        # Se for a branch atual, pintar de amarelo
        if ($BranchAtual -and $d.Branch -like "* $BranchAtual") {
            Write-Host $linha -ForegroundColor Yellow
        }
        else {
            Write-Host $linha
        }
    }
}

$active = git branch --show-current

$branches = git for-each-ref --sort=-creatordate `
    --format="%(refname:short)|%(creatordate:format:%d/%m/%Y %H:%M)" `
    refs/heads/ |
ForEach-Object {
    $p = $_ -split '\|', 2

    [PSCustomObject]@{
        Branch   = if ($p[0] -eq $active) { "* $($p[0])" } else { "  $($p[0])" }
        CriadaEm = $p[1]
    }
}

if ($Quantidade -gt 0) {
    $branches = $branches | Select-Object -First $Quantidade
}

Show-Tabela -Dados $branches -Colunas 'Branch', 'CriadaEm' -BranchAtual $active

Write-Host ""
Write-Host "Arquivos .cs alterados vs origin/dev:" -ForegroundColor Cyan
Write-Host ""

$repoRoot = git rev-parse --show-toplevel

$devFiles = [System.Collections.Generic.HashSet[string]]::new(
    [string[]](git ls-tree -r origin/dev --name-only)
)

$arquivos = git diff --name-only origin/dev -- '*.cs' |
ForEach-Object {
    $fullPath = Join-Path $repoRoot $_
    $item = Get-Item $fullPath -ErrorAction SilentlyContinue
    $existeNoDev = $devFiles.Contains($_)

    [PSCustomObject]@{
        Arquivo = $_
        Status  = if (-not $existeNoDev) { 'Novo' }
        elseif ($item) { 'Alterado' }
        else { 'Removido' }
        Data    = if ($item) { $item.LastWriteTime } else { $null }
    }
} |
Sort-Object Data -Descending |
ForEach-Object {
    [PSCustomObject]@{
        Arquivo      = $_.Arquivo
        Status       = $_.Status
        ModificadoEm = if ($_.Data) { $_.Data.ToString('dd/MM/yyyy HH:mm') } else { '' }
    }
}


if ($arquivos) {
    Show-Tabela -Dados $arquivos -Colunas 'Arquivo', 'Status', 'ModificadoEm'
}
else {
    Write-Host "Nenhum arquivo .cs alterado." -ForegroundColor DarkGray
}

Write-Host ""