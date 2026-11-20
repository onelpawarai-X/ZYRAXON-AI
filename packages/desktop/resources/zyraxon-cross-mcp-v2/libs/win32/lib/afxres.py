# Copyright (c) 2026 onelpawarai. All rights reserved.

import warnings

from pywin.mfc.afxres import *

warnings.warn(
    "Importing the global `afxres` module is deprecated. Import from `pywin.mfc.afxres` instead.",
    category=DeprecationWarning,
    stacklevel=2,
)
