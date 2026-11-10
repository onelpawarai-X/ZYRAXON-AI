<# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
   Copyright (c) 2026 onelpawarai. All rights reserved. #>

$osInfo = Get-WmiObject -Class Win32_OperatingSystem
# check if running on Windows Server
if ($osInfo.ProductType -eq 3) {
  Install-WindowsFeature Server-Media-Foundation
}
