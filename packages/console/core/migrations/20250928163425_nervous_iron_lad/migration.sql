-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `user` ADD `time_joined` timestamp(3);--> statement-breakpoint
ALTER TABLE `user` ADD `role` enum('admin','member');