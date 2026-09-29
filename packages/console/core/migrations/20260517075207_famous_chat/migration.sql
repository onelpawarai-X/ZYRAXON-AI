-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `coupon` MODIFY COLUMN `type` enum('BUILDATHON','GO1MONTH50','GOFREEMONTH','GO3MONTHS100','GO6MONTHS100','GO12MONTHS100') NOT NULL;