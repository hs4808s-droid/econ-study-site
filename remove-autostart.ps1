# setup-autostart.ps1으로 등록한 자동 시작을 해제합니다.

$startupDir = [Environment]::GetFolderPath('Startup')
$dest = Join-Path $startupDir 'econ-study-watch.vbs'

if (Test-Path $dest) {
    Remove-Item $dest -Force
    Write-Host "자동 시작 해제 완료." -ForegroundColor Green
} else {
    Write-Host "등록된 자동 시작이 없습니다." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "이미 실행 중인 watch.mjs 프로세스를 끄려면 작업 관리자에서 node.exe 프로세스를 종료하세요."
