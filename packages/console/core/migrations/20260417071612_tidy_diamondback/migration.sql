-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

CREATE TABLE `model_rate_limit` (
	`key` varchar(255) NOT NULL,
	`interval` varchar(40) NOT NULL,
	`count` int NOT NULL,
	CONSTRAINT PRIMARY KEY(`key`,`interval`)
);
