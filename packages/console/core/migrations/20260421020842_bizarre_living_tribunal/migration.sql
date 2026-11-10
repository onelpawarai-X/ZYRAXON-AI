-- Copyright (c) 2026 onelpawarai. All rights reserved.

CREATE TABLE `model_tpm_rate_limit` (
	`id` varchar(255) PRIMARY KEY,
	`interval` bigint NOT NULL,
	`count` int NOT NULL
);
