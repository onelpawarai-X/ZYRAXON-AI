-- Copyright (c) 2026 onelpawarai. All rights reserved.

ALTER TABLE `billing` ADD CONSTRAINT `global_subscription_id` UNIQUE(`subscription_id`);