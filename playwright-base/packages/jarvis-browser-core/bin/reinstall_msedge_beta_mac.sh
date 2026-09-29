#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

set -e
set -x

cd /tmp
curl -L --retry 3 -o ./msedge_beta.pkg "$1"
# Note: there's no way to uninstall previously installed MSEdge.
# However, running PKG again seems to update installation.
sudo installer -pkg /tmp/msedge_beta.pkg -target /
rm -rf /tmp/msedge_beta.pkg
/Applications/Microsoft\ Edge\ Beta.app/Contents/MacOS/Microsoft\ Edge\ Beta --version
