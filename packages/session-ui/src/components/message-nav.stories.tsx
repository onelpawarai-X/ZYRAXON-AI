// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

// @ts-nocheck
import * as mod from "./message-nav"
import { create } from "@zyraxon-ai/ui/storybook/scaffold"

const story = create({ title: "UI/MessageNav", mod })
export default { title: "UI/MessageNav", id: "components-message-nav", component: story.meta.component }
export const Basic = story.Basic
