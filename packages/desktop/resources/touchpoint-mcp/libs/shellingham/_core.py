# Copyright (c) 2026 onelpawarai. All rights reserved.

SHELL_NAMES = (
    {"sh", "bash", "dash", "ash"}  # Bourne.
    | {"csh", "tcsh"}  # C.
    | {"ksh", "zsh", "fish"}  # Common alternatives.
    | {"cmd", "powershell", "pwsh"}  # Microsoft.
    | {"elvish", "xonsh", "nu"}  # More exotic.
)


class ShellDetectionFailure(EnvironmentError):
    pass
