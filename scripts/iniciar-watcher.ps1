# Sobe o vigia de handoff numa janela separada, sem prender o terminal.
# Sobrevive ao fechamento do terminal; NAO sobrevive a logoff nem a reboot —
# depois de reiniciar a maquina, rode de novo.
#
#   .\scripts\iniciar-watcher.ps1              # vigia de verdade
#   .\scripts\iniciar-watcher.ps1 -DryRun      # so registra o que faria
#   .\scripts\iniciar-watcher.ps1 -Parar       # encerra o vigia em execucao

param(
  [switch]$DryRun,
  [switch]$Parar
)

$raiz = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot 'watcher-handoff.mjs'
$arqPid = Join-Path $PSScriptRoot '.watcher.pid'

if ($Parar) {
  if (Test-Path $arqPid) {
    $alvo = Get-Content $arqPid
    try {
      Stop-Process -Id $alvo -Force -ErrorAction Stop
      Write-Host "Vigia $alvo encerrado."
    } catch {
      Write-Host "Nenhum processo $alvo em execucao."
    }
    Remove-Item $arqPid -Force
  } else {
    Write-Host 'Sem .watcher.pid: nada a encerrar.'
  }
  return
}

if (Test-Path $arqPid) {
  $antigo = Get-Content $arqPid
  if (Get-Process -Id $antigo -ErrorAction SilentlyContinue) {
    Write-Host "Vigia ja em execucao (pid $antigo). Use -Parar antes de subir outro."
    return
  }
}

$argumentos = @($script)
if ($DryRun) { $argumentos += '--dry-run' }

$proc = Start-Process node -ArgumentList $argumentos -WorkingDirectory $raiz -WindowStyle Hidden -PassThru
$proc.Id | Out-File -FilePath $arqPid -Encoding ascii

Write-Host "Vigia ativo (pid $($proc.Id))."
Write-Host "Log:     $(Join-Path $PSScriptRoot 'logs\watcher-handoff.log')"
Write-Host "Consumo: node scripts/watcher-handoff.mjs --relatorio"
