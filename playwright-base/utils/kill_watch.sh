#!/bin/sh
# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

ps ax | grep playwright | grep "vite\|tsc\|esbuild" | sed 's|pts/.*||' | xargs kill
