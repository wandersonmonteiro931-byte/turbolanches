Option Explicit
Dim fso, shell, baseDir, nodeExe, signerJs, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
nodeExe = baseDir & "\node\node.exe"
signerJs = baseDir & "\signer.js"

If Not fso.FileExists(nodeExe) Then
  MsgBox "Node local do assinador QZ não foi encontrado. Execute novamente INSTALAR_QZ_TURBOLANCHES.bat.", 16, "Turbo Lanches - QZ"
  WScript.Quit 1
End If

If Not fso.FileExists(signerJs) Then
  MsgBox "signer.js não foi encontrado. Execute novamente INSTALAR_QZ_TURBOLANCHES.bat.", 16, "Turbo Lanches - QZ"
  WScript.Quit 1
End If

cmd = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & signerJs & Chr(34)
shell.Run cmd, 0, False
