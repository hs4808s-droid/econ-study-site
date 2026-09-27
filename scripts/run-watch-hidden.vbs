Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\KMI\dev\econ-study-site"
WshShell.Run "cmd /c node scripts\watch.mjs", 0, False
