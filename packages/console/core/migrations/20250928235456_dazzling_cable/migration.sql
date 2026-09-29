-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `user` MODIFY COLUMN `role` enum('admin','member') NOT NULL;