# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

import argparse

from certifi import contents, where

parser = argparse.ArgumentParser()
parser.add_argument("-c", "--contents", action="store_true")
args = parser.parse_args()

if args.contents:
    print(contents())
else:
    print(where())
