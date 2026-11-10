-- Copyright (c) 2026 onelpawarai. All rights reserved.

DROP INDEX `workspace_referral_code` ON `workspace`;--> statement-breakpoint
CREATE UNIQUE INDEX `referral_code` ON `workspace` (`referral_code`);