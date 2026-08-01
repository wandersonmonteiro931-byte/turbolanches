@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ================================================================
rem TURBO LANCHES - ATUALIZAR GITHUB E LOVABLE
rem Versao 2: ignora .env/certificados e remove do Git sem apagar local.
rem Execute fora ou dentro da pasta turbolanches-main.
rem ================================================================

set "REPO_URL=https://github.com/wandersonmonteiro931-byte/turbolanches.git"
set "BRANCH=main"
set "BASE_DIR=%~dp0"
set "PROJECT_DIR="

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
if errorlevel 1 (
    echo [ERRO] Nao consegui abrir a pasta do projeto:
    echo %PROJECT_DIR%
    goto :falha
)

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
    echo.
    echo Baixe em: https://git-scm.com/download/win
    echo Depois de instalar, abra este arquivo novamente.
    goto :falha
)

for /f "delims=" %%A in ('git config --global user.name 2^>nul') do set "GIT_NAME=%%A"
if not defined GIT_NAME (
    echo Primeira configuracao do Git.
    set /p "GIT_NAME=Digite seu nome: "
    if not defined GIT_NAME set "GIT_NAME=Wanderson Monteiro"
    git config --global user.name "!GIT_NAME!"
)

for /f "delims=" %%A in ('git config --global user.email 2^>nul') do set "GIT_EMAIL=%%A"
if not defined GIT_EMAIL (
    set /p "GIT_EMAIL=Digite o e-mail usado no GitHub: "
    if not defined GIT_EMAIL (
        echo [ERRO] O e-mail e obrigatorio.
        goto :falha
    )
    git config --global user.email "!GIT_EMAIL!"
)

rem Se o ZIP nao tiver a pasta .git, baixa somente a estrutura Git atual.
if not exist ".git\" (
    echo [1/8] Conectando esta pasta ao repositorio do GitHub...
    set "TEMP_CLONE=%TEMP%\turbolanches_clone_!RANDOM!!RANDOM!"

    git clone --branch "%BRANCH%" --single-branch "%REPO_URL%" "!TEMP_CLONE!"
    if errorlevel 1 (
        echo.
        echo [ERRO] Nao foi possivel acessar o repositorio.
        echo Entre na sua conta GitHub quando a janela de login aparecer.
        echo Confira tambem se o repositorio e a branch main existem.
        if exist "!TEMP_CLONE!\" rmdir /S /Q "!TEMP_CLONE!" >nul 2>&1
        goto :falha
    )

    robocopy "!TEMP_CLONE!\.git" "%PROJECT_DIR%\.git" /E /R:1 /W:1 /NFL /NDL /NJH /NJS >nul
    set "ROBO_CODE=!ERRORLEVEL!"
    rmdir /S /Q "!TEMP_CLONE!" >nul 2>&1

    if !ROBO_CODE! GEQ 8 (
        echo [ERRO] Nao consegui preparar a pasta .git.
        goto :falha
    )
) else (
    echo [1/8] Repositorio Git encontrado.
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin "%REPO_URL%"
) else (
    git remote set-url origin "%REPO_URL%"
)

git checkout "%BRANCH%" >nul 2>&1
if errorlevel 1 git checkout -b "%BRANCH%" "origin/%BRANCH%" >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Nao foi possivel acessar a branch %BRANCH%.
    goto :falha
)

echo [2/8] Branch %BRANCH% confirmada.

rem Evita que o Windows tente converter todos os arquivos LF/CRLF.
git config core.autocrlf false
git config core.safecrlf false

rem Reforca exclusoes localmente, mesmo se o .gitignore estiver antigo.
set "EXCLUDE_FILE=.git\info\exclude"
if not exist ".git\info" mkdir ".git\info" >nul 2>&1
findstr /X /C:".env" "%EXCLUDE_FILE%" >nul 2>&1 || >>"%EXCLUDE_FILE%" echo .env
findstr /X /C:"*.p12" "%EXCLUDE_FILE%" >nul 2>&1 || >>"%EXCLUDE_FILE%" echo *.p12
findstr /X /C:"*.pfx" "%EXCLUDE_FILE%" >nul 2>&1 || >>"%EXCLUDE_FILE%" echo *.pfx
findstr /X /C:"*.pem" "%EXCLUDE_FILE%" >nul 2>&1 || >>"%EXCLUDE_FILE%" echo *.pem
findstr /X /C:"*.key" "%EXCLUDE_FILE%" >nul 2>&1 || >>"%EXCLUDE_FILE%" echo *.key

rem Se algum arquivo sensivel ja estava rastreado no Git, remove apenas
rem do repositorio. O arquivo continua normalmente no computador.
echo [3/8] Protegendo credenciais e certificados...
set "REMOVED_SENSITIVE=0"
for /f "usebackq delims=" %%F in (`git ls-files`) do (
    set "FILE=%%F"
    set "IS_SENSITIVE=0"
    set "BASENAME="
    set "EXTENSION="

    for %%B in ("!FILE!") do (
        set "BASENAME=%%~nxB"
        set "EXTENSION=%%~xB"
    )

    if /I "!BASENAME!"==".env" set "IS_SENSITIVE=1"
    echo(!BASENAME!| findstr /I /B /C:".env." >nul
    if not errorlevel 1 set "IS_SENSITIVE=1"
    if /I "!BASENAME!"==".env.example" set "IS_SENSITIVE=0"

    if /I "!EXTENSION!"==".p12" set "IS_SENSITIVE=1"
    if /I "!EXTENSION!"==".pfx" set "IS_SENSITIVE=1"
    if /I "!EXTENSION!"==".pem" set "IS_SENSITIVE=1"
    if /I "!EXTENSION!"==".key" set "IS_SENSITIVE=1"

    if "!IS_SENSITIVE!"=="1" (
        echo [PROTEGIDO] Retirando do Git sem apagar do PC: !FILE!
        git rm --cached --ignore-unmatch -- "!FILE!" >nul 2>&1
        set "REMOVED_SENSITIVE=1"
    )
)

if "!REMOVED_SENSITIVE!"=="0" echo Nenhuma credencial rastreada foi encontrada.

echo [4/8] Preparando os arquivos alterados...
git add -A
if errorlevel 1 (
    echo [ERRO] Nao foi possivel preparar os arquivos.
    goto :falha
)

rem Verificacao final: qualquer segredo que nao seja uma exclusao do repositorio
rem sera retirado da area de commit, e o processo continuara normalmente.
for /f "tokens=1,*" %%S in ('git diff --cached --name-status') do (
    set "STATUS=%%S"
    set "FILE=%%T"
    set "IS_SENSITIVE=0"
    set "BASENAME="
    set "EXTENSION="

    for %%B in ("!FILE!") do (
        set "BASENAME=%%~nxB"
        set "EXTENSION=%%~xB"
    )

    if /I "!BASENAME!"==".env" set "IS_SENSITIVE=1"
    echo(!BASENAME!| findstr /I /B /C:".env." >nul
    if not errorlevel 1 set "IS_SENSITIVE=1"
    if /I "!BASENAME!"==".env.example" set "IS_SENSITIVE=0"
    if /I "!EXTENSION!"==".p12" set "IS_SENSITIVE=1"
    if /I "!EXTENSION!"==".pfx" set "IS_SENSITIVE=1"
    if /I "!EXTENSION!"==".pem" set "IS_SENSITIVE=1"
    if /I "!EXTENSION!"==".key" set "IS_SENSITIVE=1"

    if "!IS_SENSITIVE!"=="1" if /I not "!STATUS!"=="D" (
        echo [IGNORADO] Nao sera enviado: !FILE!
        git restore --staged -- "!FILE!" >nul 2>&1
        if errorlevel 1 git reset HEAD -- "!FILE!" >nul 2>&1
    )
)

git diff --cached --quiet
if errorlevel 1 (
    for /f "delims=" %%A in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss" 2^>nul') do set "TIMESTAMP=%%A"
    if not defined TIMESTAMP set "TIMESTAMP=atualizacao"

    echo [5/8] Criando o commit...
    git commit -m "Atualizacao automatica Turbo Lanches - !TIMESTAMP!"
    if errorlevel 1 (
        echo [ERRO] Nao foi possivel criar o commit.
        goto :falha
    )
) else (
    echo [5/8] Nenhuma alteracao local nova para criar commit.
)

echo [6/8] Baixando atualizacoes feitas no GitHub ou Lovable...
git pull --rebase origin "%BRANCH%"
if errorlevel 1 (
    echo.
    echo [ERRO] Houve conflito ao juntar as atualizacoes.
    echo Seus arquivos nao foram apagados.
    echo Execute no terminal: git rebase --abort
    goto :falha
)

echo [7/8] Enviando para o GitHub...
echo Na primeira vez, uma janela de login pode aparecer.
git push -u origin "%BRANCH%"
if errorlevel 1 (
    echo.
    echo [ERRO] O GitHub recusou o envio.
    echo Confira o login, a internet e a permissao no repositorio.
    goto :falha
)

echo [8/8] Atualizacao enviada.
echo.
echo GitHub atualizado com sucesso.
echo O arquivo .env e certificados ficaram somente no seu computador.
echo O editor do Lovable sera sincronizado se estiver conectado ao mesmo
echo repositorio e a branch main.
echo.
echo Para atualizar a versao PUBLICADA no Lovable, ainda e necessario
echo abrir o projeto e clicar em Publish / Update.
goto :sucesso

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
