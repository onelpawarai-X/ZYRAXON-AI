#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

set -e
set +x

trap "cd $(pwd -P)" EXIT
cd "$(dirname $0)"
source "../utils.sh"

if is_win; then
  /c/Windows/System32/cmd.exe "/c buildwin.bat"
else
  echo "ERROR: cannot upload on this platform!" 1>&2
  exit 1;
fi
