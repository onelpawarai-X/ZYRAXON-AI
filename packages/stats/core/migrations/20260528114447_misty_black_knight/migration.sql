-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `geo_stat` ADD `period_key` varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE `model_stat` ADD `period_key` varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE `provider_stat` ADD `period_key` varchar(32) NOT NULL;