# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

# all the unittests can be converted to exe-files.
import glob
from distutils.core import setup

import py2exe

setup(name="test_*", console=glob.glob("test_*.py"))
