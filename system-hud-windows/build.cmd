@echo off
rem Build System HUD (Windows) và gom bản chạy vào dist\
rem Cần .NET SDK (bất kỳ bản nào từ 5 trở lên) + .NET Framework 4.8 Developer Pack
rem (hoặc mạng để SDK tự tải gói Microsoft.NETFramework.ReferenceAssemblies).
setlocal
cd /d "%~dp0"
taskkill /IM SystemHud.exe /F >nul 2>&1
dotnet build -c Release -nologo || exit /b 1
if not exist dist mkdir dist
copy /Y bin\Release\net48\SystemHud.exe dist\ >nul
copy /Y bin\Release\net48\SystemHud.exe.config dist\ >nul
echo Da build: %~dp0dist\SystemHud.exe
