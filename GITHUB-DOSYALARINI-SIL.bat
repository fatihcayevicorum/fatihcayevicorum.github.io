@echo off
setlocal
cd /d "%~dp0"
if not exist "firebase.json" goto :wrong
if not exist "yonetim-merkezi" goto :wrong

del /q "assets\js\customer-notifications.js" 2>nul
del /q "assets\js\merchant-notifications.js" 2>nul
del /q "assets\js\merchant-order-alert.js" 2>nul
del /q "assets\js\in-app-notifications.js" 2>nul
del /q "assets\css\customer-notifications.css" 2>nul
del /q "assets\css\merchant-notifications.css" 2>nul
del /q "assets\icons\notification-icon.png" 2>nul
del /q "assets\icons\notification-badge.png" 2>nul
rmdir /s /q "bildirim-yonetimi" 2>nul
del /q "R144-KURULUM.txt" "R145-KURULUM.txt" "R146-KURULUM.txt" "R147-KURULUM.txt" "R148-KURULUM.txt" "R149-KURULUM.txt" "R150-KURULUM.txt" 2>nul

echo Bildirim dosyalari GitHub klasorunden kaldirildi.
echo GitHub Desktop uzerinden degisiklikleri commit edip Push origin yapin.
pause
exit /b 0

:wrong
echo Bu dosyayi GitHub ana klasorune koyup calistirin.
pause
exit /b 1
