@echo off
setlocal
set "PYTHONUTF8=1"
set "ASSET_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%ASSET_PYTHON%" goto ready
where python >nul 2>nul
if not errorlevel 1 (
  set "ASSET_PYTHON=python"
  goto ready
)
where py >nul 2>nul
if not errorlevel 1 (
  set "ASSET_PYTHON=py"
  goto ready
)
echo Python was not found. Install Python 3.10 or newer.
exit /b 1
:ready
"%ASSET_PYTHON%" -c "import PIL" >nul 2>nul
if errorlevel 1 (
  "%ASSET_PYTHON%" -m pip install Pillow
  if errorlevel 1 exit /b 1
)
"%ASSET_PYTHON%" "%~dp0prepare_assets.py" %*
exit /b %errorlevel%
