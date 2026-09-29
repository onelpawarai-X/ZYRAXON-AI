# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

# Test module for win32timezone

import doctest
import unittest

import win32timezone


class Win32TimeZoneTest(unittest.TestCase):
    def testWin32TZ(self):
        failed, total = doctest.testmod(win32timezone, verbose=False)
        self.assertFalse(failed)


if __name__ == "__main__":
    unittest.main()
