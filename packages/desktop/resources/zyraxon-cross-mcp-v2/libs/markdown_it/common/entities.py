# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""HTML5 entities map: { name -> characters }."""

import html.entities

entities = {name.rstrip(";"): chars for name, chars in html.entities.html5.items()}
