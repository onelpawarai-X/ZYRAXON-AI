#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

set -e
set -x

cd /tmp
curl -L --retry 3 -o ./msedge_stable.pkg "$1"
# Note: there's no way to uninstall previously installed MSEdge.
# However, running PKG again seems to update installation.
sudo installer -pkg /tmp/msedge_stable.pkg -target /
rm -rf /tmp/msedge_stable.pkg
/Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge --version
