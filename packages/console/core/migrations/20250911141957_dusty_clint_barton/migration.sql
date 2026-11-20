-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `key` ADD CONSTRAINT `name` UNIQUE(`workspace_id`,`name`);