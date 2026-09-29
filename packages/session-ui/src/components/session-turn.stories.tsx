// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

// @ts-nocheck
import * as mod from "./session-turn"
import { create } from "@zyraxon-ai/ui/storybook/scaffold"

const story = create({ title: "UI/SessionTurn", mod })
export default { title: "UI/SessionTurn", id: "components-session-turn", component: story.meta.component }
export const Basic = story.Basic
