@echo off
:: ============================================================
:: Housing Adviser — Backend Installer (Windows)
:: Run from inside the backend\ folder:
::   cd backend
::   install_backend.bat
:: ============================================================

echo.
echo  ====================================================
echo   Housing Adviser Backend — Installing dependencies
echo  ====================================================
echo.

:: Step 1 — Upgrade pip silently
echo [1/3] Upgrading pip...
python -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo  ERROR: pip upgrade failed. Make sure Python 3.9+ is installed.
    pause
    exit /b 1
)

:: Step 2 — Install CPU-only PyTorch (avoids 228 MB MKL download)
echo.
echo [2/3] Installing PyTorch (CPU-only, ~200 MB)...
echo  This may take a few minutes on slow connections.
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet
if errorlevel 1 (
    echo  ERROR: PyTorch install failed. Check your internet connection and retry.
    pause
    exit /b 1
)
echo  PyTorch installed successfully.

:: Step 3 — Install remaining packages
echo.
echo [3/3] Installing remaining backend packages...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo  ERROR: Some packages failed. See output above for details.
    pause
    exit /b 1
)

echo.
echo  ====================================================
echo   All packages installed successfully!
echo  ====================================================
echo.
echo  Next steps:
echo    1. Copy .env.example to .env  (and add GEMINI_API_KEY if you have one)
echo    2. Start the server:   python app.py
echo    3. Open API docs:      http://localhost:8000/docs
echo.
pause
