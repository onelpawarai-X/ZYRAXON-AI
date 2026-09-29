-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `billing` ADD CONSTRAINT `global_customer_id` UNIQUE(`customer_id`);