@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
color 0A
title Turbo Lanches - Ativar Equipe e Permissoes no Supabase

set "PROJECT_REF=kyoyfsxgqmlxwtnmtbuh"
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
set "LOG_FILE=%PROJECT_DIR%\ATIVACAO_EQUIPE_SUPABASE_LOG.txt"

>"%LOG_FILE%" echo Turbo Lanches - ativacao equipe: %date% %time%

cls
echo ================================================================
echo       TURBO LANCHES - EQUIPE E PERMISSOES NO SUPABASE
echo ================================================================
echo.
echo Este processo vai:
echo  1. Entrar na sua conta Supabase
echo  2. Vincular o projeto %PROJECT_REF%
echo  3. Criar as tabelas de equipe e permissoes
echo  4. Publicar a funcao de cadastro de contas
echo.
echo Projeto local: %PROJECT_DIR%
echo.
pause

where node >nul 2>&1
if errorlevel 1 goto :NO_NODE
where npm >nul 2>&1
if errorlevel 1 goto :NO_NODE

cd /d "%PROJECT_DIR%"

echo [1/4] Preparando Supabase CLI...
call npx --yes supabase@latest --version >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :CLI_FAIL

echo [2/4] Entrando no Supabase...
echo O navegador podera abrir para autorizar sua conta.
call npx --yes supabase@latest login >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :LOGIN_FAIL

echo [3/4] Vinculando e aplicando a migration...
call npx --yes supabase@latest link --project-ref "%PROJECT_REF%" >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :LINK_FAIL

call npx --yes supabase@latest db push >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :DB_FAIL

echo [4/4] Publicando a funcao admin-manage-staff...
call npx --yes supabase@latest functions deploy admin-manage-staff --project-ref "%PROJECT_REF%" --no-verify-jwt >>"%LOG_FILE%" 2>&1
if errorlevel 1 goto :FUNCTION_FAIL

cls
echo ================================================================
echo       EQUIPE E PERMISSOES ATIVADAS COM SUCESSO
echo ================================================================
echo.
echo Agora o administrador pode cadastrar:
echo  - Administradores
echo  - Vendedores
echo  - Caixas
echo  - Permissoes individuais por secao
echo.
echo Log: %LOG_FILE%
echo.
pause
exit /b 0

:NO_NODE
set "ERROR_TEXT=Node.js e npm nao foram encontrados. Instale o Node.js e tente novamente."
goto :FAIL

:CLI_FAIL
set "ERROR_TEXT=Nao foi possivel iniciar o Supabase CLI."
goto :FAIL

:LOGIN_FAIL
set "ERROR_TEXT=O login no Supabase nao foi concluido."
goto :FAIL

:LINK_FAIL
set "ERROR_TEXT=Nao foi possivel vincular o projeto Supabase. Confira sua permissao na conta."
goto :FAIL

:DB_FAIL
set "ERROR_TEXT=A migration nao foi aplicada. Confira a senha do banco e o log."
goto :FAIL

:FUNCTION_FAIL
set "ERROR_TEXT=A migration foi aplicada, mas a funcao admin-manage-staff nao foi publicada."
goto :FAIL

:FAIL
>>"%LOG_FILE%" echo ERRO: %ERROR_TEXT%
cls
echo ================================================================
echo                    ATIVACAO FALHOU
echo ================================================================
echo.
echo %ERROR_TEXT%
echo.
echo Envie este arquivo para analise:
echo %LOG_FILE%
echo.
pause
exit /b 1
