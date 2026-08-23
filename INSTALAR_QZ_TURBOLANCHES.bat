@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

title Turbo Lanches - Instalar QZ Tray Assinador Local

echo ============================================================
echo       TURBO LANCHES - INSTALADOR QZ TRAY LOCAL
echo ============================================================
echo.
echo Este instalador NAO envia sua chave privada para o GitHub.
echo Ela sera copiada apenas para este computador, em LocalAppData.
echo.

set "SOURCE_DIR=%~dp0qz-local-signer"
set "INSTALL_DIR=%LOCALAPPDATA%\TurboLanchesQZSigner"
set "NODE_VERSION=v22.16.0"
set "NODE_ARCH=x64"

if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NODE_ARCH=arm64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "NODE_ARCH=arm64"

if not exist "%SOURCE_DIR%\signer.js" (
    echo [ERRO] Nao encontrei qz-local-signer\signer.js dentro deste projeto.
    echo Extraia o ZIP completo antes de executar este arquivo.
    goto :erro
)

for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP_DIR=%%D"
if not defined DESKTOP_DIR set "DESKTOP_DIR=%USERPROFILE%\Desktop"

set "CERT_DIR=%DESKTOP_DIR%\QZ Tray Demo Cert"
set "CERT_FILE=%CERT_DIR%\digital-certificate.txt"
set "KEY_FILE=%CERT_DIR%\private-key.pem"

if not exist "%CERT_FILE%" (
    if exist "%CERT_DIR%\digital-certificate" set "CERT_FILE=%CERT_DIR%\digital-certificate"
)

if not exist "%KEY_FILE%" (
    echo [ERRO] Nao encontrei:
    echo        %KEY_FILE%
    echo.
    echo No QZ Tray, va em Advanced ^> Site Manager ^> + ^> Create New
    echo e gere novamente o QZ Tray Demo Cert.
    goto :erro
)

if not exist "%CERT_FILE%" (
    echo [ERRO] Nao encontrei o digital-certificate.txt em:
    echo        %CERT_DIR%
    goto :erro
)

for %%A in ("%KEY_FILE%") do set "KEY_SIZE=%%~zA"
for %%A in ("%CERT_FILE%") do set "CERT_SIZE=%%~zA"
if "%KEY_SIZE%"=="0" (
    echo [ERRO] private-key.pem esta vazio.
    goto :erro
)
if "%CERT_SIZE%"=="0" (
    echo [ERRO] digital-certificate.txt esta vazio.
    goto :erro
)

echo [1/6] Certificado encontrado.
echo       Chave privada: %KEY_SIZE% bytes
echo       Certificado:   %CERT_SIZE% bytes
echo.

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Nao consegui criar %INSTALL_DIR%
    goto :erro
)

copy /Y "%SOURCE_DIR%\signer.js" "%INSTALL_DIR%\signer.js" >nul
if errorlevel 1 goto :erro_copia
copy /Y "%SOURCE_DIR%\start-signer.vbs" "%INSTALL_DIR%\start-signer.vbs" >nul
if errorlevel 1 goto :erro_copia
copy /Y "%CERT_FILE%" "%INSTALL_DIR%\digital-certificate.txt" >nul
if errorlevel 1 goto :erro_copia
copy /Y "%KEY_FILE%" "%INSTALL_DIR%\private-key.pem" >nul
if errorlevel 1 goto :erro_copia

echo [2/6] Assinador e certificado copiados somente para este PC.
echo.

set "NODE_DIR=%INSTALL_DIR%\node"
set "NODE_EXE=%NODE_DIR%\node.exe"

if not exist "%NODE_EXE%" (
    echo [3/6] Baixando Node.js portatil oficial para o assinador...
    set "NODE_ZIP=%TEMP%\turbolanches-node-%NODE_VERSION%-%NODE_ARCH%.zip"
    set "NODE_TMP=%TEMP%\turbolanches-node-%RANDOM%-%RANDOM%"
    if exist "!NODE_ZIP!" del /Q "!NODE_ZIP!" >nul 2>&1
    if exist "!NODE_TMP!" rmdir /S /Q "!NODE_TMP!" >nul 2>&1

    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/%NODE_VERSION%/node-%NODE_VERSION%-win-%NODE_ARCH%.zip' -OutFile '!NODE_ZIP!'"
    if errorlevel 1 (
        echo [ERRO] Falha ao baixar o Node.js oficial.
        echo Verifique a internet e execute novamente.
        goto :erro
    )

    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "New-Item -ItemType Directory -Force -Path '!NODE_TMP!' ^| Out-Null; Expand-Archive -LiteralPath '!NODE_ZIP!' -DestinationPath '!NODE_TMP!' -Force; New-Item -ItemType Directory -Force -Path '%NODE_DIR%' ^| Out-Null; Copy-Item -Path '!NODE_TMP!\node-%NODE_VERSION%-win-%NODE_ARCH%\*' -Destination '%NODE_DIR%' -Recurse -Force"
    if errorlevel 1 (
        echo [ERRO] Falha ao preparar o Node.js portatil.
        goto :erro
    )

    del /Q "!NODE_ZIP!" >nul 2>&1
    rmdir /S /Q "!NODE_TMP!" >nul 2>&1
) else (
    echo [3/6] Node.js portatil ja instalado.
)

if not exist "%NODE_EXE%" (
    echo [ERRO] node.exe nao foi encontrado apos a instalacao.
    goto :erro
)

"%NODE_EXE%" --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Node.js local nao conseguiu iniciar.
    goto :erro
)
echo.

echo [4/6] Configurando inicializacao automatica com o Windows...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws=New-Object -ComObject WScript.Shell; $lnk=$ws.CreateShortcut('%STARTUP_DIR%\Turbo Lanches QZ Signer.lnk'); $lnk.TargetPath=$env:WINDIR + '\System32\wscript.exe'; $lnk.Arguments=[char]34 + '%INSTALL_DIR%\start-signer.vbs' + [char]34; $lnk.WorkingDirectory='%INSTALL_DIR%'; $lnk.Description='Assinador local QZ Tray do Turbo Lanches'; $lnk.Save()"
if errorlevel 1 (
    echo [ERRO] Nao consegui configurar a inicializacao automatica.
    goto :erro
)
echo.

echo [5/6] Reiniciando o assinador local...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process ^| Where-Object { $_.CommandLine -and $_.CommandLine -like '*TurboLanchesQZSigner*signer.js*' } ^| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

timeout /t 1 /nobreak >nul
start "" wscript.exe "%INSTALL_DIR%\start-signer.vbs"
timeout /t 2 /nobreak >nul

echo [6/6] Testando http://127.0.0.1:8182/health ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8182/health' -TimeoutSec 5; if(-not $r.ok){exit 2}; Write-Host ('       OK - certificado=' + $r.certificateOk + ' chave=' + $r.privateKeyOk); exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
    echo.
    echo [ERRO] O assinador foi instalado, mas nao respondeu ao teste.
    echo Veja o arquivo de log:
    echo %INSTALL_DIR%\signer.log
    goto :erro
)

echo.
echo ============================================================
echo                 INSTALACAO CONCLUIDA
echo ============================================================
echo.
echo O private-key.pem ficou SOMENTE em:
echo %INSTALL_DIR%
echo.
echo Agora:
echo  1. Deixe o QZ Tray aberto.
echo  2. No Chrome, abra https://turbolanches.lovable.app
echo  3. Pressione Ctrl+F5.
echo  4. Se o Chrome pedir acesso a rede local, clique em Permitir.
echo  5. Va em Comandas e clique em Detectar.
echo  6. Teste a impressao ESC/POS.
echo.
echo O QZ deve identificar o certificado confiavel em vez de "anonymous request".
echo.
pause
exit /b 0

:erro_copia
echo [ERRO] Falha ao copiar os arquivos do assinador.
:erro
echo.
echo Nenhuma chave privada foi enviada para a internet por este instalador.
echo Corrija o erro acima e execute novamente.
echo.
pause
exit /b 1
