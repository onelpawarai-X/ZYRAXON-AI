-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `billing` RENAME COLUMN `last_error` TO `reload_error`;--> statement-breakpoint
ALTER TABLE `billing` RENAME COLUMN `time_last_error` TO `time_reload_error`;