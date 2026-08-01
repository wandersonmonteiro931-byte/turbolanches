@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
color 0B

title Turbo Lanches - GitHub e Lovable V7

set "REPO_URL=https://github.com/wandersonmonteiro931-byte/turbolanches.git"
set "BRANCH=main"
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR="
set "CLONE_DIR=%TEMP%\turbolanches_sync_%RANDOM%_%RANDOM%_%RANDOM%"
set "STEP_FILE=%TEMP%\turbolanches_git_step_%RANDOM%_%RANDOM%.txt"
set "LOG_FILE="
set "SUCCESS_FILE="
set "FAIL_MESSAGE=Erro desconhecido."

set "GIT_TERMINAL_PROMPT=1"
set "GCM_INTERACTIVE=always"

if exist "%SCRIPT_DIR%package.json" set "PROJECT_DIR=%SCRIPT_DIR:~0,-1%"
if not defined PROJECT_DIR if exist "%SCRIPT_DIR%turbolanches-main\package.json" set "PROJECT_DIR=%SCRIPT_DIR%turbolanches-main"
if not defined PROJECT_DIR if exist "%SCRIPT_DIR%..\turbolanches-main\package.json" set "PROJECT_DIR=%SCRIPT_DIR%..\turbolanches-main"

if not defined PROJECT_DIR (
    echo.
    echo [ERRO] Nao encontrei a pasta turbolanches-main.
    echo Coloque este BAT dentro da pasta do projeto ou ao lado dela.
    echo.
    pause
    exit /b 1
)

for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"
set "LOG_FILE=%PROJECT_DIR%\ATUALIZACAO_GITHUB_LOG.txt"
set "SUCCESS_FILE=%PROJECT_DIR%\ULTIMO_ENVIO_GITHUB.txt"

>"%LOG_FILE%" echo Turbo Lanches - inicio: %date% %time%

cls
echo ================================================================
echo        TURBO LANCHES - ENVIO AO GITHUB E LOVABLE - V7
echo ================================================================
echo.
echo Projeto encontrado:
echo %PROJECT_DIR%
echo.

where git >nul 2>&1
if errorlevel 1 (
    set "FAIL_MESSAGE=O Git for Windows nao esta instalado ou nao foi encontrado no PATH."
    goto :FAIL
)

where robocopy >nul 2>&1
if errorlevel 1 (
    set "FAIL_MESSAGE=O Robocopy nao foi encontrado no Windows."
    goto :FAIL
)

call :LOG "[1/9] Preparando identificacao do Git..."
for /f "usebackq delims=" %%A in (`git config --global user.name 2^>nul`) do set "GIT_NAME=%%A"
for /f "usebackq delims=" %%A in (`git config --global user.email 2^>nul`) do set "GIT_EMAIL=%%A"
if not defined GIT_NAME git config --global user.name "Wanderson Monteiro" >nul 2>&1
if not defined GIT_EMAIL git config --global user.email "wandersonmonteiro931-byte@users.noreply.github.com" >nul 2>&1

call :LOG "[2/9] Clonando a versao atual do GitHub..."
call :RUN_GIT clone --branch "%BRANCH%" --single-branch "%REPO_URL%" "%CLONE_DIR%"
if errorlevel 1 (
    set "FAIL_MESSAGE=O Git nao conseguiu clonar o repositorio. Veja o texto exibido acima."
    goto :FAIL
)

if not exist "%CLONE_DIR%\.git" (
    set "FAIL_MESSAGE=O clone terminou sem criar a pasta .git."
    goto :FAIL
)

call :LOG "[3/9] Copiando as alteracoes locais..."
robocopy "%PROJECT_DIR%" "%CLONE_DIR%" /MIR /R:2 /W:1 /COPY:DAT /DCOPY:DAT /XJ /NFL /NDL /NJH /NJS /NP /XD ".git" "node_modules" "dist" "dist-ssr" ".next" ".cache" ".vite" /XF ".env" ".env.*" "*.p12" "*.pfx" "*.pem" "*.key" "*.crt" "*.cer" "ATUALIZACAO_GITHUB_LOG.txt" "ULTIMO_ENVIO_GITHUB.txt"
set "ROBOCOPY_CODE=%ERRORLEVEL%"
>>"%LOG_FILE%" echo Robocopy retornou codigo %ROBOCOPY_CODE%.
if %ROBOCOPY_CODE% GEQ 8 (
    set "FAIL_MESSAGE=O Robocopy falhou ao copiar o projeto. Codigo %ROBOCOPY_CODE%."
    goto :FAIL
)

rem O Robocopy exclui .env.*; copie de volta somente os modelos publicos permitidos.
if exist "%PROJECT_DIR%\.env.example" copy /Y "%PROJECT_DIR%\.env.example" "%CLONE_DIR%\.env.example" >nul
if exist "%PROJECT_DIR%\supabase\.env.example" (
    if not exist "%CLONE_DIR%\supabase" mkdir "%CLONE_DIR%\supabase" >nul 2>&1
    copy /Y "%PROJECT_DIR%\supabase\.env.example" "%CLONE_DIR%\supabase\.env.example" >nul
)

call :LOG "[4/9] Removendo credenciais e certificados da copia de envio..."
for /f "delims=" %%F in ('dir /s /b /a-d "%CLONE_DIR%\.env*" 2^>nul') do call :DELETE_ENV "%%F"
for %%E in (p12 pfx pem key crt cer) do for /f "delims=" %%F in ('dir /s /b /a-d "%CLONE_DIR%\*.%%E" 2^>nul') do del /f /q "%%F" >nul 2>&1

call :LOG "[5/9] Atualizando as regras de seguranca do Git..."
if not exist "%CLONE_DIR%\.gitignore" type nul > "%CLONE_DIR%\.gitignore"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" ".env"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" ".env.*"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "!.env.example"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "!supabase/.env.example"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "*.p12"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "*.pfx"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "*.pem"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "*.key"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "*.crt"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "*.cer"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "ATUALIZACAO_GITHUB_LOG.txt"
call :ENSURE_IGNORE "%CLONE_DIR%\.gitignore" "ULTIMO_ENVIO_GITHUB.txt"

call :LOG "[6/9] Preparando os arquivos para o commit..."
call :RUN_GIT -C "%CLONE_DIR%" config core.autocrlf false
if errorlevel 1 (
    set "FAIL_MESSAGE=Nao foi possivel configurar o Git da copia temporaria."
    goto :FAIL
)
call :RUN_GIT -C "%CLONE_DIR%" add -A
if errorlevel 1 (
    set "FAIL_MESSAGE=Nao foi possivel preparar os arquivos com git add."
    goto :FAIL
)

git -C "%CLONE_DIR%" diff --cached --quiet >nul 2>&1
set "DIFF_CODE=%ERRORLEVEL%"
if "%DIFF_CODE%"=="0" goto :NO_CHANGES
if not "%DIFF_CODE%"=="1" (
    set "FAIL_MESSAGE=Nao foi possivel verificar as alteracoes do projeto. Codigo %DIFF_CODE%."
    goto :FAIL
)

call :LOG "[7/9] Criando o commit..."
set "COMMIT_MESSAGE=Atualiza Turbo Lanches %date% %time:~0,5%"
call :RUN_GIT -C "%CLONE_DIR%" commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
    set "FAIL_MESSAGE=Nao foi possivel criar o commit."
    goto :FAIL
)

call :LOG "[8/9] Verificando se o GitHub recebeu outra atualizacao..."
call :RUN_GIT -C "%CLONE_DIR%" pull --rebase origin "%BRANCH%"
if errorlevel 1 (
    set "FAIL_MESSAGE=O Git encontrou conflito ao atualizar a branch main. Nenhum arquivo local foi apagado."
    goto :FAIL
)

call :LOG "[9/9] Enviando e confirmando no GitHub..."
call :RUN_GIT -C "%CLONE_DIR%" push origin "%BRANCH%"
if errorlevel 1 (
    set "FAIL_MESSAGE=O GitHub recusou o envio. Confira a autenticacao ou a permissao no repositorio."
    goto :FAIL
)

for /f "delims=" %%H in ('git -C "%CLONE_DIR%" rev-parse HEAD 2^>nul') do set "LOCAL_HASH=%%H"
for /f "tokens=1" %%H in ('git -C "%CLONE_DIR%" ls-remote origin "refs/heads/%BRANCH%" 2^>nul') do set "REMOTE_HASH=%%H"

if not defined LOCAL_HASH (
    set "FAIL_MESSAGE=Nao foi possivel obter o codigo do commit local."
    goto :FAIL
)
if not defined REMOTE_HASH (
    set "FAIL_MESSAGE=Nao foi possivel confirmar o commit remoto no GitHub."
    goto :FAIL
)
if /I not "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    set "FAIL_MESSAGE=O commit local e o remoto ficaram diferentes. Local %LOCAL_HASH% - Remoto %REMOTE_HASH%."
    goto :FAIL
)

>"%SUCCESS_FILE%" (
    echo ENVIO CONFIRMADO PELO GITHUB
    echo Data: %date% %time%
    echo Repositorio: %REPO_URL%
    echo Branch: %BRANCH%
    echo Commit confirmado: %LOCAL_HASH%
    echo.
    echo O Lovable deve sincronizar esse commit da branch main.
)

call :LOG "ENVIO CONFIRMADO NO COMMIT %LOCAL_HASH%"
if exist "%CLONE_DIR%" rd /s /q "%CLONE_DIR%" >nul 2>&1
if exist "%STEP_FILE%" del /f /q "%STEP_FILE%" >nul 2>&1

cls
echo ================================================================
echo        ENVIO CONFIRMADO PELO GITHUB COM SUCESSO
echo ================================================================
echo.
echo Commit confirmado:
echo %LOCAL_HASH%
echo.
echo Comprovante criado em:
echo %SUCCESS_FILE%
echo.
echo O Lovable deve sincronizar a branch main automaticamente.
echo Para atualizar a versao publicada, use Publish ^> Update no Lovable.
echo.
pause
exit /b 0

:NO_CHANGES
for /f "delims=" %%H in ('git -C "%CLONE_DIR%" rev-parse HEAD 2^>nul') do set "LOCAL_HASH=%%H"
>"%SUCCESS_FILE%" (
    echo NENHUMA ALTERACAO PARA ENVIAR
    echo Data: %date% %time%
    echo Commit atual: %LOCAL_HASH%
)
if exist "%CLONE_DIR%" rd /s /q "%CLONE_DIR%" >nul 2>&1
if exist "%STEP_FILE%" del /f /q "%STEP_FILE%" >nul 2>&1
cls
echo ================================================================
echo        NAO HAVIA ALTERACOES PARA ENVIAR
echo ================================================================
echo.
echo O GitHub ja possui os mesmos arquivos deste projeto.
echo Commit atual: %LOCAL_HASH%
echo.
pause
exit /b 0

:FAIL
if exist "%STEP_FILE%" del /f /q "%STEP_FILE%" >nul 2>&1
call :LOG "ERRO: %FAIL_MESSAGE%"
echo.
echo ================================================================
echo                     O ENVIO FALHOU
echo ================================================================
echo.
echo %FAIL_MESSAGE%
echo.
echo Log:
echo %LOG_FILE%
echo.
if exist "%CLONE_DIR%" echo Pasta temporaria mantida: %CLONE_DIR%
echo.
pause
exit /b 1

:RUN_GIT
if exist "%STEP_FILE%" del /f /q "%STEP_FILE%" >nul 2>&1
git %* >"%STEP_FILE%" 2>&1
set "RUN_CODE=%ERRORLEVEL%"
type "%STEP_FILE%"
type "%STEP_FILE%" >> "%LOG_FILE%"
if exist "%STEP_FILE%" del /f /q "%STEP_FILE%" >nul 2>&1
exit /b %RUN_CODE%

:DELETE_ENV
if /I "%~nx1"==".env.example" exit /b 0
del /f /q "%~1" >nul 2>&1
>>"%LOG_FILE%" echo Protegido e removido da copia: %~1
exit /b 0

:ENSURE_IGNORE
findstr /x /l /c:"%~2" "%~1" >nul 2>&1
if errorlevel 1 >>"%~1" echo %~2
exit /b 0

:LOG
echo %~1
>>"%LOG_FILE%" echo [%date% %time%] %~1
exit /b 0
