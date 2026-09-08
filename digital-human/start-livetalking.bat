@echo off
chcp 65001 >nul
setlocal

REM ==================== CONFIG: edit to match your machine ====================
set "LT_HOME=C:\LiveTalking"
set "LT_PY=%LT_HOME%\.venv\Scripts\python.exe"
set "AVATAR_ID=wav2lip_avatar_glass_man"
set "PORT=8010"
set "HOST=0.0.0.0"
REM ============================================================================

REM HuggingFace mirror (helps in CN; harmless if unused)
set "HF_ENDPOINT=https://hf-mirror.com"

echo.
echo === LiveTalking preflight ===

if not exist "%LT_HOME%" (
  echo [ERROR] LiveTalking home not found: %LT_HOME%
  echo         Fix LT_HOME at the top of this script.
  goto :fail
)

if not exist "%LT_PY%" (
  echo [ERROR] Python not found: %LT_PY%
  echo         Use the Windows bundle, or create a venv and install requirements.
  goto :fail
)

if not exist "%LT_HOME%\app.py" (
  echo [ERROR] app.py not found under %LT_HOME%
  goto :fail
)

if not exist "%LT_HOME%\models\wav2lip.pth" (
  echo [ERROR] Model missing: %LT_HOME%\models\wav2lip.pth
  echo         Copy wav2lip256.pth into models\ and RENAME it to wav2lip.pth
  goto :fail
)

if not exist "%LT_HOME%\data\avatars\%AVATAR_ID%" (
  echo [ERROR] Avatar missing: %LT_HOME%\data\avatars\%AVATAR_ID%
  echo         Avatar folder must contain: full_imgs/, face_imgs/, coords.pkl
  echo         Extract the wav2lip_avatar_glass_man archive into data\avatars\
  goto :fail
)

echo [OK] python  : %LT_PY%
echo [OK] model   : models\wav2lip.pth
echo [OK] avatar  : data\avatars\%AVATAR_ID%
echo.
echo === Starting LiveTalking (webrtc / wav2lip) on port %PORT% ===
echo Step 1 - Self test : http://127.0.0.1:%PORT%/index.html
echo Step 2 - Refresh   : http://localhost:5174
echo.

cd /d "%LT_HOME%"
"%LT_PY%" app.py --transport webrtc --model wav2lip --avatar_id %AVATAR_ID% --listenport %PORT%

goto :end

:fail
echo.
echo Preflight failed - see README.md section 2 and 8 for fixes.

:end
echo.
pause
