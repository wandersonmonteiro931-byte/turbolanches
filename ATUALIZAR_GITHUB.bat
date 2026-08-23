@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

title TURBOLANCHES - Atualizar GitHub

set "REPO_URL=https://github.com/wandersonmonteiro931-byte/turbolanches.git"
set "SOURCE_DIR=%~dp0."
set "WORK_DIR=%TEMP%\turbolanches_git_update_%RANDOM%_%RANDOM%"

echo ============================================================
echo        TURBOLANCHES - ATUALIZACAO AUTOMATICA DO GITHUB
echo ============================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Git nao esta instalado ou nao esta no PATH.
    echo Instale o Git for Windows e execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)

echo [1/6] Preparando copia temporaria do repositorio...
if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"

git clone "%REPO_URL%" "%WORK_DIR%"
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel acessar o repositorio.
    echo Na primeira execucao, o GitHub pode pedir para voce entrar na sua conta.
    echo Nenhuma alteracao foi enviada.
    echo.
    if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"
    pause
    exit /b 1
)

echo.
echo [2/6] Copiando os arquivos deste projeto...
robocopy "%SOURCE_DIR%" "%WORK_DIR%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /XD ".git" "node_modules" /XF ".DS_Store" /NFL /NDL /NJH /NJS /NP
set "ROBOCODE=%ERRORLEVEL%"
if %ROBOCODE% GEQ 8 (
    echo.
    echo [ERRO] Falha ao copiar os arquivos para a copia do Git.
    echo Codigo do ROBOCOPY: %ROBOCODE%
    echo Nenhuma alteracao foi enviada.
    echo.
    rmdir /s /q "%WORK_DIR%"
    pause
    exit /b 1
)

echo [3/6] Verificando alteracoes...
git -C "%WORK_DIR%" add -A

git -C "%WORK_DIR%" diff --cached --quiet
if not errorlevel 1 (
    echo.
    echo [OK] O GitHub ja esta atualizado. Nao ha nada novo para enviar.
    echo.
    rmdir /s /q "%WORK_DIR%"
    pause
    exit /b 0
)

for /f "delims=" %%N in ('git -C "%WORK_DIR%" config user.name 2^>nul') do set "GIT_NAME=%%N"
if not defined GIT_NAME git -C "%WORK_DIR%" config user.name "WMCPLAYER Auto Update"

for /f "delims=" %%E in ('git -C "%WORK_DIR%" config user.email 2^>nul') do set "GIT_EMAIL=%%E"
if not defined GIT_EMAIL git -C "%WORK_DIR%" config user.email "wandersonmonteiro931-byte@users.noreply.github.com"

echo [4/6] Criando commit...
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set "TODAY=%%a-%%b-%%c"
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set "NOW=%%a-%%b"
git -C "%WORK_DIR%" commit -m "Atualizacao automatica TURBOLANCHES %DATE% %TIME%"
if errorlevel 1 (
    echo.
    echo [ERRO] Nao foi possivel criar o commit.
    echo Nenhuma alteracao foi enviada.
    echo.
    rmdir /s /q "%WORK_DIR%"
    pause
    exit /b 1
)

for /f "delims=" %%B in ('git -C "%WORK_DIR%" branch --show-current') do set "BRANCH=%%B"
if not defined BRANCH set "BRANCH=main"

echo [5/6] Enviando para o GitHub na branch %BRANCH%...
git -C "%WORK_DIR%" push origin "%BRANCH%"
if errorlevel 1 (
    echo.
    echo [ERRO] O push para o GitHub falhou.
    echo O commit ficou apenas na pasta temporaria e nao alterou o repositorio remoto.
    echo Verifique seu login/permissao no GitHub e tente novamente.
    echo.
    rmdir /s /q "%WORK_DIR%"
    pause
    exit /b 1
)

echo [6/6] Limpando arquivos temporarios...
rmdir /s /q "%WORK_DIR%"

echo.
echo ============================================================
echo [SUCESSO] Projeto enviado para o GitHub com sucesso.
echo Repositorio: %REPO_URL%
echo ============================================================
echo.
pause
exit /b 0
