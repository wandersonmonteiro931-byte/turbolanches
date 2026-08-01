@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem ================================================================
rem TURBO LANCHES - ATUALIZAR GITHUB E LOVABLE
rem Versao 4:
rem - mantem o .env PUBLICO necessario ao Vite/Lovable;
rem - bloqueia .env privados, certificados e chaves;
rem - nao usa PowerShell embutido.
rem Execute fora ou dentro da pasta turbolanches-main.
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
    echo [ERRO] Nao encontrei o arquivo package.json.
    echo Deixe este BAT ao lado da pasta turbolanches-main
    echo ou dentro da propria pasta do projeto.
    goto :falha
)

cd /d "%PROJECT_DIR%"
if errorlevel 1 goto :falha

title Turbo Lanches - Enviar para GitHub e Lovable
cls
echo ================================================================
echo        TURBO LANCHES - ATUALIZAR GITHUB E LOVABLE
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

rem Garante que o frontend sempre tenha apenas as variaveis PUBLICAS.
echo [1/9] Conferindo configuracao publica do Supabase...
call :gravar_env_publico
if errorlevel 1 goto :falha

if not exist ".git\" (
    echo [2/9] Conectando esta pasta ao repositorio do GitHub...
    call :preparar_git
    if errorlevel 1 goto :falha
) else (
    echo [2/9] Repositorio Git encontrado.
)

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

echo [3/9] Branch %BRANCH% confirmada.
git config core.autocrlf false
git config core.safecrlf false

echo [4/9] Preparando arquivos alterados...
git add -A
if errorlevel 1 goto :falha

rem O .env da RAIZ e permitido porque foi recriado acima com apenas VITE_* publicas.
git add -f -- .env
if errorlevel 1 goto :falha

echo [5/9] Bloqueando arquivos realmente sensiveis...
for /f "usebackq delims=" %%F in (`git diff --cached --name-only`) do call :proteger_arquivo "%%F"
if errorlevel 1 goto :falha

git diff --cached --quiet
if errorlevel 1 (
    echo [6/9] Criando commit...
    git commit -m "Atualizacao automatica Turbo Lanches"
    if errorlevel 1 goto :falha
) else (
    echo [6/9] Nenhuma alteracao nova para criar commit.
)

echo [7/9] Baixando atualizacoes feitas no GitHub ou Lovable...
git pull --rebase origin "%BRANCH%"
if errorlevel 1 (
    echo.
    echo [ERRO] Houve conflito ao juntar as atualizacoes.
    echo Execute no terminal: git rebase --abort
    goto :falha
)

echo [8/9] Enviando para o GitHub...
git push -u origin "%BRANCH%"
if errorlevel 1 goto :falha

echo [9/9] Atualizacao enviada.
echo.
echo GitHub atualizado com sucesso.
echo O .env da raiz contem somente configuracoes publicas VITE_*.
echo Credenciais da Efi, certificados, service_role e chaves privadas

echo continuam fora do GitHub.
echo.
echo O Lovable sincronizara a branch main. Para atualizar a versao

echo publicada, abra o projeto e clique em Publish / Update.
goto :sucesso

:configurar_usuario_git
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
>".env" echo VITE_SUPABASE_PROJECT_ID=%PUBLIC_SUPABASE_PROJECT_ID%
>>".env" echo VITE_SUPABASE_URL=%PUBLIC_SUPABASE_URL%
>>".env" echo VITE_SUPABASE_PUBLISHABLE_KEY=%PUBLIC_SUPABASE_KEY%
if not exist ".env" exit /b 1
exit /b 0

:preparar_git
set "TEMP_CLONE=%TEMP%\turbolanches_clone_%RANDOM%%RANDOM%"
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

:proteger_arquivo
set "FILE=%~1"

rem A unica excecao e o .env exato na raiz do projeto.
if "%FILE%"==".env" exit /b 0

for %%B in ("%FILE%") do set "BASENAME=%%~nxB"
for %%B in ("%FILE%") do set "EXTENSION=%%~xB"

if /I "%BASENAME%"==".env.example" exit /b 0
if /I "%BASENAME%"==".env" goto :arquivo_sensivel

echo(%BASENAME%| findstr /I /B /C:".env." >nul 2>&1
if not errorlevel 1 goto :arquivo_sensivel

if /I "%EXTENSION%"==".p12" goto :arquivo_sensivel
if /I "%EXTENSION%"==".pfx" goto :arquivo_sensivel
if /I "%EXTENSION%"==".pem" goto :arquivo_sensivel
if /I "%EXTENSION%"==".key" goto :arquivo_sensivel
if /I "%EXTENSION%"==".crt" goto :arquivo_sensivel
if /I "%EXTENSION%"==".cer" goto :arquivo_sensivel
exit /b 0

:arquivo_sensivel
echo [PROTEGIDO] Nao sera enviado: %FILE%
git cat-file -e "HEAD:%FILE%" >nul 2>&1
if not errorlevel 1 (
    git rm --cached --ignore-unmatch -- "%FILE%" >nul 2>&1
) else (
    git restore --staged -- "%FILE%" >nul 2>&1
    if errorlevel 1 git reset HEAD -- "%FILE%" >nul 2>&1
)
exit /b 0

:sucesso
echo.
echo ================================================================
echo                 PROCESSO CONCLUIDO COM SUCESSO
echo ================================================================
echo.
pause
exit /b 0

:falha
echo.
echo ================================================================
echo                  PROCESSO NAO FOI CONCLUIDO
echo ================================================================
echo.
pause
exit /b 1
