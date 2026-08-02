@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
color 0A
title Turbo Lanches - Enviar para GitHub e Lovable

set "REPO_URL=https://github.com/wandersonmonteiro931-byte/turbolanches.git"
set "REPO_PAGE=https://github.com/wandersonmonteiro931-byte/turbolanches/commits/main"
set "BRANCH=main"
set "BASE_DIR=%~dp0"
set "PROJECT_DIR="

if exist "%BASE_DIR%package.json" set "PROJECT_DIR=%BASE_DIR:~0,-1%"
if not defined PROJECT_DIR if exist "%BASE_DIR%turbolanches-main\package.json" set "PROJECT_DIR=%BASE_DIR%turbolanches-main"
if not defined PROJECT_DIR if exist "%BASE_DIR%..\turbolanches-main\package.json" set "PROJECT_DIR=%BASE_DIR%..\turbolanches-main"

if not defined PROJECT_DIR (
  echo.
  echo [ERRO] Nao encontrei a pasta turbolanches-main.
  echo Extraia o ZIP inteiro e execute este arquivo na pasta extraida.
  echo.
  pause
  exit /b 1
)

for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"
set "LOG_FILE=%PROJECT_DIR%\ATUALIZACAO_GITHUB_LOG.txt"
set "SUCCESS_FILE=%PROJECT_DIR%\ULTIMO_ENVIO_GITHUB.txt"
set "WORK_DIR=%TEMP%\turbolanches_envio_%RANDOM%_%RANDOM%"

>"%LOG_FILE%" echo Turbo Lanches - inicio: %date% %time%

cls
echo ================================================================
echo       TURBO LANCHES - GITHUB E LOVABLE - CORRIGIDO
echo ================================================================
echo.
echo Projeto: %PROJECT_DIR%
echo Repositorio: %REPO_URL%
echo.

where git >nul 2>&1
if errorlevel 1 goto :NO_GIT

where robocopy >nul 2>&1
if errorlevel 1 goto :NO_ROBOCOPY

set "GIT_TERMINAL_PROMPT=1"
set "GCM_INTERACTIVE=always"

if not defined USERNAME set "USERNAME=Usuario"
for /f "delims=" %%A in ('git config --global user.name 2^>nul') do set "GIT_NAME=%%A"
for /f "delims=" %%A in ('git config --global user.email 2^>nul') do set "GIT_EMAIL=%%A"
if not defined GIT_NAME git config --global user.name "Wanderson Monteiro" >>"%LOG_FILE%" 2>&1
if not defined GIT_EMAIL git config --global user.email "wandersonmonteiro931-byte@users.noreply.github.com" >>"%LOG_FILE%" 2>&1

echo [1/7] Baixando a versao atual do GitHub...
>>"%LOG_FILE%" echo [1/7] git clone
git clone --branch "%BRANCH%" --single-branch "%REPO_URL%" "%WORK_DIR%" >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :CLONE_FAIL

if not exist "%WORK_DIR%\.git" goto :CLONE_FAIL

echo [2/7] Copiando o projeto atualizado...
>>"%LOG_FILE%" echo [2/7] robocopy
robocopy "%PROJECT_DIR%" "%WORK_DIR%" /MIR /R:2 /W:1 /COPY:DAT /DCOPY:DAT /XJ /NFL /NDL /NJH /NJS /NP /XD ".git" "node_modules" "dist" "dist-ssr" ".next" ".cache" ".vite" /XF ".env" ".env.*" "*.p12" "*.pfx" "*.pem" "*.key" "*.crt" "*.cer" "ATUALIZACAO_GITHUB_LOG.txt" "ULTIMO_ENVIO_GITHUB.txt" >>"%LOG_FILE%" 2>&1
if errorlevel 8 goto :COPY_FAIL

rem Restaura apenas arquivos de exemplo permitidos.
if exist "%PROJECT_DIR%\.env.example" copy /Y "%PROJECT_DIR%\.env.example" "%WORK_DIR%\.env.example" >nul
if exist "%PROJECT_DIR%\supabase\.env.example" (
  if not exist "%WORK_DIR%\supabase" mkdir "%WORK_DIR%\supabase" >nul 2>&1
  copy /Y "%PROJECT_DIR%\supabase\.env.example" "%WORK_DIR%\supabase\.env.example" >nul
)

rem Remove qualquer credencial que possa ter escapado da copia.
for /r "%WORK_DIR%" %%F in (.env*) do (
  if /I not "%%~nxF"==".env.example" del /f /q "%%~fF" >nul 2>&1
)
for %%E in (p12 pfx pem key crt cer) do (
  for /r "%WORK_DIR%" %%F in (*.%%E) do del /f /q "%%~fF" >nul 2>&1
)

echo [3/7] Preparando os arquivos...
cd /d "%WORK_DIR%"
git config core.autocrlf false >>"%LOG_FILE%" 2>&1
git add -A >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :ADD_FAIL

git diff --cached --quiet
if errorlevel 2 goto :DIFF_FAIL
if not errorlevel 1 goto :NO_CHANGES

echo [4/7] Criando o commit...
set "COMMIT_MESSAGE=Atualiza Turbo Lanches %date% %time:~0,5%"
git commit -m "%COMMIT_MESSAGE%" >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :COMMIT_FAIL

echo [5/7] Atualizando a branch main antes do envio...
git pull --rebase origin "%BRANCH%" >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :PULL_FAIL

echo [6/7] Enviando para o GitHub...
git push origin "%BRANCH%" >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :PUSH_FAIL

echo [7/7] Confirmando o commit no GitHub...
for /f "delims=" %%H in ('git rev-parse HEAD 2^>nul') do set "LOCAL_HASH=%%H"
for /f "tokens=1" %%H in ('git ls-remote origin "refs/heads/%BRANCH%" 2^>nul') do set "REMOTE_HASH=%%H"

if not defined LOCAL_HASH goto :VERIFY_FAIL
if not defined REMOTE_HASH goto :VERIFY_FAIL
if /I not "%LOCAL_HASH%"=="%REMOTE_HASH%" goto :VERIFY_FAIL

>"%SUCCESS_FILE%" (
  echo ENVIO CONFIRMADO PELO GITHUB
  echo Data: %date% %time%
  echo Repositorio: %REPO_URL%
  echo Branch: %BRANCH%
  echo Commit: %LOCAL_HASH%
  echo.
  echo O Lovable sincroniza este commit somente se o projeto estiver conectado
  echo ao mesmo repositorio e a branch main.
)

if exist "%WORK_DIR%" rd /s /q "%WORK_DIR%" >nul 2>&1

cls
echo ================================================================
echo       ENVIO CONFIRMADO PELO GITHUB COM SUCESSO
echo ================================================================
echo.
echo Commit confirmado: %LOCAL_HASH%
echo.
echo O Lovable deve sincronizar a branch main automaticamente.
echo Se a versao publicada nao mudar, abra o Lovable e clique em Publish.
echo.
echo Abrindo o historico do GitHub para conferencia...
start "" "%REPO_PAGE%"
echo.
pause
exit /b 0

:NO_CHANGES
for /f "delims=" %%H in ('git rev-parse HEAD 2^>nul') do set "LOCAL_HASH=%%H"
>"%SUCCESS_FILE%" (
  echo NENHUMA ALTERACAO PARA ENVIAR
  echo Data: %date% %time%
  echo Commit atual: %LOCAL_HASH%
)
if exist "%WORK_DIR%" rd /s /q "%WORK_DIR%" >nul 2>&1
cls
echo ================================================================
echo       O GITHUB JA POSSUI OS MESMOS ARQUIVOS
echo ================================================================
echo.
echo Nao havia nenhuma alteracao nova para enviar.
echo Commit atual: %LOCAL_HASH%
echo.
start "" "%REPO_PAGE%"
pause
exit /b 0

:NO_GIT
set "ERROR_TEXT=Git for Windows nao encontrado. Instale o Git e tente novamente."
goto :FAIL

:NO_ROBOCOPY
set "ERROR_TEXT=Robocopy nao encontrado neste Windows."
goto :FAIL

:CLONE_FAIL
set "ERROR_TEXT=Nao foi possivel baixar o repositorio. Entre na sua conta do GitHub quando o navegador pedir autorizacao."
goto :FAIL

:COPY_FAIL
set "ERROR_TEXT=Falha ao copiar os arquivos do projeto para a copia de envio."
goto :FAIL

:ADD_FAIL
set "ERROR_TEXT=Falha ao preparar os arquivos com git add."
goto :FAIL

:DIFF_FAIL
set "ERROR_TEXT=Falha ao verificar as alteracoes do projeto."
goto :FAIL

:COMMIT_FAIL
set "ERROR_TEXT=Falha ao criar o commit."
goto :FAIL

:PULL_FAIL
set "ERROR_TEXT=O Git encontrou conflito ao atualizar a branch main."
goto :FAIL

:PUSH_FAIL
set "ERROR_TEXT=O GitHub recusou o envio. Verifique login e permissao no repositorio."
goto :FAIL

:VERIFY_FAIL
set "ERROR_TEXT=O envio terminou, mas o commit remoto nao pode ser confirmado."
goto :FAIL

:FAIL
>>"%LOG_FILE%" echo ERRO: %ERROR_TEXT%
cls
echo ================================================================
echo                    O ENVIO FALHOU
echo ================================================================
echo.
echo %ERROR_TEXT%
echo.
echo Log completo:
echo %LOG_FILE%
echo.
echo A pasta temporaria foi mantida para diagnostico:
echo %WORK_DIR%
echo.
pause
exit /b 1
