; Copyright (c) 2026 onelpawarai. All rights reserved.
;
; electron-builder includes this file into the generated NSIS installer. It only adds
; teardown: the task daemon installs itself on first run, so the uninstaller is the
; only place that can take back what that left behind.

!include LogicLib.nsh

!macro customUnInstall
  ; Leaving the HKCU Run entry behind points Explorer at a python script the uninstaller
  ; just deleted, which pops an error dialog on every sign-in after ZYRAXON is gone.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ZYRAXONTaskDaemon"

  ; APP_ID is the appId, and index.ts:148 sets userData to $APPDATA/<appId>, so this is
  ; the same directory the daemon copied its script into.
  ${If} ${FileExists} "$APPDATA\${APP_ID}\task-daemon"
    RMDir /r "$APPDATA\${APP_ID}\task-daemon"
  ${EndIf}
!macroend
