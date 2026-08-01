@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem ================================================================
rem TURBO LANCHES - CORRIGIR TELA BRANCA DO LOVABLE
rem Versao 4 - sem PowerShell embutido e sem erro de parser.
rem Este arquivo grava SOMENTE as variaveis publicas do Supabase.
rem ================================================================

set "REPO_URL=https://github.com/wandersonmonteiro931-byte/turbolanches.git"
set "BRANCH=main"
set "BASE_DIR=%~dp0"
set "PROJECT_DIR="

set "PUBLIC_SUPABASE_PROJECT_ID=kyoyfsxgqmlxwtnmtbuh"
set "PUBLIC_SUPABASE_URL=https://kyoyfsxgqmlxwtnmtbuh.supabase.co"
set "PUBLIC_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5b3lmc3hncW1seHd0bm10YnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTQyNDQsImV4cCI6MjA4NzQ3MDI0NH0.MPUhmTlh4EyH-ALeBgdlN8bphen6c6Lopt87EE7qShc"

if exist "%BASE_DIR%turbolanches-main\package.json" set "PROJECT_DIR=%BASE_DIR%turbolanches-main"
if exist "%BASE_DIR%package.json" set "PROJECT_DIR=%BASE_DIR%"

if not defined PROJECT_DIR (
    echo.
    echo [ERRO] Nao encontrei o projeto Turbo Lanches.
    echo Deixe este BAT ao lado da pasta turbolanches-main
    echo ou dentro da propria pasta do projeto.
    goto :falha
)

cd /d "%PROJECT_DIR%"
if errorlevel 1 goto :falha

title Turbo Lanches - Corrigir Supabase no Lovable
cls
echo ================================================================
echo       CORRIGIR TELA BRANCA DO LOVABLE - SUPABASE URL
echo ================================================================
echo.
echo Pasta do projeto:
echo %PROJECT_DIR%
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Git for Windows nao esta instalado.
    echo Instale em https://git-scm.com/download/win
    goto :falha
)

call :configurar_usuario_git
if errorlevel 1 goto :falha

echo [1/7] Recriando o .env com SOMENTE dados publicos do Supabase...
call :configurar_usuario_git
for /f "delims=" %%A in ('git config --global user.name 2^>nul') do set "GIT_NAME=%%A"
if not defined GIT_NAME (
    set /p "GIT_NAME=Digite seu nome para o Git: "
    if not defined GIT_NAME set "GIT_NAME=Wanderson Monteiro"
    git config --global user.name "%GIT_NAME%"
    if errorlevel 1 exit /b 1
)

for /f "delims=" %%A in ('git config --global user.email 2^>nul') do set "GIT_EMAIL=%%A"
if not defined GIT_EMAIL (
    set /p "GIT_EMAIL=Digite o e-mail usado no GitHub: "
    if not defined GIT_EMAIL exit /b 1
    git config --global user.email "%GIT_EMAIL%"
    if errorlevel 1 exit /b 1
)
exit /b 0

:gravar_env_publico
if errorlevel 1 goto :falha

echo [OK] VITE_SUPABASE_URL restaurada.
echo [OK] VITE_SUPABASE_PUBLISHABLE_KEY restaurada.

echo [2/7] Preparando a conexao com o GitHub...
if not exist ".git\" call :preparar_git
if errorlevel 1 goto :falha

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin "%REPO_URL%"
) else (
    git remote set-url origin "%REPO_URL%"
)

git fetch origin "%BRANCH%"
if errorlevel 1 goto :falha

git checkout "%BRANCH%" >nul 2>&1
if errorlevel 1 git checkout -b "%BRANCH%" "origin/%BRANCH%" >nul 2>&1
if errorlevel 1 goto :falha

git config core.autocrlf false
git config core.safecrlf false

echo [3/7] Adicionando o .env publico ao GitHub...
git add -f -- .env
if errorlevel 1 goto :falha

echo [4/7] Criando um commit para forcar a nova compilacao...
git diff --cached --quiet -- .env
if errorlevel 1 (
    git commit -m "Corrige Supabase URL e chave publica no Lovable"
) else (
    git commit --allow-empty -m "Forca nova compilacao do Supabase no Lovable"
)
if errorlevel 1 goto :falha

echo [5/7] Juntando alteracoes recentes do GitHub e Lovable...
git pull --rebase origin "%BRANCH%"
if errorlevel 1 (
    echo.
    echo [ERRO] O Git encontrou conflito durante a atualizacao.
    echo Execute: git rebase --abort
    goto :falha
)

echo [6/7] Enviando a correcao ao GitHub...
git push -u origin "%BRANCH%"
if errorlevel 1 goto :falha

echo [7/7] Envio concluido.
echo.
echo [SUCESSO] As variaveis publicas do Supabase foram restauradas.
echo Aguarde o Lovable sincronizar e depois pressione Ctrl + Shift + R.
goto :sucesso

:gravar_env_publico
>".env" echo VITE_SUPABASE_PROJECT_ID=%PUBLIC_SUPABASE_PROJECT_ID%
>>".env" echo VITE_SUPABASE_URL=%PUBLIC_SUPABASE_URL%
>>".env" echo VITE_SUPABASE_PUBLISHABLE_KEY=%PUBLIC_SUPABASE_KEY%
if not exist ".env" exit /b 1
findstr /B /C:"VITE_SUPABASE_URL=" ".env" >nul 2>&1
if errorlevel 1 exit /b 1
findstr /B /C:"VITE_SUPABASE_PUBLISHABLE_KEY=" ".env" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:preparar_git
set "TEMP_CLONE=%TEMP%\turbolanches_fix_%RANDOM%%RANDOM%"
if exist "%TEMP_CLONE%\" rmdir /S /Q "%TEMP_CLONE%" >nul 2>&1

git clone --branch "%BRANCH%" --single-branch "%REPO_URL%" "%TEMP_CLONE%"
if errorlevel 1 (
    if exist "%TEMP_CLONE%\" rmdir /S /Q "%TEMP_CLONE%" >nul 2>&1
    exit /b 1
)

robocopy "%TEMP_CLONE%\.git" "%PROJECT_DIR%\.git" /E /R:1 /W:1 /NFL /NDL /NJH /NJS >nul
set "ROBO_CODE=%ERRORLEVEL%"
rmdir /S /Q "%TEMP_CLONE%" >nul 2>&1
if %ROBO_CODE% GEQ 8 exit /b 1
exit /b 0

:sucesso
echo.
echo ================================================================
echo                     CORRECAO CONCLUIDA
echo ================================================================
echo.
pause
exit /b 0

:falha
echo.
echo ================================================================
echo                    CORRECAO NAO CONCLUIDA
echo ================================================================
echo.
pause
exit /b 1
