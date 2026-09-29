-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `billing` ADD `monthly_limit` int;--> statement-breakpoint
ALTER TABLE `billing` ADD `monthly_usage` bigint;--> statement-breakpoint
ALTER TABLE `billing` ADD `time_monthly_usage_updated` timestamp(3);