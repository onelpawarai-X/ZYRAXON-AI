-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `user` RENAME COLUMN `sub_recent_usage` TO `sub_interval_usage`;--> statement-breakpoint
ALTER TABLE `user` RENAME COLUMN `sub_time_recent_usage_updated` TO `sub_time_interval_usage_updated`;