-- SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-- Copyright (c) 2026 onelpawarai. All rights reserved.

CREATE TABLE `coupon` (
	`email` varchar(255),
	`type` enum('BUILDATHON','GOFREEMONTH') NOT NULL,
	`time_redeemed` timestamp(3),
	CONSTRAINT PRIMARY KEY(`email`,`type`)
);
