-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

CREATE TABLE `model_tpm_limit` (
	`id` varchar(255) NOT NULL,
	`interval` int NOT NULL,
	`count` int NOT NULL,
	CONSTRAINT PRIMARY KEY(`id`,`interval`)
);
