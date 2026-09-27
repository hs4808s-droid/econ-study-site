# Windows 로그인 시 watch.mjs를 콘솔 창 없이 자동 실행하도록 등록합니다.
# 작업 스케줄러(관리자 권한 필요)가 아니라, 사용자별 시작프로그램 폴더 방식을 사용합니다.

$ErrorActionPreference = 'Stop'
$projectRoot = 'C:\Users\KMI\dev\econ-study-site'
$vbsSource = Join-Path $projectRoot 'scripts\run-watch-hidden.vbs'

if (-not (Test-Path $vbsSource)) {
    throw "런처 스크립트를 찾을 수 없습니다: $vbsSource"
}

$startupDir = [Environment]::GetFolderPath('Startup')
$dest = Join-Path $startupDir 'econ-study-watch.vbs'

Copy-Item -Path $vbsSource -Destination $dest -Force

Write-Host "자동 시작 등록 완료." -ForegroundColor Green
Write-Host "등록 위치: $dest"
Write-Host "다음 로그인부터 콘솔 창 없이 watch.mjs가 자동 실행됩니다."
Write-Host ""
Write-Host "지금 바로 실행하려면:"
Write-Host "  wscript.exe `"$vbsSource`""
