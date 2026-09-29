# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""Shell completion generation for Cyclopts applications."""

from cyclopts.completion.detect import ShellDetectionError, detect_shell
from cyclopts.completion.install import add_to_rc_file, get_default_completion_path

__all__ = [
    "detect_shell",
    "ShellDetectionError",
    "get_default_completion_path",
    "add_to_rc_file",
]
