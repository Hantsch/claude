; Included into the NSIS installer by electron-builder.yml (nsis.include).
;
; Uninstalling removes what the app itself registered under HKCU at run time, which the
; installer never wrote and so would otherwise leave behind:
;   - the autostart login item (src/main/autostart.ts; Electron names the Run value after the
;     AppUserModelId, solutions.aidu.scrum-control),
;   - the scrum-control:// toast-button protocol (src/main/toast-protocol.ts).
; An update runs the old uninstaller too (with --updated); both entries must survive that, so
; they are only removed on a real uninstall.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "solutions.aidu.scrum-control"
    DeleteRegKey HKCU "Software\Classes\scrum-control"
  ${endIf}
!macroend
