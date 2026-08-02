@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
color 0A
title Turbo Lanches - Ativar equipe pelo Lovable

set "BASE_DIR=%~dp0"
set "PROMPT_FILE=%BASE_DIR%PROMPT_ATIVAR_EQUIPE_NO_LOVABLE.txt"

if not exist "%PROMPT_FILE%" if exist "%BASE_DIR%turbolanches-main\PROMPT_ATIVAR_EQUIPE_NO_LOVABLE.txt" set "PROMPT_FILE=%BASE_DIR%turbolanches-main\PROMPT_ATIVAR_EQUIPE_NO_LOVABLE.txt"
if not exist "%PROMPT_FILE%" if exist "%BASE_DIR%..\PROMPT_ATIVAR_EQUIPE_NO_LOVABLE.txt" set "PROMPT_FILE=%BASE_DIR%..\PROMPT_ATIVAR_EQUIPE_NO_LOVABLE.txt"

cls
echo ================================================================
echo       TURBO LANCHES - ATIVAR EQUIPE PELO LOVABLE
echo ================================================================
echo.
echo Este processo NAO acessa o Supabase pelo seu computador.
echo Ele copia o comando correto e abre o Lovable para o proprio
echo Lovable aplicar a migration e publicar a funcao no backend atual.
echo.

if not exist "%PROMPT_FILE%" goto :NO_PROMPT

where clip >nul 2>&1
if errorlevel 1 goto :NO_CLIP

type "%PROMPT_FILE%" | clip
if errorlevel 1 goto :COPY_FAIL

echo [OK] O comando foi copiado para a area de transferencia.
echo [OK] Abrindo o Lovable...
echo.
start "" "https://lovable.dev/projects"

echo Agora faca assim:
echo.
echo  1. Abra o projeto Turbo Lanches no Lovable.
echo  2. Clique no campo de mensagem do chat.
echo  3. Pressione CTRL + V.
echo  4. Envie a mensagem e aguarde o Lovable concluir.
echo  5. Depois clique em Publish/Update para atualizar o site publicado.
echo.
echo Nao feche esta janela ate copiar as instrucoes acima.
echo.
pause
exit /b 0

:NO_PROMPT
echo [ERRO] Nao encontrei PROMPT_ATIVAR_EQUIPE_NO_LOVABLE.txt.
echo Extraia o ZIP inteiro antes de executar.
echo.
pause
exit /b 1

:NO_CLIP
echo [ERRO] O comando clip do Windows nao foi encontrado.
echo Abra manualmente este arquivo e copie todo o texto:
echo %PROMPT_FILE%
echo.
pause
exit /b 1

:COPY_FAIL
echo [ERRO] Nao foi possivel copiar o comando automaticamente.
echo Abra manualmente este arquivo e copie todo o texto:
echo %PROMPT_FILE%
echo.
pause
exit /b 1
